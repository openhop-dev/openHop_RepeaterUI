<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { streamingGet } from '@/utils/streamingFetch';
import { usePacketStore } from '@/stores/packets';
import { useWebSocketStore } from '@/stores/websocket';
import { useManagedPolling } from '@/composables/useManagedPolling';
import ChartCard from '@/components/ui/ChartCard.vue';

defineOptions({ name: 'PacketTypesChart' });

interface PacketTypeData {
  name: string;
  type: string;
  count: number;
  color: string;
}

interface PacketTypeSeries {
  name: string;
  type: string;
  data: [number, number][]; // [timestamp, count] pairs
}

interface ChartData {
  start_time: number;
  end_time: number;
  step: number;
  timestamps: number[];
  series: PacketTypeSeries[];
  data_source?: string;
  chart_type?: string;
}

interface BucketData {
  name: string;
  color: string;
  items: PacketTypeData[];
  total: number;
}

const rawPacketData = ref<PacketTypeData[]>([]);
const packetStore = usePacketStore();
const wsStore = useWebSocketStore();
const isLoading = ref(true);
const isRefreshing = ref(false);
const errorMessage = ref<string | null>(null);
const chartStatus = ref('Connecting...');
const hoveredBucket = ref<BucketData | null>(null);

// Semantic bucket definitions with distinct sub-colors
const bucketConfig = [
  {
    name: 'Payload',
    types: ['Plain Text Message', 'Group Text Message', 'Group Datagram', 'Multi-part Packet'],
    subColors: ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'], // Blue shades
  },
  {
    name: 'Requests',
    types: ['Request', 'Response', 'Anonymous Request'],
    subColors: ['#10B981', '#34D399', '#6EE7B7'], // Emerald shades
  },
  {
    name: 'Control',
    types: ['Node Advertisement', 'Acknowledgment', 'Returned Path'],
    subColors: ['#F59E0B', '#FBBF24', '#FCD34D'], // Amber shades
  },
  {
    name: 'Routing',
    types: ['Trace'],
    subColors: ['#8B5CF6'], // Purple
  },
  {
    name: 'Reserved',
    types: ['Reserved Type 11', 'Reserved Type 12', 'Reserved Type 13'],
    subColors: ['#6B7280', '#9CA3AF', '#D1D5DB'], // Gray shades
  },
];

// Compute buckets from raw data
const buckets = computed<BucketData[]>(() => {
  return bucketConfig
    .map((config) => {
      const items = rawPacketData.value
        .filter((p) => config.types.some((t) => p.name.includes(t) || p.name === t))
        .sort((a, b) => b.count - a.count)
        .map((item, idx) => ({
          ...item,
          color: config.subColors[idx % config.subColors.length],
        }));
      return {
        name: config.name,
        color: config.subColors[0],
        items,
        total: items.reduce((sum, item) => sum + item.count, 0),
      };
    })
    .filter((b) => b.total > 0);
});

const maxBucketTotal = computed(() => {
  return Math.max(...buckets.value.map((b) => b.total), 1);
});

const totalPackets = computed(() => {
  return buckets.value.reduce((sum, b) => sum + b.total, 0);
});

const fetchChartData = async () => {
  chartStatus.value = 'Connecting...';
  errorMessage.value = null;
  if (!isLoading.value) isRefreshing.value = true;
  try {
    const response = await streamingGet('/packet_type_graph_data', undefined, {
      onPhaseChange: (phase) => {
        chartStatus.value = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
      },
    });

    if (response?.success && response?.data) {
      const chartDataResponse = response.data as ChartData;

      if (chartDataResponse?.series) {
        const processedData: PacketTypeData[] = [];

        chartDataResponse.series.forEach((series: PacketTypeSeries, index: number) => {
          let totalCount = 0;
          if (series.data && Array.isArray(series.data)) {
            totalCount = series.data.reduce(
              (sum: number, point: [number, number]) => sum + (point[1] || 0),
              0,
            );
          }

          if (totalCount > 0) {
            processedData.push({
              name: series.name || `Type ${series.type}`,
              type: series.type,
              count: totalCount,
              color: '', // Color assigned by bucket
            });
          }
        });

        rawPacketData.value = processedData;
        isLoading.value = false;
        isRefreshing.value = false;
      } else {
        errorMessage.value = 'No series data in server response';
        isLoading.value = false;
        isRefreshing.value = false;
      }
    } else {
      errorMessage.value = 'Invalid response from server';
      isLoading.value = false;
      isRefreshing.value = false;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load data';
    isLoading.value = false;
    isRefreshing.value = false;
  }
};

// Packet type names (MeshCore spec)
const packetTypeNames: Record<number, string> = {
  0: 'Request',
  1: 'Response',
  2: 'Plain Text Message',
  3: 'Acknowledgment',
  4: 'Node Advertisement',
  5: 'Group Text Message',
  6: 'Group Datagram',
  7: 'Anonymous Request',
  8: 'Returned Path',
  9: 'Trace',
  10: 'Multi-part Packet',
  15: 'Custom Packet',
};

const updateFromRealtimeBreakdown = () => {
  const breakdown = packetStore.packetTypeBreakdown;
  if (!breakdown || breakdown.length === 0) return;

  rawPacketData.value = breakdown.map((item) => ({
    name: packetTypeNames[Number(item.type)] || `Type ${item.type}`,
    type: item.type,
    count: item.count,
    color: '',
  }));

  // Make sure UI leaves loading/error state after realtime update
  isLoading.value = false;
  errorMessage.value = null;
};

// Calculate percentage for bar height (90% max to leave 10% headroom)
const getBarHeight = (total: number) => {
  return Math.max((total / maxBucketTotal.value) * 90, 2);
};

// Get segment height as percentage of bucket total
const getSegmentHeight = (count: number, bucketTotal: number) => {
  if (bucketTotal === 0) return 0;
  return (count / bucketTotal) * 100;
};

onMounted(() => {
  fetchChartData();
});

// Update immediately when websocket-driven packet type counts change (24h window)
watch(
  () => packetStore.packetTypeBreakdown,
  () => updateFromRealtimeBreakdown(),
  { deep: true, immediate: true },
);

useManagedPolling(fetchChartData, {
  intervalMs: 30000,
  enabled: () => !wsStore.isConnected,
  immediate: true,
});
</script>

<template>
  <div class="glass-card rounded-[10px] p-4 lg:p-6">
    <div class="flex items-baseline justify-between mb-3 lg:mb-4">
      <h3 class="text-content-primary dark:text-content-primary text-lg lg:text-xl font-semibold">
        Packet Types
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-xs lg:text-sm uppercase">
        Distribution by Type
      </p>
    </div>

    <ChartCard
      class="h-48 lg:h-56"
      :is-loading="isLoading"
      :is-updating="isRefreshing"
      :error="errorMessage"
      :status="chartStatus"
      @retry="fetchChartData"
    >
      <div
        v-if="buckets.length === 0 && !isLoading && !errorMessage"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="text-content-secondary dark:text-content-primary text-sm lg:text-base">
          No packet data available
        </div>
      </div>

      <!-- Stacked Bar Chart -->
      <div v-if="buckets.length > 0" class="h-full flex flex-col">
        <!-- Tooltip -->
        <div
          v-if="hoveredBucket"
          class="absolute top-2 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke rounded-lg px-3 py-2 z-10 pointer-events-none min-w-48"
        >
          <div class="text-content-primary dark:text-content-primary text-sm font-medium mb-1">
            {{ hoveredBucket.name }} · {{ hoveredBucket.total.toLocaleString() }}
          </div>
          <div
            v-for="item in hoveredBucket.items"
            :key="item.type"
            class="flex justify-between gap-4 text-xs text-content-secondary dark:text-content-muted"
          >
            <span>{{ item.name }}</span>
            <span class="text-content-primary dark:text-content-primary">{{
              item.count.toLocaleString()
            }}</span>
          </div>
        </div>

        <!-- Bars -->
        <div class="flex-1 flex items-end justify-evenly gap-4 px-4">
          <div
            v-for="bucket in buckets"
            :key="bucket.name"
            class="flex flex-col items-center flex-1 max-w-32 h-full justify-end cursor-pointer"
            @mouseenter="hoveredBucket = bucket"
            @mouseleave="hoveredBucket = null"
          >
            <!-- Count label above bar -->
            <span
              class="text-content-primary dark:text-content-primary text-xs sm:text-sm font-semibold text-center w-full"
              style="padding-bottom: 5px"
              >{{ bucket.total.toLocaleString() }}</span
            >

            <!-- Stacked bar -->
            <div
              class="w-full rounded-[5px] transition-all duration-300 ease-out hover:opacity-90 overflow-hidden flex flex-col-reverse"
              :style="{
                height: getBarHeight(bucket.total) + '%',
                minHeight: '8px',
              }"
            >
              <!-- Segments stacked from bottom -->
              <div
                v-for="item in bucket.items"
                :key="item.type"
                :style="{
                  height: getSegmentHeight(item.count, bucket.total) + '%',
                  backgroundColor: item.color,
                }"
              ></div>
            </div>

            <!-- Label -->
            <span class="text-content-secondary dark:text-content-muted text-xs mt-2 text-center">{{
              bucket.name
            }}</span>
          </div>
        </div>
      </div>
    </ChartCard>

    <!-- Grid Legend - buckets as columns, items top to bottom -->
    <div
      v-if="buckets.length > 0"
      class="mt-4 flex flex-wrap justify-center gap-3 sm:gap-4 px-2 sm:px-4 text-[10px] sm:text-xs text-content-secondary dark:text-content-muted"
    >
      <div
        v-for="bucket in buckets"
        :key="'legend-' + bucket.name"
        class="flex flex-col gap-0.5 min-w-[100px] max-w-[140px] flex-shrink-0"
      >
        <div v-for="item in bucket.items" :key="item.type" class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-sm shrink-0" :style="{ backgroundColor: item.color }"></span>
          <span class="truncate text-left">{{ item.name }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="buckets.length > 0"
      class="mt-3 text-xs text-content-secondary dark:text-content-muted text-center"
    >
      Total: {{ totalPackets.toLocaleString() }} packets
    </div>
  </div>
</template>

<style scoped>
/* No custom styles needed - using Tailwind CSS */
</style>
