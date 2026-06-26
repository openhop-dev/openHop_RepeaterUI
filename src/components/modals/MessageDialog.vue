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
    'bg-accent-green/opacity-light dark:bg-accent-green/opacity-medium border-accent-green/opacity-heavy dark:border-accent-green/opacity-medium text-accent-green',
  error: 'bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border-accent-red/opacity-medium text-accent-red',
  info: 'bg-primary/opacity-medium border-primary/opacity-medium text-primary',
};

const buttonColors = {
  success: 'bg-accent-green/opacity-light hover:bg-accent-green/opacity-light',
  error: 'bg-accent-red/opacity-light hover:bg-accent-red/opacity-light',
  info: 'bg-primary/opacity-light hover:bg-primary/opacity-light',
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
        <p class="text-content-secondary dark:text-content-primary/opacity-heavy text-base leading-relaxed">
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
