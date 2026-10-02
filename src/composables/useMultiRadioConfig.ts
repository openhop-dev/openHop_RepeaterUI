/**
 * Shared multi-radio config helpers for Radio Settings / Radio Hardware pages.
 * Reuses systemStore.stats config shapes already returned by /stats.
 */
import { computed, ref, type Ref } from 'vue'
import { useSystemStore } from '@/stores/system'
import { normalizeModemTransportConfig } from '@/utils/modemTransport'

export type FabricTxMode = 'default' | 'sticky' | 'bridge'

export interface RadioListEntry {
  id: string
  radio_type?: string | null
  radio?: Record<string, unknown>
  sx1262?: Record<string, unknown>
  ch341?: Record<string, unknown>
  kiss?: Record<string, unknown>
  modem_usb?: Record<string, unknown>
  modem_tcp?: Record<string, unknown>
  [key: string]: unknown
}

export type FabricOriginTx = 'default' | 'all'

export interface FabricConfig {
  default_radio?: string
  default_radio_id?: string
  tx_mode?: string
  use_fabric?: boolean
  repeat_on_ingress?: boolean
  origin_tx?: string
  /** origin_tx's former name; still read so pre-rename configs display right. */
  local_tx_mode?: string
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {}
}

export function normalizeRadioEntries(raw: unknown): RadioListEntry[] {
  if (!Array.isArray(raw)) return []
  const out: RadioListEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = String(e.id ?? e.radio_id ?? '').trim()
    if (!id) continue
    out.push({ ...(normalizeModemTransportConfig(e) as RadioListEntry), id })
  }
  return out
}

export function useMultiRadioConfig() {
  const systemStore = useSystemStore()

  const rootConfig = computed<Record<string, any>>(() => {
    const stats = systemStore.stats as Record<string, any> | null
    if (!stats) return {}
    const nested = asRecord(stats.config)
    // Match RadioHardwareSettings merge: some builds nest, some flatten.
    return normalizeModemTransportConfig({ ...stats, ...nested })
  })

  const radios = computed<RadioListEntry[]>(() => {
    // Prefer nested config.radios; fall back to top-level stats.radios.
    const nested = rootConfig.value.radios
    if (Array.isArray(nested) && nested.length) return normalizeRadioEntries(nested)
    const stats = systemStore.stats as Record<string, any> | null
    return normalizeRadioEntries(stats?.radios)
  })

  const fabric = computed<FabricConfig>(() => {
    const nested = asRecord(rootConfig.value.fabric)
    if (Object.keys(nested).length) return nested as FabricConfig
    const stats = systemStore.stats as Record<string, any> | null
    return asRecord(stats?.fabric) as FabricConfig
  })

  const radioStack = computed<Record<string, any>>(() => {
    const nested = asRecord(rootConfig.value.radio_stack)
    if (Object.keys(nested).length) return nested
    const stats = systemStore.stats as Record<string, any> | null
    return asRecord(stats?.radio_stack)
  })

  const isMultiRadio = computed(() => radios.value.length > 0)

  const defaultRadioId = computed(() => {
    const f = fabric.value
    const fromFabric = f.default_radio || f.default_radio_id
    if (fromFabric) return String(fromFabric)
    if (radios.value.length) return radios.value[0].id
    return 'radio0'
  })

  const selectedRadioId: Ref<string> = ref('')

  // Keep selection valid when config reloads.
  const effectiveSelectedId = computed(() => {
    if (!isMultiRadio.value) return ''
    const ids = new Set(radios.value.map((r) => r.id))
    if (selectedRadioId.value && ids.has(selectedRadioId.value)) {
      return selectedRadioId.value
    }
    return defaultRadioId.value
  })

  function selectRadio(id: string) {
    selectedRadioId.value = id
  }

  function ensureSelection() {
    if (!isMultiRadio.value) {
      selectedRadioId.value = ''
      return
    }
    const ids = new Set(radios.value.map((r) => r.id))
    if (!selectedRadioId.value || !ids.has(selectedRadioId.value)) {
      selectedRadioId.value = defaultRadioId.value
    }
  }

  const selectedEntry = computed<RadioListEntry | null>(() => {
    if (!isMultiRadio.value) return null
    const id = effectiveSelectedId.value
    return radios.value.find((r) => r.id === id) ?? null
  })

  /** Air settings for the active radio (multi entry or legacy top-level). */
  const activeRadioAirConfig = computed<Record<string, any>>(() => {
    if (selectedEntry.value) {
      return asRecord(selectedEntry.value.radio)
    }
    return asRecord(rootConfig.value.radio)
  })

  /** Hardware sections for the active radio. */
  const activeHardware = computed(() => {
    const entry = selectedEntry.value
    if (entry) {
      return {
        radio_type: entry.radio_type ?? rootConfig.value.radio_type,
        sx1262: asRecord(entry.sx1262),
        ch341: asRecord(entry.ch341),
        kiss: asRecord(entry.kiss),
        modem_usb: asRecord(entry.modem_usb),
        modem_tcp: asRecord(entry.modem_tcp),
      }
    }
    return {
      radio_type: rootConfig.value.radio_type,
      sx1262: asRecord(rootConfig.value.sx1262),
      ch341: asRecord(rootConfig.value.ch341),
      kiss: asRecord(rootConfig.value.kiss),
      modem_usb: asRecord(rootConfig.value.modem_usb),
      modem_tcp: asRecord(rootConfig.value.modem_tcp),
    }
  })

  const radioOptions = computed(() =>
    radios.value.map((r) => ({
      id: r.id,
      label: r.id,
      radio_type: String(r.radio_type ?? 'unknown'),
      isDefault: r.id === defaultRadioId.value,
    })),
  )

  const txMode = computed<FabricTxMode>(() => {
    const mode = String(fabric.value.tx_mode || 'default').toLowerCase()
    if (mode === 'sticky' || mode === 'bridge') return mode
    return 'default'
  })

  const repeatOnIngress = computed(() => fabric.value.repeat_on_ingress === true)

  const originTx = computed<FabricOriginTx>(() => {
    // origin_tx wins over local_tx_mode, matching the backend's key order.
    const raw = fabric.value.origin_tx ?? fabric.value.local_tx_mode
    return String(raw ?? 'default').trim().toLowerCase() === 'all' ? 'all' : 'default'
  })

  return {
    rootConfig,
    radios,
    fabric,
    radioStack,
    isMultiRadio,
    defaultRadioId,
    selectedRadioId,
    effectiveSelectedId,
    selectedEntry,
    activeRadioAirConfig,
    activeHardware,
    radioOptions,
    txMode,
    repeatOnIngress,
    originTx,
    selectRadio,
    ensureSelection,
  }
}

export type MultiRadioConfig = ReturnType<typeof useMultiRadioConfig>
