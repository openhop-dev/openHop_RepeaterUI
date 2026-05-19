<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import ApiService from '@/utils/api';
import ConfirmDialog from '@/components/modals/ConfirmDialog.vue';
import MessageDialog from '@/components/modals/MessageDialog.vue';
import ImportRepeaterContactsModal from '@/components/modals/ImportRepeaterContactsModal.vue';
import RestartModal from '@/components/modals/RestartModal.vue';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'CompanionsView' });

const loading = ref(false);
const error = ref<string | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identities = ref<any>(null);
const showCreateModal = ref(false);
const showEditModal = ref(false);
const showRestartModal = ref(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const editingIdentity = ref<any>(null);
const editOriginalName = ref('');
const showKeyInCreate = ref(false);
const showKeyInEdit = ref(false);
const visibleKeys = ref<Set<string>>(new Set());

const showConfirmDelete = ref(false);
const deleteTarget = ref<string>('');
const showImportModal = ref(false);
const importModalCompanionName = ref('');
const showMessageDialog = ref(false);
const messageDialogContent = ref({
  message: '',
  variant: 'success' as 'success' | 'error' | 'info',
});

const newIdentity = ref({
  name: '',
  identity_key: '',
  type: 'companion' as const,
  settings: {
    node_name: '',
    tcp_port: 5000,
    bind_address: '0.0.0.0',
  },
});

onMounted(async () => {
  await fetchIdentities();
});

async function fetchIdentities() {
  loading.value = true;
  error.value = null;

  try {
    const response = await ApiService.getIdentities();

    if (response.success) {
      identities.value = response.data;
    } else {
      error.value = response.error || 'Failed to load identities';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load identities';
  } finally {
    loading.value = false;
  }
}

async function createIdentity() {
  try {
    const response = await ApiService.createIdentity({
      ...newIdentity.value,
      settings: {
        node_name: newIdentity.value.settings.node_name || newIdentity.value.name,
        tcp_port: newIdentity.value.settings.tcp_port ?? 5000,
        bind_address: newIdentity.value.settings.bind_address || '0.0.0.0',
      },
    });

    if (response.success) {
      showCreateModal.value = false;
      resetForm();
      await fetchIdentities();
      showMessage(response.message || 'Companion created successfully!', 'success');
    } else {
      showMessage(`Failed to create companion: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error creating companion: ${err}`, 'error');
  }
}

async function updateIdentity() {
  const payload: Record<string, unknown> = {
    name: editOriginalName.value,
    identity_key: editingIdentity.value.identity_key,
    type: 'companion',
    settings: {
      node_name: editingIdentity.value.settings?.node_name,
      tcp_port: editingIdentity.value.settings?.tcp_port,
      bind_address: editingIdentity.value.settings?.bind_address,
    },
  };
  if (editingIdentity.value.name !== editOriginalName.value) {
    payload.new_name = editingIdentity.value.name;
  }
  try {
    const response = await ApiService.updateIdentity(payload);

    if (response.success) {
      showEditModal.value = false;
      editingIdentity.value = null;
      await fetchIdentities();
      showRestartModal.value = true;
    } else {
      showMessage(`Failed to update companion: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error updating companion: ${err}`, 'error');
  }
}

function promptDeleteIdentity(name: string) {
  deleteTarget.value = name;
  showConfirmDelete.value = true;
}

async function confirmDeleteIdentity() {
  const name = deleteTarget.value;
  showConfirmDelete.value = false;

  try {
    const response = await ApiService.deleteIdentity(name, 'companion');

    if (response.success) {
      await fetchIdentities();
      showMessage(response.message || 'Companion deleted successfully!', 'success');
    } else {
      showMessage(`Failed to delete companion: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error deleting companion: ${err}`, 'error');
  } finally {
    deleteTarget.value = '';
  }
}

function showMessage(message: string, variant: 'success' | 'error' | 'info') {
  messageDialogContent.value = { message, variant };
  showMessageDialog.value = true;
}

function openEditModal(identity: unknown) {
  editingIdentity.value = JSON.parse(JSON.stringify(identity));
  editOriginalName.value = editingIdentity.value.name;
  delete editingIdentity.value.new_name;
  if (!editingIdentity.value.settings) {
    editingIdentity.value.settings = { node_name: '', tcp_port: 5000, bind_address: '0.0.0.0' };
  }
  showKeyInEdit.value = false;
  showEditModal.value = true;
}

function resetForm() {
  newIdentity.value = {
    name: '',
    identity_key: '',
    type: 'companion',
    settings: {
      node_name: '',
      tcp_port: 5000,
      bind_address: '0.0.0.0',
    },
  };
  showKeyInCreate.value = false;
}

function closeModals() {
  showCreateModal.value = false;
  showEditModal.value = false;
  editingIdentity.value = null;
  showKeyInCreate.value = false;
  showKeyInEdit.value = false;
  resetForm();
}

function toggleKeyVisibility(identityName: string) {
  if (visibleKeys.value.has(identityName)) {
    visibleKeys.value.delete(identityName);
  } else {
    visibleKeys.value.add(identityName);
  }
}

const configuredCompanions = () => identities.value?.configured_companions ?? [];
const totalCompanions = () => identities.value?.total_configured_companions ?? 0;

const companionConfiguredCount = computed(() => identities.value?.configured_companions?.length ?? 0);
const companionRegisteredCount = computed(
  () => identities.value?.configured_companions?.filter((c: any) => c.registered).length ?? 0,
);
const companionsSynced = computed(
  () => companionRegisteredCount.value === companionConfiguredCount.value,
);

const DEFAULT_COMPANION_PORT = 5050;
const MIN_PORT = 1;
const MAX_PORT = 65535;

function nextSuggestedPort(): number {
  const companions = configuredCompanions();
  if (companions.length === 0) return DEFAULT_COMPANION_PORT;
  const ports = companions.map(
    (c: { settings?: { tcp_port?: number } }) => c.settings?.tcp_port ?? 5000,
  );
  const next = Math.max(...ports) + 1;
  return Math.min(MAX_PORT, Math.max(MIN_PORT, next));
}

function openCreateModal() {
  resetForm();
  newIdentity.value.settings.tcp_port = nextSuggestedPort();
  showCreateModal.value = true;
}

function openImportModal(companionName: string) {
  importModalCompanionName.value = companionName;
  showImportModal.value = true;
}

function closeImportModal() {
  showImportModal.value = false;
  importModalCompanionName.value = '';
}

function onImportDone(imported: number) {
  showMessage(`Imported ${imported} contact${imported === 1 ? '' : 's'}.`, 'success');
  closeImportModal();
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div
      class="relative overflow-hidden rounded-[20px] p-6 mb-6 glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/10 to-accent-purple/20 opacity-50"
      ></div>
      <div
        class="absolute inset-0 bg-gradient-to-tl from-accent-green/10 via-transparent to-primary/10 animate-pulse"
      ></div>

      <div class="relative flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="relative">
            <div class="absolute inset-0 bg-primary/30 blur-xl rounded-full"></div>
            <div class="relative bg-primary/20 p-4 rounded-[15px] border border-primary/30">
              <svg
                class="w-8 h-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </div>
          <div>
            <h1 class="text-3xl font-bold text-content-primary dark:text-content-primary mb-1">
              Companions
            </h1>
            <p class="text-content-secondary dark:text-content-muted text-sm">
              Manage companion identities (TCP frame server)
            </p>
          </div>
        </div>
        <button
          @click="openCreateModal"
          class="group relative px-6 py-3 bg-gradient-to-r from-primary/30 to-secondary/30 hover:from-primary/40 hover:to-secondary/40 text-content-primary dark:text-content-primary rounded-[12px] border border-primary/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
        >
          <span class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              ></path>
            </svg>
            Add Companion
          </span>
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div v-if="identities && companionConfiguredCount > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Total Configured -->
      <div class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-content-secondary dark:text-content-muted text-xs font-medium mb-2 uppercase tracking-wide">
              Total Configured
            </div>
            <div class="text-3xl font-bold text-content-primary dark:text-content-primary mb-1">
              {{ companionConfiguredCount }}
            </div>
          </div>
          <div class="bg-background-mute dark:bg-white/10 p-3 rounded-[12px]">
            <svg class="w-6 h-6 text-content-secondary dark:text-content-primary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Currently Registered -->
      <div class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-content-secondary dark:text-content-muted text-xs font-medium mb-2 uppercase tracking-wide">
              Currently Registered
            </div>
            <div class="text-3xl font-bold text-primary mb-1">
              {{ companionRegisteredCount }}
            </div>
          </div>
          <div class="bg-primary/20 p-3 rounded-[12px]">
            <svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Status -->
      <div class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-content-secondary dark:text-content-muted text-xs font-medium mb-2 uppercase tracking-wide">
              Status
            </div>
            <div class="text-3xl font-bold" :class="companionsSynced ? 'text-accent-green' : 'text-accent-yellow'">
              {{ companionsSynced ? 'Synced' : 'Out of Sync' }}
            </div>
          </div>
          <div :class="['p-3 rounded-[12px]', companionsSynced ? 'bg-accent-green/20' : 'bg-accent-yellow/20']">
            <svg v-if="companionsSynced" class="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else class="w-6 h-6 text-accent-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div
      class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6"
    >
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <Spinner class="mx-auto mb-4" />
          <div class="text-content-secondary dark:text-content-primary/70">
            Loading companions...
          </div>
        </div>
      </div>

      <div v-else-if="error" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="text-red-600 dark:text-red-400 mb-2">Failed to load companions</div>
          <div class="text-content-secondary dark:text-content-muted text-sm mb-4">{{ error }}</div>
          <button
            @click="fetchIdentities"
            class="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>

      <!-- Companions List -->
      <div v-else-if="identities && configuredCompanions().length > 0" class="space-y-4">
        <div
          v-for="identity in configuredCompanions()"
          :key="identity.name"
          class="glass-card backdrop-blur-xl rounded-[15px] p-5 border border-stroke-subtle dark:border-white/10"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-4">
                <div class="relative">
                  <div
                    v-if="identity.registered"
                    class="absolute inset-0 bg-accent-green/50 rounded-full animate-ping"
                  ></div>
                  <div
                    :class="[
                      'relative w-3 h-3 rounded-full',
                      identity.registered ? 'bg-accent-green' : 'bg-accent-red',
                    ]"
                  ></div>
                </div>
                <h3 class="text-xl font-bold text-content-primary dark:text-content-primary">
                  {{ identity.name }}
                </h3>
                <span
                  :class="[
                    'px-3 py-1 text-xs font-semibold rounded-full',
                    identity.registered
                      ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                      : 'bg-accent-red/20 text-accent-red border border-accent-red/30',
                  ]"
                >
                  {{ identity.registered ? '● Active' : '○ Inactive' }}
                </span>
                <span
                  v-if="identity.hash"
                  class="text-content-muted dark:text-content-muted text-sm"
                  >{{ identity.hash }}</span
                >
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <span class="text-content-muted dark:text-content-muted">Node Name:</span>
                  <span class="text-content-primary dark:text-content-primary/90 ml-2">{{
                    identity.settings?.node_name || identity.name
                  }}</span>
                </div>
                <div>
                  <span class="text-content-muted dark:text-content-muted">TCP Port:</span>
                  <span class="text-content-primary dark:text-content-primary/90 ml-2">{{
                    identity.settings?.tcp_port ?? 5000
                  }}</span>
                </div>
                <div>
                  <span class="text-content-muted dark:text-content-muted">Bind Address:</span>
                  <span class="text-content-primary dark:text-content-primary/90 ml-2">{{
                    identity.settings?.bind_address || '0.0.0.0'
                  }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-content-muted dark:text-content-muted">Identity Key:</span>
                  <span
                    v-if="visibleKeys.has(identity.name)"
                    class="text-content-primary dark:text-content-primary/90 font-mono ml-2 text-xs"
                  >
                    {{ identity.identity_key }}
                  </span>
                  <span v-else class="text-content-muted dark:text-content-muted ml-2 text-xs"
                    >••••••••••••••••</span
                  >
                  <button
                    @click="toggleKeyVisibility(identity.name)"
                    class="text-primary/70 hover:text-primary text-xs underline"
                  >
                    {{ visibleKeys.has(identity.name) ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </div>

              <div class="text-xs text-content-muted dark:text-content-muted">
                <span class="text-content-muted dark:text-content-muted">Public Key:</span>
                <span
                  v-if="identity.public_key"
                  class="ml-2 font-mono text-content-primary dark:text-content-primary/90 break-all"
                  >{{ identity.public_key }}</span
                >
                <span v-else class="ml-2 text-content-muted dark:text-content-muted">—</span>
              </div>
            </div>

            <div class="ml-4 flex flex-wrap gap-2">
              <button
                @click="openImportModal(identity.name)"
                class="btn-primary-xs"
              >
                Import contacts
              </button>
              <button
                @click="openEditModal(identity)"
                class="btn-primary-xs"
              >
                Edit
              </button>
              <button
                @click="promptDeleteIdentity(identity.name)"
                class="btn-danger-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12 text-content-secondary dark:text-content-muted">
        <svg
          class="w-16 h-16 mx-auto mb-4 text-content-muted dark:text-content-muted/60"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <p class="text-lg mb-2">No companions configured</p>
        <p class="text-sm mb-4">
          Add a companion to run a TCP frame server for firmware or other clients
        </p>
        <button
          @click="openCreateModal"
          class="btn-primary"
        >
          + Add Companion
        </button>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black/50 backdrop-blur-lg flex items-center justify-center z-[300] p-4"
      @click.self="showCreateModal = false"
    >
      <div
        class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 class="text-xl font-bold text-content-primary dark:text-content-primary mb-4">
          Add Companion
        </h2>

        <div class="space-y-4">
          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
              >Name *</label
            >
            <input
              v-model="newIdentity.name"
              type="text"
              placeholder="e.g., TestCompanion"
              class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2">
              Identity Key (Optional)
              <button
                @click="showKeyInCreate = !showKeyInCreate"
                type="button"
                class="ml-2 text-primary/70 hover:text-primary text-xs underline"
              >
                {{ showKeyInCreate ? 'Hide' : 'Show/Edit' }}
              </button>
            </label>
            <div v-if="showKeyInCreate">
              <input
                v-model="newIdentity.identity_key"
                type="text"
                placeholder="Leave empty to auto-generate (32 bytes hex)"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary font-mono text-sm placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">
                32 or 64 bytes hex. Leave empty to auto-generate.
              </p>
            </div>
            <div v-else class="text-content-secondary dark:text-content-muted text-sm">
              Will be auto-generated if not provided
            </div>
          </div>

          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
              >Node Name</label
            >
            <input
              v-model="newIdentity.settings.node_name"
              type="text"
              placeholder="Display name (defaults to Name)"
              class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
                >TCP Port</label
              >
              <input
                v-model.number="newIdentity.settings.tcp_port"
                type="number"
                min="1"
                max="65535"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div>
              <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
                >Bind Address</label
              >
              <input
                v-model="newIdentity.settings.bind_address"
                type="text"
                placeholder="0.0.0.0"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="closeModals"
            class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            @click="createIdentity"
            class="btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Edit Modal -->
    <Teleport to="body">
    <div
      v-if="showEditModal && editingIdentity"
      class="fixed inset-0 bg-black/50 backdrop-blur-lg flex items-center justify-center z-[300] p-4"
      @click.self="closeModals"
    >
      <div
        class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 class="text-xl font-bold text-content-primary dark:text-content-primary mb-4">
          Edit Companion
        </h2>

        <div class="space-y-4">
          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
              >Name *</label
            >
            <input
              v-model="editingIdentity.name"
              type="text"
              class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2">
              Identity Key (Optional)
              <button
                @click="showKeyInEdit = !showKeyInEdit"
                type="button"
                class="ml-2 text-primary/70 hover:text-primary text-xs underline"
              >
                {{ showKeyInEdit ? 'Hide' : 'Show/Edit' }}
              </button>
            </label>
            <div v-if="showKeyInEdit">
              <input
                v-model="editingIdentity.identity_key"
                type="text"
                placeholder="Leave empty to keep current key"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary font-mono text-sm placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
              >Node Name</label
            >
            <input
              v-model="editingIdentity.settings.node_name"
              type="text"
              class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
                >TCP Port</label
              >
              <input
                v-model.number="editingIdentity.settings.tcp_port"
                type="number"
                min="1"
                max="65535"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div>
              <label class="block text-content-secondary dark:text-content-primary/70 text-sm mb-2"
                >Bind Address</label
              >
              <input
                v-model="editingIdentity.settings.bind_address"
                type="text"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="closeModals"
            class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            @click="updateIdentity"
            class="btn-primary"
          >
            Update
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>

  <ImportRepeaterContactsModal
    :is-open="showImportModal"
    :companion-name="importModalCompanionName"
    @close="closeImportModal"
    @imported="onImportDone"
  />

  <ConfirmDialog
    :show="showConfirmDelete"
    title="Delete Companion"
    :message="`Are you sure you want to delete '${deleteTarget}'? Restart required to fully remove.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    variant="danger"
    @close="showConfirmDelete = false"
    @confirm="confirmDeleteIdentity"
  />

  <MessageDialog
    :show="showMessageDialog"
    :message="messageDialogContent.message"
    :variant="messageDialogContent.variant"
    @close="showMessageDialog = false"
  />

  <RestartModal
    v-model="showRestartModal"
    message="Companion settings have been saved. A service restart is required for the changes to take effect."
  />

</template>
