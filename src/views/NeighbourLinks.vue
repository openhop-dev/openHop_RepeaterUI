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
const selectedHours = ref<number>(24);
const selectedLinkKey = ref<string | null>(null);

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
      details: 'Need at least 8 score samples to classify stability.',
      duplicateRatio,
      scoreStdDev: null as number | null,
    };
  }

  const mean = validScores.reduce((acc, value) => acc + value, 0) / validScores.length;
  const variance = validScores.reduce((acc, value) => acc + (value - mean) ** 2, 0) / validScores.length;
  const stdDev = Math.sqrt(variance);

  let status = 'Stable';
  let details = 'Low score variance and controlled duplicate ratio.';

  if (duplicateRatio >= 0.45 || stdDev >= 0.18) {
    status = 'Unstable';
    details = 'High duplicate ratio or large score variance indicates a noisy link.';
  } else if (duplicateRatio >= 0.28 || stdDev >= 0.1) {
    status = 'Fluctuating';
    details = 'Moderate drift observed; monitor this link for congestion or fading.';
  }

  return {
    status,
    details,
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
  const uniquePoints: { x: number; y: number }[] = [];
  const duplicatePoints: { x: number; y: number }[] = [];

  historyRows.value.forEach((row) => {
    const value = row[metricKey];
    if (value === null || !Number.isFinite(value)) return;

    const point = { x: row.timestamp * 1000, y: value };
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
          ticks: {
            color: cssVar('--color-text-secondary', '#64748b'),
          },
          grid: {
            color: cssVar('--color-border-subtle', '#cbd5e1'),
          },
        },
      },
      plugins: {
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
    sample_count: link.sample_count,
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
            text: 'EWMA Score',
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
            text: 'Duplicate Ratio (%)',
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
              const raw = ctx.raw as { x: number; y: number; peer_hash: string; sample_count: number };
              return `${raw.peer_hash} • score ${raw.x.toFixed(2)} • dup ${raw.y.toFixed(1)}% • n=${raw.sample_count}`;
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
      'Score',
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
          Observation-only telemetry for upstream peers. Live snapshot refreshes every 5 seconds.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
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
        <div class="text-xs uppercase tracking-wide text-content-secondary">Avg EWMA Score</div>
        <div class="text-2xl font-semibold text-content-primary mt-1" data-testid="kpi-avg-score">{{ formatMetric(kpis.avgScore) }}</div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-xs uppercase tracking-wide text-content-secondary flex items-center gap-1">
          Duplicate Ratio
          <span
            class="text-content-muted cursor-help"
            title="duplicate_sample_count divided by sample_count across all links"
            aria-label="Duplicate ratio formula"
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
        <div class="text-sm font-semibold text-content-primary mb-3">Neighbour Link Overview</div>
        <canvas ref="scatterCanvasRef" aria-label="Neighbour links scatter plot" role="img" />
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
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('duplicate_ratio')">Dup Ratio</button></th>
              <th class="py-2 pr-3">RSSI</th>
              <th class="py-2 pr-3">SNR</th>
              <th class="py-2 pr-3"><button class="text-content-secondary hover:text-content-primary" @click="setSort('ewma_score')">EWMA Score</button></th>
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
          <div class="text-content-secondary">Best / Worst Score</div>
          <div class="text-content-primary">{{ formatMetric(selectedLink.best_score) }} / {{ formatMetric(selectedLink.worst_score) }}</div>
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4" data-testid="stability-panel">
        <h3 class="text-base font-semibold text-content-primary">Link Stability</h3>
        <div class="mt-2 text-xl font-semibold text-content-primary" data-testid="stability-status">
          {{ selectedHistorySummary.status }}
        </div>
        <p class="text-sm text-content-secondary mt-1">{{ selectedHistorySummary.details }}</p>
        <div class="mt-3 text-sm text-content-secondary">
          Duplicate ratio: <span class="text-content-primary">{{ formatPercent(selectedHistorySummary.duplicateRatio) }}</span>
        </div>
        <div class="text-sm text-content-secondary">
          Score std dev: <span class="text-content-primary">{{ selectedHistorySummary.scoreStdDev === null ? '--' : selectedHistorySummary.scoreStdDev.toFixed(3) }}</span>
        </div>
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
          <h3 class="text-sm font-semibold text-content-primary mb-2">RSSI History</h3>
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
          <h3 class="text-sm font-semibold text-content-primary mb-2">SNR History</h3>
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
          <h3 class="text-sm font-semibold text-content-primary mb-2">Score History</h3>
          <canvas ref="scoreCanvasRef" role="img" aria-label="Score history chart" />
        </div>
      </ChartCard>
    </div>

    <div v-if="!linksLoading && links.length === 0" class="glass-card rounded-[15px] p-6 text-center" data-testid="page-empty">
      <p class="text-content-secondary">No neighbour links have been observed yet.</p>
    </div>
  </section>
</template>
