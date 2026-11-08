<script setup lang="ts">
import { computed, ref } from 'vue';

// Floating bar that collects a settings page's unsaved changes. The page keeps
// its fields editable and passes the differences here; the bar offers Discard
// and Save for all of them at once.

export interface SaveBarChange {
  /** What changed, e.g. "g2 › Port". */
  label: string;
  /** Old and new value, e.g. "5055 → 5056". */
  detail?: string;
}

const props = withDefaults(
  defineProps<{
    changes: SaveBarChange[];
    saving?: boolean;
    /** Shown after the count, e.g. "Takes effect after a restart". */
    note?: string;
    saveLabel?: string;
  }>(),
  { saving: false, note: '', saveLabel: 'Save Changes' },
);

const emit = defineEmits<{ save: []; discard: [] }>();

const expanded = ref(false);
const count = computed(() => props.changes.length);
const summary = computed(() =>
  count.value === 1 ? '1 unsaved change' : `${count.value} unsaved changes`,
);
// Inline when short; past three, the list folds behind a toggle.
const inline = computed(() => props.changes.slice(0, 3));
const overflow = computed(() => Math.max(0, count.value - inline.value.length));
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="count > 0"
      role="region"
      aria-label="Unsaved changes"
      data-testid="save-bar"
      class="sticky bottom-4 z-20 mt-6 rounded-xl border border-accent-amber/opacity-heavy bg-surface-elevated shadow-lg px-4 py-3 flex flex-col gap-2"
    >
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0 text-sm">
          <span class="font-semibold text-content-primary" data-testid="save-bar-summary">{{
            summary
          }}</span>
          <span v-if="note" class="text-content-secondary dark:text-content-muted">
            · {{ note }}</span
          >
          <ul
            class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-secondary dark:text-content-muted"
          >
            <li
              v-for="change in expanded ? changes : inline"
              :key="change.label"
              data-testid="save-bar-change"
            >
              <span class="text-content-primary">{{ change.label }}</span>
              <template v-if="change.detail"
                >{{ ' ' }}<span class="font-mono">{{ change.detail }}</span></template
              >
            </li>
            <li v-if="overflow > 0 && !expanded">
              <button
                type="button"
                class="text-primary underline-offset-2 hover:underline"
                @click="expanded = true"
              >
                +{{ overflow }} more
              </button>
            </li>
          </ul>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="cfg-btn-secondary"
            :disabled="saving"
            @click="emit('discard')"
          >
            Discard
          </button>
          <button type="button" class="cfg-btn-primary" :disabled="saving" @click="emit('save')">
            {{ saving ? 'Saving...' : saveLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
