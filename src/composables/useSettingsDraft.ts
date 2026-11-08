import { computed, ref, watch, type WatchSource } from 'vue';
import type { SaveBarChange } from '@/components/ui/SaveBar.vue';
import { diffChanges, formatChangeValue } from '@/utils/changeSet';

/**
 * Unsaved-changes tracking for a settings form that is always editable.
 *
 * `load` fills the form from the saved config; what `state` returns right after
 * is the baseline. The form is dirty while `state` differs from it, and the
 * differences, labelled, feed a SaveBar. The form reloads when `source` (the
 * saved config) changes, unless it holds unsaved edits.
 */
export interface SettingsDraftOptions<T extends object> {
  /** The form's current values, as a plain JSON-like object. */
  state: () => T;
  /** Fill the form from the saved config. */
  load: () => void;
  /** The saved config the form is loaded from; a change reloads a clean form. */
  source: WatchSource<unknown>;
  /** Display names by dotted path, e.g. { max_airtime_percent: 'Max airtime' }. */
  labels?: Record<string, string>;
  /** Display form of a value at a path; defaults to formatChangeValue. */
  format?: (path: string, value: unknown) => string;
}

export function useSettingsDraft<T extends object>(options: SettingsDraftOptions<T>) {
  const baseline = ref('');
  const current = computed(() => options.state());

  const isDirty = computed(
    () => baseline.value !== '' && JSON.stringify(current.value) !== baseline.value,
  );

  /** Reload the form from the saved config and make that the baseline. */
  function reset() {
    options.load();
    baseline.value = JSON.stringify(options.state());
  }

  watch(
    options.source,
    () => {
      if (!isDirty.value) reset();
    },
    { immediate: true, deep: true },
  );

  const format = options.format ?? ((_path: string, value: unknown) => formatChangeValue(value));

  const changes = computed<SaveBarChange[]>(() => {
    if (!isDirty.value) return [];
    return diffChanges(JSON.parse(baseline.value), current.value).map((change) => ({
      label: options.labels?.[change.path] ?? change.path,
      detail: `${format(change.path, change.from)} → ${format(change.path, change.to)}`,
    }));
  });

  return { isDirty, changes, reset };
}
