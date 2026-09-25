<script setup lang="ts">
/**
 * Picks which radio a view shows on a multi-radio node: All radios, or one.
 * Renders nothing on a single-radio node, where there is nothing to pick.
 */
import { computed } from 'vue';
import {
  ALL_RADIOS,
  formatFrequency,
  formatModulation,
  type RadioIdentity,
} from '@/composables/useRadioProfiles';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    radios: RadioIdentity[];
    label?: string;
    /** Offer "All radios". False where combining radios would answer nothing. */
    allowAll?: boolean;
  }>(),
  { label: 'Radio', allowAll: true },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const options = computed(() => [
  ...(props.allowAll
    ? [{ value: ALL_RADIOS, label: 'All radios', title: 'Every radio combined' }]
    : []),
  ...props.radios.map((radio) => ({
    value: radio.radioId,
    label: radio.radioId,
    title:
      [formatFrequency(radio.profile?.frequency_hz), formatModulation(radio.profile)]
        .filter(Boolean)
        .join(' · ') || radio.radioId,
  })),
]);
</script>

<template>
  <div v-if="radios.length > 1" class="flex items-center gap-2" data-testid="radio-scope">
    <span class="text-content-secondary text-xs sm:text-sm">{{ label }}</span>
    <div
      role="group"
      :aria-label="label"
      class="inline-flex rounded-lg border border-stroke-subtle overflow-hidden text-xs sm:text-sm"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="px-3 py-1.5 transition-colors"
        :class="
          option.value === modelValue
            ? 'bg-primary/opacity-medium text-primary'
            : 'text-content-secondary hover:text-content-primary'
        "
        :aria-pressed="option.value === modelValue"
        :title="option.title"
        :data-testid="`radio-scope-${option.value}`"
        @click="emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
