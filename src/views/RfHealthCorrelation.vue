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
import IncidentDetailsModal from '@/components/modals/IncidentDetailsModal.vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import ApiService, { type LbtDiagnosticsApiResponse, type LbtDiagnosticsPayload } from '@/utils/api';
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
  packets: number;
};

type PacketStatsPayload = {
  total_packets?: number;
  received?: number;
  transmitted?: number;
  dropped?: number;
  drop_reasons?: Array<{ reason?: string; count?: number }> | Record<string, number>;
};
type LbtBucket = LbtDiagnosticsPayload['buckets'][number];
type LbtPacketTypeSummary = LbtDiagnosticsPayload['packet_types'][number];
type LbtPacketTypeBucket = LbtDiagnosticsPayload['packet_type_buckets'][number];
type LbtFetchResult = LbtDiagnosticsApiResponse | { success: false; error: string };
type LbtChartMode = 'all' | 'retries';
type HeatmapBucketGroup = {
  id: string;
  startMs: number;
  endMs: number;
  timestampsMs: number[];
};
type HeatmapCellStatus = 'value' | 'no_traffic' | 'missing';
type HeatmapCellAggregate = {
  status: HeatmapCellStatus;
  transmissions: number;
  retryPackets: number;
  retryRatePct: number | null;
  avgAttempts: number | null;
  attempts3PlusPct: number | null;
  maxAttempts: number;
  lowSample: boolean;
};
type PacketTypeHeatmapRow = LbtPacketTypeSummary & {
  severeWindows: number;
  activeWindows: number;
};
type HeatmapSeverityBand = 'zero' | 'low' | 'elevated' | 'high' | 'severe';
type HeatmapViewMode = 'mobile' | 'tablet' | 'desktop';
type HeatmapDetail = {
  packetTypeLabel: string;
  group: HeatmapBucketGroup;
  cell: HeatmapCellAggregate;
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
const dropReasonsCanvasRef = ref<HTMLCanvasElement | null>(null);
const dropReasonsChartInstance = ref<ChartJS | null>(null);
const lbtCanvasRef = ref<HTMLCanvasElement | null>(null);
const lbtChartInstance = ref<ChartJS | null>(null);
const heatmapContainerRef = ref<HTMLDivElement | null>(null);

const hasLoadedOnce = ref(false);
const isRefreshing = ref(false);
const chartLoading = ref(true);
const chartError = ref<string | null>(null);
const chartStatus = ref('Connecting...');
const lbtError = ref<string | null>(null);
const lbtChartMode = ref<LbtChartMode>('all');
const heatmapContainerWidth = ref(0);
const showInactivePacketTypes = ref(false);
const showAllMobileRows = ref(false);
const selectedHeatmapDetail = ref<HeatmapDetail | null>(null);

const HEATMAP_MIN_COLUMNS = 30;
const HEATMAP_MAX_COLUMNS = 48;
const LOW_SAMPLE_TRANSMISSIONS = 5;
const HIGH_RETRY_ALERT_PCT = 25;
const HEATMAP_MOBILE_MIN_COLUMNS = 12;
const HEATMAP_MOBILE_MAX_COLUMNS = 18;
const HEATMAP_TABLET_MIN_COLUMNS = 20;
const HEATMAP_TABLET_MAX_COLUMNS = 32;
const HEATMAP_MOBILE_VISIBLE_ROWS = 8;

const HEATMAP_RETRY_BANDS: Array<{ key: HeatmapSeverityBand; min: number; max: number | null; label: string }> = [
  { key: 'zero', min: 0, max: 0, label: '0%' },
  { key: 'low', min: 0.0001, max: 5, label: 'Low (<5%)' },
  { key: 'elevated', min: 5, max: 15, label: 'Elevated (5-15%)' },
  { key: 'high', min: 15, max: 35, label: 'High (15-35%)' },
  { key: 'severe', min: 35, max: null, label: 'Severe (>=35%)' },
];

const packetStats = ref<PacketStatsPayload>({});
const noisePoints = ref<TimeValuePoint[]>([]);
const crcPoints = ref<TimeValuePoint[]>([]);
const packetCountPoints = ref<TimeValuePoint[]>([]);
const alignedBuckets = ref<BucketPoint[]>([]);
const incidents = ref<Incident[]>([]);
const selectedIncident = ref<Incident | null>(null);
const lbtDiagnostics = ref<LbtDiagnosticsPayload | null>(null);

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
  packetCount: 'var(--color-accent-green)',
  attempt1: 'var(--color-accent-green)',
  attempt2: 'var(--color-accent-amber)',
  attempt3: 'var(--color-accent-red)',
  attempt4Plus: '#7f1d1d',
  traffic: '#2563eb',
  snr: '#0ea5a4',
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

const extractPacketCountPoints = (raw: unknown): TimeValuePoint[] => {
  const rx = extractMetricSeriesPoints(raw, 'rx_count');
  const tx = extractMetricSeriesPoints(raw, 'tx_count');
  const merged = new Map<number, number>();

  rx.forEach((point) => {
    merged.set(point.t, (merged.get(point.t) ?? 0) + point.v);
  });
  tx.forEach((point) => {
    merged.set(point.t, (merged.get(point.t) ?? 0) + point.v);
  });

  return Array.from(merged.entries())
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => a.t - b.t);
};

const normalizeDropReasons = (
  raw: PacketStatsPayload['drop_reasons'],
): Array<{ reason: string; count: number }> => {
  if (!raw) return [];
  const canonicalizeDropReason = (reason: unknown): string => {
    const label = String(reason ?? 'Unknown').trim() || 'Unknown';
    const lower = label.toLowerCase();
    if (lower.startsWith('max flood hops limit reached')) {
      return 'Max flood hops limit reached';
    }
    return label;
  };

  const isExcludedDropReason = (reason: string): boolean => {
    const normalized = reason.trim().toLowerCase().replace(/\s+/g, '_');
    return normalized === 'trace_received';
  };

  const aggregated = new Map<string, number>();
  const addEntry = (reason: unknown, count: unknown) => {
    const normalizedReason = canonicalizeDropReason(reason);
    if (isExcludedDropReason(normalizedReason)) return;
    const normalizedCount = Math.max(0, toNumber(count) ?? 0);
    if (normalizedCount <= 0) return;
    aggregated.set(normalizedReason, (aggregated.get(normalizedReason) ?? 0) + normalizedCount);
  };

  if (Array.isArray(raw)) {
    raw.forEach((entry) => addEntry(entry?.reason, entry?.count));
  } else {
    const record = asRecord(raw);
    if (!record) return [];
    Object.entries(record).forEach(([reason, count]) => addEntry(reason, count));
  }

  return Array.from(aggregated.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
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
  const packetMap = aggregateToBuckets(packetCountPoints.value, bucketMs, 'sum');

  const keys = new Set<number>([
    ...noiseMap.keys(),
    ...crcMap.keys(),
    ...packetMap.keys(),
  ]);

  const sortedKeys = Array.from(keys).sort((a, b) => a - b);
  return sortedKeys.map((bucket) => {
    return {
      bucketMs: bucket,
      noise: noiseMap.has(bucket) ? noiseMap.get(bucket) ?? null : null,
      crc: crcMap.get(bucket) ?? 0,
      packets: packetMap.has(bucket) ? packetMap.get(bucket) ?? 0 : 0,
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

const dropReasonCounts = computed(() => {
  const reasons = normalizeDropReasons(packetStats.value.drop_reasons);
  return reasons.slice(0, 10);
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
  const latestNoiseTs = noisePoints.value.length > 0 ? noisePoints.value[noisePoints.value.length - 1].t : 0;
  const latestCrcTs = crcPoints.value.length > 0 ? crcPoints.value[crcPoints.value.length - 1].t : 0;
  const latestPacketTs = packetCountPoints.value.length > 0 ? packetCountPoints.value[packetCountPoints.value.length - 1].t : 0;
  const latestTs = Math.max(
    latestNoiseTs,
    latestCrcTs,
    latestPacketTs,
  );

  const freshnessSeconds = latestTs > 0 ? Math.max(0, Math.round((Date.now() - latestTs) / 1000)) : null;
  return {
    noiseSamples: noisePoints.value.length,
    crcSamples: crcPoints.value.length,
    packetSamples: packetCountPoints.value.length,
    freshnessSeconds,
  };
});

const lbtSummary = computed(() => lbtDiagnostics.value?.summary ?? null);
const lbtBuckets = computed<LbtBucket[]>(() => lbtDiagnostics.value?.buckets ?? []);
const lbtPacketTypes = computed<LbtPacketTypeSummary[]>(() => lbtDiagnostics.value?.packet_types ?? []);
const lbtPacketTypeBuckets = computed<LbtPacketTypeBucket[]>(
  () => lbtDiagnostics.value?.packet_type_buckets ?? [],
);
const lbtCorrelations = computed(() => lbtDiagnostics.value?.correlations ?? null);

const lbtHeatmapTimestamps = computed<number[]>(() => {
  return [...lbtBuckets.value]
    .map((bucket) => (bucket.timestamp ?? 0) * 1000)
    .sort((a, b) => a - b);
});

const lbtHeatmapColumnTarget = computed(() => {
  const width = heatmapContainerWidth.value;
  if (width <= 0) return 24;

  if (width < 640) {
    return clamp(Math.floor(width / 24), HEATMAP_MOBILE_MIN_COLUMNS, HEATMAP_MOBILE_MAX_COLUMNS);
  }

  if (width < 1024) {
    return clamp(Math.floor(width / 22), HEATMAP_TABLET_MIN_COLUMNS, HEATMAP_TABLET_MAX_COLUMNS);
  }

  const rowLabelWidth = 190;
  const usable = Math.max(240, width - rowLabelWidth);
  const columnsByWidth = Math.floor(usable / 24);
  return clamp(columnsByWidth, HEATMAP_MIN_COLUMNS, HEATMAP_MAX_COLUMNS);
});

const heatmapViewMode = computed<HeatmapViewMode>(() => {
  const width = heatmapContainerWidth.value;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
});

const heatmapLabelColumnStyle = computed(() => {
  if (heatmapViewMode.value === 'mobile') return 'minmax(128px, 156px)';
  if (heatmapViewMode.value === 'tablet') return 'minmax(164px, 208px)';
  return 'minmax(220px, 280px)';
});

const lbtHeatmapTimeLabelStep = computed(() => {
  if (heatmapViewMode.value === 'mobile') {
    const columns = lbtHeatmapBucketGroups.value.length;
    if (columns <= 12) return 2;
    return 3;
  }

  const columns = lbtHeatmapBucketGroups.value.length;
  if (columns <= 24) return 1;
  if (columns <= 36) return 2;
  return 3;
});

const shouldShowHeatmapTimeLabel = (index: number): boolean => {
  const last = lbtHeatmapBucketGroups.value.length - 1;
  if (index === 0 || index === last) return true;
  return index % lbtHeatmapTimeLabelStep.value === 0;
};

const lbtHeatmapBucketGroups = computed<HeatmapBucketGroup[]>(() => {
  const timestamps = lbtHeatmapTimestamps.value;
  if (timestamps.length === 0) return [];

  const targetColumns = Math.min(lbtHeatmapColumnTarget.value, timestamps.length);
  const groupSize = Math.max(1, Math.ceil(timestamps.length / Math.max(1, targetColumns)));

  const groups: HeatmapBucketGroup[] = [];
  for (let i = 0; i < timestamps.length; i += groupSize) {
    const slice = timestamps.slice(i, i + groupSize);
    const startMs = slice[0];
    const endMs = slice[slice.length - 1];
    groups.push({
      id: `${startMs}-${endMs}`,
      startMs,
      endMs,
      timestampsMs: slice,
    });
  }

  return groups;
});

const lbtHeatmapRows = computed<LbtPacketTypeSummary[]>(() => {
  const rows = [...lbtPacketTypes.value];
  if (rows.length > 0) return rows;

  const fallback = new Map<number, LbtPacketTypeSummary>();
  lbtPacketTypeBuckets.value.forEach((bucket) => {
    const code = bucket.packet_type ?? -1;
    const current = fallback.get(code);
    if (!current) {
      fallback.set(code, {
        packet_type: code,
        packet_type_label: bucket.packet_type_label ?? `Type ${code}`,
        transmissions: bucket.transmissions ?? 0,
        retry_packets: bucket.retry_packets ?? 0,
        retry_rate_pct: bucket.retry_rate_pct ?? null,
      });
      return;
    }
    current.transmissions += bucket.transmissions ?? 0;
    current.retry_packets += bucket.retry_packets ?? 0;
    current.retry_rate_pct =
      current.transmissions > 0 ? (current.retry_packets * 100) / current.transmissions : null;
  });

  return Array.from(fallback.values()).sort((a, b) => b.transmissions - a.transmissions);
});

const lbtHeatmapRowsRanked = computed<PacketTypeHeatmapRow[]>(() => {
  const byType = new Map<number, PacketTypeHeatmapRow>();

  lbtHeatmapRows.value.forEach((row) => {
    byType.set(row.packet_type, {
      ...row,
      severeWindows: 0,
      activeWindows: 0,
    });
  });

  lbtPacketTypeBuckets.value.forEach((bucket) => {
    const pktType = bucket.packet_type ?? -1;
    const transmissions = bucket.transmissions ?? 0;
    const retryRate = bucket.retry_rate_pct ?? 0;
    let row = byType.get(pktType);
    if (!row) {
      row = {
        packet_type: pktType,
        packet_type_label: bucket.packet_type_label ?? `Type ${pktType}`,
        transmissions: 0,
        retry_packets: 0,
        retry_rate_pct: null,
        severeWindows: 0,
        activeWindows: 0,
      };
      byType.set(pktType, row);
    }

    if (transmissions > 0) {
      row.activeWindows += 1;
      if (retryRate >= HIGH_RETRY_ALERT_PCT && transmissions >= LOW_SAMPLE_TRANSMISSIONS) {
        row.severeWindows += 1;
      }
    }
  });

  const rows = Array.from(byType.values());
  rows.forEach((row) => {
    const tx = Math.max(0, row.transmissions ?? 0);
    const retry = Math.max(0, row.retry_packets ?? 0);
    row.retry_rate_pct = tx > 0 ? (retry * 100) / tx : null;
  });

  return rows.sort((a, b) => {
    const aTx = a.transmissions ?? 0;
    const bTx = b.transmissions ?? 0;
    const aActive = aTx > 0 ? 1 : 0;
    const bActive = bTx > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const aSeverity = (a.retry_rate_pct ?? 0) * Math.log10(aTx + 1) + a.severeWindows * 12;
    const bSeverity = (b.retry_rate_pct ?? 0) * Math.log10(bTx + 1) + b.severeWindows * 12;
    if (Math.abs(bSeverity - aSeverity) > 1e-6) return bSeverity - aSeverity;

    if (bTx !== aTx) return bTx - aTx;
    return a.packet_type_label.localeCompare(b.packet_type_label);
  });
});

const visibleHeatmapRows = computed<PacketTypeHeatmapRow[]>(() => {
  if (showInactivePacketTypes.value) return lbtHeatmapRowsRanked.value;
  return lbtHeatmapRowsRanked.value.filter((row) => (row.transmissions ?? 0) > 0);
});

const heatmapDisplayRows = computed<PacketTypeHeatmapRow[]>(() => {
  const rows = visibleHeatmapRows.value;
  if (heatmapViewMode.value !== 'mobile' || showAllMobileRows.value) return rows;
  return rows.slice(0, HEATMAP_MOBILE_VISIBLE_ROWS);
});

const hiddenInactiveRowCount = computed(() => {
  return lbtHeatmapRowsRanked.value.filter((row) => (row.transmissions ?? 0) <= 0).length;
});

const hiddenMobileRowCount = computed(() => {
  return Math.max(0, visibleHeatmapRows.value.length - heatmapDisplayRows.value.length);
});

const lbtHeatmapBucketMap = computed(() => {
  const map = new Map<string, LbtPacketTypeBucket>();
  lbtPacketTypeBuckets.value.forEach((bucket) => {
    const key = `${bucket.packet_type}:${bucket.timestamp}`;
    map.set(key, bucket);
  });
  return map;
});

const lbtHasData = computed(() => {
  return Boolean(lbtSummary.value?.has_lbt_data);
});

const lbtWorstBucketLabel = computed(() => {
  const worst = lbtSummary.value?.worst_bucket;
  if (!worst) return 'No transmission buckets';
  const tsLabel = new Date(worst.timestamp * 1000).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
  return `${tsLabel} • Retry ${worst.retry_rate_pct.toFixed(1)}%`;
});

const formatPct = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value.toFixed(decimals)}%`;
};

const formatNullable = (value: number | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
};

const formatCorrelationMetric = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Insufficient samples';
  return value.toFixed(3);
};

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
    severityColor: inc.severity === 'high' ? 'bg-accent-red/opacity-light text-accent-red' : inc.severity === 'medium' ? 'bg-accent-amber/opacity-light text-accent-amber' : 'bg-accent-green/opacity-light text-accent-green',
  };
});

const correlationRows = computed<CorrelationRow[]>(() => {
  const buckets = alignedBuckets.value;
  const joinedNoise = buckets.filter((point) => point.noise !== null);

  const noise = joinedNoise.map((point) => point.noise as number);
  const crc = joinedNoise.map((point) => point.crc);
  const packets = joinedNoise.map((point) => point.packets);

  const baseNoiseCrc = pearson(noise, crc);
  const baseNoisePackets = pearson(noise, packets);

  const maxLag = 3;
  let bestLagCrc = 0;
  let bestLagCrcCorr = baseNoiseCrc;
  let bestLagPackets = 0;
  let bestLagPacketsCorr = baseNoisePackets;

  for (let lag = 1; lag <= maxLag; lag += 1) {
    const lagCorrCrc = laggedPearson(noise, crc, lag);
    const lagCorrPackets = laggedPearson(noise, packets, lag);
    if ((lagCorrCrc ?? 0) > (bestLagCrcCorr ?? Number.NEGATIVE_INFINITY)) {
      bestLagCrc = lag;
      bestLagCrcCorr = lagCorrCrc;
    }
    if ((lagCorrPackets ?? 0) > (bestLagPacketsCorr ?? Number.NEGATIVE_INFINITY)) {
      bestLagPackets = lag;
      bestLagPacketsCorr = lagCorrPackets;
    }
  }

  return [
    {
      label: 'Noise vs CRC errors',
      correlation: baseNoiseCrc,
      strongestLagBuckets: bestLagCrc,
      strongestLagCorrelation: bestLagCrcCorr,
    },
    {
      label: 'Noise vs packet activity',
      correlation: baseNoisePackets,
      strongestLagBuckets: bestLagPackets,
      strongestLagCorrelation: bestLagPacketsCorr,
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

const formatHeatmapTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatHeatmapBucketLabel = (group: HeatmapBucketGroup): string => {
  const start = new Date(group.startMs);
  const end = new Date(group.endMs);
  const startLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endLabel = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return group.startMs === group.endMs ? startLabel : `${startLabel}-${endLabel}`;
};

const formatHeatmapBucketRange = (group: HeatmapBucketGroup): string => {
  if (group.startMs === group.endMs) return formatHeatmapTime(group.startMs);
  return `${formatHeatmapTime(group.startMs)} to ${formatHeatmapTime(group.endMs)}`;
};

const splitPacketTypeLabel = (label: string): { name: string; code: string } => {
  const text = String(label ?? '').trim();
  const match = text.match(/^(.*)\s\(([^)]+)\)$/);
  if (!match) return { name: text, code: '' };
  return {
    name: match[1].trim(),
    code: match[2].trim(),
  };
};

const getHeatmapCell = (packetType: number, timestampMs: number): LbtPacketTypeBucket | null => {
  const key = `${packetType}:${Math.round(timestampMs / 1000)}`;
  return lbtHeatmapBucketMap.value.get(key) ?? null;
};

const aggregateHeatmapCell = (packetType: number, group: HeatmapBucketGroup): HeatmapCellAggregate => {
  const records = group.timestampsMs
    .map((timestampMs) => getHeatmapCell(packetType, timestampMs))
    .filter((item): item is LbtPacketTypeBucket => Boolean(item));

  if (records.length === 0) {
    return {
      status: 'no_traffic',
      transmissions: 0,
      retryPackets: 0,
      retryRatePct: null,
      avgAttempts: null,
      attempts3PlusPct: null,
      maxAttempts: 0,
      lowSample: false,
    };
  }

  const transmissions = records.reduce((sum, item) => sum + Math.max(0, item.transmissions ?? 0), 0);
  const retryPackets = records.reduce((sum, item) => sum + Math.max(0, item.retry_packets ?? 0), 0);
  const totalAttempts = records.reduce((sum, item) => sum + Math.max(0, item.total_attempts ?? 0), 0);
  const attempts3Plus = records.reduce((sum, item) => sum + Math.max(0, item.attempts_3_plus ?? 0), 0);
  const maxAttempts = records.reduce((max, item) => Math.max(max, item.max_attempts ?? 0), 0);

  if (transmissions <= 0) {
    return {
      status: 'no_traffic',
      transmissions: 0,
      retryPackets: 0,
      retryRatePct: null,
      avgAttempts: null,
      attempts3PlusPct: null,
      maxAttempts: 0,
      lowSample: false,
    };
  }

  const retryRatePct = (retryPackets * 100) / transmissions;
  const avgAttempts = totalAttempts / transmissions;
  const attempts3PlusPct = (attempts3Plus * 100) / transmissions;
  const lowSample = transmissions < LOW_SAMPLE_TRANSMISSIONS;

  if (!Number.isFinite(retryRatePct) || !Number.isFinite(avgAttempts) || !Number.isFinite(attempts3PlusPct)) {
    return {
      status: 'missing',
      transmissions,
      retryPackets,
      retryRatePct: null,
      avgAttempts: null,
      attempts3PlusPct: null,
      maxAttempts,
      lowSample,
    };
  }

  return {
    status: 'value',
    transmissions,
    retryPackets,
    retryRatePct,
    avgAttempts,
    attempts3PlusPct,
    maxAttempts,
    lowSample,
  };
};

const lbtHeatmapCellMap = computed(() => {
  const map = new Map<string, HeatmapCellAggregate>();
  heatmapDisplayRows.value.forEach((row) => {
    lbtHeatmapBucketGroups.value.forEach((group) => {
      map.set(`${row.packet_type}:${group.id}`, aggregateHeatmapCell(row.packet_type, group));
    });
  });
  return map;
});

const getHeatmapCellAggregate = (packetType: number, group: HeatmapBucketGroup): HeatmapCellAggregate => {
  const key = `${packetType}:${group.id}`;
  return lbtHeatmapCellMap.value.get(key) ?? {
    status: 'no_traffic',
    transmissions: 0,
    retryPackets: 0,
    retryRatePct: null,
    avgAttempts: null,
    attempts3PlusPct: null,
    maxAttempts: 0,
    lowSample: false,
  };
};

const getHeatmapSeverityBand = (retryRatePct: number | null): HeatmapSeverityBand => {
  if (retryRatePct === null || !Number.isFinite(retryRatePct) || retryRatePct <= 0) return 'zero';
  if (retryRatePct < 5) return 'low';
  if (retryRatePct < 15) return 'elevated';
  if (retryRatePct < 35) return 'high';
  return 'severe';
};

const getHeatmapSeverityColor = (band: HeatmapSeverityBand): string => {
  switch (band) {
    case 'zero':
      return 'rgba(30, 41, 59, 0.42)';
    case 'low':
      return 'rgba(56, 189, 248, 0.36)';
    case 'elevated':
      return 'rgba(245, 158, 11, 0.54)';
    case 'high':
      return 'rgba(249, 115, 22, 0.68)';
    case 'severe':
      return 'rgba(248, 50, 69, 0.88)';
    default:
      return 'rgba(30, 41, 59, 0.42)';
  }
};

const getSeverityLegendItems = () => {
  return HEATMAP_RETRY_BANDS.map((band) => ({
    label: band.label,
    color: getHeatmapSeverityColor(band.key),
  }));
};

const heatmapSeverityLegendItems = computed(() => getSeverityLegendItems());

const getHeatmapCellStyle = (cell: HeatmapCellAggregate) => {
  if (cell.status === 'no_traffic') {
    return {
      backgroundColor: 'rgba(15, 23, 42, 0.12)',
      borderColor: resolveCssColor(CHART_COLORS.grid),
      borderStyle: 'solid',
    };
  }

  if (cell.status === 'missing') {
    return {
      backgroundColor: 'rgba(148, 163, 184, 0.16)',
      borderColor: resolveCssColor(CHART_COLORS.grid),
      borderStyle: 'dashed',
    };
  }

  const band = getHeatmapSeverityBand(cell.retryRatePct);
  const color = getHeatmapSeverityColor(band);

  const lowSampleOverlay = cell.lowSample
    ? {
        backgroundImage:
          'radial-gradient(rgba(255, 255, 255, 0.45) 0.75px, transparent 0.75px)',
        backgroundSize: '4px 4px',
      }
    : {};

  return {
    backgroundColor: color,
    borderColor: resolveCssColor(CHART_COLORS.grid),
    borderStyle: 'solid',
    ...lowSampleOverlay,
  };
};

const getHeatmapCellTitle = (
  packetTypeLabel: string,
  group: HeatmapBucketGroup,
  cell: HeatmapCellAggregate,
): string => {
  const rangeLabel = formatHeatmapBucketRange(group);

  if (cell.status === 'no_traffic') {
    return `${packetTypeLabel}\n${rangeLabel}\nNo transmissions in this period`;
  }

  if (cell.status === 'missing') {
    return `${packetTypeLabel}\n${rangeLabel}\nData unavailable for this period`;
  }

  const lines = [
    `${packetTypeLabel}`,
    `${rangeLabel}`,
    `Retry rate: ${formatPct(cell.retryRatePct)}`,
    `Transmissions: ${cell.transmissions.toLocaleString()}`,
    `Requiring retries: ${cell.retryPackets.toLocaleString()}`,
    `Avg attempts: ${formatNullable(cell.avgAttempts)}`,
    `3+ attempts: ${formatPct(cell.attempts3PlusPct)}`,
    `Max attempts: ${cell.maxAttempts}`,
  ];

  if (cell.lowSample) {
    lines.push(`Low sample: under ${LOW_SAMPLE_TRANSMISSIONS} transmissions`);
  }

  return lines.join('\n');
};

const openHeatmapDetail = (
  packetTypeLabel: string,
  group: HeatmapBucketGroup,
  cell: HeatmapCellAggregate,
) => {
  if (heatmapViewMode.value !== 'mobile') return;
  selectedHeatmapDetail.value = {
    packetTypeLabel,
    group,
    cell,
  };
};

const closeHeatmapDetail = () => {
  selectedHeatmapDetail.value = null;
};

const heatmapDetailTitle = computed(() => {
  const detail = selectedHeatmapDetail.value;
  if (!detail) return '';
  return `${detail.packetTypeLabel} • ${formatHeatmapBucketRange(detail.group)}`;
});

const heatmapDetailLines = computed(() => {
  const detail = selectedHeatmapDetail.value;
  if (!detail) return [];
  return getHeatmapCellTitle(detail.packetTypeLabel, detail.group, detail.cell)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(1);
});

const fetchAllData = async () => {
  if (hasLoadedOnce.value) {
    isRefreshing.value = true;
  } else {
    chartLoading.value = true;
  }

  chartError.value = null;
  lbtError.value = null;

  try {
    const lbtPromise: Promise<LbtFetchResult> = ApiService.getLbtDiagnostics({
      hours: selectedHours.value,
    }).catch((error) => {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load LBT diagnostics' };
    });

    const [statsRes, noiseRes, crcRes, metricsRes, lbtRes] = await Promise.all([
      streamingGet('/packet_stats', { hours: selectedHours.value }),
      streamingGet('/noise_floor_history', { hours: selectedHours.value }, {
        idleTimeoutMs: 30_000,
        onPhaseChange: (phase) => {
          chartStatus.value = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
        },
      }),
      streamingGet('/crc_error_history', { hours: selectedHours.value }),
      streamingGet('/metrics_graph_data', {
        hours: selectedHours.value,
        resolution: 'average',
        metrics: 'rx_count,tx_count',
      }),
      lbtPromise,
    ]);

    const statsPayload = asRecord(statsRes.data) ?? {};
    const statsData = asRecord(statsPayload.data) ?? statsPayload;
    packetStats.value = {
      total_packets: toNumber(statsData.total_packets) ?? undefined,
      received: toNumber(statsData.received) ?? undefined,
      transmitted: toNumber(statsData.transmitted) ?? undefined,
      dropped: toNumber(statsData.dropped) ?? undefined,
      drop_reasons: (statsData.drop_reasons as PacketStatsPayload['drop_reasons']) ?? undefined,
    };

    noisePoints.value = extractNoisePoints(noiseRes.data);
    crcPoints.value = extractCrcPoints(crcRes.data);
    packetCountPoints.value = extractPacketCountPoints(metricsRes.data);

    const lbtData = 'data' in lbtRes ? lbtRes.data : undefined;
    if (lbtRes?.success && lbtData) {
      lbtDiagnostics.value = lbtData;
    } else {
      lbtDiagnostics.value = null;
      lbtError.value = lbtRes?.error ?? 'LBT diagnostics unavailable';
    }

    alignedBuckets.value = computeAlignedBuckets();
    incidents.value = buildIncidents(alignedBuckets.value);

    if (alignedBuckets.value.length === 0) {
      chartError.value = 'No correlation data available for the selected time range.';
    }

    await nextTick();
    createOrUpdateChart();
    createOrUpdateDropReasonsChart();
    createOrUpdateLbtChart();
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

const destroyLbtChart = () => {
  if (!lbtChartInstance.value) return;
  toRaw(lbtChartInstance.value).destroy();
  lbtChartInstance.value = null;
};

const destroyDropReasonsChart = () => {
  if (!dropReasonsChartInstance.value) return;
  toRaw(dropReasonsChartInstance.value).destroy();
  dropReasonsChartInstance.value = null;
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
  const maxCrc = Math.max(1, ...crcData.map((point) => point.y));
  const packetBucketData = alignedBuckets.value.map((point) => ({ x: point.bucketMs, y: point.packets }));
  const packetValues = packetBucketData.map((point) => point.y);
  const packetP95 = packetValues.length > 0 ? percentile(packetValues, 0.95) : 1;
  const maxPacketCount = Math.max(1, Math.ceil(packetP95 * 1.25));

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
        },
        {
          type: 'line' as const,
          label: 'Packet count (bucket)',
          yAxisID: 'yPacketCount',
          data: packetBucketData,
          borderColor: resolveCssColor(CHART_COLORS.packetCount),
          backgroundColor: resolveCssColor(CHART_COLORS.packetCount),
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
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
          max: Math.ceil(maxCrc * 1.2),
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
        yPacketCount: {
          type: 'linear' as const,
          position: 'right' as const,
          offset: true,
          beginAtZero: true,
          max: Math.ceil(maxPacketCount * 1.2),
          title: {
            display: true,
            text: 'Packet count',
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

const createOrUpdateDropReasonsChart = () => {
  if (!dropReasonsCanvasRef.value || dropReasonCounts.value.length === 0) {
    destroyDropReasonsChart();
    return;
  }

  const ctx = dropReasonsCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const labels = dropReasonCounts.value.map((entry) => entry.reason);
  const values = dropReasonCounts.value.map((entry) => entry.count);
  const maxCount = Math.max(1, ...values);

  const config = {
    type: 'bar' as const,
    data: {
      labels,
      datasets: [
        {
          label: 'Dropped packets',
          data: values,
          backgroundColor: resolveCssColor(CHART_COLORS.crc),
          borderColor: resolveCssColor(CHART_COLORS.crc),
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y' as const,
      plugins: {
        legend: {
          display: false,
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
          beginAtZero: true,
          suggestedMax: Math.ceil(maxCount * 1.15),
          grid: {
            color: resolveCssColor(CHART_COLORS.grid),
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
          },
          title: {
            display: true,
            text: 'Dropped packets',
            color: resolveCssColor(CHART_COLORS.ticks),
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
            autoSkip: false,
          },
        },
      },
    },
  };

  if (dropReasonsChartInstance.value) {
    const chart = toRaw(dropReasonsChartInstance.value);
    chart.data = config.data as never;
    chart.options = config.options as never;
    chart.update();
    return;
  }

  const instance = new ChartJS(ctx, config as never);
  dropReasonsChartInstance.value = markRaw(instance);
};

const createOrUpdateLbtChart = () => {
  if (!lbtCanvasRef.value || lbtBuckets.value.length === 0) {
    destroyLbtChart();
    return;
  }

  const ctx = lbtCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const sortedBuckets = [...lbtBuckets.value].sort((a, b) => a.timestamp - b.timestamp);
  const bucketByTimestampMs = new Map<number, LbtBucket>(
    sortedBuckets.map((bucket) => [bucket.timestamp * 1000, bucket]),
  );

  const toPctSeries = (selector: (bucket: LbtBucket) => number) => {
    return sortedBuckets.map((bucket) => {
      const transmissions = Math.max(0, bucket.transmissions ?? 0);
      const pct = transmissions > 0 ? (selector(bucket) * 100) / transmissions : 0;
      return { x: bucket.timestamp * 1000, y: pct };
    });
  };

  const attempt1Pct = toPctSeries((bucket) => bucket.attempts_1 ?? 0);
  const attempt2Pct = toPctSeries((bucket) => bucket.attempts_2 ?? 0);
  const attempt3Pct = toPctSeries((bucket) => bucket.attempts_3 ?? 0);
  const attempt4PlusPct = toPctSeries((bucket) => bucket.attempts_4_plus ?? 0);
  const retryShareSeries = sortedBuckets.map((bucket) => ({
    x: bucket.timestamp * 1000,
    y: bucket.retry_rate_pct ?? 0,
  }));
  const trafficSeries = sortedBuckets.map((bucket) => ({
    x: bucket.timestamp * 1000,
    y: bucket.rf?.traffic_volume ?? 0,
  }));
  const snrSeries = sortedBuckets
    .filter((bucket) => bucket.rf?.avg_snr !== null && bucket.rf?.avg_snr !== undefined)
    .map((bucket) => ({ x: bucket.timestamp * 1000, y: bucket.rf?.avg_snr as number }));

  const maxTraffic = Math.max(1, ...trafficSeries.map((point) => point.y));
  const maxTrafficAxis = Math.ceil(maxTraffic * 1.2);
  const maxRetryShare = Math.max(5, ...retryShareSeries.map((point) => point.y));
  const timeUnit = selectedHours.value > 48 ? ('day' as const) : ('hour' as const);
  const showRetriesOnly = lbtChartMode.value === 'retries';

  const attempt1Color = `${resolveCssColor(CHART_COLORS.attempt1)}55`;

  const attemptDatasets = showRetriesOnly
    ? [
        {
          type: 'bar' as const,
          label: 'Attempt 2',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt2Pct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt2),
          borderWidth: 0,
        },
        {
          type: 'bar' as const,
          label: 'Attempt 3',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt3Pct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt3),
          borderWidth: 0,
        },
        {
          type: 'bar' as const,
          label: 'Attempt 4+',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt4PlusPct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt4Plus),
          borderWidth: 0,
        },
      ]
    : [
        {
          type: 'bar' as const,
          label: 'Attempt 1',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt1Pct,
          backgroundColor: attempt1Color,
          borderColor: resolveCssColor(CHART_COLORS.attempt1),
          borderWidth: 1,
        },
        {
          type: 'bar' as const,
          label: 'Attempt 2',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt2Pct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt2),
          borderWidth: 0,
        },
        {
          type: 'bar' as const,
          label: 'Attempt 3',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt3Pct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt3),
          borderWidth: 0,
        },
        {
          type: 'bar' as const,
          label: 'Attempt 4+',
          yAxisID: 'yPct',
          stack: 'attempts',
          data: attempt4PlusPct,
          backgroundColor: resolveCssColor(CHART_COLORS.attempt4Plus),
          borderWidth: 0,
        },
      ];

  const config = {
    type: 'bar' as const,
    data: {
      datasets: [
        ...attemptDatasets,
        {
          type: 'line' as const,
          label: 'Traffic volume',
          yAxisID: 'yTraffic',
          data: trafficSeries,
          borderColor: resolveCssColor(CHART_COLORS.traffic),
          backgroundColor: resolveCssColor(CHART_COLORS.traffic),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.2,
        },
        {
          type: 'line' as const,
          label: 'Avg SNR (dB)',
          yAxisID: 'ySnr',
          data: snrSeries,
          borderColor: resolveCssColor(CHART_COLORS.snr),
          backgroundColor: resolveCssColor(CHART_COLORS.snr),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.2,
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
          callbacks: {
            afterBody: (items: Array<{ parsed: { x?: number } }>) => {
              const ts = items?.[0]?.parsed?.x;
              if (!ts) return [];
              const bucket = bucketByTimestampMs.get(Math.round(ts));
              if (!bucket) return [];
              return [
                `Transmissions: ${bucket.transmissions.toLocaleString()}`,
                `Retry rate: ${formatPct(bucket.retry_rate_pct)}`,
                `First-attempt success: ${formatPct(bucket.first_attempt_success_rate_pct)}`,
                `Avg attempts: ${formatNullable(bucket.avg_attempts)}`,
                `3+ attempts: ${formatPct(bucket.attempts_3_plus_pct)}`,
                `Max attempts: ${bucket.max_attempts}`,
                `Packet loss: ${formatPct(bucket.rf?.packet_loss_rate_pct)}`,
                `Avg RSSI: ${formatNullable(bucket.rf?.avg_rssi, 1)}`,
                `Avg SNR: ${formatNullable(bucket.rf?.avg_snr, 1)}`,
              ];
            },
          },
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
          stacked: true,
          grid: {
            color: resolveCssColor(CHART_COLORS.grid),
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
            maxTicksLimit: 8,
          },
        },
        yPct: {
          type: 'linear' as const,
          position: 'left' as const,
          stacked: true,
          min: 0,
          max: showRetriesOnly ? Math.min(100, Math.ceil(maxRetryShare * 1.2)) : 100,
          title: {
            display: true,
            text: showRetriesOnly
              ? 'Retry share of transmissions (%)'
              : 'Attempt distribution (%)',
            color: resolveCssColor(CHART_COLORS.ticks),
          },
          grid: {
            color: resolveCssColor(CHART_COLORS.grid),
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
            callback: (value: string | number) => `${value}%`,
          },
        },
        yTraffic: {
          type: 'linear' as const,
          position: 'right' as const,
          beginAtZero: true,
          max: maxTrafficAxis,
          title: {
            display: true,
            text: 'Traffic volume',
            color: resolveCssColor(CHART_COLORS.ticks),
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: resolveCssColor(CHART_COLORS.ticks),
          },
        },
        ySnr: {
          type: 'linear' as const,
          position: 'right' as const,
          offset: true,
          title: {
            display: true,
            text: 'Avg SNR (dB)',
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

  if (lbtChartInstance.value) {
    const chart = toRaw(lbtChartInstance.value);
    chart.data = config.data as never;
    chart.options = config.options as never;
    chart.update();
    return;
  }

  const instance = new ChartJS(ctx, config as never);
  lbtChartInstance.value = markRaw(instance);
};

const onTimeRangeChange = () => {
  chartLoading.value = true;
  void polling.runNow();
};

const handleResize = () => {
  window.setTimeout(() => {
    heatmapContainerWidth.value = heatmapContainerRef.value?.clientWidth ?? heatmapContainerWidth.value;
    toRaw(chartInstance.value)?.resize();
    toRaw(dropReasonsChartInstance.value)?.resize();
    toRaw(lbtChartInstance.value)?.resize();
  }, 80);
};

const polling = useManagedPolling(fetchAllData, {
  intervalMs: 30_000,
  immediate: true,
});

onMounted(() => {
  heatmapContainerWidth.value = heatmapContainerRef.value?.clientWidth ?? 0;
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  destroyChart();
  destroyDropReasonsChart();
  destroyLbtChart();
});
</script>

<template>
  <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-content-primary">RF Health Correlation</h2>
        <p class="text-xs sm:text-sm text-content-secondary mt-1">
          Live correlation of noise floor, CRC errors, and packet activity so you can spot traffic-related peaks.
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

    <div class="glass-card rounded-[15px] p-3 sm:p-5">
      <h3 class="text-content-primary text-lg sm:text-xl font-semibold mb-1">Drop reasons</h3>
      <p class="text-xs sm:text-sm text-content-secondary mb-3">
        Top causes for dropped packets in the selected window.
      </p>
      <div
        v-if="dropReasonCounts.length === 0"
        class="text-sm text-content-secondary border border-stroke-subtle rounded-lg p-4"
      >
        No drop reasons were recorded in this time range.
      </div>
      <ChartCard
        v-else
        class="h-[15rem] sm:h-[19rem]"
        :is-loading="chartLoading"
        :is-updating="isRefreshing"
        :error="null"
        status="Building drop-reason breakdown..."
        @retry="() => polling.runNow()"
      >
        <canvas ref="dropReasonsCanvasRef" class="w-full h-full"></canvas>
      </ChartCard>
    </div>

    <div class="glass-card rounded-[15px] p-4 sm:p-6 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-content-primary text-lg sm:text-xl font-semibold">LBT diagnostics</h3>
          <p class="text-xs sm:text-sm text-content-secondary mt-1">
            Attempt distribution and retry behaviour aligned with traffic and RF quality.
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <div class="inline-flex rounded-lg border border-stroke-subtle overflow-hidden text-xs">
            <button
              class="px-3 py-1.5"
              :class="lbtChartMode === 'all' ? 'bg-surface-hover text-content-primary' : 'bg-transparent text-content-secondary'"
              @click="lbtChartMode = 'all'; createOrUpdateLbtChart()"
            >
              All attempts
            </button>
            <button
              class="px-3 py-1.5 border-l border-stroke-subtle"
              :class="lbtChartMode === 'retries' ? 'bg-surface-hover text-content-primary' : 'bg-transparent text-content-secondary'"
              @click="lbtChartMode = 'retries'; createOrUpdateLbtChart()"
            >
              Retries only
            </button>
          </div>

          <div class="text-xs text-content-muted text-right">
            Worst bucket
            <div class="text-content-primary font-medium mt-1">{{ lbtWorstBucketLabel }}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary text-xs uppercase tracking-wide">First-attempt success</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">
            {{ formatPct(lbtSummary?.first_attempt_success_rate_pct) }}
          </div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary text-xs uppercase tracking-wide">Retry rate</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">
            {{ formatPct(lbtSummary?.retry_rate_pct) }}
          </div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary text-xs uppercase tracking-wide">Avg attempts</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">
            {{ formatNullable(lbtSummary?.avg_attempts) }}
          </div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary text-xs uppercase tracking-wide">Packets requiring 3+</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">
            {{ formatPct(lbtSummary?.attempts_3_plus_pct) }}
          </div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-secondary text-xs uppercase tracking-wide">Max attempts</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">
            {{ lbtSummary?.max_attempts ?? 0 }}
          </div>
        </div>
      </div>

      <div v-if="!lbtHasData && !lbtError" class="text-sm text-content-secondary border border-stroke-subtle rounded-lg p-4">
        No LBT transmission-path data is available for this window. This is different from zero retries.
      </div>

      <ChartCard
        class="h-[18rem] sm:h-[24rem]"
        :is-loading="chartLoading"
        :is-updating="isRefreshing"
        :error="lbtError"
        status="Aggregating LBT buckets..."
        @retry="() => polling.runNow()"
      >
        <canvas ref="lbtCanvasRef" class="w-full h-full"></canvas>
      </ChartCard>

      <div class="space-y-2">
        <h4 class="text-content-primary text-sm sm:text-base font-semibold">Retry rate by packet type over time</h4>
        <p class="text-xs sm:text-sm text-content-secondary">
          Rows are packet types and columns are compact time windows across the selected range. Color intensity highlights retry pressure; hover for exact values and sample size.
        </p>

        <div
          v-if="heatmapDisplayRows.length === 0 || lbtHeatmapBucketGroups.length === 0"
          class="text-sm text-content-secondary border border-stroke-subtle rounded-lg p-4"
        >
          No packet-type LBT transmissions are available for this range.
        </div>

        <div v-else ref="heatmapContainerRef" class="border border-stroke-subtle rounded-lg p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="text-[11px] text-content-muted">
              {{ lbtHeatmapBucketGroups.length }} columns shown (adaptive compact view)
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="hiddenInactiveRowCount > 0"
                class="text-xs px-2.5 py-1 rounded-md border border-stroke-subtle text-content-secondary hover:text-content-primary"
                @click="showInactivePacketTypes = !showInactivePacketTypes"
              >
                {{ showInactivePacketTypes ? 'Hide inactive packet types' : `Show inactive packet types (${hiddenInactiveRowCount})` }}
              </button>
              <button
                v-if="heatmapViewMode === 'mobile' && hiddenMobileRowCount > 0"
                class="text-xs px-2.5 py-1 rounded-md border border-stroke-subtle text-content-secondary hover:text-content-primary"
                @click="showAllMobileRows = !showAllMobileRows"
              >
                {{ showAllMobileRows ? 'Show fewer packet types' : `Show more packet types (${hiddenMobileRowCount})` }}
              </button>
            </div>
          </div>

          <div class="space-y-1">
            <div
              class="grid gap-1"
              :style="{ gridTemplateColumns: `${heatmapLabelColumnStyle} repeat(${lbtHeatmapBucketGroups.length}, minmax(0, 1fr))` }"
            >
              <div class="text-xs text-content-secondary font-medium p-1">Packet type</div>
              <div
                v-for="(group, columnIndex) in lbtHeatmapBucketGroups"
                :key="`h-${group.id}`"
                class="text-[10px] text-content-muted text-center leading-tight p-1"
                :title="formatHeatmapBucketRange(group)"
              >
                {{ shouldShowHeatmapTimeLabel(columnIndex) ? formatHeatmapBucketLabel(group) : '' }}
              </div>
            </div>

            <div
              v-for="row in heatmapDisplayRows"
              :key="row.packet_type"
              class="grid gap-1"
              :style="{ gridTemplateColumns: `${heatmapLabelColumnStyle} repeat(${lbtHeatmapBucketGroups.length}, minmax(0, 1fr))` }"
            >
              <div class="px-1 py-1.5 leading-tight" :title="row.packet_type_label">
                <div class="text-xs text-content-primary font-medium truncate">
                  {{ splitPacketTypeLabel(row.packet_type_label).name }}
                </div>
                <div class="text-[10px] text-content-muted mt-0.5">
                  <span
                    v-if="splitPacketTypeLabel(row.packet_type_label).code"
                    class="inline-flex items-center px-1.5 py-0.5 rounded border border-stroke-subtle"
                  >
                    {{ splitPacketTypeLabel(row.packet_type_label).code }}
                  </span>
                  <span v-else class="inline-flex items-center px-1.5 py-0.5 rounded border border-stroke-subtle">
                    TYPE {{ row.packet_type }}
                  </span>
                </div>
              </div>
              <div
                v-for="group in lbtHeatmapBucketGroups"
                :key="`${row.packet_type}-${group.id}`"
                class="h-8 rounded border"
                :class="{ 'cursor-pointer': heatmapViewMode === 'mobile' }"
                :style="getHeatmapCellStyle(getHeatmapCellAggregate(row.packet_type, group))"
                :title="getHeatmapCellTitle(row.packet_type_label, group, getHeatmapCellAggregate(row.packet_type, group))"
                @click="openHeatmapDetail(row.packet_type_label, group, getHeatmapCellAggregate(row.packet_type, group))"
              />
            </div>
          </div>

          <div v-if="heatmapViewMode === 'mobile'" class="text-[11px] text-content-muted">
            Tip: tap a cell for exact metrics and interval details.
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-content-secondary">
            <div class="flex flex-wrap items-center gap-2">
              <span>Retry severity:</span>
              <div v-for="item in heatmapSeverityLegendItems" :key="item.label" class="inline-flex items-center gap-1.5">
                <span class="inline-block h-3 w-4 rounded border" :style="{ backgroundColor: item.color }" />
                <span>{{ item.label }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded border" style="background-color: transparent;" />
              <span>No traffic</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded border border-dashed" style="background-color: rgba(148, 163, 184, 0.16);" />
              <span>Missing data</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-block h-3 w-3 rounded border" style="background-image: radial-gradient(rgba(255, 255, 255, 0.45) 0.75px, transparent 0.75px); background-size: 4px 4px; background-color: rgba(56, 189, 248, 0.36);" />
              <span>Low sample (&lt; {{ LOW_SAMPLE_TRANSMISSIONS }} tx)</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="selectedHeatmapDetail"
        class="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center sm:justify-center"
        @click.self="closeHeatmapDetail"
      >
        <div class="w-full sm:w-[28rem] bg-surface-elevated border border-stroke-subtle rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h5 class="text-sm font-semibold text-content-primary">{{ heatmapDetailTitle }}</h5>
            </div>
            <button
              class="text-xs px-2 py-1 rounded border border-stroke-subtle text-content-secondary"
              @click="closeHeatmapDetail"
            >
              Close
            </button>
          </div>
          <div class="space-y-1 text-xs text-content-secondary">
            <div v-for="line in heatmapDetailLines" :key="line">{{ line }}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-primary font-medium">Retry rate vs avg SNR</div>
          <div class="text-sm text-content-secondary mt-1">
            {{ formatCorrelationMetric(lbtCorrelations?.retry_rate_vs_avg_snr?.coefficient) }}
            <span class="text-content-muted">({{ lbtCorrelations?.retry_rate_vs_avg_snr?.sample_count ?? 0 }} buckets)</span>
          </div>
        </div>
        <div class="border border-stroke-subtle rounded-lg p-3">
          <div class="text-content-primary font-medium">Retry rate vs packet loss</div>
          <div class="text-sm text-content-secondary mt-1">
            {{ formatCorrelationMetric(lbtCorrelations?.retry_rate_vs_packet_loss_rate?.coefficient) }}
            <span class="text-content-muted">({{ lbtCorrelations?.retry_rate_vs_packet_loss_rate?.sample_count ?? 0 }} buckets)</span>
          </div>
        </div>
      </div>
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
             class="border border-stroke-subtle rounded-lg p-3 hover:bg-surface-hover/opacity-subtle cursor-pointer transition-colors group"
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
                  'bg-accent-amber/opacity-light text-accent-amber': incident.severity === 'medium',
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
          <div class="text-content-secondary">Packet events</div>
          <div class="text-content-primary font-medium">{{ qualitySummary.packetSamples }}</div>
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
