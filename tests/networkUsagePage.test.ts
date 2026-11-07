import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import SystemStats from '@/views/SystemStats.vue';
import { usage } from './fixtures/networkUsage';

vi.mock('@/utils/api', () => ({ default: { getNetworkUsage: vi.fn(async () => usage()) } }));
// Leave existing hardware/chart behavior intact in production; no live hardware in this test.
vi.mock('@/composables/useManagedPolling', () => ({ useManagedPolling: vi.fn() }));
vi.mock('@/composables/useTheme', async () => {
  const { ref } = await import('vue');
  return { useTheme: () => ({ themeId: ref('light') }) };
});
vi.mock('plotly.js-dist-min', () => ({ default: { purge: vi.fn() } }));
afterEach(() => vi.restoreAllMocks());

describe('existing System Stats page usage integration', () => {
  it('keeps existing status content and mounts the working usage panel on the same page', async () => {
    const wrapper = mount(SystemStats, {
      global: { plugins: [createPinia()], stubs: { SparklineChart: true, ChartCard: true } },
    });
    try {
      await flushPromises();
      expect(wrapper.text()).toContain('System Statistics');
      expect(wrapper.text()).toContain('CPU Performance');
      expect(wrapper.text()).toContain('Network and MQTT usage');
      expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('3 KB');
      const headings = wrapper.findAll('h3').map((heading) => heading.text());
      expect(headings.indexOf('Network Statistics')).toBeLessThan(
        headings.indexOf('Network and MQTT usage'),
      );
      expect(headings.indexOf('Network and MQTT usage')).toBeLessThan(
        headings.indexOf('Top Processes'),
      );
    } finally {
      wrapper.unmount();
    }
  });
});
