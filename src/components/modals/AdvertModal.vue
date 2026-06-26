<script setup lang="ts">
import { ref, watch } from 'vue';
import RadioTower from '@/components/icons/radiotower.vue';

defineOptions({ name: 'AdvertModal' });

interface Props {
  isOpen: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  error: null,
});

const emit = defineEmits<{
  close: [];
  send: [];
}>();

// Local state for animations
const showModal = ref(false);
const showContent = ref(false);
const showPingPulse = ref(false);

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      showModal.value = true;
      setTimeout(() => {
        showContent.value = true;
      }, 50);
    } else {
      showContent.value = false;
      showPingPulse.value = false;
      setTimeout(() => {
        showModal.value = false;
      }, 300);
    }
  },
  { immediate: true },
);

// Reset ping pulse when not loading
watch(
  () => props.isLoading,
  (isLoading) => {
    if (!isLoading) {
      setTimeout(() => {
        showPingPulse.value = false;
      }, 1000); // Let it finish the current animation
    }
  },
);

const handleClose = () => {
  if (!props.isLoading) {
    emit('close');
  }
};

const handleSend = () => {
  if (!props.isLoading) {
    // Trigger the ping pulse animation
    showPingPulse.value = true;
    emit('send');
  }
};

// Check if error is just a network timeout but the advert might have been sent
const isNetworkTimeoutError = (error: string | null) => {
  return error?.includes('Network error - no response received') || error?.includes('timeout');
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showModal"
      class="modal-backdrop"
      @click.self="handleClose"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/opacity-heavy backdrop-blur-sm transition-opacity duration-300"
        :class="showContent ? 'opacity-100' : 'opacity-0'"
      ></div>

      <!-- Modal -->
      <div
        class="relative bg-white dark:bg-surface-elevated backdrop-blur-xl rounded-[20px] p-8 max-w-md w-full transform transition-all duration-300 border border-stroke-subtle dark:border-white/opacity-light"
        :class="showContent ? 'scale-100 opacity-100' : 'scale-95 opacity-0'"
      >
        <!-- Close button -->
        <button
          v-if="!isLoading"
          @click="handleClose"
          class="absolute top-4 right-4 text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors p-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>

        <!-- Content -->
        <div class="text-center">
          <!-- Title -->
          <h2 class="text-content-primary text-xl font-semibold mb-6">
            Send Advertisement
          </h2>

          <!-- Radio Tower Animation -->
          <div class="relative flex items-center justify-center mb-8">
            <div class="relative w-32 h-32">
              <!-- Radio Tower SVG Component -->
              <div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <RadioTower
                  class="w-16 h-16 transition-all duration-500"
                  :class="[
                    isLoading ? 'animate-pulse' : '',
                    isSuccess
                      ? 'text-accent-green'
                      : error && !isNetworkTimeoutError(error)
                        ? 'text-accent-red'
                        : 'text-primary',
                  ]"
                  :style="{
                    filter: isLoading
                      ? 'drop-shadow(0 0 8px currentColor)'
                      : isSuccess
                        ? 'drop-shadow(0 0 8px var(--color-accent-green))'
                        : error && !isNetworkTimeoutError(error)
                          ? 'drop-shadow(0 0 8px var(--color-accent-red))'
                          : 'drop-shadow(0 0 4px var(--color-primary))',
                  }"
                />
              </div>

              <!-- Signal waves emanating from tower -->
              <div
                v-if="isLoading || isSuccess"
                class="absolute inset-0 flex items-center justify-center"
              >
                <!-- Wave 1 -->
                <div
                  class="absolute w-16 h-16 rounded-full border-2 animate-ping"
                  :class="[isSuccess ? 'border-accent-green/opacity-heavy' : 'border-primary/opacity-heavy']"
                  style="animation-duration: 1.5s"
                ></div>
                <!-- Wave 2 -->
                <div
                  class="absolute w-24 h-24 rounded-full border-2 animate-ping"
                  :class="[isSuccess ? 'border-accent-green/opacity-heavy' : 'border-primary/opacity-heavy']"
                  style="animation-duration: 2s; animation-delay: 0.3s"
                ></div>
                <!-- Wave 3 -->
                <div
                  class="absolute w-32 h-32 rounded-full border-2 animate-ping"
                  :class="[isSuccess ? 'border-accent-green/opacity-medium' : 'border-primary/opacity-medium']"
                  style="animation-duration: 2.5s; animation-delay: 0.6s"
                ></div>
              </div>

              <!-- Initial Send Click Ping Pulse -->
              <div v-if="showPingPulse" class="absolute inset-0 flex items-center justify-center">
                <!-- Immediate ping on button click -->
                <div
                  class="absolute w-8 h-8 rounded-full border-4 border-secondary animate-ping-fast"
                ></div>
                <div
                  class="absolute w-16 h-16 rounded-full border-3 border-secondary/opacity-heavy animate-ping-fast"
                  style="animation-delay: 0.1s"
                ></div>
                <div
                  class="absolute w-24 h-24 rounded-full border-2 border-secondary/opacity-heavy animate-ping-fast"
                  style="animation-delay: 0.2s"
                ></div>
                <div
                  class="absolute w-32 h-32 rounded-full border-2 border-secondary/opacity-medium animate-ping-fast"
                  style="animation-delay: 0.3s"
                ></div>
              </div>

              <!-- Receiving devices positioned around the tower -->
              <div v-if="isLoading || isSuccess" class="absolute inset-0">
                <!-- Device 1 - Top Right -->
                <div
                  class="absolute top-2 right-2 w-4 h-4 rounded-full transition-all duration-500 animate-pulse"
                  :class="[
                    isSuccess
                      ? 'bg-accent-green shadow-lg shadow-accent-green/50'
                      : 'bg-primary/opacity-heavy shadow-lg shadow-primary/30',
                  ]"
                  style="animation-delay: 0.5s"
                >
                  <div class="w-2 h-2 bg-white rounded-full mx-auto mt-1"></div>
                </div>

                <!-- Device 2 - Bottom Left -->
                <div
                  class="absolute bottom-2 left-2 w-4 h-4 rounded-full transition-all duration-500 animate-pulse"
                  :class="[
                    isSuccess
                      ? 'bg-accent-green shadow-lg shadow-accent-green/50'
                      : 'bg-primary/opacity-heavy shadow-lg shadow-primary/30',
                  ]"
                  style="animation-delay: 1s"
                >
                  <div class="w-2 h-2 bg-white rounded-full mx-auto mt-1"></div>
                </div>

                <!-- Device 3 - Right -->
                <div
                  class="absolute top-1/2 right-1 w-4 h-4 rounded-full transition-all duration-500 animate-pulse"
                  :class="[
                    isSuccess
                      ? 'bg-accent-green shadow-lg shadow-accent-green/50'
                      : 'bg-primary/opacity-heavy shadow-lg shadow-primary/30',
                  ]"
                  style="animation-delay: 1.5s; transform: translateY(-50%)"
                >
                  <div class="w-2 h-2 bg-white rounded-full mx-auto mt-1"></div>
                </div>

                <!-- Device 4 - Top Left -->
                <div
                  class="absolute top-3 left-3 w-4 h-4 rounded-full transition-all duration-500 animate-pulse"
                  :class="[
                    isSuccess
                      ? 'bg-accent-green shadow-lg shadow-accent-green/50'
                      : 'bg-primary/opacity-heavy shadow-lg shadow-primary/30',
                  ]"
                  style="animation-delay: 2s"
                >
                  <div class="w-2 h-2 bg-white rounded-full mx-auto mt-1"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Status Text -->
          <div class="mb-6">
            <p v-if="isLoading" class="text-content-primary text-lg">
              Broadcasting advertisement...
            </p>
            <p v-else-if="isSuccess" class="text-accent-green text-lg font-medium">
              Advertisement sent successfully!
            </p>
            <p v-else-if="error && isNetworkTimeoutError(error)" class="text-secondary text-lg">
              Advertisement likely sent
            </p>
            <p v-else-if="error" class="text-accent-red text-lg">Failed to send advertisement</p>
            <p v-else class="text-content-secondary dark:text-content-muted">
              This will broadcast your node's presence to nearby nodes.
            </p>

            <!-- Error message -->
            <div v-if="error" class="mt-3">
              <p v-if="isNetworkTimeoutError(error)" class="text-secondary text-sm">
                Network timeout occurred, but the advertisement may have been successfully
                transmitted to nearby nodes.
              </p>
              <p v-else class="text-accent-red text-sm">
                {{ error }}
              </p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div v-if="!isLoading && !isSuccess" class="flex gap-3">
            <button
              @click="handleClose"
              class="flex-1 bg-background-mute dark:bg-white/opacity-subtle border border-stroke-subtle dark:border-stroke/opacity-light hover:border-primary dark:hover:border-primary rounded-[10px] px-6 py-3 text-content-primary hover:bg-stroke-subtle dark:hover:bg-white/opacity-light transition-all duration-200"
            >
              Cancel
            </button>
            <button
              @click="handleSend"
              class="flex-1 rounded-[10px] px-6 py-3 font-medium transition-all duration-200 shadow-lg"
              :class="[
                error && isNetworkTimeoutError(error)
                  ? 'bg-secondary hover:bg-secondary/opacity-heavy text-background hover:shadow-secondary/opacity-medium'
                  : 'bg-primary hover:bg-primary/opacity-heavy text-background hover:shadow-primary/opacity-medium',
              ]"
            >
              {{ error && isNetworkTimeoutError(error) ? 'Try Again' : 'Send Advertisement' }}
            </button>
          </div>

          <!-- Auto-close timer for success state -->
          <div v-if="isSuccess" class="text-content-muted text-sm">Closing automatically...</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Glass card enhancement for modal */
.glass-card {
  background: color-mix(in srgb, var(--color-surface-elevated) 70%, transparent);
  backdrop-filter: blur(20px);
  border: 1px solid var(--color-glass-border);
}

/* Custom ping animation for radio waves */
@keyframes ping {
  75%,
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* Fast ping animation for button click */
@keyframes ping-fast {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  75%,
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

.animate-ping {
  animation: ping cubic-bezier(0, 0, 0.2, 1) infinite;
}

.animate-ping-fast {
  animation: ping-fast 0.8s cubic-bezier(0, 0, 0.2, 1) 3;
}
</style>
