import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Test the radioConfig DataKey behaviour in DataService:
// - ensure('radioConfig') piggybacks on ensure('stats')
// - bootstrap stamps radioConfig so it's session-stable after load
// - invalidate('radioConfig') clears the cache so next ensure re-fetches
// - ensure('stats') always stamps radioConfig too

vi.mock('@/stores/packets', () => ({
  usePacketStore: () => ({
    fetchPacketStats: vi.fn().mockResolvedValue(undefined),
    fetchNoiseFloorHistory: vi.fn().mockResolvedValue(undefined),
    fetchRecentPackets: vi.fn().mockResolvedValue(undefined),
    initializeSparklineHistory: vi.fn().mockResolvedValue(undefined),
    systemStats: null,
    mergeRecentPackets: vi.fn(),
  }),
}));

vi.mock('@/stores/neighbors', () => ({
  useNeighborStore: () => ({
    fetchAll: vi.fn().mockResolvedValue(undefined),
    isStale: vi.fn().mockReturnValue(false),
    currentHours: 168,
  }),
}));

const mockFetchStats = vi.fn().mockResolvedValue({ config: { radio: { spreading_factor: 9 } } });

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: { config: { radio: { spreading_factor: 9 } } },
    lastUpdated: new Date(),
    fetchStats: mockFetchStats,
    updateRealtimeStats: vi.fn(),
  }),
}));

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
  API_SERVER_URL: '',
}));

import { useDataService } from '@/stores/dataService';

function setup() {
  setActivePinia(createPinia());
  return useDataService();
}

describe('radioConfig DataKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensure("radioConfig") triggers a stats fetch when not yet loaded', async () => {
    const ds = setup();
    await ds.ensure('radioConfig');
    expect(mockFetchStats).toHaveBeenCalledTimes(1);
  });

  it('ensure("radioConfig") is a no-op after bootstrap stamps it', async () => {
    const ds = setup();
    await ds.bootstrap();
    const callsBefore = mockFetchStats.mock.calls.length;
    await ds.ensure('radioConfig');
    expect(mockFetchStats.mock.calls.length).toBe(callsBefore);
  });

  it('invalidate("radioConfig") does not trigger a re-fetch when stats is still fresh', async () => {
    // After a radio config save, systemStore.fetchStats() is called directly (cache-bust).
    // Stats data is current. invalidate marks radioConfig stale, but ensure('radioConfig')
    // defers to ensure('stats') which is still within TTL — no redundant HTTP call.
    const ds = setup();
    await ds.bootstrap();
    ds.invalidate('radioConfig');
    const callsBefore = mockFetchStats.mock.calls.length;
    await ds.ensure('radioConfig');
    expect(mockFetchStats.mock.calls.length).toBe(callsBefore);
  });

  it('ensure("radioConfig") re-stamps radioConfig so subsequent calls are no-ops after invalidate', async () => {
    const ds = setup();
    await ds.bootstrap();
    ds.invalidate('radioConfig');
    await ds.ensure('radioConfig'); // re-stamps radioConfig via ensure('stats') no-op path
    const callsBefore = mockFetchStats.mock.calls.length;
    await ds.ensure('radioConfig'); // now a no-op — radioConfig is fresh again
    expect(mockFetchStats.mock.calls.length).toBe(callsBefore);
  });

  it('ensure("stats") also stamps radioConfig so it stays session-stable', async () => {
    const ds = setup();
    await ds.ensure('stats');
    const callsBefore = mockFetchStats.mock.calls.length;
    await ds.ensure('radioConfig');
    expect(mockFetchStats.mock.calls.length).toBe(callsBefore);
  });
});
