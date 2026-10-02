import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Sensors from '@/views/Sensors.vue';

vi.mock('@/composables/useManagedPolling', () => ({ useManagedPolling: vi.fn() }));
vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: {
      sensors: {
        enabled: true,
        running: true,
        readings: [
          {
            name: 'modem',
            type: 'openhop_modem',
            ok: true,
            data: {
              password: 'private-value',
              signal: 42,
              current_ma: 150,
              voltage_mv: 3700,
              shunt_voltage_mv: 0.25,
              fine_shunt_voltage_mv: 0.125,
              power_mw: 450,
              current_a: 1.5,
              voltage_v: 3.7,
              power_w: 1.2,
              temperature_c: 21.4,
              humidity_percent: 48,
              battery_soc: 77,
              modem_load: 0.2,
            },
          },
        ],
      },
    },
    fetchStats: vi.fn(),
  }),
}));

describe('Sensors page', () => {
  it('uses explicit backend metric suffixes before semantic names', () => {
    const wrapper = mount(Sensors, { global: { stubs: { RouterLink: true } } });
    const metric = (key: string) => {
      const label = wrapper.findAll('p').find((p) => p.text() === key);
      expect(label).toBeDefined();
      return label!.element.parentElement!.querySelectorAll('p')[1].textContent;
    };
    expect(metric('current_ma')).toBe('150.0mA');
    expect(metric('voltage_mv')).toBe('3700mV');
    expect(metric('shunt_voltage_mv')).toBe('0.25mV');
    expect(metric('fine_shunt_voltage_mv')).toBe('0.125mV');
    expect(metric('power_mw')).toBe('450.0mW');
    expect(metric('current_a')).toBe('1.50A');
    expect(metric('voltage_v')).toBe('3.70V');
    expect(metric('power_w')).toBe('1.20W');
    expect(metric('temperature_c')).toBe('21.4°C');
    expect(metric('humidity_percent')).toBe('48.0%');
    expect(metric('battery_soc')).toBe('77%');
    expect(metric('modem_load')).toBe('200.0mA');
    wrapper.unmount();
  });
  it('never displays a sensor password in the metrics grid', () => {
    const wrapper = mount(Sensors, { global: { stubs: { RouterLink: true } } });
    expect(wrapper.text()).toContain('*****');
    expect(wrapper.text()).not.toContain('private-value');
    expect(wrapper.text()).toContain('42');
    wrapper.unmount();
  });
});
