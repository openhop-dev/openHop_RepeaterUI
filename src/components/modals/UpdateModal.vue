<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import ApiService from '@/utils/api';
import { getToken } from '@/utils/auth';
import Spinner from '@/components/ui/Spinner.vue';

interface Props {
  show: boolean;
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  rateLimitUntil?: string | null;
}

interface Emits {
  (e: 'close'): void;
  (e: 'installed'): void;
  // Emitted after a channel switch so TopBar can refresh its updateInfo
  (
    e: 'version-updated',
    payload: { currentVersion: string; latestVersion: string; hasUpdate: boolean },
  ): void;
}

const props = withDefaults(defineProps<Props>(), {
  currentVersion: '',
  latestVersion: '',
  hasUpdate: false,
  rateLimitUntil: null,
});

const emit = defineEmits<Emits>();

// ---------------------------------------------------------------------------
// Local version state – starts from props, updated after channel check
// ---------------------------------------------------------------------------
const localCurrentVersion = ref(props.currentVersion);
const localLatestVersion = ref(props.latestVersion);
const localHasUpdate = ref(props.hasUpdate);

// Keep in sync if TopBar refreshes while modal is open
watch(
  () => props.currentVersion,
  (v) => {
    localCurrentVersion.value = v;
  },
);
watch(
  () => props.latestVersion,
  (v) => {
    localLatestVersion.value = v;
  },
);
watch(
  () => props.hasUpdate,
  (v) => {
    localHasUpdate.value = v;
  },
);

// State
const channels = ref<string[]>(['main']);
const selectedChannel = ref<string>('main');
const channelStatus = ref<string>('');
const channelError = ref<string>('');
const loadingChannels = ref(false);
const checkingVersion = ref(false); // true while polling after channel switch

interface ChangelogEntry {
  sha: string;
  short_sha: string;
  title: string;
  body: string;
  author: string;
  date: string;
  url: string;
}
const changelog = ref<ChangelogEntry[]>([]);
const changelogLoading = ref(false);
const changelogOpen = ref(true);

const installState = ref<
  'idle' | 'installing' | 'restarting' | 'verified' | 'verify-failed' | 'complete' | 'error'
>('idle');
const installError = ref<string | null>(null);
const logLines = ref<string[]>([]);
const logContainer = ref<HTMLElement | null>(null);
const logVisible = ref(false);
const postRestartVersion = ref<string | null>(null);
// Sub-phase during 'restarting' to drive granular UI feedback
const restartPhase = ref<'going-down' | 'coming-up' | 'verifying' | null>(null);

let eventSource: EventSource | null = null;
// Set when SSE lines indicate pip succeeded and a restart is imminent.
// Allows onerror to distinguish "restart killed connection" from real errors.
const pipDone = ref(false);
// Timer that fires if we don't get a 'done' event after seeing the restart log
// line. On some systems (e.g. RPi) the TCP half-open state means onerror never
// fires before the service is already back up.
let restartFallbackTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const canInstall = computed(
  () =>
    installState.value === 'idle' ||
    installState.value === 'error' ||
    installState.value === 'verify-failed',
);

const installButtonLabel = computed(() => {
  switch (installState.value) {
    case 'installing':
      return 'Installing…';
    case 'restarting':
      return 'Restarting…';
    case 'verified':
      return 'Installed ✓';
    case 'verify-failed':
      return 'Retry Install';
    case 'complete':
      return 'Installed ✓';
    case 'error':
      return 'Retry Install';
    default:
      return localHasUpdate.value ? 'Install Update' : 'Force Reinstall';
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scrollLogsToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
}

function appendLine(line: string) {
  logLines.value.push(line);
  // keep last 500 lines
  if (logLines.value.length > 500) logLines.value.splice(0, logLines.value.length - 500);
  // defer scroll so DOM has updated
  setTimeout(scrollLogsToBottom, 20);
}

function stopEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

async function fetchChangelog() {
  changelogLoading.value = true;
  changelog.value = [];
  try {
    const res = (await ApiService.get('/update/changelog')) as any;
    if (res.success && Array.isArray(res.commits)) {
      changelog.value = res.commits;
    }
  } catch {
    // non-fatal – changelog is optional
  } finally {
    changelogLoading.value = false;
  }
}

async function fetchChannels() {
  loadingChannels.value = true;
  channelError.value = '';
  try {
    const res = (await ApiService.get('/update/channels')) as any;
    if (res.success && Array.isArray(res.channels)) {
      channels.value = res.channels;
      selectedChannel.value = res.current_channel ?? 'main';
    }
  } catch {
    channels.value = ['main'];
    channelError.value = 'Could not load channels from GitHub';
  } finally {
    loadingChannels.value = false;
  }
}

async function applyChannel() {
  if (!selectedChannel.value) return;
  channelStatus.value = '';
  channelError.value = '';
  try {
    const res = (await ApiService.post('/update/set_channel', {
      channel: selectedChannel.value,
    })) as any;
    if (!res.success) {
      channelError.value = res.error ?? 'Failed to set channel';
      return;
    }
    channelStatus.value = `Switched to '${selectedChannel.value}' — checking version…`;

    // Reset install state so user can install on the new channel
    installState.value = 'idle';
    installError.value = null;
    logLines.value = [];

    // Trigger a fresh version check for the new channel
    checkingVersion.value = true;
    localLatestVersion.value = '';
    localHasUpdate.value = false;
    try {
      await ApiService.post('/update/check');
      // Poll until check completes (max 12 s)
      for (let i = 0; i < 24; i++) {
        const status = (await ApiService.get('/update/status')) as any;
        if (status.success && status.state !== 'checking') {
          localCurrentVersion.value = status.current_version ?? localCurrentVersion.value;
          localLatestVersion.value = status.latest_version ?? '';
          localHasUpdate.value = !!status.has_update;
          channelStatus.value = `Switched to '${selectedChannel.value}'`;
          emit('version-updated', {
            currentVersion: localCurrentVersion.value,
            latestVersion: localLatestVersion.value,
            hasUpdate: localHasUpdate.value,
          });
          fetchChangelog();
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      channelStatus.value = `Switched to '${selectedChannel.value}' (version check failed)`;
    } finally {
      checkingVersion.value = false;
    }
  } catch (err: any) {
    channelError.value = err?.message ?? 'Failed to set channel';
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

async function startInstall() {
  if (!canInstall.value) return;

  installState.value = 'installing';
  installError.value = null;
  logLines.value = [];

  // 1. Kick off the install
  try {
    const res = await ApiService.post('/update/install', { force: !localHasUpdate.value });
    if (!res.success) {
      installState.value = 'error';
      installError.value = res.error ?? 'Failed to start install';
      return;
    }
  } catch (err: any) {
    installState.value = 'error';
    installError.value = err?.message ?? 'Network error';
    return;
  }

  // 2. Open SSE progress stream
  stopEventSource();
  // EventSource can't send headers – pass JWT as ?token= query param (supported by auth middleware)
  const jwt = getToken();
  const sseUrl = jwt
    ? `/api/update/progress?token=${encodeURIComponent(jwt)}`
    : '/api/update/progress';
  eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'line': {
          const line: string = data.line ?? '';
          appendLine(line);
          // Detect when pip is done and a restart is about to happen.
          // The backend logs this line right before calling restart_service().
          if (line.includes('Restarting service')) {
            pipDone.value = true;
            // Safety net: on some hosts the TCP connection stays half-open after
            // the process is killed, so neither onerror nor 'done' ever arrives.
            // After 8 s (3 s backend sleep + 5 s margin) force the transition.
            if (!restartFallbackTimer) {
              restartFallbackTimer = setTimeout(() => {
                restartFallbackTimer = null;
                if (installState.value === 'installing' || installState.value === 'complete') {
                  stopEventSource();
                  installState.value = 'restarting';
                  appendLine('[pyMC updater] Service is restarting — waiting for it to come back…');
                  waitForRestart();
                }
              }, 8000);
            }
          }
          break;
        }
        case 'status':
          if (data.state === 'error') {
            installState.value = 'error';
          } else if (data.state === 'complete') {
            pipDone.value = true;
            installState.value = 'complete';
          }
          break;
        case 'done':
          stopEventSource();
          if (restartFallbackTimer) {
            clearTimeout(restartFallbackTimer);
            restartFallbackTimer = null;
          }
          if (data.state === 'complete') {
            installState.value = 'restarting';
            waitForRestart();
          } else {
            installState.value = 'error';
            if (data.error) installError.value = data.error;
          }
          break;
        // keepalive / connected: do nothing
      }
    } catch {
      // ignore parse errors
    }
  };

  eventSource.onerror = () => {
    stopEventSource();
    if (restartFallbackTimer) {
      clearTimeout(restartFallbackTimer);
      restartFallbackTimer = null;
    }
    // If pip finished and the connection dropped, the service restart
    // killed our SSE connection before the 'done' event could be flushed.
    // Transition to the restart-wait flow instead of showing an error.
    if (pipDone.value && installState.value !== 'error') {
      installState.value = 'restarting';
      appendLine('[pyMC updater] Connection lost — waiting for service restart…');
      waitForRestart();
      return;
    }
    if (installState.value === 'installing') {
      installState.value = 'error';
      installError.value = 'Progress stream disconnected';
    }
  };
}

// ---------------------------------------------------------------------------
// Post-restart version verification
// ---------------------------------------------------------------------------

async function waitForRestart() {
  const targetVersion = localLatestVersion.value;

  // --- Phase 1: wait for the service to go DOWN (max 20 s) ---
  restartPhase.value = 'going-down';
  const downDeadline = Date.now() + 20_000;
  let wentDown = false;
  while (Date.now() < downDeadline) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await ApiService.get('/update/status');
      // Still responding – keep waiting
    } catch {
      wentDown = true;
      break;
    }
  }

  if (!wentDown) {
    appendLine('[pyMC updater] Service did not appear to stop — assuming fast restart');
  }

  // --- Phase 2: wait for the service to come back UP (max 60 s) ---
  restartPhase.value = 'coming-up';
  const upDeadline = Date.now() + 60_000;
  while (Date.now() < upDeadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = (await ApiService.get('/update/status')) as any;
      if (!status?.success) continue;

      // Service responded — show verifying indicator briefly before resolving
      restartPhase.value = 'verifying';
      await new Promise((r) => setTimeout(r, 1200));

      const newVersion = status.current_version ?? '';
      postRestartVersion.value = newVersion;

      localCurrentVersion.value = newVersion || localCurrentVersion.value;
      emit('version-updated', {
        currentVersion: localCurrentVersion.value,
        latestVersion: localLatestVersion.value,
        hasUpdate: !!status.has_update,
      });

      if (newVersion && targetVersion && newVersion === targetVersion) {
        installState.value = 'verified';
        localHasUpdate.value = false;
        restartPhase.value = null;
        emit('installed');
      } else {
        installState.value = 'verify-failed';
        restartPhase.value = null;
      }
      return;
    } catch {
      // Service still coming up – keep polling
    }
  }

  // Timed out
  installState.value = 'verify-failed';
  restartPhase.value = null;
  installError.value = 'Service did not respond after restart — check logs';
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      installState.value = 'idle';
      installError.value = null;
      logLines.value = [];
      logVisible.value = false;
      postRestartVersion.value = null;
      restartPhase.value = null;
      pipDone.value = false;
      if (restartFallbackTimer) {
        clearTimeout(restartFallbackTimer);
        restartFallbackTimer = null;
      }
      channelStatus.value = '';
      channelError.value = '';
      // Sync local version state from fresh props
      localCurrentVersion.value = props.currentVersion;
      localLatestVersion.value = props.latestVersion;
      localHasUpdate.value = props.hasUpdate;
      fetchChannels();
      fetchChangelog();
    } else {
      stopEventSource();
    }
  },
);

onUnmounted(() => {
  stopEventSource();
  if (restartFallbackTimer) {
    clearTimeout(restartFallbackTimer);
    restartFallbackTimer = null;
  }
});

function handleBackdropClick(e: MouseEvent) {
  if (
    e.target === e.currentTarget &&
    installState.value !== 'installing' &&
    installState.value !== 'restarting' &&
    installState.value !== 'verified'
  ) {
    emit('close');
  }
}

function reloadPage() {
  window.location.reload();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.show"
      class="modal-backdrop"
      @click="handleBackdropClick"
    >
      <div
        class="bg-white dark:bg-surface-elevated rounded-[20px] w-full max-w-lg border border-stroke-subtle dark:border-white/10 shadow-2xl flex flex-col max-h-[90vh]"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-6 pb-0 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg
                class="w-5 h-5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary">
                OTA Update
              </h3>
              <p class="text-xs text-content-muted dark:text-content-muted">
                Update over the air from GitHub
              </p>
            </div>
          </div>
          <button
            v-if="installState !== 'installing' && installState !== 'restarting' && installState !== 'verified'"
            @click="emit('close')"
            class="text-content-secondary hover:text-content-primary transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5 overflow-y-auto flex-1">
          <!-- Version info -->
          <div class="grid grid-cols-2 gap-3">
            <div
              class="bg-background-mute dark:bg-background-mute rounded-xl p-3 border border-stroke-subtle dark:border-stroke/10"
            >
              <p class="text-xs text-content-muted mb-1">Installed</p>
              <p
                class="text-sm font-mono font-medium text-content-primary dark:text-content-primary"
              >
                {{ localCurrentVersion || '—' }}
              </p>
            </div>
            <div
              class="bg-background-mute dark:bg-background-mute rounded-xl p-3 border border-stroke-subtle dark:border-stroke/10"
              :class="
                localHasUpdate
                  ? 'border-l-2 border-l-accent-red'
                  : 'border-l-2 border-l-accent-green'
              "
            >
              <p class="text-xs text-content-muted mb-1">On GitHub</p>
              <div v-if="checkingVersion" class="flex items-center gap-1.5 mt-1">
                <Spinner size="xs" class="inline-block" />
                <span class="text-xs text-content-muted">Checking…</span>
              </div>
              <p
                v-else
                class="text-sm font-mono font-medium"
                :class="localHasUpdate ? 'text-accent-red' : 'text-accent-green'"
              >
                {{ localLatestVersion || '—' }}
              </p>
            </div>
          </div>

          <!-- GitHub rate limit warning -->
          <div
            v-if="props.rateLimitUntil"
            class="flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3"
          >
            <svg
              class="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <div class="text-xs text-amber-800 dark:text-amber-300">
              <p class="font-semibold mb-0.5">GitHub API rate limit reached</p>
              <p>
                Version checks are paused until
                <span class="font-mono font-semibold">{{
                  new Date(props.rateLimitUntil).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}</span
                >. This is a GitHub limit, not a software issue. You can still install or switch
                channels manually.
              </p>
            </div>
          </div>

          <!-- Up to date notice -->
          <div
            v-if="!localHasUpdate && localCurrentVersion && !checkingVersion"
            class="flex items-center gap-2 bg-green-50 dark:bg-surface border border-green-200 dark:border-accent-green/30 border-l-2 border-l-green-600 dark:border-l-accent-green rounded-xl p-3 text-sm text-green-800 dark:text-content-primary"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            You are up to date. Use <em class="mx-1">Force Reinstall</em> to reinstall anyway.
          </div>

          <!-- What's New / Changelog -->
          <div v-if="changelog.length > 0 || changelogLoading" class="space-y-1">
            <button
              @click="changelogOpen = !changelogOpen"
              class="flex items-center justify-between w-full text-xs font-medium text-content-secondary dark:text-content-secondary uppercase tracking-wide py-1 hover:text-content-primary transition-colors"
            >
              <span>What's New</span>
              <span class="flex items-center gap-1">
                <Spinner v-if="changelogLoading" size="xs" class="inline-block" />
                <span v-else class="text-content-muted"
                  >{{ changelog.length }} commit{{ changelog.length !== 1 ? 's' : '' }}</span
                >
                <svg
                  class="w-3.5 h-3.5 text-content-muted transition-transform"
                  :class="changelogOpen ? 'rotate-180' : ''"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd"
                  />
                </svg>
              </span>
            </button>
            <div
              v-if="changelogOpen"
              class="bg-background-mute dark:bg-black/30 rounded-xl border border-stroke-subtle dark:border-stroke/10 overflow-hidden"
            >
              <div
                class="max-h-52 overflow-y-auto divide-y divide-stroke-subtle dark:divide-stroke/10"
              >
                <a
                  v-for="entry in changelog"
                  :key="entry.sha"
                  :href="entry.url"
                  target="_blank"
                  class="flex gap-3 px-3 py-2.5 hover:bg-background-soft dark:hover:bg-surface/50 transition-colors group"
                >
                  <span class="font-mono text-[10px] text-content-muted shrink-0 mt-0.5 pt-px">{{
                    entry.short_sha
                  }}</span>
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-xs text-content-primary truncate group-hover:text-primary transition-colors"
                    >
                      {{ entry.title }}
                    </p>
                    <p class="text-[10px] text-content-muted mt-0.5">
                      {{ entry.author }} ·
                      {{ entry.date ? new Date(entry.date).toLocaleDateString() : '' }}
                    </p>
                  </div>
                  <svg
                    class="w-3 h-3 text-content-muted shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <!-- Channel selector -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-content-secondary dark:text-content-secondary uppercase tracking-wide"
            >
              Release Channel
            </label>
            <div class="flex gap-2">
              <select
                v-model="selectedChannel"
                :disabled="loadingChannels || installState === 'installing' || installState === 'verified' || checkingVersion"
                class="flex-1 bg-background-mute dark:bg-surface border border-stroke-subtle dark:border-stroke/20 rounded-xl px-3 py-2 text-sm text-content-primary dark:text-content-primary disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="ch in channels" :key="ch" :value="ch">{{ ch }}</option>
              </select>
              <button
                @click="applyChannel"
                :disabled="loadingChannels || installState === 'installing' || installState === 'verified' || checkingVersion"
                class="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {{ loadingChannels || checkingVersion ? '…' : 'Apply' }}
              </button>
            </div>
            <p v-if="channelStatus" class="text-xs text-accent-green">{{ channelStatus }}</p>
            <p v-if="channelError" class="text-xs text-accent-red">{{ channelError }}</p>
            <p class="text-xs text-content-muted">
              <em>main</em> = stable releases &nbsp;|&nbsp; <em>dev</em> = latest commits (may be
              unstable)
            </p>
          </div>

          <!-- Progress log (shown while installing or on demand) -->
          <div
            v-if="
              installState === 'installing' ||
              installState === 'restarting' ||
              (logLines.length > 0 && (logVisible || installState === 'error'))
            "
            class="space-y-2"
          >
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-content-secondary uppercase tracking-wide"
                >Install Log</label
              >
              <span
                v-if="installState === 'installing'"
                class="flex items-center gap-1 text-xs text-primary"
              >
                <span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Running…
              </span>
              <span
                v-else-if="installState === 'restarting' && restartPhase === 'verifying'"
                class="flex items-center gap-1 text-xs text-primary"
              >
                <span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Checking version…
              </span>
              <span
                v-else-if="installState === 'restarting'"
                class="flex items-center gap-1 text-xs text-yellow-500"
              >
                <span class="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                {{ restartPhase === 'going-down' ? 'Stopping service…' : 'Waiting for service…' }}
              </span>
              <span
                v-else-if="installState === 'verified'"
                class="text-xs text-accent-green font-medium"
                >Complete ✓</span
              >
              <span
                v-else-if="installState === 'verify-failed' || installState === 'error'"
                class="text-xs text-accent-red font-medium"
                >Failed ✗</span
              >
            </div>
            <div
              ref="logContainer"
              class="bg-zinc-900 dark:bg-black/60 rounded-xl p-3 h-52 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed border border-stroke/20"
            >
              <div
                v-for="(line, i) in logLines"
                :key="i"
                class="whitespace-pre-wrap break-all"
                :class="{
                  'text-accent-red':
                    line.includes('✗') ||
                    line.includes('error') ||
                    line.includes('ERROR') ||
                    line.includes('Failed'),
                  'text-yellow-400': line.includes('WARNING') || line.includes('⚠'),
                  'text-accent-green': line.includes('✓') || line.includes('Successfully'),
                  'text-content-muted/60': line.includes('keepalive'),
                }"
              >
                {{ line }}
              </div>
              <div
                v-if="installState === 'installing'"
                class="w-2 h-4 bg-green-400 animate-pulse inline-block ml-1"
              ></div>
              <div
                v-if="installState === 'restarting' && restartPhase === 'verifying'"
                class="flex items-center gap-2 mt-2 text-primary"
              >
                <Spinner size="xs" class="inline-block" />
                Service is back — verifying version…
              </div>
              <div
                v-else-if="installState === 'restarting'"
                class="flex items-center gap-2 mt-2 text-yellow-400"
              >
                <Spinner size="xs" class="inline-block" />
                {{
                  restartPhase === 'going-down'
                    ? 'Waiting for service to stop…'
                    : 'Waiting for service to come back up…'
                }}
              </div>
              <div
                v-if="logLines.length === 0 && installState === 'installing'"
                class="text-content-muted animate-pulse"
              >
                Waiting for output…
              </div>
            </div>
            <p v-if="installError" class="text-xs text-accent-red">{{ installError }}</p>
          </div>

          <!-- Restarting indicator (before log has content) -->
          <div
            v-if="installState === 'restarting' && restartPhase === 'verifying'"
            class="flex items-center gap-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-3 text-sm text-primary"
          >
            <Spinner size="sm" class="shrink-0" />
            <div>
              <p class="font-medium">Checking version…</p>
              <p class="text-xs opacity-70 mt-0.5">
                Confirming the installed version matches the target
              </p>
            </div>
          </div>
          <div v-else-if="installState === 'restarting' && logLines.length === 0">
            <div
              class="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-800 dark:text-yellow-400"
            >
              <Spinner size="sm" class="shrink-0" />
              <div>
                <p class="font-medium">
                  {{ restartPhase === 'going-down' ? 'Stopping service…' : 'Starting service…' }}
                </p>
                <p class="text-xs opacity-70 mt-0.5">
                  {{
                    restartPhase === 'going-down'
                      ? 'Waiting for the old process to exit'
                      : 'Waiting for the service to become healthy'
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Verified: version confirmed correct after restart -->
          <div
            v-if="installState === 'verified'"
            class="bg-green-50 dark:bg-surface-elevated border border-green-200 dark:border-accent-green/40 rounded-xl p-4"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-full bg-accent-green flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p class="font-semibold text-content-primary">
                  Installed successfully!
                </p>
                <p class="text-xs text-content-muted mt-0.5">
                  Running version
                  <span class="font-mono font-semibold">{{ postRestartVersion }}</span>
                </p>
              </div>
            </div>
            <button
              @click="reloadPage"
              class="modal-btn-primary w-full mt-3 text-sm font-semibold"
            >
              Refresh Page to Load New Version
            </button>
          </div>

          <!-- Verify failed: service came back but version doesn't match -->
          <div
            v-if="installState === 'verify-failed'"
            class="bg-red-50 dark:bg-accent-red/10 border border-accent-red/40 rounded-xl p-4 space-y-3"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-full bg-accent-red/15 flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-5 h-5 text-accent-red"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-accent-red">Installation may have failed</p>
                <p class="text-xs text-accent-red/80 mt-0.5">
                  {{ installError || 'Version mismatch after restart' }}
                </p>
              </div>
            </div>
            <div
              v-if="postRestartVersion || localLatestVersion"
              class="grid grid-cols-2 gap-2 text-xs"
            >
              <div class="bg-white/50 dark:bg-black/20 rounded-lg px-3 py-2">
                <p class="text-content-muted mb-0.5">Expected</p>
                <p class="font-mono font-semibold text-content-primary">
                  {{ localLatestVersion || '—' }}
                </p>
              </div>
              <div class="bg-white/50 dark:bg-black/20 rounded-lg px-3 py-2">
                <p class="text-content-muted mb-0.5">Reported</p>
                <p class="font-mono font-semibold text-accent-red">
                  {{ postRestartVersion || 'unknown' }}
                </p>
              </div>
            </div>
            <button
              v-if="logLines.length > 0"
              @click="logVisible = !logVisible"
              class="w-full text-xs text-accent-red/70 hover:text-accent-red underline underline-offset-2 hover:no-underline transition-all"
            >
              {{ logVisible ? 'Hide install log' : 'View install log' }}
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 pt-0 flex items-center gap-3 shrink-0">
          <button
            @click="startInstall"
            :disabled="!canInstall"
            class="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              installState === 'verified' || installState === 'complete'
                ? 'bg-accent-green/20 text-accent-green border border-accent-green/50 cursor-default'
                : installState === 'error' || installState === 'verify-failed'
                  ? 'bg-accent-red/20 hover:bg-accent-red/30 text-accent-red border border-accent-red/50'
                  : installState === 'restarting'
                    ? 'bg-yellow-500/20 text-yellow-600 cursor-default'
                    : 'bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50'
            "
          >
            <span
              v-if="installState === 'installing'"
              class="flex items-center justify-center gap-2"
            >
              <Spinner size="sm" color="white" />
              Installing…
            </span>
            <span
              v-else-if="installState === 'restarting'"
              class="flex items-center justify-center gap-2"
            >
              <Spinner size="sm" />
              Restarting service…
            </span>
            <span v-else>{{ installButtonLabel }}</span>
          </button>
          <button
            v-if="installState !== 'installing' && installState !== 'restarting' && installState !== 'verified'"
            @click="emit('close')"
            class="px-6 py-3 rounded-xl border border-stroke-subtle dark:border-stroke/20 text-content-secondary hover:text-content-primary hover:bg-background-mute transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
