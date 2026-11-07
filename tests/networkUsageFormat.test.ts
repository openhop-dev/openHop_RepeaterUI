import { describe, expect, it } from 'vitest';
import { formatUsageBytes } from '@/utils/networkUsage';

describe('decimal usage bytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1000, '1 KB'],
    [1500, '1.5 KB'],
    [999999, '999.99 KB'],
    [1000000, '1 MB'],
    [1000000000, '1 GB'],
    [2500000000000, '2500 GB'],
  ])('formats %s as %s without rounding across a boundary', (value, expected) => {
    expect(formatUsageBytes(value)).toBe(expected);
  });
});
