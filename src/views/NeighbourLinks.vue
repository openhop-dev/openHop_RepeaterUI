<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  TimeScale,
  Tooltip,
  Legend,
  Title,
  type ChartDataset,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import ChartCard from '@/components/ui/ChartCard.vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import ApiService from '@/utils/api';
import type {
  NeighborLinkHistoryPoint,
  NeighborLinkHistoryPayload,
  NeighborLinkLive,
  NeighborLinksPayload,
} from '@/types/api';

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  TimeScale,
  Tooltip,
  Legend,
  Title,
);

defineOptions({ name: 'NeighbourLinksView' });

type SortKey = 'peer_hash' | 'path_hash_size' | 'sample_count' | 'duplicate_ratio' | 'last_seen' | 'ewma_score';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'inactive';

const HOURS_OPTIONS = [1, 6, 24, 48, 168] as const;
const HISTORY_LIMIT = 1000;

const links = ref<NeighborLinkLive[]>([]);
const historyRows = ref<NeighborLinkHistoryPoint[]>([]);

const search = ref('');
const statusFilter = ref<StatusFilter>('all');
const pathSizeFilter = ref<string>('all');
const selectedHours = ref<number>(24);
const selectedLinkKey = ref<string | null>(null);
const showRxScoreInfoModal = ref(false);

const sortKey = ref<SortKey>('last_seen');
const sortDir = ref<SortDir>('desc');

const linksLoading = ref(true);
const linksRefreshing = ref(false);
const linksLoadedOnce = ref(false);
const linksError = ref<string | null>(null);

const historyLoading = ref(false);
const historyRefreshing = ref(false);
const historyLoadedOnce = ref(false);
const historyError = ref<string | null>(null);

const scatterCanvasRef = ref<HTMLCanvasElement | null>(null);
const rssiCanvasRef = ref<HTMLCanvasElement | null>(null);
const snrCanvasRef = ref<HTMLCanvasElement | null>(null);
const scoreCanvasRef = ref<HTMLCanvasElement | null>(null);

const scatterChart = ref<ChartJS | null>(null);
const rssiChart = ref<ChartJS | null>(null);
const snrChart = ref<ChartJS | null>(null);
const scoreChart = ref<ChartJS | null>(null);

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return new Date(value * 1000).toLocaleString();
};

const formatMetric = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(1)}%`;
};

const RX_SCORE_TOOLTIP = 'RX score is a normalised value from 0 to 1 calculated by Core from received SNR, spreading factor and complete received frame length.\n\nA higher value generally means greater reception margin and/or a shorter frame. It should not be interpreted as a pure signal-strength measurement.';
const DUPLICATE_TOOLTIP = 'The proportion of physical observations recorded as duplicates.\n\nDuplicate receptions can be normal in flood networks and do not automatically indicate a poor link or overlapping transmission.';
const EWMA_RX_SCORE_TOOLTIP = 'The exponentially weighted moving average of the shared Core RX score for observations from this upstream peer.';

const ratioForLink = (link: NeighborLinkLive): number => {
  if (!link.sample_count || link.sample_count <= 0) return 0;
  return link.duplicate_sample_count / link.sample_count;
};

const selectedLink = computed<NeighborLinkLive | null>(() => {
  if (!selectedLinkKey.value) return null;
  return links.value.find((link) => linkKey(link) === selectedLinkKey.value) ?? null;
});

const sortedFilteredLinks = computed(() => {
  const normalizedSearch = search.value.trim().toLowerCase();

  const filtered = links.value.filter((link) => {
    if (statusFilter.value === 'active' && !link.active) return false;
    if (statusFilter.value === 'inactive' && link.active) return false;
    if (pathSizeFilter.value !== 'all' && link.path_hash_size !== Number(pathSizeFilter.value)) return false;

    if (normalizedSearch.length > 0) {
      const haystack = `${link.peer_hash} ${link.path_hash_size}`.toLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }

    return true;
  });

  const direction = sortDir.value === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const av = sortableValue(a, sortKey.value);
    const bv = sortableValue(b, sortKey.value);

    if (av < bv) return -1 * direction;
    if (av > bv) return 1 * direction;
    return a.peer_hash.localeCompare(b.peer_hash) * direction;
  });
});

const availablePathSizes = computed(() => {
  const sizes = new Set<number>();
  links.value.forEach((link) => sizes.add(link.path_hash_size));
  return [...sizes].sort((a, b) => a - b);
});

const kpis = computed(() => {
  const total = links.value.length;
  const active = links.value.filter((link) => link.active).length;
  const avgScore = total > 0
    ? links.value.reduce((acc, link) => acc + (Number.isFinite(link.ewma_score) ? link.ewma_score : 0), 0) / total
    : 0;

  const sampleSum = links.value.reduce((acc, link) => acc + Math.max(0, link.sample_count), 0);
  const duplicateSum = links.value.reduce((acc, link) => acc + Math.max(0, link.duplicate_sample_count), 0);
  const duplicateRatio = sampleSum > 0 ? duplicateSum / sampleSum : 0;

  return {
    total,
    active,
    avgScore,
    duplicateRatio,
  };
});

const selectedHistorySummary = computed(() => {
  const rows = historyRows.value;
  const sampleCount = rows.length;
  const duplicateCount = rows.filter((row) => row.is_duplicate).length;
  const duplicateRatio = sampleCount > 0 ? duplicateCount / sampleCount : 0;

  const validScores = rows
    .map((row) => row.score)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (validScores.length < 8) {
    return {
      status: 'Insufficient data',
      details: 'At least 8 RX-score observations are required to describe variability.',
      disclaimer: 'RX-score variability is observational and does not by itself identify congestion, fading or routing quality.',
      duplicateRatio,
      scoreStdDev: null as number | null,
    };
  }

  const mean = validScores.reduce((acc, value) => acc + value, 0) / validScores.length;
  const variance = validScores.reduce((acc, value) => acc + (value - mean) ** 2, 0) / validScores.length;
  const stdDev = Math.sqrt(variance);

  let status = 'Low variation';
  let details = 'RX scores have remained relatively consistent in the selected period.';

  if (stdDev >= 0.18) {
    status = 'High variation';
    details = 'RX scores vary substantially. Review the RSSI, SNR and packet history before drawing conclusions about this neighbour.';
  } else if (stdDev >= 0.1) {
    status = 'Moderate variation';
    details = 'RX scores show moderate variation. This may reflect changing signal conditions, frame lengths or traffic mix.';
  }

  return {
    status,
    details,
    disclaimer: 'RX-score variability is observational and does not by itself identify congestion, fading or routing quality.',
    duplicateRatio,
    scoreStdDev: stdDev,
  };
});

function linkKey(link: Pick<NeighborLinkLive, 'peer_hash' | 'path_hash_size'>): string {
  return `${link.peer_hash}:${link.path_hash_size}`;
}

function sortableValue(link: NeighborLinkLive, key: SortKey): number | string {
  switch (key) {
    case 'peer_hash':
      return link.peer_hash;
    case 'path_hash_size':
      return link.path_hash_size;
    case 'sample_count':
      return link.sample_count;
    case 'duplicate_ratio':
      return ratioForLink(link);
    case 'ewma_score':
      return link.ewma_score;
    case 'last_seen':
      return link.last_seen;
    default:
      return 0;
  }
}

function setSort(nextKey: SortKey) {
  if (sortKey.value === nextKey) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortKey.value = nextKey;
  sortDir.value = nextKey === 'peer_hash' ? 'asc' : 'desc';
}

function selectLink(link: NeighborLinkLive) {
  selectedLinkKey.value = linkKey(link);
}

function chooseDefaultSelection() {
  if (links.value.length === 0) {
    selectedLinkKey.value = null;
    return;
  }

  const stillExists = links.value.some((link) => linkKey(link) === selectedLinkKey.value);
  if (stillExists) {
    return;
  }

  selectedLinkKey.value = linkKey(sortedFilteredLinks.value[0] ?? links.value[0]);
}

async function fetchLinks() {
  if (linksLoadedOnce.value) {
    linksRefreshing.value = true;
  } else {
    linksLoading.value = true;
    linksError.value = null;
  }

  try {
    const response = await ApiService.getNeighborLinks({ limit: 500 });
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load neighbour links');
    }

    const payload = response.data as NeighborLinksPayload;
    links.value = payload.links ?? [];
    linksLoadedOnce.value = true;
    linksError.value = null;
    chooseDefaultSelection();
  } catch (error) {
    linksError.value = error instanceof Error ? error.message : 'Failed to load neighbour links';
    if (!linksLoadedOnce.value) {
      links.value = [];
    }
  } finally {
    linksLoading.value = false;
    linksRefreshing.value = false;
  }
}

async function fetchHistory() {
  const link = selectedLink.value;
  if (!link) {
    historyRows.value = [];
    historyError.value = null;
    return;
  }

  if (historyLoadedOnce.value) {
    historyRefreshing.value = true;
  } else {
    historyLoading.value = true;
    historyError.value = null;
  }

  try {
    const response = await ApiService.getNeighborLinkHistory({
      peer_hash: link.peer_hash,
      path_hash_size: link.path_hash_size,
      hours: selectedHours.value,
      limit: HISTORY_LIMIT,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load link history');
    }

    const payload = response.data as NeighborLinkHistoryPayload;
    historyRows.value = [...(payload.rows ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    historyLoadedOnce.value = true;
    historyError.value = null;
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : 'Failed to load link history';
    if (!historyLoadedOnce.value) {
      historyRows.value = [];
    }
  } finally {
    historyLoading.value = false;
    historyRefreshing.value = false;
  }
}

const historyPollMs = computed(() => {
  if (!selectedLink.value) return 30_000;
  if (selectedHours.value <= 6) return 12_000;
  if (selectedHours.value <= 24) return 20_000;
  return 35_000;
});

const linksPolling = useManagedPolling(fetchLinks, {
  intervalMs: 5_000,
  immediate: false,
});

const historyPolling = useManagedPolling(fetchHistory, {
  intervalMs: historyPollMs.value,
  enabled: () => selectedLink.value !== null,
  immediate: false,
});

watch(historyPollMs, () => {
  void historyPolling.start();
});

watch(
  () => selectedLinkKey.value,
  () => {
    historyLoadedOnce.value = false;
    historyLoading.value = true;
    historyError.value = null;
    historyRows.value = [];
    void fetchHistory();
  },
);

watch(
  () => selectedHours.value,
  () => {
    historyLoadedOnce.value = false;
    historyLoading.value = true;
    historyError.value = null;
    historyRows.value = [];
    void fetchHistory();
  },
);

function buildHistoryDatasets(
  metricKey: 'rssi' | 'snr' | 'score',
  label: string,
  color: string,
): ChartDataset<'line' | 'scatter', { x: number; y: number }[]>[] {
  const uniquePoints: ({
    x: number;
    y: number;
    rssi: number | null;
    snr: number | null;
    is_duplicate: boolean;
    packet_type: number;
    route_type: number;
    path_hop_count: number | null;
  })[] = [];
  const duplicatePoints: ({
    x: number;
    y: number;
    rssi: number | null;
    snr: number | null;
    is_duplicate: boolean;
    packet_type: number;
    route_type: number;
    path_hop_count: number | null;
  })[] = [];

  historyRows.value.forEach((row) => {
    const value = row[metricKey];
    if (value === null || !Number.isFinite(value)) return;

    const point = {
      x: row.timestamp * 1000,
      y: value,
      rssi: row.rssi,
      snr: row.snr,
      is_duplicate: row.is_duplicate,
      packet_type: row.packet_type,
      route_type: row.route_type,
      path_hop_count: row.path_hop_count,
    };
    if (row.is_duplicate) {
      duplicatePoints.push(point);
    } else {
      uniquePoints.push(point);
    }
  });

  return [
    {
      type: 'line',
      label: `${label} (first-seen)`,
      data: uniquePoints,
      borderColor: color,
      backgroundColor: color,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.2,
    },
    {
      type: 'scatter',
      label: `${label} (duplicate)`,
      data: duplicatePoints,
      borderColor: cssVar('--color-accent-red', '#ef4444'),
      backgroundColor: cssVar('--color-accent-red', '#ef4444'),
      pointRadius: 3,
      pointHoverRadius: 5,
    },
  ];
}

function createOrUpdateHistoryChart(
  chartRef: typeof rssiChart,
  canvas: HTMLCanvasElement | null,
  metricKey: 'rssi' | 'snr' | 'score',
  label: string,
  color: string,
) {
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const datasets = buildHistoryDatasets(metricKey, label, color);

  if (chartRef.value) {
    chartRef.value.data.datasets = datasets;
    chartRef.value.update('none');
    return;
  }

  chartRef.value = markRaw(new ChartJS(toRaw(ctx), {
    type: 'line',
    data: {
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
      },
      scales: {
        x: {
          type: 'time',
          ticks: {
            color: cssVar('--color-text-secondary', '#64748b'),
          },
          grid: {
            color: cssVar('--color-border-subtle', '#cbd5e1'),
          },
        },
        y: {
          min: metricKey === 'score' ? 0 : undefined,
          max: metricKey === 'score' ? 1 : undefined,
          title: metricKey === 'score'
            ? {
              display: true,
              text: 'RX score',
              color: cssVar('--color-text-primary', '#0f172a'),
            }
            : undefined,
          ticks: {
            color: cssVar('--color-text-secondary', '#64748b'),
          },
          grid: {
            color: cssVar('--color-border-subtle', '#cbd5e1'),
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (metricKey !== 'score') {
                return `${label}: ${formatMetric(ctx.parsed.y, 2)}`;
              }

              const raw = ctx.raw as {
                x: number;
                y: number;
                rssi: number | null;
                snr: number | null;
                is_duplicate: boolean;
                packet_type: number;
                route_type: number;
                path_hop_count: number | null;
              };

              return [
                `Timestamp: ${new Date(raw.x).toLocaleString()}`,
                `RX score: ${formatMetric(raw.y, 3)}`,
                `RSSI: ${formatMetric(raw.rssi, 1)}`,
                `SNR: ${formatMetric(raw.snr, 1)}`,
                `Duplicate: ${raw.is_duplicate ? 'yes' : 'no'}`,
                `Packet type: ${raw.packet_type}`,
                `Route type: ${raw.route_type}`,
                `Path hop count: ${raw.path_hop_count ?? '--'}`,
              ];
            },
          },
        },
        legend: {
          labels: {
            color: cssVar('--color-text-primary', '#0f172a'),
          },
        },
      },
    },
  }));
}

function createOrUpdateScatterChart() {
  if (!scatterCanvasRef.value) return;

  const ctx = scatterCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const points = links.value.map((link) => ({
    x: Number.isFinite(link.ewma_score) ? link.ewma_score : 0,
    y: ratioForLink(link) * 100,
    peer_hash: link.peer_hash,
    path_hash_size: link.path_hash_size,
    last_rssi: link.last_rssi,
    last_snr: link.last_snr,
    sample_count: link.sample_count,
    duplicate_sample_count: link.duplicate_sample_count,
    active: link.active,
  }));

  if (scatterChart.value) {
    scatterChart.value.data.datasets = [
      {
        type: 'scatter',
        label: 'Links',
        data: points,
        borderColor: cssVar('--color-primary', '#0ea5e9'),
        backgroundColor: points.map((point) =>
          point.active ? cssVar('--color-accent-green', '#10b981') : cssVar('--color-text-muted', '#94a3b8'),
        ),
        pointRadius: points.map((point) => {
          const bounded = Math.max(3, Math.min(9, Math.sqrt(Math.max(1, point.sample_count))));
          return bounded;
        }),
      },
    ];
    scatterChart.value.update('none');
    return;
  }

  scatterChart.value = markRaw(new ChartJS(toRaw(ctx), {
    type: 'scatter',
    data: {
      datasets: [
        {
          type: 'scatter',
          label: 'Links',
          data: points,
          borderColor: cssVar('--color-primary', '#0ea5e9'),
          backgroundColor: points.map((point) =>
            point.active ? cssVar('--color-accent-green', '#10b981') : cssVar('--color-text-muted', '#94a3b8'),
          ),
          pointRadius: points.map((point) => {
            const bounded = Math.max(3, Math.min(9, Math.sqrt(Math.max(1, point.sample_count))));
            return bounded;
          }),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'EWMA RX Score',
            color: cssVar('--color-text-primary', '#0f172a'),
          },
          ticks: {
            color: cssVar('--color-text-secondary', '#64748b'),
          },
          grid: {
            color: cssVar('--color-border-subtle', '#cbd5e1'),
          },
        },
        y: {
          title: {
            display: true,
            text: 'Duplicate Observation Ratio (%)',
            color: cssVar('--color-text-primary', '#0f172a'),
          },
          ticks: {
            color: cssVar('--color-text-secondary', '#64748b'),
          },
          grid: {
            color: cssVar('--color-border-subtle', '#cbd5e1'),
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw as {
                x: number;
                y: number;
                peer_hash: string;
                path_hash_size: number;
                last_rssi: number;
                last_snr: number;
                sample_count: number;
                duplicate_sample_count: number;
                active: boolean;
              };
              return [
                `Peer: ${raw.peer_hash}`,
                `Path hash size: ${raw.path_hash_size}`,
                `EWMA RX score: ${raw.x.toFixed(2)}`,
                `Latest RSSI: ${formatMetric(raw.last_rssi, 1)}`,
                `Latest SNR: ${formatMetric(raw.last_snr, 1)}`,
                `Samples: ${raw.sample_count}`,
                `Duplicate observations: ${raw.duplicate_sample_count}`,
                `Duplicate observation ratio: ${raw.y.toFixed(1)}%`,
                `${raw.active ? 'Active' : 'Inactive'}`,
              ];
            },
          },
        },
        legend: {
          labels: {
            color: cssVar('--color-text-primary', '#0f172a'),
          },
        },
      },
    },
  }));
}

watch(
  () => links.value,
  async () => {
    await nextTick();
    createOrUpdateScatterChart();
  },
  { deep: true },
);

watch(
  () => historyRows.value,
  async () => {
    await nextTick();

    createOrUpdateHistoryChart(
      rssiChart,
      rssiCanvasRef.value,
      'rssi',
      'RSSI',
      cssVar('--color-accent-cyan', '#06b6d4'),
    );

    createOrUpdateHistoryChart(
      snrChart,
      snrCanvasRef.value,
      'snr',
      'SNR',
      cssVar('--color-primary', '#0ea5e9'),
    );

    createOrUpdateHistoryChart(
      scoreChart,
      scoreCanvasRef.value,
      'score',
      'RX score',
      cssVar('--color-accent-green', '#10b981'),
    );
  },
  { deep: true },
);

function destroyChart(chartRef: typeof rssiChart) {
  if (!chartRef.value) return;
  chartRef.value.destroy();
  chartRef.value = null;
}

function destroyAllCharts() {
  destroyChart(scatterChart);
  destroyChart(rssiChart);
  destroyChart(snrChart);
  destroyChart(scoreChart);
}

onMounted(async () => {
  await fetchLinks();
  await fetchHistory();
  await linksPolling.start();
  await historyPolling.start();
});

onBeforeUnmount(() => {
  linksPolling.stop();
  historyPolling.stop();
  destroyAllCharts();
});
</script>

<template>
  <section class="space-y-5" data-testid="neighbour-links-page">
    <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-content-primary">Neighbour Link Analytics</h2>
        <p class="text-sm text-content-secondary mt-1">
          Observation-only metrics for directly observed upstream flood repeaters.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="modal-btn-cancel !py-2 !px-3 !text-sm"
          data-testid="rx-score-info-button"
          @click="showRxScoreInfoModal = true"
        >
          RX score details
        </button>
        <label for="history-hours" class="text-sm text-content-secondary">History Window</label>
        <select
          id="history-hours"
          v-model.number="selectedHours"
          class="modal-select w-auto"
          data-testid="hours-select"
          aria-label="History window"
        >
          <option
            v-for="hours in HOURS_OPTIONS"
            :key="hours"
            :value="hours"
            class="bg-surface text-content-primary"
          >
            {{ hours >= 24 ? `${hours / 24} day` : `${hours} hour` }}
          </option>
        </select>
      </div>
    </header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-xs uppercase tracking-wide text-content-secondary">Total Links</div>
        <div class="text-2xl font-semibold text-content-primary mt-1" data-testid="kpi-total-links">{{ kpis.total }}</div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-xs uppercase tracking-wide text-content-secondary">Active Links</div>
        <div class="text-2xl font-semibold text-content-primary mt-1" data-testid="kpi-active-links">{{ kpis.active }}</div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-xs uppercase tracking-wide text-content-secondary flex items-center gap-1">
          Avg EWMA RX Score
          <span
            class="text-content-muted cursor-help"
            :title="RX_SCORE_TOOLTIP"
            aria-label="RX score information"
          >
            ⓘ
          </span>
        </div>
        <div class="text-2xl font-semibold text-content-primary mt-1" data-testid="kpi-avg-score">{{ formatMetric(kpis.avgScore) }}</div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-xs uppercase tracking-wide text-content-secondary flex items-center gap-1">
          Duplicate Observation Ratio
          <span
            class="text-content-muted cursor-help"
            :title="DUPLICATE_TOOLTIP"
            aria-label="Duplicate observation ratio information"
          >
            ⓘ
          </span>
        </div>
        <div class="text-2xl font-semibold text-content-primary mt-1" data-testid="kpi-duplicate-ratio">{{ formatPercent(kpis.duplicateRatio) }}</div>
      </div>
    </div>

    <ChartCard
      :is-loading="linksLoading"
      :is-updating="linksRefreshing"
      :error="linksError"
      status="Loading neighbour links..."
      @retry="fetchLinks"
    >
      <div class="glass-card rounded-[15px] p-4 h-[320px]">
        <div class="text-sm font-semibold text-content-primary mb-3">RX Score and Duplicate Observations</div>
        <canvas ref="scatterCanvasRef" aria-label="Neighbour links scatter plot" role="img" />
        <p class="text-xs text-content-secondary mt-2">
          This chart shows association only. Duplicate observations do not imply that a neighbour is unreliable or causing collisions.
        </p>
      </div>
    </ChartCard>

    <div class="glass-card rounded-[15px] p-4" data-testid="links-table-wrapper">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <h3 class="text-base font-semibold text-content-primary">Live Links</h3>
        <div class="flex flex-wrap items-center gap-2">
          <label for="status-filter" class="sr-only">Filter by status</label>
          <select id="status-filter" v-model="statusFilter" class="modal-select w-auto" data-testid="status-filter">
            <option value="all" class="bg-surface text-content-primary">All</option>
            <option value="active" class="bg-surface text-content-primary">Active</option>
            <option value="inactive" class="bg-surface text-content-primary">Inactive</option>
          </select>

          <label for="path-size-filter" class="sr-only">Filter by path hash size</label>
          <select id="path-size-filter" v-model="pathSizeFilter" class="modal-select w-auto" data-testid="path-size-filter">
            <option value="all" class="bg-surface text-content-primary">All Path Sizes</option>
            <option
              v-for="size in availablePathSizes"
              :key="`path-size-${size}`"
              :value="String(size)"
              class="bg-surface text-content-primary"
            >
              {{ size }} byte{{ size === 1 ? '' : 's' }}
            </option>
          </select>

          <label for="search-links" class="sr-only">Search links</label>
          <input
            id="search-links"
            v-model="search"
            type="search"
            class="modal-input w-52"
            data-testid="search-input"
            placeholder="Search peer hash"
          />
        </div>
      </div>

      <div class="overflow-x-auto" data-testid="links-table-scroll">
        <table class="w-full min-w-[980px] text-sm" data-testid="links-table">
          <thead>
            <tr class="text-left border-b border-stroke-subtle">
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('peer_hash')">Peer</button></th>
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('path_hash_size')">Path Size</button></th>
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('sample_count')">Samples</button></th>
              <th class="py-2 pr-3">
                <button class="text-content-secondary hover:text-content-primary flex items-center gap-1" @click="setSort('duplicate_ratio')">
                  Dup Ratio
                  <span class="text-content-muted cursor-help" :title="DUPLICATE_TOOLTIP" aria-label="Duplicate observation ratio information">ⓘ</span>
                </button>
              </th>
              <th class="py-2 pr-3">RSSI</th>
              <th class="py-2 pr-3">SNR</th>
              <th class="py-2 pr-3">
                <button class="text-content-secondary hover:text-content-primary flex items-center gap-1" @click="setSort('ewma_score')">
                  EWMA RX Score
                  <span class="text-content-muted cursor-help" :title="EWMA_RX_SCORE_TOOLTIP" aria-label="EWMA RX score information">ⓘ</span>
                </button>
              </th>
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('last_seen')">Last Seen</button></th>
              <th class="py-2 pr-0">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="link in sortedFilteredLinks"
              :key="linkKey(link)"
              class="border-b border-stroke-subtle/60 cursor-pointer hover:bg-background-mute/50"
              :class="selectedLinkKey === linkKey(link) ? 'bg-primary/10' : ''"
              @click="selectLink(link)"
              data-testid="link-row"
            >
              <td class="py-2 pr-3 font-mono text-content-primary">{{ link.peer_hash }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ link.path_hash_size }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ link.sample_count }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ formatPercent(ratioForLink(link)) }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ formatMetric(link.last_rssi, 1) }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ formatMetric(link.last_snr, 1) }}</td>
              <td class="py-2 pr-3 text-content-primary">{{ formatMetric(link.ewma_score, 2) }}</td>
              <td class="py-2 pr-3 text-content-secondary">{{ formatTime(link.last_seen) }}</td>
              <td class="py-2 pr-0">
                <span
                  class="px-2 py-1 rounded-full text-xs"
                  :class="link.active ? 'bg-accent-green/20 text-accent-green' : 'bg-background-mute text-content-secondary'"
                >
                  {{ link.active ? 'active' : 'inactive' }}
                </span>
              </td>
            </tr>
            <tr v-if="sortedFilteredLinks.length === 0">
              <td colspan="9" class="py-5 text-center text-content-secondary" data-testid="links-empty">
                No neighbour links match the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selectedLink" class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="glass-card rounded-[15px] p-4 xl:col-span-2">
        <h3 class="text-base font-semibold text-content-primary">Selected Link</h3>
        <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div class="text-content-secondary">Peer</div>
          <div class="font-mono text-content-primary" data-testid="selected-peer">{{ selectedLink.peer_hash }}</div>
          <div class="text-content-secondary">Path Hash Size</div>
          <div class="text-content-primary">{{ selectedLink.path_hash_size }} byte(s)</div>
          <div class="text-content-secondary">First Seen</div>
          <div class="text-content-primary">{{ formatTime(selectedLink.first_seen) }}</div>
          <div class="text-content-secondary">Last Seen</div>
          <div class="text-content-primary">{{ formatTime(selectedLink.last_seen) }}</div>
          <div class="text-content-secondary flex items-center gap-1">
            Latest RX Score
            <span class="text-content-muted cursor-help" :title="RX_SCORE_TOOLTIP" aria-label="RX score information">ⓘ</span>
          </div>
          <div class="text-content-primary" data-testid="selected-latest-rx-score">{{ formatMetric(selectedLink.last_score) }}</div>
          <div class="text-content-secondary">EWMA RX Score</div>
          <div class="text-content-primary" data-testid="selected-ewma-rx-score">{{ formatMetric(selectedLink.ewma_score) }}</div>
          <div class="text-content-secondary">Best / Worst RX Score</div>
          <div class="text-content-primary">{{ formatMetric(selectedLink.best_score) }} / {{ formatMetric(selectedLink.worst_score) }}</div>
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4" data-testid="stability-panel">
        <h3 class="text-base font-semibold text-content-primary">RX Observation Variability</h3>
        <div class="mt-2 text-xl font-semibold text-content-primary" data-testid="stability-status">
          {{ selectedHistorySummary.status }}
        </div>
        <p class="text-sm text-content-secondary mt-1">{{ selectedHistorySummary.details }}</p>
        <div class="mt-3 text-sm text-content-secondary">
          Duplicate observation ratio: <span class="text-content-primary">{{ formatPercent(selectedHistorySummary.duplicateRatio) }}</span>
        </div>
        <div class="text-sm text-content-secondary">
          RX score standard deviation: <span class="text-content-primary" data-testid="rx-score-stddev">{{ selectedHistorySummary.scoreStdDev === null ? '--' : selectedHistorySummary.scoreStdDev.toFixed(3) }}</span>
        </div>
        <p class="text-xs text-content-secondary mt-2">{{ selectedHistorySummary.disclaimer }}</p>
      </div>
    </div>

    <div v-if="selectedLink" class="grid grid-cols-1 xl:grid-cols-3 gap-4" data-testid="history-charts">
      <ChartCard
        :is-loading="historyLoading"
        :is-updating="historyRefreshing"
        :error="historyError"
        status="Loading history..."
        @retry="fetchHistory"
      >
        <div class="glass-card rounded-[15px] p-4 h-[280px]">
          <h3 class="text-sm font-semibold text-content-primary mb-2">RSSI (dBm)</h3>
          <canvas ref="rssiCanvasRef" role="img" aria-label="RSSI history chart" />
        </div>
      </ChartCard>

      <ChartCard
        :is-loading="historyLoading"
        :is-updating="historyRefreshing"
        :error="historyError"
        status="Loading history..."
        @retry="fetchHistory"
      >
        <div class="glass-card rounded-[15px] p-4 h-[280px]">
          <h3 class="text-sm font-semibold text-content-primary mb-2">SNR (dB)</h3>
          <canvas ref="snrCanvasRef" role="img" aria-label="SNR history chart" />
        </div>
      </ChartCard>

      <ChartCard
        :is-loading="historyLoading"
        :is-updating="historyRefreshing"
        :error="historyError"
        status="Loading history..."
        @retry="fetchHistory"
      >
        <div class="glass-card rounded-[15px] p-4 h-[280px]">
          <h3 class="text-sm font-semibold text-content-primary mb-2">RX Score History</h3>
          <canvas ref="scoreCanvasRef" role="img" aria-label="Score history chart" />
        </div>
      </ChartCard>
    </div>

    <div v-if="!linksLoading && links.length === 0" class="glass-card rounded-[15px] p-6 text-center" data-testid="page-empty">
      <p class="text-content-secondary">No neighbour links have been observed yet.</p>
    </div>

    <Teleport to="body">
      <div
        v-if="showRxScoreInfoModal"
        class="modal-backdrop"
        @click.self="showRxScoreInfoModal = false"
        data-testid="rx-score-info-modal"
      >
        <div class="modal-card max-w-2xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-semibold text-content-primary">Neighbour Link Analytics</h3>
            <button
              type="button"
              class="text-content-secondary hover:text-content-primary transition-colors"
              aria-label="Close RX score details"
              @click="showRxScoreInfoModal = false"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-3 text-sm text-content-secondary leading-relaxed">
            <p>
              Observation-only metrics for directly observed upstream flood repeaters.
            </p>
            <p>
              RX score is calculated by the shared Core reception metric using SNR, spreading factor and complete received frame length. The same score is used as an input to Core's flood RX timing system.
            </p>
            <p>
              This report currently shows the shared RX score, RSSI, SNR and duplicate observations. Calculated RX hold durations are not exposed by the current API and are not estimated in the browser.
            </p>
          </div>

          <div class="modal-actions mt-5">
            <button type="button" class="modal-btn-primary" @click="showRxScoreInfoModal = false">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
