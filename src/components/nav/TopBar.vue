<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAnchoredDropdown } from '@/composables/useAnchoredDropdown';
import ApiService from '@/utils/api';
import { useSystemStore } from '@/stores/system';
import { useNeighborStore } from '@/stores/neighbors';
import { CONTACT_TYPE_MAP } from '@/stores/neighbors';
import { getUsername } from '@/utils/auth';
import { useRouter } from 'vue-router';
import ThemeToggle from '@/components/ThemeToggle.vue';
import UpdateModal from '@/components/modals/UpdateModal.vue';
import RestartModal from '@/components/modals/RestartModal.vue';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'TopBar' });

interface Emits {
  (e: 'toggleMobileSidebar'): void;
}

const emit = defineEmits<Emits>();

const router = useRouter();
const systemStore = useSystemStore();
const neighborStore = useNeighborStore();
const appRuntime = useAppRuntimeStore();

const notif = useAnchoredDropdown();
const userMenu = useAnchoredDropdown();
const showUpdateModal = ref(false);
const showRestartModal = ref(false);
const showChangePasswordModal = ref(false);

// Update checking state
const updateInfo = ref<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  isChecking: boolean;
  lastChecked: Date | null;
  error: string | null;
  rateLimitUntil: string | null;
}>({
  hasUpdate: false,
  currentVersion: '',
  latestVersion: '',
  isChecking: false,
  lastChecked: null,
  error: null,
  rateLimitUntil: null,
});

const username = ref<string>(getUsername() || 'User');

// Track specific contact types (keys from CONTACT_TYPE_MAP)
const targetContactTypes = ['Chat Node', 'Repeater', 'Room Server'] as const;
const _nameToKey: Record<string, string> = Object.fromEntries(
  Object.entries(CONTACT_TYPE_MAP).map(([k, v]) => [v, k]),
);

// Derived from neighborStore — keyed by contact type name for template compatibility
const trackedNodes = computed<Record<string, { id: number; node_name: string | null; last_seen: number }[]>>(() => {
  const result: Record<string, { id: number; node_name: string | null; last_seen: number }[]> = {};
  for (const type of targetContactTypes) {
    const key = _nameToKey[type];
    result[type] = neighborStore.advertsByType[key] || [];
  }
  return result;
});
const loading = computed(() => neighborStore.isLoading);
const lastUpdateTime = computed(() =>
  neighborStore.lastFetched ? new Date(neighborStore.lastFetched) : null,
);


// Check for updates via the backend API (server-side GitHub check)
const checkForUpdates = async (force = false) => {
  if (updateInfo.value.isChecking) return;

  try {
    updateInfo.value.isChecking = true;
    updateInfo.value.error = null;

    // Trigger a fresh check on the server (non-blocking)
    await ApiService.post('/update/check', force ? { force: true } : {});

    // Poll status until the check completes (max ~10 s)
    for (let i = 0; i < 20; i++) {
      const status = (await ApiService.get('/update/status')) as any;
      if (status.success && status.state !== 'checking') {
        updateInfo.value.currentVersion = status.current_version ?? '';
        updateInfo.value.latestVersion = status.latest_version ?? '';
        updateInfo.value.hasUpdate = !!status.has_update;
        updateInfo.value.lastChecked = new Date();
        updateInfo.value.error = status.error ?? null;
        updateInfo.value.rateLimitUntil = status.rate_limit_until ?? null;
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    updateInfo.value.error = 'Version check timed out';
  } catch (err) {
    console.error('Error checking for updates:', err);
    updateInfo.value.error = err instanceof Error ? err.message : 'Failed to check for updates';
  } finally {
    updateInfo.value.isChecking = false;
  }
};

// Called by UpdateModal when install completes – update version info in the header.
// Do NOT close the UpdateModal here; the user sees the success card and closes it themselves.
const handleInstalled = () => {
  notif.close();
  // Refresh update status so the bell badge reflects the new version
  checkForUpdates();
  // Immediately refresh /api/stats so the sidebar version reflects the newly installed package
  systemStore.fetchStats();
};

// Called by UpdateModal when the user switches channel and the version re-check finishes
const handleVersionUpdated = (payload: {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}) => {
  updateInfo.value.currentVersion = payload.currentVersion;
  updateInfo.value.latestVersion = payload.latestVersion;
  updateInfo.value.hasUpdate = payload.hasUpdate;
  updateInfo.value.lastChecked = new Date();
};

const handleLogout = () => {
  void appRuntime.stopSession('logout');
};


const reloadPage = () => {
  window.location.reload();
};

// Computed totals
const totalTrackedNodes = computed(() => {
  const total = Object.values(trackedNodes.value).reduce((total, nodes) => total + nodes.length, 0);
  return total;
});

const trackedBreakdown = computed(() => {
  const breakdown = targetContactTypes
    .map((type) => ({
      type,
      count: trackedNodes.value[type]?.length || 0,
    }))
    .filter((item) => item.count > 0);

  return breakdown;
});

// Notification badge logic - always show so users know the bell is interactive
const showNotificationBadge = computed(() => true);

const radioWarning = computed(() => {
  const status = String(systemStore.stats?.radio_status ?? '').toLowerCase();
  if (status !== 'degraded') return null;

  const configuredType = systemStore.stats?.config?.radio_type ?? 'configured radio';
  const details = systemStore.stats?.radio_error || 'Radio initialization failed';

  return {
    title: `Radio degraded (${configuredType})`,
    details,
  };
});

// Utility functions
const getContactTypeColor = (contactType: string) => {
  const colors = {
    'Chat Node': 'text-blue-600 dark:text-blue-400',
    Repeater: 'text-accent-green',
    'Room Server': 'text-accent-purple',
  };
  return colors[contactType as keyof typeof colors] || 'text-gray-400';
};

const getLatestNodeName = (contactType: string) => {
  const nodes = trackedNodes.value[contactType] || [];
  if (nodes.length === 0) return 'None';

  // Find the most recently seen node
  const latestNode = nodes.reduce((latest, node) => {
    return node.last_seen > latest.last_seen ? node : latest;
  }, nodes[0]);

  return latestNode.node_name || 'Unknown Node';
};

onMounted(() => {
  checkForUpdates();
});

useManagedPolling(() => checkForUpdates(), {
  intervalMs: 600000,
  enabled: true,
  immediate: false,
});

const toggleMobileSidebar = () => {
  emit('toggleMobileSidebar');
};
</script>

<template>
  <div class="glass-card p-3 sm:p-6 mb-5 rounded-[20px] relative z-10">
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-3">
        <button
          @click="toggleMobileSidebar"
          class="lg:hidden topbar-icon-btn"
        >
          <svg
            class="w-5 h-5 text-content-secondary dark:text-content-primary"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 6h14M3 10h14M3 14h14"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <div class="hidden sm:block">
          <h1
            class="text-content-primary dark:text-content-primary text-2xl lg:text-[35px] font-bold mb-1 sm:mb-2"
          >
            Hi {{ username }}👋
          </h1>
          <!-- <p class="text-white text-xl font-semibold">Repeater Dashboard</p> -->
        </div>
      </div>
      <div class="flex items-center gap-3 sm:gap-4 relative">
        <div class="text-right min-w-[120px] sm:min-w-[180px]">
          <div v-if="loading" class="flex items-center gap-2 justify-end">
            <Spinner size="xs" />
            <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Loading...
            </p>
          </div>
          <div v-else-if="totalTrackedNodes > 0" class="space-y-1">
            <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Tracking:
              <span class="text-primary font-medium"
                >{{ totalTrackedNodes }} node{{ totalTrackedNodes === 1 ? '' : 's' }}</span
              >
            </p>
            <div
              v-if="trackedBreakdown.length > 0"
              class="text-xs text-content-muted dark:text-content-muted/80"
              style="min-height: 16px"
            >
              <span v-for="(item, index) in trackedBreakdown" :key="item.type" class="inline">
                {{ item.count }} {{ item.type }}{{ item.count === 1 ? '' : 's'
                }}<span v-if="index < trackedBreakdown.length - 1">, </span>
              </span>
            </div>
            <!-- <div v-if="lastUpdateTime" class="text-xs text-content-muted dark:text-content-muted/60 hidden sm:block" style="min-height: 16px;">
              Updated {{ lastUpdateTime.toLocaleTimeString() }}
            </div> -->
          </div>
          <div v-else>
            <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Tracking: <span class="text-content-muted">0 nodes</span>
            </p>
            <div
              v-if="lastUpdateTime"
              class="text-xs text-content-muted dark:text-content-muted/60 hidden sm:block"
              style="min-height: 16px"
            >
              Last checked {{ lastUpdateTime.toLocaleTimeString() }}
            </div>
          </div>
        </div>
        <a
          href="https://github.com/rightup/pyMC_Repeater/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          class="topbar-icon-btn hidden sm:flex"
          title="Report a bug"
        >
          <svg
            class="w-5 h-5 text-content-secondary dark:text-content-primary"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- Bug body (oval) -->
            <ellipse cx="10" cy="11" rx="4" ry="6" />

            <!-- Bug head (circle) -->
            <circle cx="10" cy="5.5" r="2.5" />

            <!-- Left antennae -->
            <path d="M8.5 4L7 2.5" />
            <path d="M8 3L6 1.5" />

            <!-- Right antennae -->
            <path d="M11.5 4L13 2.5" />
            <path d="M12 3L14 1.5" />

            <!-- Left legs -->
            <path d="M6.5 8L4 7" />
            <path d="M6 10.5L3.5 10" />
            <path d="M6.5 13L4 14" />

            <!-- Right legs -->
            <path d="M13.5 8L16 7" />
            <path d="M14 10.5L16.5 10" />
            <path d="M13.5 13L16 14" />

            <!-- Body segments -->
            <path d="M6.5 9L13.5 9" />
            <path d="M6.5 11.5L13.5 11.5" />
            <path d="M6.5 14L13.5 14" />
          </svg>
        </a>
        <a
          href="/doc"
          target="_blank"
          rel="noopener noreferrer"
          class="topbar-icon-btn hidden sm:flex"
          title="API Documentation"
        >
          <svg
            class="w-5 h-5 text-content-secondary dark:text-content-primary"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- Angle brackets representing API/code -->
            <path d="M7 5L3 10L7 15" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M13 5L17 10L13 15" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M11 3L9 17" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>
        <div :ref="notif.wrapperRef">
        <button
          :ref="notif.triggerRef"
          @click="notif.toggle()"
          class="topbar-icon-btn relative"
        >
          <svg
            class="w-5 h-5 text-content-secondary dark:text-content-primary"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.5 14.1667V15C12.5 16.3807 11.3807 17.5 9.99998 17.5C8.61927 17.5 7.49998 16.3807 7.49998 15V14.1667M12.5 14.1667L7.49998 14.1667M12.5 14.1667H15.8333C16.2936 14.1667 16.6666 13.7936 16.6666 13.3333V12.845C16.6666 12.624 16.5788 12.4122 16.4225 12.2559L15.9969 11.8302C15.8921 11.7255 15.8333 11.5833 15.8333 11.4351V8.33333C15.8333 8.1863 15.828 8.04045 15.817 7.89674M7.49998 14.1667L4.16665 14.1668C3.70641 14.1668 3.33331 13.7934 3.33331 13.3332V12.8451C3.33331 12.6241 3.42118 12.4124 3.57745 12.2561L4.00307 11.8299C4.10781 11.7251 4.16665 11.5835 4.16665 11.4353V8.33331C4.16665 5.11167 6.77831 2.5 9.99998 2.5C10.593 2.5 11.1653 2.58848 11.7045 2.75297M15.817 7.89674C16.8223 7.32275 17.5 6.24051 17.5 5C17.5 3.15905 16.0076 1.66666 14.1666 1.66666C13.1914 1.66666 12.3141 2.08544 11.7045 2.75297M15.817 7.89674C15.3304 8.17457 14.7671 8.33333 14.1666 8.33333C12.3257 8.33333 10.8333 6.84095 10.8333 5C10.8333 4.13425 11.1634 3.34558 11.7045 2.75297M15.817 7.89674C15.817 7.89674 15.817 7.89675 15.817 7.89674ZM11.7045 2.75297C11.7049 2.75309 11.7053 2.75321 11.7057 2.75333"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span
            v-if="showNotificationBadge"
            class="absolute top-2 right-2 w-2 h-2 rounded-full"
            :class="
              updateInfo.hasUpdate
                ? 'bg-accent-red animate-pulse'
                : updateInfo.isChecking
                  ? 'bg-secondary animate-pulse'
                  : updateInfo.currentVersion
                    ? 'bg-accent-green'
                    : 'bg-content-muted/50'
            "
          ></span>
        </button>
        <Teleport to="body">
        <div
          v-if="notif.isOpen.value"
          :ref="notif.panelRef"
          :style="notif.panelStyle.value"
          class="fixed z-[250] w-80 bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-[15px] p-4 shadow-2xl backdrop-blur-sm overflow-y-auto max-h-[calc(100vh-4rem)]"
        >
          <div class="flex items-center justify-between mb-3">
            <p class="text-content-primary dark:text-content-primary font-semibold">
              System Status
            </p>
            <div class="flex items-center gap-2">
              <button
                @click="() => checkForUpdates()"
                :disabled="updateInfo.isChecking"
                class="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                title="Check for updates"
              >
                {{ updateInfo.isChecking ? 'Checking...' : 'Check Updates' }}
              </button>
              <span class="text-content-muted text-xs">•</span>
              <button
                @click="() => neighborStore.fetchAll()"
                :disabled="loading"
                class="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
              >
                {{ loading ? 'Updating...' : 'Refresh' }}
              </button>
            </div>
          </div>

          <div class="space-y-3 text-sm">
            <!-- Update Information -->
            <div
              v-if="updateInfo.hasUpdate"
              class="bg-red-50 dark:bg-background-mute p-3 rounded-lg border border-accent-red/30 border-l-2 border-l-accent-red"
            >
              <div class="flex items-center justify-between">
                <span class="text-content-primary dark:text-content-primary font-medium"
                  >Update Available</span
                >
                <span class="text-accent-red font-bold">{{ updateInfo.latestVersion }}</span>
              </div>
              <div class="text-xs text-content-muted dark:text-content-muted mt-1">
                Current: {{ updateInfo.currentVersion }}
              </div>
              <div class="mt-2 flex items-center gap-2">
                <button
                  @click="
                    showUpdateModal = true;
                    notif.close();
                  "
                  class="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-accent-red/20 hover:bg-accent-red/30 border border-accent-red/50 text-accent-red"
                >
                  Install Update
                </button>
                <a
                  href="https://github.com/rightup/pyMC_Repeater"
                  target="_blank"
                  class="text-xs text-content-muted hover:text-content-secondary underline"
                >
                  View on GitHub
                </a>
                <button
                  @click="checkForUpdates(true)"
                  :disabled="updateInfo.isChecking"
                  class="text-xs text-content-muted hover:text-content-secondary disabled:opacity-50 transition-colors ml-auto"
                >
                  {{ updateInfo.isChecking ? 'Checking…' : 'Re-check' }}
                </button>
              </div>
            </div>

            <!-- Rate limit warning in dropdown -->
            <div
              v-if="updateInfo.rateLimitUntil && !updateInfo.isChecking"
              class="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 border-l-2 border-l-amber-500 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300"
            >
              <svg
                class="w-3.5 h-3.5 shrink-0 mt-0.5"
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
              <span
                >GitHub API rate limit reached. Version check paused until
                {{
                  new Date(updateInfo.rateLimitUntil).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}.</span
              >
            </div>

            <!-- Version Information (when no update) -->
            <div
              v-else-if="updateInfo.currentVersion && !updateInfo.isChecking"
              class="bg-green-50 dark:bg-background-mute p-3 rounded-lg border border-stroke-subtle dark:border-stroke/10 border-l-2 border-l-accent-green"
            >
              <div class="flex items-center justify-between">
                <span class="text-content-primary dark:text-content-primary font-medium"
                  >Up to Date</span
                >
                <span class="text-accent-green font-bold">{{ updateInfo.currentVersion }}</span>
              </div>
              <div
                v-if="updateInfo.lastChecked"
                class="text-xs text-content-muted dark:text-content-muted mt-1"
              >
                Last checked: {{ updateInfo.lastChecked.toLocaleTimeString() }}
              </div>
              <div class="mt-2 flex items-center gap-2">
                <button
                  @click="
                    showUpdateModal = true;
                    notif.close();
                  "
                  class="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Manage / Switch Branch
                </button>
                <button
                  @click="checkForUpdates(true)"
                  :disabled="updateInfo.isChecking"
                  class="text-xs text-content-muted hover:text-content-secondary disabled:opacity-50 transition-colors"
                >
                  {{ updateInfo.isChecking ? 'Checking…' : 'Check Now' }}
                </button>
              </div>
            </div>

            <!-- Update Check Loading -->
            <div
              v-else-if="updateInfo.isChecking"
              class="bg-background-mute dark:bg-background-mute p-3 rounded-lg border border-stroke-subtle dark:border-stroke/10"
            >
              <div class="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                <span class="text-content-secondary dark:text-content-secondary"
                  >Checking for updates...</span
                >
              </div>
            </div>

            <!-- Update Check Error -->
            <div
              v-else-if="updateInfo.error"
              class="bg-red-50 dark:bg-background-mute p-3 rounded-lg border border-accent-red/30 border-l-2 border-l-accent-red"
            >
              <div class="text-content-primary dark:text-content-primary font-medium mb-1">
                Update Check Failed
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted">
                {{ updateInfo.error }}
              </div>
            </div>

            <!-- Separator -->
            <div class="border-t border-stroke-subtle dark:border-stroke/10"></div>

            <!-- Mesh Network Status Header -->
            <div class="text-content-primary dark:text-content-primary font-medium text-sm mb-2">
              Mesh Network Status
            </div>

            <!-- Tracking Summary -->
            <div
              class="bg-background-mute dark:bg-background-mute p-3 rounded-lg border border-stroke-subtle dark:border-stroke/10 border-l-2 border-l-primary"
            >
              <div class="flex items-center justify-between">
                <span class="text-content-primary dark:text-content-primary font-medium"
                  >Total Tracked Nodes</span
                >
                <span class="text-primary font-bold">{{ totalTrackedNodes }}</span>
              </div>
              <div
                v-if="lastUpdateTime"
                class="text-xs text-content-muted dark:text-content-muted mt-1"
              >
                Last updated: {{ lastUpdateTime.toLocaleString() }}
              </div>
            </div>

            <!-- Breakdown by type -->
            <div
              v-for="item in trackedBreakdown"
              :key="item.type"
              class="bg-background-mute dark:bg-background-mute p-3 rounded-lg border border-stroke-subtle dark:border-stroke/10"
            >
              <div class="flex items-center justify-between">
                <span class="text-content-primary dark:text-content-primary font-medium"
                  >{{ item.type }}{{ item.count === 1 ? '' : 's' }}</span
                >
                <span :class="getContactTypeColor(item.type)" class="font-bold">{{
                  item.count
                }}</span>
              </div>
              <div v-if="trackedNodes[item.type]?.length > 0" class="mt-2">
                <div class="text-xs text-content-muted dark:text-content-muted">
                  Latest:
                  <span class="text-content-secondary dark:text-content-secondary">{{
                    getLatestNodeName(item.type)
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div
              v-if="totalTrackedNodes === 0 && !loading"
              class="bg-background-mute dark:bg-background-mute p-4 rounded-lg border border-stroke-subtle dark:border-stroke/10 text-center"
            >
              <div class="text-content-secondary dark:text-content-muted">
                <svg
                  class="w-8 h-8 mx-auto mb-2 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.034 0-3.9.785-5.291 2.09M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>No mesh nodes detected</span>
              </div>
            </div>

            <!-- Error or loading states -->
            <div
              v-if="loading"
              class="bg-background-mute dark:bg-background-mute p-3 rounded-lg border border-stroke-subtle dark:border-stroke/10 text-center"
            >
              <div class="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                <span class="text-content-secondary dark:text-content-secondary"
                  >Scanning mesh network...</span
                >
              </div>
            </div>
          </div>
        </div>
        </Teleport>
        </div>

        <!-- Theme Toggle -->
        <ThemeToggle />

        <div :ref="userMenu.wrapperRef">
          <button
            :ref="userMenu.triggerRef"
            @click="userMenu.toggle()"
            class="topbar-icon-btn"
            title="User menu"
          >
            <svg
              class="w-5 h-5 text-content-secondary dark:text-content-primary"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M13 3H15C16.1046 3 17 3.89543 17 5V15C17 16.1046 16.1046 17 15 17H13M8 7L4 10.5M4 10.5L8 14M4 10.5H13"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <Teleport to="body">
          <div
            v-if="userMenu.isOpen.value"
            :ref="userMenu.panelRef"
            :style="userMenu.panelStyle.value"
            class="fixed z-[250] w-48 bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-xl shadow-2xl p-1"
          >
            <button
              @click="showChangePasswordModal = true; userMenu.close()"
              class="user-menu-item w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-content-primary dark:text-content-primary rounded-lg transition-colors"
            >
              <svg
                class="w-4 h-4 text-content-secondary"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Change Password</span>
            </button>
            <div class="border-t border-stroke-subtle dark:border-stroke/40 my-1 mx-2"></div>
            <button
              @click="showRestartModal = true; userMenu.close()"
              class="user-menu-item w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-content-primary dark:text-content-primary rounded-lg transition-colors"
            >
              <svg
                class="w-4 h-4 text-content-secondary"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.5 2.5V7H8" stroke-linecap="round" stroke-linejoin="round" />
                <path
                  d="M4.5 12.5A6.5 6.5 0 1 0 5 6L3.5 7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Restart Service</span>
            </button>
            <button
              @click="handleLogout"
              class="user-menu-item w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-accent-red rounded-lg transition-colors"
            >
              <svg
                class="w-4 h-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M13 3H15C16.1046 3 17 3.89543 17 5V15C17 16.1046 16.1046 17 15 17H13M8 7L4 10.5M4 10.5L8 14M4 10.5H13"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Logout</span>
            </button>
          </div>
          </Teleport>
        </div>
      </div>
    </div>

    <div
      v-if="radioWarning"
      class="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-200"
      role="alert"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-300 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zM10 14a1 1 0 100 2 1 1 0 000-2z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <p class="font-semibold">{{ radioWarning.title }}</p>
          <p class="text-sm opacity-90">{{ radioWarning.details }}</p>
        </div>
      </div>
    </div>
  </div>
  <RestartModal
    v-model="showRestartModal"
    title="Restart Service"
    message="The service will restart. You will be automatically returned to the dashboard when it comes back online."
  />
  <ChangePasswordModal
    :is-open="showChangePasswordModal"
    :can-skip="false"
    @close="showChangePasswordModal = false"
    @success="showChangePasswordModal = false"
  />

  <!-- Update Modal -->
  <UpdateModal
    :show="showUpdateModal"
    :current-version="updateInfo.currentVersion"
    :latest-version="updateInfo.latestVersion"
    :has-update="updateInfo.hasUpdate"
    :rate-limit-until="updateInfo.rateLimitUntil"
    @close="showUpdateModal = false"
    @installed="handleInstalled"
    @version-updated="handleVersionUpdated"
  />
</template>

<style scoped>
/* Simple z-index fix for notification dropdown */

.user-menu-item:hover span { text-shadow: var(--nav-hover-label-shadow); }
.user-menu-item:hover svg  { filter: var(--nav-hover-icon-shadow); }
</style>
