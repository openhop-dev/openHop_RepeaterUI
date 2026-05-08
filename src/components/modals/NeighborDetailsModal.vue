<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useSignalQuality } from '@/composables/useSignalQuality';
import { formatRSSI, formatSNR, formatTimestamp, formatRouteType } from '@/utils/formatters';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

defineOptions({ name: 'NeighborDetailsModal' });

const { getSignalQuality } = useSignalQuality();
const copyButtonText = ref('Copy');

interface Neighbor {
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
  neighbor: Neighbor | null;
  isOpen: boolean;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  baseLatitude: null,
  baseLongitude: null,
});

const emit = defineEmits<{
  close: [];
}>();

// Map ref
const mapContainer = ref<HTMLDivElement>();
let map: L.Map | null = null;


const formatContactType = (contactType: string) => {
  const types: Record<string, string> = {
    Unknown: 'Unknown',
    'Chat Node': 'Chat Node',
    Repeater: 'Repeater',
    'Room Server': 'Room Server',
    'Hybrid Node': 'Hybrid Node',
  };
  return types[contactType] || contactType;
};

const getContactTypeColor = (contactType: string) => {
  const colors: Record<string, string> = {
    Unknown: 'text-gray-600 dark:text-gray-400',
    'Chat Node': 'text-blue-600 dark:text-blue-400',
    Repeater: 'text-emerald-600 dark:text-emerald-400',
    'Room Server': 'text-purple-600 dark:text-purple-400',
    'Hybrid Node': 'text-amber-600 dark:text-amber-400',
  };
  return colors[contactType] || 'text-gray-600 dark:text-gray-400';
};

const copyCoordinates = async () => {
  if (!props.neighbor?.latitude || !props.neighbor?.longitude) return;

  const lat = props.neighbor.latitude.toFixed(6);
  const lon = props.neighbor.longitude.toFixed(6);
  const coordString = `${lat}, ${lon}`;

  try {
    await navigator.clipboard.writeText(coordString);
    copyButtonText.value = 'Copied!';

    setTimeout(() => {
      copyButtonText.value = 'Copy';
    }, 2000);
  } catch (error) {
    console.error('Failed to copy coordinates:', error);
    copyButtonText.value = 'Failed';

    setTimeout(() => {
      copyButtonText.value = 'Copy';
    }, 2000);
  }
};

// Calculate distance if both base and neighbor coordinates exist
const distance = computed(() => {
  if (
    !props.neighbor?.latitude ||
    !props.neighbor?.longitude ||
    !props.baseLatitude ||
    !props.baseLongitude
  ) {
    return null;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = ((props.neighbor.latitude - props.baseLatitude) * Math.PI) / 180;
  const dLng = ((props.neighbor.longitude - props.baseLongitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((props.baseLatitude * Math.PI) / 180) *
      Math.cos((props.neighbor.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
});

// Show map if coordinates are available
const hasCoordinates = computed(
  () =>
    props.neighbor?.latitude !== null &&
    props.neighbor?.longitude !== null &&
    props.neighbor?.latitude !== 0 &&
    props.neighbor?.longitude !== 0 &&
    Math.abs(props.neighbor?.latitude ?? 0) <= 90 &&
    Math.abs(props.neighbor?.longitude ?? 0) <= 180,
);

// Initialize map
const initMap = () => {
  if (!mapContainer.value || !props.neighbor || !hasCoordinates.value) return;

  // Clean up existing map
  if (map) {
    map.remove();
    map = null;
  }

  const isDark = document.documentElement.classList.contains('dark');

  // Create map
  map = L.map(mapContainer.value, {
    center: [props.neighbor.latitude!, props.neighbor.longitude!],
    zoom: 13,
    zoomControl: true,
    attributionControl: false,
  });

  // Add tile layer
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  L.tileLayer(tileUrl, {
    maxZoom: 19,
    attribution: '© OpenStreetMap © CARTO',
  }).addTo(map);

  // Add neighbor marker
  const neighborIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div class="w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold text-xs">${props.neighbor.node_name?.charAt(0) || '?'}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  L.marker([props.neighbor.latitude!, props.neighbor.longitude!], { icon: neighborIcon })
    .addTo(map)
    .bindPopup(
      `<b>${props.neighbor.node_name || 'Unknown'}</b><br>${props.neighbor.pubkey.slice(0, 8)}...`,
    );

  // Add base station marker and line if valid coordinates are available
  const hasValidBase =
    props.baseLatitude !== null &&
    props.baseLongitude !== null &&
    props.baseLatitude !== 0 &&
    props.baseLongitude !== 0 &&
    Math.abs(props.baseLatitude) <= 90 &&
    Math.abs(props.baseLongitude) <= 180;

  if (hasValidBase) {
    const baseIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="w-8 h-8 rounded-full bg-green-500 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold text-xs">B</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    L.marker([props.baseLatitude!, props.baseLongitude!], { icon: baseIcon })
      .addTo(map)
      .bindPopup('<b>Base Station</b>');

    // Draw line between base and neighbor
    L.polyline(
      [
        [props.baseLatitude!, props.baseLongitude!],
        [props.neighbor.latitude!, props.neighbor.longitude!],
      ],
      {
        color: '#3b82f6',
        weight: 2,
        opacity: 0.6,
        dashArray: '5, 10',
      },
    ).addTo(map);

    // Fit bounds to show both markers
    const bounds = L.latLngBounds(
      [props.baseLatitude!, props.baseLongitude!],
      [props.neighbor.latitude!, props.neighbor.longitude!],
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }
};

// Close modal on escape key
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close');
  }
};

// Handle backdrop click
const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    emit('close');
  }
};

// Lock body scroll when modal is open and init map
watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Init map after a short delay to ensure DOM is ready
      setTimeout(() => {
        if (hasCoordinates.value) {
          initMap();
        }
      }, 100);
    } else {
      document.body.style.overflow = '';
      // Cleanup map
      if (map) {
        map.remove();
        map = null;
      }
    }
  },
  { immediate: true },
);

// Get signal quality
const signalQuality = computed(() => {
  if (!props.neighbor) return null;
  return getSignalQuality(props.neighbor.rssi);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="isOpen && neighbor"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
        @click="handleBackdropClick"
        @keydown="handleKeyDown"
        tabindex="0"
      >
        <!-- Backdrop with blur -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-none"></div>

        <!-- Modal Content -->
        <div class="relative w-full max-w-4xl max-h-[90vh] flex flex-col" @click.stop>
          <!-- Glass Card Container -->
          <div
            class="bg-white dark:bg-surface-elevated backdrop-blur-xl rounded-[20px] shadow-2xl border border-stroke-subtle dark:border-white/20 flex flex-col h-full overflow-hidden"
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-8 pb-4 flex-shrink-0">
              <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-bold text-content-primary dark:text-content-primary mb-1">
                  {{ neighbor.node_name || 'Unknown Node' }}
                </h2>
                <p
                  class="text-content-secondary dark:text-content-muted text-sm font-mono break-all"
                >
                  {{ neighbor.pubkey }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <!-- Close Button -->
                <button
                  @click="emit('close')"
                  class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200 text-gray-700 dark:text-white hover:text-gray-900 dark:hover:text-white"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto custom-scrollbar px-8">
              <!-- Basic Information -->
              <div class="mb-6">
                <h3
                  class="text-lg font-semibold text-content-primary dark:text-content-primary mb-4"
                >
                  Basic Information
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Contact Type
                    </div>
                    <div class="font-medium" :class="getContactTypeColor(neighbor.contact_type)">
                      {{ formatContactType(neighbor.contact_type) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Route Type
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-medium">
                      {{ formatRouteType(neighbor.route_type) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Zero Hop
                    </div>
                    <div
                      class="font-medium"
                      :class="
                        neighbor.zero_hop
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-600 dark:text-gray-400'
                      "
                    >
                      {{ neighbor.zero_hop ? 'Yes' : 'No' }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Advert Count
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-medium">
                      {{ neighbor.advert_count.toLocaleString() }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Signal Quality -->
              <div class="mb-6">
                <h3
                  class="text-lg font-semibold text-content-primary dark:text-content-primary mb-4"
                >
                  Signal Quality
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      RSSI
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-medium">
                      {{ formatRSSI(neighbor.rssi) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      SNR
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-medium">
                      {{ formatSNR(neighbor.snr) }}
                    </div>
                  </div>

                  <div
                    v-if="signalQuality"
                    class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]"
                  >
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Signal Strength
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="flex items-end gap-0.5">
                        <template v-for="i in 5" :key="i">
                          <div
                            :class="[
                              'w-1 transition-colors',
                              i <= signalQuality.bars
                                ? signalQuality.color
                                : 'text-gray-600 dark:text-gray-700',
                            ]"
                            :style="{ height: `${4 + i * 2}px` }"
                          >
                            <div class="w-full h-full bg-current rounded-sm"></div>
                          </div>
                        </template>
                      </div>
                      <span class="text-sm font-medium" :class="signalQuality.color">
                        {{ signalQuality.quality }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Timestamps -->
              <div class="mb-6">
                <h3
                  class="text-lg font-semibold text-content-primary dark:text-content-primary mb-4"
                >
                  Timeline
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      First Seen
                    </div>
                    <div class="text-content-primary dark:text-content-primary text-sm">
                      {{ formatTimestamp(neighbor.first_seen) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Last Seen
                    </div>
                    <div class="text-content-primary dark:text-content-primary text-sm">
                      {{ formatTimestamp(neighbor.last_seen) }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Location Information - only show if coordinates exist -->
              <div v-if="hasCoordinates" class="mb-6">
                <h3
                  class="text-lg font-semibold text-content-primary dark:text-content-primary mb-4"
                >
                  Location
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Latitude
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-mono text-sm">
                      {{ neighbor.latitude?.toFixed(6) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      Longitude
                    </div>
                    <div class="text-content-primary dark:text-content-primary font-mono text-sm">
                      {{ neighbor.longitude?.toFixed(6) }}
                    </div>
                  </div>

                  <div class="glass-card bg-background-mute dark:bg-black/20 p-4 rounded-[12px]">
                    <div
                      class="text-content-muted dark:text-content-muted text-xs uppercase tracking-wide mb-1"
                    >
                      {{ distance !== null ? 'Distance' : 'Coordinates' }}
                    </div>
                    <div
                      v-if="distance !== null"
                      class="text-content-primary dark:text-content-primary font-medium"
                    >
                      {{ `${distance.toFixed(2)} km` }}
                    </div>
                    <button
                      v-else
                      @click="copyCoordinates"
                      class="w-full px-3 py-1.5 bg-primary hover:bg-primary/90 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      {{ copyButtonText }}
                    </button>
                  </div>
                </div>

                <!-- Map -->
                <div
                  ref="mapContainer"
                  class="w-full h-96 rounded-[12px] overflow-hidden border border-stroke-subtle dark:border-white/10"
                ></div>
              </div>
            </div>

            <!-- Footer -->
            <div class="p-8 pt-4 border-t border-stroke-subtle dark:border-white/10 flex-shrink-0">
              <button
                @click="emit('close')"
                class="w-full px-4 py-2.5 bg-primary hover:bg-primary/90 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Custom scrollbar for content area */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
  opacity: 0;
}

/* Leaflet map custom styling */
:global(.leaflet-container) {
  background: transparent;
}

:global(.custom-marker) {
  background: transparent !important;
  border: none !important;
}
</style>
