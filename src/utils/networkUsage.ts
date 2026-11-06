/** Decimal bytes, not bits. Truncate display precision so 999.999 KB never reads 1000 KB. */
export function formatUsageBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${Math.floor(value * 100) / 100} ${units[unit]}`;
}

/** Direct JSON body, generated from the matching backend schema. */
export type { NetworkUsage } from '@/generated/openapi';
