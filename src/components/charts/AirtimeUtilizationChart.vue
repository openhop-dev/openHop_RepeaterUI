<script lang="ts">
// Module-level cache — survives page navigation, outlives component instances.
// Keyed on fetch time so stale data is never shown after the TTL expires.
let _airtimeCache: {
  data: Array<{ timestamp: number; rxUtil: number; txUtil: number }>;
  yAxisMax: number;
  fetchedAt: number;
} | null = null;
const AIRTIME_CACHE_TTL_MS = 120_000; // 2 minutes — matches 60-second bucket resolution
</script>

<script setup lang="ts">
/**
 * AirtimeUtilizationChart.vue
 *
 * Displays RX/TX airtime utilization as a percentage over 24 hours.
 * Uses proper LoRa airtime calculation (Semtech formula) for accurate
 * channel utilization metrics.
 *
 * Ported from pymc_console recharts implementation.
 *
 * @see https://www.semtech.com/design-support/lora-calculator
 */
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import { streamingGet } from '@/utils/streamingFetch';
import { usePacketStore } from '@/stores/packets';
import { useSystemStore } from '@/stores/system';
import ChartCard from '@/components/ui/ChartCard.vue';
import { useManagedPolling } from '@/composables/useManagedPolling';

defineOptions({ name: 'AirtimeUtilizationChart' });

// Chart palette — fixed vibrant colours, same in both light and dark mode.
const CHART_COLORS = {
  rx: '#EBA0FC', // lavender — RX utilization line
  tx: '#FB787B', // coral   — TX utilization line
} as const;

// Theme-aware chrome colours (grid lines, axis labels).
const getChartChrome = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    gridLine:  isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    axisLabel: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
  };
};

// ============================================================================
// Stores
// ============================================================================

const packetStore = usePacketStore();
const systemStore = useSystemStore();

// ============================================================================
// Types
// ============================================================================

interface UtilSample {
  timestamp: number; // Unix timestamp (seconds)
  rxUtil: number; // RX utilization percentage for this bucket
  txUtil: number; // TX utilization percentage for this bucket
}

interface Packet {
  timestamp: number;
  length?: number;
  payload_length?: number;
  transmitted: boolean | number;
  packet_origin?: string;
  // Pre-calculated airtime from backend (when available)
  airtime_ms?: number;
}

interface RadioConfig {
  sf: number; // Spreading factor (7-12)
  bwHz: number; // Bandwidth in Hz
  cr: number; // Coding rate (5-8)
  preamble: number; // Preamble length
}

// ============================================================================
// State
// ============================================================================

const chartRef = ref<HTMLCanvasElement | null>(null);
const chartData = ref<UtilSample[]>([]);
const isLoading = ref(false);
const isInitialFetch = ref(true);
const isRefreshing = ref(false);
const chartError = ref<string | null>(null);
const chartStatus = ref('Connecting...');

/** Dynamic Y-axis maximum (computed from data with headroom) */
const yAxisMax = ref(30);

/** Local stats computed from fetched packets (for standalone/dev mode) */
const localStats = ref({
  totalReceived: 0,
  totalTransmitted: 0,
  dropped: 0,
  firstPacketTime: 0,
});

/** Radio configuration for airtime calculation */
const radioConfig = ref<RadioConfig>({
  sf: 9,
  bwHz: 62500,
  cr: 5,
  preamble: 17,
});

// ============================================================================
// LoRa Airtime Calculation
// ============================================================================

/**
 * Calculate LoRa packet airtime using the Semtech formula.
 * This is used as a fallback when airtime_ms is not pre-calculated by backend.
 *
 * Key formulas:
 * - Symbol time: T_sym = 2^SF / BW
 * - Preamble time: T_preamble = (n_preamble + 4.25) * T_sym
 * - Payload symbols: 8 + ceil((8*PL - 4*SF + 28 + 16*CRC - 20*H) / (4*(SF-2*DE))) * CR
 * - Total time: T_packet = T_preamble + n_payload * T_sym
 *
 * @param payloadBytes - Payload length in bytes
 * @returns Airtime in milliseconds
 */
const calculateAirtimeMs = (payloadBytes: number): number => {
  const { sf, bwHz, cr, preamble } = radioConfig.value;
  const crc = 1; // CRC enabled
  const h = 0; // Explicit header mode
  const de = sf >= 11 && bwHz <= 125000 ? 1 : 0; // Low data rate optimize

  const bwKhz = bwHz / 1000;
  const tSym = Math.pow(2, sf) / bwKhz; // Symbol time in ms
  const tPreamble = (preamble + 4.25) * tSym;

  const numerator = Math.max(8 * payloadBytes - 4 * sf + 28 + 16 * crc - 20 * h, 0);
  const denominator = 4 * (sf - 2 * de);
  const nPayload = 8 + Math.ceil(numerator / denominator) * cr;
  const tPayload = nPayload * tSym;

  return tPreamble + tPayload;
};

/**
 * Get airtime for a packet, using pre-calculated backend value when available.
 *
 * Strategy:
 * 1. If packet has airtime_ms from backend, use it (most accurate, zero CPU cost)
 * 2. Otherwise, calculate client-side using Semtech formula (fallback for legacy packets)
 *
 * @param pkt - Packet with optional airtime_ms and length fields
 * @returns Airtime in milliseconds
 */
const getPacketAirtime = (pkt: Packet): number => {
  // Prefer pre-calculated backend value (zero CPU cost, always accurate)
  if (pkt.airtime_ms !== undefined && pkt.airtime_ms > 0) {
    return pkt.airtime_ms;
  }

  // Fallback: calculate client-side for legacy packets
  const len = pkt.length ?? pkt.payload_length ?? 32;
  return calculateAirtimeMs(len);
};

// ============================================================================
// EMA Smoothing
// ============================================================================

/**
 * Apply Exponential Moving Average (EMA) smoothing to utilization samples.
 *
 * EMA provides smooth trend lines while still responding to changes.
 * Formula: EMA_t = α * value_t + (1 - α) * EMA_(t-1)
 *
 * @param samples - Raw utilization samples
 * @param halfLifeSamples - Number of samples for value to decay by half
 * @returns Smoothed samples
 */
const applyEmaSmoothing = (samples: UtilSample[], halfLifeSamples = 60): UtilSample[] => {
  if (samples.length === 0) return [];

  const alpha = 1 - Math.pow(0.5, 1 / halfLifeSamples);

  // Initialize EMA with average of first N samples to avoid cold-start bias
  const initWindow = Math.min(samples.length, Math.max(10, Math.floor(halfLifeSamples / 3)));
  let rxEma = 0;
  let txEma = 0;
  for (let i = 0; i < initWindow; i++) {
    rxEma += samples[i].rxUtil;
    txEma += samples[i].txUtil;
  }
  rxEma /= initWindow;
  txEma /= initWindow;

  return samples.map((s) => {
    rxEma = alpha * s.rxUtil + (1 - alpha) * rxEma;
    txEma = alpha * s.txUtil + (1 - alpha) * txEma;
    return { ...s, rxUtil: rxEma, txUtil: txEma };
  });
};

// ============================================================================
// Computed Properties
// ============================================================================

/**
 * Uptime-aware rate calculations.
 * Adapts labels and confidence based on system uptime.
 * Falls back to local stats when stores are empty (dev/standalone mode).
 */
const uptimeBasedRates = computed(() => {
  // Prefer store stats, fallback to local stats from fetched packets
  const storeRx = packetStore.packetStats?.total_packets || 0;
  const storeTx = packetStore.packetStats?.transmitted_packets || 0;
  const storeUptime = systemStore.stats?.uptime_seconds || 0;

  const totalRx = storeRx || localStats.value.totalReceived;
  const totalTx = storeTx || localStats.value.totalTransmitted;

  // Estimate uptime from packet data range if store uptime unavailable
  const estimatedUptime =
    localStats.value.firstPacketTime > 0
      ? Math.floor(Date.now() / 1000) - localStats.value.firstPacketTime
      : 0;
  const uptimeSeconds = storeUptime || estimatedUptime;

  const uptimeHours = Math.max(uptimeSeconds / 3600, 0.1);
  const showMinuteRates = uptimeHours < 1;

  if (showMinuteRates) {
    const uptimeMinutes = Math.max(uptimeSeconds / 60, 1);
    return {
      rxRate: {
        value: Math.round((totalRx / uptimeMinutes) * 100) / 100,
        label: uptimeHours < 0.5 ? 'RX/min (early)' : 'RX/min',
      },
      txRate: {
        value: Math.round((totalTx / uptimeMinutes) * 100) / 100,
        label: uptimeHours < 0.5 ? 'TX/min (early)' : 'TX/min',
      },
      confidence: 'low' as const,
    };
  }

  const rxPerHour = Math.round((totalRx / uptimeHours) * 100) / 100;
  const txPerHour = Math.round((totalTx / uptimeHours) * 100) / 100;

  let label: string;
  let confidence: 'low' | 'medium' | 'high';

  if (uptimeHours < 6) {
    label = `RX/hr (${Math.round(uptimeHours)}h)`;
    confidence = 'medium';
  } else if (uptimeHours < 24) {
    label = `RX/hr (${Math.round(uptimeHours)}h)`;
    confidence = 'high';
  } else {
    label = 'RX/hr';
    confidence = 'high';
  }

  return {
    rxRate: { value: rxPerHour, label },
    txRate: { value: txPerHour, label: label.replace('RX', 'TX') },
    confidence,
  };
});

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch packets and compute bucketed airtime utilization.
 *
 * Process:
 * 1. Fetch radio config for accurate airtime calculation
 * 2. Fetch all packets for the time range
 * 3. Bucket packets into 10-second intervals
 * 4. Calculate airtime per bucket using Semtech formula
 * 5. Convert to utilization percentage
 * 6. Apply EMA smoothing for trend visualization
 * 7. Downsample for efficient rendering
 */
const fetchChartData = async () => {
  chartStatus.value = 'Connecting...';
  chartError.value = null;
  if (!isInitialFetch.value) isRefreshing.value = true;

  try {
    const hours = 24;
    const bucketSeconds = 60; // server-side aggregation into 60-second buckets (1,440 max vs 50,000 raw)
    const bucketMs = bucketSeconds * 1000;

    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - hours * 3600;

    // Read radio config from system store (populated during bootstrap — avoids an extra /stats round-trip)
    const radio = systemStore.stats?.config?.radio as Record<string, number> | undefined;
    if (radio) {
      radioConfig.value = {
        sf: radio.spreading_factor ?? 9,
        bwHz: radio.bandwidth ?? 62500,
        cr: radio.coding_rate ?? 5,
        preamble: radio.preamble_length ?? 17,
      };
    }

    // Fetch pre-aggregated buckets from server (rx_ms/tx_ms per bucket_seconds interval)
    const chartRes = await streamingGet('/airtime_chart_data', {
      start_timestamp: startTime,
      end_timestamp: endTime,
      bucket_seconds: bucketSeconds,
      sf: radioConfig.value.sf,
      bw_hz: radioConfig.value.bwHz,
      cr: radioConfig.value.cr,
      preamble: radioConfig.value.preamble,
    }, {
      onPhaseChange: (phase) => {
        chartStatus.value = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });
    if (!chartRes.success) {
      chartData.value = [];
      isLoading.value = false;
      isInitialFetch.value = false;
      isRefreshing.value = false;
      nextTick(() => drawChart());
      return;
    }

    const payload = chartRes.data as {
      buckets: { timestamp: number; rx_ms: number; tx_ms: number; rx_count: number; tx_count: number }[];
      bucket_seconds: number;
      rx_total: number;
      tx_total: number;
    };
    const buckets = payload.buckets || [];

    // Update local stats from totals
    localStats.value = {
      totalReceived: payload.rx_total || 0,
      totalTransmitted: payload.tx_total || 0,
      dropped: packetStore.packetStats?.dropped_packets ?? 0,
      firstPacketTime: buckets.length > 0 ? buckets[0].timestamp : endTime,
    };

    // Convert pre-aggregated buckets directly to utilization samples
    // Fill a dense array covering the full time range (gaps = 0% utilization)
    const bucketCount = (hours * 3600) / bucketSeconds;
    const rxUtil = new Float64Array(bucketCount);
    const txUtil = new Float64Array(bucketCount);

    for (const b of buckets) {
      const idx = Math.floor((b.timestamp - startTime) / bucketSeconds);
      if (idx >= 0 && idx < bucketCount) {
        rxUtil[idx] = (b.rx_ms / bucketMs) * 100;
        txUtil[idx] = (b.tx_ms / bucketMs) * 100;
      }
    }

    const rawSamples: UtilSample[] = [];
    for (let i = 0; i < bucketCount; i++) {
      rawSamples.push({
        timestamp: startTime + i * bucketSeconds,
        rxUtil: rxUtil[i],
        txUtil: txUtil[i],
      });
    }

    // Apply EMA smoothing (half-life of 10 samples = 10 minutes at 60s buckets)
    const smoothedSamples = applyEmaSmoothing(rawSamples, 10);

    // Downsample to ~400 points for efficient rendering
    const step = Math.max(1, Math.floor(smoothedSamples.length / 400));
    const downsampled: UtilSample[] = [];

    for (let i = 0; i < smoothedSamples.length; i += step) {
      let sumRx = 0,
        sumTx = 0,
        count = 0;
      const ts = smoothedSamples[i].timestamp;

      for (let j = i; j < Math.min(i + step, smoothedSamples.length); j++) {
        sumRx += smoothedSamples[j].rxUtil;
        sumTx += smoothedSamples[j].txUtil;
        count++;
      }

      downsampled.push({
        timestamp: ts,
        rxUtil: sumRx / count,
        txUtil: sumTx / count,
      });
    }

    chartData.value = downsampled;

    // Calculate dynamic Y-axis max with 5% headroom, rounded to nearest 5%
    const maxInData = Math.max(...downsampled.flatMap((d) => [d.rxUtil, d.txUtil]));
    const withHeadroom = maxInData * 1.05;
    yAxisMax.value = Math.max(5, Math.ceil(withHeadroom / 5) * 5);

    _airtimeCache = { data: downsampled, yAxisMax: yAxisMax.value, fetchedAt: Date.now() };
    isLoading.value = false;
    isInitialFetch.value = false;
    isRefreshing.value = false;
    chartError.value = null;
    nextTick(() => drawChart());
  } catch (err) {
    console.error('Failed to fetch airtime data:', err);
    chartData.value = [];
    isLoading.value = false;
    isInitialFetch.value = false;
    isRefreshing.value = false;
    chartError.value = err instanceof Error ? err.message : 'Failed to load chart data';
    nextTick(() => drawChart());
  }
};

// ============================================================================
// Chart Rendering
// ============================================================================

/**
 * Draw the airtime utilization chart on canvas.
 */
const drawChart = () => {
  if (!chartRef.value) return;

  const canvas = chartRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const container = canvas.parentElement;
  if (!container) return;

  // Set up canvas dimensions with device pixel ratio for crisp rendering
  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const padding = 20;
  const leftMargin = 45; // Space for Y-axis labels

  ctx.clearRect(0, 0, width, height);

  // Loading state
  if (isLoading.value) {
    ctx.fillStyle = getChartChrome().axisLabel;
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Loading chart data...', width / 2, height / 2);
    return;
  }

  // No data state
  if (chartData.value.length === 0) {
    ctx.fillStyle = getChartChrome().axisLabel;
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data available', width / 2, height / 2);
    return;
  }

  // Chart dimensions
  const chartWidth = width - leftMargin - padding;
  const chartHeight = height - padding * 2;

  // Y-axis scaling (0 to dynamic max with headroom)
  const displayMax = yAxisMax.value;
  const displayRange = yAxisMax.value;

  // Draw grid lines
  const chrome = getChartChrome();
  ctx.strokeStyle = chrome.gridLine;
  ctx.lineWidth = 1;

  // Horizontal grid lines with Y-axis labels
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(leftMargin, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    // Y-axis label (percentage)
    const value = displayMax - (i / 5) * displayRange;
    ctx.fillStyle = chrome.axisLabel;
    ctx.fillText(`${value.toFixed(0)}%`, leftMargin - 5, y + 3);
  }

  // Vertical grid lines
  for (let i = 0; i <= 6; i++) {
    const x = leftMargin + (chartWidth * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  // Draw RX utilization line
  if (chartData.value.length > 1) {
    ctx.strokeStyle = CHART_COLORS.rx;
    ctx.lineWidth = 2;
    ctx.beginPath();

    chartData.value.forEach((point, index) => {
      const x = leftMargin + (chartWidth * index) / (chartData.value.length - 1);
      const y =
        height - padding - (Math.min(point.rxUtil, yAxisMax.value) / displayRange) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  // Draw TX utilization line
  if (chartData.value.length > 1) {
    ctx.strokeStyle = CHART_COLORS.tx;
    ctx.lineWidth = 2;
    ctx.beginPath();

    chartData.value.forEach((point, index) => {
      const x = leftMargin + (chartWidth * index) / (chartData.value.length - 1);
      const y =
        height - padding - (Math.min(point.txUtil, yAxisMax.value) / displayRange) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }
};

// Periodic refresh — 2 minutes matches the 60-second bucket resolution of the API.
// immediate: false because onMounted handles the first load (cache check + fetch).
useManagedPolling(fetchChartData, { intervalMs: 120_000, immediate: false });

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  if (_airtimeCache && Date.now() - _airtimeCache.fetchedAt < AIRTIME_CACHE_TTL_MS) {
    chartData.value = _airtimeCache.data;
    yAxisMax.value = _airtimeCache.yAxisMax;
    isInitialFetch.value = false;
  } else {
    fetchChartData();
  }

  nextTick(() => {
    drawChart();
    setTimeout(() => drawChart(), 100);
  });

  window.addEventListener('resize', drawChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', drawChart);
});
</script>

<template>
  <div class="glass-card rounded-[10px] p-4 lg:p-6">
    <h3
      class="text-content-primary dark:text-content-primary text-lg lg:text-xl font-semibold mb-3 lg:mb-4"
    >
      Airtime Utilization
    </h3>
    <p
      class="text-content-secondary dark:text-content-primary text-xs lg:text-sm uppercase mb-3 lg:mb-4"
    >
      Activity (Last 24 Hours)
    </p>
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
      :is-loading="isInitialFetch"
      :is-updating="isRefreshing"
      :error="chartError"
      :status="chartStatus"
      @retry="fetchChartData"
    >
      <canvas ref="chartRef" class="absolute inset-0 w-full h-full"></canvas>
    </ChartCard>

    <!-- Performance Stats -->
    <div class="mt-3 lg:mt-4 grid grid-cols-2 gap-3 lg:gap-4">
      <div class="text-center">
        <div class="text-lg lg:text-2xl font-bold text-content-primary dark:text-content-primary">
          {{ packetStore.packetStats?.total_packets || localStats.totalReceived }}
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide">
          Total Received
        </div>
      </div>
      <div class="text-center">
        <div class="text-lg lg:text-2xl font-bold text-content-primary dark:text-content-primary">
          {{ packetStore.packetStats?.transmitted_packets || localStats.totalTransmitted }}
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide">
          Total Transmitted
        </div>
      </div>
    </div>

    <div class="mt-2 lg:mt-3 grid grid-cols-3 gap-2 lg:gap-3 text-center">
      <div>
        <div
          class="text-xs lg:text-sm font-semibold text-accent-purple flex items-center justify-center gap-1"
        >
          {{ uptimeBasedRates.rxRate.value }}
          <span
            v-if="uptimeBasedRates.confidence === 'low'"
            class="inline-block w-1.5 h-1.5 rounded-full bg-secondary opacity-70"
            title="Early data - limited uptime"
          ></span>
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted">
          {{ uptimeBasedRates.rxRate.label }}
        </div>
      </div>
      <div>
        <div
          class="text-xs lg:text-sm font-semibold text-accent-red flex items-center justify-center gap-1"
        >
          {{ uptimeBasedRates.txRate.value }}
          <span
            v-if="uptimeBasedRates.confidence === 'low'"
            class="inline-block w-1.5 h-1.5 rounded-full bg-secondary opacity-70"
            title="Early data - limited uptime"
          ></span>
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted">
          {{ uptimeBasedRates.txRate.label }}
        </div>
      </div>
      <div>
        <div class="text-xs lg:text-sm font-semibold text-accent-red">
          {{ packetStore.packetStats?.dropped_packets || localStats.dropped }}
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted">Dropped</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
canvas {
  width: 100%;
  height: 100%;
}
</style>
