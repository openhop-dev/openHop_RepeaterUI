import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/streamingFetch', () => ({
  streamingGet: vi.fn(),
}));

import { streamingGet } from '@/utils/streamingFetch';
import AirtimeUtilizationChart, {
  __resetAirtimeCache,
} from '@/components/charts/AirtimeUtilizationChart.vue';
import RadioAirtimePanel from '@/components/charts/RadioAirtimePanel.vue';
import { useSystemStore } from '@/stores/system';
import {
  bucketsToSamples,
  formatCodingRate,
  formatModulation,
  axisLabelDecimals,
  panelYAxisMax,
  profileSignature,
  peakUtilization,
  toRadioPanels,
  type AirtimeBucket,
  type SeriesGrid,
  type UtilSample,
} from '@/composables/useAirtimeSeries';

const mockedGet = vi.mocked(streamingGet);

const LOCAL_PROFILE = {
  frequency_hz: 869618000,
  bandwidth_hz: 62500,
  spreading_factor: 8,
  coding_rate: 8,
  preamble_length: 32,
};
const LINK_PROFILE = {
  frequency_hz: 864200000,
  bandwidth_hz: 62500,
  spreading_factor: 11,
  coding_rate: 8,
  preamble_length: 32,
};

const now = Math.floor(Date.now() / 1000);

/** Buckets at a known utilization, placed inside the 24 h window. */
function buckets(rxMs: number, txMs: number, count = 5): AirtimeBucket[] {
  const start = now - 3600;
  return Array.from({ length: count }, (_, i) => ({
    timestamp: (Math.floor(start / 60) + i) * 60,
    rx_ms: rxMs,
    tx_ms: txMs,
    rx_count: 1,
    tx_count: 1,
  }));
}

function respond(data: unknown) {
  mockedGet.mockResolvedValue({ success: true, data } as never);
}

function seedStats(stats: Record<string, unknown>) {
  const systemStore = useSystemStore();
  systemStore.stats = stats as never;
}

async function mountChart() {
  const wrapper = mount(AirtimeUtilizationChart);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  __resetAirtimeCache();
  mockedGet.mockReset();
  // jsdom canvases have no 2d context; drawing is exercised by hand below.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('airtime response normalization', () => {
  const grid: SeriesGrid = { startTime: now - 86400, bucketSeconds: 60, bucketCount: 1440 };

  it('synthesizes one panel from a legacy response with no radios field', () => {
    const panels = toRadioPanels(
      { bucket_seconds: 60, buckets: buckets(6000, 600), rx_total: 5, tx_total: 5 },
      grid,
      { radioId: 'radio0', profile: LOCAL_PROFILE },
    );

    expect(panels).toHaveLength(1);
    expect(panels[0].radioId).toBe('radio0');
    expect(panels[0].profile).toEqual(LOCAL_PROFILE);
    expect(panels[0].rxTotal).toBe(5);
    expect(panels[0].samples).toHaveLength(480); // 1440 one-minute buckets, step 3
  });

  it('uses the per-radio series when the backend sends one', () => {
    const panels = toRadioPanels(
      {
        bucket_seconds: 60,
        buckets: buckets(6000, 600),
        rx_total: 5,
        tx_total: 5,
        radios: [
          {
            radio_id: 'local',
            profile: LOCAL_PROFILE,
            buckets: buckets(6000, 600),
            rx_total: 5,
            tx_total: 5,
          },
        ],
      },
      grid,
      { radioId: 'radio0', profile: null },
    );

    expect(panels).toHaveLength(1);
    expect(panels[0].radioId).toBe('local');
  });

  it('keeps two radios apart, each with its own profile and totals', () => {
    const panels = toRadioPanels(
      {
        bucket_seconds: 60,
        buckets: [],
        rx_total: 0,
        tx_total: 0,
        radios: [
          {
            radio_id: 'local',
            profile: LOCAL_PROFILE,
            buckets: buckets(6000, 600),
            rx_total: 91,
            tx_total: 17,
          },
          {
            radio_id: 'link',
            profile: LINK_PROFILE,
            buckets: buckets(1200, 300),
            rx_total: 12,
            tx_total: 40,
          },
        ],
      },
      grid,
      { radioId: 'radio0', profile: null },
    );

    expect(panels.map((p) => p.radioId)).toEqual(['local', 'link']);
    expect(panels[0].profile?.spreading_factor).toBe(8);
    expect(panels[1].profile?.spreading_factor).toBe(11);
    expect(panels[0].rxTotal).toBe(91);
    expect(panels[1].txTotal).toBe(40);
    expect(panels[0].peakUtil).toBeGreaterThan(panels[1].peakUtil);
  });

  it('scales each panel to its own traffic', () => {
    // A 500 kHz radio and a 62.5 kHz radio carrying the same packets differ by
    // roughly an order of magnitude in airtime; one shared scale flattens the
    // faster radio onto the baseline.
    const busy = bucketsToSamples(buckets(30_000, 0, 1440), grid);
    const quiet = bucketsToSamples(buckets(480, 0, 1440), grid);

    expect(panelYAxisMax(busy)).toBeGreaterThan(panelYAxisMax(quiet));
    expect(panelYAxisMax(quiet)).toBeLessThan(5);
    // The quiet radio still uses most of its frame rather than hugging zero.
    expect(peakUtilization(quiet) / panelYAxisMax(quiet)).toBeGreaterThan(0.5);
  });

  it('picks axis maxima whose five gridlines label exactly', () => {
    for (const max of [1, 1.5, 2, 3, 4, 5, 7.5, 10, 20, 75]) {
      const decimals = axisLabelDecimals(max);
      for (let i = 0; i <= 5; i++) {
        const value = max - (i / 5) * max;
        expect(Number(value.toFixed(decimals))).toBeCloseTo(value, 6);
      }
    }
  });

  it('never zooms an idle radio in past 1% full scale', () => {
    expect(panelYAxisMax([])).toBe(1);
    expect(panelYAxisMax(bucketsToSamples([], grid))).toBe(1);
  });

  it('never fabricates a second radio from a legacy combined series', () => {
    const panels = toRadioPanels(
      { bucket_seconds: 60, buckets: buckets(6000, 600), rx_total: 5, tx_total: 5, radios: [] },
      grid,
      { radioId: 'radio0', profile: LOCAL_PROFILE },
    );
    expect(panels).toHaveLength(1);
  });
});

describe('profile formatting', () => {
  it('formats the modulation line the operator reads', () => {
    expect(formatModulation(LOCAL_PROFILE)).toBe('SF8 · 62.5 kHz · CR 4/8');
    expect(formatModulation(LINK_PROFILE)).toBe('SF11 · 62.5 kHz · CR 4/8');
    expect(formatModulation({ ...LOCAL_PROFILE, bandwidth_hz: 250000 })).toBe(
      'SF8 · 250 kHz · CR 4/8',
    );
  });

  it('reports an unreadable profile instead of guessing one', () => {
    expect(formatModulation({ ...LOCAL_PROFILE, spreading_factor: null })).toBeNull();
    expect(formatModulation(null)).toBeNull();
  });

  it('accepts both coding-rate representations', () => {
    expect(formatCodingRate(8)).toBe('CR 4/8');
    expect(formatCodingRate(4)).toBe('CR 4/8'); // legacy index form
  });

  it('changes the cache signature when a radio is retuned', () => {
    const before = profileSignature([{ radioId: 'link', profile: LINK_PROFILE }]);
    const after = profileSignature([
      { radioId: 'link', profile: { ...LINK_PROFILE, spreading_factor: 9 } },
    ]);
    expect(after).not.toBe(before);
  });
});

describe('AirtimeUtilizationChart', () => {
  it('renders one unlabelled panel for a legacy backend response', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'radio0', ...LOCAL_PROFILE }] });
    respond({ bucket_seconds: 60, buckets: buckets(6000, 600), rx_total: 5, tx_total: 5 });

    const wrapper = await mountChart();
    const panels = wrapper.findAllComponents(RadioAirtimePanel);

    expect(panels).toHaveLength(1);
    expect(panels[0].props('radioId')).toBeNull();
    expect(wrapper.text()).toContain('Total Received');
  });

  it('renders one panel per radio, labelled and each on its own scale', async () => {
    seedStats({
      radio_profiles: [
        { radio_id: 'local', ...LOCAL_PROFILE },
        { radio_id: 'link', ...LINK_PROFILE },
      ],
    });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 103,
      tx_total: 57,
      radios: [
        {
          radio_id: 'local',
          profile: LOCAL_PROFILE,
          buckets: buckets(30_000, 600),
          rx_total: 91,
          tx_total: 17,
        },
        {
          radio_id: 'link',
          profile: LINK_PROFILE,
          buckets: buckets(1200, 300),
          rx_total: 12,
          tx_total: 40,
        },
      ],
      unattributed_rx_count: 0,
      unattributed_tx_count: 0,
    });

    const wrapper = await mountChart();
    const panels = wrapper.findAllComponents(RadioAirtimePanel);

    expect(panels).toHaveLength(2);
    expect(panels[0].props('radioId')).toBe('local');
    expect(panels[0].props('frequency')).toBe('869.618 MHz');
    expect(panels[0].props('modulation')).toBe('SF8 · 62.5 kHz · CR 4/8');
    expect(panels[1].props('radioId')).toBe('link');
    expect(panels[1].props('modulation')).toBe('SF11 · 62.5 kHz · CR 4/8');
    // Each panel scales to itself: the quieter link radio is not flattened.
    expect(panels[1].props('yAxisMax')).toBeLessThan(panels[0].props('yAxisMax'));

    // Per-radio counters replace the node-wide ones, and no combined percentage.
    expect(wrapper.text()).toContain('91');
    expect(wrapper.text()).toContain('40');
    expect(wrapper.text()).not.toContain('Total Received');
  });

  it('lays the two panels out in columns that collapse on narrow screens', async () => {
    seedStats({
      radio_profiles: [
        { radio_id: 'local', ...LOCAL_PROFILE },
        { radio_id: 'link', ...LINK_PROFILE },
      ],
    });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 0,
      tx_total: 0,
      radios: [
        { radio_id: 'local', profile: LOCAL_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
        { radio_id: 'link', profile: LINK_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
      ],
    });

    const wrapper = await mountChart();
    const grid = wrapper.findAll('div').find((d) => d.classes().includes('grid'));

    expect(grid?.classes()).toContain('grid-cols-1');
    expect(grid?.classes()).toContain('xl:grid-cols-2');
  });

  it('says which radio was idle rather than blanking its frame', async () => {
    seedStats({
      radio_profiles: [
        { radio_id: 'local', ...LOCAL_PROFILE },
        { radio_id: 'link', ...LINK_PROFILE },
      ],
    });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 91,
      tx_total: 17,
      radios: [
        {
          radio_id: 'local',
          profile: LOCAL_PROFILE,
          buckets: buckets(6000, 600),
          rx_total: 91,
          tx_total: 17,
        },
        { radio_id: 'link', profile: LINK_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
      ],
    });

    const wrapper = await mountChart();

    expect(wrapper.text()).toContain('No activity on this radio in the last 24 hours.');
  });

  it('names a radio whose profile could not be read instead of charting defaults', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE }] });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 0,
      tx_total: 0,
      radios: [
        { radio_id: 'local', profile: LOCAL_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
        {
          radio_id: 'link',
          profile: { ...LINK_PROFILE, spreading_factor: null },
          buckets: [],
          rx_total: 3,
          tx_total: 0,
        },
      ],
    });

    const wrapper = await mountChart();

    expect(wrapper.text()).toContain('Radio airtime profile unavailable');
  });

  it('reports history that predates per-radio attribution as unattributed', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE }] });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 12,
      tx_total: 4,
      radios: [
        { radio_id: 'local', profile: LOCAL_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
        { radio_id: 'link', profile: LINK_PROFILE, buckets: [], rx_total: 0, tx_total: 0 },
      ],
      unattributed_rx_count: 12,
      unattributed_tx_count: 4,
    });

    const wrapper = await mountChart();

    expect(wrapper.text()).toContain('predate per-radio attribution');
  });

  it('shows the loading state before the first response arrives', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE }] });
    let release: (value: unknown) => void = () => {};
    mockedGet.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );

    const wrapper = mount(AirtimeUtilizationChart);
    await flushPromises();

    expect(wrapper.findComponent(RadioAirtimePanel).props('isLoading')).toBe(true);

    release({ success: true, data: { bucket_seconds: 60, buckets: [], rx_total: 0, tx_total: 0 } });
    await flushPromises();

    expect(wrapper.findComponent(RadioAirtimePanel).props('isLoading')).toBe(false);
  });

  it('surfaces a failed request with a retry that refetches', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE }] });
    mockedGet.mockResolvedValueOnce({ success: false, error: 'Stream stalled' } as never);

    const wrapper = await mountChart();
    const panel = wrapper.findComponent(RadioAirtimePanel);
    expect(panel.props('error')).toBe('Stream stalled');

    respond({ bucket_seconds: 60, buckets: buckets(6000, 600), rx_total: 5, tx_total: 5 });
    await panel.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.findComponent(RadioAirtimePanel).props('error')).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('refetches when a radio profile changed, rather than serving the cache', async () => {
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE }] });
    respond({
      bucket_seconds: 60,
      buckets: [],
      rx_total: 0,
      tx_total: 0,
      radios: [
        {
          radio_id: 'local',
          profile: LOCAL_PROFILE,
          buckets: buckets(6000, 600),
          rx_total: 5,
          tx_total: 1,
        },
      ],
    });

    const first = await mountChart();
    first.unmount();
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // Same config: the cache is still valid, so no second request.
    await mountChart();
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // Retuned radio: the cached series was computed at the old SF.
    seedStats({ radio_profiles: [{ radio_id: 'local', ...LOCAL_PROFILE, spreading_factor: 10 }] });
    await mountChart();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

describe('RadioAirtimePanel', () => {
  const samples = bucketsToSamples(buckets(6000, 600, 30), {
    startTime: now - 3600,
    bucketSeconds: 60,
    bucketCount: 60,
  });

  it('gives each canvas a radio-specific accessible name and summary', () => {
    const wrapper = mount(RadioAirtimePanel, {
      props: {
        radioId: 'link',
        frequency: '864.200 MHz',
        modulation: 'SF11 · 62.5 kHz · CR 4/8',
        samples,
        yAxisMax: 30,
        isLoading: false,
        summary: 'Radio link, SF11 · 62.5 kHz · CR 4/8. 12 received, 40 transmitted.',
      },
    });

    const canvas = wrapper.find('canvas');
    expect(canvas.attributes('role')).toBe('img');
    expect(canvas.attributes('aria-label')).toBe('Airtime utilization for radio link');
    expect(wrapper.find('.sr-only').text()).toContain('12 received, 40 transmitted');
    expect(wrapper.text()).toContain('link · 864.200 MHz');
  });

  it('omits the heading for a single-radio node so its card is unchanged', () => {
    const wrapper = mount(RadioAirtimePanel, {
      props: { samples, yAxisMax: 30, isLoading: false },
    });

    expect(wrapper.find('h4').exists()).toBe(false);
    expect(wrapper.find('canvas').attributes('aria-label')).toBe(
      'Airtime utilization over the last 24 hours',
    );
  });

  it('keeps the retry control at the 44px mobile tap-target minimum', () => {
    const wrapper = mount(RadioAirtimePanel, {
      props: { samples: [], yAxisMax: 30, isLoading: false, error: 'Stream stalled' },
    });

    const retry = wrapper.find('button');
    expect(retry.exists()).toBe(true);
    expect(retry.classes()).toContain('btn-secondary');
    expect(retry.classes()).toContain('min-h-11'); // 44px minimum
  });
});

describe('bucket grid alignment', () => {
  it('indexes a server bucket into the slot that carries its own timestamp', () => {
    // The server floors bucket timestamps to a multiple of bucket_seconds, so
    // the client grid has to start on the same boundary or everything lands a
    // slot early and the first partial bucket falls off the front.
    const endTime = 1_700_000_037; // deliberately not a minute boundary
    const startTime = Math.floor((endTime - 86400) / 60) * 60;
    const grid: SeriesGrid = { startTime, bucketSeconds: 60, bucketCount: 1441 };
    const first = { timestamp: startTime, rx_ms: 30_000, tx_ms: 0, rx_count: 1, tx_count: 0 };
    const last = {
      timestamp: startTime + 1440 * 60,
      rx_ms: 6_000,
      tx_ms: 0,
      rx_count: 1,
      tx_count: 0,
    };

    const samples = bucketsToSamples([first, last], grid);

    expect(samples[0].timestamp).toBe(first.timestamp);
    expect(samples[0].rxUtil).toBeCloseTo(50);
    expect(samples[1440].timestamp).toBe(last.timestamp);
    expect(samples[1440].rxUtil).toBeCloseTo(10);
  });
});

describe('RadioAirtimePanel crosshair', () => {
  const CANVAS_W = 500;
  const CANVAS_H = 200;
  const LEFT_MARGIN = 45; // must match the panel's plot geometry
  const PADDING = 20;
  const CHART_W = CANVAS_W - LEFT_MARGIN - PADDING;

  const readout: UtilSample[] = [
    { timestamp: 1_700_000_000, rxUtil: 1.5, txUtil: 0.25 },
    { timestamp: 1_700_000_060, rxUtil: 4, txUtil: 0.5 },
    { timestamp: 1_700_000_120, rxUtil: 12.75, txUtil: 3.5 },
    { timestamp: 1_700_000_180, rxUtil: 8, txUtil: 1 },
    { timestamp: 1_700_000_240, rxUtil: 2, txUtil: 0.125 },
  ];

  const clockLabel = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  /** jsdom has no canvas; record-nothing context plus fixed element bounds. */
  function stubCanvasGeometry() {
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: () => vi.fn(),
      set: () => true,
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          right: CANVAS_W,
          bottom: CANVAS_H,
          width: CANVAS_W,
          height: CANVAS_H,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    ) as never;
  }

  async function mountPanel(props: Record<string, unknown> = {}) {
    stubCanvasGeometry();
    const wrapper = mount(RadioAirtimePanel, {
      props: {
        radioId: 'link',
        samples: readout,
        yAxisMax: 15,
        isLoading: false,
        ...props,
      },
      attachTo: document.body,
    });
    (wrapper.vm as unknown as { drawChart: () => void }).drawChart();
    await flushPromises();
    return wrapper;
  }

  /** clientX that lands on `index`, given the plot's left margin and width. */
  const xForIndex = (index: number) => LEFT_MARGIN + (CHART_W * index) / (readout.length - 1);

  function tooltip() {
    return document.body.querySelector('[style*="position: fixed"]');
  }

  /** vue-test-utils cannot set clientX on a synthesised pointer event. */
  async function pointerMove(wrapper: VueWrapper, clientX: number, clientY = 100) {
    wrapper
      .find('canvas')
      .element.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }));
    await flushPromises();
  }

  async function pointerLeave(wrapper: VueWrapper) {
    wrapper.find('canvas').element.dispatchEvent(new MouseEvent('pointerleave'));
    await flushPromises();
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads out the time, RX and TX of the sample under the pointer', async () => {
    const wrapper = await mountPanel();

    await pointerMove(wrapper, xForIndex(2));

    const text = tooltip()?.textContent ?? '';
    expect(text).toContain(clockLabel(readout[2].timestamp));
    expect(text).toContain('Rx 12.75%');
    expect(text).toContain('Tx 3.50%');
    expect(text).toContain('link'); // which panel the readout belongs to
  });

  it('snaps to the nearest sample across the plot', async () => {
    const wrapper = await mountPanel();

    await pointerMove(wrapper, xForIndex(0));
    expect(tooltip()?.textContent).toContain('Rx 1.50%');

    await pointerMove(wrapper, xForIndex(4));
    expect(tooltip()?.textContent).toContain('Rx 2.00%');

    // Past the right edge of the plot, still the last sample rather than none.
    await pointerMove(wrapper, CANVAS_W + 50);
    expect(tooltip()?.textContent).toContain('Rx 2.00%');
  });

  it('ignores touch, which has no hover to close the readout with', async () => {
    const wrapper = await mountPanel();

    wrapper.find('canvas').element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: xForIndex(2),
        clientY: 100,
        bubbles: true,
        pointerType: 'touch',
      }),
    );
    await flushPromises();

    expect(tooltip()).toBeNull();
  });

  it('clears the readout when the pointer leaves', async () => {
    const wrapper = await mountPanel();

    await pointerMove(wrapper, xForIndex(1));
    expect(tooltip()).not.toBeNull();

    await pointerLeave(wrapper);
    expect(tooltip()).toBeNull();
  });

  it('stays inert while loading, on error, and with nothing to read', async () => {
    for (const props of [
      { isLoading: true },
      { error: 'Stream stalled' },
      { samples: [readout[0]] },
    ]) {
      const wrapper = await mountPanel(props);
      await pointerMove(wrapper, xForIndex(2));
      expect(tooltip()).toBeNull();
      expect(wrapper.find('canvas').classes()).not.toContain('cursor-crosshair');
      wrapper.unmount();
    }
  });
});
