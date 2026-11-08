/**
 * Field-level differences between two plain JSON-like values.
 *
 * Settings pages keep what was loaded beside what the form now holds and list
 * the difference in a save bar. Objects are compared key by key and arrays as a
 * whole value (a pin list changes as one setting). Keys whose value is
 * undefined on both sides are equal; a key that is undefined on one side and
 * missing on the other is not a change.
 */

export interface FieldChange {
  /** Dotted path to the changed value, e.g. "modem_tcp.port". */
  path: string;
  from: unknown;
  to: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return Object.is(a, b);
}

export function diffChanges(before: unknown, after: unknown, prefix = ''): FieldChange[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes: FieldChange[] = [];
    for (const key of [...keys].sort()) {
      const path = prefix ? `${prefix}.${key}` : key;
      changes.push(...diffChanges(before[key], after[key], path));
    }
    return changes;
  }
  if (isPlainObject(before) || isPlainObject(after)) {
    // A section added or removed: report its leaves against an empty side.
    return diffChanges(
      isPlainObject(before) ? before : {},
      isPlainObject(after) ? after : {},
      prefix,
    );
  }
  if (before === undefined && after === undefined) return [];
  return sameValue(before, after) ? [] : [{ path: prefix, from: before, to: after }];
}

/** A short display form of a changed value: "—" for nothing, lists comma-joined. */
export function formatChangeValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
}
