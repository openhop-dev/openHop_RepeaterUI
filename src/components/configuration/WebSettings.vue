<template>
  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
          Web Options
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Configure site identification, CORS policy and web frontend selection
        </p>
      </div>
    </div>

    <!-- Frontend Switch Popup -->
    <div
      v-if="showSwitchingPopup"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        class="glass-card w-full max-w-md rounded-[15px] p-6 space-y-3 border border-accent-cyan/opacity-medium"
      >
        <h4 class="text-base font-semibold text-content-primary">Changing web interface</h4>
        <p class="text-sm text-content-secondary dark:text-content-muted">
          The web interface is switching now and this page will refresh automatically.
        </p>
      </div>
    </div>

    <!-- Site Identification -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary mb-1">Site Identification</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Customise the browser tab title and login page caption
          </p>
        </div>
      </div>
      <div class="space-y-4">
        <div>
          <label for="site-name" class="block text-sm font-medium text-content-primary mb-2">
            Site Name
          </label>
          <input
            id="site-name"
            v-model="localConfig.site_name"
            type="text"
            maxlength="80"
            placeholder="e.g. Base Station Alpha"
            class="w-full px-3 py-2 rounded-lg bg-background-mute dark:bg-background/40 border border-stroke-subtle dark:border-stroke/opacity-medium text-sm text-content-primary placeholder-content-muted dark:placeholder-content-muted focus:outline-none focus:border-primary/opacity-heavy transition-colors"
            @change="() => saveSettings()"
            :disabled="saving"
          />
          <p class="text-xs text-content-secondary dark:text-content-muted mt-1.5">
            Shown in the browser tab and above the login form. Leave blank to use the default title.
          </p>
        </div>
      </div>
    </div>

    <!-- CORS Settings -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary mb-1">CORS Settings</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Control cross-origin resource sharing for API access
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <!-- CORS Enabled Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <label class="text-sm font-medium text-content-primary">Enable CORS</label>
            <p class="text-xs text-content-secondary dark:text-content-muted mt-1">
              Allow web frontends from different origins to access the API
            </p>
          </div>
          <button
            @click="toggleCors"
            :disabled="saving"
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-2',
              localConfig.cors_enabled
                ? 'bg-accent-cyan border-accent-cyan'
                : 'bg-background-mute border-background-mute',
              saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ]"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg',
                localConfig.cors_enabled ? 'translate-x-5' : 'translate-x-0.5',
              ]"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Web Frontend Selection -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary mb-1">Web Frontend</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Choose which web interface to use as the primary UI at
            <code class="text-xs">/</code>. Application UI plugins can also be opened under
            <code class="text-xs">/plugins/&lt;id&gt;/</code>.
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div v-if="checkingFrontends" class="text-sm text-content-muted">
          Loading available frontends…
        </div>

        <div v-else class="space-y-3">
          <label
            v-for="frontend in frontends"
            :key="frontend.id"
            :class="[
              'flex items-start space-x-3 p-4 bg-background-mute dark:bg-background/30 rounded-lg border-2 transition-all',
              !frontend.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              selectedFrontendId === frontend.id
                ? 'border-accent-cyan bg-accent-cyan/opacity-light'
                : 'border-stroke-subtle dark:border-stroke/opacity-light hover:border-accent-cyan/opacity-heavy dark:hover:border-accent-cyan/opacity-heavy',
            ]"
          >
            <input
              type="radio"
              name="frontend"
              :checked="selectedFrontendId === frontend.id"
              :disabled="saving || !frontend.available"
              class="mt-1 h-4 w-4 text-accent-cyan focus:ring-accent-cyan focus:ring-offset-background"
              @change="selectFrontend(frontend)"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium text-content-primary">
                  {{ frontend.name }}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    v-if="frontend.version"
                    class="text-xs font-mono bg-background/50 text-content-secondary dark:text-content-muted px-2 py-0.5 rounded-full border border-stroke-subtle"
                  >
                    v{{ frontend.version }}
                  </span>
                  <span
                    v-if="frontend.kind === 'console'"
                    class="text-xs bg-accent-amber/opacity-light text-accent-amber px-2 py-0.5 rounded-full border border-accent-amber/opacity-medium font-medium"
                    >@Treehouse⚡</span
                  >
                  <span
                    v-else-if="frontend.kind === 'plugin'"
                    class="text-xs bg-primary/opacity-light text-primary px-2 py-0.5 rounded-full border border-primary/opacity-medium font-medium"
                    >Plugin</span
                  >
                </div>
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted mt-1">
                {{ frontend.description }}
              </div>
              <div class="text-xs text-content-muted/opacity-heavy mt-1 font-mono break-all">
                {{ frontend.pathLabel }}
              </div>
              <div
                v-if="frontend.kind === 'plugin' && !frontend.enabled"
                class="text-xs text-accent-amber mt-1"
              >
                Enable this plugin under System → Plugins before selecting it as the primary UI.
              </div>
              <div
                v-else-if="frontend.kind === 'console' && !frontend.available"
                class="text-xs text-accent-cyan mt-1"
              >
                Install openHop Console to
                <code>/opt/pymc_console/web/html</code>
                before selecting this option.
              </div>
            </div>
          </label>
        </div>

        <!-- openHop Console install help when missing -->
        <div
          v-if="!checkingFrontends && consoleMissing"
          class="p-4 rounded-lg border bg-accent-cyan/opacity-light border-accent-cyan/opacity-medium"
        >
          <div class="flex items-start gap-3">
            <svg
              class="w-5 h-5 text-accent-cyan flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div class="flex-1">
              <h4 class="text-sm font-medium text-content-primary">
                openHop Console Not Installed
              </h4>
              <p class="text-xs text-content-secondary dark:text-content-muted mt-1 mb-3">
                openHop Console must be installed at
                <code class="text-accent-cyan">/opt/pymc_console/web/html</code>
                before selecting it as the primary frontend. UI plugins appear above once installed
                and enabled.
              </p>
              <a
                href="https://github.com/dmduran12/pymc_console-dist"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 px-4 py-2 bg-accent-cyan/opacity-medium hover:bg-accent-cyan/opacity-medium border border-accent-cyan/opacity-heavy text-accent-cyan rounded-lg text-sm font-medium transition-colors"
              >
                openHop Console Install Instructions
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Status -->
    <div v-if="saveMessage" class="p-4 rounded-lg border" :class="saveMessageClass">
      <div class="flex items-center space-x-2">
        <svg
          v-if="saveSuccess"
          class="w-5 h-5 text-accent-green"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <svg
          v-else
          class="w-5 h-5 text-accent-red"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <span :class="saveSuccess ? 'text-accent-green' : 'text-accent-red'">{{
          saveMessage
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import ApiService from '@/utils/api';
import { useSystemStore } from '@/stores/system';

defineOptions({ name: 'WebSettings' });

interface WebConfig {
  cors_enabled: boolean;
  site_name: string;
}

interface WebFrontend {
  id: string;
  kind: 'builtin' | 'console' | 'plugin' | 'custom' | string;
  name: string;
  description?: string;
  path?: string | null;
  version?: string | null;
  available?: boolean;
  enabled?: boolean;
  selected?: boolean;
  plugin_id?: string;
  pathLabel: string;
}

const { stats } = storeToRefs(useSystemStore());

const saving = ref(false);
const saveMessage = ref('');
const saveSuccess = ref(false);
const showSwitchingPopup = ref(false);
const checkingFrontends = ref(true);
const frontends = ref<WebFrontend[]>([]);
const selectedFrontendId = ref('builtin');

const localConfig = reactive<WebConfig>({
  cors_enabled: false,
  site_name: '',
});

const saveMessageClass = computed(() => {
  return saveSuccess.value
    ? 'bg-accent-green/opacity-light border-accent-green/opacity-medium'
    : 'bg-accent-red/opacity-light border-accent-red/opacity-medium';
});

const consoleMissing = computed(() => {
  const console = frontends.value.find((f) => f.kind === 'console');
  return !console || !console.available;
});

function pathLabelFor(item: { kind?: string; path?: string | null; plugin_id?: string }): string {
  if (item.kind === 'builtin' || !item.path) return 'Built-in';
  if (item.kind === 'plugin' && item.plugin_id) {
    return `${item.path}  ·  /plugins/${item.plugin_id}/`;
  }
  return item.path;
}

async function loadFrontends() {
  checkingFrontends.value = true;
  try {
    const response = await ApiService.get('/web_frontends');
    const data = (response.data || response) as {
      frontends?: Array<Record<string, unknown>>;
      selected_id?: string;
    };
    // ApiService.get may return { success, data } or flattened shapes
    const payload =
      response && typeof response === 'object' && 'data' in (response as object)
        ? ((response as { data?: Record<string, unknown> }).data as
            | {
                frontends?: Array<Record<string, unknown>>;
                selected_id?: string;
              }
            | undefined)
        : (response as {
            frontends?: Array<Record<string, unknown>>;
            selected_id?: string;
          });

    const list = Array.isArray(payload?.frontends)
      ? payload!.frontends!
      : Array.isArray(data.frontends)
        ? data.frontends
        : [];

    frontends.value = list.map((raw) => {
      const kind = String(raw.kind || 'custom');
      const path = (raw.path as string | null | undefined) ?? null;
      const plugin_id = raw.plugin_id ? String(raw.plugin_id) : undefined;
      return {
        id: String(raw.id || kind),
        kind,
        name: String(raw.name || raw.id || 'Frontend'),
        description: raw.description ? String(raw.description) : '',
        path,
        version: raw.version ? String(raw.version) : null,
        available: raw.available !== false,
        enabled: raw.enabled !== false,
        selected: !!raw.selected,
        plugin_id,
        pathLabel: pathLabelFor({ kind, path, plugin_id }),
      };
    });

    const selected =
      (typeof payload?.selected_id === 'string' && payload.selected_id) ||
      frontends.value.find((f) => f.selected)?.id ||
      'builtin';
    selectedFrontendId.value = selected;
  } catch (error) {
    console.error('Failed to load web frontends:', error);
    // Fallback: keep builtin only
    frontends.value = [
      {
        id: 'builtin',
        kind: 'builtin',
        name: 'Default Frontend',
        description: 'Built-in Repeater web interface',
        path: null,
        version: typeof stats.value?.version === 'string' ? stats.value.version : null,
        available: true,
        enabled: true,
        pathLabel: 'Built-in',
      },
    ];
    selectedFrontendId.value = 'builtin';
  } finally {
    checkingFrontends.value = false;
  }
}

function loadSettings() {
  const webConfig = stats.value?.config?.web || {};
  localConfig.cors_enabled = webConfig.cors_enabled === true;
  localConfig.site_name = typeof stats.value?.site_name === 'string' ? stats.value.site_name : '';
}

async function saveSettings(options?: { frontendId?: string }) {
  saving.value = true;
  saveMessage.value = '';

  try {
    const frontendId = options?.frontendId ?? selectedFrontendId.value;
    const frontend = frontends.value.find((f) => f.id === frontendId);

    const updates: {
      web: {
        cors_enabled: boolean;
        site_name: string;
        web_path?: string | null;
      };
    } = {
      web: {
        cors_enabled: localConfig.cors_enabled,
        site_name: localConfig.site_name.trim(),
      },
    };

    if (!frontend || frontend.kind === 'builtin' || frontend.id === 'builtin') {
      updates.web.web_path = null;
    } else if (frontend.path) {
      updates.web.web_path = frontend.path;
    } else {
      showMessage('Selected frontend has no install path', false);
      return;
    }

    const response = await ApiService.post('/update_web_config', updates);

    if (response.success) {
      selectedFrontendId.value = frontendId;
      const payload = (response.data || {}) as {
        restart_required?: boolean;
        frontend_switched?: boolean;
        live_applied?: boolean;
      };
      showMessage(response.message || 'Settings saved successfully', true);
      if (payload.frontend_switched || payload.live_applied) {
        // Only full-page switch popup when the primary frontend path changed
        if (payload.frontend_switched) {
          showSwitchingPopup.value = true;
          showMessage('Changing interface and refreshing page…', true);
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      }
      await loadFrontends();
    } else {
      showMessage(response.error || 'Failed to save settings', false);
    }
  } catch (error: unknown) {
    console.error('Failed to save web settings:', error);
    showMessage(error instanceof Error ? error.message : 'Failed to save settings', false);
  } finally {
    saving.value = false;
  }
}

async function toggleCors() {
  localConfig.cors_enabled = !localConfig.cors_enabled;
  await saveSettings();
}

async function selectFrontend(frontend: WebFrontend) {
  if (!frontend.available) {
    if (frontend.kind === 'plugin' && !frontend.enabled) {
      showMessage('Enable this plugin under System → Plugins first.', false);
    } else if (frontend.kind === 'console') {
      showMessage('openHop Console is not installed. Please install it before switching.', false);
    } else {
      showMessage('This frontend is not available.', false);
    }
    return;
  }
  selectedFrontendId.value = frontend.id;
  await saveSettings({ frontendId: frontend.id });
}

function showMessage(message: string, success: boolean) {
  saveMessage.value = message;
  saveSuccess.value = success;
  setTimeout(() => {
    saveMessage.value = '';
  }, 5000);
}

onMounted(() => {
  loadSettings();
  void loadFrontends();
});
</script>
