<script setup lang="ts">
/**
 * Sparkline.vue
 *
 * A lightweight SVG-based sparkline component for stat cards.
 * Supports two rendering variants:
 * - 'smooth': Moving average trendline with bezier curves
 * - 'classic': Filled area chart (used on Statistics page)
 *
 * Features:
 * - Pure SVG rendering (no external dependencies)
 * - Moving average smoothing (~20% window size)
 * - Downsample to 10 points for clean rendering
 * - Optional loading spinner and center text display
 */
import { computed } from 'vue';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'SparklineChart' });

// ============================================================================
// Types
// ============================================================================

interface Props {
  title: string;
  value: number | string;
  color: string;
  data?: number[];
  showChart?: boolean;
  variant?: 'smooth' | 'classic';
  loading?: boolean;
  error?: string | null;
  centerText?: string;
  subtitle?: string;
  minY?: number;
  maxY?: number;
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  showChart: true,
  variant: 'smooth',
  loading: false,
  error: null,
  centerText: '',
  subtitle: '',
  minY: undefined,
  maxY: undefined,
});

const emit = defineEmits<{ retry: [] }>();

// ============================================================================
// Constants
// ============================================================================

const viewBoxWidth = 100;
const viewBoxHeight = 40;

// ============================================================================
// Data Processing
// ============================================================================

/**
 * Apply moving average smoothing and downsample to target points.
 * Window size: ~20% of data length (min 3, max 15)
 * Target output: 10 points for clean rendering
 */
const smoothData = (data: number[]): number[] => {
  if (data.length < 3) return data;

  // Window size: ~20% of data length, min 3, max 15
  const windowSize = Math.min(15, Math.max(3, Math.floor(data.length * 0.2)));
  const result: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const halfWindow = Math.floor(windowSize / 2);
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(data.length, i + halfWindow + 1);
    const window = data.slice(start, end);
    result.push(window.reduce((a, b) => a + b, 0) / window.length);
  }

  // Downsample to ~10 points for clean rendering
  const targetPoints = Math.min(10, result.length);
  const step = result.length / targetPoints;
  const downsampled: number[] = [];

  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.floor(i * step);
    downsampled.push(result[idx]);
  }

  return downsampled;
};

// Process data based on variant
const processedData = computed(() => {
  if (!props.data || props.data.length === 0) return [];
  return props.variant === 'smooth' ? smoothData(props.data) : props.data;
});

// ============================================================================
// SVG Path Generation
// ============================================================================

/** Create SVG path from data points with quadratic bezier curves */
const createPath = (data: number[]): string => {
  if (data.length < 2) return '';

  const maxVal = props.maxY ?? Math.max(...data);
  const minVal = props.minY ?? Math.min(...data);
  const range = maxVal - minVal || 1;
  const padding = props.variant === 'classic' ? 4 : 2;

  let path = '';

  data.forEach((value, index) => {
    const x = (index / (data.length - 1)) * viewBoxWidth;
    const normalizedValue = (value - minVal) / range;
    const y = padding + (viewBoxHeight - padding * 2) * (1 - normalizedValue);

    if (index === 0) {
      path += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
    } else {
      // Quadratic curve for smooth appearance
      const prevX = ((index - 1) / (data.length - 1)) * viewBoxWidth;
      const controlX = (prevX + x) / 2;
      path += ` Q ${controlX.toFixed(2)} ${y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  });

  return path;
};

// Computed sparkline path
const sparklinePath = computed(() => createPath(processedData.value));

// Filled path for classic variant
const filledPath = computed(() => {
  if (!sparklinePath.value) return '';
  return `${sparklinePath.value} L ${viewBoxWidth} ${viewBoxHeight} L 0 ${viewBoxHeight} Z`;
});

const svgId = computed(() => `sparkline-${props.title.replace(/\s+/g, '-').toLowerCase()}`);
</script>

<template>
  <div class="sparkline-card">
    <!-- Header: Title and Value -->
    <div class="card-header">
      <div>
        <p class="card-title">{{ title }}</p>
        <p class="card-subtitle">{{ subtitle }}</p>
      </div>
      <span class="card-value" :style="{ color }">
        <Spinner v-if="loading" size="sm" color="current" />
        <template v-else>{{ typeof value === 'number' ? value.toLocaleString() : value }}</template>
      </span>
    </div>

    <!-- Full-width content area -->
    <div v-if="showChart" class="card-chart">
      <!-- Loading -->
      <div v-if="loading && variant === 'classic'" class="chart-loader">
        <Spinner size="sm" />
      </div>

      <!-- Error with retry -->
      <div v-else-if="error" class="chart-error">
        <button class="chart-retry-btn" @click="emit('retry')">↺ Retry</button>
      </div>

      <!-- Center text (percentage) -->
      <div v-else-if="centerText" class="chart-text">
        <span class="percent-value">{{ centerText }}</span>
      </div>

      <!-- SVG Chart -->
      <svg
        v-else
        :id="svgId"
        class="chart-svg"
        :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
        preserveAspectRatio="none"
      >
        <template v-if="variant === 'classic'">
          <path
            v-if="processedData.length > 1"
            :d="filledPath"
            :fill="color"
            fill-opacity="0.8"
            class="sparkline-path"
          />
        </template>
        <template v-else>
          <path
            v-if="processedData.length > 1"
            :d="sparklinePath"
            :stroke="color"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
            class="sparkline-path"
          />
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.sparkline-card {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 12px 14px;
  backdrop-filter: blur(50px);
  overflow: hidden;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.04),
    0 1px 3px rgba(0, 0, 0, 0.02);
}

.dark .sparkline-card {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.card-title {
  color: rgba(75, 85, 99, 0.7);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.3s ease;
}

.dark .card-title {
  color: rgba(255, 255, 255, 0.6);
}

.card-subtitle {
  color: rgba(75, 85, 99, 0.5);
  font-size: 9px;
  font-weight: 400;
  margin-top: 2px;
  transition: color 0.3s ease;
}

.dark .card-subtitle {
  color: rgba(255, 255, 255, 0.4);
}

.card-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.card-chart {
  width: 100%;
  height: 28px;
  overflow: hidden;
}

.chart-svg {
  width: 100%;
  height: 100%;
}

.chart-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.chart-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.chart-retry-btn {
  font-size: 11px;
  color: rgba(75, 85, 99, 0.7);
  background: rgba(75, 85, 99, 0.08);
  border: 1px solid rgba(75, 85, 99, 0.15);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.chart-retry-btn:hover {
  background: rgba(75, 85, 99, 0.15);
}

.dark .chart-retry-btn {
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.dark .chart-retry-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.chart-text {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.percent-value {
  font-size: 20px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}

.sparkline-path {
  transition: d 1s ease-out;
}


@media (min-width: 1024px) {
  .sparkline-card {
    padding: 14px 16px;
  }

  .card-header {
    margin-bottom: 10px;
  }

  .card-title {
    font-size: 12px;
  }

  .card-value {
    font-size: 26px;
  }

  .card-chart {
    height: 32px;
  }

  .percent-value {
    font-size: 24px;
  }
}
</style>
