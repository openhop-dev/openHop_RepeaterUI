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
  if (hasUnsavedMultiRadioDraft.value || isEditing.value) return false;
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
  if (isDraftingMultiRadio.value) {
    // Persist in-progress form into the draft entry before switching.
    if (isEditing.value) {
      const payload = buildHardwarePayloadFromForm();
      if (!payload) return;
      const currentId = workingSelectedId.value;
      draftRadios.value = (draftRadios.value || []).map((entry) => {
        if (String(entry.id) !== currentId) return entry;
        return applyPayloadToEntry(entry, payload);
      });
    }
    draftSelectedId.value = id;
    const entry = (draftRadios.value || []).find((r) => String(r.id) === id) || null;
    loadHardwareFormFromSections(sectionsFromEntry(entry));
    isEditing.value = true;
    errorMessage.value = '';
    return;
  }
  if (isEditing.value) {
    errorMessage.value = 'Finish or cancel editing before switching radios.';
    return;
  }
  selectRadio(id);
}

function loadActiveHardwareAndAir() {
  const entry = isMultiRadio.value
    ? (radios.value.find((r) => r.id === effectiveSelectedId.value) as Record<string, unknown> | undefined)
    : null;
  loadHardwareFormFromSections({
    radio_type: activeHardware.value.radio_type ?? config.value.radio_type,
    radio: (entry?.radio as Record<string, unknown>) || config.value.radio,
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
    if (isDraftingMultiRadio.value || isEditing.value) return;
    ensureSelection();
    loadActiveHardwareAndAir();
    loadFabricForm();
  },
  { immediate: true },
);

watch(effectiveSelectedId, () => {
  if (isDraftingMultiRadio.value || isEditing.value) return;
  ensureSelection();
  loadActiveHardwareAndAir();
});

const currentRadioType = computed(() => {
  if (isDraftingMultiRadio.value) {
    return normalizeRadioType(workingSelectedEntry.value?.radio_type ?? selectedRadioType.value);
  }
  return normalizeRadioType(activeHardware.value.radio_type ?? config.value.radio_type);
});

const currentRadioTypeLabel = computed(() => {
  const match = radioTypeOptions.find((opt) => opt.value === currentRadioType.value);
  return match ? `${match.label} - ${match.detail}` : 'none - Disable radio hardware (no RF I/O)';
});

// What Save would send if nothing were edited, so a front-end-only change does not
// resave the hardware or offer a restart.
const hardwareBaseline = ref('');

function startEditing() {
  selectedRadioType.value = currentRadioType.value;
  const payload = buildHardwarePayloadFromForm();
  hardwareBaseline.value = payload ? JSON.stringify(existingSaveBody(payload)) : '';
  isEditing.value = true;
  errorMessage.value = '';
  if (showMultiRadioChrome.value && setupStore.radioPresets.length === 0) {
    void setupStore.fetchRadioPresets();
  }
}

function cancelEditing() {
  if (hasUnsavedMultiRadioDraft.value) {
    // Discard multi-radio draft / staged disable and restore live config view.
    draftRadios.value = null;
    draftSelectedId.value = '';
    isEditing.value = false;
    errorMessage.value = '';
    useCustomSerialPath.value = false;
    selectedBoardPresetKey.value = '';
    selectedAirPresetTitle.value = '';
    ensureSelection();
    loadActiveHardwareAndAir();
    loadFabricForm();
    return;
  }
  selectedRadioType.value = currentRadioType.value;
  isEditing.value = false;
  errorMessage.value = '';
  useCustomSerialPath.value = false;
  selectedBoardPresetKey.value = '';
  selectedAirPresetTitle.value = '';
  loadActiveHardwareAndAir();
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

function buildHardwarePayloadFromForm(): Record<string, unknown> | null {
  if (selectedRadioType.value === 'modem_tcp' && !modemTcpHost.value.trim()) {
    errorMessage.value = 'TCP modem host is required for modem_tcp';
    return null;
  }

  if (showMultiRadioChrome.value) {
    const freq = asNumber(airFrequencyMHz.value, 0);
    const txp = asNumber(airTxPower.value, 0);
    const sf = asNumber(airSpreadingFactor.value, 0);
    const cr = asNumber(airCodingRate.value, 0);
    if (freq < 100 || freq > 1000) {
      errorMessage.value = 'Frequency must be between 100 and 1000 MHz';
      return null;
    }
    if (txp < -9 || txp > 30) {
      errorMessage.value = 'TX Power must be between -9 and +30 dBm';
      return null;
    }
    if (sf < 5 || sf > 12) {
      errorMessage.value = 'Spreading factor must be 5-12';
      return null;
    }
    if (cr < 5 || cr > 8) {
      errorMessage.value = 'Coding rate must be 5-8';
      return null;
    }
  }

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
  if (payload.modem_usb) updated.modem_usb = payload.modem_usb;
  if (payload.modem_tcp) updated.modem_tcp = payload.modem_tcp;
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
    // Existing multi-radio: update the selected entry only.
    const nextRadios = radios.value.map((entry) => {
      if (entry.id !== effectiveSelectedId.value) return { ...entry } as Record<string, unknown>;
      return applyPayloadToEntry({ ...entry } as Record<string, unknown>, payload);
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
    isEditing.value = false;
    await systemStore.fetchStats();
    ensureSelection();
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
  if (isEditing.value && !isDraftingMultiRadio.value) {
    errorMessage.value = 'Finish or cancel hardware editing before enabling multi-radio.';
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
  isEditing.value = true;
  if (setupStore.radioPresets.length === 0) {
    void setupStore.fetchRadioPresets();
  }
  loadHardwareFormFromSections(sectionsFromEntry(secondary));
}

function addRadioEntry() {
  errorMessage.value = '';
  const base = draftRadios.value
    ? draftRadios.value.map((r) => ({ ...r }))
    : radios.value.map((r) => ({ ...r }) as Record<string, unknown>);
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
  isEditing.value = true;
  loadHardwareFormFromSections(sectionsFromEntry(shell));
}

function removeSelectedRadio() {
  if (!showMultiRadioChrome.value || !workingSelectedId.value) return;
  errorMessage.value = '';
  const base = draftRadios.value
    ? draftRadios.value.map((r) => ({ ...r }))
    : radios.value.map((r) => ({ ...r }) as Record<string, unknown>);
  if (base.length <= 2) {
    // Exit multi-radio: draft clear if only local draft, else mark disable via empty draft sentinel.
    if (isDraftingMultiRadio.value && !isMultiRadio.value) {
      cancelEditing();
      return;
    }
    draftRadios.value = [];
    draftSelectedId.value = '';
    isEditing.value = false;
    return;
  }
  const next = base.filter((r) => String(r.id) !== workingSelectedId.value);
  draftRadios.value = next;
  const nextSelect = String(next[0]?.id || '');
  draftSelectedId.value = nextSelect;
  if (fabricDefaultRadio.value === workingSelectedId.value) {
    fabricDefaultRadio.value = nextSelect;
  }
  isEditing.value = false;
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
  isEditing.value = true;
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

      const conflict = validateMultiRadioHardware(nextRadios);
      if (conflict) {
        errorMessage.value = conflict.message;
        if (conflict.radioId) {
          // Jump UI to the radio that still needs hardware.
          draftSelectedId.value = conflict.radioId;
          const entry = nextRadios.find((r) => String(r.id) === conflict.radioId) || null;
          loadHardwareFormFromSections(sectionsFromEntry(entry));
          isEditing.value = true;
        }
        return false;
      }

      const importBody: Record<string, unknown> = {
        radios: nextRadios,
        fabric: buildFabricPayload(nextRadios),
      };
      mirrorDefaultRadioToLegacy(importBody, nextRadios);
      return await persistImportBody(importBody);
    }

    const importBody = existingSaveBody(payload);
    if (isMultiRadio.value && effectiveSelectedId.value) {
      const conflict = validateMultiRadioHardware(importBody.radios as Record<string, unknown>[]);
      if (conflict) {
        errorMessage.value = conflict.message;
        if (conflict.radioId) selectRadio(conflict.radioId);
        return false;
      }
    }

    // RF front end first: it applies live, and a failure keeps the page in edit
    // mode with the reason shown next to those rows.
    const frontend = frontendRef.value;
    if (frontend && frontend.validate()) return false;
    const frontendChanged = !!frontend?.hasChanges();
    if (frontendChanged && !(await frontend!.apply())) return false;

    // A front-end-only edit is done: don't resave the hardware or offer a restart.
    // Without any edit, Save still writes the config as before (it also migrates
    // legacy section names).
    if (frontendChanged && JSON.stringify(importBody) === hardwareBaseline.value) {
      isEditing.value = false;
      return true;
    }
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
      hwReady: radioHardwareReady(r),
      airSummary: radioAirSummary(r),
    };
  }),
);

const activeRadioLabel = computed(() => workingSelectedId.value || '—');

const showSerialFields = computed(
  () => selectedRadioType.value === 'kiss' || selectedRadioType.value === 'modem_usb',
);
const showTcpFields = computed(() => selectedRadioType.value === 'modem_tcp');

// The RF front end belongs to the running default radio's KISS modem, so show it
// only under that radio, and not while radios are being added or removed.
const frontendRef = ref<InstanceType<typeof RadioFrontendSettings> | null>(null);
const showFrontend = computed(
  () =>
    selectedRadioType.value === 'kiss' &&
    currentRadioType.value === 'kiss' &&
    !isDraftingMultiRadio.value &&
    !isStagingDisableMultiRadio.value &&
    (!isMultiRadio.value || String(effectiveSelectedId.value) === String(defaultRadioId.value)),
);
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
  void setupStore.fetchRadioPresets();
});

watch(
  [isEditing, selectedRadioType],
  ([editing, type]) => {
    if (editing && (type === 'kiss' || type === 'modem_usb')) {
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
          <template v-if="showMultiRadioChrome">
            Editing
            <span class="font-mono font-semibold text-content-primary">{{ activeRadioLabel }}</span>
            — configure its over-the-air settings and hardware, then switch radios or Save.
          </template>
          <template v-else>
            Select which radio hardware backend this repeater should use
          </template>
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
            {{ isSaving || multiRadioBusy ? 'Saving...' : (isDraftingMultiRadio || isStagingDisableMultiRadio ? 'Save multi-radio config' : 'Save Changes') }}
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red dark:border-accent-red/opacity-heavy rounded-lg p-3 text-accent-red text-sm"
    >
      {{ errorMessage }}
    </div>

<!-- Multi-radio: draft locally first; save only after hardware is configured -->
    <div
      class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-3 sm:p-4 space-y-3"
    >
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-content-primary">Multi-radio / fabric</div>
          <div class="text-xs text-content-muted">
            <template v-if="isStagingDisableMultiRadio">
              Multi-radio will be disabled on Save. Cancel to keep the current radios[] config.
            </template>
            <template v-else-if="isDraftingMultiRadio">
              Draft only — not saved yet. Configure each radio’s hardware (distinct GPIO / USB / serial), set fabric mode, then Save.
            </template>
            <template v-else-if="isMultiRadio">
              Managing {{ radios.length }} radios[] entries. Hardware fields below apply to the selected radio.
              <span v-if="fanoutPendingRestart" class="block mt-1 text-accent-amber">
                Saved fan-out settings are not live yet — restart to apply them.
              </span>
            </template>
            <template v-else>
              Single-radio mode. Enable multi-radio to draft a second radio, configure its pins, then save once.
            </template>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button
            v-if="!showMultiRadioChrome && !isStagingDisableMultiRadio"
            type="button"
            class="cfg-btn-primary"
            :disabled="multiRadioBusy || isSaving || (isEditing && !isDraftingMultiRadio)"
            @click="enableMultiRadio"
          >
            Enable multi-radio
          </button>
          <button
            v-else-if="showMultiRadioChrome"
            type="button"
            class="cfg-btn-secondary"
            :disabled="multiRadioBusy || isSaving"
            @click="disableMultiRadio"
          >
            Disable multi-radio
          </button>
          <button
            v-if="hasUnsavedMultiRadioDraft"
            type="button"
            class="cfg-btn-secondary"
            :disabled="multiRadioBusy || isSaving"
            @click="cancelEditing"
          >
            Discard draft
          </button>
        </div>
      </div>

      <div
        v-if="isDraftingMultiRadio"
        class="rounded-lg border border-accent-amber/opacity-heavy bg-accent-amber/opacity-light p-3 text-xs text-accent-amber"
      >
        New radios start with empty hardware pins. Use the radio cards to select each radio,
        set <strong>Over-the-air</strong> + <strong>Hardware</strong> for that radio, then Save once.
        Currently selected: <span class="font-mono font-semibold">{{ activeRadioLabel }}</span>.
        Nothing is written until Save succeeds.
      </div>

      <template v-if="showMultiRadioChrome">
        <div
          class="rounded-xl border-2 border-primary/opacity-heavy bg-primary/opacity-light px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div>
            <div class="text-[11px] uppercase tracking-wide font-semibold text-primary">
              Currently editing
            </div>
            <div class="text-base font-semibold text-content-primary font-mono">
              {{ activeRadioLabel }}
            </div>
            <div class="text-xs text-content-muted mt-0.5">
              Both <strong>Over-the-air settings</strong> and <strong>Hardware</strong> below apply only to this radio.
              Switch radios to configure the other one before Save.
            </div>
          </div>
          <select
            class="cfg-select w-full sm:w-64"
            :value="workingSelectedId"
            :disabled="multiRadioBusy"
            @change="selectWorkingRadio(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in workingRadioOptions" :key="opt.id" :value="opt.id">
              {{ opt.id }}{{ opt.isDefault ? ' (default TX)' : '' }} — {{ opt.radio_type }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-for="card in workingRadioCards"
            :key="`card-${card.id}`"
            type="button"
            class="text-left rounded-xl border px-3 py-2 transition-colors"
            :class="card.isSelected
              ? 'border-primary bg-primary/opacity-light shadow-sm'
              : 'border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute/40 dark:bg-white/opacity-subtle hover:border-primary/opacity-medium'"
            :disabled="multiRadioBusy"
            @click="selectWorkingRadio(card.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-sm font-semibold text-content-primary">{{ card.id }}</span>
              <span
                class="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                :class="card.hwReady
                  ? 'bg-accent-green/opacity-light text-accent-green'
                  : 'bg-accent-amber/opacity-light text-accent-amber'"
              >
                {{ card.hwReady ? 'HW ready' : 'HW needed' }}
              </span>
            </div>
            <div class="text-[11px] text-content-muted mt-1">
              {{ card.radio_type }}{{ card.isDefault ? ' · default TX' : '' }}
            </div>
            <div class="text-[11px] font-mono text-content-secondary mt-0.5">
              OTA {{ card.airSummary }}
            </div>
            <div v-if="card.isSelected" class="text-[10px] text-primary font-semibold mt-1">
              ← editing this radio
            </div>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Default TX radio
            <select
              v-if="isEditing || isDraftingMultiRadio"
              v-model="fabricDefaultRadio"
              class="cfg-select mt-1"
            >
              <option v-for="opt in workingRadioOptions" :key="`def-${opt.id}`" :value="opt.id">
                {{ opt.id }}
              </option>
            </select>
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ defaultRadioId }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Fabric TX mode
            <select
              v-if="isEditing || isDraftingMultiRadio"
              v-model="fabricTxMode"
              class="cfg-select mt-1"
            >
              <option value="default">default — always TX default radio</option>
              <option value="sticky">sticky — TX on last RX radio</option>
              <option value="bridge">bridge — TX on the other radio</option>
            </select>
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ txMode }}</span>
          </label>
        </div>

        <!-- Fan-out: only meaningful on an exactly-two-radio bridge -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            RF relay fan-out
            <template v-if="isEditing || isDraftingMultiRadio">
              <label
                class="flex items-center gap-2 mt-1"
                :class="canRepeatOnIngress ? 'text-content-primary' : 'text-content-muted'"
              >
                <input
                  v-model="fabricRepeatOnIngress"
                  type="checkbox"
                  :disabled="!canRepeatOnIngress"
                />
                Repeat on ingress
              </label>
              <p class="text-[11px] mt-1">
                <span v-if="!canRepeatOnIngress" class="text-content-muted">
                  {{ repeatOnIngressBlockedReason }}
                </span>
                <span v-else class="text-content-muted">
                  RX local → TX link + local, RX link → TX local + link. The bridge radio
                  is always attempted first.
                </span>
              </p>
            </template>
            <span v-else class="block text-content-primary font-mono text-sm mt-1">
              {{ repeatOnIngress ? 'on' : 'off' }}
            </span>
          </div>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Originated traffic TX
            <template v-if="isEditing || isDraftingMultiRadio">
              <select v-model="fabricOriginTx" class="cfg-select mt-1">
                <option value="default">default — follow default radio / TX mode</option>
                <option value="all" :disabled="!canOriginTxAll">all — send on every radio</option>
              </select>
              <p class="text-[11px] text-content-muted mt-1">
                <span v-if="!canOriginTxAll">{{ originTxAllBlockedReason }}</span>
                <span v-else>
                  Applies to packets this node originates — adverts, room servers, companion
                  and protocol replies — which have no ingress radio to route by.
                </span>
              </p>
            </template>
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ originTx }}</span>
          </label>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label class="flex-1 text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Add radio id
            <input
              v-model="newRadioId"
              type="text"
              class="cfg-input mt-1"
              placeholder="e.g. link2"
              :disabled="multiRadioBusy || isSaving"
            />
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="cfg-btn-secondary"
              :disabled="multiRadioBusy || isSaving"
              @click="addRadioEntry"
            >
              Add radio
            </button>
            <button
              type="button"
              class="cfg-btn-secondary"
              :disabled="multiRadioBusy || isSaving || !workingSelectedId"
              @click="removeSelectedRadio"
            >
              Remove selected
            </button>
          </div>
        </div>

        <p class="text-xs text-content-muted">
          Configure every radio’s distinct hardware, choose fabric mode, then click Save Changes. Restart is only offered after a successful save.
        </p>
      </template>
    </div>

    <!-- Per-radio LoRa air settings (multi-radio setup / edit) -->
    <div
      v-if="showMultiRadioChrome"
      class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-3 sm:p-4 space-y-3"
    >
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="text-sm font-semibold text-content-primary">1 · Over-the-air settings</div>
            <span class="inline-flex items-center rounded-full bg-primary/opacity-light text-primary text-[11px] font-mono font-semibold px-2 py-0.5">
              radio: {{ activeRadioLabel }}
            </span>
          </div>
          <div class="text-xs text-content-muted mt-1">
            Frequency / SF / bandwidth / power for
            <span class="font-mono font-semibold">{{ activeRadioLabel }}</span>
            only (not shared with other radios). Pick a preset or edit manually.
          </div>
        </div>
      </div>

      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Radio preset</span>
        <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
          {{ selectedAirPresetTitle || 'Custom / current values' }}
        </div>
        <div v-else class="w-full sm:w-96 space-y-1">
          <select
            class="cfg-select w-full"
            :value="selectedAirPresetTitle"
            @change="applyAirPreset(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Custom — keep / edit values below</option>
            <option
              v-for="preset in setupStore.radioPresets"
              :key="preset.title"
              :value="preset.title"
            >
              {{ preset.title }} — {{ preset.frequency }} MHz SF{{ preset.spreading_factor }} BW{{ preset.bandwidth }}
            </option>
          </select>
          <p class="text-[11px] text-content-muted">
            Presets fill frequency, SF, bandwidth, coding rate, and TX power for this radio only.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Frequency (MHz)
          <input
            v-if="isEditing"
            v-model.number="airFrequencyMHz"
            type="number"
            step="0.001"
            min="100"
            max="1000"
            class="cfg-input mt-1"
            @input="selectedAirPresetTitle = ''"
          />
          <span v-else class="block text-content-primary font-mono text-sm mt-1">
            {{ airFrequencyMHz.toFixed(3) }} MHz
          </span>
        </label>
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Spreading factor
          <select
            v-if="isEditing"
            v-model.number="airSpreadingFactor"
            class="cfg-select mt-1"
            @change="selectedAirPresetTitle = ''"
          >
            <option v-for="sf in [5, 6, 7, 8, 9, 10, 11, 12]" :key="sf" :value="sf">{{ sf }}</option>
          </select>
          <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ airSpreadingFactor }}</span>
        </label>
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Bandwidth
          <select
            v-if="isEditing"
            v-model.number="airBandwidthKHz"
            class="cfg-select mt-1"
            @change="selectedAirPresetTitle = ''"
          >
            <option v-for="bw in bandwidthOptions" :key="bw.value" :value="bw.value">{{ bw.label }}</option>
          </select>
          <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ airBandwidthKHz }} kHz</span>
        </label>
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          TX power (dBm)
          <input
            v-if="isEditing"
            v-model.number="airTxPower"
            type="number"
            min="-9"
            max="30"
            class="cfg-input mt-1"
            @input="selectedAirPresetTitle = ''"
          />
          <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ airTxPower }} dBm</span>
        </label>
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Coding rate
          <select
            v-if="isEditing"
            v-model.number="airCodingRate"
            class="cfg-select mt-1"
            @change="selectedAirPresetTitle = ''"
          >
            <option :value="5">4/5</option>
            <option :value="6">4/6</option>
            <option :value="7">4/7</option>
            <option :value="8">4/8</option>
          </select>
          <span v-else class="block text-content-primary font-mono text-sm mt-1">4/{{ airCodingRate }}</span>
        </label>
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Preamble length
          <input
            v-if="isEditing"
            v-model.number="airPreambleLength"
            type="number"
            min="1"
            class="cfg-input mt-1"
          />
          <span v-else class="block text-content-primary font-mono text-sm mt-1">
            {{ airPreambleLength }} symbols
          </span>
        </label>
      </div>
    </div>

    <div class="cfg-section space-y-3 rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-3 sm:p-4">
      <div v-if="showMultiRadioChrome" class="pb-2 border-b border-stroke-subtle dark:border-stroke/opacity-light mb-1">
        <div class="flex flex-wrap items-center gap-2">
          <div class="text-sm font-semibold text-content-primary">2 · Hardware</div>
          <span class="inline-flex items-center rounded-full bg-primary/opacity-light text-primary text-[11px] font-mono font-semibold px-2 py-0.5">
            radio: {{ activeRadioLabel }}
          </span>
        </div>
        <div class="text-xs text-content-muted mt-1">
          Board type, GPIO / SPI / USB / serial for
          <span class="font-mono font-semibold">{{ activeRadioLabel }}</span>
          only. Each radio must use distinct pins or adapters.
        </div>
      </div>
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1">
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
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Serial Port
          </span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm break-all">
            {{ selectedRadioType === 'kiss' ? kissPort : modemUsbPort }}
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
                  v-model="modemUsbPort"
                  class="cfg-select flex-1"
                  :disabled="useCustomSerialPath"
                >
                  <option
                    v-if="modemUsbPort && !serialDevices.some((d) => d.device === modemUsbPort)"
                    :value="modemUsbPort"
                  >
                    {{ modemUsbPort }} (current)
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
                v-model="modemUsbPort"
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

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Baud Rate
          </span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ selectedRadioType === 'kiss' ? kissBaudRate : modemUsbBaudRate }}
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
              v-model.number="modemUsbBaudRate"
              type="number"
              min="1"
              class="cfg-input w-full sm:w-40"
            />
          </template>
        </div>
      </template>

      <RadioFrontendSettings v-if="showFrontend" ref="frontendRef" :editing="isEditing" />

      <template v-if="showTcpFields">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Host</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm break-all">
            {{ modemTcpHost || 'Not set' }}
          </div>
          <input
            v-else
            v-model="modemTcpHost"
            type="text"
            class="cfg-input w-full sm:w-72"
            placeholder="openhop-modem.local"
          />
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Port</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ modemTcpPort }}
          </div>
          <input
            v-else
            v-model.number="modemTcpPort"
            type="number"
            min="1"
            max="65535"
            class="cfg-input w-full sm:w-40"
          />
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">TCP Token</span>
          <div v-if="!isEditing" class="text-content-primary font-mono text-sm">
            {{ modemTcpToken ? 'Configured' : 'Not set' }}
          </div>
          <input
            v-else
            v-model="modemTcpToken"
            type="password"
            class="cfg-input w-full sm:w-72"
            placeholder="Optional"
          />
        </div>
      </template>

      <template v-if="showSx1262Fields && isEditing">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-2">
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
              Selecting a preset loads pins/flags from radio-settings.json (e.g. PineDio: CS=0, Reset=-1, Busy=11, IRQ=10, DIO2 RF on, TCXO off, preamble 17).
            </p>
            <p
              v-if="selectedBoardPresetKey"
              class="text-[11px] font-mono text-content-secondary"
            >
              Applied: CS={{ sxCsPin }} RST={{ sxResetPin }} BUSY={{ sxBusyPin }} IRQ={{ sxIrqPin }}
              · DIO2={{ sxUseDio2Rf ? 'on' : 'off' }} TCXO={{ sxUseDio3Tcxo ? 'on' : 'off' }}
            </p>
          </div>
        </div>

        <div class="pt-2 text-xs text-content-muted">
          <template v-if="selectedRadioType === 'sx1262_ch341'">
            CH341 GPIO pin map (not BCM). PineDio: CS=0, Reset=-1, Busy=11, IRQ=10. Use board preset when unsure.
          </template>
          <template v-else>
            SX1262 board pin configuration (BCM GPIO unless noted by board preset).
          </template>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light">
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI Bus ID
            <input v-if="isEditing" v-model.number="sxBusId" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxBusId }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">SPI CS ID
            <input v-if="isEditing" v-model.number="sxCsId" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxCsId }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CS Pin
            <input
              v-if="isEditing"
              v-model.number="sxCsPin"
              type="number"
              class="cfg-input mt-1"
              title="-1 = native/hardware SPI CS via bus/cs id"
            />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxCsPin }}</span>
            <span class="block text-[11px] text-content-muted mt-0.5">-1 = native SPI CS (use SPI CS ID above)</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Reset Pin
            <input v-if="isEditing" v-model.number="sxResetPin" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ sxResetPin }}</span>
            <span
              v-if="selectedRadioType === 'sx1262_ch341'"
              class="block text-[11px] text-content-muted mt-0.5"
            >-1 allowed (PineDio has no reset line)</span>
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
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current SPI bus</div>
          <div class="text-content-primary font-mono">{{ sxBusId }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current SPI CS</div>
          <div class="text-content-primary font-mono">{{ sxCsId }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current CS pin</div>
          <div class="text-content-primary font-mono">{{ sxCsPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current reset pin</div>
          <div class="text-content-primary font-mono">{{ sxResetPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current busy pin</div>
          <div class="text-content-primary font-mono">{{ sxBusyPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current IRQ pin</div>
          <div class="text-content-primary font-mono">{{ sxIrqPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current power enable pin</div>
          <div class="text-content-primary font-mono">{{ sxEnPin }}</div>
        </div>
        <div class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-3">
          <div class="text-content-muted text-xs mb-1">Current power enable pins</div>
          <div class="text-content-primary font-mono">
            {{ sxEnPinsInput || 'Not set' }}
          </div>
        </div>
      </div>

      <template v-if="showCh341Fields">
        <div class="pt-2 text-xs text-content-muted">CH341 Adapter Configuration</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light">
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 VID
            <input v-if="isEditing" v-model.number="ch341Vid" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ ch341Vid }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">CH341 PID
            <input v-if="isEditing" v-model.number="ch341Pid" type="number" class="cfg-input mt-1" />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">{{ ch341Pid }}</span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">USB Bus
            <input
              v-if="isEditing"
              v-model.number="ch341Bus"
              type="number"
              class="cfg-input mt-1"
              placeholder="optional"
            />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">
              {{ ch341Bus === null || ch341Bus === undefined ? 'Not set' : ch341Bus }}
            </span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">USB Address
            <input
              v-if="isEditing"
              v-model.number="ch341Address"
              type="number"
              class="cfg-input mt-1"
              placeholder="optional"
            />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">
              {{ ch341Address === null || ch341Address === undefined ? 'Not set' : ch341Address }}
            </span>
          </label>
          <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm sm:col-span-2">
            USB Serial Number
            <input
              v-if="isEditing"
              v-model="ch341Serial"
              type="text"
              class="cfg-input mt-1"
              placeholder="optional iSerial"
            />
            <span v-else class="block text-content-primary font-mono text-sm mt-1">
              {{ ch341Serial || 'Not set' }}
            </span>
          </label>
        </div>
        <p class="text-xs text-content-muted">
          Optional with one CH341. With two+ CH341 adapters, set distinct bus/address (or serial) on each radio — pin numbers are per-adapter, so both may use CS=0 / Busy=11 once USB locations differ.
        </p>
      </template>

      <div class="py-2 text-xs text-content-muted">
        Hardware changes are saved and need a service restart to apply; RF front-end settings
        apply to the modem straight away.
      </div>
    </div>
  </div>
</template>
