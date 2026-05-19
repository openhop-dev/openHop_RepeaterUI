<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import ApiService from '@/utils/api';
import { useSystemStore } from '@/stores/system';
import { useNeighborStore, CONTACT_TYPE_MAP } from '@/stores/neighbors';
import type { Advert } from '@/stores/neighbors';
import { useDataService } from '@/stores/dataService';
import DeleteNeighborModal from '@/components/modals/DeleteNeighborModal.vue';
import Spinner from '@/components/ui/Spinner.vue';
import PingResultModal from '@/components/modals/PingResultModal.vue';
import NeighborDetailsModal from '@/components/modals/NeighborDetailsModal.vue';
import NetworkMap from '@/components/neighbors/NetworkMap.vue';
import NeighborTable from '@/components/neighbors/NeighborTable.vue';
import { getPreference, setPreference } from '@/utils/preferences';

defineOptions({ name: 'NeighborsView' });

// Get system store for base coordinates
const systemStore = useSystemStore();
const neighborStore = useNeighborStore();
const dataService = useDataService();

const contactTypes = CONTACT_TYPE_MAP;

// Contact type colors for styling
const contactTypeColors = {
  0: '#6b7280', // gray-500
  1: '#60a5fa', // blue-400
  2: '#34d399', // emerald-400
  3: '#a855f7', // purple-500
  4: '#f59e0b', // amber-500
} as const;

// State — backed by neighborStore
const advertsByType = computed(() => neighborStore.advertsByType);
const loading = computed(() => neighborStore.isLoading);
const error = ref<string | null>(null);

// Hours dropdown
const selectedHours = ref(neighborStore.currentHours);
const hoursOptions = [
  { label: '2 Days', value: 48 },
  { label: '7 Days', value: 168 },
  { label: '14 Days', value: 336 },
  { label: '30 Days', value: 720 },
];
const changeHours = async (hours: number) => {
  selectedHours.value = hours;
  await neighborStore.fetchAll(hours);
};
const isCompactView = ref(getPreference('neighbors_compactView', false));
// Default legend to closed on mobile, open on desktop
const showMapLegend = ref(
  getPreference(
    'neighbors_showMapLegend',
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  ),
);
const showAllMapContacts = ref(getPreference('neighbors_showAllMapContacts', false));

// Global filter state
const showFilters = ref(getPreference('neighbors_showFilters', false));
const filters = ref(
  getPreference('neighbors_filters', {
    zeroHop: 'true', // 'all', 'true', 'false'
    routeType: 'all', // 'all', 'direct', 'flood', 'transport_direct', 'transport_flood'
    searchText: '',
  }),
);

// Watch for changes and persist to localStorage
watch(isCompactView, (value) => setPreference('neighbors_compactView', value));
watch(showMapLegend, (value) => setPreference('neighbors_showMapLegend', value));
watch(showAllMapContacts, (value) => setPreference('neighbors_showAllMapContacts', value));
watch(showFilters, (value) => setPreference('neighbors_showFilters', value));
watch(filters, (value) => setPreference('neighbors_filters', value), { deep: true });

// Modal state
const showDeleteModal = ref(false);

// Ping modal state
const showPingModal = ref(false);
const pingLoading = ref(false);
const pingResult = ref<{
  target_id: string;
  rtt_ms: number;
  snr_db: number;
  rssi: number;
  path: string[];
  tag: number;
  path_hash_mode?: number;
} | null>(null);
const pingError = ref<string | null>(null);
const pingNodeName = ref<string | null>(null);
const selectedNeighborForDeletion = ref<Advert | null>(null);

// Neighbor details modal state
const showDetailsModal = ref(false);
const selectedNeighborForDetails = ref<Advert | null>(null);

// Convert Advert to Neighbor interface for modal
const neighborForModal = computed(() => {
  if (!selectedNeighborForDeletion.value) return null;
  const advert = selectedNeighborForDeletion.value;
  return {
    id: advert.id,
    pubkey: advert.pubkey,
    node_name: advert.node_name,
    contact_type: advert.contact_type,
    latitude: advert.latitude,
    longitude: advert.longitude,
    rssi: advert.rssi,
    snr: advert.snr,
    route_type: advert.route_type,
    last_seen: advert.last_seen,
    first_seen: advert.first_seen,
    advert_count: advert.advert_count,
    timestamp: advert.timestamp,
    is_repeater: advert.is_repeater,
    is_new_neighbor: advert.is_new_neighbor,
    zero_hop: advert.zero_hop,
  };
});

// Base coordinates from system store
const baseLatitude = computed(() => systemStore.stats?.config?.repeater?.latitude);
const baseLongitude = computed(() => systemStore.stats?.config?.repeater?.longitude);
const statsLoading = computed(() => systemStore.stats === null && systemStore.isLoading);

// Computed properties
// Global filter functions
const filterAdverts = (adverts: Advert[]): Advert[] => {
  return adverts.filter((advert) => {
    // Zero hop filter
    if (filters.value.zeroHop !== 'all') {
      const isZeroHop = advert.zero_hop;
      if (filters.value.zeroHop === 'true' && !isZeroHop) return false;
      if (filters.value.zeroHop === 'false' && isZeroHop) return false;
    }

    // Route type filter
    if (filters.value.routeType !== 'all') {
      const routeType = advert.route_type;
      if (filters.value.routeType === 'direct' && routeType !== 2) return false;
      if (filters.value.routeType === 'transport_direct' && routeType !== 3) return false;
      if (filters.value.routeType === 'flood' && routeType !== 1) return false;
      if (filters.value.routeType === 'transport_flood' && routeType !== 0) return false;
    }

    // Search text filter
    if (filters.value.searchText) {
      const searchLower = filters.value.searchText.toLowerCase();
      const nodeName = advert.node_name?.toLowerCase() || '';
      const pubkey = advert.pubkey.toLowerCase();
      if (!nodeName.includes(searchLower) && !pubkey.includes(searchLower)) return false;
    }

    return true;
  });
};

const resetFilters = () => {
  filters.value = {
    zeroHop: 'all',
    routeType: 'all',
    searchText: '',
  };
};

const hasActiveFilters = computed(() => {
  return (
    filters.value.zeroHop !== 'all' ||
    filters.value.routeType !== 'all' ||
    filters.value.searchText !== ''
  );
});

// Apply filters to all contact types
const filteredAdvertsByType = computed(() => {
  const result: Record<string, Advert[]> = {};
  for (const [typeKey, adverts] of Object.entries(advertsByType.value)) {
    result[typeKey] = filterAdverts(adverts);
  }
  return result;
});

// Update sorted contact types to only show types with filtered results
const sortedContactTypesWithResults = computed(() => {
  return Object.entries(contactTypes)
    .filter(([key]) => filteredAdvertsByType.value[key]?.length > 0)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));
});

const allAdvertsWithLocation = computed(() => {
  return Object.values(advertsByType.value)
    .flat()
    .filter((advert) => {
      // Exclude null, undefined, 0, or invalid coordinates
      const lat = advert.latitude;
      const lng = advert.longitude;
      const hasValidLocation =
        lat !== null &&
        lat !== undefined &&
        lat !== 0 &&
        lng !== null &&
        lng !== undefined &&
        lng !== 0 &&
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !isNaN(lat) &&
        !isNaN(lng);

      // Default to zero-hop nodes, with optional toggle for all contacts
      return hasValidLocation && (showAllMapContacts.value || advert.zero_hop === true);
    });
});

const loadAllAdverts = () => neighborStore.fetchAll(selectedHours.value);

// Component refs
const networkMapRef = ref<InstanceType<typeof NetworkMap>>();

// Event handlers
const handleHighlightNode = (pubkey: string) => {
  networkMapRef.value?.highlightNode(pubkey);
};

const handleUnhighlightNode = (pubkey: string) => {
  networkMapRef.value?.unhighlightNode(pubkey);
};

const handleMenuPing = async (neighbor: unknown) => {
  const advert = neighbor as Advert;

  // Reset state and show modal
  pingResult.value = null;
  pingError.value = null;
  pingLoading.value = true;
  pingNodeName.value = advert.node_name || 'Unknown Node';
  showPingModal.value = true;

  try {
    // Determine byte width from configured path_hash_mode (issue #133):
    // 0 / absent = 1-byte (legacy), 1 = 2-byte, 2 = 3-byte
    const pathHashMode = systemStore.stats?.config?.mesh?.path_hash_mode ?? 0;
    const byteCount = pathHashMode === 2 ? 3 : pathHashMode === 1 ? 2 : 1;
    const hexChars = byteCount * 2;
    const targetHash = parseInt(advert.pubkey.substring(0, hexChars), 16);
    const targetId = `0x${targetHash.toString(16).padStart(hexChars, '0')}`;

    const response = await ApiService.pingNeighbor(targetId, 10);

    if (response.success && response.data) {
      pingResult.value = response.data;
    } else {
      pingError.value = response.error || 'Unknown error occurred';
      console.error('Failed to ping neighbor:', response.error);
    }
  } catch (error) {
    console.error('Error pinging neighbor:', error);
    pingError.value = error instanceof Error ? error.message : 'Unknown error occurred';
  } finally {
    pingLoading.value = false;
  }
};

const closePingModal = () => {
  showPingModal.value = false;
  pingResult.value = null;
  pingError.value = null;
  pingNodeName.value = null;
};

const handleMenuDelete = (neighbor: unknown) => {
  selectedNeighborForDeletion.value = neighbor as Advert;
  showDeleteModal.value = true;
};

const handleShowDetails = (neighbor: unknown) => {
  selectedNeighborForDetails.value = neighbor as Advert;
  showDetailsModal.value = true;
};

const closeDetailsModal = () => {
  showDetailsModal.value = false;
  selectedNeighborForDetails.value = null;
};

const closeDeleteModal = () => {
  showDeleteModal.value = false;
  selectedNeighborForDeletion.value = null;
};

const confirmDelete = async (neighborId: number) => {
  try {
    await ApiService.deleteAdvert(neighborId);
    await neighborStore.fetchAll(selectedHours.value);
    closeDeleteModal();
  } catch (error) {
    console.error('Error deleting neighbor:', error);
  }
};

// Lifecycle — DataService bootstrap handles stats; ensure neighbors are fresh
onMounted(() => {
  void dataService.ensure('neighbors');
});
</script>

<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <Spinner size="lg" class="mx-auto mb-4" />
        <p class="text-content-secondary dark:text-content-muted">Loading neighbor data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="bg-red-50 dark:bg-accent-red/10 border border-red-300 dark:border-accent-red/20 rounded-[15px] p-6"
    >
      <div class="flex items-center gap-3">
        <svg
          class="w-5 h-5 text-red-600 dark:text-accent-red"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h3 class="text-red-600 dark:text-accent-red font-medium">Error Loading Neighbors</h3>
          <p class="text-red-500 dark:text-accent-red/80 text-sm">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Network Map -->
      <NetworkMap
        ref="networkMapRef"
        :adverts="allAdvertsWithLocation"
        :base-latitude="baseLatitude"
        :base-longitude="baseLongitude"
        :stats-loading="statsLoading"
        :show-legend="showMapLegend"
        @update:show-legend="showMapLegend = $event"
      />

      <!-- Global Filter Controls (only show if we have data) -->
      <div v-if="Object.keys(advertsByType).length > 0" class="">
        <div class="flex items-center justify-between">
          <span class="text-content-primary dark:text-content-primary text-lg font-semibold"></span>
          <div class="flex items-center gap-3">
            <!-- View Toggle Buttons -->
            <div
              class="hidden lg:flex bg-background-mute dark:bg-surface-elevated/30 backdrop-blur rounded-lg border border-stroke-subtle dark:border-stroke/10 mb p-1"
            >
              <!-- Comfortable View Button -->
              <button
                @click="isCompactView = false"
                :class="[
                  'p-2 rounded-md transition-colors',
                  !isCompactView
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-content-secondary dark:text-content-muted hover:text-primary hover:bg-primary/10',
                ]"
                title="Comfortable view"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="6"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <rect
                    x="3"
                    y="12"
                    width="18"
                    height="6"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                </svg>
              </button>

              <!-- Compact View Button -->
              <button
                @click="isCompactView = true"
                :class="[
                  'p-2 rounded-md transition-colors',
                  isCompactView
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-content-secondary dark:text-content-muted hover:text-primary hover:bg-primary/10',
                ]"
                title="Compact view"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="4"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <rect
                    x="3"
                    y="10"
                    width="18"
                    height="4"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <rect
                    x="3"
                    y="17"
                    width="18"
                    height="4"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                </svg>
              </button>
            </div>

            <!-- Hours Selector -->
            <div class="flex items-center gap-2">
              <select
                :value="selectedHours"
                @change="changeHours(+($event.target as HTMLSelectElement).value)"
                :disabled="loading"
                class="text-xs px-2 py-1.5 rounded-lg bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-primary border border-stroke-subtle dark:border-stroke/20 focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                <option v-for="opt in hoursOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- Filter Controls -->
            <div class="flex items-center gap-2">
              <button
                @click="showAllMapContacts = !showAllMapContacts"
                :class="[
                  'px-3 py-1.5 text-xs rounded-lg transition-colors border',
                  showAllMapContacts
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-primary border-stroke-subtle dark:border-stroke/20 hover:bg-stroke-subtle dark:hover:bg-white/20',
                ]"
              >
                Map: {{ showAllMapContacts ? 'All Contacts' : 'Zero Hop' }}
              </button>

              <button
                @click="showFilters = !showFilters"
                :class="[
                  'px-3 py-1.5 text-xs rounded-lg transition-colors border',
                  hasActiveFilters
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-primary border-stroke-subtle dark:border-stroke/20 hover:bg-stroke-subtle dark:hover:bg-white/20',
                ]"
              >
                <svg
                  class="w-4 h-4 inline mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707v6.586a1 1 0 01-1.447.894l-4-2A1 1 0 717 18.586V13.414a1 1 0 00-.293-.707L.293 6.293A1 1 0 010 5.586V3a1 1 0 011-1z"
                  />
                </svg>
                Filters
                <span
                  v-if="hasActiveFilters"
                  class="ml-1 bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 text-xs px-1.5 py-0.5 rounded-full font-medium"
                >
                  Active
                </span>
              </button>

              <button
                v-if="hasActiveFilters"
                @click="resetFilters"
                class="px-3 py-1.5 text-xs rounded-lg bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-primary border border-stroke-subtle dark:border-stroke/20 hover:bg-stroke-subtle dark:hover:bg-white/20 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <!-- Filter Panel -->
        <div
          v-show="showFilters"
          class="bg-background dark:bg-background/30 border border-stroke-subtle dark:border-stroke/10 rounded-lg p-4 mt-4 space-y-4"
        >
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Zero Hop Filter -->
            <div>
              <label
                class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1"
                >Zero Hop</label
              >
              <select
                v-model="filters.zeroHop"
                class="w-full bg-surface dark:bg-surface/50 border border-stroke-subtle dark:border-stroke/20 rounded-lg px-3 py-2 text-content-primary dark:text-content-primary text-sm focus:border-primary/50 focus:outline-none"
              >
                <option value="all">All Nodes</option>
                <option value="true">Zero Hop Only</option>
                <option value="false">Multi-Hop Only</option>
              </select>
            </div>

            <!-- Route Type Filter -->
            <div>
              <label
                class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1"
                >Route Type</label
              >
              <select
                v-model="filters.routeType"
                class="w-full bg-surface dark:bg-surface/50 border border-stroke-subtle dark:border-stroke/20 rounded-lg px-3 py-2 text-content-primary dark:text-content-primary text-sm focus:border-primary/50 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="direct">Direct</option>
                <option value="transport_direct">Transport Direct</option>
                <option value="flood">Flood</option>
                <option value="transport_flood">Transport Flood</option>
              </select>
            </div>

            <!-- Search Filter -->
            <div>
              <label
                class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1"
                >Search</label
              >
              <input
                v-model="filters.searchText"
                type="text"
                placeholder="Node name or pubkey..."
                class="w-full bg-surface dark:bg-surface/50 border border-stroke-subtle dark:border-stroke/20 rounded-lg px-3 py-2 text-content-primary dark:text-content-primary text-sm focus:border-primary/50 focus:outline-none placeholder-gray-400 dark:placeholder-white/40"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Neighbor Tables by Contact Type -->
      <div
        v-for="[typeKey, typeName] in sortedContactTypesWithResults"
        :key="typeKey"
        class="space-y-6"
      >
        <NeighborTable
          :contact-type="typeName"
          :contact-type-key="typeKey"
          :adverts="filteredAdvertsByType[typeKey]"
          :original-count="advertsByType[typeKey]?.length || 0"
          :color="contactTypeColors[parseInt(typeKey) as keyof typeof contactTypeColors]"
          :base-latitude="baseLatitude"
          :base-longitude="baseLongitude"
          :is-compact-view="isCompactView"
          :is-first-table="false"
          :show-view-toggle="false"
          @highlight-node="handleHighlightNode"
          @unhighlight-node="handleUnhighlightNode"
          @menu-ping="handleMenuPing"
          @menu-delete="handleMenuDelete"
          @show-details="handleShowDetails"
        />
      </div>

      <!-- No Data State -->
      <div
        v-if="sortedContactTypesWithResults.length === 0 && Object.keys(advertsByType).length === 0"
        class="text-center py-12"
      >
        <div class="text-content-secondary dark:text-content-muted mb-4">
          <svg
            class="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <h3 class="text-content-primary dark:text-content-primary text-lg font-medium mb-2">
          No Neighbors Found
        </h3>
        <p class="text-content-secondary dark:text-content-muted">
          No mesh neighbors have been discovered in your area yet.
        </p>
        <button
          @click="loadAllAdverts"
          class="mt-4 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors"
        >
          Refresh
        </button>
      </div>

      <!-- No Results State (when filters return no results) -->
      <div
        v-else-if="sortedContactTypesWithResults.length === 0 && hasActiveFilters"
        class="text-center py-12"
      >
        <div class="text-content-secondary dark:text-content-muted mb-4">
          <svg
            class="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <h3 class="text-content-primary dark:text-content-primary text-lg font-medium mb-2">
          No neighbors match your filters
        </h3>
        <p class="text-content-secondary dark:text-content-muted mb-4">
          Try adjusting your filter criteria to see more results.
        </p>
        <button
          @click="resetFilters"
          class="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </template>

    <!-- Delete Neighbor Modal -->
    <DeleteNeighborModal
      :show="showDeleteModal"
      :neighbor="neighborForModal"
      @close="closeDeleteModal"
      @delete="confirmDelete"
    />

    <!-- Ping Result Modal -->
    <PingResultModal
      :show="showPingModal"
      :node-name="pingNodeName"
      :result="pingResult"
      :error="pingError"
      :loading="pingLoading"
      @close="closePingModal"
    />

    <!-- Neighbor Details Modal -->
    <NeighborDetailsModal
      :is-open="showDetailsModal"
      :neighbor="selectedNeighborForDetails"
      :base-latitude="baseLatitude"
      :base-longitude="baseLongitude"
      @close="closeDetailsModal"
    />
  </div>
</template>
