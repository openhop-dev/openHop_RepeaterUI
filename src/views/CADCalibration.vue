<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { ApiService, API_SERVER_URL } from '@/utils/api';
import { useSystemStore } from '@/stores/system';
import { getToken } from '@/utils/auth';
import Plotly from 'plotly.js-dist-min';
import RestartModal from '@/components/modals/RestartModal.vue';

defineOptions({ name: 'CADCalibrationView' });

const systemStore = useSystemStore();

// Detect theme for chart colors
const isDarkMode = computed(() => document.documentElement.classList.contains('dark'));

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const toRgba = (color: string, alpha: number): string => {
  const value = color.trim();
  const clamped = Math.max(0, Math.min(1, alpha));

  const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const normalized = hex.length === 3
      ? hex.split('').map((ch) => ch + ch).join('')
      : hex;
    const int = Number.parseInt(normalized, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  const rgbMatch = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  const rgbaMatch = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  return value;
};

// Theme-aware chart colors
const getChartColors = () => {
  const dark = isDarkMode.value;
  const heading = cssVar('--color-text-primary', dark ? '#f9fafb' : '#111827');
  const muted = cssVar('--color-text-muted', dark ? '#9ca3af' : '#6b7280');
  const secondary = cssVar('--color-text-secondary', dark ? '#d1d5db' : '#374151');
  const border = cssVar('--color-border-subtle', dark ? '#4b5563' : '#d1d5db');
  const cyan = cssVar('--color-accent-cyan', '#06b6d4');
  const green = cssVar('--color-accent-green', '#10b981');

  return {
    title: heading,
    subtitle: muted,
    axis: secondary,
    tick: muted,
    grid: toRgba(border, dark ? 0.3 : 0.4),
    zeroline: toRgba(border, dark ? 0.45 : 0.55),
    line: toRgba(border, dark ? 0.6 : 0.7),
    colorbarBorder: toRgba(border, dark ? 0.55 : 0.65),
    markerLine: toRgba(border, dark ? 0.55 : 0.65),
    heatmapZero: toRgba(muted, 0.4),
    heatmapLow: toRgba(cyan, 0.3),
    heatmapMid: toRgba(cyan, 0.6),
    heatmapHigh: toRgba(green, 0.9),
  };
};

// TypeScript interfaces
interface CalibrationResult {
  det_peak: number;
  det_min: number;
  detection_rate: number;
  detections: number;
  samples: number;
}

interface RangeInfo {
  spreading_factor: number;
  peak_min: number;
  peak_max: number;
  min_min: number;
  min_max: number;
}

interface CalibrationUpdate {
  type: 'status' | 'progress' | 'result' | 'complete' | 'completed' | 'error';
  message?: string;
  results?: {
    best?: CalibrationResult;
    recommended?: CalibrationResult;
    total_tests?: number;
  };
  test_ranges?: RangeInfo;
  current?: number;
  total?: number;
  det_peak?: number;
  det_min?: number;
  detection_rate?: number;
  detections?: number;
  samples?: number;
}

// State management
const isRunning = ref(false);
const startTime = ref<number | null>(null);
const eventSource = ref<EventSource | null>(null);
const calibrationData = ref<Record<string, CalibrationResult>>({});
const bestCalibrationResult = ref<CalibrationResult | null>(null);
const backendRecommendedResult = ref<CalibrationResult | null>(null);
const individualSamples = ref<unknown[]>([]);
const allTestResults = ref<Record<string, unknown>>({});

// Status and progress
const statusMessage = ref('Ready to start calibration');
const progressCurrent = ref(0);
const progressTotal = ref(0);
const testsCompleted = ref(0);
const bestRate = ref(0);
const avgRate = ref(0);
const elapsedTime = ref(0);

// Chart configuration
const rangeInfo = ref<RangeInfo | null>(null);
const showRangeInfo = ref(false);
const showResults = ref(false);
const showBestResult = ref(false);
const showNoResults = ref(false);

// Timer for elapsed time
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

// Plotly chart configuration
const plotlyConfig = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['pan2d', 'select2d', 'lasso2d', 'autoScale2d'],
  displaylogo: false,
  toImageButtonOptions: {
    format: 'png',
    filename: 'cad-calibration-heatmap',
    height: 600,
    width: 800,
    scale: 2,
  },
};

// Initialize Plotly chart
function initChart() {
  const colors = getChartColors();

  // Create initial empty scatter plot
  const data = [
    {
      x: [],
      y: [],
      z: [],
      mode: 'markers',
      type: 'scatter',
      marker: {
        size: 12,
        color: [],
        colorscale: [
          [0, colors.heatmapZero],
          [0.1, colors.heatmapLow],
          [0.5, colors.heatmapMid],
          [1, colors.heatmapHigh],
        ],
        showscale: true,
        colorbar: {
          title: {
            text: 'Detection Rate (%)',
            font: { color: colors.axis, size: 14 },
          },
          tickfont: { color: colors.tick },
          bgcolor: 'transparent',
          bordercolor: colors.colorbarBorder,
          borderwidth: 1,
          thickness: 15,
        },
        line: {
          color: colors.markerLine,
          width: 1,
        },
      },
      hovertemplate:
        '<b>Peak:</b> %{x}<br>' +
        '<b>Min:</b> %{y}<br>' +
        '<b>Detection Rate:</b> %{marker.color:.1f}%<br>' +
        '<extra></extra>',
      name: 'Test Results',
    },
  ];

  const layout = {
    title: {
      text: `CAD Detection Rate<br><sub style="color: ${colors.subtitle};">Channel Activity Detection Calibration</sub>`,
      font: { color: colors.title, size: 18 },
      x: 0.5,
    },
    xaxis: {
      title: {
        text: 'CAD Peak Threshold',
        font: { color: colors.axis, size: 14 },
      },
      tickfont: { color: colors.tick },
      gridcolor: colors.grid,
      zerolinecolor: colors.zeroline,
      linecolor: colors.line,
    },
    yaxis: {
      title: {
        text: 'CAD Min Threshold',
        font: { color: colors.axis, size: 14 },
      },
      tickfont: { color: colors.tick },
      gridcolor: colors.grid,
      zerolinecolor: colors.zeroline,
      linecolor: colors.line,
    },
    plot_bgcolor: 'transparent',
    paper_bgcolor: 'transparent',
    font: { color: colors.title, family: 'Inter, system-ui, sans-serif' },
    margin: { l: 80, r: 80, t: 100, b: 80 },
    showlegend: false,
  };

  Plotly.newPlot('plotly-chart', data, layout, plotlyConfig);
}

// Update chart with new calibration data
function updateChart() {
  if (Object.keys(calibrationData.value).length === 0) return;

  const results = Object.values(calibrationData.value);
  const xData: number[] = [];
  const yData: number[] = [];
  const colorData: number[] = [];

  // Create scatter plot data points
  for (const result of results) {
    xData.push(result.det_peak);
    yData.push(result.det_min);
    colorData.push(result.detection_rate);
  }

  // Update the scatter plot
  const update = {
    x: [xData],
    y: [yData],
    'marker.color': [colorData],
    hovertemplate:
      '<b>Peak:</b> %{x}<br>' +
      '<b>Min:</b> %{y}<br>' +
      '<b>Detection Rate:</b> %{marker.color:.1f}%<br>' +
      '<b>Status:</b> Tested<br>' +
      '<extra></extra>',
  };

  Plotly.restyle('plotly-chart', update, [0]);
}

// Start calibration
async function startCalibration() {
  const samples = 10;
  const delay = 50;

  try {
    const result = await ApiService.post('/cad-calibration-start', {
      samples,
      delay,
    });

    if (result.success) {
      isRunning.value = true;
      startTime.value = Date.now();

      // Update global calibration state
      systemStore.setCadCalibrationRunning(true);

      // Reset state
      calibrationData.value = {};
      individualSamples.value = [];
      allTestResults.value = {};
      bestCalibrationResult.value = null;
      backendRecommendedResult.value = null;

      // Reset UI
      showRangeInfo.value = false;
      showResults.value = false;
      showBestResult.value = false;
      showNoResults.value = false;

      // Reset statistics
      testsCompleted.value = 0;
      bestRate.value = 0;
      avgRate.value = 0;
      elapsedTime.value = 0;
      progressCurrent.value = 0;
      progressTotal.value = 0;

      // Start elapsed time timer
      elapsedTimer = setInterval(() => {
        if (startTime.value) {
          elapsedTime.value = Math.floor((Date.now() - startTime.value) / 1000);
        }
      }, 1000);

      // Start SSE connection
      connectEventSource();
    } else {
      throw new Error(result.error || 'Failed to start calibration');
    }
  } catch (error) {
    statusMessage.value = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Stop calibration
async function stopCalibration() {
  try {
    const result = await ApiService.post('/cad-calibration-stop');

    if (result.success) {
      isRunning.value = false;

      // Update global calibration state
      systemStore.setCadCalibrationRunning(false);

      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    }
  } catch (error) {
    console.error('Failed to stop calibration:', error);
  }
}

// Connect to Server-Sent Events
function connectEventSource() {
  if (eventSource.value) {
    eventSource.value.close();
  }

  // Get auth token for EventSource (must be in URL since EventSource doesn't support headers)
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

  // Use the API server URL from the API configuration
  eventSource.value = new EventSource(`${API_SERVER_URL}/api/cad-calibration-stream${tokenParam}`);

  eventSource.value.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      handleCalibrationUpdate(data);
    } catch (error) {
      console.error('Failed to parse SSE data:', error);
    }
  };

  eventSource.value.onerror = function (event) {
    console.error('SSE connection error:', event);
    if (!isRunning.value) {
      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }
    }
  };
}

// Handle calibration updates
function handleCalibrationUpdate(data: CalibrationUpdate) {
  switch (data.type) {
    case 'status':
      statusMessage.value = data.message || 'Status update';
      if (data.test_ranges) {
        rangeInfo.value = data.test_ranges;
        showRangeInfo.value = true;
      }
      break;

    case 'progress':
      progressCurrent.value = data.current || 0;
      progressTotal.value = data.total || 0;
      testsCompleted.value = data.current || 0;
      break;

    case 'result':
      if (
        data.det_peak !== undefined &&
        data.det_min !== undefined &&
        data.detection_rate !== undefined &&
        data.detections !== undefined &&
        data.samples !== undefined
      ) {
        const key = `${data.det_peak}_${data.det_min}`;
        calibrationData.value[key] = {
          det_peak: data.det_peak,
          det_min: data.det_min,
          detection_rate: data.detection_rate,
          detections: data.detections,
          samples: data.samples,
        };
        updateChart();
        updateStats();
      }
      break;

    case 'complete':
    case 'completed':
      isRunning.value = false;
      statusMessage.value = data.message || 'Calibration completed';

      if (data.results?.recommended) {
        backendRecommendedResult.value = data.results.recommended;
      } else if (data.results?.best) {
        backendRecommendedResult.value = data.results.best;
      }

      // Update global calibration state
      systemStore.setCadCalibrationRunning(false);

      calculateAndShowResults();

      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      break;

    case 'error':
      statusMessage.value = `Error: ${data.message}`;

      // Update global calibration state on error
      systemStore.setCadCalibrationRunning(false);

      stopCalibration();
      break;
  }
}

// Update statistics
function updateStats() {
  const rates = Object.values(calibrationData.value).map(
    (d: CalibrationResult) => d.detection_rate,
  );
  if (rates.length === 0) return;

  bestRate.value = Math.max(...rates);
  avgRate.value = rates.reduce((a, b) => a + b, 0) / rates.length;
}

// Calculate and show results
function calculateAndShowResults() {
  showResults.value = true;

  // Prefer backend-selected result when available.
  if (backendRecommendedResult.value) {
    bestCalibrationResult.value = backendRecommendedResult.value;
    showBestResult.value = true;
    showNoResults.value = false;
    return;
  }

  // Find best result
  let bestResult = null;
  let bestRateValue = 0;

  for (const result of Object.values(calibrationData.value)) {
    if (result.detection_rate > bestRateValue) {
      bestRateValue = result.detection_rate;
      bestResult = result;
    }
  }

  bestCalibrationResult.value = bestResult;

  if (bestResult && bestRateValue > 0) {
    showBestResult.value = true;
    showNoResults.value = false;
  } else {
    showBestResult.value = false;
    showNoResults.value = true;
  }
}

const showRestartModal = ref(false);

// Save calibration settings — shows restart prompt on success
async function saveSettings() {
  if (!bestCalibrationResult.value) {
    statusMessage.value = 'Error: No calibration results to save';
    return;
  }

  try {
    const result = await ApiService.post('/save_cad_settings', {
      peak: bestCalibrationResult.value.det_peak,
      min_val: bestCalibrationResult.value.det_min,
      detection_rate: bestCalibrationResult.value.detection_rate,
    });

    if (result.success) {
      showRestartModal.value = true;
    } else {
      throw new Error(result.error || 'Failed to save settings');
    }
  } catch (error) {
    statusMessage.value = `Error: Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}


// Lifecycle
onMounted(() => {
  initChart();
});

onUnmounted(() => {
  if (eventSource.value) {
    eventSource.value.close();
  }
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
  }
  // Clear global calibration state when leaving page
  systemStore.setCadCalibrationRunning(false);

  // Clean up Plotly chart - check if element exists first
  const chartElement = document.getElementById('plotly-chart');
  if (chartElement) {
    Plotly.purge('plotly-chart');
  }
});
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-content-primary">
        CAD Calibration Tool
      </h1>
      <p class="text-content-secondary dark:text-content-muted mt-2">
        Channel Activity Detection calibration
      </p>
    </div>

    <!-- Controls -->
    <div class="glass-card rounded-[15px] p-6">
      <div class="flex justify-center">
        <div class="flex gap-4">
          <button
            @click="startCalibration"
            :disabled="isRunning"
            class="flex items-center gap-3 px-6 py-3 bg-accent-green/opacity-light hover:bg-accent-green/opacity-medium disabled:bg-background-mute/opacity-light text-accent-green disabled:text-content-muted rounded-lg border border-accent-green/opacity-medium disabled:border-stroke-subtle/20 transition-colors disabled:cursor-not-allowed"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <div class="text-left">
              <div class="font-medium">Start Calibration</div>
              <div class="text-xs opacity-80">Begin testing</div>
            </div>
          </button>

          <button
            @click="stopCalibration"
            :disabled="!isRunning"
            class="flex items-center gap-3 px-6 py-3 bg-accent-red/opacity-light hover:bg-accent-red/opacity-medium disabled:bg-background-mute/opacity-light text-accent-red disabled:text-content-muted rounded-lg border border-accent-red/opacity-medium disabled:border-stroke-subtle/20 transition-colors disabled:cursor-not-allowed"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
            <div class="text-left">
              <div class="font-medium">Stop</div>
              <div class="text-xs opacity-80">Halt calibration</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Status and Progress -->
    <div class="glass-card rounded-[15px] p-6 space-y-4">
      <!-- Status message -->
      <div class="text-content-primary">{{ statusMessage }}</div>

      <!-- Info row: fixed height, swaps between config and results -->
      <div class="flex items-center justify-between gap-4 px-4 bg-primary/opacity-light border border-primary/opacity-medium rounded-lg h-[52px] overflow-hidden">
        <!-- Config (before complete) -->
        <div v-if="!showResults && showRangeInfo && rangeInfo" class="text-content-primary dark:text-primary text-sm">
          <strong>Configuration:</strong>
          SF{{ rangeInfo.spreading_factor }} | Peak: {{ rangeInfo.peak_min }}–{{ rangeInfo.peak_max }} | Min: {{ rangeInfo.min_min }}–{{ rangeInfo.min_max }} |
          {{ (rangeInfo.peak_max - rangeInfo.peak_min + 1) * (rangeInfo.min_max - rangeInfo.min_min + 1) }} tests
        </div>
        <!-- Placeholder before calibration starts -->
        <div v-else-if="!showResults" class="text-content-muted text-sm italic">
          Awaiting calibration…
        </div>
        <!-- Results (when complete) -->
        <div v-else-if="showBestResult && bestCalibrationResult" class="text-content-primary text-sm">
          <span class="text-accent-green font-medium">Optimal settings found — </span>
          Peak: <strong>{{ bestCalibrationResult.det_peak }}</strong>,
          Min: <strong>{{ bestCalibrationResult.det_min }}</strong>,
          Rate: <strong>{{ bestCalibrationResult.detection_rate.toFixed(1) }}%</strong>
        </div>
        <div v-else-if="showNoResults" class="text-content-secondary dark:text-content-muted text-sm">
          No optimal settings found. Consider running calibration again.
        </div>

        <!-- Save Settings button — appears to the right when complete -->
        <button
          v-if="showBestResult && bestCalibrationResult"
          @click="saveSettings"
          class="btn-primary flex-shrink-0 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          Save Settings
        </button>
      </div>

      <!-- Progress bar (always present, height never changes) -->
      <div class="space-y-2">
        <div class="w-full bg-white/opacity-light rounded-full h-2">
          <div
            class="bg-gradient-to-r from-primary to-accent-green h-2 rounded-full transition-all duration-300"
            :style="{
              width: progressTotal > 0 ? `${(progressCurrent / progressTotal) * 100}%` : '0%',
            }"
          ></div>
        </div>
        <div class="text-content-secondary dark:text-content-muted text-sm">
          {{ progressCurrent }} / {{ progressTotal }} tests completed
        </div>
      </div>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ testsCompleted }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Tests Completed</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ bestRate.toFixed(1) }}%</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">
          Best Detection Rate
        </div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ avgRate.toFixed(1) }}%</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Average Rate</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ elapsedTime }}s</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Elapsed Time</div>
      </div>
    </div>

    <!-- Chart -->
    <div class="glass-card rounded-[15px] p-6">
      <div id="plotly-chart" class="w-full h-96"></div>
    </div>

  </div>

  <RestartModal
    v-model="showRestartModal"
    title="CAD Calibration Saved: Restart Required"
    message="In order for the CAD Calibration settings to take effect and the noise floor to return to normal, the service needs to be restarted."
  />
</template>

<style scoped>
.glass-card {
  background: var(--color-glass-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--color-glass-border);
  box-shadow: var(--color-glass-shadow);
}
</style>
