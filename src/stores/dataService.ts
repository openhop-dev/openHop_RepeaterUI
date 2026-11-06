import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { useSystemStore } from './system';
import { usePacketStore } from './packets';
import { useNeighborStore } from './neighbors';
import ApiService from '@/utils/api';
import type { RecentPacket } from '@/types/api';
import type { NetworkUsage } from '@/utils/networkUsage';

interface UsageState {
  data: NetworkUsage | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

type DataKey = 'stats' | 'packetStats' | 'noiseFloor' | 'recentPackets' | 'sparklines' | 'advertTier' | 'neighbors' | 'radioConfig';
export type StepStatus = 'pending' | 'loading' | 'done' | 'error';

// Freshness rule: the 5s WS beat delivers the fast data and stamps it via
// noteWsDelivery, so in nominal regime the fallback sweep is silent. A TTL
// is how stale a key may get before HTTP steps in — multiples of the beat.
const TTL: Record<DataKey, number> = {
  stats: 30_000,
  packetStats: 60_000,
  // The curve self-maintains from the per-beat noise_floor_dbm scalar
  // (appendNoiseFloorReading); the full 1h series is only an anti-drift
  // re-sync, not the transport.
  noiseFloor: 300_000,
  recentPackets: 30_000,
  sparklines: 300_000,
  advertTier: 60_000,
  neighbors: 10 * 60_000,
  radioConfig: Number.MAX_SAFE_INTEGER, // stable until explicitly invalidated by config UI
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
    radioConfig: 'pending',
  });

  // Historical windows are independent cache keys; live pushes never replace them.
  const networkUsage = reactive<Partial<Record<number, UsageState>>>({});
  const usageHours = ref(24);
  const usageInterface = ref('');
  const usageInFlight = new Map<number, Promise<void>>();
  const usageSubscribers = new Map<number, number>();
  let usageTimer: number | null = null;
  let usageGeneration = 0;

  async function ensureNetworkUsage(hours: number, force = false): Promise<void> {
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) return;
    const existing = usageInFlight.get(hours);
    if (existing) return existing;
    const state = (networkUsage[hours] ??= reactive({
      data: null as NetworkUsage | null,
      loading: false,
      error: null as string | null,
      fetchedAt: null as number | null,
    }));
    if (!force && state.fetchedAt !== null && Date.now() - state.fetchedAt < 60_000) return;
    state.loading = true;
    const generation = usageGeneration;
    const request = (async () => {
      try {
        const data = await ApiService.getNetworkUsage(hours);
        if (generation !== usageGeneration) return;
        if (data.hours !== hours)
          throw new Error('Usage response does not match the selected window');
        state.data = data;
        state.error = null;
        state.fetchedAt = Date.now();
      } catch (error) {
        if (generation === usageGeneration) {
          state.error = error instanceof Error ? error.message : 'Unable to load usage';
        }
      } finally {
        if (generation === usageGeneration) {
          state.loading = false;
          usageInFlight.delete(hours);
        }
      }
    })();
    usageInFlight.set(hours, request);
    return request;
  }

  function subscribeNetworkUsage(hours: number): () => void {
    usageSubscribers.set(hours, (usageSubscribers.get(hours) ?? 0) + 1);
    void ensureNetworkUsage(hours);
    if (usageTimer === null) {
      usageTimer = window.setInterval(() => {
        for (const hour of usageSubscribers.keys()) void ensureNetworkUsage(hour);
      }, 60_000);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = usageSubscribers.get(hours) ?? 0;
      if (count > 1) usageSubscribers.set(hours, count - 1);
      else usageSubscribers.delete(hours);
      if (usageSubscribers.size === 0 && usageTimer !== null) {
        clearInterval(usageTimer);
        usageTimer = null;
      }
    };
  }

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

  // The WS broadcast delivered this key's data: stamp it fresh so the
  // fallback sweep leaves HTTP alone while the socket is alive.
  function noteWsDelivery(key: DataKey): void {
    _lastFetch.set(key, Date.now());
  }

  function applyAdvertTierBroadcast(tier: {
    current_tier?: string;
    adverts_allowed?: number;
    adverts_dropped?: number;
    active_penalties?: number;
  }): void {
    advertTier.value = {
      currentTier: typeof tier.current_tier === 'string' ? tier.current_tier : 'unknown',
      advertsAllowed: tier.adverts_allowed ?? 0,
      advertsDropped: tier.adverts_dropped ?? 0,
      activePenalties: tier.active_penalties ?? 0,
    };
    _lastFetch.set('advertTier', Date.now());
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
        promise = systemStore.fetchStats().then(() => {
          _lastFetch.set('stats', Date.now());
          _lastFetch.set('radioConfig', Date.now());
        });
        break;
      case 'radioConfig':
        promise = ensure('stats').then(() => {
          _lastFetch.set('radioConfig', Date.now());
        });
        break;
      case 'packetStats':
        promise = packetStore.fetchPacketStats({ hours: 24 }).then(() => { _lastFetch.set('packetStats', Date.now()); });
        break;
      case 'noiseFloor':
        promise = packetStore.fetchNoiseFloorHistory({ hours: 1, limit: 500 }).then(() => { _lastFetch.set('noiseFloor', Date.now()); });
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
  async function _pool(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
    const queue = [...tasks];
    let active = 0;
    return new Promise((resolve) => {
      function next() {
        if (queue.length === 0 && active === 0) { resolve(); return; }
        while (active < concurrency && queue.length > 0) {
          active++;
          queue.shift()!().finally(() => { active--; next(); });
        }
      }
      next();
    });
  }

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
      _lastFetch.set('radioConfig', Date.now());
      loadProgress.stats = 'done';
    } catch {
      loadProgress.stats = 'error';
      console.error('[DataService] Failed to fetch stats after retries');
    } finally {
      statsSubStatus.value = null;
    }

    // Phases 2+3: pool with concurrency 3 — next task fires as soon as a slot opens
    const secondaryTasks: Array<() => Promise<void>> = [
      () => _runStep('packetStats', () => packetStore.fetchPacketStats({ hours: 24 }).then(() => { _lastFetch.set('packetStats', Date.now()); })),
      () => _runStep('noiseFloor', () => packetStore.fetchNoiseFloorHistory({ hours: 1, limit: 500 }).then(() => { _lastFetch.set('noiseFloor', Date.now()); })),
      () => _runStep('recentPackets', () => packetStore.fetchRecentPackets({ limit: 100 }).then(() => { _lastFetch.set('recentPackets', Date.now()); })),
      () => _runStep('sparklines', () => packetStore.initializeSparklineHistory().then(() => { _lastFetch.set('sparklines', Date.now()); })),
      () => _runStep('advertTier', () => _fetchAdvertTier()),
      () => _runStep('neighbors', () => neighborStore.fetchAll(neighborStore.currentHours).then(() => {})),
    ];
    await _pool(secondaryTasks, 3);

    isBootstrapping.value = false;
    _startPolling();
  }

  // One sweep instead of one timer per key: ensure() no-ops on any key
  // fresher than its TTL, so with a healthy WS this loop does no HTTP at
  // all. The stats key keeps its liveness gate — lastUpdated is stamped by
  // every WS vitals delivery, so HTTP only steps in when the socket is
  // silent.
  function _startPolling(): void {
    // Page-scoped historical subscriptions may already be active during bootstrap.
    for (const h of _pollHandles) clearInterval(h);
    _pollHandles = [];

    _pollHandles.push(
      window.setInterval(() => {
        const lastUpdate = systemStore.lastUpdated?.getTime() ?? 0;
        if (Date.now() - lastUpdate > 25_000) void ensure('stats');
        void ensure('advertTier');
        void ensure('packetStats');
        void ensure('noiseFloor');
        void ensure('sparklines');
      }, 15_000),
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
    invalidate('noiseFloor');
    for (const hour of usageSubscribers.keys()) void ensureNetworkUsage(hour, true);
    await Promise.allSettled([
      ensure('stats'),
      ensure('packetStats'),
      ensure('noiseFloor'),
      _recoverPackets(since),
    ]);
  }

  function invalidate(key: DataKey): void {
    _lastFetch.delete(key);
  }

  function stopPolling(): void {
    for (const h of _pollHandles) clearInterval(h);
    _pollHandles = [];
    if (usageTimer !== null) clearInterval(usageTimer);
    usageTimer = null;
  }

  function reset(): void {
    stopPolling();
    _bootstrapped = false;
    usageGeneration++;
    usageInFlight.clear();
    usageSubscribers.clear();
    for (const hour of Object.keys(networkUsage)) delete networkUsage[Number(hour)];
    usageHours.value = 24;
    usageInterface.value = '';
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
    networkUsage,
    usageHours,
    usageInterface,
    ensureNetworkUsage,
    subscribeNetworkUsage,
    advertTier,
    isBootstrapping,
    statsSubStatus,
    loadProgress,
    bootstrap,
    ensure,
    noteWsDelivery,
    applyAdvertTierBroadcast,
    invalidate,
    noteDisconnect,
    onReconnect,
    stopPolling,
    reset,
  };
});
