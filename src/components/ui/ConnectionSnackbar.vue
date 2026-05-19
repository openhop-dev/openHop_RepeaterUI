<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useWebSocketStore } from '@/stores/websocket';

defineOptions({ name: 'ConnectionSnackbar' });

const websocketStore = useWebSocketStore();
const { snackbar } = storeToRefs(websocketStore);

const variantClass = {
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  success: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
};
</script>

<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="snackbar.visible"
      class="fixed bottom-5 right-5 z-[150] max-w-sm rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl"
      :class="variantClass[snackbar.variant]"
    >
      <p class="text-sm font-medium">{{ snackbar.message }}</p>
    </div>
  </transition>
</template>