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
  danger: 'bg-accent-red/15 border-accent-red/30 text-accent-red',
  warning: 'bg-accent-amber/15 border-accent-amber/30 text-accent-amber',
  info: 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan',
};

const buttonColors = {
  danger: 'bg-accent-red/20 hover:bg-accent-red/30 text-accent-red border border-accent-red/50',
  warning: 'bg-accent-amber/20 hover:bg-accent-amber/30 text-accent-amber border border-accent-amber/50',
  info: 'bg-accent-cyan/20 hover:bg-accent-cyan/30 text-accent-cyan border border-accent-cyan/50',
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
            'flex-1 px-4 py-3 rounded-xl transition-all duration-200',
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
