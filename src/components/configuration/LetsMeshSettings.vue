<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import { authClient } from '@/utils/api';
import ApiService from '@/utils/api';
import brokerTemplatesData from '@/assets/broker-templates.json';

const systemStore = useSystemStore();
const mqttConfig = computed(() => systemStore.stats?.config?.mqtt_brokers || {});

const ALL_PACKET_TYPES = [
  'REQ', 'RESPONSE', 'TXT_MSG', 'ACK', 'ADVERT', 'GRP_TXT',
  'GRP_DATA', 'ANON_REQ', 'PATH', 'TRACE', 'RAW_CUSTOM',
];

interface BrokerTemplate {
  name: string;
  website: string;
  brokers: Omit<CustomBroker, '_id'>[];
}
const BROKER_TEMPLATES: BrokerTemplate[] = brokerTemplatesData as BrokerTemplate[];

interface CustomBroker {
  _id: number;
  enabled: boolean;
  name: string;
  host: string;
  port: number;
  format: string;
  audience?: string;
  use_jwt_auth?: boolean;
  username?: string;
  password?: string;
  disallowedInput?: string[];
  transport: string;
  base_topic?: string;
  retain_status: boolean;
  tls: { enabled?: boolean; insecure?: boolean };
}

function cloneBroker(b: CustomBroker): CustomBroker {
  return { ...b, tls: { ...b.tls }, disallowedInput: [...(b.disallowedInput ?? [])] };
}

// ── Global edit state ─────────────────────────────────────────────────────
const isGlobalEditing = ref(false);
const isSaving = ref(false);
const errorMsg = ref('');
const showRestartModal = ref(false);
const showUnsavedModal = ref(false);
const isRestarting = ref(false);
const pendingNavFn = ref<(() => void) | null>(null);

interface Snapshot {
  iata: string;
  interval: number;
  owner: string;
  email: string;
  brokers: CustomBroker[];
}
const globalSnapshot = ref<Snapshot | null>(null);

// ── Observer settings ─────────────────────────────────────────────────────
const isEditingObserver = ref(false);
const iataCodeInput = ref('');
const statusIntervalInput = ref(300);
const ownerInput = ref('');
const emailInput = ref('');

// ── Broker state ──────────────────────────────────────────────────────────
const customBrokers = ref<CustomBroker[]>([]);
const editingBrokerId = ref<number | null>(null);
const isNewBroker = ref(false);
const originalBrokerDraft = ref<CustomBroker | null>(null);
const brokerDraft = ref<CustomBroker>({
  _id: 0, enabled: true, name: '', host: '', port: 443, format: 'letsmesh',
  use_jwt_auth: false, transport: 'websockets', disallowedInput: [],
  retain_status: false, tls: { enabled: true, insecure: false },
});
const showTemplateMenu = ref(false);

// ── Live status ───────────────────────────────────────────────────────────
const status = ref<{
  handler_active: boolean;
  brokers: {
    enabled: boolean;
    name: string;
    host: string;
    status: { connected: boolean; reconnecting: boolean };
    format: string;
  }[];
} | null>(null);
const loadingStatus = ref(false);

async function fetchStatus() {
  loadingStatus.value = true;
  try {
    const res = await authClient.get('/api/mqtt_status');
    if (res.data?.success) status.value = res.data.data;
  } catch { /* silent */ } finally {
    loadingStatus.value = false;
  }
}

// ── Sync form from store ──────────────────────────────────────────────────
let _nextId = 1;
function mkBroker(b: Partial<Omit<CustomBroker, '_id'>> = {}): CustomBroker {
  return {
    _id: _nextId++, enabled: b.enabled ?? true, name: b.name ?? '',
    host: b.host ?? '', port: b.port ?? 0, audience: b.audience ?? '',
    format: b.format ?? 'letsmesh', use_jwt_auth: b.use_jwt_auth ?? false,
    username: b.username ?? '', password: b.password ?? '',
    transport: b.transport ?? 'websockets',
    disallowedInput: Array.isArray(b.disallowedInput) ? [...b.disallowedInput] : [],
    retain_status: b.retain_status ?? false, base_topic: b.base_topic ?? '',
    tls: { enabled: b.tls?.enabled ?? false, insecure: b.tls?.insecure ?? false },
  };
}

function syncForm() {
  const c = mqttConfig.value;
  iataCodeInput.value = c.iata_code ?? '';
  statusIntervalInput.value = c.status_interval ?? 300;
  ownerInput.value = c.owner ?? '';
  emailInput.value = c.email ?? '';
  customBrokers.value = Array.isArray(c.brokers)
    ? (c.brokers as Record<string, unknown>[]).map(b => mkBroker(b as Partial<Omit<CustomBroker, '_id'>>))
    : [];
}

watch(mqttConfig, () => {
  if (!isGlobalEditing.value) syncForm();
}, { immediate: true });

// ── API ───────────────────────────────────────────────────────────────────
function buildPayload() {
  return {
    iata_code: iataCodeInput.value,
    status_interval: statusIntervalInput.value,
    owner: ownerInput.value,
    email: emailInput.value,
    brokers: customBrokers.value.map(b => {
      const base = {
        name: b.name, enabled: b.enabled, transport: b.transport,
        host: b.host, port: b.port, use_jwt_auth: b.use_jwt_auth,
        format: b.format, disallowed_packet_types: b.disallowedInput,
        base_topic: b.base_topic, retain_status: b.retain_status,
        tls: { enabled: b.tls?.enabled ?? false, insecure: b.tls?.insecure ?? false },
      };
      return b.use_jwt_auth
        ? { ...base, audience: b.audience }
        : { ...base, username: b.username, password: b.password };
    }),
  };
}

async function callSaveApi(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await authClient.post('/api/update_mqtt_config', buildPayload());
    const data = res.data;
    if (data?.success) {
      await systemStore.fetchStats();
      await fetchStatus();
      return { success: true };
    }
    return { success: false, error: data?.error || 'Save failed' };
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string };
    return { success: false, error: e?.response?.data?.error || e?.message || 'Request failed' };
  }
}

// ── Global edit/save/cancel ───────────────────────────────────────────────
function startGlobalEditing() {
  syncForm();
  globalSnapshot.value = {
    iata: iataCodeInput.value,
    interval: statusIntervalInput.value,
    owner: ownerInput.value,
    email: emailInput.value,
    brokers: customBrokers.value.map(cloneBroker),
  };
  isGlobalEditing.value = true;
  errorMsg.value = '';
}

function cancelGlobalEditing() {
  if (globalSnapshot.value) {
    iataCodeInput.value = globalSnapshot.value.iata;
    statusIntervalInput.value = globalSnapshot.value.interval;
    ownerInput.value = globalSnapshot.value.owner;
    emailInput.value = globalSnapshot.value.email;
    customBrokers.value = globalSnapshot.value.brokers.map(cloneBroker);
  }
  editingBrokerId.value = null;
  isNewBroker.value = false;
  originalBrokerDraft.value = null;
  isEditingObserver.value = false;
  isGlobalEditing.value = false;
  globalSnapshot.value = null;
  errorMsg.value = '';
}

async function saveGlobalSettings() {
  // Commit any open broker edit before saving
  if (editingBrokerId.value !== null) {
    const d = brokerDraft.value;
    if (!d.name.trim() || !d.host.trim()) {
      errorMsg.value = 'Please complete or cancel the open broker edit before saving.';
      return;
    }
    commitBrokerDraft();
  }
  isSaving.value = true;
  errorMsg.value = '';
  const result = await callSaveApi();
  isSaving.value = false;
  if (result.success) {
    isGlobalEditing.value = false;
    isEditingObserver.value = false;
    globalSnapshot.value = null;
    showRestartModal.value = true;
  } else {
    errorMsg.value = result.error!;
  }
}

// ── Observer (local only, no API) ─────────────────────────────────────────
function doneEditingObserver() {
  isEditingObserver.value = false;
}

// ── Broker management (local only, no API) ────────────────────────────────
function addBroker() {
  if (editingBrokerId.value !== null) cancelBrokerEdit();
  const b = mkBroker();
  customBrokers.value.push(b);
  originalBrokerDraft.value = null;
  isNewBroker.value = true;
  brokerDraft.value = cloneBroker(b);
  editingBrokerId.value = b._id;
}

function openBrokerEdit(broker: CustomBroker) {
  if (editingBrokerId.value !== null && editingBrokerId.value !== broker._id) cancelBrokerEdit();
  originalBrokerDraft.value = cloneBroker(broker);
  isNewBroker.value = false;
  brokerDraft.value = cloneBroker(broker);
  editingBrokerId.value = broker._id;
}

function cancelBrokerEdit() {
  if (isNewBroker.value && editingBrokerId.value !== null) {
    customBrokers.value = customBrokers.value.filter(b => b._id !== editingBrokerId.value);
  } else if (originalBrokerDraft.value) {
    const idx = customBrokers.value.findIndex(b => b._id === originalBrokerDraft.value!._id);
    if (idx !== -1) customBrokers.value.splice(idx, 1, cloneBroker(originalBrokerDraft.value));
  }
  editingBrokerId.value = null;
  isNewBroker.value = false;
  originalBrokerDraft.value = null;
}

function commitBrokerDraft() {
  const d = brokerDraft.value;
  const idx = customBrokers.value.findIndex(b => b._id === d._id);
  if (idx !== -1) customBrokers.value.splice(idx, 1, cloneBroker(d));
  editingBrokerId.value = null;
  isNewBroker.value = false;
  originalBrokerDraft.value = null;
}

function removeBrokerLocal(id: number) {
  customBrokers.value = customBrokers.value.filter(b => b._id !== id);
  if (editingBrokerId.value === id) {
    editingBrokerId.value = null;
    isNewBroker.value = false;
    originalBrokerDraft.value = null;
  }
}

function addFromTemplate(tpl: BrokerTemplate) {
  showTemplateMenu.value = false;
  if (editingBrokerId.value !== null) cancelBrokerEdit();
  tpl.brokers.forEach(b => customBrokers.value.push(mkBroker(b)));
}

function onHostChange() {
  const d = brokerDraft.value;
  if (!d.audience || d.audience === d.host) d.audience = d.host;
}

function toggleDisallowed(broker: CustomBroker, type: string) {
  if (!broker.disallowedInput) broker.disallowedInput = [];
  const idx = broker.disallowedInput.indexOf(type);
  if (idx === -1) broker.disallowedInput.push(type);
  else broker.disallowedInput.splice(idx, 1);
}

const draftIsValid = computed(() => {
  const d = brokerDraft.value;
  return d.name.trim() !== '' && d.host.trim() !== '' &&
    d.port >= 1 && d.port <= 65535 &&
    (!d.use_jwt_auth || (d.audience?.trim() ?? '') !== '');
});

// ── Restart service ───────────────────────────────────────────────────────
async function restartService() {
  isRestarting.value = true;
  try {
    await ApiService.post('/restart_service', {});
  } catch { /* network drop on restart is expected */ } finally {
    isRestarting.value = false;
  }
  showRestartModal.value = false;
}

// ── Navigation guard ──────────────────────────────────────────────────────
onBeforeRouteLeave((to, from, next) => {
  if (isGlobalEditing.value) {
    showUnsavedModal.value = true;
    pendingNavFn.value = () => next();
  } else {
    next();
  }
});

async function handleSaveOnly() {
  if (editingBrokerId.value !== null && draftIsValid.value) commitBrokerDraft();
  isSaving.value = true;
  const result = await callSaveApi();
  isSaving.value = false;
  if (result.success) {
    isGlobalEditing.value = false;
    globalSnapshot.value = null;
    showUnsavedModal.value = false;
    if (pendingNavFn.value) { pendingNavFn.value(); pendingNavFn.value = null; }
  }
}

async function handleSaveAndApply() {
  if (editingBrokerId.value !== null && draftIsValid.value) commitBrokerDraft();
  isSaving.value = true;
  const result = await callSaveApi();
  isSaving.value = false;
  if (result.success) {
    isGlobalEditing.value = false;
    globalSnapshot.value = null;
    showUnsavedModal.value = false;
    const nav = pendingNavFn.value;
    pendingNavFn.value = null;
    restartService();
    if (nav) nav();
  }
}

function handleDiscardAndNavigate() {
  cancelGlobalEditing();
  showUnsavedModal.value = false;
  if (pendingNavFn.value) { pendingNavFn.value(); pendingNavFn.value = null; }
}

// ── Exposed API for parent tab container ──────────────────────────────────
function requestLeave(callback: () => void) {
  if (isGlobalEditing.value) {
    showUnsavedModal.value = true;
    pendingNavFn.value = callback;
  } else {
    callback();
  }
}

defineExpose({ requestLeave, isGlobalEditing });

onMounted(fetchStatus);
</script>

<template>
  <!-- ── Restart Required Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showRestartModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="showRestartModal = false"
      >
        <div class="bg-white dark:bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-stroke-subtle dark:border-stroke/20 p-6 max-w-md w-full mx-4">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">Service Restart Required</h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Broker settings have been saved. A service restart is required for the changes to take effect.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button
              @click="showRestartModal = false"
              class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
            >
              Not Now
            </button>
            <button
              @click="restartService"
              :disabled="isRestarting"
              class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isRestarting ? 'Restarting…' : 'Restart Service' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Unsaved Changes Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showUnsavedModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="bg-white dark:bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-stroke-subtle dark:border-stroke/20 p-6 max-w-md w-full mx-4">
          <div class="flex items-start gap-3 mb-4">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">Unsaved Changes</h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Broker settings have not been saved. What would you like to do?
              </p>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 justify-end">
            <button
              @click="handleDiscardAndNavigate"
              class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
            >
              Cancel (Discard Changes)
            </button>
            <button
              @click="handleSaveOnly"
              :disabled="isSaving"
              class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm disabled:opacity-50"
            >
              {{ isSaving ? 'Saving…' : 'Save Settings Only' }}
            </button>
            <button
              @click="handleSaveAndApply"
              :disabled="isSaving"
              class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isSaving ? 'Saving…' : 'Save & Apply (Restart)' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Main Content ───────────────────────────────────────────────────── -->
  <div class="space-y-12">
    <!-- Page heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">
          Observer Configuration
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Configure LetsMesh observer settings, MQTT brokers, and connection status
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="!isGlobalEditing"
          @click="fetchStatus"
          :disabled="loadingStatus"
          class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loadingStatus ? 'Refreshing…' : '↻ Refresh' }}
        </button>
        <template v-if="!isGlobalEditing">
          <button
            @click="startGlobalEditing"
            class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
          >
            Edit Settings
          </button>
        </template>
        <template v-else>
          <button
            @click="cancelGlobalEditing"
            :disabled="isSaving"
            class="px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            @click="saveGlobalSettings"
            :disabled="isSaving"
            class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isSaving ? 'Saving…' : 'Save Settings' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Global error message -->
    <div
      v-if="errorMsg"
      class="bg-red-100 dark:bg-red-500/20 border border-red-500 dark:border-red-500/50 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm"
    >
      {{ errorMsg }}
    </div>

    <!-- ── Observer Status ────────────────────────────────────────────── -->
    <div class="cfg-section">
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">Observer Status</h3>
        <p class="text-sm text-content-secondary dark:text-content-muted">Live LetsMesh broker connection state</p>
      </div>

      <div v-if="!status" class="text-sm text-content-secondary dark:text-content-muted">
        Status unavailable — service may not be running.
      </div>
      <div v-else class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-sm text-content-secondary dark:text-content-muted w-36">Handler</span>
          <span :class="['inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', status.handler_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400']">
            <span class="w-1.5 h-1.5 rounded-full" :class="status.handler_active ? 'bg-green-500' : 'bg-gray-400'"></span>
            {{ status.handler_active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <div v-if="status.brokers.length" class="space-y-2">
          <div v-for="broker in status.brokers" :key="broker.host" class="flex items-center gap-2">
            <span class="text-sm text-content-secondary dark:text-content-muted w-36 truncate" :title="broker.name">{{ broker.name }}</span>
            <span :class="['inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', broker.status.connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : broker.status.reconnecting ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400']">
              <span class="w-1.5 h-1.5 rounded-full" :class="broker.status.connected ? 'bg-green-500' : broker.status.reconnecting ? 'bg-amber-500' : 'bg-red-500'"></span>
              {{ broker.status.connected ? 'Connected' : broker.status.reconnecting ? 'Reconnecting…' : 'Disconnected' }}
            </span>
          </div>
        </div>
        <div v-else class="text-sm text-content-muted dark:text-content-muted/60 italic">No broker connections configured.</div>
      </div>
    </div>

    <!-- ── Observer Configuration ─────────────────────────────────────── -->
    <div class="glass-card rounded-lg border border-stroke-subtle dark:border-stroke/10 p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">Observer Configuration</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">IATA code, status interval, and owner details</p>
        </div>
        <div v-if="isGlobalEditing" class="flex-shrink-0 ml-4">
          <button
            v-if="!isEditingObserver"
            @click="isEditingObserver = true"
            class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
          >
            Edit
          </button>
          <button
            v-else
            @click="doneEditingObserver"
            class="px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
          >
            Done
          </button>
        </div>
      </div>

      <div>
        <!-- View mode -->
        <div v-if="!isEditingObserver" class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div class="flex flex-col py-1 border-b border-stroke-subtle dark:border-stroke/10">
            <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">IATA Code</span>
            <span class="text-content-primary dark:text-content-primary font-mono text-sm mt-0.5">{{ mqttConfig.iata_code || '—' }}</span>
          </div>
          <div class="flex flex-col py-1 border-b border-stroke-subtle dark:border-stroke/10">
            <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Status Interval</span>
            <span class="text-content-primary dark:text-content-primary text-sm mt-0.5">{{ mqttConfig.status_interval ?? 300 }}s</span>
          </div>
          <div class="flex flex-col py-1">
            <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Owner</span>
            <span class="text-content-primary dark:text-content-primary text-sm mt-0.5">{{ mqttConfig.owner || '—' }}</span>
          </div>
          <div class="flex flex-col py-1">
            <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Email</span>
            <span class="text-content-primary dark:text-content-primary text-sm mt-0.5">{{ mqttConfig.email || '—' }}</span>
          </div>
        </div>

        <!-- Edit mode -->
        <div v-else class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">
                IATA Code <span class="text-content-muted dark:text-content-muted/60 text-xs">(e.g. SFO, LHR)</span>
              </label>
              <input v-model="iataCodeInput" type="text" maxlength="10" placeholder="TEST"
                class="w-full px-3 py-1.5 bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary font-mono" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">
                Status Interval <span class="text-content-muted dark:text-content-muted/60 text-xs">(seconds, min 60)</span>
              </label>
              <input v-model.number="statusIntervalInput" type="number" min="60" max="3600"
                class="w-full px-3 py-1.5 bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary font-mono" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">Owner / Callsign</label>
              <input v-model="ownerInput" type="text" placeholder="Optional"
                class="w-full px-3 py-1.5 bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">Email</label>
              <input v-model="emailInput" type="email" placeholder="Optional"
                class="w-full px-3 py-1.5 bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Broker Settings ────────────────────────────────────────────── -->
    <div class="glass-card rounded-lg border border-stroke-subtle dark:border-stroke/10 p-6">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">Broker Settings</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">MQTT brokers for observer publishing</p>
        </div>
        <div v-if="isGlobalEditing" class="flex items-center gap-2 flex-shrink-0 ml-4">
          <!-- From Template dropdown -->
          <div class="relative">
            <button
              @click="showTemplateMenu = !showTemplateMenu"
              class="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors text-sm"
            >
              From Template
              <svg class="w-3 h-3 transition-transform" :class="showTemplateMenu ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Transition name="dropdown">
              <div
                v-if="showTemplateMenu"
                class="absolute right-0 top-full mt-1 z-20 w-64 rounded-lg shadow-lg border border-stroke-subtle dark:border-stroke/20 bg-white dark:bg-[var(--color-surface)] overflow-hidden"
              >
                <div class="px-3 py-2 border-b border-stroke-subtle dark:border-stroke/10">
                  <p class="text-xs font-medium text-content-secondary dark:text-content-muted uppercase tracking-wide">Known Networks</p>
                </div>
                <div class="py-1">
                  <div
                    v-for="tpl in BROKER_TEMPLATES"
                    :key="tpl.name"
                    class="flex items-center gap-2 px-3 py-2.5 hover:bg-background-mute dark:hover:bg-background/30 cursor-pointer group"
                    @click="addFromTemplate(tpl)"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-content-primary dark:text-content-primary group-hover:text-primary transition-colors">{{ tpl.name }}</p>
                      <p class="text-xs text-content-secondary dark:text-content-muted">{{ tpl.brokers.length }} broker{{ tpl.brokers.length !== 1 ? 's' : '' }}</p>
                    </div>
                    <a :href="tpl.website" target="_blank" rel="noopener noreferrer" title="Visit website"
                      class="flex-shrink-0 p-1 rounded hover:bg-primary/10 text-content-secondary dark:text-content-muted hover:text-primary transition-colors"
                      @click.stop>
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </Transition>
            <div v-if="showTemplateMenu" class="fixed inset-0 z-10" @click="showTemplateMenu = false" />
          </div>
          <button
            @click="addBroker"
            class="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors text-sm"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="!customBrokers.length"
        class="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed border-stroke-subtle dark:border-stroke/20 text-content-secondary dark:text-content-muted"
      >
        <svg class="w-7 h-7 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M5 12l4-4m-4 4l4 4" />
        </svg>
        <p class="text-sm">No brokers configured</p>
        <p v-if="isGlobalEditing" class="text-xs mt-0.5 opacity-70">Use Add or From Template above</p>
      </div>

      <!-- Broker list -->
      <div v-else class="space-y-2">
        <div
          v-for="broker in customBrokers"
          :key="broker._id"
          class="rounded-lg border border-stroke-subtle dark:border-stroke/10 overflow-hidden bg-background-mute dark:bg-white/5"
        >
          <!-- Summary row — always visible, Edit button changes to Done when expanded -->
          <div class="flex items-center gap-3 px-4 py-2.5">
            <div class="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <span :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', broker.enabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400']">
                <span class="w-1.5 h-1.5 rounded-full" :class="broker.enabled ? 'bg-green-500' : 'bg-red-500'"></span>
                {{ broker.enabled ? 'Enabled' : 'Disabled' }}
              </span>
              <span class="text-sm font-medium text-content-primary dark:text-content-primary">{{ broker.name || '(unnamed)' }}</span>
              <span class="text-xs font-mono text-content-secondary dark:text-content-muted">{{ broker.host || '—' }}:{{ broker.port }}</span>
            </div>
            <div v-if="isGlobalEditing" class="flex items-center gap-1.5 flex-shrink-0">
              <button
                @click="editingBrokerId === broker._id ? commitBrokerDraft() : openBrokerEdit(broker)"
                :disabled="editingBrokerId === broker._id && !draftIsValid"
                class="px-2.5 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded border border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {{ editingBrokerId === broker._id ? 'Done' : 'Edit' }}
              </button>
              <button
                @click="editingBrokerId === broker._id ? cancelBrokerEdit() : removeBrokerLocal(broker._id)"
                :title="editingBrokerId === broker._id ? 'Cancel edit' : 'Remove'"
                class="p-1.5 rounded hover:bg-red-500/10 dark:hover:bg-red-900/20 text-content-secondary dark:text-content-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <svg v-if="editingBrokerId !== broker._id" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Expanded edit form -->
          <div v-if="editingBrokerId === broker._id" class="border-t border-stroke-subtle dark:border-stroke/10 p-4 space-y-3 bg-background-mute/40 dark:bg-white/3">

            <!-- Name at top (full width) -->
            <div>
              <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">Name <span class="text-red-500">*</span></label>
              <input v-model="brokerDraft.name" type="text" placeholder="Broker Name"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary placeholder-content-muted dark:placeholder-content-muted/50 focus:outline-none focus:border-primary" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Enabled -->
              <div class="flex items-center gap-2">
                <input v-model="brokerDraft.enabled" type="checkbox" id="broker-enabled"
                  class="w-4 h-4 text-primary bg-background-mute border-stroke-subtle dark:border-stroke/10 focus:ring-primary/30" />
                <label for="broker-enabled" class="text-xs font-medium text-content-secondary dark:text-content-muted">Enabled</label>
              </div>
              <!-- Retain Status -->
              <div class="flex items-center gap-2">
                <input v-model="brokerDraft.retain_status" type="checkbox" id="broker-retain"
                  class="w-4 h-4 text-primary bg-background-mute border-stroke-subtle dark:border-stroke/10 focus:ring-primary/30" />
                <label for="broker-retain" class="text-xs font-medium text-content-secondary dark:text-content-muted">
                  Retain Status
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(MQTT retained messages)</span>
                </label>
              </div>
              <!-- Transport -->
              <div>
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">Transport <span class="text-red-500">*</span></label>
                <select v-model="brokerDraft.transport"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary">
                  <option value="websockets">Websockets</option>
                  <option value="tcp">TCP</option>
                </select>
              </div>
              <!-- Host -->
              <div>
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">Host <span class="text-red-500">*</span></label>
                <input v-model="brokerDraft.host" type="text" placeholder="mqtt.myserver.com" @blur="onHostChange"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary placeholder-content-muted dark:placeholder-content-muted/50 focus:outline-none focus:border-primary font-mono" />
              </div>
              <!-- Port -->
              <div>
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">
                  Port <span class="text-red-500">*</span>
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(443 WS, 1883 TCP)</span>
                </label>
                <input v-model.number="brokerDraft.port" type="number" min="0" max="65535"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary font-mono" />
              </div>
              <!-- TLS -->
              <div class="flex items-end gap-4">
                <div class="flex items-center gap-2">
                  <input v-model="brokerDraft.tls.enabled" type="checkbox" id="broker-tls"
                    class="w-4 h-4 text-primary bg-background-mute border-stroke-subtle dark:border-stroke/10 focus:ring-primary/30" />
                  <label for="broker-tls" class="text-xs font-medium text-content-secondary dark:text-content-muted">TLS</label>
                </div>
                <div class="flex items-center gap-2">
                  <input v-model="brokerDraft.tls.insecure" type="checkbox" id="broker-tls-insecure"
                    class="w-4 h-4 text-primary bg-background-mute border-stroke-subtle dark:border-stroke/10 focus:ring-primary/30" />
                  <label for="broker-tls-insecure" class="text-xs font-medium text-content-secondary dark:text-content-muted">Insecure</label>
                </div>
              </div>
              <!-- JWT Auth toggle -->
              <div class="flex items-center gap-2">
                <input v-model="brokerDraft.use_jwt_auth" type="checkbox" id="broker-jwt"
                  class="w-4 h-4 text-primary bg-background-mute border-stroke-subtle dark:border-stroke/10 focus:ring-primary/30" />
                <label for="broker-jwt" class="text-xs font-medium text-content-secondary dark:text-content-muted">Use JWT Auth</label>
              </div>
              <!-- JWT Audience or User/Pass -->
              <div v-if="brokerDraft.use_jwt_auth">
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">
                  Audience <span class="text-red-500">*</span>
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(usually same as host)</span>
                </label>
                <input v-model="brokerDraft.audience" type="text" placeholder="mqtt.myserver.com"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary font-mono" />
              </div>
              <div v-else class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" autocomplete="username" style="display:none" />
                <input type="password" autocomplete="current-password" style="display:none" />
                <div>
                  <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">
                    Username <span class="font-normal text-content-muted dark:text-content-muted/60">(blank = anonymous)</span>
                  </label>
                  <input autocomplete="username" v-model="brokerDraft.username" type="text" placeholder="username"
                    class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">Password</label>
                  <input autocomplete="new-password" v-model="brokerDraft.password" type="password"
                    readonly onfocus="this.removeAttribute('readonly');" onblur="this.setAttribute('readonly', true);"
                    class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary" />
                </div>
              </div>
              <!-- Format -->
              <div>
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">Format <span class="text-red-500">*</span></label>
                <select v-model="brokerDraft.format"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary">
                  <option value="letsmesh">LetsMesh MQTT format</option>
                  <option value="mqtt">pyMC MQTT format</option>
                </select>
              </div>
              <div v-if="brokerDraft.format === 'mqtt'">
                <label class="block text-xs font-medium text-content-secondary dark:text-content-muted mb-1">
                  MQTT Base Topic
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(e.g. meshcore/repeater)</span>
                </label>
                <input v-model="brokerDraft.base_topic" placeholder="meshcore/repeater"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary" />
              </div>
              <!-- Block Packet Types -->
              <div class="col-span-full">
                <label class="block text-sm font-medium text-content-primary dark:text-content-primary mb-2">
                  Block Packet Types
                  <span class="text-content-secondary dark:text-content-muted font-normal text-xs ml-1">(prevent publishing to broker)</span>
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="type in ALL_PACKET_TYPES"
                    :key="type"
                    @click="toggleDisallowed(brokerDraft, type)"
                    :class="['px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors', brokerDraft.disallowedInput?.includes(type) ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50 text-red-700 dark:text-red-400' : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 text-content-secondary dark:text-content-muted hover:border-primary/40']"
                  >
                    {{ type }}
                  </button>
                </div>
                <p class="mt-1.5 text-xs text-content-secondary dark:text-content-muted">
                  <span class="text-red-600 dark:text-red-400 font-medium">Red = blocked.</span> Leave all unselected to publish all packet types.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
