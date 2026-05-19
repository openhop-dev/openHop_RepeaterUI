<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { usePacketStore } from '@/stores/packets';
import { useDataService } from '@/stores/dataService';
import type { RecentPacket } from '@/types/api';
import PacketDetailsModal from '@/components/modals/PacketDetailsModal.vue';
import Spinner from '@/components/ui/Spinner.vue';
import { getPreference, setPreference } from '@/utils/preferences';

defineOptions({ name: 'PacketTable' });

const packetStore = usePacketStore();
const dataService = useDataService();
const currentPage = ref(1);
const itemsPerPage = 10;

// Record limit management
const currentLimit = ref(100);
const isLoadingMore = ref(false);
const maxLimit = 1000; // Reasonable maximum to prevent performance issues

// Debounced loading state
const showLoadingIndicator = ref(false);
let hideTimeout: number | null = null;

// Watch store's loading state
watch(
  () => packetStore.isLoading,
  (isLoading) => {
    if (isLoading) {
      // Show immediately when loading starts
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      showLoadingIndicator.value = true;
    } else {
      // Keep showing for 600ms after loading finishes
      hideTimeout = window.setTimeout(() => {
        showLoadingIndicator.value = false;
        hideTimeout = null;
      }, 600);
    }
  },
);

// Modal state
const selectedPacket = ref<RecentPacket | null>(null);
const isModalOpen = ref(false);

// Open packet details modal, then enrich with full detail fields (header, raw_packet)
// lazily so the list queries stay lean.
const openPacketDetails = async (packet: RecentPacket) => {
  selectedPacket.value = packet;
  isModalOpen.value = true;
  if (packet.packet_hash && (!packet.header || !packet.raw_packet)) {
    try {
      const full = await packetStore.getPacketByHash(packet.packet_hash);
      if (full && selectedPacket.value?.packet_hash === packet.packet_hash) {
        selectedPacket.value = { ...selectedPacket.value, ...full };
      }
    } catch {
      // Non-fatal: modal renders with partial data
    }
  }
};

// Close modal
const closeModal = () => {
  isModalOpen.value = false;
  selectedPacket.value = null;
};

// Filter states
const selectedType = ref<string>(getPreference('packetTable_selectedType', 'all'));
const selectedRoute = ref<string>(getPreference('packetTable_selectedRoute', 'all'));
const showOnlyNewPackets = ref<boolean>(false); // Don't persist - temporary filter
const newPacketsTimestamp = ref<number | null>(null);

// Available filter options
const packetTypes = ['all', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const routeTypes = ['all', '1', '2'];

// Watch for changes and persist to localStorage
watch(selectedType, (value) => {
  setPreference('packetTable_selectedType', value);
  currentPage.value = 1; // Reset to page 1 when filter changes
});
watch(selectedRoute, (value) => {
  setPreference('packetTable_selectedRoute', value);
  currentPage.value = 1; // Reset to page 1 when filter changes
});
watch(showOnlyNewPackets, () => {
  currentPage.value = 1; // Reset to page 1 when filter changes
});

const filteredPackets = computed(() => {
  let filtered = packetStore.recentPackets;

  if (selectedType.value !== 'all') {
    const typeNum = parseInt(selectedType.value);
    filtered = filtered.filter((packet) => packet.type === typeNum);
  }

  if (selectedRoute.value !== 'all') {
    const routeNum = parseInt(selectedRoute.value);
    filtered = filtered.filter((packet) => packet.route === routeNum);
  }

  // Filter for new packets only if enabled
  if (showOnlyNewPackets.value && newPacketsTimestamp.value !== null) {
    filtered = filtered.filter((packet) => packet.timestamp >= newPacketsTimestamp.value!);
  }

  return filtered;
});

const paginatedPackets = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredPackets.value.slice(start, end);
});

const totalPages = computed(() => {
  return Math.ceil(filteredPackets.value.length / itemsPerPage);
});

// Check if we're on the last page and might need more data
const isOnLastPage = computed(() => {
  return currentPage.value === totalPages.value;
});

// Check if we might have more data to load (reached current limit)
const mightHaveMoreData = computed(() => {
  return packetStore.recentPackets.length >= currentLimit.value && currentLimit.value < maxLimit;
});

// Check if we should show the "Load More" option
const shouldShowLoadMore = computed(() => {
  return isOnLastPage.value && mightHaveMoreData.value && !isLoadingMore.value;
});

const formatTime = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, { hour12: true });
};

const getPacketTypeName = (type: number) => {
  const typeNames: Record<number, string> = {
    0: 'REQ',
    1: 'RESPONSE',
    2: 'TXT_MSG',
    3: 'ACK',
    4: 'ADVERT',
    5: 'GRP_TXT',
    6: 'GRP_DATA',
    7: 'ANON_REQ',
    8: 'PATH',
    9: 'TRACE',
    10: 'MULTI_PART',
    11: 'CONTROL',
  };
  return typeNames[type] || `TYPE_${type}`;
};

const getRouteTypeName = (route: number) => {
  const routeNames: Record<number, string> = {
    0: 'T-Flood',
    1: 'Flood',
    2: 'Direct',
    3: 'T-Direct',
  };
  return routeNames[route] || `Route ${route}`;
};

const getStatusClass = (packet: RecentPacket) => {
  return packet.transmitted ? 'text-accent-green' : 'text-primary';
};

const getStatusText = (packet: RecentPacket) => {
  if (packet.drop_reason) {
    return 'Dropped';
  }
  return packet.transmitted ? 'Forward' : 'Received';
};

const getRouteClass = (route: number) => {
  return route === 1
    ? 'bg-badge-cyan-bg text-badge-cyan-text'
    : 'bg-badge-neutral-bg text-badge-neutral-text';
};

const getPacketTypeIndicatorColor = (type: number) => {
  const colors: Record<number, string> = {
    0: 'bg-primary', // REQ - Primary cyan
    1: 'bg-accent-green', // RESPONSE - Green
    2: 'bg-secondary', // TXT_MSG - Yellow
    3: 'bg-accent-purple', // ACK - Purple
    4: 'bg-accent-red', // ADVERT - Red
    5: 'bg-accent-cyan', // GRP_TXT - Cyan
    6: 'bg-primary', // GRP_DATA - Primary (reuse)
    7: 'bg-accent-purple', // ANON_REQ - Purple (reuse)
    8: 'bg-accent-green', // PATH - Green (reuse)
    9: 'bg-secondary', // TRACE - Yellow (reuse)
  };
  return colors[type] || 'bg-gray-500';
};

const getPacketTypeColor = (type: number) => {
  const colors: Record<number, string> = {
    0: 'border-l-primary', // REQ - Primary cyan
    1: 'border-l-accent-green', // RESPONSE - Green
    2: 'border-l-secondary', // TXT_MSG - Yellow
    3: 'border-l-accent-purple', // ACK - Purple
    4: 'border-l-accent-red', // ADVERT - Red
    5: 'border-l-accent-cyan', // GRP_TXT - Cyan
    6: 'border-l-primary', // GRP_DATA - Primary (reuse)
    7: 'border-l-accent-purple', // ANON_REQ - Purple (reuse)
    8: 'border-l-accent-green', // PATH - Green (reuse)
    9: 'border-l-secondary', // TRACE - Yellow (reuse)
  };
  return colors[type] || 'border-l-gray-500';
};

// Get LBT indicator color based on attempts
const getLbtIndicatorColor = (packet: RecentPacket) => {
  if (!packet.transmitted || !packet.lbt_attempts || packet.lbt_attempts === 0) {
    return 'bg-green-400'; // Clear channel or no LBT needed
  }
  if (packet.lbt_attempts === 1) {
    return 'bg-cyan-400'; // Light congestion
  }
  if (packet.lbt_attempts === 2) {
    return 'bg-yellow-400'; // Moderate congestion
  }
  return 'bg-orange-400'; // Heavy congestion (3+)
};

// Format delay value - convert to seconds if >= 1000ms
const formatDelay = (delayMs: number): string => {
  if (delayMs >= 1000) {
    return (delayMs / 1000).toFixed(2) + 's';
  }
  return delayMs.toFixed(1) + 'ms';
};

// Parse JSON path string into array
const parsePathString = (pathString?: string[] | string | null): string[] => {
  if (!pathString) return [];
  if (Array.isArray(pathString)) return pathString;
  if (typeof pathString === 'string') {
    try {
      const parsed = JSON.parse(pathString);
      // Handle doubly-encoded JSON (API returns "[\"B5\"]" which parses to "["B5"]")
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Path segments: full hop chunks from the API. Src/dst below use slice(-4) only for compact node-id display in the table.
// Get path information for display
const getPathInfo = (packet: RecentPacket) => {
  const originalPath = parsePathString(packet.original_path);
  const forwardedPath = parsePathString(packet.forwarded_path);
  const path = originalPath.length > 0 ? originalPath : forwardedPath;

  if (path.length === 0) {
    return null;
  }
  return {
    hops: path.length - 1, // Number of hops (excluding source)
    // Each entry is a full hop chunk (2/4/8 hex chars for 1/2/4-byte path modes); normalize case for display.
    nodes: path.map((hash) => hash.toUpperCase()),
  };
};

// Extract node name from ADVERT packet payload
const getAdvertNodeName = (packet: RecentPacket): string | null => {
  if (packet.type !== 4 || !packet.payload) return null;

  try {
    const cleanPayload = packet.payload.replace(/\s+/g, '').toUpperCase();
    let appDataHex = cleanPayload;
    let appDataOffset = 0;

    // Check if this is a complete ADVERT packet or just AppData
    const payloadBytes = cleanPayload.length / 2;

    if (payloadBytes >= 100) {
      // This looks like a complete ADVERT packet - skip to AppData
      // Skip public key (32 bytes) + timestamp (4 bytes) + signature (64 bytes) = 100 bytes = 200 hex chars
      if (cleanPayload.length > 200) {
        appDataHex = cleanPayload.slice(200);
        appDataOffset = 0;
      } else {
        return null; // Not enough data
      }
    }

    // Parse AppData structure to find node name
    if (appDataHex.length >= 2) {
      // Read flags byte
      const flagsByte = parseInt(appDataHex.slice(0, 2), 16);
      appDataOffset += 2;

      const hasLocation = !!(flagsByte & 0x10);
      const hasFeature1 = !!(flagsByte & 0x20);
      const hasFeature2 = !!(flagsByte & 0x40);
      const hasName = !!(flagsByte & 0x80);

      if (!hasName) return null; // No name flag set

      // Skip location data if present (8 bytes)
      if (hasLocation && appDataHex.length >= appDataOffset + 16) {
        appDataOffset += 16;
      }

      // Skip feature 1 if present (2 bytes)
      if (hasFeature1 && appDataHex.length >= appDataOffset + 4) {
        appDataOffset += 4;
      }

      // Skip feature 2 if present (2 bytes)
      if (hasFeature2 && appDataHex.length >= appDataOffset + 4) {
        appDataOffset += 4;
      }

      // Extract node name (remaining bytes)
      if (appDataHex.length > appDataOffset) {
        const nameHex = appDataHex.slice(appDataOffset);
        const nameBytes = nameHex.match(/.{2}/g) || [];
        const nameString = nameBytes
          .map((byte) => {
            const charCode = parseInt(byte, 16);
            return charCode >= 32 && charCode <= 126 ? String.fromCharCode(charCode) : '.';
          })
          .join('')
          .replace(/\.*$/, ''); // Remove trailing dots and null bytes

        return nameString.length > 0 ? nameString : null;
      }
    }
  } catch (error) {
    console.error('Error parsing ADVERT node name:', error);
  }

  return null;
};

const resetFilters = () => {
  selectedType.value = 'all';
  selectedRoute.value = 'all';
  showOnlyNewPackets.value = false;
  newPacketsTimestamp.value = null;
  currentPage.value = 1;
};

// Toggle new packets filter
const toggleNewPacketsFilter = () => {
  if (showOnlyNewPackets.value) {
    // Turning off the filter
    showOnlyNewPackets.value = false;
    newPacketsTimestamp.value = null;
  } else {
    // Turning on the filter - capture current timestamp
    showOnlyNewPackets.value = true;
    newPacketsTimestamp.value = Date.now() / 1000; // Convert to seconds to match packet timestamps
  }
  currentPage.value = 1; // Reset to first page
};

// Format the timestamp when the filter was activated
const formatFilterTime = computed(() => {
  if (!newPacketsTimestamp.value) return '';
  const date = new Date(newPacketsTimestamp.value * 1000);
  return date.toLocaleTimeString(undefined, { hour12: true });
});

const fetchData = async (limit?: number) => {
  try {
    const fetchLimit = limit || currentLimit.value;
    await packetStore.fetchRecentPackets({ limit: fetchLimit });
  } catch (error) {
    console.error('Error fetching packet data:', error);
  }
};

// Load more records function
const loadMoreRecords = async () => {
  if (isLoadingMore.value || currentLimit.value >= maxLimit) return;

  isLoadingMore.value = true;
  try {
    // Increase limit by 200 records
    const newLimit = Math.min(currentLimit.value + 200, maxLimit);
    currentLimit.value = newLimit;
    await fetchData(newLimit);
  } catch (error) {
    console.error('Error loading more records:', error);
  } finally {
    isLoadingMore.value = false;
  }
};

onMounted(() => {
  // Bootstrap already loaded recentPackets; this is a safety net for edge cases.
  // WS push handles live updates; no polling needed.
  void dataService.ensure('recentPackets');
});

onBeforeUnmount(() => {
  // Clean up timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
});
</script>

<template>
  <div class="glass-card rounded-[20px] p-6">
    <!-- Header with title and filters -->
    <div
      class="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4 filter-container"
    >
      <div class="flex items-center gap-2 header-info relative">
        <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold">
          Recent Packets
        </h3>
        <span class="text-content-secondary dark:text-content-muted text-sm packet-count">
          ({{ filteredPackets.length }} of {{ packetStore.recentPackets.length }})
        </span>
        <span
          v-if="showOnlyNewPackets"
          class="text-primary text-xs sm:text-sm bg-primary/10 px-2 py-1 rounded-md border border-primary/20 live-mode-badge whitespace-nowrap"
          :title="`Filter activated at ${formatFilterTime}`"
        >
          <span class="hidden sm:inline">Live Mode (since {{ formatFilterTime }})</span>
          <span class="sm:hidden">Live</span>
        </span>
        <!-- <transition name="fade">
          <div v-if="showLoadingIndicator" class="absolute -right-6 top-1/2 -translate-y-1/2 text-primary loading-indicator">
            <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </transition> -->
        <span v-if="packetStore.error" class="text-accent-red text-sm error-indicator">{{
          packetStore.error
        }}</span>
      </div>

      <!-- Desktop: Horizontal layout, Mobile: Grid layout -->
      <div class="flex items-center gap-3 lg:flex filter-controls">
        <!-- Type Filter -->
        <div class="flex flex-col">
          <label class="text-content-secondary dark:text-content-muted text-xs mb-1">Type</label>
          <select
            v-model="selectedType"
            class="glass-card border border-stroke-subtle dark:border-stroke rounded-[10px] px-3 py-2 text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all duration-200 min-w-[120px] cursor-pointer hover:border-primary/50"
          >
            <option
              v-for="type in packetTypes"
              :key="type"
              :value="type"
              class="bg-surface dark:bg-surface-elevated text-content-primary dark:text-content-primary"
            >
              {{
                type === 'all' ? 'All Types' : `Type ${type} (${getPacketTypeName(parseInt(type))})`
              }}
            </option>
          </select>
        </div>

        <!-- Route Filter -->
        <div class="flex flex-col">
          <label class="text-content-secondary dark:text-content-muted text-xs mb-1">Route</label>
          <select
            v-model="selectedRoute"
            class="glass-card border border-stroke-subtle dark:border-stroke rounded-[10px] px-3 py-2 text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all duration-200 min-w-[120px] cursor-pointer hover:border-primary/50"
          >
            <option
              v-for="route in routeTypes"
              :key="route"
              :value="route"
              class="bg-surface dark:bg-surface-elevated text-content-primary dark:text-content-primary"
            >
              {{
                route === 'all'
                  ? 'All Routes'
                  : `Route ${route} (${getRouteTypeName(parseInt(route))})`
              }}
            </option>
          </select>
        </div>

        <!-- New Packets Filter Button -->
        <div class="flex flex-col">
          <label class="text-content-secondary dark:text-content-muted text-xs mb-1">Filter</label>
          <button
            @click="toggleNewPacketsFilter"
            class="glass-card border rounded-[10px] px-4 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20 min-w-[120px]"
            :class="{
              'border-primary bg-primary/10 text-primary': showOnlyNewPackets,
              'border-stroke-subtle dark:border-stroke text-content-secondary dark:text-content-muted hover:border-primary hover:text-content-primary dark:hover:text-content-primary hover:bg-primary/5':
                !showOnlyNewPackets,
            }"
          >
            {{ showOnlyNewPackets ? 'New Only' : 'Show New' }}
          </button>
        </div>

        <!-- Reset Button -->
        <div class="flex flex-col reset-container">
          <label class="text-transparent text-xs mb-1">.</label>
          <button
            @click="resetFilters"
            class="glass-card border border-stroke-subtle dark:border-stroke hover:border-primary rounded-[10px] px-4 py-2 text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary text-sm transition-all duration-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            :disabled="selectedType === 'all' && selectedRoute === 'all' && !showOnlyNewPackets"
            :class="{
              'opacity-50 cursor-not-allowed hover:border-stroke-subtle dark:hover:border-stroke hover:text-content-secondary dark:hover:text-content-muted':
                selectedType === 'all' && selectedRoute === 'all' && !showOnlyNewPackets,
              'hover:bg-primary/10':
                selectedType !== 'all' || selectedRoute !== 'all' || showOnlyNewPackets,
            }"
          >
            Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Table Header - Desktop only -->
    <div
      class="hidden lg:grid grid-cols-12 gap-2 pb-3 border-b border-stroke-subtle dark:border-stroke text-content-secondary dark:text-content-muted text-xs uppercase mb-4"
    >
      <div class="col-span-1">Time</div>
      <div class="col-span-1">Type</div>
      <div class="col-span-2">Route</div>
      <div class="col-span-1">LEN</div>
      <div class="col-span-2">Path/Hashes</div>
      <div class="col-span-1">RSSI</div>
      <div class="col-span-1">SNR</div>
      <div class="col-span-1">Score</div>
      <div class="col-span-1">TX Delay</div>
      <div class="col-span-1">Status</div>
    </div>

    <!-- Table Rows -->
    <div class="space-y-4 overflow-hidden">
      <div class="space-y-4">
        <div
          v-for="(packet, index) in paginatedPackets"
          :key="`${packet.packet_hash}_${packet.timestamp}_${index}`"
          class="packet-row border-b border-stroke-subtle dark:border-dark-border/50 pb-4 hover:bg-background-mute dark:hover:bg-stroke/5 transition-colors duration-150 cursor-pointer rounded-[10px] p-2 border-l-4"
          :class="getPacketTypeColor(packet.type)"
          @click="openPacketDetails(packet)"
        >
          <!-- Desktop Table View -->
          <div class="hidden lg:grid grid-cols-12 gap-2 items-center">
            <div class="col-span-1 text-content-primary dark:text-content-primary text-sm">
              {{ formatTime(packet.timestamp) }}
            </div>
            <div class="col-span-1 flex items-center gap-2">
              <div
                class="w-2 h-2 rounded-full"
                :class="getPacketTypeIndicatorColor(packet.type)"
              ></div>
              <div class="flex flex-col">
                <span class="text-content-primary dark:text-content-primary text-xs">{{
                  getPacketTypeName(packet.type)
                }}</span>
                <!-- Node name for ADVERT packets - subtle text below type -->
                <span
                  v-if="packet.type === 4 && getAdvertNodeName(packet)"
                  class="text-accent-red/70 text-[10px] font-medium max-w-[80px] truncate"
                  :title="getAdvertNodeName(packet) || undefined"
                >
                  {{ getAdvertNodeName(packet) }}
                </span>
              </div>
            </div>
            <div class="col-span-2">
              <span
                class="inline-block px-2 py-1 rounded text-xs font-medium"
                :class="getRouteClass(packet.route)"
              >
                {{ getRouteTypeName(packet.route) }}
              </span>
            </div>
            <div class="col-span-1 text-content-primary dark:text-content-primary text-xs">
              {{ packet.length }}B
            </div>
            <div class="col-span-2">
              <div class="space-y-1">
                <!-- Check if we have path information -->
                <template v-if="getPathInfo(packet)">
                  <!-- Show actual path with intermediate hops -->
                  <div class="flex items-center gap-0.5 flex-wrap">
                    <template v-for="(node, idx) in getPathInfo(packet)!.nodes" :key="idx">
                      <span
                        class="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold leading-tight tracking-tight"
                        :class="
                          idx === 0
                            ? 'bg-badge-cyan-bg text-badge-cyan-text'
                            : 'bg-gray-500/20 text-content-muted dark:text-content-muted'
                        "
                        :title="node"
                      >
                        {{ node }}
                      </span>
                      <svg
                        v-if="idx < getPathInfo(packet)!.nodes.length - 1"
                        class="w-2.5 h-2.5 text-content-muted dark:text-content-muted/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M9 5l7 7-7 7"
                        ></path>
                      </svg>
                    </template>
                    <span
                      v-if="getPathInfo(packet)!.hops > 0"
                      class="text-[9px] text-content-muted dark:text-content-muted ml-1"
                    >
                      ({{ getPathInfo(packet)!.hops }} hop{{
                        getPathInfo(packet)!.hops > 1 ? 's' : ''
                      }})
                    </span>
                  </div>
                </template>
                <template v-else>
                  <!-- Fallback: compact src/dst (node hashes, not per-hop path chunks) -->
                  <div class="flex items-center gap-1">
                    <span
                      class="inline-block px-2 py-0.5 rounded bg-badge-cyan-bg text-badge-cyan-text text-xs font-mono"
                    >
                      {{ packet.src_hash?.slice(-4).toUpperCase() || '????' }}
                    </span>
                    <svg
                      class="w-3 h-3 text-content-muted dark:text-content-muted/60"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M9 5l7 7-7 7"
                      ></path>
                    </svg>
                    <span
                      class="inline-block px-2 py-0.5 rounded text-xs font-mono"
                      :class="
                        packet.dst_hash
                          ? 'bg-badge-cyan-bg text-badge-cyan-text'
                          : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                      "
                    >
                      {{ packet.dst_hash ? packet.dst_hash.slice(-4).toUpperCase() : 'BCAST' }}
                    </span>
                  </div>
                </template>
              </div>
            </div>
            <div class="col-span-1 text-content-primary dark:text-content-primary text-xs">
              {{ packet.rssi != null ? packet.rssi.toFixed(0) + ' dBm' : 'N/A' }}
            </div>
            <div class="col-span-1 text-content-primary dark:text-content-primary text-xs">
              {{ packet.snr != null ? packet.snr.toFixed(1) + 'dB' : 'N/A' }}
            </div>
            <div class="col-span-1 text-content-primary dark:text-content-primary text-xs">
              {{ packet.score != null ? packet.score.toFixed(2) : 'N/A' }}
            </div>
            <div class="col-span-1 text-content-primary dark:text-content-primary text-xs">
              <div v-if="Number(packet.tx_delay_ms) > 0" class="flex items-center gap-1">
                <div
                  v-if="packet.transmitted"
                  class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  :class="getLbtIndicatorColor(packet)"
                ></div>
                <span>{{ formatDelay(Number(packet.tx_delay_ms)) }}</span>
              </div>
            </div>
            <div class="col-span-1">
              <div>
                <span class="text-xs font-medium" :class="getStatusClass(packet)">{{
                  getStatusText(packet)
                }}</span>
                <p v-if="packet.drop_reason" class="text-accent-red text-[8px] italic truncate">
                  {{ packet.drop_reason }}
                </p>
              </div>
            </div>
          </div>

          <!-- Mobile Condensed List View -->
          <div class="lg:hidden space-y-2">
            <!-- Line 1: Type badge + Timestamp + Status -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="w-2 h-2 rounded-full flex-shrink-0"
                  :class="getPacketTypeIndicatorColor(packet.type)"
                ></div>
                <div class="flex flex-col">
                  <span
                    class="text-content-primary dark:text-content-primary text-sm font-medium"
                    >{{ getPacketTypeName(packet.type) }}</span
                  >
                  <!-- Node name for ADVERT packets -->
                  <span
                    v-if="packet.type === 4 && getAdvertNodeName(packet)"
                    class="text-accent-red/70 text-[10px] font-medium leading-tight"
                    :title="getAdvertNodeName(packet) || undefined"
                  >
                    {{ getAdvertNodeName(packet) }}
                  </span>
                </div>
                <span
                  class="inline-block px-2 py-1 rounded text-xs font-medium ml-2"
                  :class="getRouteClass(packet.route)"
                >
                  {{ getRouteTypeName(packet.route) }}
                </span>
              </div>
              <div class="flex items-center gap-2 text-right">
                <span class="text-content-secondary dark:text-content-muted text-xs">{{
                  formatTime(packet.timestamp)
                }}</span>
                <span class="text-xs font-medium" :class="getStatusClass(packet)">{{
                  getStatusText(packet)
                }}</span>
              </div>
            </div>

            <!-- Line 2: Path + Signal strength indicator -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <!-- Check if we have path information -->
                <template v-if="getPathInfo(packet)">
                  <!-- Show actual path with intermediate hops -->
                  <div class="flex flex-wrap items-center gap-0.5">
                    <span class="text-content-muted dark:text-content-muted text-[10px] font-medium"
                      >PATH</span
                    >
                    <template v-for="(node, idx) in getPathInfo(packet)!.nodes" :key="idx">
                      <span
                        class="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold leading-tight tracking-tight"
                        :class="
                          idx === 0
                            ? 'bg-badge-cyan-bg text-badge-cyan-text'
                            : 'bg-gray-500/20 text-content-muted dark:text-content-muted'
                        "
                        :title="node"
                      >
                        {{ node }}
                      </span>
                      <svg
                        v-if="idx < getPathInfo(packet)!.nodes.length - 1"
                        class="w-2.5 h-2.5 text-content-muted dark:text-content-muted/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M9 5l7 7-7 7"
                        ></path>
                      </svg>
                    </template>
                    <span
                      v-if="getPathInfo(packet)!.hops > 0"
                      class="text-[9px] text-content-muted dark:text-content-muted ml-1"
                    >
                      ({{ getPathInfo(packet)!.hops }} hop{{
                        getPathInfo(packet)!.hops > 1 ? 's' : ''
                      }})
                    </span>
                  </div>
                </template>
                <template v-else>
                  <!-- Fallback to src/dst display when no path info -->
                  <!-- Source Node -->
                  <div class="flex items-center gap-1">
                    <span class="text-content-muted dark:text-content-muted text-[10px] font-medium"
                      >SRC</span
                    >
                    <span
                      class="inline-block px-2 py-0.5 rounded bg-badge-cyan-bg text-badge-cyan-text text-xs font-mono font-semibold"
                    >
                      {{ packet.src_hash?.slice(-4) || '????' }}
                    </span>
                  </div>

                  <!-- Path Arrow/Indicator -->
                  <div
                    class="flex items-center gap-0.5 text-content-muted dark:text-content-muted/60"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M9 5l7 7-7 7"
                      ></path>
                    </svg>
                    <span
                      v-if="packet.route === 1"
                      class="text-[9px] font-medium"
                      title="Multi-hop path"
                    >
                      <svg
                        class="w-2.5 h-2.5 inline"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13 5l7 7-7 7M5 5l7 7-7 7"
                        ></path>
                      </svg>
                    </span>
                  </div>

                  <!-- Destination Node -->
                  <div class="flex items-center gap-1">
                    <span
                      class="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold"
                      :class="
                        packet.dst_hash
                          ? 'bg-badge-cyan-bg text-badge-cyan-text'
                          : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                      "
                    >
                      {{ packet.dst_hash ? packet.dst_hash.slice(-4).toUpperCase() : 'BCAST' }}
                    </span>
                    <span class="text-content-muted dark:text-content-muted text-[10px] font-medium"
                      >DST</span
                    >
                  </div>
                </template>
              </div>
              <div class="flex items-center gap-2">
                <!-- Signal strength visual indicator -->
                <div class="flex items-center gap-1">
                  <div v-if="packet.snr != null" class="flex gap-0.5">
                    <div
                      class="w-1 h-3 rounded-sm"
                      :class="packet.snr >= -10 ? 'bg-green-400' : 'bg-white/20'"
                    ></div>
                    <div
                      class="w-1 h-4 rounded-sm"
                      :class="packet.snr >= -5 ? 'bg-green-400' : 'bg-white/20'"
                    ></div>
                    <div
                      class="w-1 h-5 rounded-sm"
                      :class="packet.snr >= 0 ? 'bg-green-400' : 'bg-white/20'"
                    ></div>
                    <div
                      class="w-1 h-6 rounded-sm"
                      :class="packet.snr >= 10 ? 'bg-green-400' : 'bg-white/20'"
                    ></div>
                  </div>
                  <span class="text-content-primary dark:text-content-primary text-xs">{{
                    packet.rssi != null ? packet.rssi.toFixed(0) + 'dBm' : 'TX'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Line 3: Technical details -->
            <div
              class="flex items-center justify-between text-content-secondary dark:text-content-muted text-xs"
            >
              <div class="flex items-center gap-3">
                <span>{{ packet.length }}B</span>
                <span>SNR: {{ packet.snr != null ? packet.snr.toFixed(1) + 'dB' : 'N/A' }}</span>
                <span>Score: {{ packet.score != null ? packet.score.toFixed(2) : 'N/A' }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="Number(packet.tx_delay_ms) > 0" class="flex items-center gap-1">
                  <div
                    v-if="packet.transmitted"
                    class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    :class="getLbtIndicatorColor(packet)"
                  ></div>
                  <span>{{ formatDelay(Number(packet.tx_delay_ms)) }}</span>
                </span>
              </div>
            </div>

            <!-- Drop reason (if any) -->
            <div v-if="packet.drop_reason" class="text-accent-red text-xs italic">
              {{ packet.drop_reason }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination Controls -->
    <div
      v-if="totalPages > 1"
      class="flex justify-between items-center mt-6 pt-4 border-t border-stroke-subtle dark:border-stroke pagination-container"
    >
      <div class="flex items-center gap-4 pagination-info">
        <span class="text-content-secondary dark:text-content-muted text-sm">
          Showing {{ (currentPage - 1) * itemsPerPage + 1 }} -
          {{ Math.min(currentPage * itemsPerPage, filteredPackets.length) }}
          of {{ filteredPackets.length }} packets
        </span>

        <!-- Load More Records Button -->
        <div v-if="shouldShowLoadMore" class="flex items-center gap-2 load-more-section">
          <span class="text-content-secondary dark:text-content-muted text-xs">•</span>
          <button
            @click="loadMoreRecords"
            :disabled="isLoadingMore"
            class="glass-card border border-primary rounded-[8px] px-3 py-1.5 text-xs transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20 hover:bg-primary/5"
            :class="{
              'text-primary border-primary cursor-pointer': !isLoadingMore,
              'text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke cursor-not-allowed opacity-50':
                isLoadingMore,
            }"
          >
            {{
              isLoadingMore ? 'Loading...' : `Load ${Math.min(200, maxLimit - currentLimit)} more`
            }}
          </button>
          <span class="text-content-secondary dark:text-content-muted text-xs load-more-count"
            >({{ currentLimit }}/{{ maxLimit }} max)</span
          >
        </div>
      </div>

      <div class="flex items-center gap-2 pagination-controls">
        <!-- Previous Page Button -->
        <button
          @click="currentPage = currentPage - 1"
          :disabled="currentPage <= 1"
          class="glass-card border rounded-[10px] px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20 prev-next-btn"
          :class="{
            'border-stroke-subtle dark:border-stroke text-content-muted dark:text-content-muted cursor-not-allowed opacity-50':
              currentPage <= 1,
            'border-stroke-subtle dark:border-stroke text-content-primary dark:text-content-primary hover:border-primary hover:text-primary hover:bg-primary/5':
              currentPage > 1,
          }"
        >
          <span class="hidden sm:inline">Previous</span>
          <span class="sm:hidden">‹</span>
        </button>

        <!-- Page Numbers -->
        <div class="flex items-center gap-1 page-numbers">
          <!-- First page -->
          <button
            v-if="currentPage > 3"
            @click="currentPage = 1"
            class="glass-card border border-stroke-subtle dark:border-stroke hover:border-primary rounded-[8px] px-3 py-2 text-sm text-content-primary dark:text-content-primary hover:text-primary hover:bg-primary/5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            1
          </button>

          <!-- Ellipsis -->
          <span
            v-if="currentPage > 4"
            class="text-content-secondary dark:text-content-muted text-sm px-2 ellipsis"
            >...</span
          >

          <!-- Page numbers around current page -->
          <button
            v-for="page in Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              return start + i;
            }).filter((p) => p <= totalPages)"
            :key="page"
            @click="currentPage = page"
            class="glass-card border rounded-[8px] px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20 page-number"
            :class="{
              'border-primary bg-primary/10 text-primary': currentPage === page,
              'border-stroke-subtle dark:border-stroke text-content-primary dark:text-content-primary hover:border-primary hover:text-primary hover:bg-primary/5':
                currentPage !== page,
            }"
          >
            {{ page }}
          </button>

          <!-- Ellipsis -->
          <span
            v-if="currentPage < totalPages - 3"
            class="text-content-secondary dark:text-content-muted text-sm px-2 ellipsis"
            >...</span
          >

          <!-- Last page -->
          <button
            v-if="currentPage < totalPages - 2"
            @click="currentPage = totalPages"
            class="glass-card border border-stroke-subtle dark:border-stroke hover:border-primary rounded-[8px] px-3 py-2 text-sm text-content-primary dark:text-content-primary hover:text-primary hover:bg-primary/5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            {{ totalPages }}
          </button>
        </div>

        <!-- Next Page Button -->
        <button
          @click="currentPage = currentPage + 1"
          :disabled="currentPage >= totalPages"
          class="glass-card border rounded-[10px] px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20 prev-next-btn"
          :class="{
            'border-stroke-subtle dark:border-stroke text-content-muted dark:text-content-muted cursor-not-allowed opacity-50':
              currentPage >= totalPages,
            'border-stroke-subtle dark:border-stroke text-content-primary dark:text-content-primary hover:border-primary hover:text-primary hover:bg-primary/5':
              currentPage < totalPages,
          }"
        >
          <span class="hidden sm:inline">Next</span>
          <span class="sm:inline">›</span>
        </button>
      </div>
    </div>

    <!-- Load More Section (when no pagination needed) -->
    <div
      v-else-if="mightHaveMoreData && !isLoadingMore"
      class="flex justify-center mt-6 pt-4 border-t border-stroke-subtle dark:border-stroke"
    >
      <div class="flex items-center gap-4">
        <span class="text-content-secondary dark:text-content-muted text-sm">
          Showing {{ filteredPackets.length }} packets
        </span>
        <span class="text-content-secondary dark:text-content-muted text-xs">•</span>
        <button
          @click="loadMoreRecords"
          class="glass-card border border-primary rounded-[8px] px-4 py-2 text-sm text-primary hover:bg-primary/5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20"
        >
          Load {{ Math.min(200, maxLimit - currentLimit) }} more records
        </button>
        <span class="text-content-secondary dark:text-content-muted text-xs"
          >({{ currentLimit }}/{{ maxLimit }} max)</span
        >
      </div>
    </div>

    <!-- Loading More Indicator -->
    <div
      v-else-if="isLoadingMore"
      class="flex justify-center mt-6 pt-4 border-t border-stroke-subtle dark:border-stroke"
    >
      <div class="flex items-center gap-2">
        <Spinner size="sm" />
        <span class="text-primary text-sm">Loading more records...</span>
      </div>
    </div>
  </div>

  <!-- Packet Details Modal -->
  <PacketDetailsModal :packet="selectedPacket" :isOpen="isModalOpen" @close="closeModal" />
</template>

<style scoped>
/* Loading indicator fade transition */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease-out,
    transform 0.3s ease-out;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Packet list animations */
.packet-list-enter-active,
.packet-list-leave-active {
  transition: all 0.4s ease-out;
}

.packet-list-move {
  transition: all 0.4s ease-out;
}

.packet-list-enter-from {
  opacity: 0;
  transform: translateY(-30px) scale(0.98);
}

.packet-list-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.packet-list-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.packet-list-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

/* Add a subtle glow effect for new packets */
.packet-row {
  position: relative;
  transition: all 0.3s ease;
}

.packet-list-enter-active .packet-row {
  background: linear-gradient(
    90deg,
    rgba(78, 201, 176, 0.1) 0%,
    rgba(78, 201, 176, 0.05) 50%,
    transparent 100%
  );
  box-shadow: 0 0 20px rgba(78, 201, 176, 0.2);
  border-left: 3px solid rgba(78, 201, 176, 0.6);
  border-radius: 8px;
  padding-left: 12px;
}

/* Subtle hover effect */
.packet-row:hover {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  transition: background 0.2s ease;
}

@media (max-width: 1023px) {
  /* Better mobile filter layout - keep filters in a more compact grid */
  .filter-container {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }

  /* Header info stacks on mobile to prevent cramping */
  .header-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .packet-count {
    order: 1;
  }

  .live-mode-badge {
    order: 2;
    align-self: flex-start;
  }

  .loading-indicator,
  .error-indicator {
    order: 3;
    align-self: flex-start;
  }

  /* Switch to grid layout only on mobile/tablet */
  .filter-controls {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    flex-direction: column; /* Override the flex direction */
  }

  .filter-controls .flex.flex-col {
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
  }

  .filter-controls .flex.flex-col label {
    margin-bottom: 0;
    font-size: 0.75rem;
  }

  /* Reset button spans both columns */
  .reset-container {
    grid-column: span 2 !important;
    display: flex;
    justify-content: center;
    margin-top: 0.5rem;
  }

  /* Mobile pagination improvements */
  .pagination-container {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }

  .pagination-info {
    justify-content: center;
    text-align: center;
    flex-direction: column;
    gap: 0.5rem;
  }

  .load-more-section {
    justify-content: center;
  }

  .load-more-count {
    display: none; /* Hide count on tablet to save space */
  }

  .pagination-controls {
    justify-content: center;
  }

  .page-numbers {
    max-width: 200px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .page-numbers::-webkit-scrollbar {
    display: none;
  }

  .ellipsis {
    display: none; /* Hide ellipsis on tablets */
  }

  .page-number {
    min-width: 40px;
    flex-shrink: 0;
  }
}

@media (max-width: 640px) {
  /* Stack filters vertically only on very small screens */
  .filter-controls {
    grid-template-columns: 1fr !important;
    gap: 0.75rem;
  }

  .reset-container {
    grid-column: span 1 !important;
  }

  /* More compact header on small screens */
  .header-info h3 {
    font-size: 1.125rem; /* Slightly smaller title */
  }

  .packet-count {
    font-size: 0.75rem;
  }

  .live-mode-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
  }

  /* Mobile pagination adjustments */
  .pagination-info span {
    font-size: 0.75rem;
  }

  .prev-next-btn {
    min-width: 40px;
    padding: 0.5rem;
  }

  .page-numbers {
    max-width: 150px;
    gap: 0.25rem;
  }

  .page-number {
    min-width: 36px;
    padding: 0.5rem 0.25rem;
    font-size: 0.75rem;
  }

  .load-more-section button {
    font-size: 0.6rem;
    padding: 0.375rem 0.75rem;
  }
}
</style>
