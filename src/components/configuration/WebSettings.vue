<template>
  <div class="space-y-6">
    <!-- CORS Settings -->
    <div class="glass-card rounded-lg border border-stroke-subtle dark:border-stroke/10 p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            CORS Settings
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Control cross-origin resource sharing for API access
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <!-- CORS Enabled Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <label class="text-sm font-medium text-content-primary dark:text-content-primary"
              >Enable CORS</label
            >
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
                ? 'bg-cyan-600 dark:bg-teal-500 border-cyan-600 dark:border-teal-500'
                : 'bg-gray-400 dark:bg-gray-600 border-gray-400 dark:border-gray-600',
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
    <div class="glass-card rounded-lg border border-stroke-subtle dark:border-stroke/10 p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Web Frontend
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Choose which web interface to use
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <!-- Frontend Selection -->
        <div class="space-y-3">
          <!-- Default Frontend Option -->
          <label
            :class="[
              'flex items-start space-x-3 p-4 bg-background-mute dark:bg-background/30 rounded-lg border-2 cursor-pointer transition-all',
              localConfig.use_default_frontend
                ? 'border-accent-cyan bg-accent-cyan/10'
                : 'border-stroke-subtle dark:border-stroke/10 hover:border-accent-cyan/50',
            ]"
          >
            <input
              type="radio"
              name="frontend"
              :checked="localConfig.use_default_frontend"
              @change="selectDefaultFrontend"
              :disabled="saving"
              class="mt-1 h-4 w-4 text-accent-cyan focus:ring-accent-cyan focus:ring-offset-background"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-content-primary dark:text-content-primary">
                Default Frontend
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted mt-1">
                Built-in pyMC Repeater web interface
              </div>
              <div class="text-xs text-content-muted dark:text-content-muted/60 mt-1 font-mono">
                Built-in
              </div>
            </div>
          </label>

          <!-- PyMC Console Option -->
          <label
            :class="[
              'flex items-start space-x-3 p-4 bg-background-mute dark:bg-background/30 rounded-lg border-2 transition-all',
              !pymcConsoleExists ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              !localConfig.use_default_frontend
                ? 'border-accent-cyan bg-accent-cyan/10'
                : 'border-stroke-subtle dark:border-stroke/10 hover:border-accent-cyan/50',
            ]"
          >
            <input
              type="radio"
              name="frontend"
              :checked="!localConfig.use_default_frontend"
              @change="selectPymcConsole"
              :disabled="saving || !pymcConsoleExists"
              class="mt-1 h-4 w-4 text-accent-cyan focus:ring-accent-cyan focus:ring-offset-background"
            />
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium text-content-primary dark:text-content-primary">
                  PyMC Console
                </div>
                <span
                  class="text-xs bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30 font-medium"
                  >@Treehouse⚡</span
                >
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted mt-1">
                Alternative web interface for pyMC Repeater
              </div>
              <div class="text-xs text-content-muted dark:text-content-muted/60 mt-1 font-mono">
                /opt/pymc_console/web/html
              </div>
            </div>
          </label>
        </div>

        <!-- PyMC Console Status/Installation Info -->
        <div
          v-if="!checkingConsole"
          class="p-4 rounded-lg border"
          :class="
            pymcConsoleExists
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-accent-cyan/5 border-accent-cyan/20'
          "
        >
          <div class="flex items-start gap-3">
            <svg
              v-if="pymcConsoleExists"
              class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <svg
              v-else
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
              <h4 class="text-sm font-medium text-content-primary dark:text-content-primary">
                {{
                  pymcConsoleExists
                    ? 'PyMC Console has been detected'
                    : 'PyMC Console Not Installed'
                }}
              </h4>
              <p v-if="pymcConsoleExists" class="text-xs text-green-600 dark:text-green-400 mt-1">
                PyMC Console is installed at
                <code class="text-green-700 dark:text-green-300">/opt/pymc_console/web/html</code>
              </p>
              <template v-else>
                <p class="text-xs text-content-secondary dark:text-content-muted mt-1 mb-3">
                  PyMC Console must be installed at
                  <code class="text-accent-cyan">/opt/pymc_console/web/html</code> before selecting
                  this option.
                </p>
                <a
                  href="https://github.com/dmduran12/pymc_console-dist"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 px-4 py-2 bg-accent-cyan/20 hover:bg-accent-cyan/30 border border-accent-cyan/50 text-accent-cyan rounded-lg text-sm font-medium transition-colors"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                    />
                  </svg>
                  PyMC Console Install Instructions
                </a>
              </template>
            </div>
          </div>
        </div>

        <!-- Restart Notice -->
        <div v-if="needsRestart" class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start space-x-3 flex-1">
              <svg
                class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div class="flex-1">
                <h4 class="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Service restart required
                </h4>
                <p class="text-xs text-amber-700 dark:text-amber-400/80 mt-1">
                  Web frontend changes will take effect after restarting the pymc-repeater service.
                </p>
              </div>
            </div>
            <button
              @click="restartService"
              :disabled="restarting"
              class="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              <svg v-if="restarting" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {{ restarting ? 'Restarting...' : 'Restart Now' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Status -->
    <div v-if="saveMessage" class="p-4 rounded-lg border" :class="saveMessageClass">
      <div class="flex items-center space-x-2">
        <svg
          v-if="saveSuccess"
          class="w-5 h-5 text-green-600 dark:text-green-400"
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
          class="w-5 h-5 text-red-600 dark:text-red-400"
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
        <span
          :class="
            saveSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          "
          >{{ saveMessage }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import ApiService from '@/utils/api';

defineOptions({ name: 'WebSettings' });

interface WebConfig {
  cors_enabled: boolean;
  use_default_frontend: boolean;
}

const saving = ref(false);
const saveMessage = ref('');
const saveSuccess = ref(false);
const needsRestart = ref(false);
const restarting = ref(false);
const pymcConsoleExists = ref(false);
const checkingConsole = ref(true);

const localConfig = reactive<WebConfig>({
  cors_enabled: false,
  use_default_frontend: true,
});

const saveMessageClass = computed(() => {
  return saveSuccess.value
    ? 'bg-green-500/10 border-green-600/40 dark:border-green-500/30'
    : 'bg-red-500/10 border-red-500/30';
});

async function checkPymcConsole() {
  try {
    checkingConsole.value = true;
    const response = await ApiService.get('/check_pymc_console');
    if (response.success && response.data) {
      pymcConsoleExists.value = (response.data as { exists: boolean }).exists;
      console.log('PyMC Console exists:', pymcConsoleExists.value);
    }
  } catch (error) {
    console.error('Failed to check PyMC Console:', error);
    pymcConsoleExists.value = false;
  } finally {
    checkingConsole.value = false;
  }
}

async function loadSettings() {
  try {
    const response = await ApiService.get('/stats');
    console.log('WebSettings: Full response:', response);

    // Handle both wrapped and direct response formats
    let statsData = null;
    if (response.success && response.data) {
      statsData = response.data;
    } else if (response && 'version' in response) {
      // Direct stats response without wrapper
      statsData = response;
    }

    if (statsData) {
      const webConfig = (statsData as any).config?.web || {};
      console.log('WebSettings: webConfig:', webConfig);

      // Explicitly check for boolean value
      localConfig.cors_enabled = webConfig.cors_enabled === true;
      console.log('WebSettings: Set cors_enabled to:', localConfig.cors_enabled);

      // If web_path is null/empty/undefined, it's using default frontend
      const webPath = webConfig.web_path;
      localConfig.use_default_frontend = !webPath || webPath === '';
      console.log(
        'WebSettings: Set use_default_frontend to:',
        localConfig.use_default_frontend,
        'from web_path:',
        webPath,
      );
    }
  } catch (error) {
    console.error('Failed to load web settings:', error);
    showMessage('Failed to load settings', false);
  }
}

async function saveSettings() {
  saving.value = true;
  saveMessage.value = '';

  try {
    const updates: any = {
      web: {
        cors_enabled: localConfig.cors_enabled,
      },
    };

    // Set web_path based on selection
    if (localConfig.use_default_frontend) {
      // null means use default built-in frontend
      updates.web.web_path = null;
    } else {
      // Use pymc_console path
      updates.web.web_path = '/opt/pymc_console/web/html';
    }

    const response = await ApiService.post('/update_web_config', updates);

    if (response.success) {
      showMessage('Settings saved successfully', true);
      needsRestart.value = true;
    } else {
      showMessage(response.error || 'Failed to save settings', false);
    }
  } catch (error: any) {
    console.error('Failed to save web settings:', error);
    showMessage(error.message || 'Failed to save settings', false);
  } finally {
    saving.value = false;
  }
}

async function toggleCors() {
  localConfig.cors_enabled = !localConfig.cors_enabled;
  await saveSettings();
}

async function selectDefaultFrontend() {
  localConfig.use_default_frontend = true;
  await saveSettings();
}

async function selectPymcConsole() {
  // Guard: Prevent switching to PyMC Console if it's not installed
  if (!pymcConsoleExists.value) {
    showMessage('PyMC Console is not installed. Please install it before switching.', false);
    return;
  }
  localConfig.use_default_frontend = false;
  await saveSettings();
}

function showMessage(message: string, success: boolean) {
  saveMessage.value = message;
  saveSuccess.value = success;
  setTimeout(() => {
    saveMessage.value = '';
  }, 5000);
}
async function restartService() {
  restarting.value = true;
  saveMessage.value = '';

  try {
    const response = await ApiService.post('/restart_service', {});

    if (response.success) {
      showMessage('Service restart initiated. Page will reload...', true);
      needsRestart.value = false;

      // Wait a moment then reload the page
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      showMessage(response.error || 'Failed to restart service', false);
    }
  } catch (error: any) {
    // Network errors during restart are expected as the service goes down
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network error')) {
      showMessage('Service restarting... Page will reload', true);
      needsRestart.value = false;

      // Wait for service to come back and reload
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } else {
      console.error('Failed to restart service:', error);
      showMessage(error.message || 'Failed to restart service', false);
    }
  } finally {
    restarting.value = false;
  }
}

onMounted(() => {
  loadSettings();
  checkPymcConsole();
});
</script>
