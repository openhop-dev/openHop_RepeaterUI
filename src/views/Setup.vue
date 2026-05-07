<script setup lang="ts">
import { onMounted, computed, ref, onBeforeUnmount } from 'vue';
import { useSetupStore } from '@/stores/setup';
import ThemeToggle from '@/components/ThemeToggle.vue';

const setupStore = useSetupStore();

defineOptions({ name: 'SetupView' });

const showDialog = ref(false);
const dialogTitle = ref('');
const dialogMessage = ref('');
const dialogType = ref<'error'>('error');
const showRestarting = ref(false);
let redirectTimer: ReturnType<typeof setTimeout> | null = null;

// Map preset titles to flag emojis
const getFlagEmoji = (title: string): string => {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('australia')) return '🇦🇺';
  if (lowerTitle.includes('eu') || lowerTitle.includes('uk')) return '🇪🇺';
  if (lowerTitle.includes('czech')) return '🇨🇿';
  if (lowerTitle.includes('new zealand')) return '🇳🇿';
  if (lowerTitle.includes('portugal')) return '🇵🇹';
  if (lowerTitle.includes('switzerland')) return '🇨🇭';
  if (lowerTitle.includes('usa') || lowerTitle.includes('canada')) return '🇺🇸';
  if (lowerTitle.includes('vietnam')) return '🇻🇳';
  return '🌍'; // Default world emoji
};

onMounted(async () => {
  // Load hardware options and radio presets
  await Promise.all([setupStore.fetchHardwareOptions(), setupStore.fetchRadioPresets()]);
});

const progressPercentage = computed(() => {
  return (setupStore.currentStep / setupStore.totalSteps) * 100;
});

async function handleNext() {
  if (setupStore.isLastStep) {
    // Complete setup
    const result = await setupStore.completeSetup();
    if (result.success) {
      // Show restarting overlay and poll until backend is back
      showRestarting.value = true;
      redirectToLogin();
    } else {
      // Show error dialog
      dialogType.value = 'error';
      dialogTitle.value = 'Setup Failed';
      dialogMessage.value = result.error || 'An unknown error occurred';
      showDialog.value = true;
    }
  } else {
    setupStore.nextStep();
  }
}

function handleBack() {
  setupStore.previousStep();
}

function closeDialog() {
  showDialog.value = false;
}

/** Poll the backend until it responds, then reload so the login page shows. */
function redirectToLogin() {
  let attempts = 0;
  const maxAttempts = 90; // ~90 seconds

  function tryRedirect() {
    attempts++;
    fetch('/api/needs_setup', { method: 'GET' })
      .then((res) => {
        if (res.ok) {
          redirectTimer = null;
          window.location.reload();
        } else {
          scheduleRetry();
        }
      })
      .catch(() => {
        scheduleRetry();
      });
  }

  function scheduleRetry() {
    if (attempts < maxAttempts) {
      redirectTimer = setTimeout(tryRedirect, 1000);
    } else {
      // Give up — reload anyway and let the login page handle it
      redirectTimer = null;
      window.location.reload();
    }
  }

  // Initial delay to give the service time to begin restarting before we poll
  redirectTimer = setTimeout(tryRedirect, 3000);
}

onBeforeUnmount(() => {
  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
});

const stepTitles = [
  'Welcome',
  'Repeater Name',
  'Hardware Selection',
  'Radio Configuration',
  'Security Setup',
];
</script>

<template>
  <div
    class="min-h-screen bg-background dark:bg-background overflow-hidden relative flex items-center justify-center p-4"
  >
    <!-- Theme Toggle in top right -->
    <div class="absolute top-4 right-4 z-20">
      <ThemeToggle />
    </div>
    <!-- Animated Background Gradients -->
    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-80 animate-pulse-slow -top-[79px] left-[575px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-75 animate-pulse-slower -top-[94px] -left-[92px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-80 animate-pulse-slowest top-[373px] left-[246px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <div class="w-full max-w-4xl relative z-10">
      <!-- Progress Bar -->
      <div class="mb-8">
        <div class="flex justify-between mb-2">
          <span class="text-content-secondary dark:text-content-muted text-sm"
            >Step {{ setupStore.currentStep }} of {{ setupStore.totalSteps }}</span
          >
          <span class="text-content-secondary dark:text-content-muted text-sm"
            >{{ Math.round(progressPercentage) }}% Complete</span
          >
        </div>
        <div class="h-2 bg-stroke-subtle dark:bg-stroke/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
            :style="{ width: `${progressPercentage}%` }"
          />
        </div>
      </div>

      <!-- Main Card -->
      <div
        class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[20px] p-6 sm:p-8 md:p-12"
      >
        <!-- Step Indicator -->
        <div class="flex justify-center mb-8">
          <div class="flex gap-2">
            <div
              v-for="step in setupStore.totalSteps"
              :key="step"
              :class="[
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                step === setupStore.currentStep
                  ? 'bg-primary text-white'
                  : step < setupStore.currentStep
                    ? 'bg-primary/30 text-content-secondary dark:text-content-primary/70'
                    : 'bg-background-mute dark:bg-stroke/10 text-content-muted dark:text-content-muted',
              ]"
            >
              {{ step }}
            </div>
          </div>
        </div>

        <!-- Step Content -->
        <div class="mb-8">
          <h2
            class="text-2xl sm:text-3xl font-bold text-content-primary dark:text-content-primary mb-2 text-center"
          >
            {{ stepTitles[setupStore.currentStep - 1] }}
          </h2>

          <!-- Welcome Step -->
          <div v-if="setupStore.currentStep === 1" class="space-y-6 mt-8">
            <div class="text-center space-y-4">
              <div
                class="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-6"
              >
                <svg
                  class="w-10 h-10 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <p class="text-content-secondary dark:text-content-primary/70 text-lg">
                Welcome to your pyMC Repeater! Let's get you set up in just a few steps.
              </p>
              <div class="bg-primary/10 border border-primary/30 rounded-lg p-4 text-left">
                <p class="text-primary text-sm font-medium mb-2">You'll configure:</p>
                <ul class="space-y-2 text-content-secondary dark:text-content-primary/70 text-sm">
                  <li class="flex items-center gap-2">
                    <svg
                      class="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Repeater name and identification
                  </li>
                  <li class="flex items-center gap-2">
                    <svg
                      class="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Hardware board selection
                  </li>
                  <li class="flex items-center gap-2">
                    <svg
                      class="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Radio frequency and settings
                  </li>
                  <li class="flex items-center gap-2">
                    <svg
                      class="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Admin password for secure access
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Node Name Step -->
          <div v-else-if="setupStore.currentStep === 2" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Choose a unique name for your repeater. This will be used for identification on the
              mesh network.
            </p>
            <div class="max-w-md mx-auto">
              <label
                class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                >Repeater Name</label
              >
              <input
                v-model="setupStore.nodeName"
                type="text"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-3 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., pyRpt0001"
                maxlength="32"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-2">
                Use letters, numbers, hyphens, or underscores (3-32 characters)
              </p>
            </div>
          </div>

          <!-- Hardware Selection Step -->
          <div v-else-if="setupStore.currentStep === 3" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Select your hardware board type
            </p>
            <div
              v-if="setupStore.isLoading"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              Loading hardware options...
            </div>
            <div
              v-else-if="setupStore.hardwareOptions.length === 0"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              No hardware options available
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              <button
                v-for="hardware in setupStore.hardwareOptions"
                :key="hardware.key"
                @click="setupStore.selectedHardware = hardware"
                :class="[
                  'p-4 rounded-[12px] border transition-all duration-300 text-left backdrop-blur-sm',
                  setupStore.selectedHardware?.key === hardware.key
                    ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 shadow-lg shadow-primary/20'
                    : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20',
                ]"
              >
                <div class="font-medium text-content-primary dark:text-content-primary mb-1">
                  {{ hardware.name }}
                </div>
                <div class="text-sm text-content-secondary dark:text-content-muted">
                  {{ hardware.description || hardware.key }}
                </div>
              </button>
            </div>
          </div>

          <!-- Radio Preset Step -->
          <div v-else-if="setupStore.currentStep === 4" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Choose a radio configuration preset for your region or create a custom configuration
            </p>
            <div
              v-if="setupStore.isLoading"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              Loading radio presets...
            </div>
            <div
              v-else-if="setupStore.radioPresets.length === 0"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              No radio presets available
            </div>
            <div v-else class="max-w-5xl mx-auto">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <button
                  v-for="preset in setupStore.radioPresets"
                  :key="preset.title"
                  @click="
                    setupStore.selectedRadioPreset = preset;
                    setupStore.useCustomRadio = false;
                  "
                  :class="[
                    'p-4 rounded-[12px] border transition-all duration-300 text-left backdrop-blur-sm relative overflow-hidden',
                    !setupStore.useCustomRadio &&
                    setupStore.selectedRadioPreset?.title === preset.title
                      ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 shadow-lg shadow-primary/20'
                      : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20',
                  ]"
                >
                  <div class="relative z-10">
                    <div
                      class="font-medium text-content-primary dark:text-content-primary mb-1 flex items-start justify-between gap-2"
                    >
                      <span class="flex items-center gap-2">
                        <span class="text-2xl">{{ getFlagEmoji(preset.title) }}</span>
                        <span>{{ preset.title }}</span>
                      </span>
                      <div
                        v-if="
                          !setupStore.useCustomRadio &&
                          setupStore.selectedRadioPreset?.title === preset.title
                        "
                        class="text-primary flex-shrink-0"
                      >
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    <div class="text-xs text-content-secondary dark:text-content-muted mb-3">
                      {{ preset.description }}
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                      <div class="bg-gray-50 dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted dark:text-content-muted">Freq</div>
                        <div class="text-content-primary dark:text-content-primary/80 font-medium">
                          {{ preset.frequency }}
                        </div>
                      </div>
                      <div class="bg-gray-50 dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted dark:text-content-muted">BW</div>
                        <div class="text-content-primary dark:text-content-primary/80 font-medium">
                          {{ preset.bandwidth }}
                        </div>
                      </div>
                      <div class="bg-gray-50 dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted dark:text-content-muted">SF</div>
                        <div class="text-content-primary dark:text-content-primary/80 font-medium">
                          {{ preset.spreading_factor }}
                        </div>
                      </div>
                      <div class="bg-gray-50 dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted dark:text-content-muted">CR</div>
                        <div class="text-content-primary dark:text-content-primary/80 font-medium">
                          {{ preset.coding_rate }}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <!-- Custom Configuration Option -->
              <div class="border-t border-stroke-subtle dark:border-stroke/10 pt-6">
                <button
                  @click="
                    setupStore.useCustomRadio = !setupStore.useCustomRadio;
                    if (setupStore.useCustomRadio) setupStore.selectedRadioPreset = null;
                  "
                  :class="[
                    'w-full p-4 rounded-[12px] border transition-all duration-300 text-left backdrop-blur-sm',
                    setupStore.useCustomRadio
                      ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 shadow-lg shadow-primary/20'
                      : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20',
                  ]"
                >
                  <div class="flex items-center justify-between mb-2">
                    <div
                      class="font-medium text-content-primary dark:text-content-primary flex items-center gap-2"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                        />
                      </svg>
                      Custom Configuration
                    </div>
                    <div v-if="setupStore.useCustomRadio" class="text-primary">
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  <div class="text-xs text-content-secondary dark:text-content-muted">
                    Manually configure frequency, bandwidth, spreading factor, and coding rate
                  </div>
                </button>

                <!-- Custom Radio Input Fields -->
                <Transition name="slide">
                  <div v-if="setupStore.useCustomRadio" class="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label
                        class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                        >Frequency (MHz)</label
                      >
                      <input
                        v-model="setupStore.customRadio.frequency"
                        type="number"
                        step="0.1"
                        class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] px-4 py-2.5 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                        placeholder="915.0"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                        >Bandwidth (kHz)</label
                      >
                      <input
                        v-model="setupStore.customRadio.bandwidth"
                        type="number"
                        class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] px-4 py-2.5 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                        placeholder="125"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                        >Spreading Factor</label
                      >
                      <select
                        v-model="setupStore.customRadio.spreading_factor"
                        class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] px-4 py-2.5 text-content-primary dark:text-content-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                      >
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                      </select>
                    </div>
                    <div>
                      <label
                        class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                        >Coding Rate</label
                      >
                      <select
                        v-model="setupStore.customRadio.coding_rate"
                        class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] px-4 py-2.5 text-content-primary dark:text-content-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                      >
                        <option value="5">4/5</option>
                        <option value="6">4/6</option>
                        <option value="7">4/7</option>
                        <option value="8">4/8</option>
                      </select>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- Security Step -->
          <div v-else-if="setupStore.currentStep === 5" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Set a secure admin password to protect your repeater
            </p>
            <div class="max-w-md mx-auto space-y-4">
              <div>
                <label
                  class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                  >Admin Password</label
                >
                <input
                  v-model="setupStore.adminPassword"
                  type="password"
                  class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-3 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Enter password (min 6 characters)"
                  minlength="6"
                />
              </div>
              <div>
                <label
                  class="block text-content-primary dark:text-content-primary/90 text-sm font-medium mb-2"
                  >Confirm Password</label
                >
                <input
                  v-model="setupStore.confirmPassword"
                  type="password"
                  class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-3 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Confirm password"
                />
              </div>
              <div
                v-if="
                  setupStore.adminPassword &&
                  setupStore.confirmPassword &&
                  setupStore.adminPassword !== setupStore.confirmPassword
                "
                class="text-red-600 dark:text-red-400 text-sm"
              >
                Passwords do not match
              </div>
              <div
                class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200"
              >
                <strong>Important:</strong> Remember this password - you'll need it to access the
                dashboard.
              </div>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div
          v-if="setupStore.error"
          class="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-600 dark:text-red-200"
        >
          {{ setupStore.error }}
        </div>

        <!-- Navigation Buttons -->
        <div class="flex justify-between gap-4">
          <button
            v-if="setupStore.canGoBack"
            @click="handleBack"
            class="px-6 py-3 rounded-[12px] bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20 transition-all duration-300 font-medium"
          >
            Back
          </button>
          <div v-else></div>

          <button
            @click="handleNext"
            :disabled="!setupStore.canGoNext || setupStore.isSubmitting"
            class="px-8 py-3 rounded-[12px] font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              setupStore.canGoNext && !setupStore.isSubmitting
                ? 'bg-primary hover:bg-primary/90 text-white border border-primary hover:border-primary/80'
                : 'bg-background-mute dark:bg-stroke/5 text-content-muted dark:text-content-muted border border-stroke-subtle dark:border-stroke/10'
            "
          >
            <div
              v-if="setupStore.isSubmitting"
              class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
            ></div>
            <span v-if="setupStore.isSubmitting">Setting up...</span>
            <span v-else-if="setupStore.isLastStep">Complete Setup</span>
            <span v-else>Next</span>
            <svg
              v-if="!setupStore.isSubmitting && !setupStore.isLastStep"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Error Dialog -->
    <Transition name="modal">
      <div
        v-if="showDialog"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click="closeDialog"
      >
        <div
          class="bg-white dark:bg-surface-elevated backdrop-blur-xl max-w-md w-full p-8 rounded-[24px] border border-stroke-subtle dark:border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
          @click.stop
        >
          <div class="flex justify-center mb-6">
            <div
              class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          </div>
          <h3
            class="text-2xl font-bold text-content-primary dark:text-content-primary text-center mb-4"
          >
            {{ dialogTitle }}
          </h3>
          <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
            {{ dialogMessage }}
          </p>
          <button
            @click="closeDialog"
            class="w-full px-6 py-3 rounded-lg font-medium transition-all bg-accent-red hover:bg-accent-red/90 text-white"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>

    <!-- Restarting Overlay (non-dismissible) -->
    <Transition name="modal">
      <div
        v-if="showRestarting"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      >
        <div
          class="bg-white dark:bg-surface-elevated backdrop-blur-xl max-w-sm w-full p-10 rounded-[24px] border border-stroke-subtle dark:border-white/20 shadow-[0_8px_48px_0_rgba(0,0,0,0.5)] flex flex-col items-center gap-6"
        >
          <!-- Circular bar spinner -->
          <svg class="spinner-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect
              v-for="i in 8"
              :key="i"
              x="47.5"
              y="14"
              width="5"
              height="18"
              rx="2.5"
              class="spinner-bar"
              :transform="`rotate(${(i - 1) * 45}, 50, 50)`"
              :style="`animation-delay: ${((i - 1) * 125)}ms`"
            />
          </svg>

          <div class="text-center">
            <h3 class="text-xl font-bold text-content-primary dark:text-content-primary mb-2">
              Restarting&hellip;
            </h3>
            <p class="text-sm text-content-secondary dark:text-content-primary/60">
              Please wait while the service restarts. This may take up to a minute.
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .glass-card,
.modal-leave-active .glass-card {
  transition: transform 0.3s ease;
}

.modal-enter-from .glass-card,
.modal-leave-to .glass-card {
  transform: scale(0.9);
}

/* Slide transition for custom fields */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Smooth floating animations */
@keyframes float-slow {
  0%,
  100% {
    opacity: 0.8;
    transform: translate(0, 0) scale(1) rotate(-24.22deg);
  }
  50% {
    opacity: 0.6;
    transform: translate(20px, -20px) scale(1.05) rotate(-24.22deg);
  }
}

@keyframes float-slower {
  0%,
  100% {
    opacity: 0.75;
    transform: translate(0, 0) scale(1) rotate(-24.22deg);
  }
  50% {
    opacity: 0.5;
    transform: translate(-30px, 20px) scale(1.08) rotate(-24.22deg);
  }
}

@keyframes float-slowest {
  0%,
  100% {
    opacity: 0.8;
    transform: translate(0, 0) scale(1) rotate(-24.22deg);
  }
  50% {
    opacity: 0.55;
    transform: translate(25px, 25px) scale(1.1) rotate(-24.22deg);
  }
}

.animate-pulse-slow {
  animation: float-slow 15s ease-in-out infinite;
  will-change: transform, opacity;
}

.animate-pulse-slower {
  animation: float-slower 18s ease-in-out infinite;
  will-change: transform, opacity;
}

.animate-pulse-slowest {
  animation: float-slowest 20s ease-in-out infinite;
  will-change: transform, opacity;
}

/* Circular bar spinner */
.spinner-svg {
  width: 72px;
  height: 72px;
}

.spinner-bar {
  fill: transparent;
  stroke: rgb(34 197 94);
  stroke-width: 0.5;
  animation: bar-fill 1s ease-in-out infinite;
}

@keyframes bar-fill {
  0%, 100% {
    fill: transparent;
    opacity: 0.2;
  }
  40%, 60% {
    fill: rgb(34 197 94);
    opacity: 1;
  }
}
</style>
