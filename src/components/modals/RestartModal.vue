<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import apiClient from '@/utils/api';

interface Props {
  modelValue: boolean;
  message: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Service Restart Required',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isRestarting = ref(false);
const hasFailed = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollAttempts = 0;
const MAX_ATTEMPTS = 20; // 10s initial delay + 20×1s = 30s total

function close() {
  if (isRestarting.value && !hasFailed.value) return;
  isRestarting.value = false;
  hasFailed.value = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  pollAttempts = 0;
  emit('update:modelValue', false);
}

async function handleRestart() {
  isRestarting.value = true;
  hasFailed.value = false;
  try {
    await apiClient.post('/restart_service', {});
  } catch { /* network drop on restart is expected */ }
  pollAttempts = 0;
  pollTimer = setTimeout(poll, 10000);
}

function poll() {
  pollAttempts++;
  fetch('/api/needs_setup', { method: 'GET' })
    .then(res => {
      if (res.ok) {
        window.location.reload();
      } else {
        schedulePoll();
      }
    })
    .catch(() => schedulePoll());
}

function schedulePoll() {
  if (pollAttempts < MAX_ATTEMPTS) {
    pollTimer = setTimeout(poll, 1000);
  } else {
    isRestarting.value = false;
    hasFailed.value = true;
  }
}

watch(() => props.modelValue, (val) => {
  if (!val) {
    isRestarting.value = false;
    hasFailed.value = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    pollAttempts = 0;
  }
});

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="bg-white dark:bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-stroke-subtle dark:border-stroke/20 p-6 max-w-md w-full mx-4">

          <!-- Restarting state: spinner -->
          <div v-if="isRestarting" class="flex flex-col items-center gap-5 py-2">
            <svg class="spinner-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <rect
                v-for="i in 8"
                :key="i"
                x="47.5" y="14" width="5" height="18" rx="2.5"
                class="spinner-bar"
                :transform="`rotate(${(i - 1) * 45}, 50, 50)`"
                :style="`animation-delay: ${(i - 1) * 125}ms`"
              />
            </svg>
            <div class="text-center">
              <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                Restarting&hellip;
              </h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Please wait while the service restarts. This may take up to a minute.
              </p>
            </div>
          </div>

          <!-- Failed state: error + dismiss -->
          <template v-else-if="hasFailed">
            <div class="flex items-start gap-3 mb-4">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                  Service Did Not Restart
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  The service did not respond after 30 seconds. Please log into the device and check the system logs.
                </p>
              </div>
            </div>
            <div class="flex justify-end">
              <button
                @click="close"
                class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
              >
                Dismiss
              </button>
            </div>
          </template>

          <!-- Idle state: warning + buttons -->
          <template v-else>
            <div class="flex items-start gap-3 mb-4">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                  {{ title }}
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  {{ message }}
                </p>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <button
                @click="close"
                class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                @click="handleRestart"
                class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
              >
                Restart
              </button>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.spinner-svg {
  width: 72px;
  height: 72px;
}

.spinner-bar {
  fill: transparent;
  stroke: rgb(34 197 94);
  stroke-width: 0.5;
  animation: bar-fill 1s ease-in-out infinite;
}

@keyframes bar-fill {
  0%, 100% {
    fill: transparent;
    opacity: 0.2;
  }
  40%, 60% {
    fill: rgb(34 197 94);
    opacity: 1;
  }
}
</style>
