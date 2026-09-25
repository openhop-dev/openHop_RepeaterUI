<script lang="ts">
import type { RadioPanelData } from '@/composables/useAirtimeSeries';

// Module-level cache — survives page navigation, outlives component instances.
// Keyed on the radio profiles and window it was computed for, not just fetch
// time, so retuning a radio invalidates it before the data TTL expires.
let _airtimeCache: {
  panels: RadioPanelData[];
  localStats: { totalReceived: number; totalTransmitted: number; firstPacketTime: number };
  signature: string;
  windowKey: string;
  unattributedRx: number;
  unattributedTx: number;
  fetchedAt: number;
} | null = null;
const AIRTIME_CACHE_TTL_MS = 120_000; // 2 minutes — matches 60-second bucket resolution

/** Test seam: drop the module cache between cases. */
export function __resetAirtimeCache() {
  _airtimeCache = null;
}
</script>

<script setup lang="ts">
/**
 * AirtimeUtilizationChart.vue
 *
 * RX/TX airtime utilization over 24 hours, as a percentage of wall time.
 *
 * The repeater attributes each stored packet to the radio that carried it and
 * computes time-on-air with that radio's own LoRa profile, so a two-radio
 * Fabric bridge gets one panel per radio rather than one line that describes
 * neither. This component owns fetching and shaping; RadioAirtimePanel draws.
 * Every panel shares one bucket grid, one EMA half-life and one Y-axis maximum
 * so the two sides can be compared by eye.
 */
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue';
import { streamingGet } from '@/utils/streamingFetch';
import { usePacketStore } from '@/stores/packets';
import { useRadioProfiles } from '@/composables/useRadioProfiles';
import { useSystemStore } from '@/stores/system';
import RadioAirtimePanel from '@/components/charts/RadioAirtimePanel.vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import {
  formatFrequency,
  formatModulation,
  formatModulationDetail,
  profileSignature,
  toRadioPanels,
  type AirtimeChartPayload,
  type SeriesGrid,
} from '@/composables/useAirtimeSeries';

defineOptions({ name: 'AirtimeUtilizationChart' });

const WINDOW_HOURS = 24;
const BUCKET_SECONDS = 60; // 1,440 server-side buckets vs 50,000 raw rows

const packetStore = usePacketStore();
const systemStore = useSystemStore();
const { profiles: configProfiles } = useRadioProfiles();

const panels = ref<RadioPanelData[]>([]);
const isInitialFetch = ref(true);
const isRefreshing = ref(false);
const isFetching = ref(false);
const chartError = ref<string | null>(null);
const chartStatus = ref('Connecting...');
const unattributedRx = ref(0);
const unattributedTx = ref(0);

/** Totals from the fetched window, used when the stores are empty (dev mode). */
const localStats = ref({ totalReceived: 0, totalTransmitted: 0, firstPacketTime: 0 });

const isMultiPanel = computed(() => panels.value.length > 1);

const windowKey = computed(() => `${WINDOW_HOURS}h/${BUCKET_SECONDS}s`);

/** False until /stats gives us something to compare a cached signature against. */
const hasKnownProfiles = computed(() =>
  configProfiles.value.some((entry) => entry.profile?.spreading_factor != null),
);

const fetchChartData = async () => {
  chartStatus.value = 'Connecting...';
  chartError.value = null;
  if (!isInitialFetch.value) isRefreshing.value = true;

  try {
    const endTime = Math.floor(Date.now() / 1000);
    // Align the window to the server's bucket grid (buckets are floored to a
    // multiple of bucket_seconds). Off-grid, every bucket lands in the slot
    // before its own and the first partial bucket indexes out of the array.
    const startTime = Math.floor((endTime - WINDOW_HOURS * 3600) / BUCKET_SECONDS) * BUCKET_SECONDS;
    const grid: SeriesGrid = {
      startTime,
      bucketSeconds: BUCKET_SECONDS,
      bucketCount: (WINDOW_HOURS * 3600) / BUCKET_SECONDS + 1,
    };

    // Sent only so a backend that predates per-radio profiles still has a
    // modulation to work from. A newer backend ignores these.
    const fallbackProfile = configProfiles.value[0]?.profile ?? null;

    const chartRes = await streamingGet<AirtimeChartPayload>(
      '/airtime_chart_data',
      {
        start_timestamp: startTime,
        end_timestamp: endTime,
        bucket_seconds: BUCKET_SECONDS,
        sf: fallbackProfile?.spreading_factor ?? 9,
        bw_hz: fallbackProfile?.bandwidth_hz ?? 62500,
        cr: fallbackProfile?.coding_rate ?? 5,
        preamble: fallbackProfile?.preamble_length ?? 17,
      },
      {
        onPhaseChange: (phase) => {
          chartStatus.value = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
        },
      },
    );

    if (!chartRes.success) {
      throw new Error(chartRes.error || 'Failed to load airtime data');
    }

    const payload = chartRes.data as AirtimeChartPayload;
    const fallback = configProfiles.value[0] ?? { radioId: 'radio0', profile: null };
    const nextPanels = toRadioPanels(payload, grid, fallback);

    panels.value = nextPanels;
    unattributedRx.value = payload?.unattributed_rx_count ?? 0;
    unattributedTx.value = payload?.unattributed_tx_count ?? 0;
    localStats.value = {
      totalReceived: payload?.rx_total ?? 0,
      totalTransmitted: payload?.tx_total ?? 0,
      firstPacketTime: payload?.buckets?.length ? payload.buckets[0].timestamp : endTime,
    };

    _airtimeCache = {
      panels: nextPanels,
      localStats: localStats.value,
      signature: profileSignature(nextPanels),
      windowKey: windowKey.value,
      unattributedRx: unattributedRx.value,
      unattributedTx: unattributedTx.value,
      fetchedAt: Date.now(),
    };

    chartError.value = null;
  } catch (err) {
    console.error('Failed to fetch airtime data:', err);
    panels.value = [];
    chartError.value = err instanceof Error ? err.message : 'Failed to load chart data';
  } finally {
    isInitialFetch.value = false;
    isRefreshing.value = false;
  }
};

/** Reuse the cache only while it describes the same radios and window. */
const cacheIsUsable = (): boolean => {
  if (!_airtimeCache) return false;
  if (Date.now() - _airtimeCache.fetchedAt >= AIRTIME_CACHE_TTL_MS) return false;
  if (_airtimeCache.windowKey !== windowKey.value) return false;
  // Before /stats lands there is nothing to compare against; fall back to the TTL.
  if (!hasKnownProfiles.value) return true;
  return profileSignature(configProfiles.value) === _airtimeCache.signature;
};

/** Global counters: prefer the live store, fall back to this window's totals. */
const totalReceived = computed(
  () => packetStore.packetStats?.total_packets || localStats.value.totalReceived,
);
const totalTransmitted = computed(
  () => packetStore.packetStats?.transmitted_packets || localStats.value.totalTransmitted,
);
const droppedPackets = computed(() => packetStore.packetStats?.dropped_packets ?? 0);

/**
 * Uptime-aware rate labels for the single-radio summary. Rates over a partial
 * first hour are marked, so an operator does not read an early spike as normal.
 */
const uptimeBasedRates = computed(() => {
  const storeUptime = systemStore.stats?.uptime_seconds || 0;
  const estimatedUptime =
    localStats.value.firstPacketTime > 0
      ? Math.floor(Date.now() / 1000) - localStats.value.firstPacketTime
      : 0;
  const uptimeSeconds = storeUptime || estimatedUptime;
  const uptimeHours = Math.max(uptimeSeconds / 3600, 0.1);

  const totalRx = totalReceived.value;
  const totalTx = totalTransmitted.value;

  if (uptimeHours < 1) {
    const uptimeMinutes = Math.max(uptimeSeconds / 60, 1);
    const suffix = uptimeHours < 0.5 ? ' (early)' : '';
    return {
      rxRate: {
        value: Math.round((totalRx / uptimeMinutes) * 100) / 100,
        label: `RX/min${suffix}`,
      },
      txRate: {
        value: Math.round((totalTx / uptimeMinutes) * 100) / 100,
        label: `TX/min${suffix}`,
      },
      confidence: 'low' as const,
    };
  }

  const label = uptimeHours < 24 ? `RX/hr (${Math.round(uptimeHours)}h)` : 'RX/hr';
  return {
    rxRate: { value: Math.round((totalRx / uptimeHours) * 100) / 100, label },
    txRate: {
      value: Math.round((totalTx / uptimeHours) * 100) / 100,
      label: label.replace('RX', 'TX'),
    },
    confidence: (uptimeHours < 6 ? 'medium' : 'high') as 'medium' | 'high',
  };
});

const perHour = (total: number) => Math.round((total / WINDOW_HOURS) * 100) / 100;

const panelHeading = (panel: RadioPanelData) => ({
  frequency: formatFrequency(panel.profile?.frequency_hz),
  modulation: formatModulation(panel.profile),
  modulationDetail: formatModulationDetail(panel.profile),
});

const panelSummary = (panel: RadioPanelData) => {
  const modulation = formatModulationDetail(panel.profile);
  const identity = isMultiPanel.value ? `Radio ${panel.radioId}` : 'Radio';
  return (
    `${identity}${modulation ? `, ${modulation}` : ''}. ` +
    `${panel.rxTotal} received, ${panel.txTotal} transmitted in the last ${WINDOW_HOURS} hours. ` +
    `Peak utilization ${panel.peakUtil.toFixed(1)}%.`
  );
};

// Periodic refresh — 2 minutes matches the 60-second bucket resolution.
// immediate: false because onMounted handles the first load (cache check + fetch).
useManagedPolling(fetchChartData, { intervalMs: 120_000, immediate: false });

onMounted(() => {
  if (cacheIsUsable() && _airtimeCache) {
    panels.value = _airtimeCache.panels;
    localStats.value = _airtimeCache.localStats;
    unattributedRx.value = _airtimeCache.unattributedRx;
    unattributedTx.value = _airtimeCache.unattributedTx;
    isInitialFetch.value = false;
  } else {
    void fetchChartData();
  }
});

defineExpose({ panels, fetchChartData });
</script>

<template>
  <div class="glass-card rounded-[10px] p-4 lg:p-6">
    <h3 class="text-content-primary text-lg lg:text-xl font-semibold mb-3 lg:mb-4">
      Airtime Utilization
    </h3>
    <p
      class="text-content-secondary dark:text-content-primary text-xs lg:text-sm uppercase mb-3 lg:mb-4"
    >
      Activity (Last 24 Hours)
    </p>

    <div :class="isMultiPanel ? 'grid grid-cols-1 xl:grid-cols-2 gap-5 xl:gap-8' : ''">
      <RadioAirtimePanel
        v-for="panel in panels"
        :key="panel.radioId"
        :radio-id="isMultiPanel ? panel.radioId : null"
        :frequency="panelHeading(panel).frequency"
        :modulation="panelHeading(panel).modulation"
        :modulation-detail="panelHeading(panel).modulationDetail"
        :samples="panel.samples"
        :y-axis-max="panel.yAxisMax"
        :is-loading="isInitialFetch"
        :is-updating="isRefreshing"
        :error="chartError"
        :status="chartStatus"
        :summary="panelSummary(panel)"
        :empty-message="
          isMultiPanel
            ? 'No activity on this radio in the last 24 hours.'
            : 'No activity in the last 24 hours.'
        "
        @retry="fetchChartData"
      >
        <template v-if="isMultiPanel" #summary>
          <div class="mt-3 lg:mt-4 grid grid-cols-2 gap-3 lg:gap-4">
            <div class="text-center">
              <div class="text-lg lg:text-2xl font-bold text-content-primary">
                {{ panel.rxTotal }}
              </div>
              <div
                class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide"
              >
                Received
              </div>
            </div>
            <div class="text-center">
              <div class="text-lg lg:text-2xl font-bold text-content-primary">
                {{ panel.txTotal }}
              </div>
              <div
                class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide"
              >
                Transmitted
              </div>
            </div>
          </div>
          <div class="mt-2 lg:mt-3 grid grid-cols-2 gap-2 lg:gap-3 text-center">
            <div>
              <div class="text-xs lg:text-sm font-semibold text-accent-purple">
                {{ perHour(panel.rxTotal) }}
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted">RX/hr (24h)</div>
            </div>
            <div>
              <div class="text-xs lg:text-sm font-semibold text-accent-red">
                {{ perHour(panel.txTotal) }}
              </div>
              <div class="text-xs text-content-secondary dark:text-content-muted">TX/hr (24h)</div>
            </div>
          </div>
        </template>
      </RadioAirtimePanel>

      <!-- First load and whole-request failure: nothing to lay out per radio yet. -->
      <RadioAirtimePanel
        v-if="panels.length === 0"
        :samples="[]"
        :y-axis-max="1"
        :is-loading="isInitialFetch"
        :is-updating="isRefreshing"
        :error="chartError"
        :status="chartStatus"
        summary="Airtime utilization is not available yet."
        @retry="fetchChartData"
      />
    </div>

    <p
      v-if="isMultiPanel && (unattributedRx > 0 || unattributedTx > 0)"
      class="mt-3 text-xs text-content-muted"
    >
      {{ unattributedRx }} received and {{ unattributedTx }} transmitted packets in this window
      predate per-radio attribution, so they are not counted in either graph.
    </p>

    <!-- Single-radio summary keeps the node-wide counters it has always shown. -->
    <template v-if="!isMultiPanel">
      <div class="mt-3 lg:mt-4 grid grid-cols-2 gap-3 lg:gap-4">
        <div class="text-center">
          <div class="text-lg lg:text-2xl font-bold text-content-primary">{{ totalReceived }}</div>
          <div
            class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide"
          >
            Total Received
          </div>
        </div>
        <div class="text-center">
          <div class="text-lg lg:text-2xl font-bold text-content-primary">
            {{ totalTransmitted }}
          </div>
          <div
            class="text-xs text-content-secondary dark:text-content-muted uppercase tracking-wide"
          >
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
          <div class="text-xs lg:text-sm font-semibold text-accent-red">{{ droppedPackets }}</div>
          <div class="text-xs text-content-secondary dark:text-content-muted">Dropped</div>
        </div>
      </div>
    </template>
  </div>
</template>
