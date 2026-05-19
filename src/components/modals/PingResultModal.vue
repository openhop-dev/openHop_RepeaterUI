<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSystemStore } from '@/stores/system';
import { useSignalQuality } from '@/composables/useSignalQuality';
import Spinner from '@/components/ui/Spinner.vue';

interface PingResult {
  target_id: string;
  rtt_ms: number;
  snr_db: number;
  rssi: number;
  path: string[];
  tag: number;
  // path_hash_mode is present on firmware that supports multi-byte path hashes (issue #133)
  // 0 = 1-byte (legacy), 1 = 2-byte, 2 = 3-byte. Absent on older firmware.
  path_hash_mode?: number;
}

interface Props {
  show: boolean;
  nodeName?: string | null;
  result?: PingResult | null;
  error?: string | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  nodeName: null,
  result: null,
  error: null,
  loading: false,
});

const emit = defineEmits<{
  close: [];
}>();

const systemStore = useSystemStore();
const { getSignalQuality } = useSignalQuality();
const animationProgress = ref(0);
const isAnimating = ref(false);

// Calculate approximate Time on Air (ToA) based on radio settings
// Formula: ToA = (2^SF / BW) * numSymbols
// This is a simplified calculation for estimation
const calculateToA = computed(() => {
  const sf = systemStore.stats?.config?.radio?.spreading_factor ?? 7;
  const bw = systemStore.stats?.config?.radio?.bandwidth ?? 125; // in kHz
  const cr = systemStore.stats?.config?.radio?.coding_rate ?? 5;

  // Symbol time in milliseconds: 2^SF / (BW in kHz)
  const symbolTime = Math.pow(2, sf) / bw;

  // Approximate number of symbols for a ping packet
  // Preamble (8) + Header + Payload + CRC, adjusted by coding rate
  const numSymbols = 8 + 4.25 * (cr - 4) + 20; // Rough estimate for small packet

  const toaMs = symbolTime * numSymbols;

  return toaMs;
});

const getRTTStatus = computed(() => {
  if (!props.result) return { color: 'text-gray-400', label: 'Unknown' };

  const rtt = props.result.rtt_ms;
  const toaMs = calculateToA.value;
  const hops = props.result.path.length;

  // Expected RTT = 2 * ToA * hops + processing delays per hop
  // Processing includes: packet handling, LBT delays, duty cycle checks, queue delays
  // For LoRa mesh networks, processing can be 400-800ms per hop depending on conditions
  const processingDelayPerHop = 500;
  const expectedRTT = 2 * toaMs * hops + processingDelayPerHop * hops;

  // Very lenient thresholds for LoRa mesh networks with potential congestion
  if (rtt < expectedRTT * 2.5)
    return { color: 'text-green-600 dark:text-green-400', label: 'Excellent' };
  if (rtt < expectedRTT * 4)
    return { color: 'text-yellow-600 dark:text-yellow-400', label: 'Good' };
  if (rtt < expectedRTT * 7)
    return { color: 'text-orange-600 dark:text-orange-400', label: 'Fair' };
  return { color: 'text-red-600 dark:text-red-400', label: 'Poor' };
});

const getSignalStrength = computed(() => {
  if (!props.result) return { bars: 0, color: 'text-gray-400' };

  const quality = getSignalQuality(props.result.rssi);
  return {
    bars: quality.bars,
    color: quality.color,
  };
});

// Detect the effective path hash mode for this result.
// Prefer the explicit field from firmware; fall back to inferring from hop string length.
// 0 / absent = 1-byte (legacy, "02x"), 1 = 2-byte ("04x"), 2 = 3-byte ("06x")
const effectiveHashMode = computed<0 | 1 | 2>(() => {
  if (!props.result) return 0;
  if (props.result.path_hash_mode !== undefined) {
    return props.result.path_hash_mode as 0 | 1 | 2;
  }
  // Infer from widest hop string length (strip leading "0x" if present)
  const maxLen = props.result.path.reduce((max, hop) => {
    const clean = hop.replace(/^0x/i, '');
    return Math.max(max, clean.length);
  }, 0);
  if (maxLen > 4) return 2;
  if (maxLen > 2) return 1;
  return 0;
});

const isMultiByteMode = computed(() => effectiveHashMode.value > 0);

const hashModeLabel = computed(() => {
  const labels: Record<number, string> = { 0: '1-byte', 1: '2-byte', 2: '3-byte' };
  return labels[effectiveHashMode.value] ?? '1-byte';
});

// Animate packet traveling through path when result arrives
watch(
  () => props.result,
  (newResult) => {
    if (newResult && !isAnimating.value) {
      isAnimating.value = true;
      animationProgress.value = 0;

      const pathLength = newResult.path.length;
      const animationDuration = 1500; // ms
      const segmentDuration = animationDuration / (pathLength * 2); // forward and back

      let currentSegment = 0;
      const totalSegments = pathLength * 2 - 2; // forward + return minus endpoints

      const animate = () => {
        if (currentSegment <= totalSegments) {
          animationProgress.value = currentSegment / totalSegments;
          currentSegment++;
          setTimeout(animate, segmentDuration);
        } else {
          isAnimating.value = false;
          animationProgress.value = 1;
        }
      };

      setTimeout(animate, 100); // Small delay before starting
    }
  },
  { immediate: true },
);

const getPacketPosition = computed(() => {
  if (!props.result || !isAnimating.value) return -1;

  const pathLength = props.result.path.length;
  if (pathLength <= 1) return -1;

  const progress = animationProgress.value;
  const forwardEnd = 0.5;

  if (progress <= forwardEnd) {
    // Forward journey: 0 to pathLength-1
    return (progress / forwardEnd) * (pathLength - 1);
  } else {
    // Return journey: pathLength-1 to 0
    const returnProgress = (progress - forwardEnd) / forwardEnd;
    return (pathLength - 1) * (1 - returnProgress);
  }
});

const close = () => {
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4"
        @click.self="close"
      >
        <div
          class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/20 rounded-[20px] shadow-2xl w-full max-w-md overflow-hidden"
          @click.stop
        >
          <!-- Header -->
          <div
            class="bg-gradient-to-r from-primary/20 to-accent-cyan/20 border-b border-stroke-subtle dark:border-stroke/10 px-6 py-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-cyan-400/20 dark:bg-primary/20 rounded-lg">
                  <svg
                    class="w-5 h-5 text-cyan-500 dark:text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                    />
                  </svg>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-content-primary dark:text-content-primary">
                    Ping Result
                  </h2>
                  <p v-if="nodeName" class="text-sm text-content-secondary dark:text-content-muted">
                    {{ nodeName }}
                  </p>
                </div>
              </div>
              <button
                @click="close"
                class="p-2 hover:bg-stroke-subtle dark:hover:bg-white/10 rounded-lg transition-colors text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-6">
            <!-- Loading State -->
            <div v-if="loading" class="text-center py-8">
              <Spinner size="lg" class="mx-auto mb-4" />
              <p class="text-content-secondary dark:text-content-muted">Sending ping...</p>
              <p class="text-content-muted dark:text-content-muted text-sm mt-1">
                Waiting for response...
              </p>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="text-center py-8">
              <div
                class="p-3 bg-accent-red/10 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center"
              >
                <svg
                  class="w-8 h-8 text-accent-red"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.268 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 class="text-accent-red font-semibold mb-2">Ping Failed</h3>
              <p class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</p>
            </div>

            <!-- Success State -->
            <div v-else-if="result" class="space-y-4">
              <!-- RTT Card -->
              <div
                class="bg-background-mute dark:bg-background/50 border border-stroke-subtle dark:border-stroke/10 rounded-[15px] p-4"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-content-secondary dark:text-content-muted text-sm"
                    >Round-Trip Time</span
                  >
                  <span
                    :class="[
                      'text-xs font-medium px-2 py-1 rounded-full',
                      getRTTStatus.color,
                      'bg-current/10',
                    ]"
                  >
                    {{ getRTTStatus.label }}
                  </span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span class="text-3xl font-bold text-content-primary dark:text-content-primary">{{
                    result.rtt_ms.toFixed(2)
                  }}</span>
                  <span class="text-content-secondary dark:text-content-muted">ms</span>
                </div>
              </div>

              <!-- Signal Metrics -->
              <div class="grid grid-cols-2 gap-3">
                <!-- RSSI -->
                <div
                  class="bg-background-mute dark:bg-background/50 border border-stroke-subtle dark:border-stroke/10 rounded-[15px] p-4"
                >
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-content-secondary dark:text-content-muted text-sm">RSSI</span>
                    <div class="flex gap-0.5">
                      <div
                        v-for="i in 5"
                        :key="i"
                        :class="[
                          'w-1 h-3 rounded-sm',
                          i <= getSignalStrength.bars
                            ? getSignalStrength.color
                            : 'bg-stroke-subtle dark:bg-stroke/10',
                        ]"
                      ></div>
                    </div>
                  </div>
                  <div class="flex items-baseline gap-1">
                    <span
                      class="text-xl font-bold text-content-primary dark:text-content-primary"
                      >{{ result.rssi }}</span
                    >
                    <span class="text-content-secondary dark:text-content-muted text-xs">dBm</span>
                  </div>
                </div>

                <!-- SNR -->
                <div
                  class="bg-background-mute dark:bg-background/50 border border-stroke-subtle dark:border-stroke/10 rounded-[15px] p-4"
                >
                  <div class="text-content-secondary dark:text-content-muted text-sm mb-2">SNR</div>
                  <div class="flex items-baseline gap-1">
                    <span
                      class="text-xl font-bold text-content-primary dark:text-content-primary"
                      >{{ result.snr_db }}</span
                    >
                    <span class="text-content-secondary dark:text-content-muted text-xs">dB</span>
                  </div>
                </div>
              </div>

              <!-- Multi-byte hash mode firmware warning -->
              <div
                v-if="isMultiByteMode"
                class="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-[12px] p-3"
              >
                <svg
                  class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.268 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div class="text-xs leading-relaxed">
                  <p class="font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
                    {{ hashModeLabel }} path hashes active
                  </p>
                  <p class="text-content-secondary dark:text-content-muted">
                    This result uses multi-byte path hashes. The repeater being traced must be
                    running firmware that supports multi-byte path hashes. Repeaters on older
                    firmware will not respond to or correctly route these trace packets.
                  </p>
                </div>
              </div>

              <!-- Path -->
              <div
                class="bg-background-mute dark:bg-background/50 border border-stroke-subtle dark:border-stroke/10 rounded-[15px] p-4"
              >
                <div class="text-content-secondary dark:text-content-muted text-sm mb-3">
                  Network Path
                </div>
                <div class="relative">
                  <div class="flex items-center gap-2 overflow-x-auto pb-2">
                    <div
                      v-for="(hop, index) in result.path"
                      :key="index"
                      class="flex items-center gap-2 flex-shrink-0 relative"
                    >
                      <div
                        :class="[
                          'bg-cyan-400/20 dark:bg-primary/20 text-cyan-600 dark:text-primary border border-cyan-400/40 dark:border-primary/30 px-3 py-1.5 rounded-lg text-sm font-mono transition-all duration-300',
                          isAnimating && Math.floor(getPacketPosition) === index
                            ? 'ring-2 ring-cyan-400/50 dark:ring-primary/50 scale-105'
                            : '',
                        ]"
                      >
                        {{ hop }}
                      </div>

                      <!-- Animated packet icon between hops -->
                      <div v-if="index < result.path.length - 1" class="relative flex items-center">
                        <svg
                          class="w-4 h-4 text-white/40 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>

                        <!-- Traveling packet icon -->
                        <Transition name="packet">
                          <div
                            v-if="
                              isAnimating &&
                              getPacketPosition >= index &&
                              getPacketPosition < index + 1
                            "
                            class="absolute left-1/2 -translate-x-1/2 animate-pulse"
                          >
                            <svg
                              class="w-3 h-3 text-cyan-500 dark:text-primary drop-shadow-[0_0_6px_rgba(6,182,212,0.8)] dark:drop-shadow-[0_0_6px_rgba(59,130,246,0.8)]"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <circle cx="12" cy="12" r="8" />
                            </svg>
                          </div>
                        </Transition>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  class="text-content-muted dark:text-content-muted text-xs mt-2 flex items-center justify-between"
                >
                  <span>{{ result.path.length }} hop{{ result.path.length !== 1 ? 's' : '' }}</span>
                  <span v-if="isAnimating" class="text-cyan-500 dark:text-primary animate-pulse"
                    >● Tracing route...</span
                  >
                </div>
              </div>

              <!-- Metadata -->
              <div
                class="flex items-center justify-between text-xs text-content-muted dark:text-content-muted pt-2"
              >
                <span>Target: {{ result.target_id }}</span>
                <span>Tag: #{{ result.tag }}</span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-stroke-subtle dark:border-stroke/10 px-6 py-4">
            <button
              @click="close"
              class="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-600 dark:bg-primary/20 dark:text-primary dark:border dark:border-primary/30 dark:hover:bg-primary/30 dark:from-transparent dark:to-transparent rounded-lg font-medium transition-all shadow-[0_2px_12px_rgba(6,182,212,0.3)] dark:shadow-none"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.2s ease;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
}

.packet-enter-active,
.packet-leave-active {
  transition: all 0.15s ease;
}

.packet-enter-from,
.packet-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.5);
}
</style>
