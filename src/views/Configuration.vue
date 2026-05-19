<script setup lang="ts">
import { ref, onMounted, watch, nextTick, type Ref, type ComponentPublicInstance } from 'vue';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';
import RadioSettings from '@/components/configuration/RadioSettings.vue';
import RepeaterSettings from '@/components/configuration/RepeaterSettings.vue';
import DutyCycle from '@/components/configuration/DutyCycle.vue';
import TransmissionDelays from '@/components/configuration/TransmissionDelays.vue';
import TransportKeys from '@/components/configuration/TransportKeys.vue';
import APITokens from '@/components/configuration/APITokens.vue';
import WebSettings from '@/components/configuration/WebSettings.vue';
import AdvertSettings from '@/components/configuration/AdvertSettings.vue';
import LetsMeshSettings from '@/components/configuration/LetsMeshSettings.vue';
import BackupRestore from '@/components/configuration/BackupRestore.vue';
import DatabaseManagement from '@/components/configuration/DatabaseManagement.vue';
import MemoryDebug from '@/components/configuration/MemoryDebug.vue';
import { getPreference, setPreference } from '@/utils/preferences';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'ConfigurationView' });

type EditableTabRef = ComponentPublicInstance & { requestLeave: (cb: () => void) => void; isEditing: Ref<boolean> | boolean };

const systemStore = useSystemStore();
const dataService = useDataService();
const activeTab = ref(getPreference('configuration_activeTab', 'radio'));
const initialLoadComplete = ref(false);
const tabsContainer = ref<HTMLElement | null>(null);
const showRightFade = ref(false);
const showLeftFade = ref(false);

const radioRef = ref<EditableTabRef | null>(null);
const repeaterRef = ref<EditableTabRef | null>(null);
const advertRef = ref<EditableTabRef | null>(null);
const dutyRef = ref<EditableTabRef | null>(null);
const delaysRef = ref<EditableTabRef | null>(null);
const transportRef = ref<EditableTabRef | null>(null);
const letsMeshRef = ref<EditableTabRef | null>(null);

const editableTabRefs: Record<string, Ref<EditableTabRef | null>> = {
  radio: radioRef,
  repeater: repeaterRef,
  advert: advertRef,
  duty: dutyRef,
  delays: delaysRef,
  transport: transportRef,
  observer: letsMeshRef,
};

function isCurrentTabEditing(): boolean {
  const r = editableTabRefs[activeTab.value]?.value;
  if (!r) return false;
  const editing = r.isEditing;
  return typeof editing === 'boolean' ? editing : editing.value;
}

function requestCurrentTabLeave(callback: () => void) {
  const ref = editableTabRefs[activeTab.value]?.value;
  if (ref) {
    ref.requestLeave(callback);
  } else {
    callback();
  }
}

function updateFades() {
  if (!tabsContainer.value) return;
  const el = tabsContainer.value;
  showLeftFade.value = el.scrollLeft > 4;
  showRightFade.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
}

function scrollTabs(direction: 'left' | 'right') {
  if (!tabsContainer.value) return;
  tabsContainer.value.scrollBy({ left: direction === 'right' ? 150 : -150, behavior: 'smooth' });
}

// Watch for changes and persist to localStorage
watch(activeTab, (value) => setPreference('configuration_activeTab', value));

const tabs = [
  { id: 'radio', label: 'Radio Settings', icon: 'radio' },
  { id: 'repeater', label: 'Repeater Settings', icon: 'repeater' },
  { id: 'advert', label: 'Advert Limits', icon: 'advert' },
  { id: 'duty', label: 'Duty Cycle', icon: 'duty' },
  { id: 'delays', label: 'TX Delays', icon: 'delays' },
  { id: 'transport', label: 'Region Configuration', icon: 'keys' },
  { id: 'api-tokens', label: 'API Tokens', icon: 'tokens' },
  { id: 'web', label: 'Web Options', icon: 'web' },
  { id: 'observer', label: 'Observer', icon: 'observer' },
  { id: 'backup', label: 'Backup', icon: 'backup' },
  { id: 'database', label: 'Database', icon: 'database' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
];

onMounted(async () => {
  if (systemStore.stats) {
    // Stats already in store (normal path after bootstrap) — no fetch needed.
    // DataService polls freshness in the background; the page reacts to store changes.
    initialLoadComplete.value = true;
  } else {
    // Bootstrap failed to load stats — try once before showing the page.
    try {
      await dataService.ensure('stats');
    } catch (error) {
      console.error('Failed to load configuration data:', error);
    } finally {
      initialLoadComplete.value = true;
    }
  }
  nextTick(() => updateFades());
});

function setActiveTab(tabId: string) {
  if (tabId !== activeTab.value && isCurrentTabEditing()) {
    requestCurrentTabLeave(() => { activeTab.value = tabId; });
    return;
  }
  activeTab.value = tabId;
}
</script>

<template>
  <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-content-primary dark:text-content-primary">
          Configuration
        </h1>
        <p class="text-content-secondary dark:text-content-muted mt-1 sm:mt-2 text-sm sm:text-base">
          System configuration and settings
        </p>
      </div>

      <!-- CAD Calibration Tool Banner — shown only when no calibration is saved yet -->
      <router-link
        v-if="initialLoadComplete && !(systemStore.stats?.config?.radio as any)?.cad?.peak_threshold"
        to="/cad-calibration"
        class="flex-shrink-0 flex items-center gap-4 px-5 py-3 min-w-[280px] rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div>
          <div class="text-sm font-semibold">CAD Calibration Available</div>
          <div class="text-xs text-primary/70">Optimise CAD settings →</div>
        </div>
      </router-link>
    </div>

    <!-- Configuration Tabs -->
    <div class="glass-card rounded-[15px] p-3 sm:p-6 mt-4 sm:mt-6">
      <!-- Tab Navigation -->
      <div class="relative -mx-3 sm:mx-0 mb-4 sm:mb-6">
        <!-- Left scroll fade + button (mobile only) -->
        <Transition name="tab-fade">
          <div
            v-if="showLeftFade"
            class="absolute left-0 top-0 bottom-[1px] w-12 z-10 flex items-center"
          >
            <div class="tab-fade-left absolute inset-0 pointer-events-none"></div>
            <button
              @click="scrollTabs('left')"
              class="relative z-10 ml-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-surface shadow-md border border-stroke-subtle dark:border-stroke/30 text-content-muted"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </Transition>

        <!-- Right scroll fade + button (mobile only) -->
        <Transition name="tab-fade">
          <div
            v-if="showRightFade"
            class="absolute right-0 top-0 bottom-[1px] w-12 z-10 flex items-center justify-end"
          >
            <div class="tab-fade-right absolute inset-0 pointer-events-none"></div>
            <button
              @click="scrollTabs('right')"
              class="relative z-10 mr-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-surface shadow-md border border-stroke-subtle dark:border-stroke/30 text-content-muted"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </Transition>

        <div
          ref="tabsContainer"
          @scroll="updateFades"
          class="flex overflow-x-auto border-b border-stroke-subtle dark:border-stroke px-3 sm:px-0 scrollbar-hide"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="setActiveTab(tab.id)"
            :class="[
              'px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors duration-200 border-b-2 mr-3 sm:mr-6 whitespace-nowrap flex-shrink-0',
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-content-secondary dark:text-content-muted border-transparent hover:text-content-primary dark:hover:text-content-primary hover:border-stroke-subtle dark:hover:border-stroke/30',
            ]"
          >
            <div class="flex items-center gap-1 sm:gap-2">
              <!-- Icons for each tab -->
              <svg
                v-if="tab.icon === 'radio'"
                class="w-3.5 h-3.5 sm:w-4 sm:h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.822c5.716-5.716 14.976-5.716 20.692 0"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'repeater'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 12h14M5 12l4-4m-4 4l4 4"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'advert'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'duty'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'delays'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'keys'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'tokens'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'web'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'observer'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'backup'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'database'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                />
              </svg>
              <svg
                v-else-if="tab.icon === 'memory'"
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
              {{ tab.label }}
            </div>
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="min-h-[400px]">
        <!-- Loading State - only show on initial load -->
        <div
          v-if="!initialLoadComplete && systemStore.isLoading"
          class="flex items-center justify-center py-12"
        >
          <div class="text-center">
            <Spinner class="mx-auto mb-4" />
            <div class="text-content-secondary dark:text-content-muted">
              Loading configuration...
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div
          v-else-if="initialLoadComplete && !systemStore.stats"
          class="flex items-center justify-center py-12"
        >
          <div class="text-center">
            <div class="text-accent-red mb-2">Failed to load configuration</div>
            <div class="text-content-secondary dark:text-content-muted text-sm mb-4">
              {{ systemStore.error }}
            </div>
            <button
              @click="systemStore.fetchStats()"
              class="btn-primary"
            >
              Retry
            </button>
          </div>
        </div>

        <!-- Tab Components -->
        <div v-else>
          <div v-if="activeTab === 'radio'">
            <RadioSettings ref="radioRef" key="radio-settings" />
          </div>
          <div v-if="activeTab === 'repeater'">
            <RepeaterSettings ref="repeaterRef" key="repeater-settings" />
          </div>
          <div v-if="activeTab === 'advert'">
            <AdvertSettings ref="advertRef" key="advert-settings" />
          </div>
          <div v-if="activeTab === 'duty'">
            <DutyCycle ref="dutyRef" key="duty-cycle" />
          </div>
          <div v-if="activeTab === 'delays'">
            <TransmissionDelays ref="delaysRef" key="transmission-delays" />
          </div>
          <div v-if="activeTab === 'transport'">
            <TransportKeys ref="transportRef" key="transport-keys" />
          </div>
          <div v-if="activeTab === 'api-tokens'">
            <APITokens key="api-tokens" />
          </div>
          <div v-if="activeTab === 'web'">
            <WebSettings key="web-settings" />
          </div>
          <div v-if="activeTab === 'observer'">
            <LetsMeshSettings ref="letsMeshRef" key="letsmesh-settings" />
          </div>
          <div v-if="activeTab === 'backup'">
            <BackupRestore key="backup-restore" />
          </div>
          <div v-if="activeTab === 'database'">
            <DatabaseManagement key="database-management" />
          </div>
          <div v-if="activeTab === 'memory'">
            <MemoryDebug key="memory-debug" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-fade-left {
  background: linear-gradient(to right, var(--color-surface) 30%, transparent);
}
.tab-fade-right {
  background: linear-gradient(to left, var(--color-surface) 30%, transparent);
}
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.2s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>
