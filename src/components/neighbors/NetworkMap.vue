<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Supercluster from 'supercluster';
import { formatRSSI, formatSNR, formatTimestamp, formatRouteType } from '@/utils/formatters';

// Prevent chrome detection errors
if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).chrome) {
  (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
}

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
  zero_hop?: boolean;
  // Optional jittered coordinates for identical coordinate handling
  jittered_latitude?: number;
  jittered_longitude?: number;
}

// GeoJSON Feature interface for supercluster
interface ClusterFeature {
  type: 'Feature';
  properties: {
    cluster?: boolean;
    cluster_id?: number;
    point_count?: number;
    point_count_abbreviated?: string;
    advert: Advert;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface Props {
  adverts: Advert[];
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  showLegend?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  baseLatitude: null,
  baseLongitude: null,
  showLegend: true,
});

const emit = defineEmits<{
  'update:showLegend': [value: boolean];
}>();

const toggleLegend = () => {
  emit('update:showLegend', !props.showLegend);
};

// Map refs
const mapContainer = ref<HTMLDivElement>();
let map: L.Map | null = null;
const nodeMarkers = ref<Map<string, L.Marker>>(new Map());

// Clustering refs
let supercluster: Supercluster | null = null;
const clusterMarkers = ref<Map<string, L.Marker>>(new Map());
const connectionLines = ref<L.Polyline[]>([]);
const useClusteringRef = ref(true); // Re-enable clustering with fixed line creation
const clusterRadiusRef = ref(60); // Increased cluster radius to cluster less aggressively
const maxClusterZoomRef = ref(14); // Increased max zoom level for clustering

// Theme detection
const isDarkMode = ref(document.documentElement.classList.contains('dark'));

// Watch for theme changes
const themeObserver = new MutationObserver(() => {
  const newIsDark = document.documentElement.classList.contains('dark');
  if (newIsDark !== isDarkMode.value) {
    isDarkMode.value = newIsDark;
    // Recreate map with new tiles when theme changes
    if (map) {
      recreateMap();
    }
  }
});

// Computed properties
const hasValidCoordinates = computed(
  () =>
    props.baseLatitude !== null &&
    props.baseLongitude !== null &&
    typeof props.baseLatitude === 'number' &&
    typeof props.baseLongitude === 'number' &&
    props.baseLatitude !== 0 &&
    props.baseLongitude !== 0 &&
    Math.abs(props.baseLatitude) <= 90 &&
    Math.abs(props.baseLongitude) <= 180,
);


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

// Map cleanup
const cleanupMap = () => {
  if (map) {
    // Remove all connection lines
    connectionLines.value.forEach((line) => {
      if (map) {
        line.remove();
      }
    });
    connectionLines.value.length = 0;

    map.remove();
    map = null;
  }
  nodeMarkers.value.clear();
  clusterMarkers.value.clear();
  supercluster = null;
};

// Recreate map (for theme changes)
const recreateMap = async () => {
  const currentZoom = map?.getZoom() || 11;
  const currentCenter =
    map?.getCenter() ||
    (hasValidCoordinates.value ? [props.baseLatitude!, props.baseLongitude!] : [0, 0]);

  cleanupMap();
  await nextTick();
  await initializeOpenStreetMap();

  if (map) {
    map.setView(currentCenter as L.LatLngExpression, currentZoom);
  }
};

// Convert adverts to GeoJSON features for clustering
const prepareClusterData = (adverts: Advert[]): ClusterFeature[] => {
  // Track coordinates to detect duplicates and apply jittering
  const coordinateCount = new Map<string, number>();

  return adverts
    .filter((advert) => advert.latitude !== null && advert.longitude !== null)
    .map((advert) => {
      let latitude = advert.latitude!;
      let longitude = advert.longitude!;

      // Create coordinate key for duplicate detection
      const coordKey = `${latitude.toFixed(6)}_${longitude.toFixed(6)}`;
      const count = coordinateCount.get(coordKey) || 0;
      coordinateCount.set(coordKey, count + 1);

      // Apply slight jittering for duplicate coordinates
      if (count > 0) {
        // Small random offset to separate overlapping nodes (about 50-100m)
        const jitterAmount = 0.001; // ~111m at equator
        const angle = count * 60 * (Math.PI / 180); // Spread in 60-degree increments
        latitude += Math.sin(angle) * jitterAmount * (count * 0.5);
        longitude += Math.cos(angle) * jitterAmount * (count * 0.5);
      }

      return {
        type: 'Feature',
        properties: {
          advert: {
            ...advert,
            // Store jittered coordinates for consistent marker placement
            jittered_latitude: latitude,
            jittered_longitude: longitude,
          },
        },
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude], // Note: longitude first for GeoJSON
        },
      };
    });
};

// Initialize supercluster with our data
const initializeCluster = (features: ClusterFeature[]) => {
  supercluster = new Supercluster({
    radius: clusterRadiusRef.value,
    maxZoom: maxClusterZoomRef.value,
    minPoints: 2, // Minimum points to form a cluster
  });

  supercluster.load(features);
};

// OpenStreetMap initialization with dark theme and animations
const initializeOpenStreetMap = async () => {
  if (!mapContainer.value || !hasValidCoordinates.value) {
    console.warn('Cannot initialize map: missing container or coordinates');
    return;
  }

  // Clean up existing map
  cleanupMap();

  await nextTick();

  const lat = props.baseLatitude!;
  const lng = props.baseLongitude!;

  // Initialize the map
  map = L.map(mapContainer.value, {
    center: [lat, lng],
    zoom: 11,
    zoomControl: true,
    attributionControl: false,
    preferCanvas: false,
  });

  // Theme-aware tile layers with error handling
  try {
    const baseUrl = isDarkMode.value
      ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

    const labelsUrl = isDarkMode.value
      ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';

    const tileLayer = L.tileLayer(baseUrl, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      errorTileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });

    const labelsLayer = L.tileLayer(labelsUrl, {
      maxZoom: 19,
      attribution: '',
      errorTileUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });

    tileLayer.addTo(map);
    labelsLayer.addTo(map);
  } catch (tileErr) {
    console.warn('Error loading tiles:', tileErr);
  }

  try {
    // Create custom icons for different contact types
    const createCustomIcon = (color: string, isBase = false) => {
      const size = isBase ? 16 : 12;
      return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5);"></div>`,
        iconSize: [size + 4, size + 4],
        iconAnchor: [(size + 4) / 2, (size + 4) / 2],
      });
    };

    // Create custom cluster icon with glass theme
    const createClusterIcon = (pointCount: number) => {
      const size = pointCount < 10 ? 30 : pointCount < 100 ? 40 : 50;

      return L.divIcon({
        className: 'custom-cluster-icon',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: rgba(170, 232, 232, 0.2);
            border: 2px solid #AAE8E8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 12px rgba(170, 232, 232, 0.3);
            color: #ffffff;
            font-size: ${size < 35 ? '11px' : '13px'};
            font-weight: bold;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          ">
            ${pointCount}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    };

    // Base station icon (larger, red)
    const baseIcon = createCustomIcon('#ef4444', true);

    // Add base station marker
    L.marker([lat, lng], { icon: baseIcon }).addTo(map!).bindPopup(`
        <div class="p-2">
          <strong style="color: #ef4444;">Base Station</strong><br>
          <span class="text-sm" style="color: #9CA3AF;">Base Station</span><br>
          <span class="text-xs" style="color: #6B7280;">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
        </div>
      `);

    // Color mapping for contact types - original colors
    const colorMap = {
      Unknown: '#9CA3AF', // Unknown - gray
      'Chat Node': '#60A5FA', // Chat Node - blue
      Repeater: '#A5E5B6', // Repeater - green
      'Room Server': '#EBA0FC', // Room Server - purple
      'Hybrid Node': '#FFC246', // Hybrid Node - yellow
    };

    // Create animated connection lines (extracted from original code)
    const createAnimatedConnectionLine = (
      advert: Advert,
      baseLat: number,
      baseLng: number,
      nodeColor: string,
      animationDelay = 0,
    ) => {
      if (!map) {
        return;
      }

      // Only zero-hop contacts should have a connection line to base station.
      if (advert.zero_hop !== true) {
        return;
      }

      // Use jittered coordinates if available, otherwise original
      const endLat = advert.jittered_latitude || advert.latitude;
      const endLng = advert.jittered_longitude || advert.longitude;

      if (endLat === null || endLng === null) {
        return;
      }

      const routeType = advert.route_type || 0;
      let lineColor = nodeColor;
      let lineWeight = 3;
      let lineOpacity = 0.7;
      let dashArray = undefined;

      // Style lines based on route type - original logic
      if (routeType === 2) {
        // Direct connection - solid bright line
        lineColor = '#A5E5B6';
        lineWeight = 4;
        lineOpacity = 0.9;
      } else if (routeType === 1) {
        // Flood routing - dashed line
        lineColor = '#FFC246';
        dashArray = '10, 5';
        lineOpacity = 0.8;
      } else if (routeType === 3) {
        // Transport Direct - solid thick green
        lineColor = '#059669';
        lineWeight = 5;
        lineOpacity = 0.95;
      } else if (routeType === 0) {
        // Transport Flood - dashed orange
        lineColor = '#ea580c';
        dashArray = '12, 6';
        lineOpacity = 0.8;
      } else {
        // Unknown route type - dotted line
        lineColor = '#9CA3AF';
        dashArray = '2, 5';
        lineOpacity = 0.6;
      }

      // Create animated line that builds up over time - ORIGINAL ANIMATION
      const startPoint: [number, number] = [baseLat, baseLng];
      const endPoint: [number, number] = [endLat, endLng];

      // Create the final line first (hidden)
      const finalLine = L.polyline([startPoint, endPoint], {
        color: lineColor,
        weight: lineWeight,
        opacity: 0,
        dashArray: dashArray,
        className: 'connection-line',
      }).addTo(map!);

      // Create animation line (will be removed after animation)
      const animationLine = L.polyline([startPoint, startPoint], {
        color: lineColor,
        weight: lineWeight,
        opacity: 0,
        dashArray: dashArray,
        className: 'connection-line animated-line',
      }).addTo(map!);

      // Animate the line drawing
      setTimeout(() => {
        let step = 0;
        const steps = 30;
        animationLine.setStyle({ opacity: lineOpacity + 0.2 });

        const animate = () => {
          step++;
          const progress = step / steps;
          const currentLat = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
          const currentLng = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;

          animationLine.setLatLngs([startPoint, [currentLat, currentLng]]);

          if (step < steps) {
            setTimeout(animate, 30);
          } else {
            setTimeout(() => {
              if (map && animationLine) {
                animationLine.remove(); // Remove animation line
              }

              // Show final line with proper opacity
              finalLine.setStyle({ opacity: lineOpacity });

              // Add hover effects to final line
              finalLine.on('mouseover', () => {
                finalLine.setStyle({
                  weight: lineWeight + 2,
                  opacity: Math.min(lineOpacity + 0.3, 1),
                });
              });

              finalLine.on('mouseout', () => {
                finalLine.setStyle({
                  weight: lineWeight,
                  opacity: lineOpacity,
                });
              });

              // Add click popup for the final line
              const distance = calculateDistance(baseLat, baseLng, endLat, endLng);
              finalLine.bindPopup(`
                <div class="p-2">
                  <strong style="color: ${nodeColor}">Connection to ${advert.node_name || 'Unknown Node'}</strong><br>
                  <span class="text-sm" style="color: #E5E7EB;">Distance: ${distance.toFixed(2)} km</span><br>
                  <span class="text-sm" style="color: #E5E7EB;">Route: ${formatRouteType(advert.route_type)}</span><br>
                  <span class="text-sm" style="color: #E5E7EB;">Signal: ${formatRSSI(advert.rssi)} / ${formatSNR(advert.snr)}</span>
                </div>
              `);

              // Store the line for cleanup
              connectionLines.value.push(finalLine);
            }, 200);
          }
        };
        animate();
      }, animationDelay);
    };

    // Render markers based on current zoom and bounds
    const updateMarkersAndClusters = () => {
      if (!map || !supercluster) return;

      const bounds = map.getBounds();
      const zoom = Math.floor(map.getZoom());

      // Clear existing cluster markers
      clusterMarkers.value.forEach((marker) => {
        if (map) {
          marker.remove();
        }
      });
      clusterMarkers.value.clear();

      // Clear existing connection lines
      connectionLines.value.forEach((line) => {
        if (map) {
          line.remove();
        }
      });
      connectionLines.value.length = 0;

      // Get clusters for current bounds
      const clusters = supercluster!.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom,
      );

      // Add cluster markers or individual markers
      clusters.forEach((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const props = cluster.properties;

        if (props.cluster) {
          // This is a cluster
          const marker = L.marker([latitude, longitude], {
            icon: createClusterIcon(props.point_count || 0),
          }).addTo(map!);

          // Handle cluster click to zoom in
          marker.on('click', () => {
            if (map && supercluster) {
              const expansionZoom = supercluster.getClusterExpansionZoom(props.cluster_id!);
              map.setView([latitude, longitude], expansionZoom);
            }
          });

          // Create cluster popup with node information
          const clusterLeaves = supercluster!.getLeaves(props.cluster_id!, Infinity);
          const nodeList = clusterLeaves
            .map(
              (leaf) =>
                `<div style="margin: 2px 0; color: ${colorMap[leaf.properties.advert.contact_type as keyof typeof colorMap] || colorMap['Unknown']};">
              • ${leaf.properties.advert.node_name || 'Unknown Node'} (${leaf.properties.advert.contact_type})
            </div>`,
            )
            .join('');

          marker.bindPopup(`
            <div class="p-2">
              <strong style="color: #AAE8E8;">Cluster: ${props.point_count} nodes</strong><br>
              <div style="max-height: 200px; overflow-y: auto; margin-top: 8px;">
                ${nodeList}
              </div>
              <div style="margin-top: 8px; font-size: 11px; color: #ffffff99;">
                Click to zoom in and separate nodes
              </div>
            </div>
          `);

          clusterMarkers.value.set(`cluster-${props.cluster_id}`, marker);

          // CREATE ANIMATED LINE TO CLUSTER
          // Calculate distance to cluster center
          const distance = calculateDistance(lat, lng, latitude, longitude);
          const animationDelay = Math.min(Math.floor(distance * 5), 200);

          // Create a fake advert object for cluster line creation
          const clusterAdvert = {
            node_name: `Cluster of ${props.point_count} nodes`,
            contact_type: 'Cluster',
            route_type: 2, // Use direct route style for clusters
            rssi: null,
            snr: null,
            jittered_latitude: latitude,
            jittered_longitude: longitude,
            latitude: latitude,
            longitude: longitude,
          } as Advert;

          // Create animated line to cluster with cluster color
          createAnimatedConnectionLine(clusterAdvert, lat, lng, '#AAE8E8', animationDelay);
        } else {
          // This is an individual marker
          const advert = props.advert as Advert;
          const color =
            colorMap[advert.contact_type as keyof typeof colorMap] || colorMap['Unknown'];
          const icon = createCustomIcon(color);

          // Use the coordinates from the cluster (already jittered)
          const markerLat = latitude; // Use cluster coordinates directly
          const markerLng = longitude;
          const distance = calculateDistance(lat, lng, markerLat, markerLng);

          const marker = L.marker([markerLat, markerLng], { icon }).addTo(map!).bindPopup(`
              <div class="p-2">
                <strong style="color: ${color}">${advert.node_name || 'Unknown Node'}</strong><br>
                <span class="text-sm" style="color: #E5E7EB;">Type: ${advert.contact_type}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Distance: ${distance.toFixed(2)} km</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Signal: ${formatRSSI(advert.rssi)} / ${formatSNR(advert.snr)}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Route: ${formatRouteType(advert.route_type)}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Last Seen: ${formatTimestamp(advert.last_seen)}</span>
                ${advert.jittered_latitude ? '<br><span class="text-xs" style="color: #9CA3AF;">Position adjusted to separate overlapping nodes</span>' : ''}
              </div>
            `);

          // Store marker for hover effects
          nodeMarkers.value.set(advert.pubkey, marker);
          clusterMarkers.value.set(`node-${advert.pubkey}`, marker);

          // Create animated connection line (only for individual nodes, not clusters)
          // Use a smaller delay based on distance to create a nice wave effect
          const animationDelay = Math.min(Math.floor(distance * 5), 200); // Reduced max delay to 200ms

          // Create a custom advert object with the cluster coordinates for line creation
          const lineAdvert = {
            ...advert,
            jittered_latitude: markerLat,
            jittered_longitude: markerLng,
          };
          createAnimatedConnectionLine(lineAdvert, lat, lng, color, animationDelay);
        }
      });
    };

    // Fallback function for non-clustered marker creation (preserves original behavior)
    const addMarkersWithoutClustering = (baseLat: number, baseLng: number) => {
      let animationDelay = 0;

      // Apply coordinate jittering for identical positions
      const clusterFeatures = prepareClusterData(props.adverts);

      clusterFeatures.forEach((feature) => {
        const advert = feature.properties.advert;
        if (advert.latitude !== null && advert.longitude !== null) {
          const color =
            colorMap[advert.contact_type as keyof typeof colorMap] || colorMap['Unknown'];
          const icon = createCustomIcon(color);

          // Use jittered coordinates for marker placement
          const markerLat = advert.jittered_latitude || advert.latitude;
          const markerLng = advert.jittered_longitude || advert.longitude;

          // Add the marker (initially hidden, will show after line animation)
          const marker = L.marker([markerLat, markerLng], { icon }).addTo(map!).bindPopup(`
              <div class="p-2">
                <strong style="color: ${color}">${advert.node_name || 'Unknown Node'}</strong><br>
                <span class="text-sm" style="color: #E5E7EB;">Type: ${advert.contact_type}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Distance: ${calculateDistance(baseLat, baseLng, markerLat, markerLng).toFixed(2)} km</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Signal: ${formatRSSI(advert.rssi)} / ${formatSNR(advert.snr)}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Route: ${formatRouteType(advert.route_type)}</span><br>
                <span class="text-sm" style="color: #E5E7EB;">Last Seen: ${formatTimestamp(advert.last_seen)}</span>
                ${advert.jittered_latitude ? '<br><span class="text-xs" style="color: #9CA3AF;">Position adjusted to separate overlapping nodes</span>' : ''}
              </div>
            `);

          nodeMarkers.value.set(advert.pubkey, marker);

          // Initially hide the marker (using opacity only, no transforms)
          const markerElement = marker.getElement();
          if (markerElement) {
            markerElement.style.opacity = '0';
            markerElement.style.transition = 'opacity 0.5s ease-out';
          }

          // Create animated connection line
          createAnimatedConnectionLine(advert, baseLat, baseLng, color, animationDelay);

          // Show marker after animation completes
          setTimeout(() => {
            if (markerElement) {
              markerElement.style.opacity = '1';
            }
          }, animationDelay + 1000); // Reduced from 1500ms to 1000ms

          animationDelay += 100; // Reduced from 150ms to 100ms stagger
        }
      });
    };

    // Initialize clustering with current adverts
    if (useClusteringRef.value && props.adverts.length > 0) {
      try {
        const clusterFeatures = prepareClusterData(props.adverts);
        initializeCluster(clusterFeatures);

        // Set initial zoom to ensure some markers are visible individually
        const initialZoom = Math.min(14, map.getZoom()); // Start at zoom 14 or current zoom, whichever is lower
        map.setZoom(initialZoom);

        // Initial marker update with a small delay to ensure map is ready
        setTimeout(() => {
          try {
            updateMarkersAndClusters();
          } catch (clusterErr) {
            console.warn('Error updating clusters:', clusterErr);
            // Fallback to non-clustered mode
            addMarkersWithoutClustering(lat, lng);
          }
        }, 100);

        // Update markers when map moves or zooms
        map.on('moveend', () => {
          try {
            updateMarkersAndClusters();
          } catch (err) {
            console.warn('Error updating clusters on move:', err);
          }
        });

        map.on('zoomend', () => {
          try {
            updateMarkersAndClusters();
          } catch (err) {
            console.warn('Error updating clusters on zoom:', err);
          }
        });
      } catch (clusterInitErr) {
        console.warn('Error initializing clustering:', clusterInitErr);
        // Fallback to original non-clustered marker creation
        addMarkersWithoutClustering(lat, lng);
      }
    } else {
      // Fallback to original non-clustered marker creation
      addMarkersWithoutClustering(lat, lng);
    }

    // Force map resize after initialization
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 1000);
  } catch (err) {
    console.error('Error initializing map:', err);
  }
};

// Functions for table row hover effects (exposed to parent)
const highlightNode = (pubkey: string) => {
  const marker = nodeMarkers.value.get(pubkey);
  if (marker) {
    const element = marker.getElement();
    if (element) {
      // Find the actual div inside the custom icon
      const iconDiv = element.querySelector('div');
      if (iconDiv) {
        iconDiv.classList.add('marker-highlight');
      }
    }
  }
};

const unhighlightNode = (pubkey: string) => {
  const marker = nodeMarkers.value.get(pubkey);
  if (marker) {
    const element = marker.getElement();
    if (element) {
      // Find the actual div inside the custom icon
      const iconDiv = element.querySelector('div');
      if (iconDiv) {
        iconDiv.classList.remove('marker-highlight');
      }
    }
  }
};

// Expose functions to parent
defineExpose({
  highlightNode,
  unhighlightNode,
  initializeOpenStreetMap,
});

// Watch for prop changes
watch(
  () => props.adverts,
  () => {
    if (map && hasValidCoordinates.value) {
      setTimeout(() => {
        initializeOpenStreetMap();
      }, 100);
    }
  },
  { immediate: false },
);

// Lifecycle
onMounted(() => {
  // Start observing theme changes
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (hasValidCoordinates.value && props.adverts.length > 0) {
    setTimeout(() => {
      initializeOpenStreetMap();
    }, 300);
  }
});

onUnmounted(() => {
  themeObserver.disconnect();
  cleanupMap();
});
</script>

<template>
  <div class="map-container">
    <!-- Loading indicator when coordinates are invalid -->
    <div
      v-if="!hasValidCoordinates"
      class="flex items-center justify-center h-96 glass-card backdrop-blur border border-black/6 dark:border-white/10 rounded-[12px] shadow-sm dark:shadow-none"
    >
      <div class="text-center text-content-primary dark:text-content-primary">
        <svg
          class="w-8 h-8 mx-auto mb-2 text-content-muted dark:text-content-muted"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
          />
        </svg>
        <p class="text-sm text-content-primary dark:text-content-primary">
          No valid coordinates available
        </p>
        <p class="text-xs text-content-secondary dark:text-content-muted">
          Configure base station location to view map
        </p>
      </div>
    </div>

    <!-- Map container -->
    <div
      v-else
      ref="mapContainer"
      class="leaflet-map-container h-96 w-full glass-card backdrop-blur border border-black/6 dark:border-white/10 rounded-[12px] overflow-hidden shadow-sm dark:shadow-none"
      style="min-height: 384px; position: relative"
    />

    <!-- Legend Toggle Button -->
    <button
      v-if="hasValidCoordinates && adverts.length > 0"
      @click="toggleLegend"
      class="absolute bottom-3 right-3 z-[1001] flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors text-sm backdrop-blur-sm"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span class="hidden sm:inline">{{ showLegend ? 'Hide' : 'Show' }}</span>
    </button>

    <!-- Legend overlay -->
    <div v-if="hasValidCoordinates && adverts.length > 0 && showLegend" class="map-legend">
      <!-- Node Types -->
      <div class="legend-section">
        <div class="legend-subtitle">Node Types</div>
        <div class="legend-items">
          <div class="legend-item">
            <div class="legend-icon" style="background-color: #ef4444"></div>
            <span>Base Station</span>
          </div>
          <div class="legend-item">
            <div class="legend-icon" style="background-color: #60a5fa"></div>
            <span>Chat Node</span>
          </div>
          <div class="legend-item">
            <div class="legend-icon" style="background-color: #a5e5b6"></div>
            <span>Repeater</span>
          </div>
          <div class="legend-item">
            <div class="legend-icon" style="background-color: #eba0fc"></div>
            <span>Room Server</span>
          </div>
          <div class="legend-item">
            <div class="legend-icon" style="background-color: #ffc246"></div>
            <span>Hybrid Node</span>
          </div>
        </div>
      </div>

      <!-- Route Types -->
      <div class="legend-section">
        <div class="legend-subtitle">Route Types</div>
        <div class="legend-items">
          <div class="legend-item">
            <div class="legend-line" style="background: #a5e5b6; height: 3px"></div>
            <span>Direct</span>
          </div>
          <div class="legend-item">
            <div class="legend-line" style="background: #059669; height: 4px"></div>
            <span>Transport Direct</span>
          </div>
          <div class="legend-item">
            <div class="legend-line legend-line-dashed" style="background: #ffc246"></div>
            <span>Flood</span>
          </div>
          <div class="legend-item">
            <div class="legend-line legend-line-dashed" style="background: #ea580c"></div>
            <span>Transport Flood</span>
          </div>
        </div>
      </div>

      <div class="legend-footer">
        {{ adverts.length }} node{{ adverts.length !== 1 ? 's' : '' }} visible
      </div>
    </div>

    <!-- Manual attribution to avoid chrome errors -->
    <div v-if="hasValidCoordinates" class="map-attribution">
      © OpenStreetMap contributors © CARTO
    </div>
  </div>
</template>

<style scoped>
.map-container {
  position: relative;
  background: transparent;
  border-radius: 15px;
  overflow: hidden;
}

.leaflet-map-container {
  background: linear-gradient(135deg, rgba(9, 9, 11, 0.8) 0%, rgba(0, 0, 0, 0.6) 100%);
  backdrop-filter: blur(20px);
}

/* Map legend styling */
.map-legend {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 12px;
  font-size: 12px;
  color: #ffffff;
  backdrop-filter: blur(20px);
  z-index: 1000;
  min-width: 150px;
  max-width: 180px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.legend-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: #ffffff;
  font-size: 13px;
}

.legend-section {
  margin-bottom: 10px;
}

.legend-section:last-of-type {
  margin-bottom: 8px;
}

.legend-subtitle {
  font-weight: 600;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.legend-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-size: 10px;
  text-align: center;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.legend-icon.cluster-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #aae8e8;
  backdrop-filter: blur(5px);
}

.legend-line {
  width: 16px;
  height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
  position: relative;
}

.legend-line-dashed {
  background-image: repeating-linear-gradient(
    90deg,
    currentColor 0px,
    currentColor 4px,
    transparent 4px,
    transparent 8px
  ) !important;
  background-color: transparent !important;
}

.legend-line-dashed[style*='#FFC246'] {
  color: #ffc246 !important;
}

.legend-line-dashed[style*='#ea580c'] {
  color: #ea580c !important;
}

/* Custom marker highlight animation for table hover */
:global(.marker-highlight) {
  position: relative !important;
  z-index: 1000 !important;
  animation: marker-glow 1s ease-in-out infinite !important;
  border-radius: 50% !important;
  box-shadow:
    0 0 0 3px #a5e5b6,
    0 0 8px #a5e5b6,
    0 0 16px #a5e5b6 !important;
  transform: scale(1.2) !important;
}

@keyframes marker-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 3px #a5e5b6,
      0 0 8px #a5e5b6,
      0 0 16px #a5e5b6;
    filter: brightness(1);
  }
  50% {
    box-shadow:
      0 0 0 5px #a5e5b6,
      0 0 12px #a5e5b6,
      0 0 24px #a5e5b6;
    filter: brightness(1.3);
  }
}

@keyframes pulse-highlight {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

/* Leaflet popup customization for dark theme */
:global(.leaflet-popup-content-wrapper) {
  background: rgba(0, 0, 0, 0.4) !important;
  color: #ffffff !important;
  border-radius: 15px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  backdrop-filter: blur(20px) !important;
}

:global(.leaflet-popup-tip) {
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

:global(.leaflet-popup-close-button) {
  color: rgba(255, 255, 255, 0.6) !important;
  font-size: 18px !important;
}

:global(.leaflet-popup-close-button:hover) {
  color: #ffffff !important;
}

/* Custom marker styling */
:global(.custom-div-icon) {
  background: transparent !important;
  border: none !important;
}

/* Custom cluster marker styling */
:global(.custom-cluster-icon) {
  background: transparent !important;
  border: none !important;
}

:global(.custom-cluster-icon div) {
  transition: all 0.3s ease !important;
  cursor: pointer !important;
}

:global(.custom-cluster-icon:hover div) {
  transform: scale(1.1) !important;
  box-shadow: 0 6px 16px rgba(170, 232, 232, 0.5) !important;
}

/* Leaflet control styling for dark theme */
:global(.leaflet-control-zoom) {
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 15px !important;
  overflow: hidden;
  backdrop-filter: blur(20px) !important;
}

:global(.leaflet-control-zoom a) {
  background-color: rgba(0, 0, 0, 0.4) !important;
  color: #ffffff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
  transition: all 0.2s ease !important;
}

:global(.leaflet-control-zoom a:hover) {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}

:global(.leaflet-control-attribution) {
  background-color: rgba(31, 41, 55, 0.8) !important;
  color: #9ca3af !important;
  border-top: 1px solid rgba(75, 85, 99, 0.3) !important;
  border-radius: 4px !important;
  padding: 4px 8px !important;
  font-size: 11px !important;
}

:global(.leaflet-control-attribution a) {
  color: #60a5fa !important;
  text-decoration: none;
}

:global(.leaflet-control-attribution a:hover) {
  color: #93c5fd !important;
  text-decoration: underline;
}

:global(.leaflet-bottom.leaflet-left .leaflet-control-attribution) {
  margin-left: 10px !important;
  margin-bottom: 10px !important;
}

/* Manual attribution styling to replace leaflet control */
.map-attribution {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.4);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 4px 8px;
  font-size: 10px;
  backdrop-filter: blur(20px);
  z-index: 1000;
}

/* Hide leaflet attribution on small screens */
@media (max-width: 640px) {
  :global(.leaflet-control-attribution) {
    display: none !important;
  }
}
</style>
