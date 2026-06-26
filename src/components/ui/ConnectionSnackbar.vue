<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useWebSocketStore } from '@/stores/websocket';

defineOptions({ name: 'ConnectionSnackbar' });

const websocketStore = useWebSocketStore();
const { snackbar } = storeToRefs(websocketStore);

const variantClass = {
  info: 'border-accent-cyan/opacity-medium bg-accent-cyan/opacity-light text-accent-cyan',
  success: 'border-accent-green/opacity-medium bg-accent-green/opacity-light text-accent-green',
  error: 'border-accent-red/opacity-medium bg-accent-red/opacity-light text-accent-red',
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