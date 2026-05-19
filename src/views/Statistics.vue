<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, toRaw, markRaw } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { streamingGet } from '@/utils/streamingFetch';
import SparklineChart from '@/components/ui/Sparkline.vue';
import ChartCard from '@/components/ui/ChartCard.vue';

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

// Returns Chart.js time-axis unit and display format appropriate for the selected range.
// ≤ 24 h → hour ticks with HH:mm; 24–48 h → include day name; > 48 h → day ticks with date.
const getChartTimeConfig = (hours: number) =>
  hours > 48
    ? ({ unit: 'day' as const, displayFormats: { day: 'EEE MMM d' } })
    : hours > 24
    ? ({ unit: 'hour' as const, displayFormats: { hour: 'EEE HH:mm' } })
    : ({ unit: 'hour' as const, displayFormats: { hour: 'HH:mm' } });

// Per-chart loading status text driven by streamingGet phase callbacks
const chartStatus = reactive<Record<string, string>>({
  packetRate: 'Connecting...',
  noiseFloor: 'Connecting...',
  routePie: 'Connecting...',
});

// Helper function to get theme-aware chrome colors (grid lines, ticks, labels)
const getThemeColors = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    gridColor:   isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    tickColor:   isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
    legendColor: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
    titleColor:  isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
  };
};

// Physical upper bound for packet rate data from the backend.
// The API returns rates in packets/second (RRD DERIVE: count / step_s, where step = 60s).
// ~100ms on-air time is an estimate based on observed averages at the most common MeshCore
// settings — actual airtime varies with SF/BW/payload. This gives ~10 pkts/s; guard is set
// at 2× to provide headroom while still rejecting the corrupt RRD spikes (6M–110M pkts/s).
const PACKET_RATE_GUARD = 20; // pkts/s — hard cap applied before bucketing/sparklines

// Chart palette — fixed vibrant colours, same in both light and dark mode.
// Matches the pattern used in SystemStats.vue and StatsCards.vue.
const CHART_COLORS = {
  tx:             '#F59E0B',              // amber — TX/hr series, CRC errors sparkline
  rx:             '#C084FC',              // violet — RX/hr series
  noiseFloor:     '#F59E0B',              // amber — noise floor axis ticks
  noiseFloorFill: 'rgba(245, 158, 11, 0.8)', // amber at 80% — scatter dot fill
  noiseFloorGrid: 'rgba(245, 158, 11, 0.2)', // amber at 20% — y-axis grid tint
  totalRx:        '#AAE8E8',              // teal   — Total RX sparkline
  totalTx:        '#FFC246',              // bright amber — Total TX sparkline
  crcErrors:      '#F59E0B',              // amber — CRC errors sparkline
  packetTypes: [
    '#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#F87171',
    '#06B6D4', '#84CC16', '#F472B6', '#10B981',
  ],
  routes: ['#3B82F6', '#10B981', '#F59E0B', '#A78BFA', '#F87171'],
} as const;

// Time period selection
const selectedHours = ref(24);
const timeOptions = [
  { value: 1, label: '1 Hour' },
  { value: 6, label: '6 Hours' },
  { value: 12, label: '12 Hours' },
  { value: 24, label: '24 Hours' },
  { value: 48, label: '2 Days' },
  { value: 168, label: '1 Week' },
];

// Watch for changes and persist to localStorage

// State for different metrics
const metricsData = ref<MetricsData | null>(null);
const noiseFloorData = ref<NoiseFloorData | null>(null);
const routeStatsData = ref<RouteStatsData | null>(null);
const signalMetricsHistory = ref<SignalMetrics[]>([]);
const crcErrorData = ref<Array<{ timestamp: number; count: number }>>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Chart loading states
const chartLoadingStates = ref({
  packetRate: true,
  noiseFloor: false,
  routePie: true,
  sparklineMetrics: true,
  sparklineCrc: true,
});

// Chart error states (null = no error, string = error message shown in ChartCard overlay)
const packetRateChartError = ref<string | null>(null);
const routePieChartError = ref<string | null>(null);
const noiseFloorChartError = ref<string | null>(null);
const crcDataError = ref<string | null>(null);

// Chart instances
const packetRateChart = ref<ChartJS | null>(null);
const signalMetricsChart = ref<ChartJS | null>(null);

// Canvas refs
const packetRateCanvasRef = ref<HTMLCanvasElement | null>(null);
const signalMetricsCanvasRef = ref<HTMLCanvasElement | null>(null);

// This is a historical reporting page — data loads on mount and on explicit time-range
// changes only. Prior to this revision the page polled every 30s and read reactive store
// refs, but the data resolution meant those updates carried no meaningful change; all
// live packet data is on the Dashboard. topStats is a local snapshot rather than a
// computed on packetStore.packetStats so that WebSocket pushes cannot overwrite the
// time-scoped result between user interactions.
const topStats = ref({ totalRx: 0, totalTx: 0 });

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
      rxSparkline = aggregateToBuckets(
        rxSeries.data.map(([ts, v]): [number, number] => [ts, v > PACKET_RATE_GUARD ? 0 : v]),
        selectedHours.value,
      );
    }
    if (txSeries?.data) {
      txSparkline = aggregateToBuckets(
        txSeries.data.map(([ts, v]): [number, number] => [ts, v > PACKET_RATE_GUARD ? 0 : v]),
        selectedHours.value,
      );
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

    const statsResponse = await streamingGet<{ total_packets?: number; transmitted_packets?: number }>(
      '/packet_stats',
      { hours: selectedHours.value },
    );
    topStats.value = {
      totalRx: statsResponse.data?.total_packets || 0,
      totalTx: statsResponse.data?.transmitted_packets || 0,
    };

    isLoading.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch data';
    isLoading.value = false;
  }

  // Load charts in parallel without blocking the totals display
  loadChartData();
};

// Load chart data without blocking UI
const loadChartData = async () => {
  // Reset chart loading states - all true for synchronized loading
  chartLoadingStates.value = {
    packetRate: true,
    noiseFloor: true,
    routePie: true,
    sparklineMetrics: true,
    sparklineCrc: true,
  };

  // Pre-populate from store caches so the chart render after Promise.allSettled
  // has data immediately even if an individual API call is slow or fails.
  if (packetStore.metricsGraphData) {
    metricsData.value = packetStore.metricsGraphData as MetricsData;
  }
  if (packetStore.crcErrorHistory.length > 0) {
    crcErrorData.value = [...packetStore.crcErrorHistory];
  }
  if (packetStore.noiseFloorHistory.length > 0) {
    noiseFloorData.value = {
      chart_data: packetStore.noiseFloorHistory.map((p) => ({
        timestamp: p.timestamp,
        noise_floor_dbm: p.noise_floor_dbm,
      })),
    };
    generateSignalMetricsHistory();
  }

  // Fire all fetches in parallel — each loader renders its own chart when data arrives
  void loadMetricsData();
  void loadRouteStatsData();
  void loadNoiseFloorData();
  void loadCrcErrorData();
};

const loadMetricsData = async () => {
  chartStatus.packetRate = 'Connecting...';
  packetRateChartError.value = null;
  try {
    const response = await streamingGet('/metrics_graph_data', {
      hours: selectedHours.value,
      resolution: 'average',
      metrics: 'rx_count,tx_count',
    }, {
      onPhaseChange: (phase) => {
        chartStatus.packetRate = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });

    if (response?.success) {
      metricsData.value = response.data as MetricsData;
    }
  } catch (err) {
    packetRateChartError.value = err instanceof Error ? err.message : 'Failed to load';
    metricsData.value = null;
  } finally {
    chartLoadingStates.value.packetRate = false;
    chartLoadingStates.value.sparklineMetrics = false;
    if (!packetRateChartError.value) {
      await nextTick();
      createOrUpdatePacketRateChart();
    }
  }
};

const loadRouteStatsData = async () => {
  chartStatus.routePie = 'Connecting...';
  routePieChartError.value = null;
  try {
    const response = await streamingGet('/route_stats', { hours: selectedHours.value }, {
      onPhaseChange: (phase) => {
        chartStatus.routePie = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });

    if (response?.success && response.data) {
      routeStatsData.value = response.data as RouteStatsData;
    }
  } catch (err) {
    routeStatsData.value = null;
    routePieChartError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    chartLoadingStates.value.routePie = false;
  }
};

const loadNoiseFloorData = async () => {
  chartStatus.noiseFloor = 'Connecting...';
  noiseFloorChartError.value = null;
  try {
    // Request exactly as many samples as the selected window can hold at 30 s/sample.
    // No artificial cap — the server returns the right amount of data for the period.
    // Client-side step-filter below thins for display only.
    const limit = selectedHours.value * 120;
    const params = { hours: selectedHours.value, limit };

    const response = await streamingGet('/noise_floor_history', params, {
      idleTimeoutMs: 30_000,
      onPhaseChange: (phase) => {
        chartStatus.noiseFloor = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });

    if (response.success && response.data) {
      const responseData = response.data as NoiseFloorApiResponse;
      const historyData = responseData.history || [];
      if (Array.isArray(historyData) && historyData.length > 0) {
        // Thin to at most 1500 evenly distributed points for rendering.
        let display = historyData;
        if (historyData.length > 1500) {
          const step = Math.ceil(historyData.length / 1500);
          display = historyData.filter((_, i) => i % step === 0);
        }
        noiseFloorData.value = {
          chart_data: display.map((item: NoiseFloorHistoryItem) => ({
            timestamp: item.timestamp || Date.now() / 1000,
            noise_floor_dbm: item.noise_floor_dbm || item.noise_floor || -120,
          })),
        };
        generateSignalMetricsHistory();
      }
    }
  } catch (err) {
    noiseFloorData.value = { chart_data: [] };
    noiseFloorChartError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    chartLoadingStates.value.noiseFloor = false;
    if (!noiseFloorChartError.value) {
      await nextTick();
      createOrUpdateSignalMetricsChart();
    }
  }
};

const loadCrcErrorData = async () => {
  crcDataError.value = null;
  try {
    const response = await streamingGet('/crc_error_history', {
      hours: selectedHours.value,
    });

    if (response?.success && response.data) {
      const data = response.data as { history: Array<{ timestamp: number; count: number }> };
      crcErrorData.value = data.history || [];
    }
  } catch (err) {
    crcErrorData.value = [];
    crcDataError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    chartLoadingStates.value.sparklineCrc = false;
  }
};

// Handle time period change
const onTimeRangeChange = () => {
  // Immediately show loading state for ALL charts
  chartLoadingStates.value = {
    packetRate: true,
    noiseFloor: true,
    routePie: true,
    sparklineMetrics: true,
    sparklineCrc: true,
  };
  // Destroy existing charts first to prevent memory leaks
  destroyAllCharts();
  // Reset error states
  packetRateChartError.value = null;
  routePieChartError.value = null;
  noiseFloorChartError.value = null;
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


// Safely destroy all charts to prevent memory leaks
const destroyAllCharts = () => {
  try {
    if (packetRateChart.value) {
      packetRateChart.value.destroy();
      packetRateChart.value = null;
    }
    if (signalMetricsChart.value) {
      signalMetricsChart.value.destroy();
      signalMetricsChart.value = null;
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
        let normalizedTimestamp = timestamp;
        if (timestamp > 1e15) {
          normalizedTimestamp = timestamp / 1000;
        } else if (timestamp > 1e12) {
          normalizedTimestamp = timestamp;
        } else if (timestamp > 1e9) {
          normalizedTimestamp = timestamp * 1000;
        } else {
          normalizedTimestamp = Date.now();
        }
        return { x: normalizedTimestamp, y: value > PACKET_RATE_GUARD ? 0 : value * 3600 };
      });
    }
    if (txSeries?.data) {
      txData = txSeries.data.map(([timestamp, value]) => {
        let normalizedTimestamp = timestamp;
        if (timestamp > 1e15) {
          normalizedTimestamp = timestamp / 1000;
        } else if (timestamp > 1e12) {
          normalizedTimestamp = timestamp;
        } else if (timestamp > 1e9) {
          normalizedTimestamp = timestamp * 1000;
        } else {
          normalizedTimestamp = Date.now();
        }
        return { x: normalizedTimestamp, y: value > PACKET_RATE_GUARD ? 0 : value * 3600 };
      });
    }
  }

  // Check if we have data
  if (rxData.length === 0 && txData.length === 0) {
    packetRateChartError.value = 'No data available for the selected time range';
    return;
  }

  packetRateChartError.value = null;

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
            borderColor: CHART_COLORS.tx,
            backgroundColor: CHART_COLORS.tx,
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
            borderColor: CHART_COLORS.rx,
            backgroundColor: CHART_COLORS.rx,
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
                return `${label}: ${y.toFixed(1)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: getChartTimeConfig(selectedHours.value),
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
            title: {
              display: true,
              text: 'Packets / Hour',
              color: getThemeColors().tickColor,
            },
            grid: {
              color: getThemeColors().gridColor,
            },
            ticks: {
              color: getThemeColors().tickColor,
              callback: function (value) {
                return typeof value === 'number' ? value.toFixed(1) : value;
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
    packetRateChartError.value = 'Failed to render chart';
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

      // Update X-axis bounds and time unit for the selected range
      if (chart.options?.scales?.x) {
        chart.options.scales.x.min = Date.now() - selectedHours.value * 3600 * 1000;
        chart.options.scales.x.max = Date.now();
        (chart.options.scales.x as any).time = getChartTimeConfig(selectedHours.value);
      }

      // Refresh theme-aware colours on existing chart
      if (chart.options?.scales?.y?.ticks) {
        (chart.options.scales.y.ticks as any).color = getThemeColors().tickColor;
      }
      if (chart.options?.plugins?.legend?.labels) {
        (chart.options.plugins.legend.labels as any).color = getThemeColors().legendColor;
      }

      chart.update();
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
          backgroundColor: CHART_COLORS.noiseFloorFill,
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
          time: getChartTimeConfig(selectedHours.value),
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
          type: 'linear',
          display: true,
          title: {
            display: true,
            text: 'Noise Floor (dBm)',
            color: getThemeColors().titleColor,
          },
          grid: {
            color: CHART_COLORS.noiseFloorGrid,
          },
          ticks: {
            color: getThemeColors().tickColor,
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


onMounted(async () => {
  // Use Vue's nextTick to ensure DOM and refs are fully ready
  await nextTick();

  // Start data fetching only after nextTick ensures refs are ready
  fetchAllData();

  // Add resize listener to redraw charts when window size changes
  window.addEventListener('resize', () => {
    setTimeout(() => {
      toRaw(packetRateChart.value)?.resize();
      toRaw(signalMetricsChart.value)?.resize();
    }, 100);
  });
});

onBeforeUnmount(() => {
  packetRateChart.value?.destroy();
  signalMetricsChart.value?.destroy();
  window.removeEventListener('resize', () => {});
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
            class="bg-surface text-content-primary"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Top Stats Cards with Sparklines -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <!-- Total RX -->
      <SparklineChart
        title="Total RX"
        :value="topStats.totalRx"
        :color="CHART_COLORS.totalRx"
        :data="sparklineData.totalPackets"
        :loading="chartLoadingStates.sparklineMetrics"
        :error="packetRateChartError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineMetrics = true; chartLoadingStates.packetRate = true; packetRateChartError = null; void loadMetricsData(); }"
      />

      <!-- Total TX -->
      <SparklineChart
        title="Total TX"
        :value="topStats.totalTx"
        :color="CHART_COLORS.totalTx"
        :data="sparklineData.transmittedPackets"
        :loading="chartLoadingStates.sparklineMetrics"
        :error="packetRateChartError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineMetrics = true; chartLoadingStates.packetRate = true; packetRateChartError = null; void loadMetricsData(); }"
      />

      <!-- CRC Errors -->
      <SparklineChart
        title="CRC Errors"
        :value="crcErrorData.reduce((sum, d) => sum + d.count, 0)"
        :color="CHART_COLORS.crcErrors"
        :data="sparklineData.crcErrors"
        :loading="chartLoadingStates.sparklineCrc"
        :error="crcDataError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineCrc = true; crcDataError = null; void loadCrcErrorData(); }"
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
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: CHART_COLORS.rx }"></div>
            <span class="text-content-secondary dark:text-content-muted text-sm">RX/hr</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: CHART_COLORS.tx }"></div>
            <span class="text-content-secondary dark:text-content-muted text-sm">TX/hr</span>
          </div>
        </div>
        <ChartCard
          class="h-40 sm:h-48 rounded-lg p-2 sm:p-4"
          :is-loading="chartLoadingStates.packetRate"
          :error="packetRateChartError"
          :status="chartStatus.packetRate"
          @retry="() => { chartLoadingStates.packetRate = true; packetRateChartError = null; void loadMetricsData(); }"
        >
          <canvas ref="packetRateCanvasRef" class="w-full h-full relative z-10"></canvas>
        </ChartCard>
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
        <ChartCard
          class="flex-1 min-h-[12rem] sm:min-h-[16rem] rounded-lg"
          :is-loading="chartLoadingStates.noiseFloor"
          :error="noiseFloorChartError"
          :status="chartStatus.noiseFloor"
          @retry="() => { chartLoadingStates.noiseFloor = true; noiseFloorChartError = null; void loadNoiseFloorData(); }"
        >
          <canvas ref="signalMetricsCanvasRef" class="absolute inset-0 w-full h-full"></canvas>
        </ChartCard>
      </div>

      <!-- Route Distribution -->
      <div class="glass-card rounded-[15px] p-3 sm:p-6 flex flex-col">
        <h3
          class="text-content-primary dark:text-content-primary text-lg sm:text-xl font-semibold mb-3 sm:mb-4"
        >
          Route Distribution
        </h3>
        <ChartCard
          class="flex-1 flex flex-col justify-evenly min-h-[8rem]"
          :is-loading="chartLoadingStates.routePie"
          :error="routePieChartError"
          :status="chartStatus.routePie"
          @retry="() => { chartLoadingStates.routePie = true; routePieChartError = null; void loadRouteStatsData(); }"
        >
          <template v-if="routeStatsData?.route_totals">
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
                    backgroundColor: CHART_COLORS.routes[index % CHART_COLORS.routes.length],
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
        </ChartCard>
      </div>
    </div>

  </div>
</template>

<style scoped>
</style>
