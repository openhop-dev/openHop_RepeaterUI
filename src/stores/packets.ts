import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import ApiService from '@/utils/api';
import type {
  PacketStats,
  RecentPacket,
  PacketStatsParams,
  RecentPacketsParams,
  FilteredPacketsParams,
  SystemStats,
  NoiseFloorHistory,
  NoiseFloorStats,
  NoiseFloorParams,
} from '@/types/api';

export const usePacketStore = defineStore('packets', () => {
  // State
  const packetStats = ref<PacketStats | null>(null);
  const systemStats = ref<SystemStats | null>(null);
  const recentPackets = ref<RecentPacket[]>([]);
  const noiseFloorHistory = ref<NoiseFloorHistory[]>([]);
  const noiseFloorStats = ref<NoiseFloorStats | null>(null);
  const lastKnownGoodNoiseFloor = ref<number | null>(null);
  const consecutiveBadNoiseFloorPolls = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<Date | null>(null);

  // Historical data for sparklines (legacy - cumulative)
  const packetStatsHistory = ref<Array<{ timestamp: Date; stats: PacketStats }>>([]);
  const systemStatsHistory = ref<Array<{ timestamp: Date; stats: SystemStats }>>([]);

  // Rate-based sparkline data from API
  interface MetricsGraphData {
    series: Array<{
      name: string;
      type: string;
      data: Array<[number, number]>;
    }>;
  }
  const metricsGraphData = ref<MetricsGraphData | null>(null);

  // CRC error tracking
  const crcErrorCount = ref<number>(0);
  const crcErrorHistory = ref<Array<{ timestamp: number; count: number }>>([]);

  // Legacy rate tracking for interpolation
  const interpolatedRates = ref({ rx: 0, tx: 0, drop: 0 });
  const targetRates = ref({ rx: 0, tx: 0, drop: 0 });

  // Computed
  const hasPacketStats = computed(() => packetStats.value !== null);
  const hasSystemStats = computed(() => systemStats.value !== null);
  const hasRecentPackets = computed(() => recentPackets.value.length > 0);
  const hasNoiseFloorData = computed(() => noiseFloorHistory.value.length > 0);
  const currentNoiseFloor = computed<number | null>(() => {
    if (consecutiveBadNoiseFloorPolls.value >= 5) return null;
    return lastKnownGoodNoiseFloor.value;
  });
  const totalPackets = computed(() => packetStats.value?.total_packets ?? 0);
  const averageRSSI = computed(() => packetStats.value?.avg_rssi ?? 0);
  const averageSNR = computed(() => packetStats.value?.avg_snr ?? 0);
  const uptime = computed(() => systemStats.value?.uptime_seconds ?? 0);

  // Packet type breakdown for charts
  const packetTypeBreakdown = computed(() => {
    if (!packetStats.value?.packet_types) return [];

    const types = packetStats.value.packet_types;
    const total = types.reduce((sum, item) => sum + item.count, 0);

    return types.map((item) => ({
      type: item.type.toString(),
      count: item.count,
      percentage: total > 0 ? (item.count / total) * 100 : 0,
    }));
  }); // Recent packets by type for analysis
  const recentPacketsByType = computed(() => {
    const grouped: Record<number, RecentPacket[]> = {};
    recentPackets.value.forEach((packet) => {
      if (!grouped[packet.type]) {
        grouped[packet.type] = [];
      }
      grouped[packet.type].push(packet);
    });
    return grouped;
  });

  // Actions
  async function fetchSystemStats() {
    try {
      const response = await ApiService.get<SystemStats>('/stats');

      // The /stats endpoint returns data directly, not wrapped in success/data
      if (response.success && response.data) {
        systemStats.value = response.data;

        // Store historical data for uptime sparklines
        const now = new Date();
        systemStatsHistory.value.push({
          timestamp: now,
          stats: response.data,
        });

        // Keep only last 50 data points (for sparklines)
        if (systemStatsHistory.value.length > 50) {
          systemStatsHistory.value = systemStatsHistory.value.slice(-50);
        }

        return response.data;
      } else if (response && 'version' in response) {
        // Handle case where the API returns stats directly without wrapping
        const directStats = response as unknown as SystemStats;
        systemStats.value = directStats;

        // Store historical data for uptime sparklines
        const now = new Date();
        systemStatsHistory.value.push({
          timestamp: now,
          stats: directStats,
        });

        // Keep only last 50 data points (for sparklines)
        if (systemStatsHistory.value.length > 50) {
          systemStatsHistory.value = systemStatsHistory.value.slice(-50);
        }

        return directStats;
      } else {
        throw new Error(response.error || 'Failed to fetch system stats');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching system stats:', err);
      throw err;
    }
  }

  async function fetchNoiseFloorHistory(params: NoiseFloorParams = { hours: 24 }) {
    try {
      const response = await ApiService.get<{
        history: NoiseFloorHistory[];
        hours: number;
        count: number;
      }>('/noise_floor_history', params);

      if (response.success && response.data && response.data.history) {
        noiseFloorHistory.value = response.data.history;
        lastUpdated.value = new Date();

        // Track consecutive bad polls (API returning 0 for noise floor)
        const validPoints = response.data.history.filter((p) => p.noise_floor_dbm !== 0);
        if (validPoints.length > 0) {
          consecutiveBadNoiseFloorPolls.value = 0;
          const latest = validPoints[validPoints.length - 1].noise_floor_dbm;
          lastKnownGoodNoiseFloor.value = latest;
        } else {
          consecutiveBadNoiseFloorPolls.value++;
        }

        return response.data.history;
      } else {
        throw new Error(response.error || 'Failed to fetch noise floor history');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching noise floor history:', err);
      throw err;
    }
  }

  async function fetchNoiseFloorStats(params: NoiseFloorParams = { hours: 24 }) {
    try {
      const response = await ApiService.get<{ stats: NoiseFloorStats; hours: number }>(
        '/noise_floor_stats',
        params,
      );

      if (response.success && response.data && response.data.stats) {
        noiseFloorStats.value = response.data.stats;
        lastUpdated.value = new Date();
        return response.data.stats;
      } else {
        throw new Error(response.error || 'Failed to fetch noise floor stats');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching noise floor stats:', err);
      throw err;
    }
  }

  // Computed sparkline data for noise floor
  const noiseFloorSparklineData = computed(() => {
    if (!noiseFloorHistory.value || !Array.isArray(noiseFloorHistory.value)) {
      return [];
    }
    return noiseFloorHistory.value
      .filter((point) => point.noise_floor_dbm !== 0)
      .slice(-50)
      .map((point) => point.noise_floor_dbm);
  });

  async function fetchPacketStats(params: PacketStatsParams = { hours: 24 }) {
    try {
      isLoading.value = true;
      error.value = null;

      const response = await ApiService.get<PacketStats>('/packet_stats', params);

      if (response.success && response.data) {
        packetStats.value = response.data;

        // Store historical data for sparklines
        const now = new Date();
        packetStatsHistory.value.push({
          timestamp: now,
          stats: response.data,
        });

        // Keep only last 50 data points (for sparklines)
        if (packetStatsHistory.value.length > 50) {
          packetStatsHistory.value = packetStatsHistory.value.slice(-50);
        }

        lastUpdated.value = now;
      } else {
        throw new Error(response.error || 'Failed to fetch packet stats');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching packet stats:', err);
    } finally {
      isLoading.value = false;
    }
  }
  async function fetchRecentPackets(params: RecentPacketsParams = { limit: 100 }) {
    try {
      isLoading.value = true;
      error.value = null;

      const response = await ApiService.get<RecentPacket[]>('/recent_packets', params);

      if (response.success && response.data) {
        recentPackets.value = response.data;
        lastUpdated.value = new Date();
      } else {
        throw new Error(response.error || 'Failed to fetch recent packets');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching recent packets:', err);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchFilteredPackets(params: FilteredPacketsParams) {
    try {
      isLoading.value = true;
      error.value = null;

      const response = await ApiService.get<RecentPacket[]>('/filtered_packets', params);

      if (response.success && response.data) {
        // Store filtered results in recent packets for now
        recentPackets.value = response.data;
        lastUpdated.value = new Date();
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch filtered packets');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching filtered packets:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function getPacketByHash(packetHash: string) {
    try {
      isLoading.value = true;
      error.value = null;

      const response = await ApiService.get<RecentPacket>('/packet_by_hash', {
        packet_hash: packetHash,
      });

      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error || 'Packet not found');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching packet by hash:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  // Sparkline data computed from API metrics
  const sparklineData = computed(() => {
    if (!metricsGraphData.value?.series) {
      return {
        totalPackets: [],
        transmittedPackets: [],
        droppedPackets: [],
        crcErrors: crcErrorHistory.value.map((h) => h.count),
        currentRates: interpolatedRates.value,
      };
    }

    const rxSeries = metricsGraphData.value.series.find((s) => s.type === 'rx_count');
    const txSeries = metricsGraphData.value.series.find((s) => s.type === 'tx_count');

    const rxData = rxSeries?.data || [];
    const txData = txSeries?.data || [];

    // Derive dropped = rx - tx (packets received but not forwarded)
    const droppedData = rxData.map((rxPoint, i) => {
      const txPoint = txData[i];
      if (txPoint) {
        return Math.max(0, rxPoint[1] - txPoint[1]);
      }
      return rxPoint[1];
    });

    return {
      totalPackets: rxData.map((d) => d[1]),
      transmittedPackets: txData.map((d) => d[1]),
      droppedPackets: droppedData,
      crcErrors: crcErrorHistory.value.map((h) => h.count),
      currentRates: interpolatedRates.value,
    };
  });

  // Legacy sparkline data (cumulative) - keep for backwards compatibility
  const legacySparklineData = computed(() => {
    const packetHistory = packetStatsHistory.value;
    const systemHistory = systemStatsHistory.value;

    return {
      totalPackets: packetHistory.map((h) => h.stats.total_packets),
      transmittedPackets: packetHistory.map((h) => h.stats.transmitted_packets),
      droppedPackets: packetHistory.map((h) => h.stats.dropped_packets),
      avgRssi: packetHistory.map((h) => h.stats.avg_rssi),
      uptimeHours: systemHistory.map((h) => Math.floor((h.stats.uptime_seconds || 0) / 3600)),
    };
  });

  // Auto-refresh functionality
  async function startAutoRefresh(intervalMs = 30000) {
    // Initial fetch
    await Promise.all([
      fetchSystemStats(),
      fetchPacketStats(),
      fetchRecentPackets(),
      fetchNoiseFloorHistory({ hours: 1 }),
      fetchNoiseFloorStats({ hours: 1 }),
    ]);

    // Set up interval for continuous updates
    const intervalId = setInterval(async () => {
      try {
        await Promise.all([
          fetchSystemStats(),
          fetchPacketStats(),
          fetchRecentPackets(),
          fetchNoiseFloorHistory({ hours: 1 }),
          fetchNoiseFloorStats({ hours: 1 }),
        ]);
      } catch (err) {
        console.error('Auto-refresh error:', err);
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }

  /**
   * Fetch CRC error count and history from the API.
   */
  async function fetchCrcErrors(hours = 24) {
    try {
      const [countRes, historyRes] = await Promise.all([
        ApiService.get<{ crc_error_count: number }>('/crc_error_count', { hours }),
        ApiService.get<{ history: Array<{ timestamp: number; count: number }> }>(
          '/crc_error_history',
          { hours },
        ),
      ]);

      if (countRes?.success && countRes.data) {
        crcErrorCount.value = (countRes.data as any).crc_error_count ?? 0;
      }
      if (historyRes?.success && historyRes.data) {
        crcErrorHistory.value = (historyRes.data as any).history ?? [];
      }
    } catch (err) {
      console.error('Failed to fetch CRC error data:', err);
    }
  }

  /**
   * Fetch metrics graph data for sparklines (24-hour view)
   */
  async function fetchSparklineData() {
    try {
      const [metricsRes] = await Promise.all([
        ApiService.get('/metrics_graph_data', {
          hours: 24,
          resolution: 'average',
          metrics: 'rx_count,tx_count',
        }),
        fetchCrcErrors(24),
      ]);

      if (metricsRes?.success && metricsRes.data) {
        metricsGraphData.value = metricsRes.data as MetricsGraphData;
      }
    } catch (err) {
      console.error('Failed to fetch sparkline data:', err);
    }
  }

  /**
   * Initialize sparkline with historical data.
   */
  async function initializeSparklineHistory() {
    await fetchSparklineData();
  }

  /**
   * Interpolate rates for smooth animation (legacy, kept for compatibility)
   */
  function interpolateRates() {
    // Refresh sparkline data periodically
    fetchSparklineData();
  }

  // Reset store state
  function reset() {
    packetStats.value = null;
    systemStats.value = null;
    recentPackets.value = [];
    noiseFloorHistory.value = [];
    noiseFloorStats.value = null;
    packetStatsHistory.value = [];
    systemStatsHistory.value = [];
    metricsGraphData.value = null;
    crcErrorCount.value = 0;
    crcErrorHistory.value = [];
    interpolatedRates.value = { rx: 0, tx: 0, drop: 0 };
    targetRates.value = { rx: 0, tx: 0, drop: 0 };
    error.value = null;
    lastUpdated.value = null;
    isLoading.value = false;
  }

  function addRealtimePacket(packet: RecentPacket) {
    recentPackets.value.unshift(packet);
    if (recentPackets.value.length > 1000) {
      recentPackets.value = recentPackets.value.slice(0, 1000);
    }
  }

  function mergeRecentPackets(incoming: RecentPacket[]): void {
    const existing = new Set(recentPackets.value.map((p) => p.packet_hash));
    const novel = incoming.filter((p) => !existing.has(p.packet_hash));
    if (novel.length === 0) return;
    const merged = [...novel, ...recentPackets.value];
    merged.sort((a, b) => b.timestamp - a.timestamp);
    recentPackets.value = merged.slice(0, 1000);
  }

  function updateRealtimeStats(stats: { packet_stats?: PacketStats; system_stats?: SystemStats }) {
    // Update packet stats if provided
    if (stats.packet_stats) {
      packetStats.value = stats.packet_stats;

      // Store historical data for sparklines
      const now = new Date();
      packetStatsHistory.value.push({
        timestamp: now,
        stats: stats.packet_stats,
      });

      // Keep only last 50 data points
      if (packetStatsHistory.value.length > 50) {
        packetStatsHistory.value = packetStatsHistory.value.slice(-50);
      }
    }

    // Update system stats if provided
    if (stats.system_stats) {
      systemStats.value = stats.system_stats;

      // Store historical data for sparklines
      const now = new Date();
      systemStatsHistory.value.push({
        timestamp: now,
        stats: stats.system_stats,
      });

      // Keep only last 50 data points
      if (systemStatsHistory.value.length > 50) {
        systemStatsHistory.value = systemStatsHistory.value.slice(-50);
      }
    }

    lastUpdated.value = new Date();
  }

  return {
    // State
    packetStats,
    systemStats,
    recentPackets,
    noiseFloorHistory,
    noiseFloorStats,
    packetStatsHistory,
    systemStatsHistory,
    isLoading,
    error,
    lastUpdated,

    // Computed
    hasPacketStats,
    hasSystemStats,
    hasRecentPackets,
    hasNoiseFloorData,
    currentNoiseFloor,
    totalPackets,
    averageRSSI,
    averageSNR,
    uptime,
    packetTypeBreakdown,
    recentPacketsByType,
    sparklineData,
    legacySparklineData,
    noiseFloorSparklineData,
    crcErrorCount,
    crcErrorHistory,
    metricsGraphData,
    interpolatedRates,

    // Actions
    fetchSystemStats,
    fetchPacketStats,
    fetchCrcErrors,
    fetchRecentPackets,
    fetchFilteredPackets,
    getPacketByHash,
    fetchNoiseFloorHistory,
    fetchNoiseFloorStats,
    startAutoRefresh,
    initializeSparklineHistory,
    interpolateRates,
    reset,
    addRealtimePacket,
    mergeRecentPackets,
    updateRealtimeStats,
  };
});
