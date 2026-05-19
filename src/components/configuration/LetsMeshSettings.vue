<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSystemStore } from '@/stores/system';
import { authClient } from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import BrokerEditModal from '@/components/modals/BrokerEditModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const systemStore = useSystemStore();
const mqttConfig = computed(() => systemStore.stats?.config?.mqtt_brokers || {});

// Broker templates are sourced from the repeater's bundled YAML presets
// (`repeater/presets/*.yaml`), exposed via `GET /api/broker_presets`. This
// keeps the network catalogue versioned with the repeater itself — adding a
// new network is a one-file PR on the repeater side and every fresh UI fetch
// picks it up without a frontend rebuild.
interface BrokerTemplate {
  id: string;          // preset filename stem, stable identifier
  name: string;        // YAML `display_name`, or titlecased id fallback
  website?: string;    // optional, omitted when absent from the YAML
  brokers: Omit<CustomBroker, '_id'>[];
}
const BROKER_TEMPLATES = ref<BrokerTemplate[]>([]);
// Tri-state UI signal for the dropdown header so operators can tell the
// difference between "still loading", "no presets available", and "the
// repeater doesn't support this endpoint yet".
const templatesLoading = ref(false);
const templatesError = ref('');
// Per-template expansion state for the per-broker chooser. A template with
// multiple brokers can be expanded by clicking its chevron; the default row
// click still adds every broker in the template at once.
const expandedTemplateId = ref<string | null>(null);

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
  if (loadingStatus.value) return;
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

function handleModalDone(data: CustomBroker) {
  brokerDraft.value = data;
  commitBrokerDraft();
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
  expandedTemplateId.value = null;
  if (editingBrokerId.value !== null) cancelBrokerEdit();
  tpl.brokers.forEach(b => customBrokers.value.push(mkBroker(b)));
}

// Add just one broker from a template - used by the per-broker chooser when
// an operator wants e.g. only the primary Waev broker, not both A and B.
function addOneFromTemplate(broker: Omit<CustomBroker, '_id'>) {
  showTemplateMenu.value = false;
  expandedTemplateId.value = null;
  if (editingBrokerId.value !== null) cancelBrokerEdit();
  customBrokers.value.push(mkBroker(broker));
}

function toggleTemplateExpansion(id: string) {
  expandedTemplateId.value = expandedTemplateId.value === id ? null : id;
}

// Fetch bundled presets from the repeater. Designed to fail soft so an older
// repeater (no /api/broker_presets endpoint) still renders a working form;
// operators can fall back to the manual "Add" button.
async function fetchBrokerPresets() {
  templatesLoading.value = true;
  templatesError.value = '';
  try {
    const res = await authClient.get('/api/broker_presets');
    const data = res.data;
    if (data?.success && Array.isArray(data.data)) {
      BROKER_TEMPLATES.value = data.data as BrokerTemplate[];
    } else {
      BROKER_TEMPLATES.value = [];
      templatesError.value = data?.error || 'Failed to load broker presets';
    }
  } catch (err: unknown) {
    BROKER_TEMPLATES.value = [];
    const e = err as { response?: { status?: number } };
    // 404 on older repeaters: keep the dropdown quiet rather than alarming.
    // Surface real network/server errors so operators have something to act on.
    if (e?.response?.status === 404) {
      templatesError.value = '';
    } else {
      templatesError.value = 'Could not reach repeater for broker presets';
    }
  } finally {
    templatesLoading.value = false;
  }
}

const draftIsValid = computed(() => {
  const d = brokerDraft.value;
  return d.name.trim() !== '' && d.host.trim() !== '' &&
    d.port >= 1 && d.port <= 65535 &&
    (!d.use_jwt_auth || (d.audience?.trim() ?? '') !== '');
});


// ── Navigation guard ──────────────────────────────────────────────────────
async function saveForNavigation(): Promise<boolean> {
  if (editingBrokerId.value !== null && draftIsValid.value) commitBrokerDraft();
  isSaving.value = true;
  errorMsg.value = '';
  const result = await callSaveApi();
  isSaving.value = false;
  if (result.success) {
    isGlobalEditing.value = false;
    isEditingObserver.value = false;
    globalSnapshot.value = null;
    showRestartModal.value = true;
    return true;
  }
  errorMsg.value = result.error ?? 'Save failed';
  return false;
}

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isGlobalEditing,
  isSaving,
  cancelGlobalEditing,
  saveForNavigation,
);

defineExpose({ requestLeave, isEditing: isGlobalEditing });

let _statusTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  fetchStatus();
  fetchBrokerPresets();
  _statusTimer = setInterval(fetchStatus, 5000);
});

onUnmounted(() => {
  if (_statusTimer) clearInterval(_statusTimer);
});
</script>

<template>
  <!-- ── Restart Required Modal ──────────────────────────────────────────── -->
  <RestartModal
    v-model="showRestartModal"
    message="Broker settings have been saved. A service restart is required for the changes to take effect."
  />

  <!-- ── Broker Edit Modal ──────────────────────────────────────────────── -->
  <BrokerEditModal
    :show="editingBrokerId !== null"
    :broker="editingBrokerId !== null ? brokerDraft : null"
    :is-new="isNewBroker"
    @done="handleModalDone"
    @cancel="cancelBrokerEdit"
  />

  <!-- ── Unsaved Changes Modal ──────────────────────────────────────────── -->
  <UnsavedChangesModal :show="showUnsavedModal" :is-saving="isSaving" label="Broker settings" @discard="handleDiscard" @save="handleSave" @cancel="handleCancel" />

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
        <template v-if="!isGlobalEditing">
          <button
            @click="startGlobalEditing"
            class="btn-primary"
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
            class="btn-primary"
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

    <!-- ── Observer Setup ────────────────────────────────────────────── -->
    <div class="cfg-card p-6">
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">Observer Setup</h3>
        <p class="text-sm text-content-secondary dark:text-content-muted">IATA code, status interval, and owner details</p>
      </div>

      <div>
        <!-- View mode -->
        <div v-if="!isGlobalEditing" class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
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
        <div v-if="isGlobalEditing" class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">
                IATA Code <span class="text-content-muted dark:text-content-muted/60 text-xs">(e.g. SFO, LHR)</span>
              </label>
              <input v-model="iataCodeInput" type="text" maxlength="10" placeholder="TEST"
                class="cfg-input font-mono" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">
                Status Interval <span class="text-content-muted dark:text-content-muted/60 text-xs">(seconds, min 60)</span>
              </label>
              <input v-model.number="statusIntervalInput" type="number" min="60" max="3600"
                class="cfg-input font-mono" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">Owner Companion Pubkey</label>
              <input v-model="ownerInput" type="text" placeholder="Optional"
                class="cfg-input" />
            </div>
            <div>
              <label class="block text-xs sm:text-sm text-content-secondary dark:text-content-muted mb-1">Email</label>
              <input v-model="emailInput" type="email" placeholder="Optional"
                class="cfg-input" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Broker Settings ────────────────────────────────────────────── -->
    <div class="cfg-card p-6">
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
                class="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg shadow-lg border border-stroke-subtle dark:border-stroke/20 bg-white dark:bg-[var(--color-surface)] overflow-hidden"
              >
                <div class="px-3 py-2 border-b border-stroke-subtle dark:border-stroke/10">
                  <p class="text-xs font-medium text-content-secondary dark:text-content-muted uppercase tracking-wide">Known Networks</p>
                </div>
                <!-- Loading / empty / error states.  We keep all three in the
                     same dropdown surface so the affordance never disappears
                     unexpectedly when a request is in flight. -->
                <div v-if="templatesLoading" class="px-3 py-3 text-xs text-content-secondary dark:text-content-muted italic">
                  Loading presets…
                </div>
                <div v-else-if="templatesError" class="px-3 py-3 text-xs text-red-600 dark:text-red-400">
                  {{ templatesError }}
                </div>
                <div v-else-if="!BROKER_TEMPLATES.length" class="px-3 py-3 text-xs text-content-secondary dark:text-content-muted italic">
                  No bundled presets. Use "Add" to configure manually.
                </div>
                <div v-else class="py-1">
                  <div v-for="tpl in BROKER_TEMPLATES" :key="tpl.id" class="border-b border-stroke-subtle dark:border-stroke/10 last:border-b-0">
                    <!-- Template row.  Click anywhere on the row (outside the
                         chevron / website link) adds every broker in the
                         template, preserving the pre-existing default. -->
                    <div
                      class="flex items-center gap-2 px-3 py-2.5 hover:bg-background-mute dark:hover:bg-background/30 cursor-pointer group"
                      @click="addFromTemplate(tpl)"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-content-primary dark:text-content-primary group-hover:text-primary transition-colors">{{ tpl.name }}</p>
                        <p class="text-xs text-content-secondary dark:text-content-muted">{{ tpl.brokers.length }} broker{{ tpl.brokers.length !== 1 ? 's' : '' }}</p>
                      </div>
                      <!-- Chevron expands the per-broker chooser. Only
                           rendered for multi-broker templates because the
                           single-broker case has nothing to disambiguate. -->
                      <button
                        v-if="tpl.brokers.length > 1"
                        @click.stop="toggleTemplateExpansion(tpl.id)"
                        :title="expandedTemplateId === tpl.id ? 'Hide individual brokers' : 'Pick individual brokers'"
                        class="flex-shrink-0 p-1 rounded hover:bg-primary/10 text-content-secondary dark:text-content-muted hover:text-primary transition-colors"
                      >
                        <svg class="w-3.5 h-3.5 transition-transform" :class="expandedTemplateId === tpl.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <a v-if="tpl.website" :href="tpl.website" target="_blank" rel="noopener noreferrer" title="Visit website"
                        class="flex-shrink-0 p-1 rounded hover:bg-primary/10 text-content-secondary dark:text-content-muted hover:text-primary transition-colors"
                        @click.stop>
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                    <!-- Per-broker chooser.  Each entry's "+" button adds just
                         that broker, so an operator can opt out of one half of
                         a dual-broker preset without ejecting from the
                         template flow. -->
                    <div
                      v-if="expandedTemplateId === tpl.id && tpl.brokers.length > 1"
                      class="bg-background-mute/40 dark:bg-background/20 border-t border-stroke-subtle dark:border-stroke/10"
                    >
                      <div
                        v-for="(broker, idx) in tpl.brokers"
                        :key="`${tpl.id}-${idx}`"
                        class="flex items-center gap-2 pl-6 pr-3 py-2 hover:bg-background-mute dark:hover:bg-background/30 cursor-pointer"
                        @click="addOneFromTemplate(broker)"
                      >
                        <div class="min-w-0 flex-1">
                          <p class="text-xs font-medium text-content-primary dark:text-content-primary truncate">{{ broker.name }}</p>
                          <p class="text-[11px] font-mono text-content-secondary dark:text-content-muted truncate">{{ broker.host }}:{{ broker.port }}</p>
                        </div>
                        <span class="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold" title="Add only this broker">+</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
            <div v-if="showTemplateMenu" class="fixed inset-0 z-10" @click="showTemplateMenu = false" />
          </div>
          <button
            @click="addBroker"
            class="btn-primary inline-flex items-center gap-1.5"
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
          class="cfg-card overflow-hidden"
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
                @click="openBrokerEdit(broker)"
                class="px-2.5 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded border border-primary/50 transition-colors"
              >
                Edit
              </button>
              <button
                @click="removeBrokerLocal(broker._id)"
                title="Remove"
                class="p-1.5 rounded hover:bg-red-500/10 dark:hover:bg-red-900/20 text-content-secondary dark:text-content-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
