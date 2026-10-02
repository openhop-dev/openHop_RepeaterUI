<script setup lang="ts">
import { computed, watch } from 'vue'
import { usePacketStore } from '@/stores/packets'
import { useSystemStore } from '@/stores/system'
import { useRadioProfiles } from '@/composables/useRadioProfiles'
import InteractiveSparkline from '@/components/ui/InteractiveSparkline.vue'

defineOptions({ name: 'NoiseFloorSparkline' })

const packetStore = usePacketStore()
const systemStore = useSystemStore()
const { profiles, isMultiRadio, defaultRadioId } = useRadioProfiles()

// The scalar is the default radio's figure. On a single-radio node it is the
// whole story; on a bridge it is only a fallback for a backend too old to send
// noise_floor_radios, and is stamped so the curve does not read as a series of
// its own beside the radios that have names.
watch(
  () => systemStore.noiseFloorDbm,
  (dbm) => {
    if (dbm === null) return
    if (!isMultiRadio.value) {
      packetStore.appendNoiseFloorReading(dbm, null)
      return
    }
    if (Object.keys(systemStore.noiseFloorByRadio).length) return
    packetStore.appendNoiseFloorReading(dbm, defaultRadioId.value)
  },
  // Immediate, so a sidebar mounted after the first stats poll draws the
  // reading it already has instead of waiting for the figure to move.
  { immediate: true },
)

// Every radio's own sample, so a bridge's curves all advance on the same beat
// rather than the non-default ones waiting on the five-minute history refetch.
// The map is rebuilt on each stats poll, so only a changed figure is appended —
// what the scalar watch above does by only firing on a change.
const lastAppended = new Map<string, number>()
watch(
  () => systemStore.noiseFloorByRadio,
  (byRadio) => {
    for (const [radioId, dbm] of Object.entries(byRadio)) {
      if (lastAppended.get(radioId) === dbm) continue
      lastAppended.set(radioId, dbm)
      packetStore.appendNoiseFloorReading(dbm, radioId)
    }
  },
  { immediate: true },
)

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// The order the Statistics noise-floor chart uses, so a radio is the same
// colour wherever it is drawn.
const radioPalette = (): string[] => [
  cssVar('--color-primary', 'deepskyblue'),
  cssVar('--openhop-purple-light', '#a78bfa'),
  cssVar('--color-accent-cyan', '#06b6d4'),
  cssVar('--color-accent-green', '#10b981'),
]

const recentReadings = computed(() => {
  const oneHourAgo = Date.now() / 1000 - 3600
  return (packetStore.noiseFloorHistory ?? []).filter(
    (p) => p.noise_floor_dbm !== 0 && p.timestamp >= oneHourAgo,
  )
})

interface NoiseSeries {
  key: string
  label: string | null
  color?: string
  data: { value: number; timestamp: number }[]
  current: number
}

const series = computed<NoiseSeries[]>(() => {
  const readings = recentReadings.value

  if (!isMultiRadio.value) {
    // One radio needs no label and no colour of its own: unchanged.
    const current = systemStore.noiseFloorDbm ?? packetStore.currentNoiseFloor
    if (current === null || current === undefined) return []
    return [
      {
        key: 'node',
        label: null,
        data: readings.map((p) => ({ value: p.noise_floor_dbm, timestamp: p.timestamp })),
        current,
      },
    ]
  }

  const palette = radioPalette()
  const live = systemStore.noiseFloorByRadio
  const entries: NoiseSeries[] = []
  profiles.value.forEach((radio, index) => {
    const data = readings
      .filter((p) => p.radio_id === radio.radioId)
      .map((p) => ({ value: p.noise_floor_dbm, timestamp: p.timestamp }))
    // A radio with nothing to show is left out rather than drawn empty. The
    // figure is that radio's own: the scalar describes the default radio, so
    // the others would be wrong to borrow it.
    if (!data.length) return
    entries.push({
      key: radio.radioId,
      label: radio.radioId,
      color: palette[index % palette.length],
      data,
      current: live[radio.radioId] ?? data[data.length - 1].value,
    })
  })
  return entries
})
</script>

<template>
  <div
    v-if="series.length"
    class="mt-2 pt-2 border-t border-stroke-subtle dark:border-white/opacity-light"
  >
    <div v-for="(entry, index) in series" :key="entry.key" :class="index > 0 ? 'mt-2' : ''">
      <div
        class="flex items-center justify-between text-[10px] text-content-muted uppercase tracking-wide mb-1"
      >
        <span>
          Noise Floor<template v-if="entry.label"> • {{ entry.label }}</template>
        </span>
        <span class="text-content-primary normal-case tracking-normal font-medium">
          {{ entry.current.toFixed(1) }} dBm
        </span>
      </div>
      <InteractiveSparkline :data="entry.data" unit="dBm" :color="entry.color" />
    </div>
  </div>
</template>
