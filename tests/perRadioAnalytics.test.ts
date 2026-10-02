import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('chart.js', () => {
  class FakeChart {
    static register = vi.fn();
    static instances: FakeChart[] = [];
    data: { datasets: Array<{ label?: string }> };
    options: Record<string, unknown>;
    update = vi.fn();
    destroy = vi.fn();
    resize = vi.fn();

    constructor(_ctx?: unknown, config?: { data?: FakeChart['data']; options?: Record<string, unknown> }) {
      this.data = config?.data ?? { datasets: [] };
      this.options = config?.options ?? {};
      FakeChart.instances.push(this);
    }
  }
  const element = {};
  return {
    Chart: FakeChart,
    CategoryScale: element,
    LinearScale: element,
    LogarithmicScale: element,
    PointElement: element,
    LineElement: element,
    LineController: element,
    BarController: element,
    DoughnutController: element,
    ScatterController: element,
    Title: element,
    Tooltip: element,
    Legend: element,
    ArcElement: element,
    BarElement: element,
    Filler: element,
    TimeScale: element,
  };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('@/utils/streamingFetch', () => ({ streamingGet: vi.fn() }));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/api')>();
  return {
    ...actual,
    default: { getNeighborLinks: vi.fn(), getNeighborLinkHistory: vi.fn() },
  };
});

import { Chart } from 'chart.js';
import ApiService from '@/utils/api';
import { streamingGet } from '@/utils/streamingFetch';
import { useSystemStore } from '@/stores/system';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import RadioScopeSelector from '@/components/ui/RadioScopeSelector.vue';
import { ALL_RADIOS, useRadioScope } from '@/composables/useRadioProfiles';
import NeighbourLinks from '@/views/NeighbourLinks.vue';
import Statistics from '@/views/Statistics.vue';
import {
  groupRowsByRadio,
  linkForRadio,
  packetTotalsForScope,
  rateBucketSeconds,
  ratesToMetricSeries,
  routeTotalsForScope,
  type PacketStatsPayload,
  type RouteStatsPayload,
} from '@/utils/radioAnalytics';
import type { NeighborLinkLive, NeighborLinkRadioStats } from '@/types/api';

const mockedGet = vi.mocked(streamingGet);

const PROFILE = {
  frequency_hz: 869618000,
  bandwidth_hz: 62500,
  spreading_factor: 8,
  coding_rate: 8,
  preamble_length: 17,
};
const BRIDGE_STATS = {
  radio_profiles: [
    { radio_id: 'north', ...PROFILE },
    { radio_id: 'south', ...PROFILE },
  ],
  fabric: { default_radio: 'north', tx_mode: 'bridge' },
};
const SINGLE_STATS = { radio_profiles: [{ radio_id: 'radio0', ...PROFILE }] };

const PACKET_STATS: PacketStatsPayload = {
  total_packets: 46,
  transmitted_packets: 8,
  dropped_packets: 38,
  radios: [
    { radio_id: 'north', received: 28, duplicates: 10, dropped: 20, transmissions: 8, avg_rssi: -80, avg_snr: 5 },
    { radio_id: 'south', received: 18, duplicates: 2, dropped: 18, transmissions: 8, avg_rssi: -90, avg_snr: 2 },
  ],
  unattributed_rx_count: 1,
  unattributed_tx_count: 0,
};
const ROUTE_STATS: RouteStatsPayload = {
  hours: 24,
  period: '24 hours',
  data_source: 'sqlite',
  route_totals: { Flood: 40, Direct: 6 },
  total_packets: 46,
  radios: [
    { radio_id: 'north', route_totals: { Flood: 25, Direct: 3 }, total_packets: 28 },
    { radio_id: 'south', route_totals: { Flood: 18 }, total_packets: 18 },
  ],
  originated: { route_totals: {}, total_packets: 0 },
  unattributed_count: 0,
};

function seedPinia(stats: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAppRuntimeStore().markAuthenticated();
  useSystemStore().stats = stats as never;
  return pinia;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('radio analytics helpers', () => {
  it('reads node totals under All radios and one radio otherwise', () => {
    expect(packetTotalsForScope(PACKET_STATS, ALL_RADIOS)).toEqual({ rx: 46, tx: 8 });
    expect(packetTotalsForScope(PACKET_STATS, 'south')).toEqual({ rx: 18, tx: 8 });
    expect(packetTotalsForScope(PACKET_STATS, 'gone')).toEqual({ rx: 0, tx: 0 });
    expect(packetTotalsForScope(null, ALL_RADIOS)).toEqual({ rx: 0, tx: 0 });
  });

  it('picks route totals for the scope', () => {
    expect(routeTotalsForScope(ROUTE_STATS, ALL_RADIOS)).toEqual({ Flood: 40, Direct: 6 });
    expect(routeTotalsForScope(ROUTE_STATS, 'south')).toEqual({ Flood: 18 });
    expect(routeTotalsForScope({ ...ROUTE_STATS, radios: undefined }, 'south')).toBeNull();
  });

  it('sizes rate buckets to about 72 points in whole minutes', () => {
    expect(rateBucketSeconds(1)).toBe(60);
    expect(rateBucketSeconds(6)).toBe(300);
    expect(rateBucketSeconds(24)).toBe(1200);
    expect(rateBucketSeconds(168)).toBe(8400);
  });

  it('turns one radio into a zero-filled packets-per-second series on the server grid', () => {
    const now = 1_700_003_700;
    const series = ratesToMetricSeries(
      {
        hours: 1,
        bucket_seconds: 1200,
        radios: [
          { radio_id: 'north', rx_total: 12, tx_total: 6, buckets: [{ timestamp: 1_700_001_600, rx_count: 12, tx_count: 6 }] },
        ],
        unattributed_rx_count: 0,
        unattributed_tx_count: 0,
      },
      'north',
      now,
    );

    const rx = series.series.find((s) => s.type === 'rx_count')!.data;
    expect(rx.map(([ts]) => ts % 1200)).toEqual([0, 0, 0, 0]);
    expect(rx).toContainEqual([1_700_001_600, 0.01]);
    expect(rx.filter(([, value]) => value === 0)).toHaveLength(3);
  });

  it('shows a link as one radio heard it, or not at all', () => {
    const link = makeLink('AB12', 10, [radioStats('north', 7, -80), radioStats('south', 3, -100)]);

    expect(linkForRadio(link, ALL_RADIOS)).toBe(link);
    expect(linkForRadio(link, 'south')).toMatchObject({ peer_hash: 'AB12', sample_count: 3, last_rssi: -100 });
    expect(linkForRadio(makeLink('ZZ99', 8, [radioStats('north', 8, -90)]), 'south')).toBeNull();
  });

  it('groups history rows by radio in configured order, unrecorded last', () => {
    const rows = [{ rx_radio_id: 'south' }, { rx_radio_id: null }, { rx_radio_id: 'north' }, { rx_radio_id: 'old' }];
    expect(groupRowsByRadio(rows, ['north', 'south']).map((g) => g.radioId)).toEqual([
      'north',
      'south',
      'old',
      null,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Radio scope selector
// ---------------------------------------------------------------------------

describe('RadioScopeSelector', () => {
  const radios = [
    { radioId: 'north', profile: PROFILE },
    { radioId: 'south', profile: PROFILE },
  ];

  it('renders nothing with a single radio', () => {
    const wrapper = mount(RadioScopeSelector, {
      props: { modelValue: ALL_RADIOS, radios: radios.slice(0, 1) },
    });
    expect(wrapper.find('[data-testid="radio-scope"]').exists()).toBe(false);
  });

  it('offers All radios and each radio, and reports the choice', async () => {
    const wrapper = mount(RadioScopeSelector, { props: { modelValue: ALL_RADIOS, radios } });

    const buttons = wrapper.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['All radios', 'north', 'south']);
    expect(buttons[0].attributes('aria-pressed')).toBe('true');
    expect(buttons[1].attributes('title')).toBe('869.618 MHz · SF8 · 62.5 kHz · CR 4/8');

    await buttons[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['south']]);
  });

  it('drops All radios where combining radios would answer nothing', () => {
    const wrapper = mount(RadioScopeSelector, {
      props: { modelValue: 'north', radios, allowAll: false },
    });

    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['north', 'south']);
  });
});

// ---------------------------------------------------------------------------
// Radio scope in the URL
// ---------------------------------------------------------------------------

describe('radio scope in the URL', () => {
  const Probe = defineComponent({
    setup(_, { expose }) {
      const { scope } = useRadioScope();
      expose({ scope });
      return () => h('span', scope.value);
    },
  });

  async function mountWithRouter(path: string) {
    const pinia = seedPinia(BRIDGE_STATS);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/statistics', component: Probe }],
    });
    await router.push(path);
    await router.isReady();
    const wrapper = mount(Probe, { global: { plugins: [pinia, router] } });
    return { wrapper, router, vm: wrapper.vm as unknown as { scope: string } };
  }

  it('reads the radio from ?radio= and writes changes back', async () => {
    const { wrapper, router, vm } = await mountWithRouter('/statistics?radio=south');
    expect(wrapper.text()).toBe('south');

    vm.scope = 'north';
    await flushPromises();
    expect(router.currentRoute.value.query.radio).toBe('north');
    expect(wrapper.text()).toBe('north');

    vm.scope = ALL_RADIOS;
    await flushPromises();
    expect(router.currentRoute.value.query).not.toHaveProperty('radio');
    expect(wrapper.text()).toBe(ALL_RADIOS);
  });

  it('shows All radios for a radio this node does not have', async () => {
    const { wrapper } = await mountWithRouter('/statistics?radio=gone');
    expect(wrapper.text()).toBe(ALL_RADIOS);
  });

  it('falls back to the default radio where All radios is not an answer', async () => {
    const RequiresRadio = defineComponent({
      setup: () => {
        const { scope } = useRadioScope({ requireRadio: true });
        return () => h('span', scope.value);
      },
    });
    const pinia = seedPinia(BRIDGE_STATS);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/rf-health', component: RequiresRadio }],
    });
    await router.push('/rf-health?radio=gone');
    await router.isReady();

    const wrapper = mount(RequiresRadio, { global: { plugins: [pinia, router] } });

    expect(wrapper.text()).toBe('north');
  });

  it('leaves a single-radio node on All radios even where a radio is required', async () => {
    // Its samples carry no radio id, so filtering by one would return nothing.
    const RequiresRadio = defineComponent({
      setup: () => {
        const { scope } = useRadioScope({ requireRadio: true });
        return () => h('span', scope.value);
      },
    });
    const pinia = seedPinia(SINGLE_STATS);
    const wrapper = mount(RequiresRadio, { global: { plugins: [pinia] } });

    expect(wrapper.text()).toBe(ALL_RADIOS);
  });
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

const statCard = {
  props: ['title', 'subtitle', 'value', 'data'],
  template:
    '<div data-testid="stat-card" :data-points="(data || []).length">{{ title }}{{ subtitle ? " · " + subtitle : "" }}={{ value }}</div>',
};
const statStubs = {
  SparklineChart: statCard,
  Sparkline: statCard,
  ChartCard: {
    props: ['isLoading', 'error'],
    template:
      '<div data-testid="chart-card" :data-loading="String(!!isLoading)" :data-error="error || \'\'"><slot /></div>',
  },
};

function endpointData(endpoint: string): unknown {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 1200) * 1200 - 1200;
  const data: Record<string, unknown> = {
    '/packet_stats': PACKET_STATS,
    '/route_stats': ROUTE_STATS,
    '/radio_packet_rates': {
      hours: 24,
      bucket_seconds: 1200,
      radios: [
        { radio_id: 'north', rx_total: 5, tx_total: 2, buckets: [{ timestamp: bucket, rx_count: 5, tx_count: 2 }] },
        { radio_id: 'south', rx_total: 3, tx_total: 2, buckets: [{ timestamp: bucket, rx_count: 3, tx_count: 2 }] },
      ],
      unattributed_rx_count: 0,
      unattributed_tx_count: 0,
    },
    '/metrics_graph_data': {
      series: [
        { name: 'Received Packets', type: 'rx_count', data: [[now - 600, 0.01], [now - 300, 0.02]] },
        { name: 'Transmitted Packets', type: 'tx_count', data: [[now - 600, 0.01], [now - 300, 0.01]] },
      ],
    },
    '/noise_floor_history': {
      history: [
        { timestamp: now - 300, noise_floor_dbm: -118, radio_id: 'north' },
        { timestamp: now - 290, noise_floor_dbm: -101, radio_id: 'south' },
        { timestamp: now - 280, noise_floor_dbm: -117, radio_id: 'north' },
        { timestamp: now - 270, noise_floor_dbm: -95, radio_id: null },
      ],
    },
    '/crc_error_history': {
      history: [{ timestamp: now - 300, count: 4, radio_id: 'north' }],
    },
  };
  return data[endpoint] ?? { history: [] };
}

function respondByEndpoint() {
  mockedGet.mockImplementation(async (endpoint: string) => {
    return { success: true, data: endpointData(endpoint) } as never;
  });
}

const rxCardPoints = (wrapper: ReturnType<typeof mount>) =>
  Number(wrapper.findAll('[data-testid="stat-card"]')[0].attributes('data-points'));

async function mountStatistics(stats: Record<string, unknown>) {
  const pinia = seedPinia(stats);
  const wrapper = mount(Statistics, { global: { plugins: [pinia], stubs: statStubs } });
  await flushPromises();
  return wrapper;
}

const cards = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[data-testid="stat-card"]').map((card) => card.text());

describe('Statistics per radio', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    respondByEndpoint();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  });

  it('labels the per-packet and per-radio TX counts and switches to a radio', async () => {
    const wrapper = await mountStatistics(BRIDGE_STATS);

    expect(cards(wrapper)).toEqual([
      'Total RX · All radios=46',
      'Total TX · Per packet=8',
      'CRC Errors · All radios=4',
    ]);
    expect(wrapper.get('[data-testid="noise-floor-radio-note"]').text()).toContain(
      'One line per radio',
    );
    expect(wrapper.text()).toContain('Direct');

    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();

    expect(cards(wrapper)).toEqual([
      'Total RX · south=18',
      'Transmissions · south=8',
      'CRC Errors · south=4',
    ]);
    expect(wrapper.get('[data-testid="unattributed-note"]').text()).toContain('not counted for south');
    expect(wrapper.text()).toContain('Receptions on south.');
    expect(wrapper.text()).not.toContain('Direct');
  });

  it('asks for per-radio packet rates on a bridge', async () => {
    await mountStatistics(BRIDGE_STATS);

    expect(mockedGet).toHaveBeenCalledWith('/radio_packet_rates', { hours: 24, bucket_seconds: 1200 });
  });

  it('keeps the combined chart when the per-radio request fails', async () => {
    mockedGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/radio_packet_rates') throw new Error('Connection timeout');
      return { success: true, data: endpointData(endpoint) } as never;
    });
    const wrapper = await mountStatistics(BRIDGE_STATS);

    expect(rxCardPoints(wrapper)).toBeGreaterThan(0);

    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();
    expect(rxCardPoints(wrapper)).toBe(0);
  });

  it('keeps per-radio counts when an older load finishes last', async () => {
    const pending: Array<{ endpoint: string; resolve: () => void }> = [];
    mockedGet.mockImplementation((endpoint: string) => {
      const response = { success: true, data: endpointData(endpoint) };
      if (endpoint !== '/metrics_graph_data' && endpoint !== '/radio_packet_rates') {
        return Promise.resolve(response) as never;
      }
      return new Promise((resolve) => {
        pending.push({ endpoint, resolve: () => resolve(response) });
      }) as never;
    });

    const pinia = seedPinia(SINGLE_STATS);
    const wrapper = mount(Statistics, { global: { plugins: [pinia], stubs: statStubs } });
    await flushPromises();
    expect(pending.map((p) => p.endpoint)).toEqual(['/metrics_graph_data']);

    // The radio list arrives while the first, single-radio load is still out.
    useSystemStore().stats = BRIDGE_STATS as never;
    await flushPromises();
    expect(pending.map((p) => p.endpoint)).toEqual([
      '/metrics_graph_data',
      '/metrics_graph_data',
      '/radio_packet_rates',
    ]);

    pending[1].resolve();
    pending[2].resolve();
    await flushPromises();
    pending[0].resolve();
    await flushPromises();

    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();
    expect(rxCardPoints(wrapper)).toBeGreaterThan(0);
  });

  it('shows a selected radio as loading, not empty, until its counts arrive', async () => {
    // A drawable canvas, so the chart code runs as it does in a browser.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
    const pendingRates: Array<() => void> = [];
    mockedGet.mockImplementation((endpoint: string) => {
      const response = { success: true, data: endpointData(endpoint) };
      if (endpoint !== '/radio_packet_rates') return Promise.resolve(response) as never;
      return new Promise((resolve) => pendingRates.push(() => resolve(response))) as never;
    });

    const wrapper = await mountStatistics(BRIDGE_STATS);
    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();

    const rateCard = () => wrapper.findAll('[data-testid="chart-card"]')[0];
    expect(rateCard().attributes('data-loading')).toBe('true');
    expect(rateCard().attributes('data-error')).toBe('');

    pendingRates.forEach((resolve) => resolve());
    await flushPromises();
    expect(rateCard().attributes('data-loading')).toBe('false');
    expect(rateCard().attributes('data-error')).toBe('');
    expect(rxCardPoints(wrapper)).toBeGreaterThan(0);
  });

  it('draws one noise floor line per radio under All radios', async () => {
    // A noise floor cannot be summed or averaged across two bands; one line each.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
    (Chart as unknown as { instances: unknown[] }).instances.length = 0;

    await mountStatistics(BRIDGE_STATS);

    const charts = (Chart as unknown as {
      instances: Array<{ data: { datasets: Array<{ label?: string }> } }>;
    }).instances;
    const noise = charts.find((chart) =>
      chart.data.datasets.every((dataset) => ['north', 'south', 'no radio'].includes(dataset.label ?? '')),
    );
    expect(noise?.data.datasets.map((dataset) => dataset.label)).toEqual([
      'north',
      'south',
      'no radio',
    ]);
  });

  it('keeps a radio own colour when the other has no samples in the window', async () => {
    // Coloured by position in the drawn list, an idle radio would hand its colour on.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
    const now = Math.floor(Date.now() / 1000);

    const southColour = async (history: unknown[]) => {
      (Chart as unknown as { instances: unknown[] }).instances.length = 0;
      mockedGet.mockImplementation(async (endpoint: string) =>
        endpoint === '/noise_floor_history'
          ? ({ success: true, data: { history } } as never)
          : ({ success: true, data: endpointData(endpoint) } as never),
      );
      const wrapper = await mountStatistics(BRIDGE_STATS);
      const datasets = (
        Chart as unknown as {
          instances: Array<{
            data: { datasets: Array<{ label?: string; backgroundColor?: string }> };
          }>;
        }
      ).instances.flatMap((chart) => chart.data.datasets);
      wrapper.unmount();
      return datasets.find((dataset) => dataset.label === 'south')?.backgroundColor;
    };

    const withBoth = await southColour([
      { timestamp: now - 300, noise_floor_dbm: -118, radio_id: 'north' },
      { timestamp: now - 290, noise_floor_dbm: -101, radio_id: 'south' },
    ]);
    const southOnly = await southColour([
      { timestamp: now - 290, noise_floor_dbm: -101, radio_id: 'south' },
    ]);

    expect(withBoth).toBeTruthy();
    expect(southOnly).toBe(withBoth);
  });

  it('asks for one radio\'s noise floor and CRC errors when one is chosen', async () => {
    const wrapper = await mountStatistics(BRIDGE_STATS);
    const params = (endpoint: string) =>
      mockedGet.mock.calls.filter(([name]) => name === endpoint).map(([, query]) => query);
    const lastOf = <T,>(items: T[]): T | undefined => items[items.length - 1];

    // Assert the requests happened: `every` over nothing is true.
    expect(params('/noise_floor_history').length).toBeGreaterThan(0);
    expect(params('/noise_floor_history').every((query) => !('radio_id' in (query ?? {})))).toBe(true);

    mockedGet.mockClear();
    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();

    expect(lastOf(params('/noise_floor_history'))).toMatchObject({ radio_id: 'south' });
    expect(lastOf(params('/crc_error_history'))).toMatchObject({ radio_id: 'south' });
  });

  it('draws only the chosen radio samples, and nothing when it has none', async () => {
    // The stale answer left behind would be the other radio's, under this name.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
    (Chart as unknown as { instances: unknown[] }).instances.length = 0;
    const now = Math.floor(Date.now() / 1000);
    const samples = [
      { timestamp: now - 300, noise_floor_dbm: -118, radio_id: 'north' },
      { timestamp: now - 290, noise_floor_dbm: -101, radio_id: 'south' },
    ];
    mockedGet.mockImplementation(async (endpoint: string, query?: Record<string, unknown>) => {
      if (endpoint !== '/noise_floor_history') {
        return { success: true, data: endpointData(endpoint) } as never;
      }
      const radio = query?.radio_id;
      return {
        success: true,
        data: { history: radio ? samples.filter((row) => row.radio_id === radio) : samples },
      } as never;
    });

    const wrapper = await mountStatistics(BRIDGE_STATS);
    const drawn = () => {
      const charts = (
        Chart as unknown as {
          instances: Array<{ data: { datasets: Array<{ label?: string; data?: unknown[] }> } }>;
        }
      ).instances;
      const noise = charts.find((chart) =>
        chart.data.datasets.some((dataset) =>
          ['north', 'south', 'no radio', 'Noise Floor (dBm)'].includes(dataset.label ?? ''),
        ),
      );
      return (noise?.data.datasets ?? []).flatMap((dataset) => dataset.data ?? []);
    };

    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();
    expect(drawn()).toHaveLength(1);

    // A radio the window holds nothing for draws nothing, not the other's samples.
    samples.length = 0;
    await wrapper.get('[data-testid="radio-scope-north"]').trigger('click');
    await flushPromises();
    expect(drawn()).toHaveLength(0);
  });

  it('leaves a single-radio node as it was', async () => {
    const wrapper = await mountStatistics(SINGLE_STATS);

    expect(wrapper.find('[data-testid="radio-scope"]').exists()).toBe(false);
    expect(cards(wrapper)).toEqual(['Total RX=46', 'Total TX=8', 'CRC Errors=4']);
    expect(wrapper.find('[data-testid="noise-floor-radio-note"]').exists()).toBe(false);
    expect(mockedGet.mock.calls.map(([endpoint]) => endpoint)).not.toContain('/radio_packet_rates');
  });
});

// ---------------------------------------------------------------------------
// Neighbour Links
// ---------------------------------------------------------------------------

function radioStats(radio_id: string, sample_count: number, last_rssi: number): NeighborLinkRadioStats {
  return {
    radio_id,
    sample_count,
    duplicate_sample_count: 0,
    first_seen: 1_700_000_000,
    last_seen: 1_700_000_300,
    age_seconds: 10,
    active: true,
    last_rssi,
    last_snr: 5,
    last_score: 0.8,
    ewma_rssi: last_rssi,
    ewma_snr: 5,
    ewma_score: 0.8,
    best_score: 0.9,
    worst_score: 0.7,
  };
}

function makeLink(peer_hash: string, sample_count: number, radios?: NeighborLinkRadioStats[]): NeighborLinkLive {
  return {
    ...radioStats('merged', sample_count, -90),
    peer_hash,
    path_hash_size: 1,
    radios,
  } as NeighborLinkLive;
}

async function mountNeighbourLinks(stats: Record<string, unknown>) {
  const pinia = seedPinia(stats);
  const wrapper = mount(NeighbourLinks, {
    global: { plugins: [pinia], stubs: { ChartCard: { template: '<div><slot /></div>' } } },
  });
  await flushPromises();
  return wrapper;
}

describe('Neighbour Links per radio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue({
      success: true,
      data: {
        links: [
          makeLink('AB12', 10, [radioStats('north', 7, -80), radioStats('south', 3, -100)]),
          makeLink('ZZ99', 8, [radioStats('north', 8, -90)]),
        ],
        active_within_seconds: 90,
        count: 2,
      },
    } as never);
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue({
      success: true,
      data: { peer_hash: 'AB12', path_hash_size: 1, hours: 24, limit: 1000, rows: [], count: 0 },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows which radios heard each neighbour', async () => {
    const wrapper = await mountNeighbourLinks(BRIDGE_STATS);

    const heard = Object.fromEntries(
      wrapper.findAll('[data-testid="link-row"]').map((row) => [
        row.findAll('td')[0].text(),
        row.findAll('[data-testid="link-radios"] span').map((badge) => badge.text()),
      ]),
    );
    expect(heard).toEqual({ AB12: ['north', 'south'], ZZ99: ['north'] });

    const ab12 = wrapper.findAll('[data-testid="link-row"]').find((row) => row.text().includes('AB12'))!;
    await ab12.trigger('click');
    await flushPromises();
    const perRadio = wrapper.get('[data-testid="selected-radios"]').findAll('tbody tr');
    expect(perRadio.map((row) => row.findAll('td').slice(0, 2).map((td) => td.text()))).toEqual([
      ['north', '7'],
      ['south', '3'],
    ]);
  });

  it('narrows the table, KPIs and history to the selected radio', async () => {
    const wrapper = await mountNeighbourLinks(BRIDGE_STATS);

    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="link-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('AB12');
    expect(rows[0].findAll('td')[3].text()).toBe('3'); // south's samples, not the merged 10
    expect(wrapper.get('[data-testid="kpi-total-links"]').text()).toBe('1');

    const calls = vi.mocked(ApiService.getNeighborLinkHistory).mock.calls;
    expect(calls[calls.length - 1][0]).toMatchObject({ peer_hash: 'AB12', radio_id: 'south' });
  });

  it('ignores a history response that arrives after the radio changed', async () => {
    const historyResponse = (scores: number[]) => ({
      success: true,
      data: {
        peer_hash: 'AB12',
        path_hash_size: 1,
        hours: 24,
        limit: 1000,
        rows: scores.map((score, index) => ({
          timestamp: 1_700_000_000 + index * 20,
          rssi: -90,
          snr: 5,
          score,
          is_duplicate: false,
          packet_hash: `h${index}`,
          packet_type: 1,
          route_type: 1,
          path_hop_count: 1,
        })),
        count: scores.length,
      },
    });
    const stale: Array<() => void> = [];
    vi.mocked(ApiService.getNeighborLinkHistory).mockImplementation((params) => {
      if ((params as { radio_id?: string }).radio_id === 'south') {
        return Promise.resolve(historyResponse([0.8, 0.79, 0.81, 0.8, 0.8, 0.79, 0.81, 0.8, 0.8])) as never;
      }
      return new Promise((resolve) => stale.push(() => resolve(historyResponse([0.2, 0.9])))) as never;
    });

    const wrapper = await mountNeighbourLinks(BRIDGE_STATS);
    await wrapper.get('[data-testid="radio-scope-south"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Low variation');

    expect(stale.length).toBeGreaterThan(0);
    stale.forEach((resolve) => resolve());
    await flushPromises();
    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Low variation');
  });

  it('redraws history per radio when the radio list arrives after it', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
    (Chart as unknown as { instances: unknown[] }).instances.length = 0;
    const row = (index: number, rx_radio_id: string, is_duplicate = false) => ({
      timestamp: 1_700_000_000 + index * 20,
      rssi: -90,
      snr: 5,
      score: 0.8,
      is_duplicate,
      packet_hash: `h${index}`,
      packet_type: 1,
      route_type: 1,
      path_hop_count: 1,
      rx_radio_id,
    });
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue({
      success: true,
      data: {
        peer_hash: 'AB12',
        path_hash_size: 1,
        hours: 24,
        limit: 1000,
        rows: [row(0, 'north'), row(1, 'south'), row(2, 'north', true)],
        count: 3,
      },
    } as never);

    const pinia = seedPinia({});
    const wrapper = mount(NeighbourLinks, {
      global: { plugins: [pinia], stubs: { ChartCard: { template: '<div><slot /></div>' } } },
    });
    await flushPromises();

    useSystemStore().stats = BRIDGE_STATS as never;
    await flushPromises();

    const charts = (Chart as unknown as { instances: Array<{ data: { datasets: Array<{ label?: string }> } }> })
      .instances;
    const perRadio = charts.filter(
      (chart) =>
        JSON.stringify(chart.data.datasets.map((d) => d.label)) ===
        JSON.stringify(['north', 'south', 'north duplicate']),
    );
    expect(perRadio).toHaveLength(3); // RSSI, SNR and RX score
    wrapper.unmount();
  });

  it('adds no radio column on a single-radio node', async () => {
    const wrapper = await mountNeighbourLinks(SINGLE_STATS);

    expect(wrapper.find('[data-testid="link-radios"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="radio-scope"]').exists()).toBe(false);
    const calls = vi.mocked(ApiService.getNeighborLinkHistory).mock.calls;
    expect(calls[calls.length - 1][0]).not.toHaveProperty('radio_id');
  });
});
