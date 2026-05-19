<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { useDataService } from '@/stores/dataService';

defineOptions({ name: 'ApiStatus' });

const packetStore = usePacketStore();
const dataService = useDataService();
const directApiTest = ref<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
} | null>(null);
const systemStatsTest = ref<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
} | null>(null);

// Test direct API connection
const testDirectApi = async () => {
  try {
    const baseUrl = import.meta.env.VITE_DEV_API_URL || '';
    const response = await fetch(`${baseUrl}/api/stats`);
    const data = await response.json();
    directApiTest.value = { success: response.ok, data };
  } catch (error) {
    directApiTest.value = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Test system stats via DataService
const testSystemStats = async () => {
  try {
    await dataService.ensure('stats');
    systemStatsTest.value = {
      success: true,
      data: packetStore.systemStats || undefined,
    };
  } catch (error) {
    systemStatsTest.value = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Test store-based API calls via DataService
const testStore = async () => {
  try {
    await dataService.ensure('packetStats');
    await dataService.ensure('recentPackets');
  } catch (error) {
    console.error('Store test error:', error);
  }
};

onMounted(async () => {
  await testDirectApi();
  await testSystemStats();
  await testStore();
});
</script>

<template>
  <div class="glass-card rounded-[15px] p-4 mb-4">
    <h3 class="text-white text-lg font-semibold mb-3">API Status</h3>

    <!-- Direct API Test -->
    <div class="mb-3">
      <h4 class="text-content-muted text-sm mb-2">Direct API Test</h4>
      <div v-if="directApiTest" class="space-y-1">
        <div class="flex items-center gap-2">
          <div
            :class="directApiTest.success ? 'bg-accent-green' : 'bg-accent-red'"
            class="w-2 h-2 rounded-full"
          ></div>
          <span
            :class="directApiTest.success ? 'text-accent-green' : 'text-accent-red'"
            class="text-sm"
          >
            {{ directApiTest.success ? 'Connected' : 'Failed' }}
          </span>
        </div>
        <div v-if="directApiTest.error" class="text-accent-red text-xs">
          {{ directApiTest.error }}
        </div>
        <div v-if="directApiTest.data" class="text-content-muted text-xs">
          Version: {{ directApiTest.data.version || 'Unknown' }}
        </div>
      </div>
    </div>

    <!-- System Stats API Test -->
    <div class="mb-3">
      <h4 class="text-content-muted text-sm mb-2">System Stats API Test</h4>
      <div v-if="systemStatsTest" class="space-y-1">
        <div class="flex items-center gap-2">
          <div
            :class="systemStatsTest.success ? 'bg-accent-green' : 'bg-accent-red'"
            class="w-2 h-2 rounded-full"
          ></div>
          <span
            :class="systemStatsTest.success ? 'text-accent-green' : 'text-accent-red'"
            class="text-sm"
          >
            {{ systemStatsTest.success ? 'Connected' : 'Failed' }}
          </span>
        </div>
        <div v-if="systemStatsTest.error" class="text-accent-red text-xs">
          {{ systemStatsTest.error }}
        </div>
        <div v-if="systemStatsTest.data" class="text-content-muted text-xs">
          Uptime: {{ Math.floor(((systemStatsTest.data as any).uptime_seconds || 0) / 3600) }}h
        </div>
      </div>
    </div>

    <!-- Store API Test -->
    <div>
      <h4 class="text-content-muted text-sm mb-2">Packet Store Status</h4>
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <div
            :class="
              packetStore.error
                ? 'bg-accent-red'
                : packetStore.hasPacketStats || packetStore.hasRecentPackets
                  ? 'bg-accent-green'
                  : 'bg-secondary'
            "
            class="w-2 h-2 rounded-full"
          ></div>
          <span
            :class="
              packetStore.error
                ? 'text-accent-red'
                : packetStore.hasPacketStats || packetStore.hasRecentPackets
                  ? 'text-accent-green'
                  : 'text-secondary'
            "
            class="text-sm"
          >
            {{
              packetStore.error
                ? 'Error'
                : packetStore.hasPacketStats || packetStore.hasRecentPackets
                  ? 'Data Loaded'
                  : 'No Data'
            }}
          </span>
        </div>
        <div v-if="packetStore.error" class="text-accent-red text-xs">
          {{ packetStore.error }}
        </div>
        <div v-if="packetStore.hasPacketStats" class="text-content-muted text-xs">
          Total Packets: {{ packetStore.totalPackets }}
        </div>
        <div v-if="packetStore.hasRecentPackets" class="text-content-muted text-xs">
          Recent Packets: {{ packetStore.recentPackets.length }}
        </div>
        <div v-if="packetStore.lastUpdated" class="text-content-muted text-xs">
          Updated: {{ packetStore.lastUpdated.toLocaleTimeString() }}
        </div>
        <div v-if="packetStore.isLoading" class="text-primary text-xs">Loading...</div>
      </div>
    </div>
  </div>
</template>
