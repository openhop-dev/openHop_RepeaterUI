<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSystemStore } from '@/stores/system';
import { useSetupStore } from '@/stores/setup';
import { ApiService } from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useMultiRadioConfig } from '@/composables/useMultiRadioConfig';
import RadioFrontendSettings from '@/components/configuration/RadioFrontendSettings.vue';
import SaveBar, { type SaveBarChange } from '@/components/ui/SaveBar.vue';
import { diffChanges, formatChangeValue, type FieldChange } from '@/utils/changeSet';
import {
  normalizeModemHardwareOptions,
  normalizeModemTransportConfig,
} from '@/utils/modemTransport';

type SupportedRadioType = 'sx1262' | 'sx1262_ch341' | 'kiss' | 'modem_tcp' | 'modem_usb' | 'none';

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
const setupStore = useSetupStore();

const {
  isMultiRadio,
  radioOptions,
  effectiveSelectedId,
  activeHardware,
  defaultRadioId,
  txMode,
  repeatOnIngress,
  originTx,
  fabric,
  radioStack,
  radios,
  selectRadio,
  ensureSelection,
} = useMultiRadioConfig();

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
    value: 'modem_tcp',
    label: 'openHop Modem (Wi-Fi / Ethernet)',
    detail: 'Network connection to an openHop Modem',
  },
  {
    value: 'modem_usb',
    label: 'openHop Modem (USB-CDC)',
    detail: 'USB-CDC connection to an openHop Modem',
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
  return normalizeModemTransportConfig({ ...stats, ...nested });
});

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
// SX1262 RF / TCXO flags (from board presets like PineDio)
const sxUseDio2Rf = ref(false);
const sxUseDio3Tcxo = ref(false);
const sxDio3TcxoVoltage = ref(1.8);
const sxIsWaveshare = ref(false);
const selectedAirPresetTitle = ref('');

// Per-radio air / LoRa settings (shown when multi-radio chrome is active)
const airFrequencyMHz = ref(869.618);
const airSpreadingFactor = ref(8);
const airBandwidthKHz = ref(62.5);
const airTxPower = ref(14);
const airCodingRate = ref(8);
const airPreambleLength = ref(32);

const bandwidthOptions = [
  { value: 7.8, label: '7.8 kHz' },
  { value: 10.4, label: '10.4 kHz' },
  { value: 15.6, label: '15.6 kHz' },
  { value: 20.8, label: '20.8 kHz' },
  { value: 31.25, label: '31.25 kHz' },
  { value: 41.7, label: '41.7 kHz' },
  { value: 62.5, label: '62.5 kHz' },
  { value: 125, label: '125 kHz' },
  { value: 250, label: '250 kHz' },
  { value: 500, label: '500 kHz' },
];

const kissPort = ref('');
const kissBaudRate = ref(9600);

const modemUsbPort = ref('');
const modemUsbBaudRate = ref(921600);

const modemTcpHost = ref('');
const modemTcpPort = ref(5055);
const modemTcpToken = ref('');

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
const ch341Bus = ref<number | null>(null);
const ch341Address = ref<number | null>(null);
const ch341Serial = ref('');
const fabricDefaultRadio = ref('');
const fabricTxMode = ref<'default' | 'sticky' | 'bridge'>('default');
const fabricRepeatOnIngress = ref(false);
const fabricOriginTx = ref<'default' | 'all'>('default');
const newRadioId = ref('');
const multiRadioBusy = ref(false);

/** Local draft while enabling/configuring multi-radio. Never auto-persisted. */
const draftRadios = ref<Array<Record<string, unknown>> | null>(null);
const draftSelectedId = ref('');
const isDraftingMultiRadio = computed(() => Array.isArray(draftRadios.value) && draftRadios.value.length > 0);
const isStagingDisableMultiRadio = computed(() => Array.isArray(draftRadios.value) && draftRadios.value.length === 0);
const hasUnsavedMultiRadioDraft = computed(
  () => isDraftingMultiRadio.value || isStagingDisableMultiRadio.value,
);

const workingRadios = computed<Array<Record<string, unknown>>>(() => {
  if (isDraftingMultiRadio.value && draftRadios.value) return draftRadios.value;
  return radios.value.map((r) => ({ ...r }) as Record<string, unknown>);
});

const showMultiRadioChrome = computed(() => isDraftingMultiRadio.value || (isMultiRadio.value && !isStagingDisableMultiRadio.value));

const workingRadioOptions = computed(() => {
  const def = fabricDefaultRadio.value || String(workingRadios.value[0]?.id || '');
  return workingRadios.value.map((r) => {
    const id = String(r.id || '');
    return {
      id,
      label: id,
      radio_type: String(r.radio_type ?? 'unknown'),
      isDefault: id === def,
    };
  });
});

/**
 * Fan-out gating, mirroring _validate_fabric_fanout in repeater/config.py.
 *
 * Both options are only defined for an exactly-two-radio Fabric: repeat_on_ingress
 * extends the deterministic A<->B bridge, and origin_tx: all sends once per radio.
 * The daemon refuses to start on a combination it cannot honour, so the form
 * blocks it here rather than letting a save take the node down at next restart.
 */
const fanoutRadioCount = computed(() => workingRadios.value.length);

const repeatOnIngressBlockedReason = computed(() => {
  if (fabricTxMode.value !== 'bridge') return 'Requires fabric TX mode “bridge”.';
  if (fanoutRadioCount.value !== 2) {
    return `Requires exactly two radios (this node has ${fanoutRadioCount.value}).`;
  }
  return '';
});

const originTxAllBlockedReason = computed(() =>
  fanoutRadioCount.value === 2
    ? ''
    : `“All radios” requires exactly two radios (this node has ${fanoutRadioCount.value}).`,
);

const canRepeatOnIngress = computed(() => repeatOnIngressBlockedReason.value === '');
const canOriginTxAll = computed(() => originTxAllBlockedReason.value === '');

/**
 * Saved fan-out that the running stack is not using yet.
 *
 * Both options are read once, when build_radio_stack assembles the radios, so a
 * save is inert until restart. /stats.radio_stack reports what the daemon
 * actually built, which is a firmer answer than "you just saved something".
 * Older daemons omit the keys; say nothing rather than guess.
 */
const fanoutPendingRestart = computed(() => {
  if (hasUnsavedMultiRadioDraft.value || isDirty.value) return false;
  const live = radioStack.value || {};
  if (live.repeat_on_ingress === undefined && live.origin_tx === undefined) return false;
  return (
    live.repeat_on_ingress !== repeatOnIngress.value ||
    String(live.origin_tx ?? 'default') !== originTx.value
  );
});

/** Drop any fan-out selection the current mode and radio count cannot carry. */
function clampFanoutToLegal() {
  if (!canRepeatOnIngress.value) fabricRepeatOnIngress.value = false;
  if (!canOriginTxAll.value) fabricOriginTx.value = 'default';
}

// Leaving bridge mode (or dropping to one radio) strips the meaning from
// repeat_on_ingress, so clear it instead of leaving a checked box that would be
// rejected on save.
watch([fabricTxMode, fanoutRadioCount], clampFanoutToLegal);

const workingSelectedId = computed(() => {
  if (!showMultiRadioChrome.value) return '';
  const ids = new Set(workingRadios.value.map((r) => String(r.id || '')));
  if (isDraftingMultiRadio.value) {
    if (draftSelectedId.value && ids.has(draftSelectedId.value)) return draftSelectedId.value;
    return fabricDefaultRadio.value && ids.has(fabricDefaultRadio.value)
      ? fabricDefaultRadio.value
      : String(workingRadios.value[0]?.id || '');
  }
  return effectiveSelectedId.value;
});

const workingSelectedEntry = computed<Record<string, unknown> | null>(() => {
  if (!showMultiRadioChrome.value) return null;
  const id = workingSelectedId.value;
  return workingRadios.value.find((r) => String(r.id) === id) ?? null;
});

/**
 * Unsaved changes. The form is always editable; nothing is written until Save.
 *
 * Each radio's hardware payload, as its form produced it when loaded from the
 * saved config, is the baseline the form is compared with. Edits to a radio the
 * form moves away from are kept in pendingPayloads and saved with the rest, so
 * switching radios no longer needs the page locked.
 */
/** Right-hand panel on a multi-radio node: the selected radio, or the fabric's routing. */
const activePanel = ref<'radio' | 'routing'>('radio');
/** Key of the radio the form shows: its radios[] id, or '' on a single-radio node. */
const formKey = computed(() => (showMultiRadioChrome.value ? workingSelectedId.value : ''));
const baselinePayloads = ref<Record<string, string>>({});
const pendingPayloads = ref<Record<string, Record<string, unknown>>>({});
/** Front-end values each modem confirmed since the last save, by radio id ('' = default). */
const liveConfigured = ref<Record<string, Record<string, unknown>>>({});
const fabricBaseline = ref('');

const formPayload = computed(() => buildPayload());
const formDirty = computed(() => {
  const base = baselinePayloads.value[formKey.value];
  return base !== undefined && JSON.stringify(formPayload.value) !== base;
});
const fabricState = computed(() =>
  JSON.stringify({
    default_radio: fabricDefaultRadio.value,
    tx_mode: fabricTxMode.value,
    repeat_on_ingress: fabricRepeatOnIngress.value,
    origin_tx: fabricOriginTx.value,
  }),
);
const fabricDirty = computed(
  () =>
    showMultiRadioChrome.value &&
    !isDraftingMultiRadio.value &&
    fabricBaseline.value !== '' &&
    fabricState.value !== fabricBaseline.value,
);
const isDirty = computed(
  () =>
    hasUnsavedMultiRadioDraft.value ||
    formDirty.value ||
    Object.keys(pendingPayloads.value).length > 0 ||
    fabricDirty.value,
);
// The page-wide edit mode this replaces; Configuration's tab guard reads it.
const isEditing = isDirty;

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Prefer explicit config values including 0 and -1; only use fallback when missing. */
function pinNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Default SX1262 pin map. CH341/PineDio uses adapter GPIO indices, not BCM. */
function defaultSxPins(radioType: SupportedRadioType): Record<string, number> {
  if (radioType === 'sx1262_ch341') {
    // Match radio-settings.json "pinedio" (common single CH341 USB stick).
    // reset_pin -1 is valid on PineDio (no discrete reset line).
    return {
      bus_id: 0,
      cs_id: 0,
      cs_pin: 0,
      reset_pin: -1,
      busy_pin: 11,
      irq_pin: 10,
      txen_pin: -1,
      rxen_pin: -1,
      en_pin: -1,
      txled_pin: -1,
      rxled_pin: -1,
    };
  }
  return {
    bus_id: 0,
    cs_id: 0,
    cs_pin: 21,
    reset_pin: 18,
    busy_pin: 20,
    irq_pin: 16,
    txen_pin: -1,
    rxen_pin: -1,
    en_pin: -1,
    txled_pin: -1,
    rxled_pin: -1,
  };
}

function sxPinsConfigured(sx: Record<string, unknown>, radioType: SupportedRadioType): boolean {
  // Required sense lines. reset_pin may be -1 on some CH341 boards (PineDio).
  // cs_pin may be -1 for native SPI CS on Linux spidev.
  const busy = Number(sx.busy_pin);
  const irq = Number(sx.irq_pin);
  if (!Number.isFinite(busy) || busy < 0) return false;
  if (!Number.isFinite(irq) || irq < 0) return false;
  if (radioType === 'sx1262') {
    const reset = Number(sx.reset_pin);
    if (!Number.isFinite(reset) || reset < 0) return false;
  } else if (radioType === 'sx1262_ch341') {
    const reset = Number(sx.reset_pin);
    // allow -1 or >=0; reject only nonsense < -1 or NaN when key present with invalid value
    if (sx.reset_pin !== undefined && sx.reset_pin !== null && sx.reset_pin !== '') {
      if (!Number.isFinite(reset) || reset < -1) return false;
    }
  }
  return true;
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
  if (normalized === 'modem_tcp') return 'modem_tcp';
  if (normalized === 'modem_usb') return 'modem_usb';
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
  const cfg = preset.config as Record<string, unknown>;

  // Board may declare radio_type (e.g. pinedio -> sx1262_ch341).
  const presetType = getHardwareRadioType(preset);
  if (presetType === 'sx1262' || presetType === 'sx1262_ch341') {
    selectedRadioType.value = presetType;
  }

  // pinNumber preserves explicit 0 and -1 from radio-settings.json (PineDio reset=-1, cs=0).
  const d = defaultSxPins(selectedRadioType.value);
  sxBusId.value = pinNumber(cfg.bus_id, d.bus_id);
  sxCsId.value = pinNumber(cfg.cs_id, d.cs_id);
  sxCsPin.value = pinNumber(cfg.cs_pin, d.cs_pin);
  sxResetPin.value = pinNumber(cfg.reset_pin, d.reset_pin);
  sxBusyPin.value = pinNumber(cfg.busy_pin, d.busy_pin);
  sxIrqPin.value = pinNumber(cfg.irq_pin, d.irq_pin);
  sxTxEnPin.value = pinNumber(cfg.txen_pin, d.txen_pin);
  sxRxEnPin.value = pinNumber(cfg.rxen_pin, d.rxen_pin);
  sxEnPin.value = pinNumber(cfg.en_pin, d.en_pin);
  // Always refresh EN from the preset. Stale en_pins:[0] from a prior form state
  // collides with PineDio CS=0 and breaks TX (CS stuck high).
  if (Array.isArray(cfg.en_pins)) {
    sxEnPinsInput.value = cfg.en_pins
      .map((pin) => Number(pin))
      .filter((pin) => Number.isFinite(pin) && pin >= 0)
      .join(', ');
    sxEnPin.value = pinNumber(cfg.en_pin, -1);
  } else if (cfg.en_pin !== undefined && cfg.en_pin !== null && cfg.en_pin !== '') {
    sxEnPinsInput.value = '';
    sxEnPin.value = pinNumber(cfg.en_pin, -1);
  } else {
    sxEnPinsInput.value = '';
    sxEnPin.value = -1;
  }
  sxTxLedPin.value = pinNumber(cfg.txled_pin, d.txled_pin);
  sxRxLedPin.value = pinNumber(cfg.rxled_pin, d.rxled_pin);

  // RF / TCXO flags from board preset (critical for PineDio / CH341)
  if (cfg.use_dio2_rf !== undefined) sxUseDio2Rf.value = Boolean(cfg.use_dio2_rf);
  if (cfg.use_dio3_tcxo !== undefined) sxUseDio3Tcxo.value = Boolean(cfg.use_dio3_tcxo);
  if (cfg.dio3_tcxo_voltage !== undefined) {
    sxDio3TcxoVoltage.value = asNumber(cfg.dio3_tcxo_voltage, 1.8);
  }
  if (cfg.is_waveshare !== undefined) sxIsWaveshare.value = Boolean(cfg.is_waveshare);

  if (selectedRadioType.value === 'sx1262_ch341') {
    ch341Vid.value = asNumber(cfg.vid, 6790);
    ch341Pid.value = asNumber(cfg.pid, 21778);
  }

  // Optional air settings embedded in some board presets (PineDio includes them).
  if (cfg.frequency !== undefined && cfg.frequency !== null && cfg.frequency !== '') {
    const freq = Number(cfg.frequency);
    if (Number.isFinite(freq)) {
      // Accept Hz or MHz
      airFrequencyMHz.value = freq > 10000 ? Number((freq / 1_000_000).toFixed(3)) : Number(freq.toFixed(3));
    }
  }
  if (cfg.spreading_factor !== undefined) airSpreadingFactor.value = asNumber(cfg.spreading_factor, airSpreadingFactor.value);
  if (cfg.bandwidth !== undefined) {
    const bw = Number(cfg.bandwidth);
    if (Number.isFinite(bw)) {
      airBandwidthKHz.value = bw > 1000 ? Number((bw / 1000).toFixed(1)) : Number(bw.toFixed(1));
    }
  }
  if (cfg.coding_rate !== undefined) airCodingRate.value = asNumber(cfg.coding_rate, airCodingRate.value);
  if (cfg.tx_power !== undefined) airTxPower.value = asNumber(cfg.tx_power, airTxPower.value);
  if (cfg.preamble_length !== undefined) {
    airPreambleLength.value = asNumber(cfg.preamble_length, airPreambleLength.value);
  }
  selectedAirPresetTitle.value = '';
}

function loadAirFormFromRadio(radio: Record<string, unknown> | undefined | null) {
  const r = (radio && typeof radio === 'object' ? radio : {}) as Record<string, unknown>;
  const legacy = (config.value.radio || {}) as Record<string, unknown>;
  const src = Object.keys(r).length ? r : legacy;
  airFrequencyMHz.value = src.frequency
    ? Number((Number(src.frequency) / 1_000_000).toFixed(3))
    : 869.618;
  airSpreadingFactor.value = asNumber(src.spreading_factor, 8);
  airBandwidthKHz.value = src.bandwidth
    ? Number((Number(src.bandwidth) / 1000).toFixed(1))
    : 62.5;
  airTxPower.value = asNumber(src.tx_power, 14);
  airCodingRate.value = asNumber(src.coding_rate, 8);
  airPreambleLength.value = asNumber(src.preamble_length, 32);
  selectedAirPresetTitle.value = '';
}

function applyAirPreset(title: string) {
  selectedAirPresetTitle.value = title;
  if (!title) return;
  const preset = setupStore.radioPresets.find((p) => p.title === title);
  if (!preset) return;
  airFrequencyMHz.value = preset.frequency ? Number(Number(preset.frequency).toFixed(3)) : airFrequencyMHz.value;
  airSpreadingFactor.value = preset.spreading_factor
    ? Number(preset.spreading_factor)
    : airSpreadingFactor.value;
  airBandwidthKHz.value = preset.bandwidth ? Number(Number(preset.bandwidth).toFixed(1)) : airBandwidthKHz.value;
  airCodingRate.value = preset.coding_rate ? Number(preset.coding_rate) : airCodingRate.value;
  if (preset.tx_power !== undefined && preset.tx_power !== '') {
    airTxPower.value = Number(preset.tx_power);
  }
}

function buildAirRadioFromForm(): Record<string, unknown> {
  return {
    frequency: Math.round(asNumber(airFrequencyMHz.value, 869.618) * 1_000_000),
    spreading_factor: asNumber(airSpreadingFactor.value, 8),
    bandwidth: Math.round(asNumber(airBandwidthKHz.value, 62.5) * 1000),
    tx_power: asNumber(airTxPower.value, 14),
    coding_rate: asNumber(airCodingRate.value, 8),
    preamble_length: asNumber(airPreambleLength.value, 32),
  };
}

function loadHardwareFormFromSections(sections: {
  radio_type?: unknown;
  radio?: Record<string, unknown>;
  kiss?: Record<string, unknown>;
  modem_usb?: Record<string, unknown>;
  modem_tcp?: Record<string, unknown>;
  sx1262?: Record<string, unknown>;
  ch341?: Record<string, unknown>;
}) {
  selectedRadioType.value = normalizeRadioType(sections.radio_type);
  loadAirFormFromRadio(sections.radio);
  const kiss = (sections.kiss ?? {}) as Record<string, unknown>;
  const modemUsb = (sections.modem_usb ?? {}) as Record<string, unknown>;
  const modemTcp = (sections.modem_tcp ?? {}) as Record<string, unknown>;
  const sx = (sections.sx1262 ?? {}) as Record<string, unknown>;
  const ch341 = (sections.ch341 ?? {}) as Record<string, unknown>;

  kissPort.value = asString(kiss.port, '/dev/ttyUSB0');
  kissBaudRate.value = asNumber(kiss.baud_rate, 9600);

  modemUsbPort.value = asString(modemUsb.port, '/dev/ttyACM0');
  modemUsbBaudRate.value = asNumber(modemUsb.baudrate, 921600);

  modemTcpHost.value = asString(modemTcp.host, '');
  modemTcpPort.value = asNumber(modemTcp.port, 5055);
  modemTcpToken.value = asString(modemTcp.token, '');

  const pinDefaults = defaultSxPins(selectedRadioType.value);
  sxBusId.value = pinNumber(sx.bus_id, pinDefaults.bus_id);
  sxCsId.value = pinNumber(sx.cs_id, pinDefaults.cs_id);
  sxCsPin.value = pinNumber(sx.cs_pin, pinDefaults.cs_pin);
  sxResetPin.value = pinNumber(sx.reset_pin, pinDefaults.reset_pin);
  sxBusyPin.value = pinNumber(sx.busy_pin, pinDefaults.busy_pin);
  sxIrqPin.value = pinNumber(sx.irq_pin, pinDefaults.irq_pin);
  sxTxEnPin.value = pinNumber(sx.txen_pin, pinDefaults.txen_pin);
  sxRxEnPin.value = pinNumber(sx.rxen_pin, pinDefaults.rxen_pin);
  sxEnPin.value = pinNumber(sx.en_pin, pinDefaults.en_pin);
  if (Array.isArray(sx.en_pins)) {
    sxEnPinsInput.value = sx.en_pins
      .map((pin) => Number(pin))
      .filter((pin) => Number.isFinite(pin))
      .join(', ');
  } else {
    sxEnPinsInput.value = '';
  }
  sxTxLedPin.value = pinNumber(sx.txled_pin, pinDefaults.txled_pin);
  sxRxLedPin.value = pinNumber(sx.rxled_pin, pinDefaults.rxled_pin);

  sxUseDio2Rf.value = Boolean(sx.use_dio2_rf ?? false);
  sxUseDio3Tcxo.value = Boolean(sx.use_dio3_tcxo ?? false);
  sxDio3TcxoVoltage.value = asNumber(sx.dio3_tcxo_voltage, 1.8);
  sxIsWaveshare.value = Boolean(sx.is_waveshare ?? false);

  ch341Vid.value = asNumber(ch341.vid, 6790);
  ch341Pid.value = asNumber(ch341.pid, 21778);
  ch341Bus.value =
    ch341.bus === undefined || ch341.bus === null || ch341.bus === ''
      ? null
      : asNumber(ch341.bus, 0);
  ch341Address.value =
    ch341.address === undefined || ch341.address === null || ch341.address === ''
      ? ch341.device_address === undefined || ch341.device_address === null || ch341.device_address === ''
        ? null
        : asNumber(ch341.device_address, 0)
      : asNumber(ch341.address, 0);
  ch341Serial.value = asString(ch341.serial_number ?? ch341.serial, '');
  selectedBoardPresetKey.value = '';
}

function loadFabricForm() {
  if (isDraftingMultiRadio.value) return;
  fabricDefaultRadio.value = defaultRadioId.value || '';
  const mode = String(txMode.value || 'default');
  fabricTxMode.value = mode === 'sticky' || mode === 'bridge' ? mode : 'default';
  fabricRepeatOnIngress.value = repeatOnIngress.value;
  fabricOriginTx.value = originTx.value;
  // Clamp here, not only in the legality watcher. A config written before the
  // fan-out rules were enforced can be illegal on arrival -- two radios,
  // tx_mode: default, repeat_on_ingress: true -- and neither watch source
  // changes during that hydration, so the watcher never runs. Without this the
  // form would show a checked *and* disabled box, then silently save it off.
  clampFanoutToLegal();
  fabricBaseline.value = fabricState.value;
}

function sectionsFromEntry(entry: Record<string, unknown> | null) {
  if (!entry) {
    return {
      radio_type: config.value.radio_type,
      radio: config.value.radio,
      kiss: config.value.kiss,
      modem_usb: config.value.modem_usb,
      modem_tcp: config.value.modem_tcp,
      sx1262: config.value.sx1262,
      ch341: config.value.ch341,
    };
  }
  return {
    radio_type: entry.radio_type,
    radio: (entry.radio as Record<string, unknown>) || {},
    kiss: (entry.kiss as Record<string, unknown>) || {},
    modem_usb: (entry.modem_usb as Record<string, unknown>) || {},
    modem_tcp: (entry.modem_tcp as Record<string, unknown>) || {},
    sx1262: (entry.sx1262 as Record<string, unknown>) || {},
    ch341: (entry.ch341 as Record<string, unknown>) || {},
  };
}

function selectWorkingRadio(id: string) {
  activePanel.value = 'radio';
  if (id === workingSelectedId.value) return;
  if (isDraftingMultiRadio.value) {
    // Persist in-progress form into the draft entry before switching.
    const payload = buildHardwarePayloadFromForm();
    if (!payload) return;
    const currentId = workingSelectedId.value;
    draftRadios.value = (draftRadios.value || []).map((entry) => {
      if (String(entry.id) !== currentId) return entry;
      return applyPayloadToEntry(entry, payload);
    });
    draftSelectedId.value = id;
    const entry = (draftRadios.value || []).find((r) => String(r.id) === id) || null;
    loadHardwareFormFromSections(sectionsFromEntry(entry));
    errorMessage.value = '';
    return;
  }
  // Keep this radio's edits for Save; a form back at its baseline keeps none.
  if (!stashFormEdits()) return;
  selectRadio(id);
  loadSelectedRadio();
}

/** Move the form's edits into pendingPayloads; false (errorMessage set) when invalid. */
function stashFormEdits(): boolean {
  const key = formKey.value;
  const others = { ...pendingPayloads.value };
  delete others[key];
  if (!formDirty.value) {
    pendingPayloads.value = others;
    return true;
  }
  const payload = buildHardwarePayloadFromForm();
  if (!payload) return false;
  pendingPayloads.value = { ...others, [key]: payload };
  errorMessage.value = '';
  return true;
}

/**
 * Load the selected radio from the saved config, record that as its baseline,
 * then put back any edits kept for it.
 */
function loadSelectedRadio() {
  const key = formKey.value;
  loadActiveHardwareAndAir();
  baselinePayloads.value = { ...baselinePayloads.value, [key]: JSON.stringify(buildPayload()) };
  const pending = pendingPayloads.value[key];
  const entry = radios.value.find((r) => r.id === key) as Record<string, unknown> | undefined;
  if (pending && entry) {
    loadHardwareFormFromSections(
      sectionsFromEntry(withInherited(applyPayloadToEntry({ ...entry }, pending))),
    );
  }
}

function loadActiveHardwareAndAir() {
  const entry = isMultiRadio.value
    ? (radios.value.find((r) => r.id === effectiveSelectedId.value) as Record<string, unknown> | undefined)
    : null;
  if (entry) {
    // An entry overlays the top-level sections key by key; load what the
    // repeater builds, not the entry alone, so an inherited port or a partial
    // radio section is not replaced by form defaults on the next save.
    loadHardwareFormFromSections(sectionsFromEntry(withInherited(entry)));
    return;
  }
  loadHardwareFormFromSections({
    radio_type: activeHardware.value.radio_type ?? config.value.radio_type,
    radio: config.value.radio,
    kiss: activeHardware.value.kiss,
    modem_usb: activeHardware.value.modem_usb,
    modem_tcp: activeHardware.value.modem_tcp,
    sx1262: activeHardware.value.sx1262,
    ch341: activeHardware.value.ch341,
  });
}

watch(
  config,
  () => {
    if (isDirty.value) return;
    ensureSelection();
    loadSelectedRadio();
    loadFabricForm();
  },
  { immediate: true },
);

watch(effectiveSelectedId, () => {
  if (isDirty.value) return;
  ensureSelection();
  loadSelectedRadio();
});

const currentRadioType = computed(() => {
  if (isDraftingMultiRadio.value) {
    return normalizeRadioType(workingSelectedEntry.value?.radio_type ?? selectedRadioType.value);
  }
  return normalizeRadioType(activeHardware.value.radio_type ?? config.value.radio_type);
});

/** Discard every unsaved change: drafts, kept edits, and the form's own. */
function cancelEditing() {
  draftRadios.value = null;
  draftSelectedId.value = '';
  pendingPayloads.value = {};
  errorMessage.value = '';
  useCustomSerialPath.value = false;
  selectedBoardPresetKey.value = '';
  selectedAirPresetTitle.value = '';
  ensureSelection();
  loadSelectedRadio();
  loadFabricForm();
}

function parseEnPins(input: string): number[] {
  return input
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => Number(p))
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
      hardwareOptions.value = normalizeModemHardwareOptions(legacyHardware as HardwareOption[]);
      return;
    }

    if (result.success && Array.isArray(result.data)) {
      hardwareOptions.value = normalizeModemHardwareOptions(result.data);
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

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function liveHardwareSections(): {
  radio_type: unknown;
  radio: Record<string, unknown>;
  sx1262: Record<string, unknown>;
  ch341: Record<string, unknown>;
  kiss: Record<string, unknown>;
  modem_usb: Record<string, unknown>;
  modem_tcp: Record<string, unknown>;
} {
  // Prefer the currently rendered single-radio form values when they look populated,
  // otherwise fall back to stats/config sections (nested or top-level).
  const fromConfig = {
    radio_type: config.value.radio_type,
    radio: cloneRecord(config.value.radio),
    sx1262: cloneRecord(config.value.sx1262),
    ch341: cloneRecord(config.value.ch341),
    kiss: cloneRecord(config.value.kiss),
    modem_usb: cloneRecord(config.value.modem_usb),
    modem_tcp: cloneRecord(config.value.modem_tcp),
  };

  // If form currently shows the live single-radio hardware, prefer form pins so we
  // never create a "local" entry with empty/missing GPIO after the user has been viewing them.
  const formSx = {
    bus_id: asNumber(sxBusId.value, 0),
    cs_id: asNumber(sxCsId.value, 0),
    cs_pin: asNumber(sxCsPin.value, -1),
    reset_pin: asNumber(sxResetPin.value, -1),
    busy_pin: asNumber(sxBusyPin.value, -1),
    irq_pin: asNumber(sxIrqPin.value, -1),
    txen_pin: asNumber(sxTxEnPin.value, -1),
    rxen_pin: asNumber(sxRxEnPin.value, -1),
    en_pin: asNumber(sxEnPin.value, -1),
    txled_pin: asNumber(sxTxLedPin.value, -1),
    rxled_pin: asNumber(sxRxLedPin.value, -1),
  };
  const parsedEn = parseEnPins(sxEnPinsInput.value);
  if (parsedEn.length) (formSx as any).en_pins = parsedEn;

  const formType = normalizeRadioType(
    selectedRadioType.value === 'none' ? fromConfig.radio_type : selectedRadioType.value,
  );
  const formHasPins = sxPinsConfigured(formSx as Record<string, unknown>, formType);
  const cfgType = normalizeRadioType(fromConfig.radio_type);
  const cfgHasPins = sxPinsConfigured(fromConfig.sx1262, cfgType);

  if (formHasPins && !isDraftingMultiRadio.value) {
    fromConfig.sx1262 = formSx as Record<string, unknown>;
    fromConfig.radio_type = selectedRadioType.value === 'none' ? null : selectedRadioType.value;
  } else if (!cfgHasPins && formHasPins) {
    fromConfig.sx1262 = formSx as Record<string, unknown>;
  }

  // CH341 form location fields
  if (selectedRadioType.value === 'sx1262_ch341' || normalizeRadioType(fromConfig.radio_type) === 'sx1262_ch341') {
    const ch = { ...fromConfig.ch341 };
    if (!Object.keys(ch).length || ch341Vid.value) {
      ch.vid = asNumber(ch341Vid.value, asNumber(ch.vid, 6790));
      ch.pid = asNumber(ch341Pid.value, asNumber(ch.pid, 21778));
      if (ch341Bus.value !== null && ch341Bus.value !== undefined) ch.bus = asNumber(ch341Bus.value, 0);
      if (ch341Address.value !== null && ch341Address.value !== undefined) {
        ch.address = asNumber(ch341Address.value, 0);
      }
      if (ch341Serial.value.trim()) ch.serial_number = ch341Serial.value.trim();
      fromConfig.ch341 = ch;
    }
  }

  return fromConfig;
}

function buildLegacyRadioEntry(id: string): Record<string, unknown> {
  const live = liveHardwareSections();
  const entry: Record<string, unknown> = {
    id,
    radio_type: live.radio_type ?? config.value.radio_type ?? null,
  };
  if (Object.keys(live.radio).length) entry.radio = live.radio;
  else {
    const radio = cloneRecord(config.value.radio);
    if (Object.keys(radio).length) entry.radio = radio;
  }
  if (Object.keys(live.sx1262).length) entry.sx1262 = live.sx1262;
  if (Object.keys(live.ch341).length) entry.ch341 = live.ch341;
  if (Object.keys(live.kiss).length) entry.kiss = live.kiss;
  if (Object.keys(live.modem_usb).length) entry.modem_usb = live.modem_usb;
  if (Object.keys(live.modem_tcp).length) entry.modem_tcp = live.modem_tcp;
  return entry;
}

/** Second radio shell: keep air defaults, but do NOT clone SPI/GPIO pins. */
function buildSecondaryRadioShell(id: string): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id,
    radio_type: config.value.radio_type ?? null,
  };
  const radio = cloneRecord(config.value.radio);
  if (Object.keys(radio).length) entry.radio = radio;

  // Prefer explicit type if caller already set entry.radio_type.
  const rtype = normalizeRadioType(entry.radio_type ?? config.value.radio_type);
  if (rtype === 'sx1262' || rtype === 'sx1262_ch341') {
    // Seed with board-family defaults so CH341/PineDio is immediately valid.
    // Operator can still change pins / pick a board preset before save.
    const pins = defaultSxPins(rtype);
    // Prefer PineDio / named CH341 presets when available, else first matching type.
    const preset =
      hardwareOptions.value.find((opt) => {
        if (getHardwareRadioType(opt) !== rtype) return false;
        const k = String(opt.key || '').toLowerCase();
        const n = String(opt.name || '').toLowerCase();
        return k.includes('pinedio') || n.includes('pinedio');
      }) ||
      hardwareOptions.value.find((opt) => {
        if (getHardwareRadioType(opt) !== rtype) return false;
        const k = String(opt.key || '').toLowerCase();
        return k.includes('ch341') || k.includes('usb');
      }) ||
      hardwareOptions.value.find((opt) => getHardwareRadioType(opt) === rtype);
    const cfg = (preset?.config || {}) as Record<string, unknown>;
    entry.sx1262 = {
      bus_id: pinNumber(cfg.bus_id, pins.bus_id),
      cs_id: pinNumber(cfg.cs_id, pins.cs_id),
      cs_pin: pinNumber(cfg.cs_pin, pins.cs_pin),
      reset_pin: pinNumber(cfg.reset_pin, pins.reset_pin),
      busy_pin: pinNumber(cfg.busy_pin, pins.busy_pin),
      irq_pin: pinNumber(cfg.irq_pin, pins.irq_pin),
      txen_pin: pinNumber(cfg.txen_pin, pins.txen_pin),
      rxen_pin: pinNumber(cfg.rxen_pin, pins.rxen_pin),
      en_pin: pinNumber(cfg.en_pin, pins.en_pin),
      txled_pin: pinNumber(cfg.txled_pin, pins.txled_pin),
      rxled_pin: pinNumber(cfg.rxled_pin, pins.rxled_pin),
    };
    if (rtype === 'sx1262_ch341') {
      // Carry TCXO/RF flags from preset when present.
      for (const key of ['use_dio2_rf', 'use_dio3_tcxo', 'dio3_tcxo_voltage', 'is_waveshare'] as const) {
        if (cfg[key] !== undefined) (entry.sx1262 as any)[key] = cfg[key];
      }
    }
  }
  if (rtype === 'sx1262_ch341') {
    const ch = cloneRecord(config.value.ch341);
    delete ch.bus;
    delete ch.address;
    delete ch.device_address;
    delete ch.serial_number;
    delete ch.serial;
    // Prefer VID/PID from board preset (PineDio) when available.
    const presetCfg = (hardwareOptions.value.find((opt) => {
      if (getHardwareRadioType(opt) !== 'sx1262_ch341') return false;
      const k = String(opt.key || '').toLowerCase();
      const n = String(opt.name || '').toLowerCase();
      return k.includes('pinedio') || n.includes('pinedio');
    })?.config || {}) as Record<string, unknown>;
    entry.ch341 = {
      vid: asNumber(presetCfg.vid ?? ch.vid, 6790),
      pid: asNumber(presetCfg.pid ?? ch.pid, 21778),
    };
    // Also seed air settings from PineDio board preset when present.
    if (presetCfg.frequency !== undefined) {
      const freq = Number(presetCfg.frequency);
      if (Number.isFinite(freq)) {
        const radio = (entry.radio as Record<string, unknown>) || {};
        radio.frequency = freq > 10000 ? Math.round(freq) : Math.round(freq * 1_000_000);
        if (presetCfg.tx_power !== undefined) radio.tx_power = asNumber(presetCfg.tx_power, 22);
        if (presetCfg.spreading_factor !== undefined) radio.spreading_factor = asNumber(presetCfg.spreading_factor, 8);
        if (presetCfg.bandwidth !== undefined) {
          const bw = Number(presetCfg.bandwidth);
          radio.bandwidth = bw > 1000 ? Math.round(bw) : Math.round(bw * 1000);
        }
        if (presetCfg.coding_rate !== undefined) radio.coding_rate = asNumber(presetCfg.coding_rate, 8);
        if (presetCfg.preamble_length !== undefined) {
          radio.preamble_length = asNumber(presetCfg.preamble_length, 17);
        }
        entry.radio = radio;
      }
    }
  }
  if (rtype === 'kiss') {
    entry.kiss = { port: '', baud_rate: asNumber(config.value.kiss?.baud_rate, 9600) };
  }
  if (rtype === 'modem_usb') {
    entry.modem_usb = { port: '', baudrate: asNumber(config.value.modem_usb?.baudrate, 921600) };
  }
  if (rtype === 'modem_tcp') {
    entry.modem_tcp = { host: '', port: asNumber(config.value.modem_tcp?.port, 5055), token: '' };
  }
  return entry;
}

function nextUniqueRadioId(preferred = 'link'): string {
  const used = new Set(workingRadios.value.map((r) => String(r.id || '')));
  if (!used.has(preferred)) return preferred;
  let i = 2;
  while (used.has(`${preferred}${i}`)) i += 1;
  return `${preferred}${i}`;
}

/**
 * The stored fabric section minus local_tx_mode.
 *
 * local_tx_mode is origin_tx's former name, and the backend rejects a config
 * that sets both to different modes. Carrying a stale one forward beside a
 * fresh origin_tx is exactly that config, so it is dropped on the way out.
 */
function carriedFabric(): Record<string, unknown> {
  const carried: Record<string, unknown> = { ...(fabric.value || {}) };
  delete carried.local_tx_mode;
  return carried;
}

function buildFabricPayload(nextRadios: Array<Record<string, unknown>>, mode?: string) {
  const ids = nextRadios.map((r) => String(r.id || '')).filter(Boolean);
  const preferred =
    fabricDefaultRadio.value && ids.includes(fabricDefaultRadio.value)
      ? fabricDefaultRadio.value
      : ids[0] || 'radio0';
  // Named nextTxMode, not txMode: that name is the composable's saved-state
  // computed in this file's scope.
  const nextTxMode = (mode || fabricTxMode.value || 'default') as 'default' | 'sticky' | 'bridge';
  const twoRadios = ids.length === 2;

  return {
    ...carriedFabric(),
    default_radio: preferred,
    tx_mode: nextTxMode,
    // Re-derive from the payload's own radio list rather than the form's
    // gating: a save that adds or removes a radio changes what is legal in the
    // same request that writes it.
    repeat_on_ingress: fabricRepeatOnIngress.value && nextTxMode === 'bridge' && twoRadios,
    origin_tx: fabricOriginTx.value === 'all' && twoRadios ? 'all' : 'default',
  };
}

function mirrorDefaultRadioToLegacy(
  importBody: Record<string, unknown>,
  nextRadios: Array<Record<string, unknown>>,
) {
  const fabricCfg = (importBody.fabric || {}) as Record<string, unknown>;
  const defId = String(fabricCfg.default_radio || nextRadios[0]?.id || '');
  const defEntry = nextRadios.find((r) => String(r.id) === defId);
  if (!defEntry) return;
  importBody.radio_type = defEntry.radio_type ?? null;
  if (defEntry.sx1262) importBody.sx1262 = defEntry.sx1262;
  if (defEntry.ch341) importBody.ch341 = defEntry.ch341;
  if (defEntry.kiss) importBody.kiss = defEntry.kiss;
  if (defEntry.modem_usb) importBody.modem_usb = defEntry.modem_usb;
  if (defEntry.modem_tcp) importBody.modem_tcp = defEntry.modem_tcp;
  if (defEntry.radio) importBody.radio = defEntry.radio;
}

function collectUsedPins(sx: Record<string, unknown>): number[] {
  const keys = [
    'cs_pin',
    'reset_pin',
    'busy_pin',
    'irq_pin',
    'txen_pin',
    'rxen_pin',
    'en_pin',
    'txled_pin',
    'rxled_pin',
  ];
  const pins: number[] = [];
  for (const k of keys) {
    const n = Number(sx[k]);
    if (Number.isFinite(n) && n >= 0) pins.push(n);
  }
  if (Array.isArray(sx.en_pins)) {
    for (const p of sx.en_pins) {
      const n = Number(p);
      if (Number.isFinite(n) && n >= 0) pins.push(n);
    }
  }
  return pins;
}

/** CH341 pin numbers are per-adapter (GPIO 0-15 on that USB device), not global BCM. */
function ch341DeviceKey(ch: Record<string, unknown>): string {
  const bus = ch.bus;
  const addr = ch.address ?? ch.device_address;
  const serial = String(ch.serial_number ?? ch.serial ?? '').trim();
  if (serial) return `serial:${serial}`;
  const hasBus = !(bus === undefined || bus === null || bus === '');
  const hasAddr = !(addr === undefined || addr === null || addr === '');
  if (hasBus || hasAddr) return `loc:${asNumber(bus, -1)}:${asNumber(addr, -1)}`;
  return 'auto';
}

function validateMultiRadioHardware(
  nextRadios: Array<Record<string, unknown>>,
): { message: string; radioId?: string } | null {
  if (nextRadios.length < 2) {
    return { message: 'Multi-radio requires at least two radios before saving.' };
  }

  // Pin ownership is scoped:
  //  - native sx1262: global BCM namespace "bcm:<pin>"
  //  - CH341: per USB adapter "ch341:<deviceKey>:<pin>" (two adapters may both use pin 0)
  const pinOwners = new Map<string, string>();
  const spiOwners = new Map<string, string>();
  const ch341Owners = new Map<string, string>();
  const serialOwners = new Map<string, string>();

  // USB location is only required when 2+ CH341 radios must be disambiguated.
  // A single CH341 entry may omit bus/address/serial and bind the only adapter.
  const ch341Count = nextRadios.filter(
    (e) => normalizeRadioType(e.radio_type) === 'sx1262_ch341',
  ).length;

  for (const entry of nextRadios) {
    const id = String(entry.id || '?');
    const rtype = normalizeRadioType(entry.radio_type);

    if (rtype === 'sx1262' || rtype === 'sx1262_ch341') {
      const sx = (entry.sx1262 as Record<string, unknown>) || {};
      // Required:
      //  - busy_pin, irq_pin always >= 0
      //  - reset_pin >= 0 for native sx1262; CH341 may use -1 (PineDio has no reset line)
      //  - cs_pin may be -1 (native SPI CS / unused)
      if (!sxPinsConfigured(sx, rtype)) {
        const hint =
          rtype === 'sx1262_ch341'
            ? 'For CH341/PineDio set Busy + IRQ (CH341 GPIO indices). Reset may be -1 on PineDio. Prefer board preset "PineDio CH341 + SX1262".'
            : 'Set Reset, Busy, and IRQ. CS Pin may stay -1 for native SPI CS (bus/cs id).';
        return {
          radioId: id,
          message:
            `Hardware for radio "${id}" is incomplete. ${hint} ` +
            `Select "${id}" and edit section 2 · Hardware, then Save.`,
        };
      }
      const csPin = Number(sx.cs_pin);
      if (sx.cs_pin !== undefined && sx.cs_pin !== null && sx.cs_pin !== '') {
        if (!Number.isFinite(csPin) || csPin < -1) {
          return {
            radioId: id,
            message: `Hardware for radio "${id}": cs_pin must be -1 (native/unused CS) or a GPIO >= 0.`,
          };
        }
      }

      // Scope pin collisions correctly for the backend.
      let pinScope = 'bcm';
      if (rtype === 'sx1262_ch341') {
        const ch = (entry.ch341 as Record<string, unknown>) || {};
        pinScope = `ch341:${ch341DeviceKey(ch)}`;
      }
      for (const pin of collectUsedPins(sx)) {
        const scopeKey = `${pinScope}:${pin}`;
        const prev = pinOwners.get(scopeKey);
        if (prev && prev !== id) {
          const msg =
            rtype === 'sx1262_ch341'
              ? `CH341 GPIO ${pin} is used by both "${prev}" and "${id}" on the same USB adapter. ` +
                `Either use different CH341 pins on that adapter, or set distinct USB bus/address/serial so each radio is a different adapter (same pin numbers on different CH341s are OK).`
              : `GPIO pin ${pin} is used by both "${prev}" and "${id}". Each native sx1262 radio needs distinct BCM pins.`;
          return { radioId: id, message: msg };
        }
        pinOwners.set(scopeKey, id);
      }

      if (rtype === 'sx1262') {
        const bus = asNumber(sx.bus_id, 0);
        const cs = asNumber(sx.cs_id, 0);
        const key = `${bus}:${cs}`;
        const prev = spiOwners.get(key);
        if (prev && prev !== id) {
          return {
            radioId: id,
            message: `SPI bus ${bus} CS ${cs} is used by both "${prev}" and "${id}". Choose a different CS for "${id}".`,
          };
        }
        spiOwners.set(key, id);
      }
    }

    if (rtype === 'sx1262_ch341') {
      const ch = (entry.ch341 as Record<string, unknown>) || {};
      const key = ch341DeviceKey(ch);
      const hasLocation = key !== 'auto';

      // Only require USB location when multiple CH341 radios are configured.
      if (ch341Count >= 2 && !hasLocation) {
        return {
          radioId: id,
          message:
            `Hardware for radio "${id}" (sx1262_ch341): with ${ch341Count} CH341 radios, set USB bus/address or serial_number so each adapter is unique. ` +
            `Pin numbers are per-adapter (both may use CS=0 once devices differ).`,
        };
      }

      // Collision check: two CH341 entries must not resolve to the same USB device.
      const prev = ch341Owners.get(key);
      if (prev && prev !== id) {
        return {
          radioId: id,
          message:
            key === 'auto'
              ? `Radios "${prev}" and "${id}" both use sx1262_ch341 without USB location — set distinct bus/address or serial on each.`
              : `CH341 device ${key} is used by both "${prev}" and "${id}". Each radio needs its own USB adapter location.`,
        };
      }
      ch341Owners.set(key, id);
    }

    if (rtype === 'kiss' || rtype === 'modem_usb') {
      const section = (rtype === 'kiss' ? entry.kiss : entry.modem_usb) as Record<string, unknown> | undefined;
      const port = String(section?.port || '').trim();
      if (!port) {
        return {
          radioId: id,
          message: `Hardware for radio "${id}": set a serial port before saving.`,
        };
      }
      const prev = serialOwners.get(port);
      if (prev && prev !== id) {
        return {
          radioId: id,
          message: `Serial port ${port} is used by both "${prev}" and "${id}".`,
        };
      }
      serialOwners.set(port, id);
    }

    if (rtype === 'modem_tcp') {
      const tcp = (entry.modem_tcp as Record<string, unknown>) || {};
      if (!String(tcp.host || '').trim()) {
        return {
          radioId: id,
          message: `Hardware for radio "${id}": set a TCP host before saving.`,
        };
      }
    }
  }
  return null;
}

/** Why the form cannot be saved as it stands, or ''. */
function formValidationError(): string {
  if (selectedRadioType.value === 'modem_tcp' && !modemTcpHost.value.trim()) {
    return 'TCP modem host is required for modem_tcp';
  }
  if (showMultiRadioChrome.value) {
    const freq = asNumber(airFrequencyMHz.value, 0);
    const txp = asNumber(airTxPower.value, 0);
    const sf = asNumber(airSpreadingFactor.value, 0);
    const cr = asNumber(airCodingRate.value, 0);
    if (freq < 100 || freq > 1000) return 'Frequency must be between 100 and 1000 MHz';
    if (txp < -9 || txp > 30) return 'TX Power must be between -9 and +30 dBm';
    if (sf < 5 || sf > 12) return 'Spreading factor must be 5-12';
    if (cr < 5 || cr > 8) return 'Coding rate must be 5-8';
  }
  return '';
}

/** The form's hardware payload after checking it; null (and errorMessage set) when invalid. */
function buildHardwarePayloadFromForm(): Record<string, unknown> | null {
  const error = formValidationError();
  if (error) {
    errorMessage.value = error;
    return null;
  }
  return buildPayload();
}

/** The form's hardware payload as it stands, unchecked. */
function buildPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    radio_type: selectedRadioType.value === 'none' ? null : selectedRadioType.value,
  };

  if (showMultiRadioChrome.value) {
    payload.radio = buildAirRadioFromForm();
  }

  if (selectedRadioType.value === 'kiss') {
    payload.kiss = {
      port: kissPort.value.trim() || '/dev/ttyUSB0',
      baud_rate: asNumber(kissBaudRate.value, 9600),
    };
  }

  if (selectedRadioType.value === 'modem_usb') {
    payload.modem_usb = {
      port: modemUsbPort.value.trim() || '/dev/ttyACM0',
      baudrate: asNumber(modemUsbBaudRate.value, 921600),
    };
  }

  if (selectedRadioType.value === 'modem_tcp') {
    const token = modemTcpToken.value.trim();
    payload.modem_tcp = {
      host: modemTcpHost.value.trim(),
      port: asNumber(modemTcpPort.value, 5055),
      ...(token ? { token } : {}),
    };
  }

  if (selectedRadioType.value === 'sx1262' || selectedRadioType.value === 'sx1262_ch341') {
    const d = defaultSxPins(selectedRadioType.value);
    const csPin = pinNumber(sxCsPin.value, d.cs_pin);
    // Drop EN pins that are unused (-1) or collide with CS (PineDio CS=0 must not be EN).
    const parsedEnPins = parseEnPins(sxEnPinsInput.value).filter(
      (pin) => pin >= 0 && pin !== csPin,
    );
    let enPin = pinNumber(sxEnPin.value, d.en_pin);
    if (enPin === csPin) enPin = -1;
    payload.sx1262 = {
      bus_id: pinNumber(sxBusId.value, d.bus_id),
      cs_id: pinNumber(sxCsId.value, d.cs_id),
      cs_pin: csPin,
      reset_pin: pinNumber(sxResetPin.value, d.reset_pin),
      busy_pin: pinNumber(sxBusyPin.value, d.busy_pin),
      irq_pin: pinNumber(sxIrqPin.value, d.irq_pin),
      txen_pin: pinNumber(sxTxEnPin.value, d.txen_pin),
      rxen_pin: pinNumber(sxRxEnPin.value, d.rxen_pin),
      ...(parsedEnPins.length > 0 ? { en_pins: parsedEnPins } : { en_pin: enPin }),
      txled_pin: pinNumber(sxTxLedPin.value, d.txled_pin),
      rxled_pin: pinNumber(sxRxLedPin.value, d.rxled_pin),
      use_dio2_rf: sxUseDio2Rf.value,
      use_dio3_tcxo: sxUseDio3Tcxo.value,
      dio3_tcxo_voltage: sxDio3TcxoVoltage.value,
      is_waveshare: sxIsWaveshare.value,
    };
  }

  if (selectedRadioType.value === 'sx1262_ch341') {
    const ch341Payload: Record<string, unknown> = {
      vid: asNumber(ch341Vid.value, 6790),
      pid: asNumber(ch341Pid.value, 21778),
    };
    if (ch341Bus.value !== null && ch341Bus.value !== undefined) {
      ch341Payload.bus = asNumber(ch341Bus.value, 0);
    }
    if (ch341Address.value !== null && ch341Address.value !== undefined) {
      ch341Payload.address = asNumber(ch341Address.value, 0);
    }
    if (ch341Serial.value.trim()) {
      ch341Payload.serial_number = ch341Serial.value.trim();
    }
    payload.ch341 = ch341Payload;
  }

  return payload;
}

// Radio types with RF front-end controls, and the config section each one keeps
// its AGC/FEM keys in (the repeater's radio_frontend_config reads the same ones).
const FRONTEND_SECTIONS: Partial<Record<SupportedRadioType, 'kiss' | 'modem_usb' | 'modem_tcp'>> = {
  kiss: 'kiss',
  modem_usb: 'modem_usb',
  modem_tcp: 'modem_tcp',
};
const FRONTEND_KEYS = [
  'agc_reset_interval_seconds',
  'fem_rx_gain',
  'fem_tx_gain',
  'rx_boosted_gain',
] as const;

function frontendKeysOf(section: unknown): Record<string, unknown> {
  if (!section || typeof section !== 'object') return {};
  const source = section as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of FRONTEND_KEYS) if (key in source) kept[key] = source[key];
  return kept;
}

/**
 * Write a radio's confirmed front-end values into a save body.
 *
 * A radios[] entry is replaced whole on import, so an entry built before the
 * front end was applied would put the old AGC/FEM values back. The default
 * radio's entry is mirrored into the top-level section, which is merged key by
 * key and would do the same; another radio's entry is not mirrored.
 */
function overlayFrontendConfigured(
  importBody: Record<string, unknown>,
  configured: Record<string, unknown>,
  radioId: string,
) {
  const entries = importBody.radios;
  if (!Array.isArray(entries)) return;
  const fabricCfg = (importBody.fabric || {}) as Record<string, unknown>;
  const defId = String(fabricCfg.default_radio || entries[0]?.id || '');
  const targetId = radioId || defId;
  const index = entries.findIndex((r) => String((r as Record<string, unknown>).id) === targetId);
  if (index < 0) return;
  const entry = { ...(entries[index] as Record<string, unknown>) };
  const name = FRONTEND_SECTIONS[normalizeRadioType(entry.radio_type)];
  if (!name) return;
  const section = { ...((entry[name] as Record<string, unknown>) || {}) };
  for (const key of FRONTEND_KEYS) delete section[key];
  Object.assign(section, frontendKeysOf(configured));
  entry[name] = section;
  importBody.radios = entries.map((r, i) => (i === index ? entry : r));
  if (targetId === defId && importBody[name] && typeof importBody[name] === 'object') {
    importBody[name] = { ...(importBody[name] as Record<string, unknown>), ...section };
    for (const key of FRONTEND_KEYS) {
      if (!(key in section)) delete (importBody[name] as Record<string, unknown>)[key];
    }
  }
}

/**
 * Write front-end values the modems confirmed since the last save into a save
 * body, so entries built from a config read before those applies do not put
 * the old values back.
 */
function overlayLiveFrontend(importBody: Record<string, unknown>) {
  for (const [radioId, configured] of Object.entries(liveConfigured.value)) {
    overlayFrontendConfigured(importBody, configured, radioId);
  }
}

/** A live front-end apply is in flight; Save waits for it so its body carries the result. */
const frontendBusy = ref(false);

function onFrontendApplied(configured: Record<string, unknown>, radioId: string | undefined) {
  liveConfigured.value = { ...liveConfigured.value, [radioId ?? '']: configured };
  void systemStore.fetchStats({ fresh: true });
}

function applyPayloadToEntry(
  entry: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const updated: Record<string, unknown> = {
    ...entry,
    id: entry.id,
    radio_type: payload.radio_type ?? null,
  };
  delete updated.sx1262;
  delete updated.ch341;
  delete updated.kiss;
  delete updated.modem_usb;
  delete updated.modem_tcp;
  if (payload.sx1262) updated.sx1262 = payload.sx1262;
  if (payload.ch341) updated.ch341 = payload.ch341;
  if (payload.kiss) {
    // The form only edits port/baud; keep the entry's other KISS tuning (CSMA,
    // AGC/FEM front end) when the radio stays a KISS modem.
    const previous = entry.kiss;
    const keep =
      normalizeRadioType(entry.radio_type) === 'kiss' && previous && typeof previous === 'object'
        ? (previous as Record<string, unknown>)
        : {};
    updated.kiss = { ...keep, ...(payload.kiss as Record<string, unknown>) };
  }
  // The modem forms edit only the transport; keep the entry's AGC/FEM front end
  // when the radio stays the same kind of modem.
  const previousType = normalizeRadioType(entry.radio_type);
  if (payload.modem_usb) {
    const keep = previousType === 'modem_usb' ? frontendKeysOf(entry.modem_usb) : {};
    updated.modem_usb = { ...keep, ...(payload.modem_usb as Record<string, unknown>) };
  }
  if (payload.modem_tcp) {
    const keep = previousType === 'modem_tcp' ? frontendKeysOf(entry.modem_tcp) : {};
    updated.modem_tcp = { ...keep, ...(payload.modem_tcp as Record<string, unknown>) };
  }
  // Air settings: prefer form payload.radio, else keep existing entry.radio.
  if (payload.radio && typeof payload.radio === 'object') {
    updated.radio = payload.radio;
  } else if (entry.radio) {
    updated.radio = entry.radio;
  }
  return updated;
}

/** Save body for an existing single- or multi-radio node (not a multi-radio draft). */
function existingSaveBody(payload: Record<string, unknown>): Record<string, unknown> {
  if (isMultiRadio.value && effectiveSelectedId.value) {
    // Existing multi-radio: the selected radio's form, plus edits kept for others.
    const nextRadios = radios.value.map((entry) => {
      const edits =
        entry.id === effectiveSelectedId.value ? payload : pendingPayloads.value[entry.id];
      if (!edits) return { ...entry } as Record<string, unknown>;
      return applyPayloadToEntry({ ...entry } as Record<string, unknown>, edits);
    });
    const importBody: Record<string, unknown> = {
      radios: nextRadios,
      fabric: buildFabricPayload(nextRadios),
    };
    mirrorDefaultRadioToLegacy(importBody, nextRadios);
    return importBody;
  }
  // Legacy single-radio hardware save.
  return payload;
}

async function persistImportBody(importBody: Record<string, unknown>): Promise<boolean> {
  multiRadioBusy.value = true;
  errorMessage.value = '';
  try {
    const result = await ApiService.importConfig(importBody);
    if (!result.success) {
      errorMessage.value = result.error || 'Failed to save settings';
      return false;
    }
    draftRadios.value = null;
    draftSelectedId.value = '';
    pendingPayloads.value = {};
    await systemStore.fetchStats({ fresh: true });
    liveConfigured.value = {};
    ensureSelection();
    loadSelectedRadio();
    loadFabricForm();
    showRestartModal.value = true;
    return true;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } }; message?: string };
    errorMessage.value = e.response?.data?.error || e.message || 'Failed to save settings';
    return false;
  } finally {
    multiRadioBusy.value = false;
  }
}

function enableMultiRadio() {
  if (isDirty.value && !isDraftingMultiRadio.value) {
    errorMessage.value = 'Save or discard your changes before adding a second radio.';
    return;
  }
  errorMessage.value = '';
  const primary = buildLegacyRadioEntry('local');
  const secondaryId = nextUniqueRadioId('link');
  const secondary = buildSecondaryRadioShell(secondaryId);
  draftRadios.value = [primary, secondary];
  draftSelectedId.value = secondaryId;
  fabricDefaultRadio.value = 'local';
  fabricTxMode.value = 'bridge';
  activePanel.value = 'radio';
  if (setupStore.radioPresets.length === 0) {
    void setupStore.fetchRadioPresets();
  }
  loadHardwareFormFromSections(sectionsFromEntry(secondary));
}

/** The radios as edited so far: the draft, else the saved radios with kept and form edits. */
function editedRadios(): Array<Record<string, unknown>> | null {
  if (draftRadios.value) {
    const payload = buildHardwarePayloadFromForm();
    if (!payload) return null;
    const currentId = workingSelectedId.value;
    draftRadios.value = draftRadios.value.map((entry) =>
      String(entry.id) === currentId ? applyPayloadToEntry(entry, payload) : entry,
    );
    return draftRadios.value.map((r) => ({ ...r }));
  }
  if (!stashFormEdits()) return null;
  return radios.value.map((entry) => {
    const edits = pendingPayloads.value[entry.id];
    const copy = { ...entry } as Record<string, unknown>;
    return edits ? applyPayloadToEntry(copy, edits) : copy;
  });
}

function addRadioEntry() {
  errorMessage.value = '';
  const base = editedRadios();
  if (!base) return;
  if (!base.length) {
    enableMultiRadio();
    return;
  }
  const raw = newRadioId.value.trim() || nextUniqueRadioId('radio');
  const id = raw.replace(/\s+/g, '_');
  if (!id) {
    errorMessage.value = 'Radio id is required';
    return;
  }
  if (base.some((r) => String(r.id) === id)) {
    errorMessage.value = `Radio id ${id} already exists`;
    return;
  }
  // Keep draft local; operator must configure hardware then Save.
  if (!draftRadios.value) {
    draftRadios.value = base;
  }
  const shell = buildSecondaryRadioShell(id);
  draftRadios.value = [...(draftRadios.value || base), shell];
  draftSelectedId.value = id;
  newRadioId.value = '';
  activePanel.value = 'radio';
  loadHardwareFormFromSections(sectionsFromEntry(shell));
}

function removeSelectedRadio() {
  if (!showMultiRadioChrome.value || !workingSelectedId.value) return;
  errorMessage.value = '';
  const removedId = workingSelectedId.value;
  const base = editedRadios();
  if (!base) return;
  if (base.length <= 2) {
    // Exit multi-radio: draft clear if only local draft, else mark disable via empty draft sentinel.
    if (isDraftingMultiRadio.value && !isMultiRadio.value) {
      cancelEditing();
      return;
    }
    draftRadios.value = [];
    draftSelectedId.value = '';
    return;
  }
  const next = base.filter((r) => String(r.id) !== removedId);
  draftRadios.value = next;
  const nextSelect = String(next[0]?.id || '');
  draftSelectedId.value = nextSelect;
  if (fabricDefaultRadio.value === removedId) {
    fabricDefaultRadio.value = nextSelect;
  }
  loadHardwareFormFromSections(sectionsFromEntry(next[0] || null));
}

function disableMultiRadio() {
  if (isDraftingMultiRadio.value && !isMultiRadio.value) {
    cancelEditing();
    return;
  }
  // Stage disable; applied on Save Changes.
  draftRadios.value = [];
  draftSelectedId.value = '';
  errorMessage.value = '';
  loadHardwareFormFromSections({
    radio_type: config.value.radio_type,
    radio: config.value.radio,
    kiss: config.value.kiss,
    modem_usb: config.value.modem_usb,
    modem_tcp: config.value.modem_tcp,
    sx1262: config.value.sx1262,
    ch341: config.value.ch341,
  });
}

async function saveChanges(): Promise<boolean> {
  if (frontendBusy.value) return false;
  isSaving.value = true;
  errorMessage.value = '';

  try {
    // Staged disable multi-radio (draftRadios === []).
    if (draftRadios.value && draftRadios.value.length === 0) {
      // Clearing radios leaves the fan-out options describing a fabric that no
      // longer exists, and the backend rejects a one-radio node that still asks
      // to repeat on ingress. Drop them with the radios they belonged to.
      const ok = await persistImportBody({
        radios: null,
        fabric: { ...carriedFabric(), repeat_on_ingress: false, origin_tx: 'default' },
      });
      return ok;
    }

    const payload = buildHardwarePayloadFromForm();
    if (!payload) return false;

    // Draft multi-radio enable / membership edit.
    if (isDraftingMultiRadio.value && draftRadios.value && draftRadios.value.length > 0) {
      const selectedId = workingSelectedId.value;
      let nextRadios = draftRadios.value.map((entry) => {
        if (String(entry.id) !== selectedId) return { ...entry };
        return applyPayloadToEntry(entry, payload);
      });

      // Heal primary radios that still have empty GPIO by copying live single-radio hardware.
      // (Happens if draft was created before form/config pins were available.)
      nextRadios = nextRadios.map((entry) => {
        const id = String(entry.id || '');
        const rtype = normalizeRadioType(entry.radio_type);
        if (rtype !== 'sx1262' && rtype !== 'sx1262_ch341') return entry;
        const sx = (entry.sx1262 as Record<string, unknown>) || {};
        if (sxPinsConfigured(sx, rtype)) return entry;
        // Only auto-heal non-selected radios from live config (selected uses the form).
        if (id === selectedId) return entry;
        const live = liveHardwareSections();
        const liveType = normalizeRadioType(live.radio_type ?? rtype);
        if (!sxPinsConfigured(live.sx1262, liveType === 'sx1262_ch341' ? 'sx1262_ch341' : rtype)) {
          return entry;
        }
        return {
          ...entry,
          sx1262: { ...live.sx1262 },
          ...(Object.keys(live.ch341).length ? { ch341: { ...live.ch341 } } : {}),
          radio_type: entry.radio_type ?? live.radio_type,
        };
      });

      draftRadios.value = nextRadios;

      const conflict = validateMultiRadioHardware(nextRadios.map(withInherited));
      if (conflict) {
        errorMessage.value = conflict.message;
        if (conflict.radioId) {
          // Jump UI to the radio that still needs hardware.
          draftSelectedId.value = conflict.radioId;
          const entry = nextRadios.find((r) => String(r.id) === conflict.radioId) || null;
          loadHardwareFormFromSections(sectionsFromEntry(entry));
        }
        return false;
      }

      const importBody: Record<string, unknown> = {
        radios: nextRadios,
        fabric: buildFabricPayload(nextRadios),
      };
      mirrorDefaultRadioToLegacy(importBody, nextRadios);
      overlayLiveFrontend(importBody);
      return await persistImportBody(importBody);
    }

    const importBody = existingSaveBody(payload);
    if (isMultiRadio.value && effectiveSelectedId.value) {
      const conflict = validateMultiRadioHardware(
        (importBody.radios as Record<string, unknown>[]).map(withInherited),
      );
      if (conflict) {
        errorMessage.value = conflict.message;
        if (conflict.radioId && conflict.radioId !== effectiveSelectedId.value) {
          const message = conflict.message;
          selectWorkingRadio(conflict.radioId);
          errorMessage.value = message;
        }
        return false;
      }
    }
    overlayLiveFrontend(importBody);
    return await persistImportBody(importBody);
  } finally {
    isSaving.value = false;
  }
}

function radioHardwareReady(entry: Record<string, unknown>): boolean {
  const rtype = normalizeRadioType(entry.radio_type);
  if (rtype === 'none') return true;
  if (rtype === 'sx1262' || rtype === 'sx1262_ch341') {
    const sx = (entry.sx1262 as Record<string, unknown>) || {};
    if (!sxPinsConfigured(sx, rtype)) return false;
    if (rtype === 'sx1262_ch341') {
      // USB location optional unless multiple CH341 radios are in the draft/config.
      const ch341Count = workingRadios.value.filter(
        (e) => normalizeRadioType(e.radio_type) === 'sx1262_ch341',
      ).length;
      if (ch341Count >= 2) {
        const ch = (entry.ch341 as Record<string, unknown>) || {};
        const bus = ch.bus;
        const addr = ch.address ?? ch.device_address;
        const serial = String(ch.serial_number ?? ch.serial ?? '').trim();
        if ((bus === undefined || bus === null || bus === '') &&
            (addr === undefined || addr === null || addr === '') &&
            !serial) return false;
      }
    }
    return true;
  }
  if (rtype === 'kiss') return Boolean(String((entry.kiss as any)?.port || '').trim());
  if (rtype === 'modem_usb') return Boolean(String((entry.modem_usb as any)?.port || '').trim());
  if (rtype === 'modem_tcp') return Boolean(String((entry.modem_tcp as any)?.host || '').trim());
  return true;
}

/**
 * An entry as the repeater builds it: each section overlays the top-level one
 * key by key (_merge_radio_entry), so a value the entry inherits still shows.
 */
function withInherited(entry: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...entry };
  // Listed here, not as a module constant: the form loads during setup, before
  // later declarations in this script are initialised.
  for (const name of ['radio', 'kiss', 'modem_usb', 'modem_tcp', 'sx1262', 'ch341']) {
    const top = config.value[name];
    const own = entry[name];
    if (top && typeof top === 'object') {
      merged[name] = { ...(top as Record<string, unknown>), ...((own as Record<string, unknown>) || {}) };
    }
  }
  return merged;
}

function radioAirSummary(entry: Record<string, unknown>): string {
  const r = (entry.radio as Record<string, unknown>) || {};
  const freq = r.frequency ? (Number(r.frequency) / 1e6).toFixed(3) : '?';
  const sf = r.spreading_factor ?? '?';
  const bw = r.bandwidth ? Number(r.bandwidth) / 1000 : '?';
  return `${freq} MHz · SF${sf} · ${bw} kHz`;
}

const workingRadioCards = computed(() =>
  workingRadios.value.map((r) => {
    const id = String(r.id || '');
    return {
      id,
      radio_type: String(r.radio_type ?? 'unknown'),
      isDefault: id === (fabricDefaultRadio.value || workingRadios.value[0] && String(workingRadios.value[0].id)),
      isSelected: id === workingSelectedId.value,
      hwReady: radioHardwareReady(withInherited(r)),
      airSummary: radioAirSummary(withInherited(r)),
      edited:
        id in pendingPayloads.value ||
        (id === formKey.value && formDirty.value) ||
        (isDraftingMultiRadio.value && id === workingSelectedId.value),
    };
  }),
);

const activeRadioLabel = computed(() => workingSelectedId.value || '—');

const FIELD_LABELS: Record<string, string> = {
  radio_type: 'Radio type',
  'radio.frequency': 'Frequency',
  'radio.bandwidth': 'Bandwidth',
  'radio.spreading_factor': 'Spreading factor',
  'radio.coding_rate': 'Coding rate',
  'radio.tx_power': 'TX power',
  'radio.preamble_length': 'Preamble',
  'kiss.port': 'Serial port',
  'kiss.baud_rate': 'Baud rate',
  'modem_usb.port': 'Serial port',
  'modem_usb.baudrate': 'Baud rate',
  'modem_tcp.host': 'Host',
  'modem_tcp.port': 'Port',
  'modem_tcp.token': 'TCP token',
  'sx1262.bus_id': 'SPI bus',
  'sx1262.cs_id': 'SPI CS',
  'sx1262.cs_pin': 'CS pin',
  'sx1262.reset_pin': 'Reset pin',
  'sx1262.busy_pin': 'Busy pin',
  'sx1262.irq_pin': 'IRQ pin',
  'sx1262.txen_pin': 'TX enable pin',
  'sx1262.rxen_pin': 'RX enable pin',
  'sx1262.en_pin': 'Power enable pin',
  'sx1262.en_pins': 'Power enable pins',
  'sx1262.txled_pin': 'TX LED pin',
  'sx1262.rxled_pin': 'RX LED pin',
  'sx1262.use_dio2_rf': 'DIO2 RF switch',
  'sx1262.use_dio3_tcxo': 'DIO3 TCXO',
  'sx1262.dio3_tcxo_voltage': 'TCXO voltage',
  'sx1262.is_waveshare': 'Waveshare board',
  'ch341.vid': 'CH341 VID',
  'ch341.pid': 'CH341 PID',
  'ch341.bus': 'USB bus',
  'ch341.address': 'USB address',
  'ch341.serial_number': 'USB serial',
};

function changeValue(path: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (path === 'modem_tcp.token') return 'set';
  const n = Number(value);
  if (path === 'radio.frequency' && Number.isFinite(n)) return `${(n / 1e6).toFixed(3)} MHz`;
  if (path === 'radio.bandwidth' && Number.isFinite(n)) return `${n / 1000} kHz`;
  if (path === 'radio.coding_rate') return `4/${value}`;
  if (path === 'radio.tx_power') return `${value} dBm`;
  return formatChangeValue(value);
}

function radioChanges(key: string, before: unknown, after: unknown): SaveBarChange[] {
  let changes: FieldChange[] = diffChanges(before, after);
  // A new radio type swaps whole sections; name the type, not every field.
  if (changes.some((c) => c.path === 'radio_type')) {
    changes = changes.filter((c) => c.from !== undefined && c.to !== undefined);
  }
  return changes.map((c) => ({
    label: `${key ? `${key} › ` : ''}${FIELD_LABELS[c.path] ?? c.path}`,
    detail: `${changeValue(c.path, c.from)} → ${changeValue(c.path, c.to)}`,
  }));
}

const FABRIC_LABELS: Record<string, string> = {
  default_radio: 'Default TX radio',
  tx_mode: 'TX mode',
  repeat_on_ingress: 'Repeat on ingress',
  origin_tx: 'Originated traffic',
};

const saveBarChanges = computed<SaveBarChange[]>(() => {
  const items: SaveBarChange[] = [];
  if (isStagingDisableMultiRadio.value) {
    items.push({ label: 'Remove the second radio', detail: 'back to one radio' });
  } else if (isDraftingMultiRadio.value) {
    const saved = new Set(radios.value.map((r) => r.id));
    const drafted = (draftRadios.value || []).map((r) => String(r.id));
    if (!isMultiRadio.value) {
      items.push({ label: 'Set up multi-radio', detail: drafted.join(', ') });
    } else {
      for (const id of drafted) if (!saved.has(id)) items.push({ label: `Add radio ${id}` });
      for (const id of saved) if (!drafted.includes(id)) items.push({ label: `Remove radio ${id}` });
      if (!items.length) items.push({ label: 'Radio setup', detail: 'edited' });
    }
  } else {
    const keys = new Set(Object.keys(pendingPayloads.value));
    if (formDirty.value) keys.add(formKey.value);
    for (const key of [...keys].sort()) {
      const before = JSON.parse(baselinePayloads.value[key] ?? '{}');
      const after = key === formKey.value ? formPayload.value : pendingPayloads.value[key];
      items.push(...radioChanges(key, before, after));
    }
  }
  if (fabricDirty.value) {
    const before = JSON.parse(fabricBaseline.value) as Record<string, unknown>;
    const after = JSON.parse(fabricState.value) as Record<string, unknown>;
    for (const c of diffChanges(before, after)) {
      items.push({
        label: `Routing › ${FABRIC_LABELS[c.path] ?? c.path}`,
        detail: `${formatChangeValue(c.from)} → ${formatChangeValue(c.to)}`,
      });
    }
  }
  return items;
});

const showSerialFields = computed(
  () => selectedRadioType.value === 'kiss' || selectedRadioType.value === 'modem_usb',
);
const showTcpFields = computed(() => selectedRadioType.value === 'modem_tcp');

// The RF front end belongs to the selected radio's running modem (KISS or openHop
// USB/TCP), so show it under any such radio while its type is unchanged, and not
// while radios are being added or removed. On a multi-radio node the panel names
// that radio to the API; a single radio needs no id.
const showFrontend = computed(
  () =>
    !!FRONTEND_SECTIONS[selectedRadioType.value] &&
    selectedRadioType.value === currentRadioType.value &&
    !isDraftingMultiRadio.value &&
    !isStagingDisableMultiRadio.value,
);
const frontendRadioId = computed(() =>
  isMultiRadio.value && effectiveSelectedId.value ? String(effectiveSelectedId.value) : undefined,
);
const showSx1262Fields = computed(
  () => selectedRadioType.value === 'sx1262' || selectedRadioType.value === 'sx1262_ch341',
);
const showCh341Fields = computed(() => selectedRadioType.value === 'sx1262_ch341');

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isDirty,
  isSaving,
  cancelEditing,
  async () => saveChanges(),
);

defineExpose({ requestLeave, isEditing });

onMounted(() => {
  void loadSerialDevices();
  void loadHardwareOptions();
  void setupStore.fetchRadioPresets();
});

watch(selectedRadioType, (type, previous) => {
  if (type === previous) return;
  if (type === 'kiss' || type === 'modem_usb') void loadSerialDevices();
  if (type === 'sx1262' || type === 'sx1262_ch341') void loadHardwareOptions();
  selectedBoardPresetKey.value = '';
});
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

  <div class="space-y-6">
    <div class="cfg-page-heading">
      <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
        Radio Hardware
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
        <template v-if="showMultiRadioChrome">
          {{ workingRadios.length }} radios on one fabric. Live tuning applies immediately; channel,
          connection and routing changes are saved together and take effect after a restart.
        </template>
        <template v-else>
          The radio this repeater uses. Live tuning applies immediately; connection changes are saved
          and take effect after a restart.
        </template>
      </p>
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red dark:border-accent-red/opacity-heavy rounded-lg p-3 text-accent-red text-sm"
    >
      {{ errorMessage }}
    </div>

    <div
      v-if="fanoutPendingRestart"
      role="status"
      class="rounded-lg border border-accent-amber/opacity-heavy bg-accent-amber/opacity-light p-3 text-xs text-accent-amber"
    >
      Saved fan-out settings are not live yet — restart to apply them.
    </div>

    <div
      v-if="isDraftingMultiRadio && !isMultiRadio"
      class="rounded-lg border border-primary/opacity-heavy bg-primary/opacity-light p-3 text-xs text-content-secondary dark:text-content-muted"
    >
      New multi-radio setup, not saved yet. Give each radio its own hardware (distinct GPIO, USB
      adapter or serial port), choose how they share traffic under Routing, then save.
    </div>
    <div
      v-if="isStagingDisableMultiRadio"
      class="rounded-lg border border-accent-amber/opacity-heavy bg-accent-amber/opacity-light p-3 text-xs text-content-secondary dark:text-content-muted"
    >
      Saving goes back to a single radio. Discard to keep the current radios.
    </div>

    <!-- Multi-radio: radio list beside the selected radio (or routing) -->
    <div class="flex flex-wrap gap-6 items-start">
      <nav
        v-if="showMultiRadioChrome"
        aria-label="Radios"
        class="flex-[1_1_240px] max-w-xs w-full flex flex-col gap-2"
      >
        <div class="px-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
          Radios
        </div>
        <button
          v-for="card in workingRadioCards"
          :key="`card-${card.id}`"
          type="button"
          :aria-current="card.isSelected && activePanel === 'radio' ? 'true' : undefined"
          class="text-left rounded-lg border px-3 py-2.5 transition-colors"
          :class="card.isSelected && activePanel === 'radio'
            ? 'border-primary bg-primary/opacity-light'
            : 'border-stroke-subtle dark:border-stroke/opacity-medium hover:border-primary/opacity-medium'"
          :disabled="multiRadioBusy"
          @click="selectWorkingRadio(card.id)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="font-mono text-sm font-semibold text-content-primary">{{ card.id }}</span>
            <span class="flex items-center gap-1.5">
              <span
                v-if="card.edited"
                class="text-[10px] font-semibold text-accent-amber"
                :data-testid="`radio-edited-${card.id}`"
                >edited</span
              >
              <span
                v-if="card.isDefault"
                class="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-primary/opacity-light text-primary"
                >Default TX</span
              >
            </span>
          </span>
          <span class="block text-[11px] text-content-muted mt-1">{{ card.radio_type }}</span>
          <span class="block text-[11px] font-mono text-content-secondary mt-0.5">
            {{ card.airSummary }}
          </span>
          <span v-if="!card.hwReady" class="block text-[11px] text-accent-amber mt-0.5">
            Needs hardware settings
          </span>
        </button>

        <div class="flex gap-2">
          <label class="sr-only" for="new-radio-id">New radio id</label>
          <input
            id="new-radio-id"
            v-model="newRadioId"
            type="text"
            placeholder="new radio id"
            class="cfg-input flex-1 min-w-0"
            :disabled="multiRadioBusy || isSaving"
            @keydown.enter.prevent="addRadioEntry"
          />
          <button
            type="button"
            class="cfg-btn-secondary whitespace-nowrap"
            :disabled="multiRadioBusy || isSaving"
            @click="addRadioEntry"
          >
            Add radio
          </button>
        </div>

        <div class="h-px bg-stroke-subtle dark:bg-stroke/opacity-light my-2"></div>
        <div class="px-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
          Fabric
        </div>
        <button
          type="button"
          :aria-current="activePanel === 'routing' ? 'true' : undefined"
          class="text-left rounded-lg border px-3 py-2.5 transition-colors"
          :class="activePanel === 'routing'
            ? 'border-primary bg-primary/opacity-light'
            : 'border-stroke-subtle dark:border-stroke/opacity-medium hover:border-primary/opacity-medium'"
          @click="activePanel = 'routing'"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-content-primary">Routing</span>
            <span v-if="fabricDirty" class="text-[10px] font-semibold text-accent-amber">edited</span>
          </span>
          <span class="block text-[11px] text-content-muted mt-1">
            {{ fabricTxMode }} · default TX {{ fabricDefaultRadio || '—' }}
          </span>
        </button>
        <button
          v-if="!isStagingDisableMultiRadio"
          type="button"
          class="self-start text-xs text-content-muted hover:text-accent-red underline-offset-2 hover:underline mt-1"
          :disabled="multiRadioBusy || isSaving"
          @click="disableMultiRadio"
        >
          Go back to one radio
        </button>
      </nav>

      <div class="flex-[999_1_560px] min-w-0 space-y-4">
        <!-- Routing between radios -->
        <section
          v-if="showMultiRadioChrome && activePanel === 'routing'"
          aria-labelledby="routing-heading"
          class="cfg-section !p-4 sm:!p-5 space-y-4"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h4 id="routing-heading" class="text-sm font-semibold text-content-primary">Routing</h4>
            <span
              class="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-accent-amber/opacity-light text-accent-amber"
              >Restart to apply</span
            >
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Default TX radio
              <select v-model="fabricDefaultRadio" class="cfg-select mt-1">
                <option v-for="opt in workingRadioOptions" :key="`def-${opt.id}`" :value="opt.id">
                  {{ opt.id }}
                </option>
              </select>
            </label>
            <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Fabric TX mode
              <select v-model="fabricTxMode" class="cfg-select mt-1">
                <option value="default">default — always TX default radio</option>
                <option value="sticky">sticky — TX on last RX radio</option>
                <option value="bridge">bridge — TX on the other radio</option>
              </select>
            </label>
            <div class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              RF relay fan-out
              <label class="mt-2 flex items-center gap-2 text-content-primary text-sm">
                <input
                  v-model="fabricRepeatOnIngress"
                  type="checkbox"
                  :disabled="!canRepeatOnIngress"
                />
                Repeat on ingress
              </label>
              <p class="text-[11px] mt-1 text-content-muted">
                <span v-if="!canRepeatOnIngress">{{ repeatOnIngressBlockedReason }}</span>
                <span v-else>
                  RX local → TX link + local, RX link → TX local + link. The bridge radio is always
                  attempted first.
                </span>
              </p>
            </div>
            <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Originated traffic TX
              <select v-model="fabricOriginTx" class="cfg-select mt-1">
                <option value="default">default — follow default radio / TX mode</option>
                <option value="all" :disabled="!canOriginTxAll">all — send on every radio</option>
              </select>
              <p class="text-[11px] text-content-muted mt-1">
                <span v-if="!canOriginTxAll">{{ originTxAllBlockedReason }}</span>
                <span v-else>
                  Applies to packets this node originates — adverts, room servers, companion and
                  protocol replies — which have no ingress radio to route by.
                </span>
              </p>
            </label>
          </div>
        </section>

        <template v-else>
          <div v-if="showMultiRadioChrome" class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <h4 class="font-mono text-lg font-semibold text-content-primary truncate">
                {{ activeRadioLabel }}
              </h4>
              <span
                class="text-[11px] rounded-full border border-stroke-subtle dark:border-stroke/opacity-light px-2.5 py-0.5 text-content-secondary"
                >{{ selectedRadioType }}</span
              >
            </div>
            <div class="flex gap-2">
              <button
                v-if="fabricDefaultRadio !== workingSelectedId"
                type="button"
                class="cfg-btn-secondary"
                :disabled="multiRadioBusy || isSaving"
                @click="fabricDefaultRadio = workingSelectedId"
              >
                Make default TX
              </button>
              <button
                type="button"
                class="cfg-btn-danger"
                :disabled="multiRadioBusy || isSaving || !workingSelectedId"
                @click="removeSelectedRadio"
              >
                Remove radio
              </button>
            </div>
          </div>

          <RadioFrontendSettings
            v-if="showFrontend"
            :radio-id="frontendRadioId"
            :locked="isSaving || multiRadioBusy"
            @applied="onFrontendApplied"
            @busy="frontendBusy = $event"
          />

          <!-- Channel (per radio; one radio keeps it under Radio Settings) -->
          <section
            v-if="showMultiRadioChrome"
            aria-labelledby="channel-heading"
            class="cfg-section !p-4 sm:!p-5 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <h4 id="channel-heading" class="text-sm font-semibold text-content-primary">
                  Channel
                </h4>
                <span
                  class="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-accent-amber/opacity-light text-accent-amber"
                  >Restart to apply</span
                >
              </div>
              <label class="flex items-center gap-2 text-xs text-content-muted">
                Preset
                <select
                  class="cfg-select w-56"
                  :value="selectedAirPresetTitle"
                  @change="applyAirPreset(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Custom</option>
                  <option
                    v-for="preset in setupStore.radioPresets"
                    :key="preset.title"
                    :value="preset.title"
                  >
                    {{ preset.title }} — {{ preset.frequency }} MHz SF{{ preset.spreading_factor }}
                    BW{{ preset.bandwidth }}
                  </option>
                </select>
              </label>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Frequency (MHz)
                <input
                  v-model.number="airFrequencyMHz"
                  type="number"
                  step="0.001"
                  min="100"
                  max="1000"
                  class="cfg-input mt-1 font-mono"
                  @input="selectedAirPresetTitle = ''"
                />
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Bandwidth
                <select
                  v-model.number="airBandwidthKHz"
                  class="cfg-select mt-1"
                  @change="selectedAirPresetTitle = ''"
                >
                  <option v-for="bw in bandwidthOptions" :key="bw.value" :value="bw.value">
                    {{ bw.label }}
                  </option>
                </select>
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Spreading factor
                <select
                  v-model.number="airSpreadingFactor"
                  class="cfg-select mt-1"
                  @change="selectedAirPresetTitle = ''"
                >
                  <option v-for="sf in [5, 6, 7, 8, 9, 10, 11, 12]" :key="sf" :value="sf">
                    {{ sf }}
                  </option>
                </select>
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Coding rate
                <select
                  v-model.number="airCodingRate"
                  class="cfg-select mt-1"
                  @change="selectedAirPresetTitle = ''"
                >
                  <option :value="5">4/5</option>
                  <option :value="6">4/6</option>
                  <option :value="7">4/7</option>
                  <option :value="8">4/8</option>
                </select>
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                TX power (dBm)
                <input
                  v-model.number="airTxPower"
                  type="number"
                  min="-9"
                  max="30"
                  class="cfg-input mt-1 font-mono"
                  @input="selectedAirPresetTitle = ''"
                />
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Preamble length
                <input
                  v-model.number="airPreambleLength"
                  type="number"
                  min="1"
                  class="cfg-input mt-1 font-mono"
                />
              </label>
            </div>
          </section>

          <!-- Connection / hardware for the selected (or only) radio -->
          <section
            aria-labelledby="connection-heading"
            class="cfg-section !p-4 sm:!p-5 space-y-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h4 id="connection-heading" class="text-sm font-semibold text-content-primary">
                Connection
              </h4>
              <span
                class="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-accent-amber/opacity-light text-accent-amber"
                >Restart to apply</span
              >
            </div>

            <label class="flex flex-col gap-1 text-content-secondary dark:text-content-muted text-xs sm:text-sm">
              Radio Type
              <select v-model="selectedRadioType" class="cfg-select sm:w-96">
                <option v-for="option in radioTypeOptions" :key="option.value" :value="option.value">
                  {{ option.label }} - {{ option.detail }}
                </option>
              </select>
            </label>

            <template v-if="showSerialFields">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="text-content-secondary dark:text-content-muted text-xs sm:text-sm space-y-2">
                  <span>Serial Port</span>
                  <div class="flex gap-2">
                    <select
                      v-if="selectedRadioType === 'kiss'"
                      v-model="kissPort"
                      aria-label="Serial port"
                      class="cfg-select flex-1"
                      :disabled="useCustomSerialPath"
                    >
                      <option
                        v-if="kissPort && !serialDevices.some((d) => d.device === kissPort)"
                        :value="kissPort"
                      >
                        {{ kissPort }} (current)
                      </option>
                      <option v-for="dev in serialDevices" :key="`kiss-${dev.device}`" :value="dev.device">
                        {{ dev.description || dev.device }}
                      </option>
                    </select>
                    <select
                      v-else
                      v-model="modemUsbPort"
                      aria-label="Serial port"
                      class="cfg-select flex-1"
                      :disabled="useCustomSerialPath"
                    >
                      <option
                        v-if="modemUsbPort && !serialDevices.some((d) => d.device === modemUsbPort)"
                        :value="modemUsbPort"
                      >
                        {{ modemUsbPort }} (current)
                      </option>
                      <option v-for="dev in serialDevices" :key="`usb-${dev.device}`" :value="dev.device">
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
                  <label class="flex items-center gap-2 text-xs">
                    <input v-model="useCustomSerialPath" type="checkbox" />
                    Enter custom device path
                  </label>
                  <input
                    v-if="useCustomSerialPath && selectedRadioType === 'kiss'"
                    v-model="kissPort"
                    type="text"
                    aria-label="Custom serial device path"
                    class="cfg-input"
                    placeholder="/dev/ttyUSB0"
                  />
                  <input
                    v-if="useCustomSerialPath && selectedRadioType !== 'kiss'"
                    v-model="modemUsbPort"
                    type="text"
                    aria-label="Custom serial device path"
                    class="cfg-input"
                    placeholder="/dev/ttyACM0"
                  />
                  <p v-if="serialDevicesError" class="text-xs text-accent-red">{{ serialDevicesError }}</p>
                </div>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                  Baud Rate
                  <input
                    v-if="selectedRadioType === 'kiss'"
                    v-model.number="kissBaudRate"
                    type="number"
                    min="1"
                    class="cfg-input mt-1 font-mono"
                  />
                  <input
                    v-else
                    v-model.number="modemUsbBaudRate"
                    type="number"
                    min="1"
                    class="cfg-input mt-1 font-mono"
                  />
                </label>
              </div>
            </template>

            <div v-if="showTcpFields" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                TCP Host
                <input
                  v-model="modemTcpHost"
                  type="text"
                  class="cfg-input mt-1 font-mono"
                  placeholder="openhop-modem.local"
                />
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                TCP Port
                <input
                  v-model.number="modemTcpPort"
                  type="number"
                  min="1"
                  max="65535"
                  class="cfg-input mt-1 font-mono"
                />
              </label>
              <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                TCP Token
                <input
                  v-model="modemTcpToken"
                  type="password"
                  class="cfg-input mt-1"
                  placeholder="None — the modem accepts any client"
                />
              </label>
            </div>

            <template v-if="showSx1262Fields">
              <label class="flex flex-col gap-1 text-content-secondary dark:text-content-muted text-xs sm:text-sm">
                Board Preset (Quick Apply)
                <span class="flex gap-2 sm:w-[32rem]">
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
                </span>
              </label>
              <p v-if="hardwareOptionsError" class="text-xs text-accent-red">{{ hardwareOptionsError }}</p>
              <p v-if="selectedBoardPresetKey" class="text-[11px] font-mono text-content-secondary">
                Applied: CS={{ sxCsPin }} RST={{ sxResetPin }} BUSY={{ sxBusyPin }} IRQ={{ sxIrqPin }} ·
                DIO2={{ sxUseDio2Rf ? 'on' : 'off' }} TCXO={{ sxUseDio3Tcxo ? 'on' : 'off' }}
              </p>
              <p class="text-xs text-content-muted">
                <template v-if="selectedRadioType === 'sx1262_ch341'">
                  CH341 GPIO pin map (not BCM). PineDio: CS=0, Reset=-1, Busy=11, IRQ=10. Use the board
                  preset when unsure.
                </template>
                <template v-else>SX1262 board pins (BCM GPIO unless the board preset says otherwise).</template>
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI Bus ID
                  <input v-model.number="sxBusId" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI CS ID
                  <input v-model.number="sxCsId" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CS Pin
                  <input
                    v-model.number="sxCsPin"
                    type="number"
                    class="cfg-input mt-1 font-mono"
                    title="-1 = native/hardware SPI CS via bus/cs id"
                  />
                  <span class="block text-[11px] text-content-muted mt-0.5">-1 = native SPI CS</span>
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Reset Pin
                  <input v-model.number="sxResetPin" type="number" class="cfg-input mt-1 font-mono" />
                  <span
                    v-if="selectedRadioType === 'sx1262_ch341'"
                    class="block text-[11px] text-content-muted mt-0.5"
                    >-1 allowed (PineDio)</span
                  >
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Busy Pin
                  <input v-model.number="sxBusyPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">IRQ Pin
                  <input v-model.number="sxIrqPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TX Enable Pin
                  <input v-model.number="sxTxEnPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">RX Enable Pin
                  <input v-model.number="sxRxEnPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Power Enable Pin
                  <input v-model.number="sxEnPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Power Enable Pins (array)
                  <input
                    v-model="sxEnPinsInput"
                    type="text"
                    class="cfg-input mt-1 font-mono"
                    placeholder="26, 23"
                  />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TX LED Pin
                  <input v-model.number="sxTxLedPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">RX LED Pin
                  <input v-model.number="sxRxLedPin" type="number" class="cfg-input mt-1 font-mono" />
                </label>
              </div>
            </template>

            <template v-if="showCh341Fields">
              <div class="pt-2 text-xs text-content-muted">CH341 Adapter Configuration</div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 VID
                  <input v-model.number="ch341Vid" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 PID
                  <input v-model.number="ch341Pid" type="number" class="cfg-input mt-1 font-mono" />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">USB Bus
                  <input
                    v-model.number="ch341Bus"
                    type="number"
                    class="cfg-input mt-1 font-mono"
                    placeholder="optional"
                  />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">USB Address
                  <input
                    v-model.number="ch341Address"
                    type="number"
                    class="cfg-input mt-1 font-mono"
                    placeholder="optional"
                  />
                </label>
                <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm col-span-2">
                  USB Serial Number
                  <input
                    v-model="ch341Serial"
                    type="text"
                    class="cfg-input mt-1 font-mono"
                    placeholder="optional iSerial"
                  />
                </label>
              </div>
              <p class="text-xs text-content-muted">
                Optional with one CH341. With two or more, give each radio its own bus/address (or serial):
                pin numbers are per adapter, so both may use CS=0 / Busy=11 once the USB locations differ.
              </p>
            </template>
          </section>

          <div
            v-if="!showMultiRadioChrome && !isStagingDisableMultiRadio"
            class="cfg-section !p-4 sm:!p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div>
              <div class="text-sm font-semibold text-content-primary">Add a second radio</div>
              <p class="text-xs text-content-muted mt-1">
                Run two radios on one fabric, on the same channel or as a backhaul on another band.
              </p>
            </div>
            <button
              type="button"
              class="cfg-btn-secondary"
              :disabled="multiRadioBusy || isSaving"
              @click="enableMultiRadio"
            >
              Enable multi-radio
            </button>
          </div>
        </template>
      </div>
    </div>

    <SaveBar
      :changes="saveBarChanges"
      :saving="isSaving || multiRadioBusy || frontendBusy"
      note="Takes effect after a restart"
      @save="saveChanges"
      @discard="cancelEditing"
    />
  </div>
</template>
