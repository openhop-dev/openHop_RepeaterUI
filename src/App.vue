<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import DashboardLayout from '@/layouts/DashboardLayout.vue';
import { isAuthenticated } from '@/utils/auth';
import { useTheme } from '@/composables/useTheme';
import { useConnectionLifecycle } from '@/composables/useConnectionLifecycle';
import ConnectionSnackbar from '@/components/ui/ConnectionSnackbar.vue';
import BootstrapModal from '@/components/modals/BootstrapModal.vue';
import { useAppRuntimeStore } from '@/stores/appRuntime';

const route = useRoute();
const appRuntime = useAppRuntimeStore();

// Initialize theme
const { theme } = useTheme();
useConnectionLifecycle();

watch(
  () => route.fullPath,
  () => {
    appRuntime.syncAuthState();
  },
  { immediate: true },
);

// Show layout only if authenticated AND not on login page
const showLayout = computed(() => {
  const isLoginPage = route.path === '/login';
  const authenticated = isAuthenticated();
  const shouldShow = authenticated && !isLoginPage;
  return shouldShow;
});
</script>

<template>
  <!-- Use layout for authenticated pages -->
  <DashboardLayout v-if="showLayout" />

  <!-- Direct render for login page (no layout) -->
  <router-view v-else />

  <ConnectionSnackbar />
  <BootstrapModal v-if="showLayout" />
</template>

<style>
body {
  margin: 0;
  padding: 0;
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

/* Light mode styles */
body {
  background-color: #f9fafb;
  color: #1f2937;
}

/* Dark mode styles */
.dark body {
  background-color: #09090b;
  color: white;
}

/* Scrollbar styles for dark mode */
.dark html {
  scrollbar-width: thin;
  scrollbar-color: #374151 #1f2937;
}

.dark html::-webkit-scrollbar {
  width: 8px;
}

.dark html::-webkit-scrollbar-track {
  background: #1f2937;
}

.dark html::-webkit-scrollbar-thumb {
  background-color: #374151;
  border-radius: 4px;
}

.dark html::-webkit-scrollbar-thumb:hover {
  background-color: #4b5563;
}

/* Scrollbar styles for light mode */
html {
  scrollbar-width: thin;
  scrollbar-color: #d1d5db #f3f4f6;
}

html::-webkit-scrollbar {
  width: 8px;
}

html::-webkit-scrollbar-track {
  background: #f3f4f6;
}

html::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 4px;
}

html::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}

/* Hide scrollbar for tab navigation while still allowing scroll */
.scrollbar-hide {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}
</style>
