<script setup lang="ts">
import { ref, computed } from 'vue';
import NeighborMenu from '@/components/ui/NeighborMenu.vue';
import { useSignalQuality } from '@/composables/useSignalQuality';
import {
  formatRSSI,
  formatSNR,
  formatTimestamp,
  formatPubkey,
  formatDistance,
  getRouteTypeBadge,
} from '@/utils/formatters';

// Reactive state
const copiedPubkey = ref<string | null>(null);

// Signal quality utilities
const { getSignalQuality } = useSignalQuality();

// Sorting state
const sortKey = ref<keyof Advert | ''>('advert_count'); // Default to advert_count
const sortDirection = ref<'asc' | 'desc'>('desc'); // Default to descending (highest first)

interface Advert {
  id: number;
  timestamp: number;
  pubkey: string;
  node_name: string | null;
  is_repeater: boolean;
  route_type: number | null;
  contact_type: string;
  latitude: number | null;
  longitude: number | null;
  first_seen: number;
  last_seen: number;
  rssi: number | null;
  snr: number | null;
  advert_count: number;
  is_new_neighbor: boolean;
  zero_hop: boolean;
}

interface Props {
  contactType: string;
  contactTypeKey: string;
  adverts: Advert[];
  originalCount: number;
  color: string;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  isCompactView?: boolean;
  isFirstTable?: boolean;
  showViewToggle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  originalCount: 0,
  baseLatitude: null,
  baseLongitude: null,
  isCompactView: false,
  isFirstTable: false,
  showViewToggle: false,
});

// Emits
const emit = defineEmits<{
  'highlight-node': [pubkey: string];
  'unhighlight-node': [pubkey: string];
  'menu-ping': [neighbor: unknown];
  'menu-delete': [neighbor: unknown];
  'show-details': [neighbor: unknown];
  'toggle-view': [];
}>();


const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getDistanceFromBase = (advert: Advert) => {
  if (
    props.baseLatitude === null ||
    props.baseLongitude === null ||
    advert.latitude === null ||
    advert.longitude === null
  ) {
    return 'N/A';
  }

  const distance = calculateDistance(
    props.baseLatitude,
    props.baseLongitude,
    advert.latitude,
    advert.longitude,
  );
  return formatDistance(distance);
};

// Copy to clipboard utility
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  }
};

// Relative time utility
const getRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const time = timestamp * 1000; // Convert to milliseconds
  const diff = now - time;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// Get last seen status color
const getLastSeenStatus = (timestamp: number): { color: string } => {
  const now = Date.now();
  const time = timestamp * 1000;
  const diff = now - time;
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return { color: 'text-green-600 dark:text-green-400' }; // Recent (less than 1 hour)
  if (hours < 26) return { color: 'text-yellow-600 dark:text-yellow-400' }; // Moderate (1-25 hours)
  return { color: 'text-red-600 dark:text-red-400' }; // Stale (26+ hours)
};

// Location utilities
const copyCoordinates = async (lat: number, lng: number) => {
  const coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  await copyToClipboard(coords);
};

const openInMaps = (lat: number, lng: number) => {
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  window.open(url, '_blank');
};

// Public key copying utility
const copyPubkey = async (pubkey: string) => {
  await copyToClipboard(pubkey);
  copiedPubkey.value = pubkey;
  setTimeout(() => {
    copiedPubkey.value = null;
  }, 2000); // Reset after 2 seconds
};

// RSSI signal strength utility - now using SNR-based calculation
const getRSSIStrength = (rssi: number | null): { bars: number; color: string } => {
  const quality = getSignalQuality(rssi);
  return {
    bars: quality.bars,
    color: quality.color,
  };
};

// View mode utility
const getCellPadding = () => {
  return props.isCompactView ? 'py-2 px-2' : 'py-4 px-3';
};

const handleToggleView = () => {
  emit('toggle-view');
};

// Event handlers
const handleHighlight = (pubkey: string) => {
  emit('highlight-node', pubkey);
};

const handleUnhighlight = (pubkey: string) => {
  emit('unhighlight-node', pubkey);
};

const handleMenuPing = (neighbor: unknown) => {
  emit('menu-ping', neighbor);
};

const handleMenuShowDetails = (neighbor: unknown) => {
  emit('show-details', neighbor);
};

const handleMenuDelete = (neighbor: unknown) => {
  emit('menu-delete', neighbor);
};

// Sorting functionality
const sortColumn = (key: keyof Advert) => {
  if (sortKey.value === key) {
    // Toggle direction if same column
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, default to descending for numbers, ascending for text
    sortKey.value = key;
    sortDirection.value = typeof props.adverts[0]?.[key] === 'number' ? 'desc' : 'asc';
  }
};

const sortedAdverts = computed(() => {
  if (!sortKey.value) return props.adverts;

  return [...props.adverts].sort((a, b) => {
    const aVal = a[sortKey.value as keyof Advert];
    const bVal = b[sortKey.value as keyof Advert];

    // Handle null/undefined values
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    let comparison = 0;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      comparison = aVal === bVal ? 0 : aVal ? 1 : -1;
    }

    return sortDirection.value === 'asc' ? comparison : -comparison;
  });
});
</script>

<template>
  <div
    class="glass-card/30 backdrop-blur border border-stroke-subtle dark:border-white/10 rounded-[12px] p-6 shadow-sm dark:shadow-none"
  >
    <!-- Contact Type Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-3 h-3 rounded-full border border-white/20"
          :style="{ backgroundColor: color }"
        ></div>
        <h3 class="text-content-primary dark:text-content-primary text-lg font-semibold">
          {{ contactType }}
        </h3>
        <span
          class="bg-background-mute dark:bg-white/10 text-content-secondary dark:text-content-primary text-xs px-2 py-1 rounded-full"
        >
          {{ adverts.length }}
          <span
            v-if="originalCount > 0 && adverts.length < originalCount"
            class="text-content-muted dark:text-content-muted"
          >
            / {{ originalCount }}
          </span>
        </span>
      </div>

      <!-- View Toggle (only show on first table and desktop) -->
      <div
        v-if="isFirstTable && showViewToggle"
        class="hidden lg:flex bg-background-mute dark:bg-surface-elevated/30 backdrop-blur rounded-lg border border-stroke-subtle dark:border-stroke/10 p-1"
      >
        <!-- Comfortable View Button -->
        <button
          @click="handleToggleView"
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
            <rect x="3" y="3" width="18" height="6" rx="2" stroke="currentColor" stroke-width="2" />
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
          @click="handleToggleView"
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
            <rect x="3" y="3" width="18" height="4" rx="2" stroke="currentColor" stroke-width="2" />
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
    </div>

    <!-- Desktop Table (hidden on mobile) -->
    <div class="hidden lg:block overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-background-mute dark:bg-transparent">
            <th
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5`"
            ></th>
            <th
              @click="sortColumn('node_name')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Node Name
                <svg
                  v-if="sortKey === 'node_name'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('pubkey')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Public Key
                <svg
                  v-if="sortKey === 'pubkey'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5`"
            >
              Location
            </th>
            <th
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5`"
            >
              Distance
            </th>
            <th
              @click="sortColumn('route_type')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Route Type
                <svg
                  v-if="sortKey === 'route_type'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('zero_hop')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Zero Hop
                <svg
                  v-if="sortKey === 'zero_hop'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('rssi')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                RSSI
                <svg
                  v-if="sortKey === 'rssi'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('snr')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                SNR
                <svg
                  v-if="sortKey === 'snr'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('last_seen')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Last Seen
                <svg
                  v-if="sortKey === 'last_seen'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('first_seen')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                First Seen
                <svg
                  v-if="sortKey === 'first_seen'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
            <th
              @click="sortColumn('advert_count')"
              :class="`text-left text-content-secondary dark:text-content-muted text-xs font-medium py-3 ${getCellPadding().split(' ')[1]} border-b border-stroke-subtle dark:border-white/5 cursor-pointer hover:text-primary transition-colors select-none`"
            >
              <div class="flex items-center gap-1">
                Advert Count
                <svg
                  v-if="sortKey === 'advert_count'"
                  class="w-3 h-3"
                  :class="sortDirection === 'asc' ? '' : 'rotate-180'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </th>
          </tr>
        </thead>

        <tbody class="bg-surface/50 dark:bg-transparent">
          <tr
            v-for="advert in sortedAdverts"
            :key="advert.id"
            class="hover:bg-background-mute/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
            @mouseenter="handleHighlight(advert.pubkey)"
            @mouseleave="handleUnhighlight(advert.pubkey)"
            @click="handleMenuShowDetails(advert)"
          >
            <td :class="getCellPadding()" @click.stop>
              <NeighborMenu
                :neighbor="advert"
                @ping="handleMenuPing"
                @show-details="handleMenuShowDetails"
                @delete="handleMenuDelete"
              />
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              {{ advert.node_name || 'Unknown' }}
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm font-mono`"
            >
              <button
                @click.stop="copyPubkey(advert.pubkey)"
                :class="[
                  'text-content-primary dark:text-content-primary hover:text-primary-light transition-colors cursor-pointer underline underline-offset-2 decoration-gray-400 dark:decoration-white/30 hover:decoration-primary-light/60',
                  copiedPubkey === advert.pubkey
                    ? 'text-green-600 dark:text-green-400 decoration-green-400/60'
                    : '',
                ]"
                :title="
                  copiedPubkey === advert.pubkey ? 'Copied!' : 'Click to copy full public key'
                "
              >
                {{ formatPubkey(advert.pubkey) }}
                <span v-if="copiedPubkey === advert.pubkey" class="ml-1 text-xs">✓</span>
              </button>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <div
                v-if="advert.latitude !== null && advert.longitude !== null"
                class="flex items-center gap-3"
              >
                <span class="text-content-secondary dark:text-content-muted"
                  >{{ advert.latitude.toFixed(4) }}, {{ advert.longitude.toFixed(4) }}</span
                >
                <div class="flex gap-1">
                  <button
                    @click.stop="copyCoordinates(advert.latitude!, advert.longitude!)"
                    class="text-content-muted dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors cursor-pointer"
                    title="Copy coordinates to clipboard"
                  >
                    <!-- Copy icon -->
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                    </svg>
                  </button>
                  <button
                    @click.stop="openInMaps(advert.latitude!, advert.longitude!)"
                    class="text-white/60 hover:text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                    title="Open in Google Maps"
                  >
                    <!-- Map icon -->
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                      <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2" />
                    </svg>
                  </button>
                </div>
              </div>
              <span v-else class="text-content-muted">Unknown</span>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              {{ getDistanceFromBase(advert) }}
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <span
                :class="[
                  'inline-block px-2 py-1 rounded-full text-xs border transition-colors',
                  getRouteTypeBadge(advert.route_type).bgColor,
                  getRouteTypeBadge(advert.route_type).borderColor,
                  getRouteTypeBadge(advert.route_type).textColor,
                ]"
              >
                {{ getRouteTypeBadge(advert.route_type).text }}
              </span>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <span
                :class="[
                  'inline-block px-2 py-1 rounded-full text-xs border transition-colors',
                  advert.zero_hop
                    ? 'bg-green-100 dark:bg-green-500/20 border-green-500 dark:border-green-400/30 text-green-600 dark:text-green-400'
                    : 'bg-orange-100 dark:bg-orange-500/20 border-orange-500 dark:border-orange-400/30 text-orange-600 dark:text-orange-400',
                ]"
              >
                {{ advert.zero_hop ? 'Zero Hop' : 'Multi-Hop' }}
              </span>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <div class="flex items-center gap-2">
                <!-- Signal strength bars -->
                <div class="flex items-end gap-0.5">
                  <template v-for="bar in 5" :key="bar">
                    <div
                      :class="[
                        'w-1 transition-colors',
                        bar <= getRSSIStrength(advert.rssi).bars
                          ? getRSSIStrength(advert.rssi).color
                          : 'text-gray-600',
                      ]"
                      :style="{ height: `${4 + bar * 2}px` }"
                    >
                      <div class="w-full h-full bg-current rounded-sm"></div>
                    </div>
                  </template>
                </div>
                <!-- RSSI value -->
                <span :class="getRSSIStrength(advert.rssi).color">
                  {{ formatRSSI(advert.rssi) }}
                </span>
              </div>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              {{ formatSNR(advert.snr) }}
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <div class="flex items-center gap-2">
                <!-- Status indicator -->
                <div
                  :class="[
                    'w-2 h-2 rounded-full',
                    getLastSeenStatus(advert.last_seen).color ===
                    'text-green-600 dark:text-green-400'
                      ? 'bg-green-400'
                      : '',
                    getLastSeenStatus(advert.last_seen).color ===
                    'text-yellow-600 dark:text-yellow-400'
                      ? 'bg-yellow-400'
                      : '',
                    getLastSeenStatus(advert.last_seen).color === 'text-red-600 dark:text-red-400'
                      ? 'bg-red-400'
                      : '',
                  ]"
                ></div>
                <span
                  :class="getLastSeenStatus(advert.last_seen).color"
                  :title="formatTimestamp(advert.last_seen)"
                  class="cursor-help"
                >
                  {{ getRelativeTime(advert.last_seen) }}
                </span>
              </div>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm`"
            >
              <span :title="formatTimestamp(advert.first_seen)" class="cursor-help">
                {{ getRelativeTime(advert.first_seen) }}
              </span>
            </td>
            <td
              :class="`${getCellPadding()} text-content-primary dark:text-content-primary text-sm text-center`"
            >
              {{ advert.advert_count }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards (visible on mobile) -->
    <div class="lg:hidden space-y-3">
      <div
        v-for="advert in sortedAdverts"
        :key="advert.id"
        class="bg-surface/50 dark:bg-transparent border border-stroke-subtle dark:border-white/10 rounded-lg p-4 hover:bg-background-mute/50 dark:hover:bg-white/5 transition-colors"
        @click="handleHighlight(advert.pubkey)"
      >
        <!-- Card Header -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <h4 class="text-content-primary dark:text-content-primary font-medium text-base">
              {{ advert.node_name || 'Unknown Node' }}
            </h4>
            <div class="flex items-center gap-2">
              <span
                :class="[
                  'inline-block px-2 py-1 rounded-full text-xs border',
                  getRouteTypeBadge(advert.route_type).bgColor,
                  getRouteTypeBadge(advert.route_type).borderColor,
                  getRouteTypeBadge(advert.route_type).textColor,
                ]"
              >
                {{ getRouteTypeBadge(advert.route_type).text }}
              </span>
              <span
                :class="[
                  'inline-block px-2 py-1 rounded-full text-xs border',
                  advert.zero_hop
                    ? 'bg-green-100 dark:bg-green-500/20 border-green-500 dark:border-green-400/30 text-green-600 dark:text-green-400'
                    : 'bg-orange-100 dark:bg-orange-500/20 border-orange-500 dark:border-orange-400/30 text-orange-600 dark:text-orange-400',
                ]"
              >
                {{ advert.zero_hop ? 'Zero Hop' : 'Multi-Hop' }}
              </span>
            </div>
          </div>
          <NeighborMenu
            :neighbor="advert"
            @ping="handleMenuPing"
            @show-details="handleMenuShowDetails"
            @delete="handleMenuDelete"
          />
        </div>

        <!-- Card Content Grid -->
        <div class="grid grid-cols-1 gap-3">
          <!-- Primary Info Row -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Public Key -->
            <div>
              <div class="text-content-muted text-xs mb-1">Public Key</div>
              <button
                @click="copyPubkey(advert.pubkey)"
                :class="[
                  'text-content-primary dark:text-content-primary hover:text-primary-light transition-colors cursor-pointer font-mono text-sm underline underline-offset-2 decoration-gray-400 dark:decoration-white/30 hover:decoration-primary-light/60 break-all',
                  copiedPubkey === advert.pubkey
                    ? 'text-green-600 dark:text-green-400 decoration-green-400/60'
                    : '',
                ]"
                :title="
                  copiedPubkey === advert.pubkey ? 'Copied!' : 'Click to copy full public key'
                "
              >
                {{ formatPubkey(advert.pubkey) }}
                <span v-if="copiedPubkey === advert.pubkey" class="ml-1 text-xs">✓</span>
              </button>
            </div>

            <!-- Signal Strength -->
            <div>
              <div class="text-content-muted text-xs mb-1">Signal</div>
              <div class="flex items-center gap-2 justify-end">
                <!-- Signal strength bars -->
                <div class="flex items-end gap-0.5">
                  <template v-for="bar in 5" :key="bar">
                    <div
                      :class="[
                        'w-1.5 transition-colors',
                        bar <= getRSSIStrength(advert.rssi).bars
                          ? getRSSIStrength(advert.rssi).color
                          : 'text-gray-600',
                      ]"
                      :style="{ height: `${6 + bar * 2}px` }"
                    >
                      <div class="w-full h-full bg-current rounded-sm"></div>
                    </div>
                  </template>
                </div>
                <!-- RSSI value -->
                <span :class="`${getRSSIStrength(advert.rssi).color} text-sm font-medium`">
                  {{ formatRSSI(advert.rssi) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Secondary Info Row -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Last Seen -->
            <div>
              <div class="text-content-muted text-xs mb-1">Last Seen</div>
              <div class="flex items-center gap-2">
                <div
                  :class="[
                    'w-2 h-2 rounded-full',
                    getLastSeenStatus(advert.last_seen).color ===
                    'text-green-600 dark:text-green-400'
                      ? 'bg-green-400'
                      : '',
                    getLastSeenStatus(advert.last_seen).color ===
                    'text-yellow-600 dark:text-yellow-400'
                      ? 'bg-yellow-400'
                      : '',
                    getLastSeenStatus(advert.last_seen).color === 'text-red-600 dark:text-red-400'
                      ? 'bg-red-400'
                      : '',
                  ]"
                ></div>
                <span
                  :class="`${getLastSeenStatus(advert.last_seen).color} text-sm`"
                  :title="formatTimestamp(advert.last_seen)"
                >
                  {{ getRelativeTime(advert.last_seen) }}
                </span>
              </div>
            </div>

            <!-- Distance -->
            <div>
              <div class="text-content-muted text-xs mb-1">Distance</div>
              <span
                class="text-content-primary dark:text-content-primary text-sm block text-right"
                >{{ getDistanceFromBase(advert) }}</span
              >
            </div>
          </div>

          <!-- Location (if available) -->
          <div
            v-if="advert.latitude !== null && advert.longitude !== null"
            class="border-t border-white/10 pt-3"
          >
            <div class="text-content-muted text-xs mb-1">Location</div>
            <div class="flex items-center justify-between">
              <span class="text-content-secondary dark:text-content-muted text-sm font-mono">
                {{ advert.latitude.toFixed(4) }}, {{ advert.longitude.toFixed(4) }}
              </span>
              <div class="flex gap-2">
                <button
                  @click="copyCoordinates(advert.latitude!, advert.longitude!)"
                  class="text-content-muted dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors p-2 hover:bg-stroke-subtle dark:hover:bg-white/10 rounded-lg"
                  title="Copy coordinates"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                  </svg>
                </button>
                <button
                  @click="openInMaps(advert.latitude!, advert.longitude!)"
                  class="text-white/60 hover:text-blue-600 dark:text-blue-400 transition-colors p-2 hover:bg-white/10 rounded-lg"
                  title="Open in Maps"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      stroke="currentColor"
                      stroke-width="2"
                    />
                    <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Additional Stats -->
          <div class="grid grid-cols-3 gap-4 pt-3 border-t border-white/10">
            <div class="text-center">
              <div class="text-content-muted text-xs mb-1">SNR</div>
              <span class="text-content-primary dark:text-content-primary text-sm font-medium">{{
                formatSNR(advert.snr)
              }}</span>
            </div>
            <div class="text-center">
              <div class="text-content-muted text-xs mb-1">Adverts</div>
              <span class="text-content-primary dark:text-content-primary text-sm font-medium">{{
                advert.advert_count
              }}</span>
            </div>
            <div class="text-center">
              <div class="text-content-muted text-xs mb-1">First Seen</div>
              <span
                class="text-content-primary dark:text-content-primary text-sm"
                :title="formatTimestamp(advert.first_seen)"
              >
                {{ getRelativeTime(advert.first_seen) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
