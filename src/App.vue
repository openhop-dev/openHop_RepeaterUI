<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import DashboardLayout from '@/layouts/DashboardLayout.vue';
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

const showLayout = computed(() => appRuntime.isAuthenticated && route.path !== '/login' && route.path !== '/setup');

let mobileQuery: MediaQueryList | null = null;

const setMobileShellClass = (isMobile: boolean) => {
  document.documentElement.classList.toggle('is-mobile-app', isMobile);
  document.body.classList.toggle('is-mobile-app', isMobile);
};

const handleMobileQueryChange = (event: MediaQueryListEvent) => {
  setMobileShellClass(event.matches);
};

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 1023px)');
  setMobileShellClass(mobileQuery.matches);
  mobileQuery.addEventListener('change', handleMobileQueryChange);
});

onUnmounted(() => {
  mobileQuery?.removeEventListener('change', handleMobileQueryChange);
  mobileQuery = null;
  setMobileShellClass(false);
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

/* Use CSS variables from base.css */
body {
  background-color: var(--color-background);
  color: var(--color-text);
}

/* Dark mode uses same variables */
.dark body {
  background-color: var(--color-background);
  color: var(--color-text);
}

/* Scrollbar styles for dark mode */
.dark html {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) var(--color-background-mute);
}

.dark html::-webkit-scrollbar {
  width: 8px;
}

.dark html::-webkit-scrollbar-track {
  background: var(--color-background-mute);
}

.dark html::-webkit-scrollbar-thumb {
  background-color: var(--color-border-hover);
  border-radius: 4px;
}

.dark html::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-muted);
}

/* Scrollbar styles for light mode */
html {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) var(--color-background-soft);
}

html::-webkit-scrollbar {
  width: 8px;
}

html::-webkit-scrollbar-track {
  background: var(--color-background-soft);
}

html::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 4px;
}

html::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-border-hover);
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
