<script setup lang="ts">
interface Props {
  show: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface Emits {
  (e: 'close'): void;
  (e: 'confirm'): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm Action',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'warning',
});

const emit = defineEmits<Emits>();

const variantColors = {
  danger: 'bg-red-100 dark:bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400',
  warning:
    'bg-yellow-100 dark:bg-yellow-500/20 border-yellow-500/30 text-yellow-600 dark:text-yellow-400',
  info: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-400',
};

const buttonColors = {
  danger: 'bg-red-500 hover:bg-red-600',
  warning: 'bg-yellow-500 hover:bg-yellow-600',
  info: 'bg-blue-500 hover:bg-blue-600',
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
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
          {{ props.title }}
        </h3>
        <button
          @click="emit('close')"
          class="text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Icon and Message -->
      <div class="mb-6">
        <div :class="['inline-flex p-3 rounded-xl mb-4', variantColors[props.variant]]">
          <!-- Danger Icon -->
          <svg
            v-if="props.variant === 'danger'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <!-- Warning Icon -->
          <svg
            v-else-if="props.variant === 'warning'"
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
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

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          @click="emit('close')"
          class="flex-1 px-4 py-3 rounded-xl bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary transition-all duration-200 border border-stroke-subtle dark:border-stroke/10"
        >
          {{ props.cancelText }}
        </button>
        <button
          @click="emit('confirm')"
          :class="[
            'flex-1 px-4 py-3 rounded-xl text-white transition-all duration-200',
            buttonColors[props.variant],
          ]"
        >
          {{ props.confirmText }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
