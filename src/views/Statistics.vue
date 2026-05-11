<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, toRaw, watch, markRaw } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { useWebSocketStore } from '@/stores/websocket';
import ApiService from '@/utils/api';
import SparklineChart from '@/components/ui/Sparkline.vue';
import { getPreference, setPreference } from '@/utils/preferences';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  DoughnutController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  Filler,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
// Import Plotly.js for 3D pie chart
import Plotly from 'plotly.js-dist-min';
import { useManagedPolling } from '@/composables/useManagedPolling';

defineOptions({ name: 'StatisticsView' });

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  DoughnutController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  Filler,
  TimeScale,
);

interface MetricsData {
  series: Array<{
    name: string;
    type: string;
    data: Array<[number, number]>;
  }>;
}

interface PacketTypeSeries {
  name: string;
  type: string;
  data: Array<[number, number]>;
}

interface NoiseFloorData {
  chart_data: Array<{
    timestamp: number;
    noise_floor_dbm: number;
  }>;
}

interface NoiseFloorHistoryItem {
  timestamp: number;
  noise_floor_dbm?: number;
  noise_floor?: number;
}

interface NoiseFloorApiResponse {
  history: NoiseFloorHistoryItem[];
  hours: number;
  count: number;
}

interface RouteStatsData {
  hours: number;
  route_totals: Record<string, number>;
  total_packets: number;
  period: string;
  data_source: string;
}

interface SignalMetrics {
  timestamp: number;
  snr: number | null;
  rssi: number | null;
  noiseFloor: number;
}

const packetStore = usePacketStore();
const websocketStore = useWebSocketStore();
const isUpdatingCharts = ref(false);

// Helper function to get theme-aware colors
const getThemeColors = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    gridColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    tickColor: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
    legendColor: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
    titleColor: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
  };
};

// Time period selection
const selectedHours = ref(getPreference('statistics_selectedHours', 24));
const timeOptions = [
  { value: 1, label: '1 Hour' },
  { value: 6, label: '6 Hours' },
  { value: 12, label: '12 Hours' },
  { value: 24, label: '24 Hours' },
  { value: 48, label: '2 Days' },
  { value: 168, label: '1 Week' },
];

// Watch for changes and persist to localStorage
watch(selectedHours, (value) => setPreference('statistics_selectedHours', value));

// State for different metrics
const metricsData = ref<MetricsData | null>(null);
const noiseFloorData = ref<NoiseFloorData | null>(null);
const packetTypeData = ref<PacketTypeSeries[]>([]);
const routeStatsData = ref<RouteStatsData | null>(null);
const signalMetricsHistory = ref<SignalMetrics[]>([]);
const crcErrorData = ref<Array<{ timestamp: number; count: number }>>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Chart loading states
const chartLoadingStates = ref({
  packetRate: true,
  packetType: true,
  noiseFloor: false, // This loads fast
  routePie: true,
  sparklines: true,
});

// Chart error states
const packetRateChartError = ref(false);
const packetTypeChartError = ref(false);
const routePieChartError = ref(false);

// Chart instances
const packetRateChart = ref<ChartJS | null>(null);
const packetTypeChart = ref<ChartJS | null>(null);
const signalMetricsChart = ref<ChartJS | null>(null);

// Canvas refs
const packetRateCanvasRef = ref<HTMLCanvasElement | null>(null);
const packetTypeCanvasRef = ref<HTMLCanvasElement | null>(null);
const signalMetricsCanvasRef = ref<HTMLCanvasElement | null>(null);
// 3D Pie chart div ref for Plotly
const signalPie3DRef = ref<HTMLDivElement | null>(null);

// Top stats computed
const topStats = computed(() => {
  const stats = packetStore.packetStats;
  if (!stats) {
    return { totalRx: 0, totalTx: 0 };
  }

  return {
    totalRx: stats.total_packets || 0,
    totalTx: stats.transmitted_packets || 0,
  };
});

// Aggregate data into buckets - ~72 buckets regardless of time range
const aggregateToBuckets = (data: Array<[number, number]>, hours: number) => {
  if (data.length === 0) return [];

  const TARGET_BUCKETS = 72;
  const BUCKET_MS = Math.round((hours * 60 * 60 * 1000) / TARGET_BUCKETS);
  const buckets = new Map<number, number[]>();

  data.forEach(([timestamp, value]) => {
    // Normalize timestamp to milliseconds
    let normalizedTimestamp = timestamp;
    if (timestamp > 1e15) {
      normalizedTimestamp = timestamp / 1000;
    } else if (timestamp > 1e9 && timestamp < 1e12) {
      normalizedTimestamp = timestamp * 1000;
    }

    const bucketKey = Math.floor(normalizedTimestamp / BUCKET_MS) * BUCKET_MS;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(value);
  });

  // Convert to array and calculate average for each bucket, sorted by time
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, values]) => values.reduce((sum, v) => sum + v, 0) / values.length);
};

// Sparkline data computed from historical data
const sparklineData = computed(() => {
  // Generate sparkline data from metrics data for RX/TX
  let rxSparkline: number[] = [];
  let txSparkline: number[] = [];

  if (metricsData.value?.series) {
    const rxSeries = metricsData.value.series.find((s) => s.type === 'rx_count');
    const txSeries = metricsData.value.series.find((s) => s.type === 'tx_count');

    if (rxSeries?.data) {
      rxSparkline = aggregateToBuckets(rxSeries.data, selectedHours.value);
    }
    if (txSeries?.data) {
      txSparkline = aggregateToBuckets(txSeries.data, selectedHours.value);
    }
  }

  // If we don't have real data, generate empty arrays (will use default in Sparkline component)
  return {
    totalPackets: rxSparkline,
    transmittedPackets: txSparkline,
    droppedPackets: [], // No historical dropped data available
    crcErrors: aggregateToBuckets(
      crcErrorData.value.map((d) => {
        const ts = d.timestamp > 1e12 ? d.timestamp : d.timestamp * 1000;
        return [ts, d.count] as [number, number];
      }),
      selectedHours.value,
    ),
  };
});

// Fetch all required data
const fetchAllData = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Fetch packet stats for the selected time range (DataService caches 24h only,
    // so we need our own fetch here when the user picks a different window).
    await packetStore.fetchPacketStats({ hours: selectedHours.value });

    // Show the basic stats immediately
    isLoading.value = false;

    // Start loading charts immediately in parallel
    loadChartData();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch data';
    isLoading.value = false;
  }
};

// Load chart data without blocking UI
const loadChartData = async () => {
  // Reset chart loading states - all true for synchronized loading
  chartLoadingStates.value = {
    packetRate: true,
    packetType: true,
    noiseFloor: true,
    routePie: true,
    sparklines: true,
  };

  // Load all chart data in parallel immediately
  const promises = [
    loadMetricsData(),
    loadPacketTypeData(),
    loadRouteStatsData(),
    loadNoiseFloorData(),
    loadCrcErrorData(),
  ];

  // Wait for all data to load, then update charts ONCE
  try {
    await Promise.allSettled(promises);

    // Use nextTick to ensure Vue has fully rendered everything and canvas refs are available
    await nextTick();

    // If refs still aren't available, wait a bit more
    if (!packetRateCanvasRef.value || !packetTypeCanvasRef.value) {
      setTimeout(() => {
        createOrUpdateCharts();
      }, 100);
    } else {
      createOrUpdateCharts();
    }
  } catch (error) {
    console.error('Error loading chart data:', error);
  }
};

const loadMetricsData = async () => {
  try {
    const response = await ApiService.get('/metrics_graph_data', {
      hours: selectedHours.value,
      resolution: 'average',
      metrics: 'rx_count,tx_count',
    });

    if (response?.success) {
      metricsData.value = response.data as MetricsData;
    }
  } catch {
    metricsData.value = null;
  }
};

const loadPacketTypeData = async () => {
  try {
    const response = await ApiService.get('/packet_type_graph_data', {
      hours: selectedHours.value,
      resolution: 'average',
      types: 'all',
    });

    if (response?.success && response.data) {
      const data = response.data as { series: PacketTypeSeries[] };
      packetTypeData.value = data.series || [];
    }
  } catch {
    packetTypeData.value = [];
  }
};

const loadRouteStatsData = async () => {
  try {
    const response = await ApiService.get('/route_stats', { hours: selectedHours.value });

    if (response?.success && response.data) {
      routeStatsData.value = response.data as RouteStatsData;
    }
  } catch {
    routeStatsData.value = null;
  }
};

const loadNoiseFloorData = async () => {
  try {
    // Noise floor is recorded every 30 seconds
    // For the selected time range, fetch all available data
    // The backend efficiently handles the query and Chart.js can render large datasets

    const params: { hours: number; limit?: number } = { hours: selectedHours.value };
    // No limit - fetch all data for accurate representation

    const response = await ApiService.get('/noise_floor_history', params);

    if (response.success && response.data) {
      const responseData = response.data as NoiseFloorApiResponse;
      const historyData = responseData.history || [];
      if (Array.isArray(historyData) && historyData.length > 0) {
        noiseFloorData.value = {
          chart_data: historyData.map((item: NoiseFloorHistoryItem) => ({
            timestamp: item.timestamp || Date.now() / 1000,
            noise_floor_dbm: item.noise_floor_dbm || item.noise_floor || -120,
          })),
        };
        generateSignalMetricsHistory();
      }
    }
  } catch {
    noiseFloorData.value = { chart_data: [] };
  }
};

const loadCrcErrorData = async () => {
  try {
    const response = await ApiService.get('/crc_error_history', {
      hours: selectedHours.value,
    });

    if (response?.success && response.data) {
      const data = response.data as { history: Array<{ timestamp: number; count: number }> };
      crcErrorData.value = data.history || [];
    }
  } catch {
    crcErrorData.value = [];
  }
};

// Handle time period change
const onTimeRangeChange = () => {
  // Immediately show loading state for ALL charts
  chartLoadingStates.value = {
    packetRate: true,
    packetType: true,
    noiseFloor: true,
    routePie: true,
    sparklines: true,
  };
  // Destroy existing charts first to prevent memory leaks
  destroyAllCharts();
  // Reset error states
  packetRateChartError.value = false;
  packetTypeChartError.value = false;
  routePieChartError.value = false;
  // Fetch new data
  fetchAllData();
};

const generateSignalMetricsHistory = () => {
  // Use only real noise floor data from SQLite
  signalMetricsHistory.value = [];

  if (noiseFloorData.value?.chart_data && noiseFloorData.value.chart_data.length > 0) {
    // Plot all data points
    const rawData = noiseFloorData.value.chart_data;

    signalMetricsHistory.value = rawData.map((item) => ({
      timestamp: item.timestamp * 1000, // Convert to milliseconds for Chart.js
      snr: null, // No SNR data
      rssi: null, // No RSSI data
      noiseFloor: item.noise_floor_dbm,
    }));
  }
};

// Chart creation and update functions
const createOrUpdateCharts = () => {
  if (isUpdatingCharts.value) {
    return;
  }

  isUpdatingCharts.value = true;

  try {
    createOrUpdatePacketRateChart();
    createOrUpdatePacketTypeChart();
    createOrUpdateSignalMetricsChart();
    createOrUpdateSignalPieChart();

    // Clear ALL loading states together after charts are created
    setTimeout(() => {
      // Clear all loading states at once for synchronized reveal
      chartLoadingStates.value = {
        packetRate: false,
        packetType: false,
        noiseFloor: false,
        routePie: false,
        sparklines: false,
      };

      // Force a DOM update to ensure charts are visible
      setTimeout(() => {
        const rawPacketRateChart = toRaw(packetRateChart.value);
        const rawPacketTypeChart = toRaw(packetTypeChart.value);
        const rawSignalMetricsChart = toRaw(signalMetricsChart.value);

        if (rawPacketRateChart) {
          rawPacketRateChart.update('none');
        }
        if (rawPacketTypeChart) {
          rawPacketTypeChart.update('none');
        }
        if (rawSignalMetricsChart) {
          rawSignalMetricsChart.update('none');
        }
      }, 50);
    }, 100);
  } catch (error) {
    console.error('Error creating/updating charts:', error);
    // Reset chart instances on error to prevent memory leaks
    destroyAllCharts();
  } finally {
    isUpdatingCharts.value = false;
  }
};

// Safely destroy all charts to prevent memory leaks
const destroyAllCharts = () => {
  try {
    if (packetRateChart.value) {
      packetRateChart.value.destroy();
      packetRateChart.value = null;
    }
    if (packetTypeChart.value) {
      packetTypeChart.value.destroy();
      packetTypeChart.value = null;
    }
    if (signalMetricsChart.value) {
      signalMetricsChart.value.destroy();
      signalMetricsChart.value = null;
    }
    // Clear Plotly 3D chart
    if (signalPie3DRef.value) {
      Plotly.purge(signalPie3DRef.value);
    }
  } catch (e) {
    console.error('Error destroying charts:', e);
  }
};

const createOrUpdatePacketRateChart = () => {
  if (!packetRateCanvasRef.value) return;

  const ctx = packetRateCanvasRef.value.getContext('2d');
  if (!ctx) return;

  // Process metrics data
  let rxData: Array<{ x: number; y: number }> = [];
  let txData: Array<{ x: number; y: number }> = [];

  if (metricsData.value?.series) {
    const rxSeries = metricsData.value.series.find((s) => s.type === 'rx_count');
    const txSeries = metricsData.value.series.find((s) => s.type === 'tx_count');

    if (rxSeries?.data) {
      rxData = rxSeries.data.map(([timestamp, value]) => {
        // Your timestamps appear to be in microseconds (1762811880000000)
        // Need to convert to milliseconds for Chart.js
        let normalizedTimestamp = timestamp;
        if (timestamp > 1e15) {
          // Timestamp is in microseconds, divide by 1000 to get milliseconds
          normalizedTimestamp = timestamp / 1000;
        } else if (timestamp > 1e12) {
          // Timestamp is already in milliseconds
          normalizedTimestamp = timestamp;
        } else if (timestamp > 1e9) {
          // Timestamp is in seconds, multiply by 1000 to get milliseconds
          normalizedTimestamp = timestamp * 1000;
        } else {
          // Timestamp is too small, probably invalid
          normalizedTimestamp = Date.now();
        }
        return { x: normalizedTimestamp, y: value };
      });
    }
    if (txSeries?.data) {
      txData = txSeries.data.map(([timestamp, value]) => {
        // Your timestamps appear to be in microseconds (1762811880000000)
        // Need to convert to milliseconds for Chart.js
        let normalizedTimestamp = timestamp;
        if (timestamp > 1e15) {
          // Timestamp is in microseconds, divide by 1000 to get milliseconds
          normalizedTimestamp = timestamp / 1000;
        } else if (timestamp > 1e12) {
          // Timestamp is already in milliseconds
          normalizedTimestamp = timestamp;
        } else if (timestamp > 1e9) {
          // Timestamp is in seconds, multiply by 1000 to get milliseconds
          normalizedTimestamp = timestamp * 1000;
        } else {
          // Timestamp is too small, probably invalid
          normalizedTimestamp = Date.now();
        }
        return { x: normalizedTimestamp, y: value };
      });
    }
  }

  // Check if we have data
  if (rxData.length === 0 && txData.length === 0) {
    packetRateChartError.value = true;
    return;
  }

  packetRateChartError.value = false;

  // Always destroy and recreate the chart to prevent memory leaks
  if (packetRateChart.value) {
    packetRateChart.value.destroy();
    packetRateChart.value = null;
  }

  // Dynamic bucket size: maintain ~72 buckets regardless of time range (6hr/5min ratio)
  const TARGET_BUCKETS = 72;
  const BUCKET_MS = Math.round((selectedHours.value * 60 * 60 * 1000) / TARGET_BUCKETS);

  const aggregateToBuckets = (data: Array<{ x: number; y: number }>) => {
    if (data.length === 0) return [];

    const buckets = new Map<number, number[]>();

    data.forEach((point) => {
      const bucketKey = Math.floor(point.x / BUCKET_MS) * BUCKET_MS;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(point.y);
    });

    // Convert to array and calculate average for each bucket
    const aggregated = Array.from(buckets.entries())
      .map(([timestamp, values]) => ({
        x: timestamp,
        y: values.reduce((sum, v) => sum + v, 0) / values.length,
      }))
      .sort((a, b) => a.x - b.x);

    return aggregated;
  };

  // Apply Simple Moving Average (SMA) smoothing
  const applySMA = (data: Array<{ x: number; y: number }>, windowSize: number = 3) => {
    if (data.length < windowSize) return data;

    const smoothed: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      const window = data.slice(start, end);
      const avg = window.reduce((sum, p) => sum + p.y, 0) / window.length;
      smoothed.push({ x: data[i].x, y: avg });
    }

    return smoothed;
  };

  // Process: aggregate to 10-min buckets, then apply SMA
  const processedRxData = applySMA(aggregateToBuckets(rxData));
  const processedTxData = applySMA(aggregateToBuckets(txData));

  // Calculate Y-axis bounds with 5% headroom
  const allYValues = [...processedRxData.map((d) => d.y), ...processedTxData.map((d) => d.y)];
  const dataMin = Math.min(...allYValues);
  const dataMax = Math.max(...allYValues);
  const range = dataMax - dataMin || dataMax * 0.1 || 0.001;
  const yMin = Math.max(0, dataMin - range * 0.05);
  const yMax = dataMax + range * 0.05;

  try {
    // Convert Vue reactive data to plain objects to avoid Chart.js recursion issues
    const plainRxData = JSON.parse(JSON.stringify(processedRxData));
    const plainTxData = JSON.parse(JSON.stringify(processedTxData));

    // Create chart instance and immediately convert to raw to prevent Vue reactivity
    const chartInstance = new ChartJS(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'TX/hr',
            data: plainTxData,
            borderColor: '#F59E0B',
            backgroundColor: '#F59E0B',
            borderWidth: 2,
            fill: 'origin',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 3,
            order: 1,
          },
          {
            label: 'RX/hr',
            data: plainRxData,
            borderColor: '#C084FC',
            backgroundColor: '#C084FC',
            borderWidth: 2,
            fill: 'origin',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 3,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0, // Disable animations for smoother updates
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: false,
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: 'rgba(255, 255, 255, 0.9)',
            bodyColor: 'rgba(255, 255, 255, 0.8)',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              title: function (context) {
                const x = context[0]?.parsed?.x;
                if (x == null) return '';
                const date = new Date(x);
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              },
              label: function (context) {
                const label = context.dataset?.label || '';
                const y = context.parsed?.y;
                if (y == null) return label;
                return `${label}: ${y.toFixed(3)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour',
              displayFormats: {
                hour: 'HH:mm',
              },
            },
            // Set explicit time bounds to show full requested range
            min: Date.now() - selectedHours.value * 3600 * 1000,
            max: Date.now(),
            grid: {
              color: getThemeColors().gridColor,
            },
            ticks: {
              color: getThemeColors().tickColor,
              maxTicksLimit: 8,
            },
          },
          y: {
            beginAtZero: false,
            grid: {
              color: getThemeColors().gridColor,
            },
            ticks: {
              color: getThemeColors().tickColor,
              callback: function (value) {
                return typeof value === 'number' ? value.toFixed(3) : value;
              },
            },
            min: yMin,
            max: yMax,
          },
        },
      },
    });

    // Store as raw (non-reactive) using markRaw to prevent Vue proxy recursion issues
    packetRateChart.value = markRaw(chartInstance);
  } catch (error) {
    console.error('Error creating packet rate chart:', error);
    packetRateChartError.value = true;
  }
};

const createOrUpdatePacketTypeChart = () => {
  if (!packetTypeCanvasRef.value) return;

  const ctx = packetTypeCanvasRef.value.getContext('2d');
  if (!ctx) return;

  // Process packet type data
  const labels: string[] = [];
  const data: number[] = [];
  const colors = [
    '#60A5FA',
    '#34D399',
    '#FBBF24',
    '#A78BFA',
    '#F87171',
    '#06B6D4',
    '#84CC16',
    '#F472B6',
    '#10B981',
  ];

  if (packetTypeData.value.length > 0) {
    packetTypeData.value.forEach((series) => {
      const total = series.data ? series.data.reduce((sum, point) => sum + point[1], 0) : 0;
      if (total > 0) {
        labels.push(series.name.replace(/\([^)]*\)/g, '').trim());
        data.push(total);
      }
    });
  } else {
    // No real data available
    packetTypeChartError.value = true;
    return;
  }

  packetTypeChartError.value = false;

  // Always destroy and recreate the chart to prevent memory leaks
  if (packetTypeChart.value) {
    packetTypeChart.value.destroy();
    packetTypeChart.value = null;
  }

  try {
    // Convert Vue reactive data to plain objects to avoid Chart.js recursion issues
    const plainLabels = JSON.parse(JSON.stringify(labels));
    const plainData = JSON.parse(JSON.stringify(data));

    // Create chart instance and immediately convert to raw to prevent Vue reactivity
    const chartInstance = new ChartJS(ctx, {
      type: 'bar',
      data: {
        labels: plainLabels,
        datasets: [
          {
            data: plainData,
            backgroundColor: colors.slice(0, plainData.length),
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0, // Disable animations for smoother updates
        },
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 10,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
            },
          },
        },
      },
    });

    // Store as raw (non-reactive) using markRaw to prevent Vue proxy recursion issues
    packetTypeChart.value = markRaw(chartInstance);
  } catch (error) {
    console.error('Error creating packet type chart:', error);
    packetTypeChartError.value = true;
  }
};

const createOrUpdateSignalMetricsChart = () => {
  if (!signalMetricsCanvasRef.value) return;

  const ctx = signalMetricsCanvasRef.value.getContext('2d');
  if (!ctx) return;

  // Only show noise floor data from SQLite
  const noiseData = signalMetricsHistory.value
    .map((point) => ({
      x: point.timestamp,
      y: point.noiseFloor,
    }))
    .filter((point) => point.y !== null && point.y !== undefined);

  // Calculate Y-axis bounds with 5% headroom
  const noiseYValues = noiseData.map((d) => d.y);
  const noiseMin = noiseYValues.length > 0 ? Math.min(...noiseYValues) : -120;
  const noiseMax = noiseYValues.length > 0 ? Math.max(...noiseYValues) : -110;
  const noiseRange = noiseMax - noiseMin || 1;
  const noiseYMin = noiseMin - noiseRange * 0.05;
  const noiseYMax = noiseMax + noiseRange * 0.05;

  // Update existing chart if it exists
  if (signalMetricsChart.value) {
    try {
      const chart = toRaw(signalMetricsChart.value);
      // Convert to plain object to avoid Vue reactivity issues
      const plainNoiseData = JSON.parse(JSON.stringify(noiseData));
      if (chart.data.datasets[0]) chart.data.datasets[0].data = plainNoiseData;

      // Update X-axis bounds to show full requested time range
      if (chart.options?.scales?.x) {
        chart.options.scales.x.min = Date.now() - selectedHours.value * 3600 * 1000;
        chart.options.scales.x.max = Date.now();
      }

      chart.update('active');
      return;
    } catch {
      signalMetricsChart.value.destroy();
      signalMetricsChart.value = null;
    }
  }

  // Convert to plain object to avoid Vue reactivity issues
  const plainNoiseData = JSON.parse(JSON.stringify(noiseData));

  // Create new chart only if it doesn't exist
  const chartInstance = new ChartJS(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Noise Floor (dBm)',
          data: plainNoiseData,
          borderWidth: 0,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          pointRadius: 3,
          pointHoverRadius: 5,
          pointStyle: 'circle',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0, // Disable animations for smoother updates
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: getThemeColors().legendColor,
            usePointStyle: true,
            padding: 20,
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: 'rgba(255, 255, 255, 0.9)',
          bodyColor: 'rgba(255, 255, 255, 0.8)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            title: function (context) {
              const x = context[0]?.parsed?.x;
              if (x == null) return '';
              const date = new Date(x);
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            },
            label: function (context) {
              const label = context.dataset?.label || '';
              const y = context.parsed?.y;
              if (y == null) return label;
              return `${label}: ${y.toFixed(1)} dBm`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'hour',
            displayFormats: {
              hour: 'HH:mm',
            },
          },
          // Set explicit time bounds to show full requested range
          // even when data is limited to most recent 2000 points
          min: Date.now() - selectedHours.value * 3600 * 1000,
          max: Date.now(),
          grid: {
            color: getThemeColors().gridColor,
          },
          ticks: {
            color: getThemeColors().tickColor,
            maxTicksLimit: 8,
          },
        },
        y: {
          type: 'linear',
          display: true,
          title: {
            display: true,
            text: 'Noise Floor (dBm)',
            color: getThemeColors().titleColor,
          },
          grid: {
            color: 'rgba(245, 158, 11, 0.2)',
          },
          ticks: {
            color: '#F59E0B',
            callback: function (value) {
              return typeof value === 'number' ? value.toFixed(1) : value;
            },
          },
          min: noiseYMin,
          max: noiseYMax,
        },
      },
    },
  });

  // Store as raw (non-reactive) using markRaw to prevent Vue proxy recursion issues
  signalMetricsChart.value = markRaw(chartInstance);
};

const createOrUpdateSignalPieChart = () => {
  if (!signalPie3DRef.value) return;

  // Check if we have real route data
  if (!routeStatsData.value || !routeStatsData.value.route_totals) {
    routePieChartError.value = true;
    return;
  }

  routePieChartError.value = false;

  // Prepare data from real route statistics
  const routeTotals = routeStatsData.value.route_totals;
  const labels = Object.keys(routeTotals);
  const values = Object.values(routeTotals) as number[];

  // Color scheme for different route types
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#A78BFA', '#F87171'];

  try {
    // Convert Vue reactive data to plain objects
    const plainLabels = JSON.parse(JSON.stringify(labels));
    const plainValues = JSON.parse(JSON.stringify(values));
    const total = plainValues.reduce((sum: number, v: number) => sum + v, 0);

    // Calculate percentages
    const percentages = plainValues.map((v: number) => (v / total) * 100);

    // Create horizontal stacked bar chart - better for skewed data
    const data = plainLabels.map((label: string, i: number) => ({
      type: 'bar',
      name: label,
      x: [percentages[i]],
      y: [''],
      orientation: 'h',
      marker: {
        color: colors[i % colors.length],
      },
      text: percentages[i] >= 5 ? `${label} ${percentages[i].toFixed(0)}%` : '',
      textposition: 'inside',
      textfont: {
        color: 'white',
        size: 11,
      },
      hoverinfo: 'none',
      insidetextanchor: 'middle',
    }));

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        color: 'rgba(255, 255, 255, 0.8)',
        size: 11,
      },
      margin: { t: 10, b: 60, l: 10, r: 10 },
      barmode: 'stack',
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: -0.3,
        xanchor: 'left',
        font: {
          color: 'rgba(255, 255, 255, 0.8)',
          size: 10,
        },
      },
      xaxis: {
        showgrid: false,
        showticklabels: false,
        zeroline: false,
        range: [0, 100],
      },
      yaxis: {
        showgrid: false,
        showticklabels: false,
        zeroline: false,
      },
      hovermode: false,
      bargap: 0,
    };

    const config = {
      responsive: true,
      displayModeBar: false,
      staticPlot: true,
    };

    // Create the Plotly stacked bar chart
    Plotly.newPlot(signalPie3DRef.value, data, layout, config);
  } catch (error) {
    console.error('Error creating route treemap chart:', error);
    routePieChartError.value = true;
  }
};

onMounted(async () => {
  // Use Vue's nextTick to ensure DOM and refs are fully ready
  await nextTick();

  // Start data fetching only after nextTick ensures refs are ready
  fetchAllData();

  // Add resize listener to redraw charts when window size changes
  window.addEventListener('resize', () => {
    setTimeout(() => {
      toRaw(packetRateChart.value)?.resize();
      toRaw(packetTypeChart.value)?.resize();
      toRaw(signalMetricsChart.value)?.resize();
      // Resize Plotly 3D chart
      if (signalPie3DRef.value && Plotly.Plots) {
        Plotly.Plots.resize(signalPie3DRef.value);
      }
    }, 100);
  });
});

onBeforeUnmount(() => {
  // Destroy charts
  packetRateChart.value?.destroy();
  packetTypeChart.value?.destroy();
  signalMetricsChart.value?.destroy();
  // Clean up Plotly chart
  if (signalPie3DRef.value) {
    Plotly.purge(signalPie3DRef.value);
  }

  // Remove resize listener
  window.removeEventListener('resize', () => {});
});

useManagedPolling(fetchAllData, {
  intervalMs: 30000,
  enabled: () => !websocketStore.isConnected,
  immediate: false,
});
</script>

<template>
  <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Header with Time Range Dropdown -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      <h2 class="text-xl sm:text-2xl font-bold text-content-primary dark:text-content-primary">
        Statistics
      </h2>

      <!-- Time Range Selector -->
      <div class="flex items-center gap-2 sm:gap-3">
        <label class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Time Range:</label
        >
        <select
          v-model="selectedHours"
          @change="onTimeRangeChange"
          class="bg-white dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-content-primary dark:text-content-primary text-xs sm:text-sm focus:outline-hidden focus:border-primary dark:focus:border-accent-purple/50 transition-colors"
        >
          <option
            v-for="option in timeOptions"
            :key="option.value"
            :value="option.value"
            class="bg-white dark:bg-gray-800 text-content-primary dark:text-content-primary"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Top Stats Cards with Sparklines -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total RX -->
      <SparklineChart
        title="Total RX"
        :value="topStats.totalRx"
        color="#AAE8E8"
        :data="sparklineData.totalPackets"
        :loading="chartLoadingStates.sparklines"
        variant="classic"
      />

      <!-- Total TX -->
      <SparklineChart
        title="Total TX"
        :value="topStats.totalTx"
        color="#FFC246"
        :data="sparklineData.transmittedPackets"
        :loading="chartLoadingStates.sparklines"
        variant="classic"
      />

      <!-- CRC Errors -->
      <SparklineChart
        title="CRC Errors"
        :value="crcErrorData.reduce((sum, d) => sum + d.count, 0)"
        color="#F59E0B"
        :data="sparklineData.crcErrors"
        :loading="chartLoadingStates.sparklines"
        variant="classic"
      />

      <!-- Packet Hash Cache Size -->
      <SparklineChart
        title="Packet Hash Cache"
        :value="packetStore.systemStats?.duplicate_cache_size ?? 0"
        color="#9F7AEA"
        :data="[]"
        :loading="false"
        variant="smooth"
        :subtitle="`Entries expire after ${(() => {
          const ttl = packetStore.systemStats?.cache_ttl ?? 3600;
          const minutes = Math.floor(ttl / 60);
          return minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`;
        })()}`"
      />
    </div>

    <!-- Performance Metrics Section -->
    <div class="glass-card rounded-[15px] p-3 sm:p-6">
      <h3
        class="text-content-primary dark:text-content-primary text-lg sm:text-xl font-semibold mb-3 sm:mb-4"
      >
        Performance Metrics
      </h3>

      <!-- Packet Rate Chart -->
      <div>
        <p
          class="text-content-secondary dark:text-content-muted text-xs sm:text-sm uppercase tracking-wide mb-2"
        >
          Packet Rate (RX/TX PER HOUR)
        </p>
        <div class="flex items-center gap-3 sm:gap-6 mb-3 sm:mb-4">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-purple-400"></div>
            <span class="text-content-secondary dark:text-content-muted text-sm">RX/hr</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-amber-400"></div>
            <span class="text-content-secondary dark:text-content-muted text-sm">TX/hr</span>
          </div>
        </div>
        <div class="relative h-40 sm:h-48 rounded-lg p-2 sm:p-4">
          <!-- Canvas always present, overlays control visibility -->
          <canvas ref="packetRateCanvasRef" class="w-full h-full relative z-10"></canvas>

          <!-- Loading Spinner for Packet Rate Chart -->
          <div
            v-if="chartLoadingStates.packetRate"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-xs z-20"
          >
            <div class="text-center">
              <div
                class="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-2 border-stroke-subtle dark:border-stroke/20 border-t-purple-600 dark:border-t-purple-400 rounded-full mx-auto mb-2"
              ></div>
              <div class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
                Loading packet rate data...
              </div>
            </div>
          </div>

          <!-- Error overlay -->
          <div
            v-if="packetRateChartError && !chartLoadingStates.packetRate"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 z-20"
          >
            <div class="text-center">
              <div class="text-red-700 dark:text-red-400 text-sm font-semibold mb-1">
                No Data Available
              </div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Packet rate data not found
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Signal Metrics Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
      <!-- Noise Floor Over Time -->
      <div class="glass-card rounded-[15px] p-3 sm:p-6 flex flex-col">
        <h3
          class="text-content-primary dark:text-content-primary text-lg sm:text-xl font-semibold mb-3 sm:mb-4"
        >
          Noise Floor Over Time
        </h3>
        <div class="relative flex-1 min-h-[12rem] sm:min-h-[16rem] rounded-lg">
          <canvas ref="signalMetricsCanvasRef" class="w-full h-full"></canvas>

          <!-- Loading Spinner for Noise Floor Chart -->
          <div
            v-if="chartLoadingStates.noiseFloor"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-xs z-20"
          >
            <div class="text-center">
              <div
                class="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-2 border-stroke-subtle dark:border-stroke/20 border-t-amber-600 dark:border-t-amber-400 rounded-full mx-auto mb-2"
              ></div>
              <div class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
                Loading noise floor data...
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Route Distribution -->
      <div class="glass-card rounded-[15px] p-3 sm:p-6 flex flex-col">
        <h3
          class="text-content-primary dark:text-content-primary text-lg sm:text-xl font-semibold mb-3 sm:mb-4"
        >
          Route Distribution
        </h3>
        <div class="flex-1 flex flex-col justify-evenly">
          <!-- Loading state -->
          <div v-if="chartLoadingStates.routePie" class="flex items-center justify-center flex-1">
            <div class="text-center">
              <div
                class="animate-spin w-6 h-6 border-2 border-stroke-subtle dark:border-stroke/20 border-t-green-600 dark:border-t-green-400 rounded-full mx-auto mb-2"
              ></div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Loading route data...
              </div>
            </div>
          </div>

          <!-- Error state -->
          <div v-else-if="routePieChartError" class="flex items-center justify-center flex-1">
            <div class="text-center">
              <div class="text-red-700 dark:text-red-400 text-sm font-semibold mb-1">
                No Data Available
              </div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Route statistics not found
              </div>
            </div>
          </div>

          <!-- Route bars -->
          <template v-else-if="routeStatsData?.route_totals">
            <div
              v-for="(count, route, index) in routeStatsData.route_totals"
              :key="route"
              class="flex items-center gap-3"
            >
              <div
                class="w-28 sm:w-32 text-sm text-content-primary dark:text-content-primary truncate"
              >
                {{ route }}
              </div>
              <div class="flex-1 h-12 bg-background-mute dark:bg-stroke/10 rounded overflow-hidden">
                <div
                  class="h-full rounded transition-all duration-300"
                  :style="{
                    width: `${(count / Math.max(...Object.values(routeStatsData.route_totals))) * 100}%`,
                    backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#A78BFA', '#F87171'][
                      index % 5
                    ],
                  }"
                ></div>
              </div>
              <div
                class="w-20 text-sm text-content-secondary dark:text-content-muted text-right tabular-nums"
              >
                {{ count.toLocaleString() }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Loading/Error States -->
    <div v-if="isLoading" class="glass-card rounded-[15px] p-6 sm:p-8 text-center">
      <div class="text-content-secondary dark:text-content-muted mb-2 text-sm">
        Loading statistics...
      </div>
      <div
        class="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-2 border-stroke-subtle dark:border-stroke/20 border-t-content-primary dark:border-t-white/70 rounded-full mx-auto"
      ></div>
    </div>

    <div v-if="error" class="glass-card rounded-[15px] p-6 sm:p-8 text-center">
      <div class="text-red-700 dark:text-red-400 mb-2 text-sm font-semibold">
        Failed to load statistics
      </div>
      <p class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</p>
      <button
        @click="fetchAllData"
        class="mt-4 px-4 py-2 bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/80 text-white font-medium rounded-lg border border-primary/20 dark:border-primary/30 transition-colors shadow-sm"
      >
        Retry
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Plotly 3D Pie Chart Styling */
.plotly-chart {
  background: transparent !important;
}
</style>
