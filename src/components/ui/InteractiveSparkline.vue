<script setup lang="ts">
import { computed, ref } from 'vue'

defineOptions({ name: 'InteractiveSparkline' })

const props = withDefaults(
  defineProps<{
    data: { value: number; timestamp: number }[]
    height?: number
    unit?: string
  }>(),
  { height: 28, unit: '' },
)

// ── Geometry ──────────────────────────────────────────────────────────────────

const W = 240
const PAD = 2

const chartPoints = computed(() => {
  const pts = props.data
  if (pts.length < 2) return []

  const values = pts.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const H = props.height

  return pts.map((p, i) => ({
    x: PAD + (i / (pts.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((p.value - min) / range) * (H - PAD * 2),
    value: p.value,
    timestamp: p.timestamp,
  }))
})

const polylinePoints = computed(() =>
  chartPoints.value.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
)

const hasData = computed(() => chartPoints.value.length >= 2)

// ── Hover state ───────────────────────────────────────────────────────────────

const wrapperRef = ref<HTMLElement | null>(null)
const hoveredIndex = ref<number | null>(null)
const tooltipClientX = ref(0)
const tooltipClientY = ref(0)

const hoveredPoint = computed(() =>
  hoveredIndex.value !== null ? chartPoints.value[hoveredIndex.value] ?? null : null,
)

const hoveredTime = computed(() => {
  if (!hoveredPoint.value) return ''
  const d = new Date(hoveredPoint.value.timestamp * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
})

const tooltipFlipLeft = ref(false)

const tooltipStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${tooltipClientY.value + 12}px`,
  left: tooltipFlipLeft.value
    ? `${tooltipClientX.value - 110}px`
    : `${tooltipClientX.value + 12}px`,
  zIndex: 9999,
}))

const cursorPercent = computed(() => {
  if (!hoveredPoint.value) return 0
  return ((hoveredPoint.value.x - PAD) / (W - PAD * 2)) * 100
})

function onMouseMove(e: MouseEvent) {
  if (!wrapperRef.value || chartPoints.value.length < 2) return
  const rect = wrapperRef.value.getBoundingClientRect()
  const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const svgX = PAD + fraction * (W - PAD * 2)

  let closest = 0
  let minDist = Infinity
  chartPoints.value.forEach((p, i) => {
    const d = Math.abs(p.x - svgX)
    if (d < minDist) { minDist = d; closest = i }
  })
  hoveredIndex.value = closest
  tooltipClientX.value = e.clientX
  tooltipClientY.value = e.clientY
  tooltipFlipLeft.value = e.clientX > window.innerWidth - 120
}

function onMouseLeave() {
  hoveredIndex.value = null
}

// Expose hovered point so the parent can react (e.g. update a label).
defineExpose({ hoveredPoint })
</script>

<template>
  <div
    v-if="hasData"
    ref="wrapperRef"
    class="relative cursor-crosshair"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <svg
      :viewBox="`0 0 ${W} ${height}`"
      class="w-full text-secondary"
      :style="{ height: `${height}px` }"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        :points="polylinePoints"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        fill="none"
        opacity="0.7"
      />
      <circle
        v-if="hoveredPoint"
        :cx="hoveredPoint.x"
        :cy="hoveredPoint.y"
        r="2.5"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>

    <!-- Vertical cursor line -->
    <div
      v-if="hoveredPoint"
      class="absolute top-0 bottom-0 w-px bg-secondary opacity-40 pointer-events-none"
      :style="{ left: `${cursorPercent}%` }"
    />

    <!-- Tooltip — teleported to body to escape any overflow/clip context -->
    <Teleport to="body">
      <div
        v-if="hoveredPoint"
        class="pointer-events-none px-2.5 py-2 rounded text-sm leading-snug bg-surface-elevated dark:bg-surface-elevated border border-stroke-subtle dark:border-white/20 text-content-primary dark:text-content-primary whitespace-nowrap shadow-lg"
        :style="tooltipStyle"
      >
        {{ hoveredTime }}: <span class="font-medium">{{ hoveredPoint.value }}{{ unit ? ` ${unit}` : '' }}</span>
      </div>
    </Teleport>
  </div>
</template>
