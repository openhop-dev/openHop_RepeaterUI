<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSystemStore } from '@/stores/system';
import { ApiService } from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

type SupportedRadioType = 'sx1262' | 'sx1262_ch341' | 'kiss' | 'pymc_tcp' | 'pymc_usb' | 'none';

interface RadioTypeOption {
  value: SupportedRadioType;
  label: string;
  detail: string;
}

interface HardwareOption {
  key: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

const systemStore = useSystemStore();

const radioTypeOptions: RadioTypeOption[] = [
  {
    value: 'sx1262',
    label: 'sx1262',
    detail: 'Linux spidev + system GPIO',
  },
  {
    value: 'sx1262_ch341',
    label: 'sx1262_ch341',
    detail: 'CH341 USB-to-SPI',
  },
  {
    value: 'kiss',
    label: 'kiss',
    detail: 'KISS-modem over serial',
  },
  {
    value: 'pymc_tcp',
    label: 'pymc_tcp',
    detail: 'pymc_tcp firmware modem over Wi-Fi/TCP',
  },
  {
    value: 'pymc_usb',
    label: 'pymc_usb',
    detail: 'pymc_usb firmware modem over USB-CDC',
  },
  {
    value: 'none',
    label: 'none',
    detail: 'Disable radio hardware (no RF I/O)',
  },
];

const config = computed<Record<string, any>>(() => {
  const stats = systemStore.stats as Record<string, any> | null;
  if (!stats) return {};
  const nested = (stats.config as Record<string, any> | undefined) ?? {};
  // Some runtime builds expose config sections at top-level while others nest
  // under stats.config. Merge both so radio_type and section objects resolve.
  return { ...stats, ...nested };
});

const isEditing = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const showRestartModal = ref(false);
const selectedRadioType = ref<SupportedRadioType>('none');
const serialDevices = ref<Array<{ device: string; description?: string }>>([]);
const serialDevicesLoading = ref(false);
const serialDevicesError = ref('');
const useCustomSerialPath = ref(false);
const hardwareOptions = ref<HardwareOption[]>([]);
const hardwareOptionsLoading = ref(false);
const hardwareOptionsError = ref('');
const selectedBoardPresetKey = ref('');

const kissPort = ref('');
const kissBaudRate = ref(9600);

const pymcUsbPort = ref('');
const pymcUsbBaudRate = ref(921600);

const pymcTcpHost = ref('');
const pymcTcpPort = ref(5055);
const pymcTcpToken = ref('');

const sxBusId = ref(0);
const sxCsId = ref(0);
const sxCsPin = ref(21);
const sxResetPin = ref(18);
const sxBusyPin = ref(20);
const sxIrqPin = ref(16);
const sxTxEnPin = ref(-1);
const sxRxEnPin = ref(-1);
const sxEnPin = ref(-1);
const sxEnPinsInput = ref('');
const sxTxLedPin = ref(-1);
const sxRxLedPin = ref(-1);

const ch341Vid = ref(6790);
const ch341Pid = ref(21778);

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRadioType(value: unknown): SupportedRadioType {
  if (value === null || value === undefined) return 'none';
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || ['none', 'null', 'disabled', 'off', 'no_radio'].includes(normalized)) {
    return 'none';
  }
  if (normalized === 'kiss-modem') return 'kiss';
  if (normalized === 'sx1262') return 'sx1262';
  if (normalized === 'sx1262_ch341') return 'sx1262_ch341';
  if (normalized === 'kiss') return 'kiss';
  if (normalized === 'pymc_tcp') return 'pymc_tcp';
  if (normalized === 'pymc_usb') return 'pymc_usb';
  return 'none';
}

function getHardwareRadioType(option: HardwareOption): SupportedRadioType {
  const raw = option.config?.radio_type;
  if (raw === undefined || raw === null || raw === '') return 'sx1262';
  return normalizeRadioType(raw);
}

const filteredBoardPresets = computed(() => {
  if (selectedRadioType.value !== 'sx1262' && selectedRadioType.value !== 'sx1262_ch341') {
    return [] as HardwareOption[];
  }
  return hardwareOptions.value.filter((opt) => getHardwareRadioType(opt) === selectedRadioType.value);
});

function applyBoardPreset(presetKey: string) {
  const preset = hardwareOptions.value.find((opt) => opt.key === presetKey);
  if (!preset || !preset.config) return;
  const cfg = preset.config;

  sxBusId.value = asNumber(cfg.bus_id, sxBusId.value);
  sxCsId.value = asNumber(cfg.cs_id, sxCsId.value);
  sxCsPin.value = asNumber(cfg.cs_pin, sxCsPin.value);
  sxResetPin.value = asNumber(cfg.reset_pin, sxResetPin.value);
  sxBusyPin.value = asNumber(cfg.busy_pin, sxBusyPin.value);
  sxIrqPin.value = asNumber(cfg.irq_pin, sxIrqPin.value);
  sxTxEnPin.value = asNumber(cfg.txen_pin, sxTxEnPin.value);
  sxRxEnPin.value = asNumber(cfg.rxen_pin, sxRxEnPin.value);
  sxEnPin.value = asNumber(cfg.en_pin, sxEnPin.value);
  if (Array.isArray(cfg.en_pins)) {
    sxEnPinsInput.value = cfg.en_pins
      .map((pin) => Number(pin))
      .filter((pin) => Number.isFinite(pin))
      .join(', ');
  } else {
    sxEnPinsInput.value = '';
  }
  sxTxLedPin.value = asNumber(cfg.txled_pin, sxTxLedPin.value);
  sxRxLedPin.value = asNumber(cfg.rxled_pin, sxRxLedPin.value);

  if (selectedRadioType.value === 'sx1262_ch341') {
    ch341Vid.value = asNumber(cfg.vid, ch341Vid.value);
    ch341Pid.value = asNumber(cfg.pid, ch341Pid.value);
  }
}

watch(
  config,
  (nextConfig) => {
    if (!isEditing.value) {
      selectedRadioType.value = normalizeRadioType(nextConfig.radio_type);
      const kiss = (nextConfig.kiss ?? {}) as Record<string, unknown>;
      const pymcUsb = (nextConfig.pymc_usb ?? {}) as Record<string, unknown>;
      const pymcTcp = (nextConfig.pymc_tcp ?? {}) as Record<string, unknown>;
      const sx = (nextConfig.sx1262 ?? {}) as Record<string, unknown>;
      const ch341 = (nextConfig.ch341 ?? {}) as Record<string, unknown>;

      kissPort.value = asString(kiss.port, '/dev/ttyUSB0');
      kissBaudRate.value = asNumber(kiss.baud_rate, 9600);

      pymcUsbPort.value = asString(pymcUsb.port, '/dev/ttyACM0');
      pymcUsbBaudRate.value = asNumber(pymcUsb.baudrate, 921600);

      pymcTcpHost.value = asString(pymcTcp.host, '');
      pymcTcpPort.value = asNumber(pymcTcp.port, 5055);
      pymcTcpToken.value = asString(pymcTcp.token, '');

      sxBusId.value = asNumber(sx.bus_id, 0);
      sxCsId.value = asNumber(sx.cs_id, 0);
      sxCsPin.value = asNumber(sx.cs_pin, 21);
      sxResetPin.value = asNumber(sx.reset_pin, 18);
      sxBusyPin.value = asNumber(sx.busy_pin, 20);
      sxIrqPin.value = asNumber(sx.irq_pin, 16);
      sxTxEnPin.value = asNumber(sx.txen_pin, -1);
      sxRxEnPin.value = asNumber(sx.rxen_pin, -1);
      sxEnPin.value = asNumber(sx.en_pin, -1);
      if (Array.isArray(sx.en_pins)) {
        sxEnPinsInput.value = sx.en_pins
          .map((pin) => Number(pin))
          .filter((pin) => Number.isFinite(pin))
          .join(', ');
      } else {
        sxEnPinsInput.value = '';
      }
      sxTxLedPin.value = asNumber(sx.txled_pin, -1);
      sxRxLedPin.value = asNumber(sx.rxled_pin, -1);

      ch341Vid.value = asNumber(ch341.vid, 6790);
      ch341Pid.value = asNumber(ch341.pid, 21778);
      selectedBoardPresetKey.value = '';
    }
  },
  { immediate: true },
);

const currentRadioType = computed(() => normalizeRadioType(config.value.radio_type));

const currentRadioTypeLabel = computed(() => {
  const match = radioTypeOptions.find((opt) => opt.value === currentRadioType.value);
  return match ? `${match.label} - ${match.detail}` : 'none - Disable radio hardware (no RF I/O)';
});

function startEditing() {
  selectedRadioType.value = currentRadioType.value;
  isEditing.value = true;
  errorMessage.value = '';
}

function cancelEditing() {
  selectedRadioType.value = currentRadioType.value;
  isEditing.value = false;
  errorMessage.value = '';
  useCustomSerialPath.value = false;
  selectedBoardPresetKey.value = '';
}

function parseEnPins(input: string): number[] {
  return input
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
}

async function loadHardwareOptions() {
  hardwareOptionsLoading.value = true;
  hardwareOptionsError.value = '';
  try {
    const result = await ApiService.get<Array<HardwareOption>>('hardware_options');

    // /api/hardware_options returns { hardware: [...] } (legacy/plain shape)
    // while other endpoints return { success, data }. Support both.
    const legacyHardware = (result as unknown as { hardware?: unknown }).hardware;
    if (Array.isArray(legacyHardware)) {
      hardwareOptions.value = legacyHardware as HardwareOption[];
      return;
    }

    if (result.success && Array.isArray(result.data)) {
      hardwareOptions.value = result.data;
      return;
    }

    hardwareOptions.value = [];
    hardwareOptionsError.value = (result as { error?: string }).error || 'Could not load hardware presets';
  } catch (error: unknown) {
    const e = error as { message?: string };
    hardwareOptions.value = [];
    hardwareOptionsError.value = e.message || 'Could not load hardware presets';
  } finally {
    hardwareOptionsLoading.value = false;
  }
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

async function saveChanges(): Promise<boolean> {
  isSaving.value = true;
  errorMessage.value = '';

  try {
    if (selectedRadioType.value === 'pymc_tcp' && !pymcTcpHost.value.trim()) {
      errorMessage.value = 'TCP modem host is required for pymc_tcp';
      return false;
    }

    const payload: Record<string, unknown> = {
      radio_type: selectedRadioType.value === 'none' ? null : selectedRadioType.value,
    };

    if (selectedRadioType.value === 'kiss') {
      payload.kiss = {
        port: kissPort.value.trim() || '/dev/ttyUSB0',
        baud_rate: asNumber(kissBaudRate.value, 9600),
      };
    }

    if (selectedRadioType.value === 'pymc_usb') {
      payload.pymc_usb = {
        port: pymcUsbPort.value.trim() || '/dev/ttyACM0',
        baudrate: asNumber(pymcUsbBaudRate.value, 921600),
      };
    }

    if (selectedRadioType.value === 'pymc_tcp') {
      payload.pymc_tcp = {
        host: pymcTcpHost.value.trim(),
        port: asNumber(pymcTcpPort.value, 5055),
        token: pymcTcpToken.value,
      };
    }

    if (selectedRadioType.value === 'sx1262' || selectedRadioType.value === 'sx1262_ch341') {
      const parsedEnPins = parseEnPins(sxEnPinsInput.value);
      payload.sx1262 = {
        bus_id: asNumber(sxBusId.value, 0),
        cs_id: asNumber(sxCsId.value, 0),
        cs_pin: asNumber(sxCsPin.value, 21),
        reset_pin: asNumber(sxResetPin.value, 18),
        busy_pin: asNumber(sxBusyPin.value, 20),
        irq_pin: asNumber(sxIrqPin.value, 16),
        txen_pin: asNumber(sxTxEnPin.value, -1),
        rxen_pin: asNumber(sxRxEnPin.value, -1),
        ...(parsedEnPins.length > 0
          ? { en_pins: parsedEnPins }
          : { en_pin: asNumber(sxEnPin.value, -1) }),
        txled_pin: asNumber(sxTxLedPin.value, -1),
        rxled_pin: asNumber(sxRxLedPin.value, -1),
      };
    }

    if (selectedRadioType.value === 'sx1262_ch341') {
      payload.ch341 = {
        vid: asNumber(ch341Vid.value, 6790),
        pid: asNumber(ch341Pid.value, 21778),
      };
    }

    const result = await ApiService.importConfig(payload);

    if (!result.success) {
      errorMessage.value = result.error || 'Failed to save settings';
      return false;
    }

    isEditing.value = false;
    await systemStore.fetchStats();
    showRestartModal.value = true;
    return true;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } }; message?: string };
    errorMessage.value = e.response?.data?.error || e.message || 'Failed to save settings';
    return false;
  } finally {
    isSaving.value = false;
  }
}

const showSerialFields = computed(
  () => selectedRadioType.value === 'kiss' || selectedRadioType.value === 'pymc_usb',
);
const showTcpFields = computed(() => selectedRadioType.value === 'pymc_tcp');
const showSx1262Fields = computed(
  () => selectedRadioType.value === 'sx1262' || selectedRadioType.value === 'sx1262_ch341',
);
const showCh341Fields = computed(() => selectedRadioType.value === 'sx1262_ch341');

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  isSaving,
  cancelEditing,
  async () => saveChanges(),
);

defineExpose({ requestLeave, isEditing });

onMounted(() => {
  void loadSerialDevices();
  void loadHardwareOptions();
});

watch(
  [isEditing, selectedRadioType],
  ([editing, type]) => {
    if (editing && (type === 'kiss' || type === 'pymc_usb')) {
      void loadSerialDevices();
    }
    if (editing && (type === 'sx1262' || type === 'sx1262_ch341')) {
      void loadHardwareOptions();
    }
    selectedBoardPresetKey.value = '';
  },
  { immediate: false },
);
</script>

<template>
  <RestartModal
    v-model="showRestartModal"
    title="Radio Hardware change requires a restart."
    message="Restart now?"
  />

  <UnsavedChangesModal
    :show="showUnsavedModal"
    :is-saving="isSaving"
    label="Radio Hardware settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
          Radio Hardware
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Select which radio hardware backend this repeater should use
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="!isEditing"
          @click="startEditing"
          class="cfg-btn-primary"
        >
          Edit Settings
        </button>
        <template v-else>
          <button
            @click="cancelEditing"
            :disabled="isSaving"
            class="cfg-btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="saveChanges"
            :disabled="isSaving"
            class="cfg-btn-primary"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="bg-accent-red/10 dark:bg-accent-red/20 border border-accent-red dark:border-accent-red/50 rounded-lg p-3 text-accent-red text-sm"
    >
      {{ errorMessage }}
    </div>

    <div class="cfg-section space-y-3">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Radio Type</span>
        <div
          v-if="!isEditing"
          class="text-content-primary font-mono text-sm"
        >
          {{ currentRadioTypeLabel }}
        </div>
        <div v-else class="w-full sm:w-80">
          <select v-model="selectedRadioType" class="cfg-select">
            <option
              v-for="option in radioTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }} - {{ option.detail }}
            </option>
          </select>
        </div>
      </div>

      <template v-if="showSerialFields">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Serial Port
          </span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm break-all">
            {{ selectedRadioType === 'kiss' ? kissPort : pymcUsbPort }}
          </div>
          <template v-else>
            <div class="w-full sm:w-80 space-y-2">
              <div class="flex gap-2">
                <select
                  v-if="selectedRadioType === 'kiss'"
                  v-model="kissPort"
                  class="cfg-select flex-1"
                  :disabled="useCustomSerialPath"
                >
                  <option
                    v-if="kissPort && !serialDevices.some((d) => d.device === kissPort)"
                    :value="kissPort"
                  >
                    {{ kissPort }} (current)
                  </option>
                  <option
                    v-for="dev in serialDevices"
                    :key="`kiss-${dev.device}`"
                    :value="dev.device"
                  >
                    {{ dev.description || dev.device }}
                  </option>
                </select>
                <select
                  v-else
                  v-model="pymcUsbPort"
                  class="cfg-select flex-1"
                  :disabled="useCustomSerialPath"
                >
                  <option
                    v-if="pymcUsbPort && !serialDevices.some((d) => d.device === pymcUsbPort)"
                    :value="pymcUsbPort"
                  >
                    {{ pymcUsbPort }} (current)
                  </option>
                  <option
                    v-for="dev in serialDevices"
                    :key="`usb-${dev.device}`"
                    :value="dev.device"
                  >
                    {{ dev.description || dev.device }}
                  </option>
                </select>
                <button
                  type="button"
                  class="cfg-btn-secondary"
                  :disabled="serialDevicesLoading"
                  @click="loadSerialDevices"
                >
                  {{ serialDevicesLoading ? '...' : 'Refresh' }}
                </button>
              </div>

              <label class="flex items-center gap-2 text-xs text-content-secondary dark:text-content-muted">
                <input v-model="useCustomSerialPath" type="checkbox" />
                Enter custom device path
              </label>

              <input
                v-if="useCustomSerialPath && selectedRadioType === 'kiss'"
                v-model="kissPort"
                type="text"
                class="cfg-input"
                placeholder="/dev/ttyUSB0"
              />
              <input
                v-if="useCustomSerialPath && selectedRadioType !== 'kiss'"
                v-model="pymcUsbPort"
                type="text"
                class="cfg-input"
                placeholder="/dev/ttyACM0"
              />

              <p
                v-if="serialDevicesError"
                class="text-xs text-accent-red"
              >
                {{ serialDevicesError }}
              </p>
            </div>
          </template>
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Baud Rate
          </span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ selectedRadioType === 'kiss' ? kissBaudRate : pymcUsbBaudRate }}
          </div>
          <template v-else>
            <input
              v-if="selectedRadioType === 'kiss'"
              v-model.number="kissBaudRate"
              type="number"
              min="1"
              class="cfg-input w-full sm:w-40"
            />
            <input
              v-else
              v-model.number="pymcUsbBaudRate"
              type="number"
              min="1"
              class="cfg-input w-full sm:w-40"
            />
          </template>
        </div>
      </template>

      <template v-if="showTcpFields">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Host</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm break-all">
            {{ pymcTcpHost || 'Not set' }}
          </div>
          <input
            v-else
            v-model="pymcTcpHost"
            type="text"
            class="cfg-input w-full sm:w-72"
            placeholder="pymc-3e2834.local"
          />
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Port</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ pymcTcpPort }}
          </div>
          <input
            v-else
            v-model.number="pymcTcpPort"
            type="number"
            min="1"
            max="65535"
            class="cfg-input w-full sm:w-40"
          />
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Token</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ pymcTcpToken ? 'Configured' : 'Not set' }}
          </div>
          <input
            v-else
            v-model="pymcTcpToken"
            type="text"
            class="cfg-input w-full sm:w-72"
            placeholder="Optional"
          />
        </div>
      </template>

      <template v-if="showSx1262Fields && isEditing">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Board Preset (Quick Apply)</span>
          <div class="w-full sm:w-96 space-y-2">
            <div class="flex gap-2">
              <select
                v-model="selectedBoardPresetKey"
                class="cfg-select flex-1"
                @change="applyBoardPreset(selectedBoardPresetKey)"
              >
                <option value="">Leave current pin values unchanged</option>
                <option v-for="preset in filteredBoardPresets" :key="preset.key" :value="preset.key">
                  {{ preset.name || preset.key }}
                </option>
              </select>
              <button
                type="button"
                class="cfg-btn-secondary"
                :disabled="hardwareOptionsLoading"
                @click="loadHardwareOptions"
              >
                {{ hardwareOptionsLoading ? '...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="hardwareOptionsError" class="text-xs text-accent-red">
              {{ hardwareOptionsError }}
            </p>
            <p class="text-xs text-content-muted">
              Optional: selecting a preset fills the pin fields below for quick setup changes.
            </p>
          </div>
        </div>

        <div class="pt-2 text-xs text-content-muted">SX1262 Board Pin Configuration</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-stroke-subtle dark:border-stroke/10">
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI Bus ID
            <input v-if="isEditing" v-model.number="sxBusId" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxBusId }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI CS ID
            <input v-if="isEditing" v-model.number="sxCsId" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxCsId }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CS Pin
            <input v-if="isEditing" v-model.number="sxCsPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxCsPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Reset Pin
            <input v-if="isEditing" v-model.number="sxResetPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxResetPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Busy Pin
            <input v-if="isEditing" v-model.number="sxBusyPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxBusyPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">IRQ Pin
            <input v-if="isEditing" v-model.number="sxIrqPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxIrqPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TX Enable Pin
            <input v-if="isEditing" v-model.number="sxTxEnPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxTxEnPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">RX Enable Pin
            <input v-if="isEditing" v-model.number="sxRxEnPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxRxEnPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Power Enable Pin
            <input v-if="isEditing" v-model.number="sxEnPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxEnPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Power Enable Pins (array)
            <input
              v-if="isEditing"
              v-model="sxEnPinsInput"
              type="text"
              class="cfg-input mt-1"
              placeholder="26, 23"
            />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">
              {{ sxEnPinsInput || 'Not set' }}
            </span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TX LED Pin
            <input v-if="isEditing" v-model.number="sxTxLedPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxTxLedPin }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">RX LED Pin
            <input v-if="isEditing" v-model.number="sxRxLedPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxRxLedPin }}</span>
          </label>
        </div>
      </template>

      <div v-else-if="showSx1262Fields" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current SPI bus</div>
          <div class="text-content-primary font-mono">{{ sxBusId }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current SPI CS</div>
          <div class="text-content-primary font-mono">{{ sxCsId }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current CS pin</div>
          <div class="text-content-primary font-mono">{{ sxCsPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current reset pin</div>
          <div class="text-content-primary font-mono">{{ sxResetPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current busy pin</div>
          <div class="text-content-primary font-mono">{{ sxBusyPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current IRQ pin</div>
          <div class="text-content-primary font-mono">{{ sxIrqPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current power enable pin</div>
          <div class="text-content-primary font-mono">{{ sxEnPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/10 bg-background-mute dark:bg-white/5 p-3">
          <div class="text-content-muted text-xs mb-1">Current power enable pins</div>
          <div class="text-content-primary font-mono">
            {{ sxEnPinsInput || 'Not set' }}
          </div>
        </div>
      </div>

      <template v-if="showCh341Fields">
        <div class="pt-2 text-xs text-content-muted">CH341 Adapter Configuration</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-stroke-subtle dark:border-stroke/10">
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 VID
            <input v-if="isEditing" v-model.number="ch341Vid" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ ch341Vid }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 PID
            <input v-if="isEditing" v-model.number="ch341Pid" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ ch341Pid }}</span>
          </label>
        </div>
      </template>

      <div class="py-2 text-xs text-content-muted">
        Switching hardware saves immediately and requires a service restart to apply.
      </div>
    </div>
  </div>
</template>