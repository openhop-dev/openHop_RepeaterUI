<script setup lang="ts">
import { onMounted, computed } from 'vue';
import ChartSparkline from './ChartSparkline.vue';
import { usePacketStore } from '@/stores/packets';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';

defineOptions({ name: 'StatsCards' });

// Chart palette — fixed vibrant colours, same in both light and dark mode.
const CHART_COLORS = {
  uptime:    '#EBA0FC', // lavender
  rx:        '#AAE8E8', // teal
  forward:   '#FFC246', // bright amber
  dropped:   '#FB787B', // coral
  crcErrors: '#F59E0B', // amber
  hashCache: '#9F7AEA', // purple
} as const;

const packetStore = usePacketStore();
const systemStore = useSystemStore();
const dataService = useDataService();

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const stats = computed(() => {
  const packetStats = packetStore.packetStats;
  const uptimeSeconds = systemStore.stats?.uptime_seconds || 0;
  const total = packetStats?.total_packets || 0;
  const dropped = packetStats?.dropped_packets || 0;

  return {
    packetsReceived: total,
    packetsForwarded: packetStats?.transmitted_packets || 0,
    uptimeFormatted: formatUptime(uptimeSeconds),
    droppedPackets: dropped,
    crcErrorCount: packetStore.crcErrorCount,
    hashCacheSize: packetStore.systemStats?.duplicate_cache_size ?? 0,
  };
});

const sparklineData = computed(() => packetStore.sparklineData);

onMounted(() => {
  // Safety net: ensure sparklines are loaded if DataService bootstrap hasn't completed yet
  void dataService.ensure('sparklines');
});
</script>

<template>
  <div
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4 mb-5 stats-cards-container"
  >
    <!-- Up Time -->
    <ChartSparkline
      title="Up Time"
      :value="stats.uptimeFormatted"
      :color="CHART_COLORS.uptime"
      :data="[]"
      :showChart="false"
      class="stat-card"
    />

    <!-- RX Packets -->
    <ChartSparkline
      title="RX Packets"
      :value="stats.packetsReceived"
      :color="CHART_COLORS.rx"
      :data="sparklineData.totalPackets"
      class="stat-card"
    />

    <!-- Forward -->
    <ChartSparkline
      title="Forward"
      :value="stats.packetsForwarded"
      :color="CHART_COLORS.forward"
      :data="sparklineData.transmittedPackets"
      class="stat-card"
    />

    <!-- Dropped -->
    <ChartSparkline
      title="Dropped"
      :value="stats.droppedPackets"
      :color="CHART_COLORS.dropped"
      :data="sparklineData.droppedPackets"
      class="stat-card"
    />

    <!-- CRC Errors -->
    <ChartSparkline
      title="CRC Errors"
      :value="stats.crcErrorCount"
      :color="CHART_COLORS.crcErrors"
      :data="sparklineData.crcErrors"
      class="stat-card"
    />

    <!-- Hash Cache -->
    <ChartSparkline
      title="Hash Cache"
      :value="stats.hashCacheSize"
      :color="CHART_COLORS.hashCache"
      :showChart="false"
      class="stat-card"
    />
  </div>
</template>

<style scoped>
.stats-cards-container {
  /* Prevent layout shifts */
  will-change: auto;
  contain: layout;
}

.stat-card {
  /* Smooth transitions for value changes */
  transition: opacity 0.3s ease-out;
}

/* Prevent flash of content */
.stat-card :deep(.text-lg),
.stat-card :deep(.text-\[30px\]) {
  transition: color 0.2s ease-out;
}
</style>
