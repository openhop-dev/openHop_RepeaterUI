<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import Spinner from '@/components/ui/Spinner.vue';

const props = defineProps<{
  /** Show centered first-load spinner overlay (no data yet) */
  isLoading: boolean;
  /** Show small top-right updating indicator (data visible, refreshing in background) */
  isUpdating?: boolean;
  /** Non-null string shows error overlay with retry button and auto-retry countdown */
  error?: string | null;
  /** Status text shown under the first-load spinner ("Connecting…" / "Receiving data…") */
  status?: string;
  /** ms before auto-retry fires. Default: 30 000 */
  autoRetryMs?: number;
}>();

const emit = defineEmits<{ retry: [] }>();

const countdown = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

const clearTimers = () => {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
  countdown.value = 0;
};

watch(
  () => props.error,
  (err) => {
    clearTimers();
    if (!err) return;
    const ms = props.autoRetryMs ?? 30_000;
    countdown.value = Math.round(ms / 1000);
    countdownInterval = setInterval(() => {
      countdown.value = Math.max(0, countdown.value - 1);
      if (countdown.value === 0) clearTimers();
    }, 1000);
    retryTimeout = setTimeout(() => {
      clearTimers();
      emit('retry');
    }, ms);
  },
);

onBeforeUnmount(clearTimers);
</script>

<template>
  <div class="relative">
    <slot />

    <!-- First-load overlay: no data yet, full-area spinner -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm z-10"
    >
      <Spinner />
      <p v-if="status" class="mt-2 text-sm text-content-secondary">{{ status }}</p>
    </div>

    <!-- Background update indicator: chart still visible, small top-right spinner -->
    <div
      v-else-if="isUpdating && !error"
      class="absolute top-3 right-3 flex items-center gap-1.5 z-10"
    >
      <Spinner size="xs" color="current" class="text-content-muted" />
      <span class="text-xs text-content-muted">Updating</span>
    </div>

    <!-- Error overlay: shown over chart or blank area -->
    <div
      v-if="error && !isLoading"
      class="absolute inset-0 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm z-10"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-8 h-8 text-accent-red mb-2"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p class="text-sm font-semibold text-content-primary">Loading Failed</p>
      <p class="text-xs text-content-secondary mt-1 max-w-[12rem] text-center">{{ error }}</p>
      <button class="btn-secondary mt-3 text-xs px-3 py-1.5" @click="emit('retry')">Retry</button>
      <p v-if="countdown > 0" class="mt-2 text-xs text-content-muted">Retrying in {{ countdown }}s</p>
    </div>
  </div>
</template>
