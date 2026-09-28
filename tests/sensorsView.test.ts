import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';

const state = reactive<{ stats: { sensors: { readings: Array<Record<string, unknown>> } } }>({
  stats: { sensors: { readings: [] } },
});
vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    get stats() {
      return state.stats;
    },
    fetchStats: vi.fn(async () => {}),
  }),
}));
vi.mock('@/composables/useManagedPolling', () => ({ useManagedPolling: vi.fn() }));

import Sensors from '@/views/Sensors.vue';

const metric = (id: string, category: string, label: string, unit: string | null = null) => ({
  id,
  source_path: id,
  data_key: `modem:${id}`,
  label,
  unit,
  kind: 'number',
  category,
  available: true,
});
const modem = (name: string, data: Record<string, unknown>, metrics: unknown[]) => ({
  name,
  type: 'openhop_modem',
  ok: true,
  timestamp: '2026-09-28T12:00:00Z',
  data,
  metrics,
});
const mounted: VueWrapper[] = [];
function render(readings: Array<Record<string, unknown>>) {
  state.stats = { sensors: { readings } };
  const wrapper = mount(Sensors, { global: { stubs: ['router-link'] } });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount());
  mounted.length = 0;
});

describe('Sensors view metric descriptors', () => {
  it('groups descriptor metrics separately, uses units and labels, and keeps legacy keys visible', () => {
    const wrapper = render([
      modem(
        'G3',
        {
          temperature_c: 45,
          'modem:/environment/temperature_c': 23.5,
          'modem:/radio/agc_reset_count': 0,
          'modem:/radio/agc_reset_interval_sec': 0,
          'modem:/environment/available': false,
          'modem:/environment/pressure_hpa': null,
        },
        [
          metric('/environment/temperature_c', 'measurement', 'Environmental temperature', '°C'),
          metric('/radio/agc_reset_count', 'diagnostic', 'AGC resets'),
          metric('/radio/agc_reset_interval_sec', 'configuration', 'AGC reset interval', 's'),
          {
            ...metric('/environment/available', 'status', 'Environment available'),
            kind: 'boolean',
          },
          {
            ...metric('/environment/pressure_hpa', 'measurement', 'Station pressure', 'hPa'),
            available: false,
            reason: 'null',
          },
        ],
      ),
    ]);
    expect(wrapper.text()).toContain('Measurements');
    expect(wrapper.text()).toContain('Diagnostics');
    expect(wrapper.text()).toContain('Configuration');
    expect(wrapper.text()).toContain('Status');
    expect(wrapper.text()).toContain('Legacy values');
    expect(wrapper.text()).toContain('Environmental temperature');
    expect(wrapper.text()).toContain('23.5 °C');
    expect(wrapper.text()).toContain('0 s');
    expect(wrapper.text()).toContain('false');
    expect(wrapper.text()).toContain('n/a');
    expect(wrapper.text()).toContain('temperature_c');
    expect(wrapper.text()).toContain('45.0°C');
  });

  it('reacts to availability transitions and isolates two modem instances', async () => {
    const descriptor = metric('/environment/new_charge_count', 'measurement', 'New charge count');
    const first = modem('Alpha', { 'modem:/environment/new_charge_count': null }, [
      { ...descriptor, available: false },
    ]);
    const second = modem('Beta', { 'modem:/environment/new_charge_count': 0 }, [descriptor]);
    const wrapper = render([first, second]);
    const cards = () => wrapper.findAll('[data-testid="sensor-reading"]');
    expect(cards()).toHaveLength(2);
    expect(cards()[0].text()).toContain('n/a');
    expect(cards()[1].text()).toContain('0');
    expect(cards()[1].text()).not.toContain('%');
    state.stats = {
      sensors: {
        readings: [
          modem('Alpha', { 'modem:/environment/new_charge_count': 7 }, [descriptor]),
          second,
        ],
      },
    };
    await nextTick();
    expect(cards()[0].text()).toContain('7');
    state.stats = { sensors: { readings: [first, second] } };
    await nextTick();
    expect(cards()[0].text()).toContain('n/a');
  });

  it('escapes remote labels and displays a responsive grid for many metrics', () => {
    const readings = Array.from({ length: 32 }, (_, i) =>
      metric(`/environment/value_${i}`, 'measurement', `Value ${i}`),
    );
    readings[0].label = '<img src=x onerror=alert(1)>';
    const data = Object.fromEntries(readings.map((m, i) => [m.data_key, i]));
    const wrapper = render([modem('Alpha', data, readings)]);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.html()).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(wrapper.findAll('[data-testid="sensor-metric"]')).toHaveLength(32);
    expect(wrapper.find('[data-testid="metric-grid"]').classes()).toContain('grid-cols-2');
    expect(wrapper.find('[data-testid="metric-grid"]').classes()).toContain('sm:grid-cols-3');
  });

  it('keeps the old backend grid and hardware_stats flattening without descriptors', () => {
    const wrapper = render([
      { name: 'Old modem', type: 'openhop_modem', ok: true, data: { die_temperature_c: 39 } },
      {
        name: 'Host',
        type: 'hardware_stats',
        ok: true,
        data: { cpu: { usage_percent: 0, count: 4 } },
      },
    ]);
    expect(wrapper.text()).toContain('39.0°C');
    expect(wrapper.text()).toContain('cpu_usage');
    expect(wrapper.text()).toContain('0.0%');
  });
});
