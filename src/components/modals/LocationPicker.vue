<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue';
import 'leaflet/dist/leaflet.css';

const props = defineProps<{
  isOpen: boolean;
  latitude: number;
  longitude: number;
}>();

const emit = defineEmits<{
  close: [];
  select: [{ latitude: number; longitude: number }];
}>();

const mapContainer = ref<HTMLDivElement | null>(null);
const selectedLat = ref(props.latitude || 0);
const selectedLng = ref(props.longitude || 0);
let map: any = null;
let marker: any = null;

const initMap = async () => {
  if (!mapContainer.value) return;

  // Clean up existing map if any
  cleanupMap();

  try {
    // Dynamically import Leaflet
    const L = (await import('leaflet')).default;

    // Fix for default marker icon
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    await nextTick();

    // Initialize map
    const initLat = selectedLat.value || 0;
    const initLng = selectedLng.value || 0;
    const zoom = initLat === 0 && initLng === 0 ? 2 : 13;

    map = L.map(mapContainer.value).setView([initLat, initLng], zoom);

    // Add dark theme tile layers (matching NetworkMap)
    try {
      const tileLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          errorTileUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      );

      const labelsLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          attribution: '',
          errorTileUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      );

      tileLayer.addTo(map);
      labelsLayer.addTo(map);
    } catch (tileErr) {
      console.warn('Error loading tiles:', tileErr);
    }

    // Add marker if coordinates exist
    if (initLat !== 0 || initLng !== 0) {
      marker = L.marker([initLat, initLng]).addTo(map);
    }

    // Click to set location
    map.on('click', (e: any) => {
      selectedLat.value = e.latlng.lat;
      selectedLng.value = e.latlng.lng;

      if (marker) {
        marker.setLatLng(e.latlng);
      } else {
        marker = L.marker(e.latlng).addTo(map);
      }
    });

    // Force map to resize
    setTimeout(() => {
      map?.invalidateSize();
    }, 200);
  } catch (error) {
    console.error('Failed to initialize map:', error);
  }
};

const cleanupMap = () => {
  if (map) {
    map.remove();
    map = null;
    marker = null;
  }
};

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      await nextTick();
      await initMap();
    } else {
      // Cleanup map when modal closes
      cleanupMap();
    }
  },
);

watch(
  () => [props.latitude, props.longitude],
  ([lat, lng]) => {
    selectedLat.value = lat;
    selectedLng.value = lng;
  },
);

const handleSelect = () => {
  emit('select', {
    latitude: Math.round(selectedLat.value * 1e6) / 1e6,
    longitude: Math.round(selectedLng.value * 1e6) / 1e6,
  });
  emit('close');
};

const handleClose = () => {
  emit('close');
};

// Get current location
const getCurrentLocation = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        selectedLat.value = position.coords.latitude;
        selectedLng.value = position.coords.longitude;

        if (map) {
          map.setView([selectedLat.value, selectedLng.value], 13);

          const L = (await import('leaflet')).default;
          if (marker) {
            marker.setLatLng([selectedLat.value, selectedLng.value]);
          } else {
            marker = L.marker([selectedLat.value, selectedLng.value]).addTo(map);
          }
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Unable to get current location. Please check browser permissions.');
      },
    );
  } else {
    alert('Geolocation is not supported by this browser.');
  }
};

// Cleanup on component unmount
onUnmounted(() => {
  cleanupMap();
});
</script>

<template>
  <Teleport to="body">
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-lg"
    @click.self="handleClose"
  >
    <div
      class="glass-card border border-stroke-subtle dark:border-white/20 rounded-[15px] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between p-6 border-b border-stroke-subtle dark:border-stroke/10"
      >
        <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
          Select Location
        </h3>
        <button
          @click="handleClose"
          class="text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Map Container -->
      <div class="flex-1 relative min-h-[400px]">
        <div ref="mapContainer" class="absolute inset-0 rounded-b-[15px] overflow-hidden"></div>
      </div>

      <!-- Coordinates Display & Actions -->
      <div class="p-6 border-t border-stroke-subtle dark:border-stroke/10 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label
              class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Latitude</label
            >
            <input
              v-model.number="selectedLat"
              type="number"
              step="0.000001"
              class="w-full px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary focus:outline-none focus:border-primary"
              readonly
            />
          </div>
          <div>
            <label
              class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Longitude</label
            >
            <input
              v-model.number="selectedLng"
              type="number"
              step="0.000001"
              class="w-full px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary focus:outline-none focus:border-primary"
              readonly
            />
          </div>
        </div>

        <div class="flex gap-3">
          <button
            @click="getCurrentLocation"
            class="flex-1 px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Use Current Location
          </button>
          <button
            @click="handleClose"
            class="px-6 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            @click="handleSelect"
            class="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
          >
            Select Location
          </button>
        </div>

        <p class="text-content-muted dark:text-content-muted text-xs text-center">
          Click on the map to select a location
        </p>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
/* Import Leaflet CSS dynamically */
@import 'leaflet/dist/leaflet.css';
</style>
