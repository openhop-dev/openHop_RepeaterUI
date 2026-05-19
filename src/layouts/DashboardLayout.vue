<script setup lang="ts">
import { ref, computed } from 'vue';
import Sidebar from '@/components/nav/Sidebar.vue';
import MobileSidebar from '@/components/nav/MobileSidebar.vue';
import TopBar from '@/components/nav/TopBar.vue';
import { useDataService } from '@/stores/dataService';

defineOptions({ name: 'DashboardLayout' });

const showMobileSidebar = ref(false);
const dataService = useDataService();

// Block the route view while bootstrap is running to avoid mounting all chart
// components simultaneously with the HTTP burst on low-memory devices.
// "all pending" means bootstrap hasn't started yet — also block in that case.
const showContent = computed(() => {
  const allPending = Object.values(dataService.loadProgress).every((s) => s === 'pending');
  return !allPending && !dataService.isBootstrapping;
});

const toggleMobileSidebar = () => {
  showMobileSidebar.value = !showMobileSidebar.value;
};

const closeMobileSidebar = () => {
  showMobileSidebar.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-background dark:bg-background overflow-hidden relative font-sans">
    <!-- Light mode background gradient ellipses -->
    <div
      class="hidden lg:block dark:hidden absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-cyan-200/30 to-blue-100/20 blur-[120px] opacity-70 -top-[79px] left-[575px] mix-blend-normal pointer-events-none"
    ></div>

    <div
      class="hidden lg:block dark:hidden absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-purple-200/25 to-pink-100/15 blur-[120px] opacity-60 -top-[94px] -left-[92px] mix-blend-normal pointer-events-none"
    ></div>

    <div
      class="hidden lg:block dark:hidden absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-emerald-200/25 to-teal-100/15 blur-[120px] opacity-65 top-[373px] left-[246px] mix-blend-normal pointer-events-none"
    ></div>

    <!-- Dark mode background gradient ellipses -->
    <div
      class="hidden lg:dark:block absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-cyan-400/25 to-cyan-200/10 blur-[120px] opacity-80 -top-[79px] left-[575px] mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="hidden lg:dark:block absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-cyan-400/25 to-cyan-200/10 blur-[120px] opacity-75 -top-[94px] -left-[92px] mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="hidden lg:dark:block absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] bg-gradient-to-b from-cyan-400/25 to-cyan-200/10 blur-[120px] opacity-80 top-[373px] left-[246px] mix-blend-screen pointer-events-none"
    ></div>

    <div class="relative flex min-h-screen">
      <!-- Desktop Sidebar -->
      <Sidebar />

      <!-- Mobile Sidebar -->
      <MobileSidebar
        :showMobileSidebar="showMobileSidebar"
        @update:showMobileSidebar="showMobileSidebar = $event"
        @close="closeMobileSidebar"
      />

      <!-- Main Content -->
      <main class="flex-1 p-4 lg:p-[15px] overflow-y-auto">
        <!-- Top Bar -->
        <TopBar @toggle-mobile-sidebar="toggleMobileSidebar" />

        <!-- Router View for Page Content — withheld during bootstrap to avoid
             mounting chart components alongside the HTTP burst on mobile -->
        <router-view v-if="showContent" />
      </main>
    </div>
  </div>
</template>
