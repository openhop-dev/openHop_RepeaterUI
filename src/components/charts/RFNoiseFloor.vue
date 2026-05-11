<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';

// Props
interface Props {
  limit?: number;
}

const props = withDefaults(defineProps<Props>(), {
  limit: undefined,
});

// Use packet store for real API data
const store = usePacketStore();
const systemStore = useSystemStore();
const dataService = useDataService();

// Chart dimensions
const chartWidth = 200;
const chartHeight = 50;
const padding = 4;

// Calculate percentile value from sorted array
const percentile = (sorted: number[], p: number): number => {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

// Convert data points to scatter plot coordinates with 95th percentile normalization
const scatterPoints = computed(() => {
  const data = dataPoints.value;
  if (data.length === 0) return [];

  // Sort data to calculate percentiles
  const sorted = [...data].sort((a, b) => a - b);

  // Use 2.5th and 97.5th percentiles for bounds (95% of data)
  const p2_5 = percentile(sorted, 2.5);
  const p97_5 = percentile(sorted, 97.5);
  const dataRange = p97_5 - p2_5;

  // Add 5% headroom on each side
  const headroom = Math.max(dataRange * 0.05, 0.5);
  const minVal = p2_5 - headroom;
  const maxVal = p97_5 + headroom;
  const range = maxVal - minVal || 1;

  return data.map((value, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (chartWidth - padding * 2);
    // Invert Y: higher (less negative) values should be higher on chart
    // Clamp outliers to chart bounds
    const clampedValue = Math.max(minVal, Math.min(maxVal, value));
    const normalizedValue = (clampedValue - minVal) / range;
    const y = chartHeight - padding - normalizedValue * (chartHeight - padding * 2);
    return { x, y };
  });
});

// DataService polls noiseFloor every 60s. Ensure data is present on mount
// (safety net if bootstrap somehow skipped it).
onMounted(() => {
  void dataService.ensure('noiseFloor');
});

// Prefer the WS-pushed value from systemStore (updates without any HTTP poll),
// fall back to the last point in the HTTP history if stats haven't arrived yet.
const noiseLevel = computed<number | null>(
  () => systemStore.noiseFloorDbm ?? store.currentNoiseFloor,
);

// Get sparkline data from store
const dataPoints = computed(() => {
  return store.noiseFloorSparklineData;
});
</script>

<template>
  <div class="bg-transparent dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10 p-5 relative overflow-hidden">
    <!-- CAD Calibration Overlay -->
    <div
      v-if="systemStore.cadCalibrationRunning"
      class="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg"
    >
      <div class="text-center">
        <div class="flex items-center justify-center gap-2 mb-2">
          <svg
            class="w-4 h-4 text-secondary animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
          </svg>
          <span class="text-secondary text-sm font-medium">CAD Calibration</span>
        </div>
        <p class="text-content-muted dark:text-content-muted text-xs">In Progress</p>
      </div>
    </div>

    <p class="text-content-secondary dark:text-content-muted text-xs uppercase mb-2">
      RF NOISE FLOOR
    </p>
    <div class="flex items-baseline gap-2 mb-4">
      <span class="text-content-primary dark:text-content-primary text-2xl font-medium">{{
        noiseLevel !== null ? noiseLevel : 'Unknown'
      }}</span>
      <span v-if="noiseLevel !== null" class="text-content-secondary dark:text-content-muted text-xs uppercase">dBm</span>
    </div>

    <!-- Scatter chart -->
    <svg
      class="w-full h-[50px]"
      :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Grid lines -->
      <line
        v-for="i in 3"
        :key="'grid-' + i"
        :x1="0"
        :y1="(i * chartHeight) / 4"
        :x2="chartWidth"
        :y2="(i * chartHeight) / 4"
        stroke="rgba(255, 255, 255, 0.1)"
        stroke-width="1"
      />

      <!-- Scatter points -->
      <circle
        v-for="(point, index) in scatterPoints"
        :key="'point-' + index"
        :cx="point.x"
        :cy="point.y"
        r="1.5"
        fill="rgba(245, 158, 11, 0.8)"
        class="transition-all duration-300"
      />
    </svg>
  </div>
</template>

<style scoped>
@keyframes sparkline-draw {
  from {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
  }
  to {
    stroke-dasharray: 1000;
    stroke-dashoffset: 0;
  }
}

.sparkline-animate {
  animation: sparkline-draw 1s ease-out;
}
</style>
