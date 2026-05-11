<script setup lang="ts">
import { onMounted, computed } from 'vue';
import ChartSparkline from './ChartSparkline.vue';
import { usePacketStore } from '@/stores/packets';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';

defineOptions({ name: 'StatsCards' });

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
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4 mb-5 stats-cards-container"
  >
    <!-- Up Time -->
    <ChartSparkline
      title="Up Time"
      :value="stats.uptimeFormatted"
      color="#EBA0FC"
      :data="[]"
      :showChart="false"
      class="stat-card"
    />

    <!-- RX Packets -->
    <ChartSparkline
      title="RX Packets"
      :value="stats.packetsReceived"
      color="#AAE8E8"
      :data="sparklineData.totalPackets"
      class="stat-card"
    />

    <!-- Forward -->
    <ChartSparkline
      title="Forward"
      :value="stats.packetsForwarded"
      color="#FFC246"
      :data="sparklineData.transmittedPackets"
      class="stat-card"
    />

    <!-- Dropped -->
    <ChartSparkline
      title="Dropped"
      :value="stats.droppedPackets"
      color="#FB787B"
      :data="sparklineData.droppedPackets"
      class="stat-card"
    />

    <!-- CRC Errors -->
    <ChartSparkline
      title="CRC Errors"
      :value="stats.crcErrorCount"
      color="#F59E0B"
      :data="sparklineData.crcErrors"
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
