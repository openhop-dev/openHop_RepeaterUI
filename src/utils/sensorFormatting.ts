/**
 * Flattening + formatting for hardware_stats sensor readings.
 *
 * The backend `hardware_stats` sensor returns nested objects
 * (cpu / memory / disk / network / system / temperatures). Every other sensor
 * (e.g. `openhop_modem`) returns flat key-value pairs, which the generic
 * key-value grid in Sensors.vue renders cleanly. To make hardware_stats look
 * the same, we flatten its nested structure into flat, pre-formatted
 * key-value pairs (bytes → MB/GB, uptime → "22d 09:39:36", etc.) so the same
 * grid can render it without JSON.stringify.
 */

import type { SensorMetricDescriptor } from '@/types/api';

export type MetricCategory = SensorMetricDescriptor['category'];
export type DisplayMetric = { descriptor: SensorMetricDescriptor; value: unknown };
export type MetricGroups = Record<MetricCategory, DisplayMetric[]> & {
  legacy: Record<string, unknown>;
};

/** Descriptors describe only their exact flat data keys; all other keys remain visible. */
export function groupSensorMetrics(
  data: Record<string, unknown>,
  metrics: SensorMetricDescriptor[],
): MetricGroups {
  const groups: MetricGroups = {
    measurement: [],
    diagnostic: [],
    configuration: [],
    status: [],
    legacy: { ...data },
  };
  const seen = new Set<string>();
  for (const descriptor of metrics) {
    if (
      !descriptor ||
      !['measurement', 'diagnostic', 'configuration', 'status'].includes(descriptor.category)
    )
      continue;
    const key = descriptor.data_key;
    if (
      typeof key !== 'string' ||
      (!Object.prototype.hasOwnProperty.call(data, key) && descriptor.available !== false) ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    groups[descriptor.category].push({ descriptor, value: data[key] });
    delete groups.legacy[key];
  }
  return groups;
}

/** Never guess units or reinterpret numeric strings when metadata is available. */
export function formatDescriptorMetric(descriptor: SensorMetricDescriptor, value: unknown): string {
  if (!descriptor.available || value === null || value === undefined) return 'n/a';
  if (descriptor.kind === 'boolean') return typeof value === 'boolean' ? String(value) : 'n/a';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value}${descriptor.unit ? ` ${descriptor.unit}` : ''}`;
}

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pct(value: unknown): string {
  const n = asNumber(value);
  return n === null ? 'n/a' : `${n.toFixed(1)}%`;
}

function bytes(value: unknown): string {
  const n = asNumber(value);
  if (n === null || n < 0) return 'n/a';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function count(value: unknown): string {
  const n = asNumber(value);
  return n === null ? 'n/a' : compactNumber.format(n);
}

function tempC(value: unknown): string {
  const n = asNumber(value);
  return n === null ? 'n/a' : `${n.toFixed(1)}°C`;
}

/** Format an uptime in seconds as "22d 09:39:36" (or "9h 04m" under a day). */
export function formatUptime(seconds?: unknown): string {
  const n = asNumber(seconds);
  if (n === null || n < 0) return 'n/a';
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  const mins = Math.floor((n % 3600) / 60);
  const secs = Math.floor(n % 60);
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  if (hours > 0)
    return `${hours}h ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

/** Format a load average tuple as "8.81 / 8.30 / 7.85". */
export function formatLoadAvg(load?: unknown): string {
  if (typeof load !== 'object' || load === null) return 'n/a';
  const parts = ['1min', '5min', '15min'].map((key) => {
    const v = asNumber((load as Record<string, unknown>)[key]);
    return v === null ? '?' : v.toFixed(2);
  });
  return parts.join(' / ');
}

/**
 * Flatten a hardware_stats reading's nested `data` into flat, pre-formatted
 * key-value pairs so the generic key-value grid renders it the same way it
 * renders the modem and other sensors. Returns null if the input is not a
 * hardware_stats-shaped object.
 */
export function flattenHardwareStats(data: unknown): Record<string, string> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const out: Record<string, string> = {};

  const cpu = d.cpu;
  if (cpu && typeof cpu === 'object') {
    const c = cpu as Record<string, unknown>;
    out['cpu_usage'] = pct(c.usage_percent);
    out['cpu_cores'] = count(c.count);
    const freq = asNumber(c.frequency);
    out['cpu_frequency'] = freq === null ? 'n/a' : `${Math.round(freq)} MHz`;
    out['load_avg_1m_5m_15m'] = formatLoadAvg(c.load_avg);
  }

  const mem = d.memory;
  if (mem && typeof mem === 'object') {
    const m = mem as Record<string, unknown>;
    out['memory_total'] = bytes(m.total);
    out['memory_available'] = bytes(m.available);
    out['memory_used'] = bytes(m.used);
    out['memory_usage'] = pct(m.usage_percent);
  }

  const disk = d.disk;
  if (disk && typeof disk === 'object') {
    const k = disk as Record<string, unknown>;
    out['disk_total'] = bytes(k.total);
    out['disk_used'] = bytes(k.used);
    out['disk_free'] = bytes(k.free);
    out['disk_usage'] = pct(k.usage_percent);
  }

  const net = d.network;
  if (net && typeof net === 'object') {
    const n = net as Record<string, unknown>;
    out['net_bytes_sent'] = bytes(n.bytes_sent);
    out['net_bytes_recv'] = bytes(n.bytes_recv);
    out['net_packets_sent'] = count(n.packets_sent);
    out['net_packets_recv'] = count(n.packets_recv);
  }

  const sys = d.system;
  if (sys && typeof sys === 'object') {
    const s = sys as Record<string, unknown>;
    out['uptime'] = formatUptime(s.uptime);
    if (typeof s.os === 'string' && s.os) out['os'] = s.os;
    if (typeof s.kernel === 'string' && s.kernel) out['kernel'] = s.kernel;
    if (typeof s.arch === 'string' && s.arch) out['arch'] = s.arch;
  }

  const temps = d.temperatures;
  if (temps && typeof temps === 'object' && !Array.isArray(temps)) {
    for (const [name, value] of Object.entries(temps as Record<string, unknown>)) {
      out[`temp_${name}`] = tempC(value);
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}
