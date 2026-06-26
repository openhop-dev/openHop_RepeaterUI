<script setup lang="ts">
import { onMounted, computed, nextTick, ref, watch } from 'vue';
import { Cpu, Usb, Wifi } from '@lucide/vue';
import { useSetupStore } from '@/stores/setup';
import { ApiService } from '@/utils/api';
import ThemeToggle from '@/components/ThemeToggle.vue';
import Spinner from '@/components/ui/Spinner.vue';
import RestartModal from '@/components/modals/RestartModal.vue';
import TxPowerNoticeModal from '@/components/modals/TxPowerNoticeModal.vue';

const setupStore = useSetupStore();

defineOptions({ name: 'SetupView' });

const showDialog = ref(false);
const dialogTitle = ref('');
const dialogMessage = ref('');
const dialogType = ref<'error'>('error');
const showRestartModal = ref(false);
const serialDevices = ref<Array<{ device: string; description?: string }>>([]);
const serialDevicesLoading = ref(false);
const serialDevicesError = ref('');
const useCustomUsbPath = ref(false);
const showTxPowerNoticeModal = ref(false);
const txPowerNoticeConfirmed = ref(false);
const txPowerNoticeAcknowledged = ref(false);
const nextActionButtonRef = ref<HTMLElement | null>(null);

const selectedTxPowerForWarning = computed(() => {
  if (setupStore.useCustomRadio) {
    const n = Number(setupStore.customRadio.tx_power);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(setupStore.selectedRadioPreset?.tx_power ?? 14);
  return Number.isFinite(n) ? n : 14;
});

function selectedHardwareKey(): string {
  return setupStore.selectedHardware?.key?.toLowerCase() ?? '';
}

function isUsbHardwareSelected(): boolean {
  const key = selectedHardwareKey();
  return key === 'kiss' || key === 'pymc_usb';
}

async function loadSerialDevices() {
  serialDevicesLoading.value = true;
  serialDevicesError.value = '';
  try {
    const result = await ApiService.getSerialPorts();
    if (result.success && Array.isArray(result.data)) {
      serialDevices.value = result.data;
    } else {
      serialDevices.value = [];
      serialDevicesError.value = result.error || 'Could not load USB serial devices';
    }
  } catch (error: unknown) {
    const e = error as { message?: string };
    serialDevices.value = [];
    serialDevicesError.value = e.message || 'Could not load USB serial devices';
  } finally {
    serialDevicesLoading.value = false;
  }
}

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
  await Promise.all([setupStore.fetchHardwareOptions(), setupStore.fetchRadioPresets(), loadSerialDevices()]);
});

watch(
  () => setupStore.selectedHardware?.key,
  () => {
    if (isUsbHardwareSelected()) {
      void loadSerialDevices();
    } else {
      useCustomUsbPath.value = false;
    }
  },
);

watch(
  [
    () => setupStore.useCustomRadio,
    () => setupStore.selectedRadioPreset?.title,
    () => setupStore.customRadio.tx_power,
  ],
  () => {
    txPowerNoticeAcknowledged.value = false;
    txPowerNoticeConfirmed.value = false;
  },
);

const progressPercentage = computed(() => {
  return (setupStore.currentStep / setupStore.totalSteps) * 100;
});

type ConnectionType = 'gpio' | 'usb' | 'network';

const connectionFilters: Array<{ key: ConnectionType; title: string; description: string }> = [
  {
    key: 'gpio',
    title: 'HAT GPIO Based Device',
    description: 'Direct SPI/GPIO connected HATs and board-integrated radios.',
  },
  {
    key: 'usb',
    title: 'USB Connection',
    description: 'USB-attached modems including CH341 and openHop USB modem.',
  },
  {
    key: 'network',
    title: 'Network Wi-Fi Based',
    description: 'Remote modem reached over LAN/Wi-Fi using openHop TCP.',
  },
];

function getHardwareConnectionType(
  hardware: { key: string; config?: Record<string, unknown> },
): ConnectionType | null {
  const key = hardware.key.toLowerCase();
  if (key === 'kiss') {
    return 'usb';
  }

  const configured = String(hardware.config?.connection_type || '').toLowerCase();
  if (configured === 'usb' || configured === 'network' || configured === 'gpio') {
    return configured;
  }

  if (key.includes('ch341') || key === 'pymc_usb') return 'usb';
  if (key === 'pymc_tcp') return 'network';
  return 'gpio';
}

const filteredHardwareOptions = computed(() => {
  const selected = setupStore.selectedHardwareConnection;
  if (!selected) return [];

  return setupStore.hardwareOptions.filter((hardware) => getHardwareConnectionType(hardware) === selected);
});

function selectConnectionFilter(connection: ConnectionType) {
  setupStore.selectedHardwareConnection = connection;
  if (
    setupStore.selectedHardware &&
    !filteredHardwareOptions.value.some((option) => option.key === setupStore.selectedHardware?.key)
  ) {
    setupStore.selectedHardware = null;
  }
}

function scrollToNextAction() {
  void nextTick(() => {
    nextActionButtonRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function handleNext() {
  if (
    setupStore.currentStep === 5 &&
    setupStore.canGoNext &&
    !txPowerNoticeAcknowledged.value &&
    selectedTxPowerForWarning.value !== null
  ) {
    showTxPowerNoticeModal.value = true;
    return;
  }

  if (setupStore.isLastStep) {
    // Complete setup
    const result = await setupStore.completeSetup();
    if (result.success) {
      showRestartModal.value = true;
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

function closeTxPowerNotice() {
  showTxPowerNoticeModal.value = false;
  txPowerNoticeConfirmed.value = false;
}

async function confirmTxPowerNoticeAndContinue() {
  if (!txPowerNoticeConfirmed.value) return;
  txPowerNoticeAcknowledged.value = true;
  showTxPowerNoticeModal.value = false;
  await handleNext();
}

function handleBack() {
  setupStore.previousStep();
}

function closeDialog() {
  showDialog.value = false;
}


const stepTitles = [
  'Welcome',
  'Repeater Name',
  'Connection Type',
  'Hardware & Connection',
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
                    : 'bg-background-mute dark:bg-stroke/10 text-content-muted',
              ]"
            >
              {{ step }}
            </div>
          </div>
        </div>

        <!-- Step Content -->
        <div class="mb-8">
          <h2
            class="text-2xl sm:text-3xl font-bold text-content-primary mb-2 text-center"
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
                Welcome to your Repeater! Let's get you set up in just a few steps.
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
                class="block text-content-primary/90 text-sm font-medium mb-2"
                >Repeater Name</label
              >
              <input
                v-model="setupStore.nodeName"
                type="text"
                class="modal-input"
                placeholder="e.g., pyRpt0001"
                maxlength="32"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-2">
                Use letters, numbers, hyphens, or underscores (3-32 characters)
              </p>
            </div>
          </div>

          <!-- Connection Type Step -->
          <div v-else-if="setupStore.currentStep === 3" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Choose how your radio hardware connects to this repeater.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
              <button
                v-for="connection in connectionFilters"
                :key="connection.key"
                @click="selectConnectionFilter(connection.key)"
                :class="[
                  'p-6 rounded-[16px] border transition-all duration-300 text-left backdrop-blur-sm min-h-[220px] flex flex-col',
                  setupStore.selectedHardwareConnection === connection.key
                    ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 shadow-lg shadow-primary/20'
                    : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20',
                ]"
              >
                <div
                  :class="[
                    'mb-5 w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-300',
                    setupStore.selectedHardwareConnection === connection.key
                      ? 'bg-primary/20 border-primary/40 shadow-md shadow-primary/20'
                      : 'bg-white/60 dark:bg-white/10 border-stroke-subtle dark:border-stroke/20',
                  ]"
                >
                  <Cpu v-if="connection.key === 'gpio'" class="w-9 h-9 text-primary" :stroke-width="1.8" />
                  <Usb v-else-if="connection.key === 'usb'" class="w-9 h-9 text-primary" :stroke-width="1.8" />
                  <Wifi v-else class="w-9 h-9 text-primary" :stroke-width="1.8" />
                </div>
                <div class="font-semibold text-lg text-content-primary mb-2">
                  {{ connection.title }}
                </div>
                <div class="text-sm text-content-secondary dark:text-content-muted">
                  {{ connection.description }}
                </div>
              </button>
            </div>
          </div>

          <!-- Hardware Selection Step -->
          <div v-else-if="setupStore.currentStep === 4" class="mt-8">
            <div
              v-if="setupStore.isLoading"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              Loading hardware options...
            </div>
            <div
              v-else-if="!setupStore.selectedHardwareConnection"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              Choose a connection type first
            </div>
            <div
              v-else-if="filteredHardwareOptions.length === 0"
              class="text-center text-content-secondary dark:text-content-muted"
            >
              No hardware options available for this connection type
            </div>
            <div v-else class="max-w-3xl mx-auto space-y-8">

              <!-- Phase 1: Hardware picker -->
              <div>
                <div class="flex items-center gap-3 mb-4">
                  <div
                    :class="[
                      'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-all',
                      setupStore.selectedHardware
                        ? 'bg-primary text-white'
                        : 'bg-primary text-white',
                    ]"
                  >
                    <svg v-if="setupStore.selectedHardware" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span v-else>1</span>
                  </div>
                  <h3 class="font-semibold text-content-primary">Select your hardware board</h3>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pl-10">
                  <button
                    v-for="hardware in filteredHardwareOptions"
                    :key="hardware.key"
                    @click="
                      setupStore.selectedHardware = hardware;
                      scrollToNextAction();
                    "
                    :class="[
                      'p-4 rounded-[12px] border transition-all duration-300 text-left backdrop-blur-sm',
                      setupStore.selectedHardware?.key === hardware.key
                        ? 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/50 shadow-lg shadow-primary/20'
                        : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20',
                    ]"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="font-medium text-content-primary mb-1">
                          {{ hardware.name }}
                        </div>
                        <div class="text-sm text-content-secondary dark:text-content-muted">
                          {{ hardware.description || hardware.key }}
                        </div>
                      </div>
                      <div v-if="setupStore.selectedHardware?.key === hardware.key" class="text-primary flex-shrink-0 mt-0.5">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Phase 2: Connection details (USB or TCP only) -->
              <Transition name="slide">
                <div
                  v-if="
                    setupStore.selectedHardware &&
                    (setupStore.selectedHardware.key.toLowerCase() === 'kiss' ||
                      setupStore.selectedHardware.key.toLowerCase() === 'pymc_usb' ||
                      setupStore.selectedHardware.key.toLowerCase() === 'pymc_tcp')
                  "
                >
                  <!-- Step divider -->
                  <div class="flex items-center gap-3 mb-4">
                    <div class="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      2
                    </div>
                    <h3 class="font-semibold text-content-primary">
                      Configure the connection to your modem
                    </h3>
                  </div>

                  <!-- USB fields -->
                  <div
                    v-if="
                      setupStore.selectedHardware.key.toLowerCase() === 'kiss' ||
                      setupStore.selectedHardware.key.toLowerCase() === 'pymc_usb'
                    "
                    class="pl-10"
                  >
                    <div class="bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] p-5 space-y-4">
                      <div>
                        <label class="block text-content-primary/90 text-sm font-medium mb-1.5">
                          Serial Port
                        </label>
                        <div class="space-y-2">
                          <div class="flex gap-2">
                            <select
                              v-model="setupStore.usbPort"
                              class="modal-select px-4 py-3 font-mono"
                              :disabled="useCustomUsbPath"
                            >
                              <option
                                v-if="setupStore.usbPort && !serialDevices.some((d) => d.device === setupStore.usbPort)"
                                :value="setupStore.usbPort"
                              >
                                {{ setupStore.usbPort }} (current)
                              </option>
                              <option
                                v-for="dev in serialDevices"
                                :key="dev.device"
                                :value="dev.device"
                              >
                                {{ dev.description || dev.device }}
                              </option>
                            </select>
                            <button
                              type="button"
                              class="px-3 py-2 rounded-lg border border-stroke-subtle dark:border-stroke/10 text-sm text-content-primary bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 disabled:opacity-50"
                              :disabled="serialDevicesLoading"
                              @click="loadSerialDevices"
                            >
                              {{ serialDevicesLoading ? '...' : 'Refresh' }}
                            </button>
                          </div>

                          <label class="flex items-center gap-2 text-xs text-content-secondary dark:text-content-muted">
                            <input v-model="useCustomUsbPath" type="checkbox" />
                            Enter custom device path
                          </label>

                          <input
                            v-if="useCustomUsbPath"
                            v-model="setupStore.usbPort"
                            type="text"
                            class="modal-input px-4 py-3 font-mono"
                            placeholder="/dev/ttyACM0"
                          />

                          <p
                            v-if="serialDevicesError"
                            class="text-xs text-accent-red"
                          >
                            {{ serialDevicesError }}
                          </p>
                        </div>
                        <p class="text-content-muted text-xs mt-2">
                          The USB-CDC device path for your modem. If you have the openHop udev rule installed it may appear as <span class="font-mono">/dev/lora-modem</span>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- TCP fields -->
                  <div
                    v-else-if="setupStore.selectedHardware.key.toLowerCase() === 'pymc_tcp'"
                    class="pl-10"
                  >
                    <div class="bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] p-5 space-y-4">
                      <div>
                        <label class="block text-content-primary/90 text-sm font-medium mb-1.5">
                          Modem Hostname or IP Address <span class="text-accent-red">*</span>
                        </label>
                        <input
                          v-model="setupStore.tcpHost"
                          type="text"
                          class="modal-input px-4 py-3 font-mono"
                          placeholder="pymc-3e2834.local"
                        />
                        <p class="text-content-muted text-xs mt-2">
                          mDNS hostname, LAN IP, or domain name of the openHop Wi-Fi modem.
                        </p>
                      </div>
                      <div class="grid grid-cols-2 gap-4">
                        <div>
                          <label class="block text-content-primary/90 text-sm font-medium mb-1.5">
                            Port
                          </label>
                          <input
                            v-model.number="setupStore.tcpPort"
                            type="number"
                            min="1"
                            max="65535"
                            class="modal-input px-4 py-3"
                            placeholder="5055"
                          />
                          <p class="text-content-muted text-xs mt-2">Default is 5055.</p>
                        </div>
                        <div>
                          <label class="block text-content-primary/90 text-sm font-medium mb-1.5">
                            Auth Token
                            <span class="font-normal text-content-muted ml-1">(optional)</span>
                          </label>
                          <input
                            v-model="setupStore.tcpToken"
                            type="password"
                            class="modal-input px-4 py-3"
                            placeholder="Leave blank if none"
                          />
                          <p class="text-content-muted text-xs mt-2">Must match the token set in the modem firmware.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Radio Preset Step -->
          <div v-else-if="setupStore.currentStep === 5" class="space-y-6 mt-8">
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
                    scrollToNextAction();
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
                      class="font-medium text-content-primary mb-1 flex items-start justify-between gap-2"
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
                      <div class="bg-background-mute dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted">Freq</div>
                        <div class="text-content-primary/80 font-medium">
                          {{ preset.frequency }}
                        </div>
                      </div>
                      <div class="bg-background-mute dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted">BW</div>
                        <div class="text-content-primary/80 font-medium">
                          {{ preset.bandwidth }}
                        </div>
                      </div>
                      <div class="bg-background-mute dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted">SF</div>
                        <div class="text-content-primary/80 font-medium">
                          {{ preset.spreading_factor }}
                        </div>
                      </div>
                      <div class="bg-background-mute dark:bg-white/5 rounded px-2 py-1">
                        <div class="text-content-muted">CR</div>
                        <div class="text-content-primary/80 font-medium">
                          {{ preset.coding_rate }}
                        </div>
                      </div>
                      <div class="bg-background-mute dark:bg-white/5 rounded px-2 py-1 col-span-2">
                        <div class="text-content-muted">TX Power</div>
                        <div class="text-content-primary/80 font-medium">
                          {{ setupStore.selectedHardware?.config?.tx_power ?? (preset.tx_power || '14') }} dBm
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
                      class="font-medium text-content-primary flex items-center gap-2"
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
                        class="block text-content-primary/90 text-sm font-medium mb-2"
                        >Frequency (MHz)</label
                      >
                      <input
                        v-model="setupStore.customRadio.frequency"
                        type="number"
                        step="0.1"
                        class="modal-input px-4 py-2.5"
                        placeholder="915.0"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-content-primary/90 text-sm font-medium mb-2"
                        >Bandwidth (kHz)</label
                      >
                      <input
                        v-model="setupStore.customRadio.bandwidth"
                        type="number"
                        class="modal-input px-4 py-2.5"
                        placeholder="125"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-content-primary/90 text-sm font-medium mb-2"
                        >Spreading Factor</label
                      >
                      <select
                        v-model="setupStore.customRadio.spreading_factor"
                        class="modal-select px-4 py-2.5"
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
                        class="block text-content-primary/90 text-sm font-medium mb-2"
                        >Coding Rate</label
                      >
                      <select
                        v-model="setupStore.customRadio.coding_rate"
                        class="modal-select px-4 py-2.5"
                      >
                        <option value="5">4/5</option>
                        <option value="6">4/6</option>
                        <option value="7">4/7</option>
                        <option value="8">4/8</option>
                      </select>
                    </div>
                    <div class="col-span-2 sm:col-span-1">
                      <label
                        class="block text-content-primary/90 text-sm font-medium mb-2"
                        >TX Power (dBm)</label
                      >
                      <input
                        v-model="setupStore.customRadio.tx_power"
                        type="number"
                        min="-9"
                        max="22"
                        class="modal-input px-4 py-2.5"
                        placeholder="14"
                      />
                      <p class="text-content-muted text-xs mt-2">SX1262 range: -9 to +22 dBm</p>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- Security Step -->
          <div v-else-if="setupStore.currentStep === 6" class="space-y-6 mt-8">
            <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
              Set a secure admin password to protect your repeater
            </p>
            <div class="max-w-md mx-auto space-y-4">
              <div>
                <label
                  class="block text-content-primary/90 text-sm font-medium mb-2"
                  >Admin Password</label
                >
                <input
                  v-model="setupStore.adminPassword"
                  type="password"
                  class="modal-input px-4 py-3"
                  placeholder="Enter password (min 6 characters)"
                  minlength="6"
                />
              </div>
              <div>
                <label
                  class="block text-content-primary/90 text-sm font-medium mb-2"
                  >Confirm Password</label
                >
                <input
                  v-model="setupStore.confirmPassword"
                  type="password"
                  class="modal-input px-4 py-3"
                  placeholder="Confirm password"
                />
              </div>
              <div
                v-if="
                  setupStore.adminPassword &&
                  setupStore.confirmPassword &&
                  setupStore.adminPassword !== setupStore.confirmPassword
                "
                class="text-accent-red text-sm"
              >
                Passwords do not match
              </div>
              <div
                class="bg-accent-amber/10 border border-accent-amber/30 rounded-lg p-3 text-sm text-accent-amber"
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
          class="mb-6 bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 text-accent-red"
        >
          {{ setupStore.error }}
        </div>

        <!-- Navigation Buttons -->
        <div class="flex justify-between gap-4">
          <button
            v-if="setupStore.canGoBack"
            @click="handleBack"
            class="px-6 py-3 rounded-[12px] bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary hover:bg-stroke-subtle dark:hover:bg-white/10 hover:border-stroke dark:hover:border-stroke/20 transition-all duration-300 font-medium"
          >
            Back
          </button>
          <div v-else></div>

          <button
            ref="nextActionButtonRef"
            @click="handleNext"
            :disabled="!setupStore.canGoNext || setupStore.isSubmitting"
            class="px-8 py-3 rounded-[12px] font-semibold transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              setupStore.canGoNext && !setupStore.isSubmitting
                ? 'bg-primary hover:bg-primary/90 text-white border border-primary hover:border-primary/80'
                : 'bg-background-mute dark:bg-stroke/5 text-content-muted border border-stroke-subtle dark:border-stroke/10'
            "
          >
            <Spinner v-if="setupStore.isSubmitting" size="sm" color="white" />
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
    <TxPowerNoticeModal
      :show="showTxPowerNoticeModal"
      :confirmed="txPowerNoticeConfirmed"
      :selected-tx-power="selectedTxPowerForWarning"
      action-label="I Understand, Continue"
      @update:show="(v) => (v ? (showTxPowerNoticeModal = true) : closeTxPowerNotice())"
      @update:confirmed="(v) => (txPowerNoticeConfirmed = v)"
      @confirm="confirmTxPowerNoticeAndContinue"
    />

    <Transition name="modal">
      <div
        v-if="showDialog"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click="closeDialog"
      >
        <div
          class="setup-dialog bg-white dark:bg-surface-elevated backdrop-blur-xl max-w-md w-full p-8 rounded-[24px] border border-stroke-subtle dark:border-white/20"
          @click.stop
        >
          <div class="flex justify-center mb-6">
            <div
              class="w-16 h-16 rounded-full bg-accent-red/10 dark:bg-accent-red/20 flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 text-accent-red"
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
            class="text-2xl font-bold text-content-primary text-center mb-4"
          >
            {{ dialogTitle }}
          </h3>
          <p class="text-content-secondary dark:text-content-primary/70 text-center mb-6">
            {{ dialogMessage }}
          </p>
          <button
            @click="closeDialog"
            class="w-full px-6 py-3 rounded-lg font-medium transition-colors bg-accent-red/20 hover:bg-accent-red/30 border border-accent-red/50 text-accent-red"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>

    <RestartModal
      v-model="showRestartModal"
      :start-immediately="true"
      message="Setup complete. The service is restarting. This may take up to a minute."
    />
  </div>
</template>

<style scoped>
.glass-card {
  background: color-mix(in srgb, var(--color-surface) 45%, transparent);
  backdrop-filter: blur(10px);
  border: 1px solid var(--color-border-subtle);
}

.setup-dialog {
  box-shadow: var(--color-glass-shadow);
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
</style>
