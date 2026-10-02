import L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre's ESM worker must be emitted and addressed by Vite, not resolved
// relative to the combined application chunk on the repeater.
setWorkerUrl(workerUrl);

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · ' +
  OSM_ATTRIBUTION;

/** Owns only the base layer; overlays, viewport and Leaflet input remain untouched. */
export function createMapBaseLayer(map: L.Map) {
  let layer: L.Layer | null = null;
  let detach = () => {};
  let disposed = false;
  let generation = 0;
  let dark: boolean | undefined;
  let attribution = '';
  const control = map.attributionControl ?? L.control.attribution().addTo(map);
  const setAttribution = (value: string) => {
    if (attribution) control.removeAttribution(attribution);
    attribution = value;
    if (value) control.addAttribution(value);
  };
  const clear = () => {
    detach();
    detach = () => {};
    if (layer) {
      const previous = layer;
      layer = null;
      // A WebGL constructor can fail part-way through Leaflet's onAdd.
      try {
        map.removeLayer(previous);
      } catch {
        previous.getPane()?.querySelector('.leaflet-gl-layer')?.remove();
      }
    }
    setAttribution('');
  };
  const raster = () => {
    layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    layer.addTo(map);
    setAttribution(OSM_ATTRIBUTION);
  };
  const update = () => {
    const nextDark = document.documentElement.classList.contains('dark');
    if (disposed || nextDark === dark) return;
    dark = nextDark;
    const current = ++generation;
    clear();
    if (!dark) {
      raster();
      return;
    }
    const fallback = () => {
      if (disposed || current !== generation) return;
      ++generation;
      clear();
      raster();
    };
    try {
      const vector = maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/dark',
        attributionControl: false,
      });
      layer = vector;
      vector.addTo(map);
      const gl = vector.getMaplibreMap();
      gl.on('error', fallback);
      gl.on('webglcontextlost', fallback);
      detach = () => {
        gl.off('error', fallback);
        gl.off('webglcontextlost', fallback);
      };
      setAttribution(VECTOR_ATTRIBUTION);
    } catch {
      fallback();
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  update();
  return {
    dispose() {
      disposed = true;
      ++generation;
      observer.disconnect();
      clear();
    },
  };
}
