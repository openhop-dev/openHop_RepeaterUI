<script setup lang="ts">
/**
 * RadioAirtimePanel.vue
 *
 * One radio's slice of the Airtime Utilization card: heading, legend, canvas
 * and summary. Rendering only. The parent owns fetching, bucketing, smoothing
 * and the shared Y scale, so two panels of a Fabric bridge stay directly
 * comparable instead of each drawing on its own axis.
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue';
import ChartCard from '@/components/ui/ChartCard.vue';
import { axisLabelDecimals, type UtilSample } from '@/composables/useAirtimeSeries';

defineOptions({ name: 'RadioAirtimePanel' });

const props = defineProps<{
  /** Radio id, shown as the heading when the node has more than one radio */
  radioId?: string | null;
  /** Frequency line, already formatted (e.g. "869.618 MHz") */
  frequency?: string | null;
  /** Modulation line, already formatted (e.g. "SF8 · 62.5 kHz · CR 4/8") */
  modulation?: string | null;
  /** Full modulation detail including preamble, used as tooltip and for readers */
  modulationDetail?: string | null;
  samples: UtilSample[];
  /** Full-scale percentage for this panel's own Y axis */
  yAxisMax: number;
  isLoading: boolean;
  isUpdating?: boolean;
  error?: string | null;
  status?: string;
  /** Shown inside the chart frame when this radio carried nothing */
  emptyMessage?: string;
  /** Sentence read by screen readers in place of the canvas */
  summary?: string;
}>();

const emit = defineEmits<{ retry: [] }>();

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return (
    window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
};

// Same two colours in every panel: the heading carries radio identity, so the
// lines keep meaning RX and TX rather than meaning "which radio".
const CHART_COLORS = {
  rx: cssVar('--color-secondary', 'violet'),
  tx: cssVar('--color-accent-red', 'tomato'),
} as const;

const getChartChrome = () => ({
  gridLine: cssVar('--color-border-subtle', 'lightgray'),
  axisLabel: cssVar('--color-text-muted', 'gray'),
});

const chartRef = ref<HTMLCanvasElement | null>(null);

/** Plot area of the last paint, so pointer positions map back onto samples. */
const geometry = ref<{
  leftMargin: number;
  padding: number;
  chartWidth: number;
  chartHeight: number;
  height: number;
} | null>(null);

const hoverIndex = ref<number | null>(null);
const tooltipClientX = ref(0);
const tooltipClientY = ref(0);
const tooltipFlipLeft = ref(false);

const hoveredSample = computed(() =>
  hoverIndex.value === null ? null : (props.samples[hoverIndex.value] ?? null),
);

const hoveredTime = computed(() => {
  if (!hoveredSample.value) return '';
  return new Date(hoveredSample.value.timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
});

const tooltipStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${tooltipClientY.value + 14}px`,
  left: tooltipFlipLeft.value
    ? `${tooltipClientX.value - 150}px`
    : `${tooltipClientX.value + 14}px`,
  zIndex: 9999,
}));

const isInteractive = computed(() => !props.isLoading && !props.error && props.samples.length > 1);

const onPointerMove = (event: PointerEvent) => {
  const canvas = chartRef.value;
  const plot = geometry.value;
  if (!canvas || !plot || !isInteractive.value) return;
  // Touch has no hover to end, so a tap would leave the readout stuck open and
  // a drag would fight the page scroll. Hovering pointers only.
  if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;

  const rect = canvas.getBoundingClientRect();
  const fraction = (event.clientX - rect.left - plot.leftMargin) / plot.chartWidth;
  const index = Math.round(Math.max(0, Math.min(1, fraction)) * (props.samples.length - 1));

  hoverIndex.value = index;
  tooltipClientX.value = event.clientX;
  tooltipClientY.value = event.clientY;
  tooltipFlipLeft.value = event.clientX > window.innerWidth - 170;
};

const onPointerLeave = () => {
  hoverIndex.value = null;
};

const hasHeading = computed(() => Boolean(props.radioId));
const hasActivity = computed(() => props.samples.some((s) => s.rxUtil > 0 || s.txUtil > 0));
const canvasLabel = computed(() =>
  props.radioId
    ? `Airtime utilization for radio ${props.radioId}`
    : 'Airtime utilization over the last 24 hours',
);

const drawChart = () => {
  const canvas = chartRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const container = canvas.parentElement;
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;
  if (width === 0 || height === 0) return;

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const padding = 20;
  const leftMargin = 45; // Space for Y-axis labels

  ctx.clearRect(0, 0, width, height);

  const chrome = getChartChrome();

  if (props.isLoading) {
    ctx.fillStyle = chrome.axisLabel;
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Loading chart data...', width / 2, height / 2);
    return;
  }

  // Keep the axis drawn for an idle radio: an empty frame reads as "nothing
  // happened here", a blank box reads as "this is broken".
  const samples = props.samples;

  const chartWidth = width - leftMargin - padding;
  const chartHeight = height - padding * 2;
  geometry.value = { leftMargin, padding, chartWidth, chartHeight, height };
  const displayRange = props.yAxisMax || 1;
  // Each panel scales to its own traffic, so the axis can be a fraction of a
  // percent; fixed whole-number labels would collapse to a column of zeros.
  const decimals = axisLabelDecimals(displayRange);

  ctx.strokeStyle = chrome.gridLine;
  ctx.lineWidth = 1;
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    const value = displayRange - (i / 5) * displayRange;
    ctx.fillStyle = chrome.axisLabel;
    ctx.fillText(`${value.toFixed(decimals)}%`, leftMargin - 5, y + 3);
  }

  for (let i = 0; i <= 6; i++) {
    const x = leftMargin + (chartWidth * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  if (samples.length < 2) return;

  const drawSeries = (key: 'rxUtil' | 'txUtil', color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((point, index) => {
      const x = leftMargin + (chartWidth * index) / (samples.length - 1);
      const y =
        height - padding - (Math.min(point[key], displayRange) / displayRange) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  drawSeries('rxUtil', CHART_COLORS.rx);
  drawSeries('txUtil', CHART_COLORS.tx);

  const hovered = hoverIndex.value;
  if (hovered === null || hovered < 0 || hovered >= samples.length) return;

  // Readout crosshair: the axis has no time labels, so the only way to ask
  // "when was that peak" is to point at it.
  const x = leftMargin + (chartWidth * hovered) / (samples.length - 1);
  ctx.strokeStyle = chrome.axisLabel;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, padding);
  ctx.lineTo(x, height - padding);
  ctx.stroke();

  for (const [key, color] of [
    ['rxUtil', CHART_COLORS.rx],
    ['txUtil', CHART_COLORS.tx],
  ] as const) {
    const value = Math.min(samples[hovered][key], displayRange);
    const y = height - padding - (value / displayRange) * chartHeight;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

watch(
  () => [props.samples, props.yAxisMax, props.isLoading] as const,
  () => nextTick(() => drawChart()),
);

// Redraw for the crosshair alone: repainting ~480 points costs less than
// keeping a second overlay canvas in sync with the series.
watch(hoverIndex, () => drawChart());

// A refresh can shorten the series out from under a held pointer.
watch(
  () => props.samples.length,
  () => {
    hoverIndex.value = null;
  },
);

onMounted(() => {
  nextTick(() => {
    drawChart();
    // Second pass once fonts and the grid have settled the container width.
    setTimeout(() => drawChart(), 100);
  });
  window.addEventListener('resize', drawChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', drawChart);
});

defineExpose({ drawChart });
</script>

<template>
  <section class="flex flex-col">
    <header v-if="hasHeading" class="mb-2">
      <h4 class="text-content-primary text-sm lg:text-base font-semibold">
        {{ radioId }}<span v-if="frequency"> · {{ frequency }}</span>
      </h4>
      <p
        v-if="modulation"
        class="text-content-secondary dark:text-content-muted text-xs"
        :title="modulationDetail ?? undefined"
      >
        {{ modulation }}
      </p>
      <p v-else class="text-content-secondary dark:text-content-muted text-xs">
        Radio airtime profile unavailable
      </p>
    </header>

    <div class="flex items-center gap-4 lg:gap-6 mb-3 lg:mb-4">
      <div class="flex items-center gap-2">
        <div class="w-5 lg:w-7 h-2 rounded bg-accent-purple"></div>
        <span class="text-content-secondary dark:text-content-primary text-xs lg:text-sm"
          >Rx Util</span
        >
      </div>
      <div class="flex items-center gap-2">
        <div class="w-5 lg:w-7 h-2 rounded bg-accent-red"></div>
        <span class="text-content-secondary dark:text-content-primary text-xs lg:text-sm"
          >Tx Util</span
        >
      </div>
    </div>

    <ChartCard
      class="h-40 lg:h-48"
      :is-loading="isLoading"
      :is-updating="isUpdating"
      :error="error"
      :status="status"
      @retry="emit('retry')"
    >
      <canvas
        ref="chartRef"
        class="absolute inset-0 w-full h-full"
        :class="isInteractive ? 'cursor-crosshair' : ''"
        role="img"
        :aria-label="canvasLabel"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerLeave"
      ></canvas>
      <p class="sr-only">{{ summary }}</p>
      <p
        v-if="!isLoading && !error && !hasActivity"
        class="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-content-muted pointer-events-none"
      >
        {{ emptyMessage ?? 'No activity in the last 24 hours.' }}
      </p>
    </ChartCard>

    <!-- Teleported so the panel's own bounds cannot clip it -->
    <Teleport to="body">
      <div
        v-if="hoveredSample"
        class="pointer-events-none rounded border border-stroke-subtle bg-surface-elevated px-2.5 py-2 text-sm leading-snug whitespace-nowrap text-content-primary shadow-lg dark:border-white/opacity-medium dark:bg-surface-elevated"
        :style="tooltipStyle"
      >
        <div class="text-content-secondary dark:text-content-muted text-xs">
          <span v-if="radioId">{{ radioId }} · </span>{{ hoveredTime }}
        </div>
        <div class="mt-1 flex items-center gap-2">
          <span class="h-2 w-3 rounded bg-accent-purple"></span>
          <span>Rx {{ hoveredSample.rxUtil.toFixed(2) }}%</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2 w-3 rounded bg-accent-red"></span>
          <span>Tx {{ hoveredSample.txUtil.toFixed(2) }}%</span>
        </div>
      </div>
    </Teleport>

    <slot name="summary" />
  </section>
</template>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
}
</style>
