<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, toRaw } from 'vue';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import ChartCard from '@/components/ui/ChartCard.vue';
  import IncidentDetailsModal from '@/components/IncidentDetailsModal.vue';
  import { useManagedPolling } from '@/composables/useManagedPolling';
import { streamingGet } from '@/utils/streamingFetch';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  Title,
  Tooltip,
  Legend,
  BarElement,
  Filler,
  TimeScale,
);

defineOptions({ name: 'RfHealthCorrelationView' });

type TimeValuePoint = { t: number; v: number };
type CorrelationRow = {
  label: string;
  correlation: number | null;
  strongestLagBuckets: number;
  strongestLagCorrelation: number | null;
};
type Incident = {
  id: string;
  startMs: number;
  endMs: number;
  peakNoiseDelta: number;
  totalCrc: number;
  totalDrops: number;
  severity: 'low' | 'medium' | 'high';
};
type BucketPoint = {
  bucketMs: number;
  noise: number | null;
  crc: number;
};

type PacketStatsPayload = {
  total_packets?: number;
  received?: number;
  transmitted?: number;
  dropped?: number;
};

const timeOptions = [
  { value: 1, label: '1 Hour' },
  { value: 6, label: '6 Hours' },
  { value: 24, label: '24 Hours' },
  { value: 48, label: '2 Days' },
  { value: 168, label: '1 Week' },
] as const;

const selectedHours = ref<number>(24);
const chartCanvasRef = ref<HTMLCanvasElement | null>(null);
const chartInstance = ref<ChartJS | null>(null);

const hasLoadedOnce = ref(false);
const isRefreshing = ref(false);
const chartLoading = ref(true);
const chartError = ref<string | null>(null);
const chartStatus = ref('Connecting...');

const packetStats = ref<PacketStatsPayload>({});
const noisePoints = ref<TimeValuePoint[]>([]);
const crcPoints = ref<TimeValuePoint[]>([]);
const alignedBuckets = ref<BucketPoint[]>([]);
const incidents = ref<Incident[]>([]);
  const selectedIncident = ref<Incident | null>(null);

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const resolveCssColor = (color: string): string => {
  if (!color.startsWith('var(')) return color;
  const match = color.match(/var\((--[^,)]+)/);
  if (!match) return color;
  return cssVar(match[1], color);
};

const CHART_COLORS = {
  noise: 'var(--color-primary)',
  crc: 'var(--color-accent-red)',
  droppedPkts: 'var(--color-accent-orange)',
  grid: 'var(--color-border-subtle)',
  ticks: 'var(--color-text-secondary)',
  tooltipBg: 'var(--color-surface-elevated)',
  tooltipText: 'var(--color-text-primary)',
  tooltipBorder: 'var(--color-border-subtle)',
} as const;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeTimestampMs = (value: unknown): number | null => {
  const n = toNumber(value);
  if (n === null) return null;
  if (n > 1e15) return Math.round(n / 1000);
  if (n > 1e12) return Math.round(n);
  if (n > 1e9) return Math.round(n * 1000);
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const percentile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q)));
  return sorted[pos];
};

const median = (values: number[]): number => percentile(values, 0.5);

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const extractNoisePoints = (raw: unknown): TimeValuePoint[] => {
  const points: TimeValuePoint[] = [];
  const rawRecord = asRecord(raw);
  const payload = rawRecord?.data ?? raw;

  const parseList = (list: unknown[]) => {
    list.forEach((entry) => {
      const row = asRecord(entry);
      if (!row) return;
      const ts = normalizeTimestampMs(row.timestamp);
      const noise = toNumber(row.noise_floor_dbm ?? row.noise_floor ?? row.value);
      if (ts !== null && noise !== null) {
        points.push({ t: ts, v: noise });
      }
    });
  };

  if (Array.isArray(payload)) {
    parseList(payload);
  } else {
    const payloadRecord = asRecord(payload);
    if (payloadRecord) {
      if (Array.isArray(payloadRecord.history)) parseList(payloadRecord.history);
      if (Array.isArray(payloadRecord.chart_data)) parseList(payloadRecord.chart_data);
      if (Array.isArray(payloadRecord.values)) parseList(payloadRecord.values);
    }
  }

  return points.sort((a, b) => a.t - b.t);
};

const extractCrcPoints = (raw: unknown): TimeValuePoint[] => {
  const points: TimeValuePoint[] = [];
  const rawRecord = asRecord(raw);
  const payload = rawRecord?.data ?? raw;

  const parseList = (list: unknown[]) => {
    list.forEach((entry) => {
      const row = asRecord(entry);
      if (!row) return;
      const ts = normalizeTimestampMs(row.timestamp);
      const count = toNumber(row.count ?? row.crc_errors ?? row.value);
      if (ts !== null && count !== null) {
        points.push({ t: ts, v: count });
      }
    });
  };

  if (Array.isArray(payload)) {
    parseList(payload);
  } else {
    const payloadRecord = asRecord(payload);
    if (payloadRecord && Array.isArray(payloadRecord.history)) {
      parseList(payloadRecord.history);
    }
  }

  return points.sort((a, b) => a.t - b.t);
};

const extractMetricSeriesPoints = (raw: unknown, requestedType: string): TimeValuePoint[] => {
  const points: TimeValuePoint[] = [];
  const rawRecord = asRecord(raw);
  const payload = asRecord(rawRecord?.data ?? raw);
  if (!payload || !Array.isArray(payload.series)) return points;

  const timestamps = Array.isArray(payload.timestamps)
    ? payload.timestamps.map((item) => normalizeTimestampMs(item)).filter((item): item is number => item !== null)
    : [];

  payload.series.forEach((seriesItem) => {
    const seriesRecord = asRecord(seriesItem);
    if (!seriesRecord) return;
    const seriesType = String(seriesRecord.type ?? '');
    const seriesName = String(seriesRecord.name ?? '');
    const matches = seriesType === requestedType || seriesName === requestedType;
    if (!matches) return;

    const seriesData = seriesRecord.data;
    if (!Array.isArray(seriesData)) return;

    if (seriesData.length > 0 && Array.isArray(seriesData[0])) {
      seriesData.forEach((tuple) => {
        if (!Array.isArray(tuple) || tuple.length < 2) return;
        const ts = normalizeTimestampMs(tuple[0]);
        const value = toNumber(tuple[1]);
        if (ts !== null && value !== null) {
          points.push({ t: ts, v: value });
        }
      });
      return;
    }

    seriesData.forEach((value, index) => {
      const ts = timestamps[index] ?? null;
      const n = toNumber(value);
      if (ts !== null && n !== null) {
        points.push({ t: ts, v: n });
      }
    });
  });

  return points.sort((a, b) => a.t - b.t);
};

const aggregateToBuckets = (
  points: TimeValuePoint[],
  bucketMs: number,
  mode: 'avg' | 'sum',
): Map<number, number> => {
  const buckets = new Map<number, number[]>();

  points.forEach((point) => {
    const bucket = Math.floor(point.t / bucketMs) * bucketMs;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)?.push(point.v);
  });

  const aggregated = new Map<number, number>();
  buckets.forEach((values, bucket) => {
    if (values.length === 0) return;
    if (mode === 'sum') {
      aggregated.set(bucket, values.reduce((sum, value) => sum + value, 0));
      return;
    }
    aggregated.set(bucket, values.reduce((sum, value) => sum + value, 0) / values.length);
  });

  return aggregated;
};

const computeAlignedBuckets = (): BucketPoint[] => {
  const bucketMs = Math.max(30_000, Math.round((selectedHours.value * 60 * 60 * 1000) / 120));

  const noiseMap = aggregateToBuckets(noisePoints.value, bucketMs, 'avg');
  const crcMap = aggregateToBuckets(crcPoints.value, bucketMs, 'sum');

  const keys = new Set<number>([
    ...noiseMap.keys(),
    ...crcMap.keys(),
  ]);

  const sortedKeys = Array.from(keys).sort((a, b) => a - b);
  return sortedKeys.map((bucket) => {
    return {
      bucketMs: bucket,
      noise: noiseMap.has(bucket) ? noiseMap.get(bucket) ?? null : null,
      crc: crcMap.get(bucket) ?? 0,
    };
  });
};

const pearson = (left: number[], right: number[]): number | null => {
  if (left.length !== right.length || left.length < 3) return null;

  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;

  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let i = 0; i < left.length; i += 1) {
    const dx = left[i] - meanLeft;
    const dy = right[i] - meanRight;
    numerator += dx * dy;
    leftVariance += dx * dx;
    rightVariance += dy * dy;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (denominator === 0) return null;
  return numerator / denominator;
};

const laggedPearson = (left: number[], right: number[], lagBuckets: number): number | null => {
  if (lagBuckets < 0) return null;
  if (lagBuckets === 0) return pearson(left, right);
  if (left.length <= lagBuckets || right.length <= lagBuckets) return null;

  const leftSlice = left.slice(0, left.length - lagBuckets);
  const rightSlice = right.slice(lagBuckets);
  return pearson(leftSlice, rightSlice);
};

const buildIncidents = (points: BucketPoint[]): Incident[] => {
  if (points.length === 0) return [];

  const noiseValues = points
    .map((point) => point.noise)
    .filter((value): value is number => value !== null);
  if (noiseValues.length < 5) return [];

  const baselineNoise = median(noiseValues);
  const noiseThreshold = baselineNoise + Math.max(2, percentile(noiseValues, 0.9) - baselineNoise);
  const crcThreshold = Math.max(1, percentile(points.map((point) => point.crc), 0.9));

  const triggered = points.filter((point) => {
    if (point.noise === null) return false;
    const noisy = point.noise >= noiseThreshold;
    const burst = point.crc >= crcThreshold;
    return noisy && burst;
  });

  if (triggered.length === 0) return [];

  const bucketMs = points.length > 1 ? points[1].bucketMs - points[0].bucketMs : 60_000;
  const incidentsList: Incident[] = [];

  let windowStart = triggered[0].bucketMs;
  let windowEnd = triggered[0].bucketMs;
  let windowPoints: BucketPoint[] = [triggered[0]];

  const flushWindow = () => {
    const noiseDeltas = windowPoints
      .map((point) => (point.noise === null ? 0 : point.noise - baselineNoise));
    const peakNoiseDelta = Math.max(...noiseDeltas);
    const totalCrc = windowPoints.reduce((sum, point) => sum + point.crc, 0);

    const severityScore = peakNoiseDelta * 2.5 + totalCrc * 0.8;
    const severity: Incident['severity'] = severityScore >= 20
      ? 'high'
      : severityScore >= 8
      ? 'medium'
      : 'low';

    incidentsList.push({
      id: `${windowStart}-${windowEnd}`,
      startMs: windowStart,
      endMs: windowEnd,
      peakNoiseDelta,
      totalCrc,
      totalDrops: 0,
      severity,
    });
  };

  for (let i = 1; i < triggered.length; i += 1) {
    const current = triggered[i];
    if (current.bucketMs - windowEnd <= bucketMs * 1.5) {
      windowEnd = current.bucketMs;
      windowPoints.push(current);
      continue;
    }

    flushWindow();
    windowStart = current.bucketMs;
    windowEnd = current.bucketMs;
    windowPoints = [current];
  }

  flushWindow();
  return incidentsList.sort((a, b) => b.startMs - a.startMs).slice(0, 12);
};

const totalPackets = computed(() => {
  const fromTotal = toNumber(packetStats.value.total_packets);
  if (fromTotal !== null) return fromTotal;
  const received = toNumber(packetStats.value.received) ?? 0;
  const transmitted = toNumber(packetStats.value.transmitted) ?? 0;
  return Math.max(received, transmitted);
});

const droppedPackets = computed(() => {
  const dropped = toNumber(packetStats.value.dropped);
  if (dropped !== null) return dropped;
  const received = toNumber(packetStats.value.received) ?? 0;
  const transmitted = toNumber(packetStats.value.transmitted) ?? 0;
  return Math.max(0, received - transmitted);
});

const dropRate = computed(() => {
  if (totalPackets.value <= 0) return 0;
  return droppedPackets.value / totalPackets.value;
});

const currentNoiseFloor = computed(() => {
  if (noisePoints.value.length === 0) return null;
  return noisePoints.value[noisePoints.value.length - 1].v;
});

const baselineNoiseFloor = computed(() => {
  if (noisePoints.value.length < 3) return null;
  return median(noisePoints.value.map((point) => point.v));
});

const totalCrcErrors = computed(() => {
  return crcPoints.value.reduce((sum, point) => sum + point.v, 0);
});

const rfHealthScore = computed(() => {
  const current = currentNoiseFloor.value;
  const baseline = baselineNoiseFloor.value;

  let noisePenalty = 0;
  if (current !== null && baseline !== null) {
    const delta = Math.max(0, current - baseline);
    noisePenalty = delta * 2.2;
  }

  const crcRate = totalPackets.value > 0 ? totalCrcErrors.value / totalPackets.value : 0;
  const crcPenalty = crcRate * 120;
  const dropPenalty = dropRate.value * 100;

  return clamp(Math.round(100 - (noisePenalty + crcPenalty + dropPenalty)), 0, 100);
});
const qualitySummary = computed(() => {
  const latestTs = Math.max(
    noisePoints.value.at(-1)?.t ?? 0,
    crcPoints.value.at(-1)?.t ?? 0,
  );

  const freshnessSeconds = latestTs > 0 ? Math.max(0, Math.round((Date.now() - latestTs) / 1000)) : null;
  return {
    noiseSamples: noisePoints.value.length,
    crcSamples: crcPoints.value.length,
    freshnessSeconds,
  };
});

const formatTime = (ms: number): string => {
  const date = new Date(ms);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDuration = (startMs: number, endMs: number): string => {
  const duration = Math.max(0, endMs - startMs);
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const incidentDetails = computed(() => {
  if (!selectedIncident.value) return null;
  const inc = selectedIncident.value;
  return {
    startTime: formatTime(inc.startMs),
    endTime: formatTime(inc.endMs),
    duration: formatDuration(inc.startMs, inc.endMs),
    peakNoise: inc.peakNoiseDelta.toFixed(2),
    totalCrc: inc.totalCrc.toLocaleString(),
    severityColor: inc.severity === 'high' ? 'bg-danger/10 text-danger' : inc.severity === 'medium' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success',
  };
});

const correlationRows = computed<CorrelationRow[]>(() => {
  const buckets = alignedBuckets.value;
  const joinedNoise = buckets.filter((point) => point.noise !== null);

  const noise = joinedNoise.map((point) => point.noise as number);
  const crc = joinedNoise.map((point) => point.crc);

  const baseNoiseCrc = pearson(noise, crc);

  const maxLag = 3;
  let bestLagCrc = 0;
  let bestLagCrcCorr = baseNoiseCrc;

  for (let lag = 1; lag <= maxLag; lag += 1) {
    const lagCorrCrc = laggedPearson(noise, crc, lag);
    if ((lagCorrCrc ?? 0) > (bestLagCrcCorr ?? Number.NEGATIVE_INFINITY)) {
      bestLagCrc = lag;
      bestLagCrcCorr = lagCorrCrc;
    }
  }

  return [
    {
      label: 'Noise vs CRC errors',
      correlation: baseNoiseCrc,
      strongestLagBuckets: bestLagCrc,
      strongestLagCorrelation: bestLagCrcCorr,
    },
  ];
});

const formatCorrelation = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) return 'Insufficient samples';
  return value.toFixed(3);
};

const formatDateTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
};

const formatFreshness = (seconds: number | null): string => {
  if (seconds === null) return 'Unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
};

const fetchAllData = async () => {
  if (hasLoadedOnce.value) {
    isRefreshing.value = true;
  } else {
    chartLoading.value = true;
  }

  chartError.value = null;

  try {
    const [statsRes, noiseRes, crcRes] = await Promise.all([
      streamingGet('/packet_stats', { hours: selectedHours.value }),
      streamingGet('/noise_floor_history', { hours: selectedHours.value }, {
        idleTimeoutMs: 30_000,
        onPhaseChange: (phase) => {
          chartStatus.value = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
        },
      }),
      streamingGet('/crc_error_history', { hours: selectedHours.value }),
    ]);

    const statsPayload = asRecord(statsRes.data) ?? {};
    const statsData = asRecord(statsPayload.data) ?? statsPayload;
    packetStats.value = {
      total_packets: toNumber(statsData.total_packets) ?? undefined,
      received: toNumber(statsData.received) ?? undefined,
      transmitted: toNumber(statsData.transmitted) ?? undefined,
      dropped: toNumber(statsData.dropped) ?? undefined,
    };

    noisePoints.value = extractNoisePoints(noiseRes.data);
    crcPoints.value = extractCrcPoints(crcRes.data);

    alignedBuckets.value = computeAlignedBuckets();
    incidents.value = buildIncidents(alignedBuckets.value);

    if (alignedBuckets.value.length === 0) {
      chartError.value = 'No correlation data available for the selected time range.';
    }

    await nextTick();
    createOrUpdateChart();
    hasLoadedOnce.value = true;
  } catch (error) {
    chartError.value = error instanceof Error ? error.message : 'Failed to load RF health correlation data.';
  } finally {
    chartLoading.value = false;
    isRefreshing.value = false;
  }
};

const destroyChart = () => {
  if (!chartInstance.value) return;
  toRaw(chartInstance.value).destroy();
  chartInstance.value = null;
};

const createOrUpdateChart = () => {
  if (!chartCanvasRef.value || alignedBuckets.value.length === 0) {
    destroyChart();
    return;
  }

  const ctx = chartCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const noiseData = alignedBuckets.value
    .filter((point) => point.noise !== null)
    .map((point) => ({ x: point.bucketMs, y: point.noise as number }));

  const crcData = alignedBuckets.value.map((point) => ({ x: point.bucketMs, y: point.crc }));

  const timeUnit = selectedHours.value > 48 ? ('day' as const) : ('hour' as const);

  const chartConfig = {
    type: 'bar' as const,
    data: {
      datasets: [
        {
          type: 'line' as const,
          label: 'Noise floor (dBm)',
          yAxisID: 'yNoise',
          data: noiseData,
          borderColor: resolveCssColor(CHART_COLORS.noise),
          backgroundColor: resolveCssColor(CHART_COLORS.noise),
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
          order: 1,
        },
        {
          type: 'bar' as const,
          label: 'CRC errors',
          yAxisID: 'yCount',
          data: crcData,
          borderWidth: 0,
          backgroundColor: resolveCssColor(CHART_COLORS.crc),
          barPercentage: 0.9,
          categoryPercentage: 1,
          order: 3,
        },

      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: resolveCssColor(CHART_COLORS.ticks),
          },
        },
        tooltip: {
          backgroundColor: resolveCssColor(CHART_COLORS.tooltipBg),
          titleColor: resolveCssColor(CHART_COLORS.tooltipText),
          bodyColor: resolveCssColor(CHART_COLORS.tooltipText),
          borderColor: resolveCssColor(CHART_COLORS.tooltipBorder),
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          time: {
            unit: timeUnit,
          },
          min: Date.now() - selectedHours.value * 60 * 60 * 1000,
          max: Date.now(),
          grid: {
            color: resolveCssColor(CHART_COLORS.grid),
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
            maxTicksLimit: 8,
          },
        },
        yNoise: {
          type: 'linear' as const,
          position: 'left' as const,
          title: {
            display: true,
            text: 'Noise floor (dBm)',
            color: resolveCssColor(CHART_COLORS.ticks),
          },
          grid: {
            color: resolveCssColor(CHART_COLORS.grid),
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
          },
        },
        yCount: {
          type: 'linear' as const,
          position: 'right' as const,
          beginAtZero: true,
          title: {
            display: true,
            text: 'CRC errors',
            color: resolveCssColor(CHART_COLORS.ticks),
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
          },
        },
      },
    },
  };

  if (chartInstance.value) {
    const chart = toRaw(chartInstance.value);
    chart.data = chartConfig.data as never;
    chart.options = chartConfig.options as never;
    chart.update();
    return;
  }

  const instance = new ChartJS(ctx, chartConfig as never);
  chartInstance.value = markRaw(instance);
};

const onTimeRangeChange = () => {
  chartLoading.value = true;
  void polling.runNow();
};

const handleResize = () => {
  if (!chartInstance.value) return;
  window.setTimeout(() => {
    toRaw(chartInstance.value)?.resize();
  }, 80);
};

const polling = useManagedPolling(fetchAllData, {
  intervalMs: 30_000,
  immediate: true,
});

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  destroyChart();
});
</script>

<template>
  <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-content-primary">RF Health Correlation</h2>
        <p class="text-xs sm:text-sm text-content-secondary mt-1">
          Live correlation of noise floor, CRC errors, and reported dropped packets (backend counters only).
        </p>
      </div>
   
   <!-- Incident Details Modal -->
   <IncidentDetailsModal
     :incident="selectedIncident"
     @close="selectedIncident = null"
   />

      <div class="flex items-center gap-2 sm:gap-3">
        <label class="text-content-secondary text-xs sm:text-sm">Window:</label>
        <select v-model="selectedHours" class="modal-select w-auto" @change="onTimeRangeChange">
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

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary text-xs uppercase tracking-wide">RF health score</div>
        <div class="mt-2 text-2xl font-semibold text-content-primary">{{ rfHealthScore }}</div>
      </div>

      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary text-xs uppercase tracking-wide">Current noise floor</div>
        <div class="mt-2 text-2xl font-semibold text-content-primary">
          {{ currentNoiseFloor === null ? 'N/A' : `${currentNoiseFloor.toFixed(1)} dBm` }}
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary text-xs uppercase tracking-wide">CRC errors</div>
        <div class="mt-2 text-2xl font-semibold text-content-primary">
          {{ Math.round(totalCrcErrors).toLocaleString() }}
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary text-xs uppercase tracking-wide">Dropped packets (reported)</div>
        <div class="mt-2 text-2xl font-semibold text-content-primary">{{ Math.round(droppedPackets).toLocaleString() }}</div>
        <div class="mt-1 text-xs text-content-muted">Drop rate: {{ (dropRate * 100).toFixed(2) }}%</div>
      </div>
    </div>

    <div class="glass-card rounded-[15px] p-3 sm:p-5">
      <h3 class="text-content-primary text-lg sm:text-xl font-semibold mb-3">Correlation timeline</h3>
      <ChartCard
        class="h-[17rem] sm:h-[22rem]"
        :is-loading="chartLoading"
        :is-updating="isRefreshing"
        :error="chartError"
        :status="chartStatus"
        @retry="() => polling.runNow()"
      >
        <canvas ref="chartCanvasRef" class="w-full h-full"></canvas>
      </ChartCard>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      <div class="glass-card rounded-[15px] p-4 sm:p-6">
        <h3 class="text-content-primary text-lg font-semibold mb-4">Correlation details</h3>

        <div class="space-y-3">
          <div
            v-for="row in correlationRows"
            :key="row.label"
            class="border border-stroke-subtle rounded-lg p-3"
          >
            <div class="text-content-primary font-medium">{{ row.label }}</div>
            <div class="text-content-secondary text-sm mt-1">
              Base correlation: {{ formatCorrelation(row.correlation) }}
            </div>
            <div class="text-content-secondary text-sm mt-1">
              Strongest lag: +{{ row.strongestLagBuckets }} bucket(s),
              {{ formatCorrelation(row.strongestLagCorrelation) }}
            </div>
          </div>
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4 sm:p-6">
        <h3 class="text-content-primary text-lg font-semibold mb-4">Detected incidents</h3>

        <div v-if="incidents.length === 0" class="text-content-secondary text-sm">
          No degradation windows detected for the selected time range.
        </div>

        <div v-else class="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
          <div
            v-for="incident in incidents"
            :key="incident.id"
             class="border border-stroke-subtle rounded-lg p-3 hover:bg-surface-hover/5 cursor-pointer transition-colors group"
             @click="selectedIncident = incident"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-content-primary font-medium">
                {{ formatDateTime(incident.startMs) }} to {{ formatDateTime(incident.endMs) }}
              </div>
              <span
                class="text-xs font-semibold px-2 py-1 rounded-full"
                :class="{
                  'bg-accent-red-bg text-accent-red': incident.severity === 'high',
                  'bg-warning-bg text-warning': incident.severity === 'medium',
                  'bg-accent-green-bg text-accent-green': incident.severity === 'low',
                }"
              >
                {{ incident.severity }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3 text-xs sm:text-sm text-content-secondary group-hover:text-content-primary transition-colors">
              <div>Noise delta: +{{ incident.peakNoiseDelta.toFixed(1) }} dB</div>
              <div>CRC burst: {{ Math.round(incident.totalCrc).toLocaleString() }} errors</div>
            </div>
            <div class="text-xs text-content-tertiary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to view details</div>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card rounded-[15px] p-4 sm:p-6">
      <h3 class="text-content-primary text-lg font-semibold mb-4">Data quality</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary">Noise samples</div>
          <div class="text-content-primary font-medium">{{ qualitySummary.noiseSamples }}</div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary">CRC samples</div>
          <div class="text-content-primary font-medium">{{ qualitySummary.crcSamples }}</div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary">Freshness</div>
          <div class="text-content-primary font-medium">
            {{ formatFreshness(qualitySummary.freshnessSeconds) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
