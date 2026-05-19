<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import ApiService from '@/utils/api';

defineOptions({ name: 'ImportRepeaterContactsModal' });

const ALLOWED_TYPES = ['companion', 'repeater', 'room_server', 'sensor'] as const;
type ContactType = (typeof ALLOWED_TYPES)[number];

const RECENCY_PRESETS = [
  { label: 'All time', value: null as number | null },
  { label: 'Last 24 hours', value: 24 },
  { label: 'Last 7 days', value: 168 },
  { label: 'Last 30 days', value: 720 },
  { label: 'Custom', value: 'custom' as const },
] as const;

const RECENCY_PRESETS_ONLY = RECENCY_PRESETS.slice(0, 4);

type RecencyChoice = number | null | 'custom';

interface Props {
  isOpen: boolean;
  companionName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  imported: [count: number];
}>();

const loading = ref(false);
const errorMessage = ref<string | null>(null);

const allTypes = ref(true);
const selectedTypes = ref<ContactType[]>([]);
const recencyPreset = ref<RecencyChoice>(null);
const customHours = ref<number | ''>('');
const limit = ref<number | ''>('');
const customHoursInputRef = ref<HTMLInputElement | null>(null);
const firstFocusRef = ref<HTMLInputElement | null>(null);

function getHours(): number | undefined {
  const preset = recencyPreset.value;
  if (preset === null || preset === 'custom') {
    if (preset === 'custom') {
      const h = customHours.value;
      if (h === '' || h === null) return undefined;
      const n = Number(h);
      return Number.isInteger(n) && n >= 1 ? n : undefined;
    }
    return undefined;
  }
  return preset;
}

function getLimit(): number | undefined {
  const l = limit.value;
  if (l === '' || l === null) return undefined;
  const n = Number(l);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

function resetForm() {
  allTypes.value = true;
  selectedTypes.value = [];
  recencyPreset.value = null;
  customHours.value = '';
  limit.value = '';
  errorMessage.value = null;
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      resetForm();
      nextTick(() => {
        firstFocusRef.value?.focus();
      });
    }
  },
);

watch(recencyPreset, (val) => {
  if (val === 'custom') {
    nextTick(() => {
      customHoursInputRef.value?.focus();
    });
  }
});

const summaryText = computed(() => {
  const typeStr = allTypes.value
    ? 'All types'
    : selectedTypes.value.map((t) => t.replace('_', ' ')).join(', ');
  let recencyStr: string;
  const preset = recencyPreset.value;
  if (preset === null) recencyStr = 'all time';
  else if (preset === 'custom') {
    const h = getHours();
    recencyStr = h !== undefined ? `last ${h} hours` : 'custom';
  } else if (preset === 24) recencyStr = 'last 24 hours';
  else if (preset === 168) recencyStr = 'last 7 days';
  else if (preset === 720) recencyStr = 'last 30 days';
  else recencyStr = 'all time';
  const limitVal = getLimit();
  const limitStr = limitVal !== undefined ? `max ${limitVal} contacts` : 'no limit';
  return `Import: ${typeStr}, ${recencyStr}, ${limitStr}.`;
});

function validate(): string | null {
  if (recencyPreset.value === 'custom') {
    const hours = getHours();
    if (hours === undefined || hours < 1) {
      return 'Custom recency must be at least 1 hour.';
    }
  }
  const lim = getLimit();
  if (limit.value !== '' && (lim === undefined || lim < 1)) {
    return 'Limit must be at least 1.';
  }
  if (!allTypes.value && selectedTypes.value.length === 0) {
    return 'Select at least one contact type or use All types.';
  }
  if (!allTypes.value) {
    const invalid = selectedTypes.value.filter((t) => !ALLOWED_TYPES.includes(t));
    if (invalid.length > 0) return `Invalid contact type: ${invalid.join(', ')}`;
  }
  return null;
}

async function submit() {
  errorMessage.value = null;
  const err = validate();
  if (err) {
    errorMessage.value = err;
    return;
  }

  const body: {
    companion_name: string;
    contact_types?: string[];
    hours?: number;
    limit?: number;
  } = {
    companion_name: props.companionName,
  };

  if (!allTypes.value && selectedTypes.value.length > 0) {
    body.contact_types = [...selectedTypes.value];
  }

  const hours = getHours();
  if (hours !== undefined) body.hours = hours;

  const lim = getLimit();
  if (lim !== undefined) body.limit = lim;

  loading.value = true;
  try {
    const response = await ApiService.importRepeaterContacts(body);
    if (response.success && response.data) {
      emit('imported', response.data.imported);
      emit('close');
    } else {
      errorMessage.value = response.error || 'Import failed.';
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Import failed.';
  } finally {
    loading.value = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
</script>

<template>
  <Teleport to="body">
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black/50 backdrop-blur-lg flex items-center justify-center z-[350] p-4"
    @click.self="emit('close')"
    @keydown="handleKeydown"
  >
    <div
      role="dialog"
      aria-describedby="import-modal-description"
      class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
    >
      <h2 class="text-xl font-bold text-content-primary dark:text-content-primary mb-4">
        Import repeater contacts
      </h2>
      <p
        id="import-modal-description"
        class="text-content-secondary dark:text-content-muted text-sm mb-4"
      >
        Seed <strong>{{ companionName }}</strong> with contacts from the repeater's adverts. Results
        are ordered by most recent first.
      </p>

      <!-- Contact types -->
      <div class="mb-4">
        <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2">
          Contact types
        </label>
        <label class="flex items-center gap-2 mb-2">
          <input
            ref="firstFocusRef"
            v-model="allTypes"
            type="checkbox"
            class="rounded border-stroke-subtle dark:border-stroke/20 text-primary focus:ring-primary/50"
          />
          <span class="text-content-primary dark:text-content-primary text-sm">All types</span>
        </label>
        <p v-if="allTypes" class="text-content-muted dark:text-content-muted text-xs mb-2">
          Uncheck to filter by type (repeater, companion, room server, sensor).
        </p>
        <div v-if="!allTypes" class="flex flex-wrap gap-3 ml-6">
          <label v-for="t in ALLOWED_TYPES" :key="t" class="flex items-center gap-2">
            <input
              v-model="selectedTypes"
              type="checkbox"
              :value="t"
              class="rounded border-stroke-subtle dark:border-stroke/20 text-primary focus:ring-primary/50"
            />
            <span class="text-content-primary dark:text-content-primary text-sm capitalize">{{
              t.replace('_', ' ')
            }}</span>
          </label>
        </div>
      </div>

      <!-- Recency -->
      <div class="border-t border-stroke-subtle dark:border-white/10 pt-4 mt-4 mb-4">
        <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2">
          Recency
        </label>
        <div class="flex flex-wrap gap-3 mb-2">
          <label
            v-for="preset in RECENCY_PRESETS_ONLY"
            :key="preset.label"
            class="flex items-center gap-2"
          >
            <input
              v-model="recencyPreset"
              type="radio"
              :value="preset.value"
              class="border-stroke-subtle dark:border-stroke/20 text-primary focus:ring-primary/50"
            />
            <span class="text-content-primary dark:text-content-primary text-sm">{{
              preset.label
            }}</span>
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-2">
          <label class="flex items-center gap-2">
            <input
              v-model="recencyPreset"
              type="radio"
              value="custom"
              class="border-stroke-subtle dark:border-stroke/20 text-primary focus:ring-primary/50"
            />
            <span class="text-content-primary dark:text-content-primary text-sm">Custom:</span>
          </label>
          <input
            v-if="recencyPreset === 'custom'"
            ref="customHoursInputRef"
            v-model.number="customHours"
            type="number"
            min="1"
            placeholder="e.g. 48"
            class="w-24 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-3 py-1.5 text-content-primary dark:text-content-primary text-sm placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50"
          />
          <span
            v-if="recencyPreset === 'custom'"
            class="text-content-muted dark:text-content-muted text-sm"
            >hours</span
          >
        </div>
      </div>

      <!-- Limit -->
      <div class="border-t border-stroke-subtle dark:border-white/10 pt-4 mt-4 mb-4">
        <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2">
          Max contacts (optional)
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-content-muted dark:text-content-muted text-sm">Import at most</span>
          <input
            v-model.number="limit"
            type="number"
            inputmode="numeric"
            min="1"
            placeholder="No limit"
            class="w-32 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-3 py-2 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50"
          />
          <span class="text-content-muted dark:text-content-muted text-sm">contacts</span>
        </div>
        <p class="text-content-muted dark:text-content-muted text-xs mt-1">
          Leave empty for no cap. Server caps at companion max.
        </p>
      </div>

      <!-- Error -->
      <div
        v-if="errorMessage"
        role="alert"
        class="mb-4 p-3 rounded-lg bg-accent-red/10 dark:bg-accent-red/20 border border-accent-red/30 text-accent-red text-sm"
      >
        {{ errorMessage }}
      </div>

      <p v-if="!errorMessage" class="text-content-muted dark:text-content-muted text-sm mb-4">
        {{ summaryText }}
      </p>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          :disabled="loading"
          class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors disabled:opacity-50"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="loading"
          class="btn-primary"
          @click="submit"
        >
          {{ loading ? 'Importing…' : 'Import' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
