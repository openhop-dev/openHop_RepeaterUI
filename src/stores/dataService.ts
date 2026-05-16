import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { useSystemStore } from './system';
import { usePacketStore } from './packets';
import { useNeighborStore } from './neighbors';
import ApiService from '@/utils/api';
import type { RecentPacket } from '@/types/api';

type DataKey = 'stats' | 'packetStats' | 'noiseFloor' | 'recentPackets' | 'sparklines' | 'advertTier' | 'neighbors';
export type StepStatus = 'pending' | 'loading' | 'done' | 'error';

const TTL: Record<DataKey, number> = {
  stats: 30_000,
  packetStats: 60_000,
  noiseFloor: 15_000,
  recentPackets: 30_000,
  sparklines: 300_000,
  advertTier: 60_000,
  neighbors: 10 * 60_000,
};

export const useDataService = defineStore('dataService', () => {
  const systemStore = useSystemStore();
  const packetStore = usePacketStore();
  const neighborStore = useNeighborStore();

  const advertTier = ref({
    currentTier: 'unknown' as string,
    advertsAllowed: 0,
    advertsDropped: 0,
    activePenalties: 0,
  });

  // Reactive progress state — consumed by BootstrapModal
  const isBootstrapping = ref(false);
  const statsSubStatus = ref<'requesting' | 'reading' | null>(null);
  const loadProgress = reactive<Record<DataKey, StepStatus>>({
    stats: 'pending',
    packetStats: 'pending',
    noiseFloor: 'pending',
    recentPackets: 'pending',
    sparklines: 'pending',
    advertTier: 'pending',
    neighbors: 'pending',
  });

  const _lastFetch = new Map<DataKey, number>();
  const _inFlight = new Map<DataKey, Promise<void>>();
  let _pollHandles: number[] = [];
  let _bootstrapped = false;
  let _disconnectTime: number | null = null;

  async function _withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === attempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
      }
    }
    throw new Error('unreachable');
  }

  async function _fetchAdvertTier(): Promise<void> {
    try {
      const response = await ApiService.get('/advert_rate_limit_stats');
      const data = response?.data as any;
      advertTier.value = {
        currentTier:
          typeof data?.adaptive?.current_tier === 'string'
            ? data.adaptive.current_tier
            : 'unknown',
        advertsAllowed: data?.stats?.adverts_allowed || 0,
        advertsDropped: data?.stats?.adverts_dropped || 0,
        activePenalties: Object.keys(data?.active_penalties || {}).length,
      };
      _lastFetch.set('advertTier', Date.now());
    } catch {
      // Non-critical — leave existing value
    }
  }

  async function ensure(key: DataKey): Promise<void> {
    if (key === 'neighbors') {
      if (!neighborStore.isStale()) return;
    } else {
      const lastFetch = _lastFetch.get(key);
      if (lastFetch !== undefined && Date.now() - lastFetch < TTL[key]) return;
    }

    const existing = _inFlight.get(key);
    if (existing) return existing;

    let promise: Promise<void>;

    switch (key) {
      case 'stats':
        promise = systemStore.fetchStats().then(() => { _lastFetch.set('stats', Date.now()); });
        break;
      case 'packetStats':
        promise = packetStore.fetchPacketStats({ hours: 24 }).then(() => { _lastFetch.set('packetStats', Date.now()); });
        break;
      case 'noiseFloor':
        promise = packetStore.fetchNoiseFloorHistory({ hours: 24, limit: 500 }).then(() => { _lastFetch.set('noiseFloor', Date.now()); });
        break;
      case 'recentPackets':
        promise = packetStore.fetchRecentPackets({ limit: 100 }).then(() => { _lastFetch.set('recentPackets', Date.now()); });
        break;
      case 'sparklines':
        promise = packetStore.initializeSparklineHistory().then(() => { _lastFetch.set('sparklines', Date.now()); });
        break;
      case 'advertTier':
        promise = _fetchAdvertTier();
        break;
      case 'neighbors':
        promise = neighborStore.fetchAll(neighborStore.currentHours).then(() => {});
        break;
    }

    _inFlight.set(key, promise!);
    promise!.finally(() => _inFlight.delete(key));
    return promise!;
  }

  async function _runStep(key: DataKey, fn: () => Promise<void>): Promise<void> {
    loadProgress[key] = 'loading';
    try {
      await fn();
      loadProgress[key] = 'done';
    } catch {
      loadProgress[key] = 'error';
    }
  }

  // Runs all HTTP fetches sequentially by phase, then resolves.
  // WebSocket connection is opened by useConnectionLifecycle AFTER this resolves.
  async function bootstrap(): Promise<void> {
    if (_bootstrapped) return;
    _bootstrapped = true;
    isBootstrapping.value = true;

    // Phase 1: Critical — stats with retry (config, node name, public key)
    loadProgress.stats = 'loading';
    statsSubStatus.value = 'requesting';
    try {
      await _withRetry(() => systemStore.fetchStats({
        onFirstByte: () => { statsSubStatus.value = 'reading'; },
      }));
      _lastFetch.set('stats', Date.now());
      loadProgress.stats = 'done';
    } catch {
      loadProgress.stats = 'error';
      console.error('[DataService] Failed to fetch stats after retries');
    } finally {
      statsSubStatus.value = null;
    }

    // Phase 2: Secondary — packet data in parallel
    await Promise.allSettled([
      _runStep('packetStats', () => packetStore.fetchPacketStats({ hours: 24 }).then(() => { _lastFetch.set('packetStats', Date.now()); })),
      _runStep('noiseFloor', () => packetStore.fetchNoiseFloorHistory({ hours: 24, limit: 500 }).then(() => { _lastFetch.set('noiseFloor', Date.now()); })),
      _runStep('recentPackets', () => packetStore.fetchRecentPackets({ limit: 100 }).then(() => { _lastFetch.set('recentPackets', Date.now()); })),
    ]);

    // Phase 3: Background — all in parallel (neighbors is slowest)
    await Promise.allSettled([
      _runStep('sparklines', () => packetStore.initializeSparklineHistory().then(() => { _lastFetch.set('sparklines', Date.now()); })),
      _runStep('advertTier', () => _fetchAdvertTier()),
      _runStep('neighbors', () => neighborStore.fetchAll(neighborStore.currentHours).then(() => {})),
    ]);

    isBootstrapping.value = false;
    _startPolling();
  }

  function _startPolling(): void {
    stopPolling();

    _pollHandles.push(window.setInterval(() => void ensure('advertTier'), 30_000));
    _pollHandles.push(window.setInterval(() => void ensure('packetStats'), 60_000));
    _pollHandles.push(window.setInterval(() => void ensure('noiseFloor'), 15_000));
    _pollHandles.push(window.setInterval(() => void ensure('sparklines'), 300_000));
    _pollHandles.push(
      window.setInterval(() => {
        const lastUpdate = systemStore.lastUpdated?.getTime() ?? 0;
        if (Date.now() - lastUpdate > 25_000) void ensure('stats');
      }, 30_000),
    );
  }

  function noteDisconnect(): void {
    _disconnectTime = Math.floor(Date.now() / 1000);
  }

  async function _recoverPackets(since: number): Promise<void> {
    try {
      const response = await ApiService.get<RecentPacket[]>('/filtered_packets', {
        start_timestamp: since,
        limit: 1000,
      });
      if (response.success && response.data) {
        packetStore.mergeRecentPackets(response.data);
        _lastFetch.set('recentPackets', Date.now());
      }
    } catch {
      // Non-fatal — store keeps whatever WS delivered before disconnect
    }
  }

  async function onReconnect(): Promise<void> {
    await new Promise((r) => setTimeout(r, 3000));
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const since = _disconnectTime !== null ? Math.max(_disconnectTime, tenMinutesAgo) : tenMinutesAgo;
    _disconnectTime = null;
    await Promise.allSettled([
      ensure('stats'),
      ensure('packetStats'),
      _recoverPackets(since),
    ]);
  }

  function stopPolling(): void {
    for (const h of _pollHandles) clearInterval(h);
    _pollHandles = [];
  }

  function reset(): void {
    stopPolling();
    _bootstrapped = false;
    _lastFetch.clear();
    _inFlight.clear();
    isBootstrapping.value = false;
    Object.keys(loadProgress).forEach((k) => {
      loadProgress[k as DataKey] = 'pending';
    });
    advertTier.value = {
      currentTier: 'unknown',
      advertsAllowed: 0,
      advertsDropped: 0,
      activePenalties: 0,
    };
  }

  return {
    advertTier,
    isBootstrapping,
    statsSubStatus,
    loadProgress,
    bootstrap,
    ensure,
    noteDisconnect,
    onReconnect,
    stopPolling,
    reset,
  };
});
