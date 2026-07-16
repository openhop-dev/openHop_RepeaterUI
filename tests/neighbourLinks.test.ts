import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import { navigationItems } from '@/config/navigation';

vi.mock('chart.js', () => {
  class FakeChart {
    static register = vi.fn();
    data: { datasets: unknown[] };

    constructor() {
      this.data = { datasets: [] };
    }

    update = vi.fn();
    destroy = vi.fn();
  }

  return {
    Chart: FakeChart,
    ChartJS: FakeChart,
    LinearScale: {},
    PointElement: {},
    LineElement: {},
    LineController: {},
    ScatterController: {},
    TimeScale: {},
    Tooltip: {},
    Legend: {},
    Title: {},
  };
});

vi.mock('chartjs-adapter-date-fns', () => ({}));

vi.mock('@/utils/api', () => ({
  default: {
    getNeighborLinks: vi.fn(),
    getNeighborLinkHistory: vi.fn(),
  },
}));

import ApiService from '@/utils/api';
import NeighbourLinks from '@/views/NeighbourLinks.vue';

const LIVE_LINKS_RESPONSE = {
  success: true,
  data: {
    links: [
      {
        peer_hash: 'AB12',
        path_hash_size: 2,
        sample_count: 10,
        duplicate_sample_count: 3,
        first_seen: 1_700_000_000,
        last_seen: 1_700_000_300,
        age_seconds: 10,
        active: true,
        last_rssi: -91,
        last_snr: 8,
        last_score: 0.92,
        ewma_rssi: -89,
        ewma_snr: 7.5,
        ewma_score: 0.86,
        best_score: 0.96,
        worst_score: 0.6,
      },
      {
        peer_hash: 'ZZ99',
        path_hash_size: 2,
        sample_count: 8,
        duplicate_sample_count: 5,
        first_seen: 1_700_000_020,
        last_seen: 1_700_000_120,
        age_seconds: 120,
        active: false,
        last_rssi: -110,
        last_snr: -1,
        last_score: 0.54,
        ewma_rssi: -107,
        ewma_snr: -0.2,
        ewma_score: 0.51,
        best_score: 0.6,
        worst_score: 0.22,
      },
    ],
    active_within_seconds: 90,
    count: 2,
  },
};

const HISTORY_RESPONSE = {
  success: true,
  data: {
    peer_hash: 'AB12',
    path_hash_size: 2,
    hours: 24,
    limit: 1000,
    rows: [
      { timestamp: 1_700_000_050, rssi: -93, snr: 7.1, score: 0.8, is_duplicate: false, packet_hash: 'h1', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_070, rssi: -94, snr: 7.2, score: 0.81, is_duplicate: false, packet_hash: 'h2', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_090, rssi: -95, snr: 7.2, score: 0.8, is_duplicate: true, packet_hash: 'h3', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_110, rssi: -92, snr: 7.1, score: 0.79, is_duplicate: false, packet_hash: 'h4', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_130, rssi: -93, snr: 7.0, score: 0.82, is_duplicate: false, packet_hash: 'h5', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_150, rssi: -94, snr: 7.2, score: 0.8, is_duplicate: true, packet_hash: 'h6', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_170, rssi: -93, snr: 7.3, score: 0.79, is_duplicate: false, packet_hash: 'h7', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_190, rssi: -95, snr: 7.1, score: 0.8, is_duplicate: false, packet_hash: 'h8', packet_type: 1, route_type: 2, path_hop_count: 1 },
      { timestamp: 1_700_000_210, rssi: -94, snr: 7.0, score: 0.81, is_duplicate: false, packet_hash: 'h9', packet_type: 1, route_type: 2, path_hop_count: 1 },
    ],
    count: 9,
  },
};

function makeHistoryResponse(scores: number[], duplicateEvery = 0) {
  return {
    success: true,
    data: {
      peer_hash: 'AB12',
      path_hash_size: 2,
      hours: 24,
      limit: 1000,
      rows: scores.map((score, idx) => ({
        timestamp: 1_700_000_050 + idx * 20,
        rssi: -95 + (idx % 3),
        snr: 7 + ((idx % 4) * 0.1),
        score,
        is_duplicate: duplicateEvery > 0 ? idx % duplicateEvery === 0 : false,
        packet_hash: `h${idx + 1}`,
        packet_type: 1,
        route_type: 2,
        path_hop_count: 1,
      })),
      count: scores.length,
    },
  } as any;
}

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const appRuntime = useAppRuntimeStore();
  appRuntime.markAuthenticated();

  return mount(NeighbourLinks, {
    global: {
      plugins: [pinia],
      stubs: {
        ChartCard: {
          props: ['isLoading', 'isUpdating', 'error'],
          template: '<div><slot /></div>',
        },
      },
    },
  });
}

describe('Neighbour Links analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue(LIVE_LINKS_RESPONSE as any);
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(HISTORY_RESPONSE as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adds Neighbour Links under analytics navigation', () => {
    const analytics = navigationItems.find((item) => item.id === 'analytics');
    const child = analytics?.children?.find((item) => item.id === 'neighbor-links');

    expect(child?.label).toBe('Neighbour Links');
    expect(child?.route).toBe('/neighbor-links');
  });

  it('loads and displays KPI values', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="kpi-total-links"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="kpi-active-links"]').text()).toBe('1');
    expect(wrapper.get('[data-testid="kpi-avg-score"]').text()).toBe('0.69');
    expect(wrapper.get('[data-testid="kpi-duplicate-ratio"]').text()).toBe('44.4%');
    expect(wrapper.text()).toContain('Avg EWMA RX Score');
    expect(wrapper.text()).toContain('Duplicate Observation Ratio');
  });

  it('uses RX score terminology in table, KPI and charts', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('EWMA RX Score');
    expect(wrapper.text()).toContain('RX Score History');
    expect(wrapper.text()).toContain('RX Observation Variability');
  });

  it('filters by status and search', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="link-row"]').length).toBe(2);

    await wrapper.get('[data-testid="status-filter"]').setValue('active');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="link-row"]').length).toBe(1);
    expect(wrapper.text()).toContain('AB12');

    await wrapper.get('[data-testid="status-filter"]').setValue('all');
    await wrapper.get('[data-testid="search-input"]').setValue('zz99');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="link-row"]').length).toBe(1);
    expect(wrapper.text()).toContain('ZZ99');
  });

  it('filters by path hash size', async () => {
    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue({
      success: true,
      data: {
        links: [
          {
            ...LIVE_LINKS_RESPONSE.data.links[0],
            path_hash_size: 1,
          },
          {
            ...LIVE_LINKS_RESPONSE.data.links[1],
            path_hash_size: 3,
          },
        ],
        active_within_seconds: 90,
        count: 2,
      },
    } as any);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="link-row"]').length).toBe(2);
    await wrapper.get('[data-testid="path-size-filter"]').setValue('1');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="link-row"]').length).toBe(1);
    expect(wrapper.find('[data-testid="link-row"]').text()).toContain('1');
  });

  it('shows RX score details in modal popup', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(document.body.querySelector('[data-testid="rx-score-info-modal"]')).toBeNull();

    await wrapper.get('[data-testid="rx-score-info-button"]').trigger('click');
    await flushPromises();

    const modal = document.body.querySelector('[data-testid="rx-score-info-modal"]');
    expect(modal).not.toBeNull();
    const modalText = modal?.textContent ?? '';
    expect(modalText).toContain('Neighbour Link Analytics');
    expect(modalText).toContain('RX score is calculated by the shared Core reception metric using SNR, spreading factor and complete received frame length.');
  });

  it('supports sorting by sample count', async () => {
    const wrapper = mountView();
    await flushPromises();

    const initialFirst = wrapper.findAll('[data-testid="link-row"]')[0].text();
    expect(initialFirst).toContain('AB12');

    const sortButtons = wrapper.findAll('th button');
    const sampleSortButton = sortButtons.find((button) => button.text() === 'Samples');
    await sampleSortButton?.trigger('click');
    await flushPromises();

    const firstAfter = wrapper.findAll('[data-testid="link-row"]')[0].text();
    expect(firstAfter).toContain('AB12');

    await sampleSortButton?.trigger('click');
    await flushPromises();

    const firstAfterSecondClick = wrapper.findAll('[data-testid="link-row"]')[0].text();
    expect(firstAfterSecondClick).toContain('ZZ99');
  });

  it('keeps selected row and reloads history when range changes', async () => {
    const wrapper = mountView();
    await flushPromises();

    const secondRow = wrapper.findAll('[data-testid="link-row"]')[1];
    await secondRow.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="selected-peer"]').text()).toBe('ZZ99');

    await wrapper.get('[data-testid="hours-select"]').setValue('48');
    await flushPromises();

    expect(ApiService.getNeighborLinkHistory).toHaveBeenCalled();
    const calls = vi.mocked(ApiService.getNeighborLinkHistory).mock.calls;
    const latest = calls[calls.length - 1]?.[0] as any;
    expect(latest.peer_hash).toBe('ZZ99');
    expect(latest.hours).toBe(48);
    expect(wrapper.get('[data-testid="selected-peer"]').text()).toBe('ZZ99');
  });

  it('shows latest and ewma RX score in selected summary', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="selected-latest-rx-score"]').text()).toBe('0.92');
    expect(wrapper.get('[data-testid="selected-ewma-rx-score"]').text()).toBe('0.86');
  });

  it('shows empty state when no links are returned', async () => {
    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue({
      success: true,
      data: { links: [], active_within_seconds: 90, count: 0 },
    } as any);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="page-empty"]').text()).toContain('No neighbour links');
  });

  it('shows link loading error state', async () => {
    vi.mocked(ApiService.getNeighborLinks).mockRejectedValue(new Error('backend unavailable'));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('No neighbour links have been observed yet');
  });

  it('preserves selected peer during background polling refresh', async () => {
    const wrapper = mountView();
    await flushPromises();

    const secondRow = wrapper.findAll('[data-testid="link-row"]')[1];
    await secondRow.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="selected-peer"]').text()).toBe('ZZ99');

    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue({
      success: true,
      data: {
        links: [
          {
            ...LIVE_LINKS_RESPONSE.data.links[0],
            sample_count: 22,
          },
          {
            ...LIVE_LINKS_RESPONSE.data.links[1],
            sample_count: 18,
            last_seen: LIVE_LINKS_RESPONSE.data.links[1].last_seen + 30,
          },
        ],
        active_within_seconds: 90,
        count: 2,
      },
    } as any);

    await vi.advanceTimersByTimeAsync(5_500);
    await flushPromises();

    expect(ApiService.getNeighborLinks).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="selected-peer"]').text()).toBe('ZZ99');
  });

  it('classifies as insufficient data when fewer than 8 score samples exist', async () => {
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(makeHistoryResponse([0.41, 0.42, 0.43, 0.44, 0.43, 0.42, 0.41]));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Insufficient data');
  });

  it('classifies as low variation when std dev is below 0.10', async () => {
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(makeHistoryResponse([0.79, 0.8, 0.81, 0.8, 0.79, 0.8, 0.81, 0.8, 0.79]));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Low variation');
  });

  it('classifies as moderate variation when std dev is from 0.10 to below 0.18', async () => {
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(makeHistoryResponse([0.3, 0.45, 0.58, 0.62, 0.66, 0.52, 0.49, 0.37, 0.55]));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Moderate variation');
  });

  it('classifies as high variation when std dev is 0.18 or more', async () => {
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(makeHistoryResponse([0.05, 0.2, 0.85, 0.9, 0.12, 0.7, 0.95, 0.1, 0.82]));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('High variation');
  });

  it('keeps duplicate ratio separate from variability classification', async () => {
    vi.mocked(ApiService.getNeighborLinkHistory).mockResolvedValue(makeHistoryResponse([0.79, 0.8, 0.81, 0.8, 0.79, 0.8, 0.81, 0.8, 0.79], 1));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="stability-status"]').text()).toBe('Low variation');
    expect(wrapper.get('[data-testid="stability-panel"]').text()).toContain('Duplicate observation ratio');
  });

  it('does not include old noisy-link diagnostics and uses neutral variability disclaimer', async () => {
    const wrapper = mountView();
    await flushPromises();

    const text = wrapper.text().toLowerCase();
    expect(text).not.toContain('noisy link');
    expect(text).toContain('rx-score variability is observational and does not by itself identify congestion, fading or routing quality.');
  });

  it('keeps peer plus path hash width records separate', async () => {
    vi.mocked(ApiService.getNeighborLinks).mockResolvedValue({
      success: true,
      data: {
        links: [
          {
            ...LIVE_LINKS_RESPONSE.data.links[0],
            peer_hash: '9A',
            path_hash_size: 1,
          },
          {
            ...LIVE_LINKS_RESPONSE.data.links[0],
            peer_hash: '9A',
            path_hash_size: 3,
            last_seen: LIVE_LINKS_RESPONSE.data.links[0].last_seen + 5,
          },
        ],
        active_within_seconds: 90,
        count: 2,
      },
    } as any);

    const wrapper = mountView();
    await flushPromises();

    const rows = wrapper.findAll('[data-testid="link-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('9A');
    expect(rows[1].text()).toContain('9A');
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('3');
  });

  it('uses API score fields directly and does not implement score/delay formulas in the view', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="selected-latest-rx-score"]').text()).toBe('0.92');
    expect(wrapper.get('[data-testid="selected-ewma-rx-score"]').text()).toBe('0.86');

    const source = readFileSync(join(process.cwd(), 'src/views/NeighbourLinks.vue'), 'utf-8');
    expect(source).not.toContain('flood_rx_metrics');
    expect(source).not.toContain('packet_score');
    expect(source).not.toContain('rx_delay_base');
  });

  it('retains core layout and responsive classes', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.get('[data-testid="neighbour-links-page"]').classes()).toContain('space-y-5');
    expect(wrapper.text()).toContain('RX Score and Duplicate Observations');
    expect(wrapper.text()).toContain('RSSI (dBm)');
    expect(wrapper.text()).toContain('SNR (dB)');
  });
});
