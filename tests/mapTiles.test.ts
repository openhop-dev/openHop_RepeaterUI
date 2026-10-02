import { afterEach, describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import * as tiles from '@/utils/mapTiles';

const vector = vi.hoisted(() => ({ create: vi.fn(), setWorkerUrl: vi.fn() }));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: vector.setWorkerUrl }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: vector.create }));

afterEach(() => {
  document.documentElement.classList.remove('dark');
  vi.restoreAllMocks();
});

describe('keyless basemap lifecycle', () => {
  it('registers a bundled worker URL instead of a missing relative worker', () => {
    expect(vector.setWorkerUrl).toHaveBeenCalledWith(expect.stringContaining('maplibre-gl-worker'));
  });
  it('exports the shared lifecycle', () => {
    expect(tiles).toHaveProperty('createMapBaseLayer');
  });
  it('uses OSM in light mode, swaps only the base on theme changes, and disposes', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const map = L.map(host).setView([51, -1], 9);
    const marker = L.marker([51, -1]).addTo(map);
    const layer = L.layerGroup();
    const gl = { on: vi.fn(), off: vi.fn() };
    vector.create.mockReturnValue(Object.assign(layer, { getMaplibreMap: () => gl }));
    const raster = vi.spyOn(L, 'tileLayer');
    const controller = tiles.createMapBaseLayer(map);
    expect(raster).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.objectContaining({ maxZoom: 19 }),
    );
    document.documentElement.classList.add('dark');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vector.create).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'https://tiles.openfreemap.org/styles/dark' }),
    );
    expect(map.hasLayer(marker)).toBe(true);
    expect(map.getZoom()).toBe(9);
    expect(map.getCenter()).toEqual(L.latLng(51, -1));
    expect(
      host.querySelector('.leaflet-control-attribution a[href="https://openfreemap.org/"]'),
    ).not.toBeNull();
    controller.dispose();
    expect(map.hasLayer(layer)).toBe(false);
    map.remove();
    host.remove();
  });
  it('falls back after vector creation failure', () => {
    document.documentElement.classList.add('dark');
    vector.create.mockImplementation(() => {
      throw new Error('WebGL unavailable');
    });
    const host = document.createElement('div');
    const map = L.map(host).setView([1, 2], 3);
    const raster = vi.spyOn(L, 'tileLayer');
    const controller = tiles.createMapBaseLayer(map);
    expect(raster).toHaveBeenCalled();
    controller.dispose();
    map.remove();
  });
  it('falls back on style errors and ignores stale errors after disposal', () => {
    document.documentElement.classList.add('dark');
    let error!: () => void;
    const layer = L.layerGroup();
    const gl = {
      on: vi.fn((event: string, fn: () => void) => {
        if (event === 'error') error = fn;
      }),
      off: vi.fn(),
    };
    vector.create.mockReturnValue(Object.assign(layer, { getMaplibreMap: () => gl }));
    const host = document.createElement('div');
    const map = L.map(host).setView([1, 2], 3);
    const raster = vi.spyOn(L, 'tileLayer');
    const controller = tiles.createMapBaseLayer(map);
    error();
    expect(map.hasLayer(layer)).toBe(false);
    expect(raster).toHaveBeenCalledTimes(1);
    controller.dispose();
    error();
    expect(raster).toHaveBeenCalledTimes(1);
    expect(gl.off).toHaveBeenCalled();
    map.remove();
  });
});
