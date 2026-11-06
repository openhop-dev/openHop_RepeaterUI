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
  it('offers the requested rolling Statistics windows and defaults to 24 hours', async () => {
    render();
    await flushPromises();
    const select = wrapper.get('select[aria-label="Usage window"]');
    expect(
      select
        .findAll('option')
        .map((option) => ({ value: option.attributes('value'), label: option.text() })),
    ).toEqual([
      { value: '1', label: '1 Hour' },
      { value: '6', label: '6 Hours' },
      { value: '24', label: '24 Hours' },
      { value: '48', label: '2 Days' },
      { value: '168', label: '1 Week' },
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('24');
    expect(ApiService.getNetworkUsage).toHaveBeenCalledWith(24);
    for (const hours of [1, 6, 24, 48, 168]) {
      await select.setValue(String(hours));
      await flushPromises();
      expect(ApiService.getNetworkUsage).toHaveBeenCalledWith(hours);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    }
  });
  it('keeps technical history details inside the collapsed disclosure, not above the totals', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockResolvedValueOnce({ ...usage(), partial: true });
    render();
    await flushPromises();
    const details = wrapper.get('details');
    expect(details.attributes('open')).toBeUndefined();
    expect(details.get('[data-testid="usage-window"]').text()).toContain('60-second buckets');
    expect(details.text()).toContain('Partial history');
    expect(details.text()).toContain('History available since');
    expect(details.text()).toContain('Last sample');
    expect(wrapper.text()).not.toContain('Rolling totals · decimal bytes');
    const outside = wrapper.element.cloneNode(true) as HTMLElement;
    outside.querySelectorAll('details').forEach((element) => element.remove());
    expect(outside.textContent).not.toContain('Partial history');
    expect(outside.textContent).not.toContain('60-second buckets');
    expect(outside.textContent).not.toContain('History available since');
    expect(outside.textContent).not.toContain('Last sample');
    expect(outside.textContent).toContain('Uploaded message data, excluding connection overhead.');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
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
    expect(wrapper.get('details').attributes('open')).toBeUndefined();
    expect(wrapper.get('details summary').text()).toBe('Measurement scope');
  });
  it('switches actual rolling windows, dates and interfaces, retaining choices on poll and remount', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockImplementation(async (days) => ({
      ...usage(days),
      start: days === 168 ? 1699481640 : 1700000040,
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
    await wrapper.get('select[aria-label="Usage window"]').setValue('168');
    await flushPromises();
    expect(ApiService.getNetworkUsage).toHaveBeenLastCalledWith(168);
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
    ).toBe('168');
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
    await wrapper.get('select[aria-label="Usage window"]').setValue('6');
    expect(wrapper.text()).toContain('Loading usage');
    expect(wrapper.find('[data-testid="mqtt-total"]').exists()).toBe(false);
    resolve(usage(6));
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
