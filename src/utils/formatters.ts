/**
 * Shared display-formatting utilities.
 *
 * Rules:
 *  - null/undefined inputs are handled explicitly; 0 is a valid value everywhere.
 *  - All functions are pure (no side effects, no Vue reactivity).
 *  - Keep formatters here only when used in ≥2 components.
 */

// ─── Radio / signal ──────────────────────────────────────────────────────────

export function formatRSSI(rssi?: number | null): string {
  if (rssi === null || rssi === undefined) return 'N/A';
  return `${rssi} dBm`;
}

export function formatSNR(snr?: number | null): string {
  if (snr === null || snr === undefined) return 'N/A';
  return `${snr.toFixed(1)} dB`;
}

// ─── Route type ──────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<number, string> = {
  0: 'Transport Flood',
  1: 'Flood',
  2: 'Direct',
  3: 'Transport Direct',
};

/** Plain text label for a route type value. */
export function formatRouteType(routeType?: number | null): string {
  if (routeType === null || routeType === undefined) return 'Unknown';
  return ROUTE_LABELS[routeType] ?? 'Unknown';
}

/** Full badge config (text + Tailwind colour classes) for route type display. */
export function getRouteTypeBadge(routeType?: number | null): {
  text: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
} {
  switch (routeType) {
    case 2:
      return {
        text: 'Direct',
        bgColor: 'bg-green-100 dark:bg-green-500/20',
        borderColor: 'border-green-500 dark:border-green-400/30',
        textColor: 'text-green-600 dark:text-green-400',
      };
    case 3:
      return {
        text: 'Transport Direct',
        bgColor: 'bg-green-100 dark:bg-green-600/20',
        borderColor: 'border-green-600/40 dark:border-green-500/30',
        textColor: 'text-green-700 dark:text-green-500',
      };
    case 1:
      return {
        text: 'Flood',
        bgColor: 'bg-yellow-100 dark:bg-yellow-500/20',
        borderColor: 'border-yellow-500 dark:border-yellow-400/30',
        textColor: 'text-yellow-600 dark:text-yellow-400',
      };
    case 0:
      return {
        text: 'Transport Flood',
        bgColor: 'bg-orange-100 dark:bg-orange-500/20',
        borderColor: 'border-orange-500 dark:border-orange-400/30',
        textColor: 'text-orange-600 dark:text-orange-400',
      };
    default:
      return {
        text: 'Unknown',
        bgColor: 'bg-gray-500/20',
        borderColor: 'border-gray-400/30',
        textColor: 'text-gray-400',
      };
  }
}

// ─── Timestamps ──────────────────────────────────────────────────────────────

/** Unix epoch seconds → full locale date+time string (e.g. "5/7/2025, 3:14:00 PM"). */
export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

/** Unix epoch seconds → short date string (e.g. "May 7, 2025"). Used in table date ranges. */
export function formatDateShort(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Relative time string from a Date object (e.g. "3m ago", "2h ago", "Never"). */
export function formatTimeAgo(date: Date | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffDays / 365);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 365) return `${diffDays}d ago`;
  return `${diffYears}y ago`;
}

// ─── Size / distance ─────────────────────────────────────────────────────────

/** Human-readable byte size (e.g. "1.4 MB", "512 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Kilometres value → display string (e.g. "12.3 km"). */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

// ─── Keys / identifiers ──────────────────────────────────────────────────────

/** Shorten a public key for inline display (e.g. "a1b2...f9e8"). */
export function formatPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

/** Shorten a transport key for inline display (e.g. "abc12345...xyz98765"). */
export function getTruncatedKey(key: string | undefined): string {
  if (!key) return 'No key';
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}
