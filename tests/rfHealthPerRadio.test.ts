/**
 * RF Health Correlation on a multi-radio node.
 *
 * Every series on the page describes one receiver. Correlating one radio's
 * noise floor with another's CRC errors or contention relates two unrelated
 * channels, so a bridge picks a radio here rather than combining them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('chart.js', () => {
  class FakeChart {
    static register = vi.fn();
    static instances: FakeChart[] = [];
    data: { datasets: Array<{ label?: string }> };
    options: Record<string, unknown>;
    update = vi.fn();
    destroy = vi.fn();
    resize = vi.fn();

    constructor(
      _ctx?: unknown,
      config?: { data?: FakeChart['data']; options?: Record<string, unknown> },
    ) {
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
    Title: element,
    Tooltip: element,
    Legend: element,
    BarElement: element,
    Filler: element,
    TimeScale: element,
  };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('@/utils/streamingFetch', () => ({ streamingGet: vi.fn() }));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/api')>();
  return { ...actual, default: { getLbtDiagnostics: vi.fn() } };
});

import { Chart } from 'chart.js';
import ApiService from '@/utils/api';
import { streamingGet } from '@/utils/streamingFetch';
import { useSystemStore } from '@/stores/system';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import RfHealthCorrelation from '@/views/RfHealthCorrelation.vue';

const mockedGet = vi.mocked(streamingGet);
const mockedLbt = vi.mocked(ApiService.getLbtDiagnostics);

const PROFILE = {
  frequency_hz: 910100000,
  bandwidth_hz: 500000,
  spreading_factor: 7,
  coding_rate: 5,
  preamble_length: 17,
};
const BRIDGE_STATS = {
  radio_profiles: [
    { radio_id: 'local', ...PROFILE },
    { radio_id: 'link', ...PROFILE, bandwidth_hz: 62500 },
  ],
  fabric: { default_radio: 'local', tx_mode: 'bridge' },
};
const SINGLE_STATS = { radio_profiles: [{ radio_id: 'radio0', ...PROFILE }] };

const NOW = Math.floor(Date.now() / 1000);

function lbtSummary(overrides: Record<string, number>) {
  return {
    total_transmissions: 0,
    retry_packets: 0,
    failed_transmissions: 0,
    busy_channel_events: 0,
    max_attempts: 0,
    has_lbt_data: true,
    ...overrides,
  };
}

const LBT_PAYLOAD = {
  start_time: NOW - 3600,
  end_time: NOW,
  bucket_seconds: 300,
  severe_attempt_threshold: 4,
  summary: lbtSummary({ total_transmissions: 20, retry_packets: 4, max_attempts: 3 }),
  buckets: [
    {
      timestamp: NOW - 300,
      transmissions: 20,
      retry_rate_pct: 20,
      max_attempts: 3,
      rf: { avg_snr: 5, avg_rssi: -80, traffic_volume: 40, packet_loss_rate_pct: 1 },
    },
  ],
  packet_types: [],
  packet_type_buckets: [],
  correlations: {},
  limitations: [],
  radios: [
    {
      radio_id: 'local',
      summary: lbtSummary({ total_transmissions: 20, retry_packets: 0, max_attempts: 1 }),
      buckets: [{ timestamp: NOW - 300, transmissions: 20, retry_rate_pct: 0, max_attempts: 1 }],
    },
    {
      radio_id: 'link',
      summary: lbtSummary({
        total_transmissions: 20,
        retry_packets: 18,
        busy_channel_events: 12,
        max_attempts: 6,
      }),
      buckets: [{ timestamp: NOW - 300, transmissions: 20, retry_rate_pct: 90, max_attempts: 6 }],
    },
  ],
  unattributed_transmissions: 0,
};

function seedPinia(stats: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAppRuntimeStore().markAuthenticated();
  useSystemStore().stats = stats as never;
  return pinia;
}

async function mountView(stats: Record<string, unknown>) {
  const wrapper = mount(RfHealthCorrelation, {
    global: {
      plugins: [seedPinia(stats)],
      stubs: { ChartCard: { template: '<div><slot /></div>' }, IncidentDetailsModal: true },
    },
  });
  await flushPromises();
  return wrapper;
}

function lastQueryFor(endpoint: string): Record<string, unknown> {
  const queries = queriesFor(endpoint);
  return queries[queries.length - 1] ?? {};
}

const queriesFor = (endpoint: string) =>
  mockedGet.mock.calls
    .filter(([name]) => name === endpoint)
    .map(([, query]) => (query ?? {}) as Record<string, unknown>);

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockImplementation(
    async (endpoint: string) =>
      ({
        success: true,
        data:
          endpoint === '/noise_floor_history'
            ? { history: [{ timestamp: NOW - 300, noise_floor_dbm: -118, radio_id: 'local' }] }
            : { history: [] },
      }) as never,
  );
  mockedLbt.mockReset();
  mockedLbt.mockResolvedValue({ success: true, data: LBT_PAYLOAD } as never);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  (Chart as unknown as { instances: unknown[] }).instances.length = 0;
});

describe('RF Health on a bridge', () => {
  it('makes the operator pick a radio and offers no All radios', async () => {
    const wrapper = await mountView(BRIDGE_STATS);

    const buttons = wrapper.findAll('[data-testid="radio-scope"] button');
    expect(buttons.map((button) => button.text())).toEqual(['local', 'link']);
    expect(buttons[0].attributes('aria-pressed')).toBe('true');
  });

  it('asks for the selected radio own samples', async () => {
    const wrapper = await mountView(BRIDGE_STATS);

    expect(lastQueryFor('/noise_floor_history')).toMatchObject({ radio_id: 'local' });
    expect(lastQueryFor('/crc_error_history')).toMatchObject({ radio_id: 'local' });

    await wrapper.get('[data-testid="radio-scope-link"]').trigger('click');
    await flushPromises();

    expect(lastQueryFor('/noise_floor_history')).toMatchObject({ radio_id: 'link' });
    expect(lastQueryFor('/crc_error_history')).toMatchObject({ radio_id: 'link' });
  });

  it('names the selected radio instead of the default one', async () => {
    const wrapper = await mountView(BRIDGE_STATS);

    await wrapper.get('[data-testid="radio-scope-link"]').trigger('click');
    await flushPromises();

    const note = wrapper.get('[data-testid="multi-radio-note"]').text();
    expect(note).toContain("LBT figures here are link's alone");
    expect(note).not.toContain('default radio');
  });

  it('reports the selected radio contention, not the combined figures', async () => {
    // Combined counts one packet once however many radios sent it, so the narrow
    // band's contention is invisible there: 6 attempts on link, 3 combined.
    const wrapper = await mountView(BRIDGE_STATS);
    const maxAttempts = () => wrapper.get('[data-testid="lbt-max-attempts"]').text();

    expect(maxAttempts()).toBe('1');

    await wrapper.get('[data-testid="radio-scope-link"]').trigger('click');
    await flushPromises();

    expect(maxAttempts()).toBe('6');
  });

  it('leaves the node-wide RF lines off a per-radio chart', async () => {
    // Traffic volume and SNR come from a node-wide series; beside one radio's
    // bars they would read as that radio's own.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;

    await mountView(BRIDGE_STATS);

    const charts = (
      Chart as unknown as { instances: Array<{ data: { datasets: Array<{ label?: string }> } }> }
    ).instances;
    const labels = charts.flatMap((chart) => chart.data.datasets.map((d) => d.label));
    // The LBT chart must have rendered, or the two assertions below prove nothing.
    expect(labels).toContain('Attempt 1');
    expect(labels).not.toContain('Traffic volume');
    expect(labels).not.toContain('Avg SNR (dB)');
  });

  it('shows nothing rather than combined figures for a radio the node does not report', async () => {
    // Combined figures are every radio's; under this radio's name they are a lie.
    mockedLbt.mockResolvedValue({
      success: true,
      data: { ...LBT_PAYLOAD, radios: [LBT_PAYLOAD.radios[0]] },
    } as never);

    const wrapper = await mountView(BRIDGE_STATS);
    await wrapper.get('[data-testid="radio-scope-link"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="lbt-radio-missing"]').text()).toContain('no transmissions');
    expect(wrapper.get('[data-testid="lbt-max-attempts"]').text()).toBe('0');
  });

  it('says which panels are still every radio own', async () => {
    // Packet type is recorded once per packet, and the RF series behind the
    // correlations is node-wide; neither can be split per radio.
    const wrapper = await mountView(BRIDGE_STATS);

    expect(wrapper.get('[data-testid="packet-type-scope"]').text()).toContain('Every radio');
    expect(wrapper.get('[data-testid="correlation-scope"]').text()).toContain('node-wide');
    expect(wrapper.get('[data-testid="details-scope"]').text()).toContain("every radio's traffic");
  });
});

describe('RF Health on a single-radio node', () => {
  it('shows no selector and filters nothing', async () => {
    // Its samples carry no radio id; a filter would return an empty page.
    const wrapper = await mountView(SINGLE_STATS);

    expect(wrapper.find('[data-testid="radio-scope"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="multi-radio-note"]').exists()).toBe(false);
    // Assert the requests happened first: `every` over nothing is true.
    expect(queriesFor('/noise_floor_history').length).toBeGreaterThan(0);
    expect(queriesFor('/crc_error_history').length).toBeGreaterThan(0);
    expect(queriesFor('/noise_floor_history').every((query) => !('radio_id' in query))).toBe(true);
    expect(queriesFor('/crc_error_history').every((query) => !('radio_id' in query))).toBe(true);
  });

  it('keeps the node-wide RF lines and every panel unlabelled', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;

    const wrapper = await mountView(SINGLE_STATS);

    const charts = (
      Chart as unknown as { instances: Array<{ data: { datasets: Array<{ label?: string }> } }> }
    ).instances;
    const labels = charts.flatMap((chart) => chart.data.datasets.map((d) => d.label));
    expect(labels).toContain('Traffic volume');
    expect(labels).toContain('Avg SNR (dB)');
    expect(wrapper.find('[data-testid="packet-type-scope"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="correlation-scope"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="details-scope"]').exists()).toBe(false);
  });
});
