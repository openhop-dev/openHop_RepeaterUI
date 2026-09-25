<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, toRaw, markRaw, watch } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { streamingGet } from '@/utils/streamingFetch';
import { mapNoiseFloorValue } from '@/utils/noiseFloor';
import SparklineChart from '@/components/ui/Sparkline.vue';
import ChartCard from '@/components/ui/ChartCard.vue';
import RadioScopeSelector from '@/components/ui/RadioScopeSelector.vue';
import { ALL_RADIOS, useRadioScope } from '@/composables/useRadioProfiles';
import {
  packetTotalsForScope,
  rateBucketSeconds,
  ratesToMetricSeries,
  routeTotalsForScope,
  type MetricsData,
  type PacketStatsPayload,
  type RadioPacketRatesPayload,
  type RouteStatsPayload,
} from '@/utils/radioAnalytics';

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


interface NoiseFloorData {
  chart_data: Array<{
    timestamp: number;
    noise_floor_dbm: number | null;
    radio_id?: string | null;
  }>;
}

interface NoiseFloorHistoryItem {
  timestamp: number;
  noise_floor_dbm?: number;
  noise_floor?: number;
  // Named by the server only on a multi-radio node; null for a sample stored
  // before per-radio sampling or read from a radio that is gone.
  radio_id?: string | null;
}

interface NoiseFloorApiResponse {
  history: NoiseFloorHistoryItem[];
  hours: number;
  count: number;
}

interface SignalMetrics {
  timestamp: number;
  snr: number | null;
  rssi: number | null;
  noiseFloor: number | null;
  radioId?: string | null;
}

const packetStore = usePacketStore();
const { profiles: radioProfiles, isMultiRadio, scope: radioScope } = useRadioScope();

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

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

// Helper function to get theme-aware chrome colors (grid lines, ticks, labels)
const getThemeColors = () => {
  return {
    gridColor: cssVar('--color-border-subtle', 'lightgray'),
    tickColor: cssVar('--color-text-secondary', 'gray'),
    legendColor: cssVar('--color-text-primary', 'white'),
    titleColor: cssVar('--color-text-primary', 'white'),
    tooltipBg: cssVar('--color-surface-elevated', 'black'),
    tooltipTitle: cssVar('--color-heading', 'white'),
    tooltipBody: cssVar('--color-text-primary', 'white'),
    tooltipBorder: cssVar('--color-border-subtle', 'gray'),
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
  tx: cssVar('--color-accent-red', 'tomato'),
  rx: cssVar('--color-secondary', 'violet'),
  noiseFloor: cssVar('--color-primary', 'deepskyblue'),
  noiseFloorFill: cssVar('--color-primary', 'deepskyblue'),
  noiseFloorGrid: cssVar('--color-border-hover', 'gray'),
  totalRx: cssVar('--color-accent-cyan', 'cyan'),
  totalTx: cssVar('--color-accent-green', 'limegreen'),
  crcErrors: cssVar('--color-accent-red', 'tomato'),
  packetTypes: [
    cssVar('--openhop-blue-light', 'lightskyblue'),
    cssVar('--color-accent-green', 'limegreen'),
    cssVar('--color-primary-bg', 'khaki'),
    cssVar('--openhop-purple-light', 'violet'),
    cssVar('--color-accent-red', 'tomato'),
    cssVar('--color-accent-cyan', 'cyan'),
    cssVar('--color-accent-green-bg', 'lightgreen'),
    cssVar('--color-accent-purple', 'orchid'),
    cssVar('--color-accent-green', 'limegreen'),
  ],
  routes: [
    cssVar('--color-primary', 'deepskyblue'),
    cssVar('--color-accent-green', 'limegreen'),
    cssVar('--color-accent-cyan', 'cyan'),
    cssVar('--color-secondary', 'violet'),
    cssVar('--color-accent-red', 'tomato'),
  ],
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
// Per-radio counts from /radio_packet_rates; fetched only on a multi-radio node.
const radioRatesData = ref<RadioPacketRatesPayload | null>(null);
const radioRatesError = ref<string | null>(null);
const noiseFloorData = ref<NoiseFloorData | null>(null);
const routeStatsData = ref<RouteStatsPayload | null>(null);
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
// live packet data is on the Dashboard. packetStatsData is a local snapshot rather than
// packetStore.packetStats so that WebSocket pushes cannot overwrite the time-scoped
// result between user interactions.
const packetStatsData = ref<PacketStatsPayload | null>(null);
const topStats = computed(() => {
  const totals = packetTotalsForScope(packetStatsData.value, radioScope.value);
  return { totalRx: totals.rx, totalTx: totals.tx };
});

/** What the packet-rate chart and sparklines draw for the selected radio scope. */
const chartMetrics = computed<MetricsData | null>(() => {
  if (radioScope.value === ALL_RADIOS) return metricsData.value;
  if (!radioRatesData.value) return null;
  return ratesToMetricSeries(radioRatesData.value, radioScope.value, Math.floor(Date.now() / 1000));
});

// A radio is selected but its counts have not arrived yet (for instance a ?radio= link
// opened before the radio list loaded): show loading, not "no data".
const ratesPending = computed(
  () => radioScope.value !== ALL_RADIOS && !radioRatesData.value && !radioRatesError.value,
);

const displayedRouteTotals = computed(() =>
  routeTotalsForScope(routeStatsData.value, radioScope.value),
);

const unattributedCounts = computed(() => ({
  rx: packetStatsData.value?.unattributed_rx_count ?? 0,
  tx: packetStatsData.value?.unattributed_tx_count ?? 0,
}));

// Node totals count a relay once however many radios sent it; per radio, each send counts.
// Qualifiers go in the card subtitle so titles stay short enough for three cards in a row.
const cardTitles = computed(() => {
  if (!isMultiRadio.value) {
    return { rx: 'Total RX', rxSub: '', tx: 'Total TX', txSub: '', crc: 'CRC Errors', crcSub: '' };
  }
  if (radioScope.value === ALL_RADIOS) {
    // CRC errors are counted per receiver, so across radios they add up.
    return {
      rx: 'Total RX',
      rxSub: 'All radios',
      tx: 'Total TX',
      txSub: 'Per packet',
      crc: 'CRC Errors',
      crcSub: 'All radios',
    };
  }
  const radio = radioScope.value;
  return {
    rx: 'Total RX',
    rxSub: radio,
    tx: 'Transmissions',
    txSub: radio,
    crc: 'CRC Errors',
    crcSub: radio,
  };
});

// Aggregate data into buckets - ~72 buckets regardless of time range
const aggregateToBuckets = (data: Array<[number, number]>, hours: number) => {
  if (data.length === 0) return [];

  // ~72 whole-minute buckets, on the same grid as the server's per-radio counts.
  const BUCKET_MS = rateBucketSeconds(hours) * 1000;
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

  if (chartMetrics.value?.series) {
    const rxSeries = chartMetrics.value.series.find((s) => s.type === 'rx_count');
    const txSeries = chartMetrics.value.series.find((s) => s.type === 'tx_count');

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

    const statsResponse = await streamingGet<PacketStatsPayload>('/packet_stats', {
      hours: selectedHours.value,
    });
    packetStatsData.value = statsResponse.data ?? null;

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

// Each load bumps this. A response from an older load is dropped rather than
// overwriting a newer one: the radio list can arrive while a load is in flight.
let metricsLoadGeneration = 0;

const loadMetricsData = async () => {
  const generation = ++metricsLoadGeneration;
  chartStatus.packetRate = 'Connecting...';
  packetRateChartError.value = null;
  const hours = selectedHours.value;
  const wantsRates = isMultiRadio.value;

  // The RRD holds one combined series; a multi-radio node also needs each radio's
  // counts. Settled separately, so a failed per-radio request never blanks the
  // combined chart.
  const [metricsResult, ratesResult] = await Promise.allSettled([
    streamingGet('/metrics_graph_data', {
      hours,
      resolution: 'average',
      metrics: 'rx_count,tx_count',
    }, {
      onPhaseChange: (phase) => {
        chartStatus.packetRate = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    }),
    wantsRates
      ? streamingGet<RadioPacketRatesPayload>('/radio_packet_rates', {
          hours,
          bucket_seconds: rateBucketSeconds(hours),
        })
      : Promise.resolve(null),
  ]);
  if (generation !== metricsLoadGeneration) return;

  if (metricsResult.status === 'fulfilled') {
    if (metricsResult.value?.success) {
      metricsData.value = metricsResult.value.data as MetricsData;
    }
  } else {
    const reason = metricsResult.reason;
    packetRateChartError.value = reason instanceof Error ? reason.message : 'Failed to load';
    metricsData.value = null;
  }

  if (!wantsRates) {
    radioRatesData.value = null;
    radioRatesError.value = null;
  } else if (ratesResult.status === 'fulfilled' && ratesResult.value?.success) {
    radioRatesData.value = ratesResult.value.data ?? null;
    radioRatesError.value = null;
  } else {
    const reason = ratesResult.status === 'rejected' ? ratesResult.reason : null;
    radioRatesData.value = null;
    radioRatesError.value =
      reason instanceof Error ? reason.message : 'Per-radio packet counts are unavailable';
  }

  chartLoadingStates.value.packetRate = false;
  chartLoadingStates.value.sparklineMetrics = false;
  if (!packetRateChartError.value) {
    await nextTick();
    createOrUpdatePacketRateChart();
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
      routeStatsData.value = response.data as RouteStatsPayload;
    }
  } catch (err) {
    routeStatsData.value = null;
    routePieChartError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    chartLoadingStates.value.routePie = false;
  }
};

// Each load bumps these. Switching radio twice quickly would otherwise let the
// first answer land last and draw one radio's samples under the other's name.
let noiseLoadGeneration = 0;
let crcLoadGeneration = 0;

const loadNoiseFloorData = async () => {
  const generation = ++noiseLoadGeneration;
  chartStatus.noiseFloor = 'Connecting...';
  noiseFloorChartError.value = null;
  try {
    // Request exactly as many samples as the selected window can hold at 30 s/sample.
    // No artificial cap — the server returns the right amount of data for the period.
    // Client-side step-filter below thins for display only.
    // Per radio at 30 s/sample, so a bridge's combined window holds twice as many.
    const limit = selectedHours.value * 120 * Math.max(1, radioProfiles.value.length);
    const params: Record<string, string | number> = { hours: selectedHours.value, limit };
    if (radioScope.value !== ALL_RADIOS) params.radio_id = radioScope.value;

    const response = await streamingGet('/noise_floor_history', params, {
      idleTimeoutMs: 30_000,
      onPhaseChange: (phase) => {
        chartStatus.noiseFloor = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });

    if (generation !== noiseLoadGeneration) return;

    if (response.success && response.data) {
      const responseData = response.data as NoiseFloorApiResponse;
      const historyData = responseData.history || [];
      if (!Array.isArray(historyData) || historyData.length === 0) {
        // A radio with nothing in this window shows nothing. Keeping the last
        // answer would draw the other radio's samples under this radio's name.
        noiseFloorData.value = { chart_data: [] };
        generateSignalMetricsHistory();
      } else {
        // Thin to at most 1500 evenly distributed points for rendering, per radio.
        // Thinning the merged series instead drops whole radios: samples arrive
        // interleaved, so every Nth row of a two-radio history is the same radio
        // every time.
        const byRadio = new Map<string | null, NoiseFloorHistoryItem[]>();
        for (const item of historyData as NoiseFloorHistoryItem[]) {
          const key = item.radio_id ?? null;
          const rows = byRadio.get(key);
          if (rows) rows.push(item);
          else byRadio.set(key, [item]);
        }
        const budget = Math.max(1, Math.floor(1500 / byRadio.size));
        const display: NoiseFloorHistoryItem[] = [];
        for (const rows of byRadio.values()) {
          const step = rows.length > budget ? Math.ceil(rows.length / budget) : 1;
          display.push(...rows.filter((_, i) => i % step === 0));
        }
        display.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        noiseFloorData.value = {
          chart_data: display.map((item: NoiseFloorHistoryItem) => ({
            timestamp: item.timestamp ?? Date.now() / 1000,
            noise_floor_dbm: mapNoiseFloorValue(item),
            radio_id: item.radio_id ?? null,
          })),
        };
        generateSignalMetricsHistory();
      }
    }
  } catch (err) {
    if (generation !== noiseLoadGeneration) return;
    noiseFloorData.value = { chart_data: [] };
    noiseFloorChartError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    // A superseded load must not clear the spinner the newer one put up.
    if (generation === noiseLoadGeneration) {
      chartLoadingStates.value.noiseFloor = false;
      if (!noiseFloorChartError.value) {
        await nextTick();
        createOrUpdateSignalMetricsChart();
      }
    }
  }
};

const loadCrcErrorData = async () => {
  const generation = ++crcLoadGeneration;
  crcDataError.value = null;
  try {
    // Under All radios this returns every radio's batches, which the card and
    // sparkline sum: CRC errors add up across receivers, unlike a noise floor.
    const crcParams: Record<string, string | number> = { hours: selectedHours.value };
    if (radioScope.value !== ALL_RADIOS) crcParams.radio_id = radioScope.value;
    const response = await streamingGet('/crc_error_history', crcParams);

    if (generation !== crcLoadGeneration) return;

    if (response?.success && response.data) {
      const data = response.data as { history: Array<{ timestamp: number; count: number }> };
      crcErrorData.value = data.history || [];
    }
  } catch (err) {
    if (generation !== crcLoadGeneration) return;
    crcErrorData.value = [];
    crcDataError.value = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    if (generation === crcLoadGeneration) {
      chartLoadingStates.value.sparklineCrc = false;
    }
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
      radioId: item.radio_id ?? null,
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

  if (ratesPending.value) return;

  // Process metrics data
  let rxData: Array<{ x: number; y: number }> = [];
  let txData: Array<{ x: number; y: number }> = [];

  if (chartMetrics.value?.series) {
    const rxSeries = chartMetrics.value.series.find((s) => s.type === 'rx_count');
    const txSeries = chartMetrics.value.series.find((s) => s.type === 'tx_count');

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
    packetRateChartError.value =
      radioScope.value !== ALL_RADIOS && radioRatesError.value
        ? radioRatesError.value
        : 'No data available for the selected time range';
    return;
  }

  packetRateChartError.value = null;

  // Always destroy and recreate the chart to prevent memory leaks
  if (packetRateChart.value) {
    packetRateChart.value.destroy();
    packetRateChart.value = null;
  }

  // ~72 whole-minute buckets for any range, on the same grid as the server's per-radio counts.
  const BUCKET_MS = rateBucketSeconds(selectedHours.value) * 1000;

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
            backgroundColor: getThemeColors().tooltipBg,
            titleColor: getThemeColors().tooltipTitle,
            bodyColor: getThemeColors().tooltipBody,
            borderColor: getThemeColors().tooltipBorder,
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


/** Chart.js datasets from the noise floor series, plain-object copied for Vue. */
const buildNoiseDatasets = (
  series: Array<{ label: string; color: string; points: Array<{ x: number; y: number }> }>,
) =>
  series.map((dataset) => ({
    label: dataset.label,
    data: JSON.parse(JSON.stringify(dataset.points.map((point) => ({ x: point.x, y: point.y })))),
    borderWidth: 0,
    backgroundColor: dataset.color,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointStyle: 'circle' as const,
  }));

/**
 * Noise floor series to draw: one per radio under All radios on a bridge, else
 * one. A noise floor cannot be summed or averaged across receivers on different
 * bands — the two numbers describe two channels — so they are drawn side by side.
 */
const noiseFloorDatasets = computed(() => {
  const points = signalMetricsHistory.value
    .filter((point) => point.noiseFloor !== null && point.noiseFloor !== undefined)
    .map((point) => ({ x: point.timestamp, y: point.noiseFloor as number, radioId: point.radioId }));

  if (!isMultiRadio.value || radioScope.value !== ALL_RADIOS) {
    return [{ label: 'Noise Floor (dBm)', color: CHART_COLORS.noiseFloorFill, points }];
  }

  const order = radioProfiles.value.map((radio) => radio.radioId);
  const palette = [
    CHART_COLORS.noiseFloorFill,
    cssVar('--openhop-purple-light', '#a78bfa'),
    cssVar('--color-accent-cyan', '#06b6d4'),
    cssVar('--color-accent-green', '#10b981'),
  ];
  const groups = new Map<string | null, typeof points>();
  for (const id of order) groups.set(id, []);
  for (const point of points) {
    const key = point.radioId != null && groups.has(point.radioId) ? point.radioId : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(point);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 0)
    .map(([radioId, group]) => ({
      // Samples stored before per-radio sampling belong to no radio in particular.
      label: radioId ?? 'no radio',
      // Coloured by the radio's place in the configured order, not by its place
      // in this list: a radio with no samples in the window would otherwise hand
      // its colour to the next one along.
      color: palette[(radioId === null ? order.length : order.indexOf(radioId)) % palette.length],
      points: group,
    }));
});

const createOrUpdateSignalMetricsChart = () => {
  if (!signalMetricsCanvasRef.value) return;

  const ctx = signalMetricsCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const datasets = noiseFloorDatasets.value;
  const noiseData = datasets.flatMap((dataset) => dataset.points);

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
      // Rebuilt rather than patched in place: switching radio scope changes how
      // many series there are, and a stale extra dataset would keep drawing.
      chart.data.datasets = buildNoiseDatasets(datasets);

      // Update X-axis bounds and time unit for the selected range
      if (chart.options?.scales?.x) {
        chart.options.scales.x.min = Date.now() - selectedHours.value * 3600 * 1000;
        chart.options.scales.x.max = Date.now();
        (chart.options.scales.x as any).time = getChartTimeConfig(selectedHours.value);
      }

      // Rescale Y: switching radio scope moves the noise floor by tens of dB on a
      // bridge, and a stale axis leaves the new series pinned to one edge.
      if (chart.options?.scales?.y) {
        chart.options.scales.y.min = noiseYMin;
        chart.options.scales.y.max = noiseYMax;
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

  // Create new chart only if it doesn't exist
  const chartInstance = new ChartJS(ctx, {
    type: 'scatter',
    data: {
      datasets: buildNoiseDatasets(datasets),
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
          backgroundColor: getThemeColors().tooltipBg,
          titleColor: getThemeColors().tooltipTitle,
          bodyColor: getThemeColors().tooltipBody,
          borderColor: getThemeColors().tooltipBorder,
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


// Switching radios reuses the data already loaded; only the chart has to redraw.
watch(radioScope, async () => {
  // Noise floor and CRC are now sampled per radio, so a scope change is a new
  // request, not just a redraw of what is already loaded.
  chartLoadingStates.value.noiseFloor = true;
  chartLoadingStates.value.sparklineCrc = true;
  noiseFloorChartError.value = null;
  void loadNoiseFloorData();
  void loadCrcErrorData();

  await nextTick();
  createOrUpdatePacketRateChart();
});

// /stats can arrive after the first load; fetch per-radio counts once radios are known.
watch(isMultiRadio, (multi) => {
  if (multi && !radioRatesData.value) void loadMetricsData();
});

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
      <h1 class="text-ui-title sm:text-ui-title-lg font-bold text-content-primary">
        Statistics
      </h1>

      <div class="flex flex-wrap items-center gap-3 sm:gap-4">
        <RadioScopeSelector v-model="radioScope" :radios="radioProfiles" />

        <!-- Time Range Selector -->
        <div class="flex items-center gap-2 sm:gap-3">
          <label class="text-content-secondary dark:text-content-muted text-ui-caption sm:text-ui-label"
            >Time Range:</label
          >
          <select
            v-model="selectedHours"
            @change="onTimeRangeChange"
            class="modal-select w-auto"
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
    </div>

    <!-- Top Stats Cards with Sparklines -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <!-- Total RX -->
      <SparklineChart
        :title="cardTitles.rx"
        :subtitle="cardTitles.rxSub"
        :value="topStats.totalRx"
        :color="CHART_COLORS.totalRx"
        :data="sparklineData.totalPackets"
        :loading="chartLoadingStates.sparklineMetrics || ratesPending"
        :error="packetRateChartError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineMetrics = true; chartLoadingStates.packetRate = true; packetRateChartError = null; void loadMetricsData(); }"
      />

      <!-- Total TX -->
      <SparklineChart
        :title="cardTitles.tx"
        :subtitle="cardTitles.txSub"
        :value="topStats.totalTx"
        :color="CHART_COLORS.totalTx"
        :data="sparklineData.transmittedPackets"
        :loading="chartLoadingStates.sparklineMetrics || ratesPending"
        :error="packetRateChartError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineMetrics = true; chartLoadingStates.packetRate = true; packetRateChartError = null; void loadMetricsData(); }"
      />

      <!-- CRC Errors -->
      <SparklineChart
        :title="cardTitles.crc"
        :subtitle="cardTitles.crcSub"
        :value="crcErrorData.reduce((sum, d) => sum + d.count, 0)"
        :color="CHART_COLORS.crcErrors"
        :data="sparklineData.crcErrors"
        :loading="chartLoadingStates.sparklineCrc"
        :error="crcDataError"
        variant="classic"
        @retry="() => { chartLoadingStates.sparklineCrc = true; crcDataError = null; void loadCrcErrorData(); }"
      />

    </div>

    <p
      v-if="radioScope !== ALL_RADIOS && (unattributedCounts.rx > 0 || unattributedCounts.tx > 0)"
      class="text-xs text-content-muted -mt-2"
      data-testid="unattributed-note"
    >
      {{ unattributedCounts.rx }} receptions and {{ unattributedCounts.tx }} transmissions in this
      window have no recorded radio, so they are not counted for {{ radioScope }}.
    </p>

    <!-- Performance Metrics Section -->
    <div class="glass-card rounded-[15px] p-3 sm:p-6">
      <h3
        class="text-content-primary text-ui-section sm:text-ui-title font-semibold mb-3 sm:mb-4"
      >
        Performance Metrics
      </h3>

      <!-- Packet Rate Chart -->
      <div>
        <p
          class="text-content-secondary dark:text-content-muted text-ui-caption sm:text-ui-label uppercase tracking-wide mb-2"
        >
          Packet Rate (RX/TX PER HOUR)<template v-if="radioScope !== ALL_RADIOS"> · {{ radioScope }}</template>
        </p>
        <div class="flex items-center gap-3 sm:gap-6 mb-3 sm:mb-4">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: CHART_COLORS.rx }"></div>
            <span class="text-content-secondary dark:text-content-muted text-ui-label">RX/hr</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: CHART_COLORS.tx }"></div>
            <span class="text-content-secondary dark:text-content-muted text-ui-label">TX/hr</span>
          </div>
        </div>
        <ChartCard
          class="h-40 sm:h-48 rounded-lg p-2 sm:p-4"
          :is-loading="chartLoadingStates.packetRate || ratesPending"
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
          class="text-content-primary text-ui-section sm:text-ui-title font-semibold mb-3 sm:mb-4"
        >
          Noise Floor Over Time
        </h3>
        <p
          v-if="isMultiRadio"
          class="text-xs text-content-muted -mt-2 mb-3"
          data-testid="noise-floor-radio-note"
        >
          {{
            radioScope === ALL_RADIOS
              ? 'One line per radio; noise floors are not comparable across bands.'
              : `Measured on ${radioScope}.`
          }}
        </p>
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
          class="text-content-primary text-ui-section sm:text-ui-title font-semibold mb-3 sm:mb-4"
        >
          Route Distribution
        </h3>
        <p v-if="radioScope !== ALL_RADIOS" class="text-xs text-content-muted -mt-2 mb-3">
          Receptions on {{ radioScope }}.
        </p>
        <ChartCard
          class="flex-1 flex flex-col justify-evenly min-h-[8rem]"
          :is-loading="chartLoadingStates.routePie"
          :error="routePieChartError"
          :status="chartStatus.routePie"
          @retry="() => { chartLoadingStates.routePie = true; routePieChartError = null; void loadRouteStatsData(); }"
        >
          <template v-if="displayedRouteTotals">
            <div
              v-for="(count, route, index) in displayedRouteTotals"
              :key="route"
              class="flex items-center gap-3"
            >
              <div
                class="w-28 sm:w-32 text-sm text-content-primary truncate"
              >
                {{ route }}
              </div>
              <div class="flex-1 h-12 bg-background-mute dark:bg-stroke/opacity-subtle rounded overflow-hidden">
                <div
                  class="h-full rounded transition-all duration-300"
                  :style="{
                    width: `${(count / Math.max(...Object.values(displayedRouteTotals))) * 100}%`,
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
