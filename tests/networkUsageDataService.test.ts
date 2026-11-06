import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataService } from '@/stores/dataService';
import { usePacketStore } from '@/stores/packets';
import ApiService from '@/utils/api';
import type { NetworkUsage } from '@/utils/networkUsage';

vi.mock('@/utils/api', () => ({ default: { getNetworkUsage: vi.fn() } }));
import { usage } from './fixtures/networkUsage';
beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.mocked(ApiService.getNetworkUsage).mockReset();
});
afterEach(() => {
  useDataService().reset();
  vi.useRealTimers();
});

describe('DataService usage ownership', () => {
  it('refreshes active windows on reconnect even while cached and stops on lifecycle cleanup', async () => {
    vi.spyOn(usePacketStore(), 'fetchPacketStats').mockResolvedValue(undefined);
    vi.spyOn(usePacketStore(), 'fetchNoiseFloorHistory').mockResolvedValue([]);
    vi.mocked(ApiService.getNetworkUsage).mockResolvedValue(usage());
    const store = useDataService();
    const off = store.subscribeNetworkUsage(1);
    await vi.advanceTimersByTimeAsync(0);
    store.noteWsDelivery('stats');
    const reconnect = store.onReconnect();
    await vi.advanceTimersByTimeAsync(3000);
    await reconnect;
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
    store.stopPolling();
    await vi.advanceTimersByTimeAsync(120000);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
    off();
  });
  it('deduplicates and caches by day without letting old windows overwrite a new selection', async () => {
    let finish!: (value: NetworkUsage) => void;
    vi.mocked(ApiService.getNetworkUsage).mockImplementation((days) =>
      days === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(usage(days)),
    );
    const store = useDataService();
    const first = store.ensureNetworkUsage(1);
    const duplicate = store.ensureNetworkUsage(1);
    store.usageDays = 7;
    await store.ensureNetworkUsage(7);
    finish(usage(1));
    await Promise.all([first, duplicate]);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
    expect(store.networkUsage[store.usageDays]?.data?.days).toBe(7);
    await store.ensureNetworkUsage(7);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
  });
  it('owns polling with shared subscriptions and stops after the last consumer', async () => {
    vi.mocked(ApiService.getNetworkUsage).mockResolvedValue(usage());
    const store = useDataService();
    const off = store.subscribeNetworkUsage(1);
    const off2 = store.subscribeNetworkUsage(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
    off();
    off();
    off2();
    await vi.advanceTimersByTimeAsync(120000);
    expect(ApiService.getNetworkUsage).toHaveBeenCalledTimes(2);
  });
  it('retains a stale snapshot with an explicit error instead of replacing it with zero', async () => {
    vi.mocked(ApiService.getNetworkUsage)
      .mockResolvedValueOnce(usage())
      .mockRejectedValueOnce(new Error('offline'));
    const store = useDataService();
    await store.ensureNetworkUsage(1);
    await store.ensureNetworkUsage(1, true);
    expect(store.networkUsage[1]?.error).toBe('offline');
    expect(store.networkUsage[1]?.data?.mqtt.upload_bytes).toBe(3000);
  });
  it('does not repopulate data with an old in-flight response after reset', async () => {
    let finish!: (value: NetworkUsage) => void;
    vi.mocked(ApiService.getNetworkUsage).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = useDataService();
    const pending = store.ensureNetworkUsage(1);
    store.reset();
    finish(usage());
    await pending;
    expect(store.networkUsage[1]).toBeUndefined();
  });
});
