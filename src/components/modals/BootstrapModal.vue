<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useDataService } from '@/stores/dataService';
import { useWebSocketStore } from '@/stores/websocket';
import Spinner from '@/components/ui/Spinner.vue';

const dataService = useDataService();
const wsStore = useWebSocketStore();

type Phase = 'loading' | 'connecting' | 'connected' | 'closed';

// Initialise phase based on current store state at mount time.
// "not bootstrapping" is ambiguous — it's also true BEFORE bootstrap starts,
// so check loadProgress to distinguish "not started yet" from "already done".
function initialPhase(): Phase {
  if (wsStore.isConnected) return 'closed';
  const notStarted = Object.values(dataService.loadProgress).every((s) => s === 'pending');
  if (notStarted || dataService.isBootstrapping) return 'loading';
  return 'connecting';
}

const phase = ref<Phase>(initialPhase());
let closeTimer: number | null = null;

const show = computed(() => phase.value !== 'closed');

const httpSteps = [
  { key: 'stats',        label: 'System configuration' },
  { key: 'packetStats',  label: 'Packet statistics' },
  { key: 'noiseFloor',   label: 'Signal history' },
  { key: 'recentPackets', label: 'Recent activity' },
  { key: 'sparklines',   label: 'Performance charts' },
  { key: 'advertTier',   label: 'Adaptive rate limits' },
  { key: 'neighbors',    label: 'Mesh neighbours' },
] as const;

// Move to 'connecting' when DataService bootstrap finishes
watch(
  () => dataService.isBootstrapping,
  (loading) => {
    if (!loading && phase.value === 'loading') {
      phase.value = 'connecting';
    }
  },
);

// Move to 'connected' when WS opens, then close after 2 s
watch(
  () => wsStore.connectionState,
  (state) => {
    if (state === 'open' && (phase.value === 'connecting' || phase.value === 'loading')) {
      phase.value = 'connected';
      closeTimer = window.setTimeout(() => {
        phase.value = 'closed';
      }, 2000);
    }
  },
);

onUnmounted(() => {
  if (closeTimer !== null) clearTimeout(closeTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-500"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-[500] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div class="modal-card max-w-sm w-full">
          <!-- Header -->
          <div class="mb-6 text-center">
            <h2 class="text-lg font-semibold text-content-primary dark:text-content-primary">
              Starting up
            </h2>
            <p class="text-xs text-content-secondary dark:text-content-muted mt-1">
              Loading data before opening the live connection
            </p>
          </div>

          <!-- HTTP steps -->
          <ul class="space-y-2.5 mb-5">
            <li
              v-for="step in httpSteps"
              :key="step.key"
              class="flex items-center gap-3"
            >
              <!-- Status icon -->
              <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                <Spinner v-if="dataService.loadProgress[step.key] === 'loading'" size="sm" />
                <svg
                  v-else-if="dataService.loadProgress[step.key] === 'done'"
                  class="w-4 h-4 text-accent-green"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <svg
                  v-else-if="dataService.loadProgress[step.key] === 'error'"
                  class="w-4 h-4 text-accent-red"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span v-else class="w-3 h-3 rounded-full border border-stroke-subtle dark:border-white/20" />
              </span>

              <!-- Label -->
              <span
                :class="[
                  'text-sm transition-colors flex items-baseline gap-2',
                  dataService.loadProgress[step.key] === 'done'
                    ? 'text-content-primary dark:text-content-primary'
                    : dataService.loadProgress[step.key] === 'loading'
                      ? 'text-content-primary dark:text-content-primary font-medium'
                      : dataService.loadProgress[step.key] === 'error'
                        ? 'text-accent-red'
                        : 'text-content-muted dark:text-content-muted/60',
                ]"
              >
                {{ step.label }}
                <span
                  v-if="step.key === 'stats' && dataService.statsSubStatus !== null"
                  class="text-xs font-normal text-content-muted dark:text-content-muted/60"
                >
                  {{ dataService.statsSubStatus === 'reading' ? 'Receiving data' : 'Requesting' }}
                </span>
              </span>
            </li>
          </ul>

          <!-- Divider -->
          <div class="border-t border-stroke-subtle dark:border-white/10 mb-5" />

          <!-- WebSocket step -->
          <div class="flex items-center gap-3">
            <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              <Spinner v-if="phase === 'connecting'" size="sm" />
              <svg
                v-else-if="phase === 'connected'"
                class="w-4 h-4 text-accent-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span v-else class="w-3 h-3 rounded-full border border-stroke-subtle dark:border-white/20" />
            </span>
            <span
              :class="[
                'text-sm transition-colors',
                phase === 'connected'
                  ? 'text-accent-green font-medium'
                  : phase === 'connecting'
                    ? 'text-content-primary dark:text-content-primary font-medium'
                    : 'text-content-muted dark:text-content-muted/60',
              ]"
            >
              {{
                phase === 'connected'
                  ? 'Real-time connection established'
                  : 'Opening real-time data connection...'
              }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
