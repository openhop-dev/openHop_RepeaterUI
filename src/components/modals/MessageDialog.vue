<script setup lang="ts">
interface Props {
  show: boolean;
  message: string;
  variant?: 'success' | 'error' | 'info';
}

interface Emits {
  (e: 'close'): void;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'success',
});

const emit = defineEmits<Emits>();

const variantColors = {
  success:
    'bg-accent-green/10 dark:bg-accent-green/20 border-accent-green/40 dark:border-accent-green/30 text-accent-green',
  error: 'bg-accent-red/10 dark:bg-accent-red/20 border-accent-red/30 text-accent-red',
  info: 'bg-primary/20 border-primary/30 text-primary',
};

const buttonColors = {
  success: 'bg-accent-green/10 hover:bg-accent-green/10',
  error: 'bg-accent-red/10 hover:bg-accent-red/10',
  info: 'bg-primary/10 hover:bg-primary/10',
};
</script>

<template>
  <Teleport to="body">
  <!-- Modal Backdrop -->
  <div
    v-if="props.show"
    @click.self="emit('close')"
    class="modal-backdrop"
  >
    <!-- Modal Content -->
    <div
      class="modal-card max-w-md"
    >
      <!-- Icon and Message -->
      <div class="mb-6">
        <div :class="['inline-flex p-3 rounded-xl mb-4', variantColors[props.variant]]">
          <!-- Success Icon -->
          <svg
            v-if="props.variant === 'success'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <!-- Error Icon -->
          <svg
            v-else-if="props.variant === 'error'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <!-- Info Icon -->
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p class="text-content-secondary dark:text-content-primary/80 text-base leading-relaxed">
          {{ props.message }}
        </p>
      </div>

      <!-- Action -->
      <div class="flex">
        <button
          @click="emit('close')"
          :class="[
            'flex-1 px-4 py-3 rounded-xl text-white transition-all duration-200',
            buttonColors[props.variant],
          ]"
        >
          OK
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
