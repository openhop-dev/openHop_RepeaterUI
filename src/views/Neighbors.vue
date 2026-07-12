<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import ApiService from '@/utils/api';
import { useSystemStore } from '@/stores/system';
import { useNeighborStore, CONTACT_TYPE_MAP } from '@/stores/neighbors';
import type { Advert } from '@/stores/neighbors';
import { useDataService } from '@/stores/dataService';
import DeleteNeighborModal from '@/components/modals/DeleteNeighborModal.vue';
import DiscoveryModal from '@/components/modals/DiscoveryModal.vue';
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
  0: 'var(--color-text-muted)',
  1: 'var(--color-primary)',
  2: 'var(--color-accent-green)',
  3: 'var(--color-secondary)',
  4: 'var(--color-accent-cyan)',
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

interface DiscoverySession {
  session_id: string;
  tag: number;
  status: string;
  timeout: number;
  filter_mask: number;
  since: number;
  prefix_only: boolean;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  count: number;
  error: string | null;
}

interface DiscoveryResult {
  pub_key: string;
  node_hash?: string | null;
  node_name?: string | null;
  node_type?: number;
  node_type_name?: string;
  inbound_snr?: number;
  response_snr?: number;
  rssi?: number;
  known_neighbor?: boolean;
  zero_hop?: boolean;
  advert_count?: number;
}

const showDiscoveryModal = ref(false);
const discoveryLoading = ref(false);
const discoveryError = ref<string | null>(null);
const discoverySession = ref<DiscoverySession | null>(null);
const discoveryResults = ref<DiscoveryResult[]>([]);
let discoveryEventSource: EventSource | null = null;

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

const closeDiscoveryStream = () => {
  if (discoveryEventSource) {
    discoveryEventSource.close();
    discoveryEventSource = null;
  }
};

const upsertDiscoveryResult = (result: DiscoveryResult) => {
  const index = discoveryResults.value.findIndex((entry) => entry.pub_key === result.pub_key);
  if (index >= 0) {
    discoveryResults.value.splice(index, 1, result);
    return;
  }
  discoveryResults.value = [...discoveryResults.value, result];
};

const attachDiscoveryStream = (sessionId: string) => {
  closeDiscoveryStream();
  const source = new EventSource(ApiService.getNeighborDiscoveryStreamUrl(sessionId));
  discoveryEventSource = source;
  let finalized = false;

  source.addEventListener('started', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as Partial<DiscoverySession>;
    discoverySession.value = {
      ...(discoverySession.value as DiscoverySession),
      ...data,
      status: 'running',
    };
    discoveryLoading.value = true;
  });

  source.addEventListener('discovery_result', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as {
      result: DiscoveryResult;
      count: number;
    };
    upsertDiscoveryResult(data.result);
    if (discoverySession.value) {
      discoverySession.value = {
        ...discoverySession.value,
        count: data.count,
      };
    }
  });

  source.addEventListener('completed', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as {
      status: string;
      count: number;
      completed_at: number;
      error?: string | null;
    };
    if (discoverySession.value) {
      discoverySession.value = {
        ...discoverySession.value,
        status: data.status,
        count: data.count,
        completed_at: data.completed_at,
        error: data.error ?? null,
      };
    }
    discoveryLoading.value = false;
    finalized = true;
    closeDiscoveryStream();
  });

  source.addEventListener('error', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { error?: string };
    discoveryError.value = data.error || 'Discovery failed';
    discoveryLoading.value = false;
    finalized = true;
    closeDiscoveryStream();
  });

  source.onerror = () => {
    if (finalized) return;
    discoveryError.value = 'Discovery stream disconnected unexpectedly';
    discoveryLoading.value = false;
    closeDiscoveryStream();
  };
};

const startDiscovery = async () => {
  closeDiscoveryStream();
  showDiscoveryModal.value = true;
  discoveryLoading.value = true;
  discoveryError.value = null;
  discoverySession.value = null;
  discoveryResults.value = [];

  try {
    const response = await ApiService.startNeighborDiscovery(5, 1 << 2, 0, false);
    if (!response.success || !response.data) {
      discoveryError.value = response.error || 'Failed to start discovery';
      discoveryLoading.value = false;
      return;
    }

    discoverySession.value = response.data;
    attachDiscoveryStream(response.data.session_id);
  } catch (error) {
    console.error('Error starting discovery:', error);
    discoveryError.value = error instanceof Error ? error.message : 'Failed to start discovery';
    discoveryLoading.value = false;
  }
};

const closeDiscoveryModal = () => {
  closeDiscoveryStream();
  showDiscoveryModal.value = false;
  discoveryLoading.value = false;
  discoveryError.value = null;
  discoverySession.value = null;
  discoveryResults.value = [];
};

const executePing = async (targetId: string, nodeLabel: string) => {
  pingResult.value = null;
  pingError.value = null;
  pingLoading.value = true;
  pingNodeName.value = nodeLabel;
  showPingModal.value = true;

  try {
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

const handleMenuPing = async (neighbor: unknown) => {
  const advert = neighbor as Advert;
  const pathHashMode = systemStore.stats?.config?.mesh?.path_hash_mode ?? 0;
  const byteCount = pathHashMode === 2 ? 3 : pathHashMode === 1 ? 2 : 1;
  const hexChars = byteCount * 2;
  const targetHash = parseInt(advert.pubkey.substring(0, hexChars), 16);
  const targetId = `0x${targetHash.toString(16).padStart(hexChars, '0')}`;

  await executePing(targetId, advert.node_name || 'Unknown Node');
};

const handleDiscoveryPing = async (result: DiscoveryResult) => {
  if (!result.node_hash) return;
  await executePing(result.node_hash, result.node_name || result.node_hash);
};

const handleDiscoveryAdd = async (result: DiscoveryResult) => {
  try {
    const response = await ApiService.addDiscoveredNeighbor({
      pub_key: result.pub_key,
      node_name: result.node_name,
      node_type: result.node_type,
      rssi: result.rssi,
      response_snr: result.response_snr,
    });

    if (!response.success) {
      discoveryError.value = response.error || 'Failed to add discovered neighbor';
      return;
    }

    upsertDiscoveryResult({
      ...result,
      known_neighbor: true,
    });
    await neighborStore.fetchAll(selectedHours.value);
  } catch (error) {
    console.error('Error adding discovered neighbor:', error);
    discoveryError.value =
      error instanceof Error ? error.message : 'Failed to add discovered neighbor';
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

// Lifecycle — DataService bootstrap handles stats; ensure neighbors and radio config are fresh
onMounted(() => {
  void dataService.ensure('neighbors');
  void dataService.ensure('radioConfig');
});

onUnmounted(() => {
  closeDiscoveryStream();
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
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-light border border-accent-red dark:border-accent-red/opacity-medium rounded-[15px] p-6"
    >
      <div class="flex items-center gap-3">
        <svg
          class="w-5 h-5 text-accent-red dark:text-accent-red"
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
          <h3 class="text-accent-red dark:text-accent-red font-medium">Error Loading Neighbors</h3>
          <p class="text-accent-red dark:text-accent-red/opacity-heavy text-sm">{{ error }}</p>
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
          <div>
            <button
              @click="startDiscovery"
              class="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-accent-cyan/opacity-light text-accent-cyan border border-accent-cyan/opacity-medium hover:bg-accent-cyan/opacity-medium transition-colors shadow-sm"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 18h.01M8.5 14.5a5 5 0 017 0M5 11a10 10 0 0114 0M2 7.5a15 15 0 0120 0"
                />
              </svg>
              Discover Repeaters
            </button>
          </div>
          <div class="flex items-center gap-3">
            <!-- View Toggle Buttons -->
            <div
              class="hidden lg:flex bg-background-mute dark:bg-surface-elevated/30 backdrop-blur rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light mb p-1"
            >
              <!-- Comfortable View Button -->
              <button
                @click="isCompactView = false"
                :class="[
                  'p-2 rounded-md transition-colors',
                  !isCompactView
                    ? 'bg-primary/opacity-medium text-primary border border-primary/opacity-medium'
                    : 'text-content-secondary dark:text-content-muted hover:text-primary hover:bg-primary/opacity-light',
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
                    ? 'bg-primary/opacity-medium text-primary border border-primary/opacity-medium'
                    : 'text-content-secondary dark:text-content-muted hover:text-primary hover:bg-primary/opacity-light',
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
                class="text-xs px-2 py-1.5 rounded-lg bg-background-mute dark:bg-white/opacity-subtle text-content-secondary dark:text-content-primary border border-stroke-subtle dark:border-stroke/opacity-medium focus:outline-none focus:border-primary/opacity-heavy disabled:opacity-50"
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
                    ? 'bg-primary/opacity-medium text-primary border-primary/opacity-medium'
                    : 'bg-background-mute dark:bg-white/opacity-light text-content-secondary dark:text-content-primary border-stroke-subtle dark:border-stroke/opacity-medium hover:bg-stroke-subtle dark:hover:bg-white/opacity-medium',
                ]"
              >
                Map: {{ showAllMapContacts ? 'All Contacts' : 'Zero Hop' }}
              </button>

              <button
                @click="showFilters = !showFilters"
                :class="[
                  'px-3 py-1.5 text-xs rounded-lg transition-colors border',
                  hasActiveFilters
                    ? 'bg-primary/opacity-medium text-primary border-primary/opacity-medium'
                    : 'bg-background-mute dark:bg-white/opacity-light text-content-secondary dark:text-content-primary border-stroke-subtle dark:border-stroke/opacity-medium hover:bg-stroke-subtle dark:hover:bg-white/opacity-medium',
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
                  class="ml-1 bg-accent-cyan/opacity-medium text-accent-cyan border border-accent-cyan/opacity-medium text-xs px-1.5 py-0.5 rounded-full font-medium"
                >
                  Active
                </span>
              </button>

              <button
                v-if="hasActiveFilters"
                @click="resetFilters"
                class="px-3 py-1.5 text-xs rounded-lg bg-background-mute dark:bg-white/opacity-light text-content-secondary dark:text-content-primary border border-stroke-subtle dark:border-stroke/opacity-medium hover:bg-stroke-subtle dark:hover:bg-white/opacity-medium transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <!-- Filter Panel -->
        <div
          v-show="showFilters"
          class="bg-background dark:bg-background/30 border border-stroke-subtle dark:border-stroke/opacity-light rounded-lg p-4 mt-4 space-y-4"
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
                class="w-full bg-surface dark:bg-surface/opacity-heavy border border-stroke-subtle dark:border-stroke/opacity-medium rounded-lg px-3 py-2 text-content-primary text-sm focus:border-primary/opacity-heavy focus:outline-none"
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
                class="w-full bg-surface dark:bg-surface/opacity-heavy border border-stroke-subtle dark:border-stroke/opacity-medium rounded-lg px-3 py-2 text-content-primary text-sm focus:border-primary/opacity-heavy focus:outline-none"
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
                class="w-full bg-surface dark:bg-surface/opacity-heavy border border-stroke-subtle dark:border-stroke/opacity-medium rounded-lg px-3 py-2 text-content-primary text-sm focus:border-primary/opacity-heavy focus:outline-none placeholder-content-muted dark:placeholder-content-muted"
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
        <h3 class="text-content-primary text-lg font-medium mb-2">
          No Neighbors Found
        </h3>
        <p class="text-content-secondary dark:text-content-muted">
          No mesh neighbors have been discovered in your area yet.
        </p>
        <button
          @click="loadAllAdverts"
          class="mt-4 px-4 py-2 bg-primary/opacity-medium text-primary border border-primary/opacity-medium rounded-lg hover:bg-primary/opacity-medium transition-colors"
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
        <h3 class="text-content-primary text-lg font-medium mb-2">
          No neighbors match your filters
        </h3>
        <p class="text-content-secondary dark:text-content-muted mb-4">
          Try adjusting your filter criteria to see more results.
        </p>
        <button
          @click="resetFilters"
          class="px-4 py-2 bg-primary/opacity-medium text-primary border border-primary/opacity-medium rounded-lg hover:bg-primary/opacity-medium transition-colors"
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

    <DiscoveryModal
      :show="showDiscoveryModal"
      :loading="discoveryLoading"
      :error="discoveryError"
      :session="discoverySession"
      :results="discoveryResults"
      @close="closeDiscoveryModal"
      @rediscover="startDiscovery"
      @ping="handleDiscoveryPing"
      @add="handleDiscoveryAdd"
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
