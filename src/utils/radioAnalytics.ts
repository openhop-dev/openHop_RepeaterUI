/**
 * Shaping for the per-radio analytics views (Statistics, Neighbour Links).
 *
 * On a node with two or more radios the backend adds a per-radio breakdown
 * beside the combined figures. These helpers pick the figures for the radio
 * scope a view has selected, so the views never branch on the payload shape.
 */
import { ALL_RADIOS } from '@/composables/useRadioProfiles';
import type { NeighborLinkLive } from '@/types/api';

export interface MetricsData {
  series: Array<{
    name: string;
    type: string;
    data: Array<[number, number]>;
  }>;
}

export interface PacketStatsRadio {
  radio_id: string;
  received: number;
  duplicates: number;
  dropped: number;
  /** Physical transmissions: a relay sent on both radios counts on each. */
  transmissions: number;
  avg_rssi: number | null;
  avg_snr: number | null;
}

/** Response body of `/packet_stats`. The radio fields appear only on a multi-radio node. */
export interface PacketStatsPayload {
  total_packets?: number;
  /** One per packet, however many radios sent it. */
  transmitted_packets?: number | null;
  dropped_packets?: number | null;
  radios?: PacketStatsRadio[];
  unattributed_rx_count?: number;
  unattributed_tx_count?: number;
}

export interface RouteTotalsEntry {
  route_totals: Record<string, number>;
  total_packets: number;
}

/** Response body of `/route_stats`. The radio fields appear only on a multi-radio node. */
export interface RouteStatsPayload extends RouteTotalsEntry {
  hours: number;
  period: string;
  data_source: string;
  /** Route mix of each radio's receptions. */
  radios?: Array<RouteTotalsEntry & { radio_id: string }>;
  /** Packets this node sent itself, which no radio received. */
  originated?: RouteTotalsEntry;
  unattributed_count?: number;
}

export interface RadioPacketRateBucket {
  timestamp: number;
  rx_count: number;
  tx_count: number;
}

/** Response body of `/radio_packet_rates`. */
export interface RadioPacketRatesPayload {
  hours: number;
  bucket_seconds: number;
  radios: Array<{
    radio_id: string;
    rx_total: number;
    tx_total: number;
    buckets: RadioPacketRateBucket[];
  }>;
  unattributed_rx_count: number;
  unattributed_tx_count: number;
}

/** RX and TX counts for the scope: node totals under All radios, one radio's otherwise. */
export function packetTotalsForScope(
  stats: PacketStatsPayload | null | undefined,
  scope: string,
): { rx: number; tx: number } {
  if (scope === ALL_RADIOS) {
    return { rx: stats?.total_packets || 0, tx: stats?.transmitted_packets || 0 };
  }
  const radio = stats?.radios?.find((entry) => entry.radio_id === scope);
  return { rx: radio?.received ?? 0, tx: radio?.transmissions ?? 0 };
}

/** Route totals for the scope: every packet under All radios, one radio's receptions otherwise. */
export function routeTotalsForScope(
  stats: RouteStatsPayload | null | undefined,
  scope: string,
): Record<string, number> | null {
  if (!stats) return null;
  if (scope === ALL_RADIOS) return stats.route_totals ?? null;
  return stats.radios?.find((entry) => entry.radio_id === scope)?.route_totals ?? null;
}

/** Bucket width that gives a Statistics window about 72 points, in whole minutes. */
export function rateBucketSeconds(hours: number): number {
  return Math.max(60, Math.round((hours * 3600) / 72 / 60) * 60);
}

/**
 * One radio's counts as the packets-per-second series Statistics already draws
 * from the RRD. Buckets with no packets are filled in as zero, so a quiet period
 * reads as zero rather than as a line drawn across it.
 */
export function ratesToMetricSeries(
  payload: RadioPacketRatesPayload,
  radioId: string,
  nowSeconds: number,
): MetricsData {
  const bucketSeconds = Math.max(1, payload.bucket_seconds);
  const radio = payload.radios.find((entry) => entry.radio_id === radioId);
  const byTimestamp = new Map((radio?.buckets ?? []).map((bucket) => [bucket.timestamp, bucket]));
  // The server floors buckets to multiples of bucket_seconds; use the same grid.
  const end = Math.floor(nowSeconds / bucketSeconds) * bucketSeconds;
  const start = end - Math.ceil((payload.hours * 3600) / bucketSeconds) * bucketSeconds;

  const rx: Array<[number, number]> = [];
  const tx: Array<[number, number]> = [];
  for (let timestamp = start; timestamp <= end; timestamp += bucketSeconds) {
    const bucket = byTimestamp.get(timestamp);
    rx.push([timestamp, (bucket?.rx_count ?? 0) / bucketSeconds]);
    tx.push([timestamp, (bucket?.tx_count ?? 0) / bucketSeconds]);
  }
  return {
    series: [
      { name: 'Received Packets', type: 'rx_count', data: rx },
      { name: 'Transmitted Packets', type: 'tx_count', data: tx },
    ],
  };
}

/**
 * A link as one radio heard it, in the shape the links table renders. Under All
 * radios the merged link; null when the selected radio never heard this peer.
 */
export function linkForRadio(link: NeighborLinkLive, scope: string): NeighborLinkLive | null {
  if (scope === ALL_RADIOS) return link;
  const heard = link.radios?.find((entry) => entry.radio_id === scope);
  return heard ? { ...link, ...heard } : null;
}

/**
 * Rows grouped by the radio that heard them: configured radios in order, then
 * radios no longer configured, then rows with no recorded radio.
 */
export function groupRowsByRadio<T extends { rx_radio_id?: string | null }>(
  rows: T[],
  radioOrder: string[],
): Array<{ radioId: string | null; rows: T[] }> {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) {
    const key = row.rx_radio_id ?? null;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const others = [...groups.keys()]
    .filter((id): id is string => id !== null && !radioOrder.includes(id))
    .sort();
  const ordered: Array<string | null> = [
    ...radioOrder.filter((id) => groups.has(id)),
    ...others,
    ...(groups.has(null) ? [null] : []),
  ];
  return ordered.map((radioId) => ({ radioId, rows: groups.get(radioId) ?? [] }));
}
