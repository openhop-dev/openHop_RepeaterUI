import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import NetworkUsageCard from '@/components/ui/NetworkUsageCard.vue';
import { useDataService } from '@/stores/dataService';
import ApiService from '@/utils/api';
import { usage } from './fixtures/networkUsage';
import type { NetworkUsage } from '@/utils/networkUsage';

vi.mock('@/utils/api', () => ({ default: { getNetworkUsage: vi.fn() } }));
let wrapper: VueWrapper;
beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.mocked(ApiService.getNetworkUsage)
    .mockReset()
    .mockImplementation(async (days) => usage(days));
});
afterEach(() => {
  wrapper?.unmount();
  useDataService().reset();
  vi.useRealTimers();
});
const render = () => (wrapper = mount(NetworkUsageCard));

describe('usage card', () => {
  it('shows loading then explicit interface selection and all brokers combined', async () => {
    render();
    expect(wrapper.text()).toContain('Loading usage');
    await flushPromises();
    expect(wrapper.find('[data-testid="interface-totals"]').exists()).toBe(false);
    await wrapper.get('select[aria-label="Network interface"]').setValue('net:eth0');
    expect(wrapper.get('[data-testid="interface-totals"]').text()).toContain('1.5 KB');
    expect(wrapper.get('[data-testid="interface-totals"]').text()).toContain('2 MB');
    expect(wrapper.get('[data-testid="interface-total"]').text()).toContain('Combined');
    expect(wrapper.get('[data-testid="interface-total"]').text()).toContain('2 MB');
    expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('3 KB');
    expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('5 messages');
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');
    expect(wrapper.text()).toContain('accepted locally');
    expect(wrapper.text()).toContain('not broker receipt');
  });
  it('switches actual rolling windows, dates and interfaces, retaining choices on poll and remount', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockImplementation(async (days) => ({
      ...usage(days),
      start: days === 7 ? 1699481640 : 1700000040,
      interfaces: [
        ...usage().interfaces,
        {
          source: 'net:vpn',
          name: 'vpn0',
          upload_bytes: 3000000000,
          download_bytes: 0,
          messages: 0,
        },
      ],
    }));
    render();
    await flushPromises();
    await wrapper.get('select[aria-label="Network interface"]').setValue('net:vpn');
    await wrapper.get('select[aria-label="Usage window"]').setValue('7');
    await flushPromises();
    expect(ApiService.getNetworkUsage).toHaveBeenLastCalledWith(7);
    expect(wrapper.get('[data-testid="usage-window"]').text()).toContain(
      new Date(1699481640 * 1000).toLocaleString(),
    );
    expect(wrapper.get('[data-testid="interface-totals"]').text()).toContain('3 GB');
    expect(wrapper.get('[data-testid="interface-totals"]').text()).toContain('0 B');
    await vi.advanceTimersByTimeAsync(60000);
    expect(
      (wrapper.get('select[aria-label="Network interface"]').element as HTMLSelectElement).value,
    ).toBe('net:vpn');
    wrapper.unmount();
    render();
    await flushPromises();
    expect(
      (wrapper.get('select[aria-label="Usage window"]').element as HTMLSelectElement).value,
    ).toBe('7');
    expect(wrapper.get('[data-testid="interface-totals"]').text()).toContain('3 GB');
    const calls = vi.mocked(ApiService.getNetworkUsage).mock.calls.length;
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(120000);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(calls);
  });
  it('does not display another window while its selected request is pending', async () => {
    let resolve!: (data: NetworkUsage) => void;
    render();
    await flushPromises();
    vi.mocked(ApiService.getNetworkUsage).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await wrapper.get('select[aria-label="Usage window"]').setValue('2');
    expect(wrapper.text()).toContain('Loading usage');
    expect(wrapper.find('[data-testid="mqtt-total"]').exists()).toBe(false);
    resolve(usage(2));
    await flushPromises();
    expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('3 KB');
  });
  it('shows errors without invented zero totals and supports retry', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockRejectedValueOnce(new Error('offline'));
    render();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('offline');
    expect(wrapper.find('[data-testid="mqtt-total"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('3 KB');
    vi.mocked(ApiService.getNetworkUsage).mockRejectedValueOnce(new Error('offline again'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(wrapper.text()).toContain('Last successful snapshot');
    expect(wrapper.get('[data-testid="mqtt-total"]').text()).toContain('3 KB');
  });
  it('shows no history, partial coverage, container scope and collector failures honestly', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockResolvedValueOnce({
      ...usage(),
      available_since: null,
      interfaces: [],
      mqtt: { brokers: [], upload_bytes: 0, messages: 0 },
      partial: true,
      scope: 'container',
      collection: { running: false, last_sample: null, error: 'disk unavailable' },
    });
    render();
    await flushPromises();
    expect(wrapper.text()).toContain('No usage history');
    expect(wrapper.text()).toContain('Partial history');
    expect(wrapper.text()).toContain('container');
    expect(wrapper.text()).toContain('disk unavailable');
    expect(wrapper.find('[data-testid="mqtt-total"]').exists()).toBe(false);
  });
});
