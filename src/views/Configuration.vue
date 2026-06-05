<script setup lang="ts">
import { ref, computed, onMounted, watch, type Ref, type ComponentPublicInstance } from 'vue';
import { useRoute, onBeforeRouteUpdate } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';
import RadioSettings from '@/components/configuration/RadioSettings.vue';
import RadioHardwareSettings from '@/components/configuration/RadioHardwareSettings.vue';
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
import PolicyEngineSettings from '@/components/configuration/PolicyEngineSettings.vue';
import { getPreference, setPreference } from '@/utils/preferences';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'ConfigurationView' });

type EditableTabRef = ComponentPublicInstance & { requestLeave: (cb: () => void) => void; isEditing: Ref<boolean> | boolean };

const route = useRoute();
const systemStore = useSystemStore();
const dataService = useDataService();

const DEFAULT_TAB = 'radio';

const activeTab = ref(getPreference('configuration_activeTab', DEFAULT_TAB));
const initialLoadComplete = ref(false);

// ── Editable tab refs (for unsaved-changes guard) ─────────────────────────────

const radioRef          = ref<EditableTabRef | null>(null);
const radioHardwareRef  = ref<EditableTabRef | null>(null);
const repeaterRef       = ref<EditableTabRef | null>(null);
const advertRef         = ref<EditableTabRef | null>(null);
const dutyRef           = ref<EditableTabRef | null>(null);
const delaysRef         = ref<EditableTabRef | null>(null);
const transportRef      = ref<EditableTabRef | null>(null);
const letsMeshRef       = ref<EditableTabRef | null>(null);

const editableTabRefs: Record<string, Ref<EditableTabRef | null>> = {
  radio:           radioRef,
  'radio-hardware': radioHardwareRef,
  repeater:        repeaterRef,
  advert:          advertRef,
  duty:            dutyRef,
  delays:          delaysRef,
  transport:       transportRef,
  observer:        letsMeshRef,
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

// ── Route → active tab ────────────────────────────────────────────────────────

const VALID_TABS = new Set([
  'radio', 'radio-hardware', 'repeater', 'duty', 'delays',
  'advert', 'transport', 'api-tokens', 'web', 'observer', 'policy-engine',
  'backup', 'database', 'memory',
]);

function resolveTab(queryTab: string | undefined): string {
  if (queryTab && VALID_TABS.has(queryTab)) return queryTab;
  return getPreference('configuration_activeTab', DEFAULT_TAB);
}

// Apply tab from query param immediately on mount.
activeTab.value = resolveTab(route.query.tab as string | undefined);

watch(activeTab, (val) => setPreference('configuration_activeTab', val));

// Watch same-route query changes (sidebar clicks while already on /configuration).
// Guard against unsaved changes before allowing the switch.
onBeforeRouteUpdate((to, _from, next) => {
  const incoming = resolveTab(to.query.tab as string | undefined);
  if (incoming === activeTab.value) { next(); return; }

  if (isCurrentTabEditing()) {
    requestCurrentTabLeave(() => {
      activeTab.value = incoming;
      next();
    });
    // Don't call next() — requestCurrentTabLeave will do it after confirmation.
    return;
  }

  activeTab.value = incoming;
  next();
});

// ── Data loading ──────────────────────────────────────────────────────────────

onMounted(async () => {
  if (systemStore.stats) {
    initialLoadComplete.value = true;
  } else {
    try {
      await dataService.ensure('stats');
    } catch (error) {
      console.error('Failed to load configuration data:', error);
    } finally {
      initialLoadComplete.value = true;
    }
  }
});
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

    <!-- Content panel -->
    <div class="glass-card rounded-[15px] p-3 sm:p-6 mt-4 sm:mt-6">
      <!-- Loading state — only on initial load -->
      <div
        v-if="!initialLoadComplete && systemStore.isLoading"
        class="flex items-center justify-center py-12"
      >
        <div class="text-center">
          <Spinner class="mx-auto mb-4" />
          <div class="text-content-secondary dark:text-content-muted">Loading configuration...</div>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-else-if="initialLoadComplete && !systemStore.stats"
        class="flex items-center justify-center py-12"
      >
        <div class="text-center">
          <div class="text-accent-red mb-2">Failed to load configuration</div>
          <div class="text-content-secondary dark:text-content-muted text-sm mb-4">
            {{ systemStore.error }}
          </div>
          <button @click="systemStore.fetchStats()" class="btn-primary">Retry</button>
        </div>
      </div>

      <!-- Active panel -->
      <div v-else class="min-h-[400px]">
        <RadioSettings          v-if="activeTab === 'radio'"         ref="radioRef"         key="radio-settings" />
        <RadioHardwareSettings  v-if="activeTab === 'radio-hardware'" ref="radioHardwareRef" key="radio-hardware-settings" />
        <RepeaterSettings       v-if="activeTab === 'repeater'"      ref="repeaterRef"      key="repeater-settings" />
        <AdvertSettings         v-if="activeTab === 'advert'"        ref="advertRef"        key="advert-settings" />
        <DutyCycle              v-if="activeTab === 'duty'"          ref="dutyRef"          key="duty-cycle" />
        <TransmissionDelays     v-if="activeTab === 'delays'"        ref="delaysRef"        key="transmission-delays" />
        <TransportKeys          v-if="activeTab === 'transport'"     ref="transportRef"     key="transport-keys" />
        <APITokens              v-if="activeTab === 'api-tokens'"                           key="api-tokens" />
        <WebSettings            v-if="activeTab === 'web'"                                  key="web-settings" />
        <LetsMeshSettings       v-if="activeTab === 'observer'"      ref="letsMeshRef"      key="letsmesh-settings" />
        <PolicyEngineSettings   v-if="activeTab === 'policy-engine'"                        key="policy-engine" />
        <BackupRestore          v-if="activeTab === 'backup'"                               key="backup-restore" />
        <DatabaseManagement     v-if="activeTab === 'database'"                             key="database-management" />
        <MemoryDebug            v-if="activeTab === 'memory'"                               key="memory-debug" />
      </div>
    </div>
  </div>
</template>
