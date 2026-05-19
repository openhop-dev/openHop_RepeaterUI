<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import ApiService from '@/utils/api';
import { getPreference, setPreference } from '@/utils/preferences';
import { useSystemStore } from '@/stores/system';
import ConfirmDialog from '@/components/modals/ConfirmDialog.vue';
import MessageDialog from '@/components/modals/MessageDialog.vue';
import RestartModal from '@/components/modals/RestartModal.vue';
import LocationPicker from '@/components/modals/LocationPicker.vue';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'RoomServersView' });

const systemStore = useSystemStore();
const repeaterLat = computed(() => systemStore.stats?.config?.repeater?.latitude ?? 0);
const repeaterLng = computed(() => systemStore.stats?.config?.repeater?.longitude ?? 0);

const showLocationPickerCreate = ref(false);
const showLocationPickerEdit = ref(false);

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

// Dialog states
// Derived counts scoped to room servers only (total_registered includes companions)
const roomServerRegisteredCount = computed(
  () => identities.value?.configured?.filter((i: any) => i.registered).length ?? 0,
);
const roomServerConfiguredCount = computed(
  () => identities.value?.configured?.length ?? 0,
);
const roomServersSynced = computed(
  () => roomServerRegisteredCount.value === roomServerConfiguredCount.value,
);

const showConfirmDelete = ref(false);
const deleteTarget = ref<string>('');
const showMessageDialog = ref(false);
const messageDialogContent = ref({
  message: '',
  variant: 'success' as 'success' | 'error' | 'info',
});

// Room Messages Dialog states
const showMessagesDialog = ref(false);
const selectedRoom = ref<string>('');
const selectedRoomHash = ref<string>('');
const roomMessages = ref<any[]>([]);
const loadingMessages = ref(false);
const messagesError = ref<string | null>(null);
const newMessage = ref('');
const messagesLimit = ref(getPreference('roomServers_messagesLimit', 50));
const messagesOffset = ref(0); // Don't persist - pagination state is temporary
const hasMoreMessages = ref(true);

// Watch for changes and persist to localStorage
watch(messagesLimit, (value) => setPreference('roomServers_messagesLimit', value));
const aclClients = ref<any[]>([]);
const showSessionsDialog = ref(false);

// Form data
const newIdentity = ref({
  name: '',
  identity_key: '',
  type: 'room_server',
  settings: {
    node_name: '',
    latitude: 0,
    longitude: 0,
    admin_password: '',
    guest_password: '',
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

function roundCoords(settings: { latitude: number; longitude: number }) {
  settings.latitude = Math.round(settings.latitude * 1e6) / 1e6;
  settings.longitude = Math.round(settings.longitude * 1e6) / 1e6;
}

async function createIdentity() {
  roundCoords(newIdentity.value.settings);
  try {
    const response = await ApiService.createIdentity(newIdentity.value);

    if (response.success) {
      showCreateModal.value = false;
      await fetchIdentities();
      showRestartModal.value = true;
    } else {
      showMessage(`Failed to create identity: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error creating identity: ${err}`, 'error');
  }
}

async function updateIdentity() {
  const payload = { ...editingIdentity.value, settings: { ...editingIdentity.value.settings } };
  roundCoords(payload.settings);
  if (payload.name !== editOriginalName.value) {
    payload.new_name = payload.name;
    payload.name = editOriginalName.value;
  } else {
    delete payload.new_name;
  }
  try {
    const response = await ApiService.updateIdentity(payload);

    if (response.success) {
      showEditModal.value = false;
      editingIdentity.value = null;
      await fetchIdentities();
      showRestartModal.value = true;
    } else {
      showMessage(`Failed to update identity: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error updating identity: ${err}`, 'error');
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
    const response = await ApiService.deleteIdentity(name);

    if (response.success) {
      await fetchIdentities();

      // Show success message with hot reload status
      showMessage(response.message || 'Identity deleted successfully!', 'success');
    } else {
      showMessage(`Failed to delete identity: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error deleting identity: ${err}`, 'error');
  } finally {
    deleteTarget.value = '';
  }
}

function showMessage(message: string, variant: 'success' | 'error' | 'info') {
  messageDialogContent.value = { message, variant };
  showMessageDialog.value = true;
}

async function sendRoomServerAdvert(name: string) {
  try {
    const response = await ApiService.sendRoomServerAdvert(name);

    if (response.success) {
      showMessage(response.message || `Advert sent for '${name}'!`, 'success');
    } else {
      showMessage(`Failed to send advert: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error sending advert: ${err}`, 'error');
  }
}

function openEditModal(identity: unknown) {
  editingIdentity.value = JSON.parse(JSON.stringify(identity));
  editOriginalName.value = editingIdentity.value.name;
  delete editingIdentity.value.new_name;
  if (!editingIdentity.value.settings) {
    editingIdentity.value.settings = {};
  }
  if (!editingIdentity.value.settings.admin_password) editingIdentity.value.settings.admin_password = '';
  if (!editingIdentity.value.settings.guest_password) editingIdentity.value.settings.guest_password = '';
  if (editingIdentity.value.settings.latitude == null) editingIdentity.value.settings.latitude = 0;
  if (editingIdentity.value.settings.longitude == null) editingIdentity.value.settings.longitude = 0;
  showKeyInEdit.value = false;
  showEditModal.value = true;
}

function resetForm() {
  newIdentity.value = {
    name: '',
    identity_key: '',
    type: 'room_server',
    settings: {
      node_name: '',
      latitude: repeaterLat.value,
      longitude: repeaterLng.value,
      admin_password: '',
      guest_password: '',
    },
  };
  showKeyInCreate.value = false;
}

function openCreateModal() {
  resetForm();
  showCreateModal.value = true;
}

function handleLocationPickerSelect(location: { latitude: number; longitude: number }) {
  newIdentity.value.settings.latitude = location.latitude;
  newIdentity.value.settings.longitude = location.longitude;
}

function handleLocationPickerSelectEdit(location: { latitude: number; longitude: number }) {
  if (editingIdentity.value) {
    editingIdentity.value.settings.latitude = location.latitude;
    editingIdentity.value.settings.longitude = location.longitude;
  }
}

function closeModals() {
  showCreateModal.value = false;
  showEditModal.value = false;
  editingIdentity.value = null;
  showKeyInCreate.value = false;
  showKeyInEdit.value = false;
}

function toggleKeyVisibility(identityName: string) {
  if (visibleKeys.value.has(identityName)) {
    visibleKeys.value.delete(identityName);
  } else {
    visibleKeys.value.add(identityName);
  }
}

// Room Messages functions
async function openMessagesDialog(roomName: string) {
  selectedRoom.value = roomName;
  showMessagesDialog.value = true;
  messagesOffset.value = 0;
  hasMoreMessages.value = true;

  // Find room hash from identities
  const identity = identities.value?.configured.find((i: any) => i.name === roomName);
  selectedRoomHash.value = identity?.hash || '';

  // Fetch ACL clients for this room
  await fetchACLClients();

  await fetchRoomMessages(true);
}

async function fetchACLClients() {
  try {
    const response = await ApiService.getACLClients({
      identity_hash: selectedRoomHash.value,
      identity_name: selectedRoom.value,
    });

    if (response.success && response.data) {
      aclClients.value = (response.data as any).clients || [];
    }
  } catch (err) {
    console.error('Failed to fetch ACL clients:', err);
  }
}

async function fetchRoomMessages(reset = false) {
  if (reset) {
    messagesOffset.value = 0;
    roomMessages.value = [];
  }

  loadingMessages.value = true;
  messagesError.value = null;

  try {
    const response = await ApiService.getRoomMessages({
      room_name: selectedRoom.value,
      limit: messagesLimit.value,
      offset: messagesOffset.value,
    });

    if (response.success && response.data) {
      const newMessages = (response.data as any).messages || [];
      if (reset) {
        roomMessages.value = newMessages;
      } else {
        roomMessages.value = [...roomMessages.value, ...newMessages];
      }
      hasMoreMessages.value = newMessages.length === messagesLimit.value;
    } else {
      messagesError.value = response.error || 'Failed to load messages';
    }
  } catch (err) {
    messagesError.value = err instanceof Error ? err.message : 'Failed to load messages';
  } finally {
    loadingMessages.value = false;
  }
}

async function loadMoreMessages() {
  messagesOffset.value += messagesLimit.value;
  await fetchRoomMessages(false);
}

async function sendMessage() {
  if (!newMessage.value.trim()) return;

  try {
    const response = await ApiService.postRoomMessage({
      room_name: selectedRoom.value,
      message: newMessage.value,
      author_pubkey: 'server',
    });

    if (response.success) {
      newMessage.value = '';
      await fetchRoomMessages(true);
    } else {
      showMessage(`Failed to send message: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error sending message: ${err}`, 'error');
  }
}

async function deleteMessage(messageId: number) {
  if (!confirm('Are you sure you want to delete this message?')) return;

  try {
    const response = await ApiService.deleteRoomMessage({
      room_name: selectedRoom.value,
      message_id: messageId,
    });

    if (response.success) {
      await fetchRoomMessages(true);
      showMessage('Message deleted successfully', 'success');
    } else {
      showMessage(`Failed to delete message: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error deleting message: ${err}`, 'error');
  }
}

async function clearAllMessages() {
  if (
    !confirm(
      `Are you sure you want to clear ALL messages in room '${selectedRoom.value}'? This action cannot be undone.`,
    )
  )
    return;

  try {
    const response = await ApiService.clearRoomMessages(selectedRoom.value);

    if (response.success) {
      await fetchRoomMessages(true);
      showMessage('All messages cleared successfully', 'success');
    } else {
      showMessage(`Failed to clear messages: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error clearing messages: ${err}`, 'error');
  }
}

function closeMessagesDialog() {
  showMessagesDialog.value = false;
  selectedRoom.value = '';
  selectedRoomHash.value = '';
  roomMessages.value = [];
  newMessage.value = '';
  messagesError.value = null;
  aclClients.value = [];
}

function formatMessageTime(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

function getClientSession(authorPubkey: string) {
  if (!authorPubkey || !aclClients.value) return null;
  const session = aclClients.value.find(
    (client: any) =>
      client.public_key_full === authorPubkey || authorPubkey.startsWith(client.public_key),
  );
  return session;
}

async function removeClient(publicKey: string, identityHash?: string) {
  if (!confirm('Are you sure you want to remove this client from the ACL?')) {
    return;
  }

  try {
    const response = await ApiService.removeACLClient({
      public_key: publicKey,
      identity_hash: identityHash,
    });

    if (response.success) {
      // Refresh ACL clients list
      await fetchACLClients();
      showMessage('Client removed successfully', 'success');
    } else {
      showMessage(`Failed to remove client: ${response.error}`, 'error');
    }
  } catch (err) {
    showMessage(`Error removing client: ${err}`, 'error');
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header with Gradient -->
    <div
      class="relative overflow-hidden rounded-[20px] p-6 mb-6 glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10"
    >
      <!-- Animated Gradient Background -->
      <div
        class="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/10 to-accent-purple/20 opacity-50"
      ></div>
      <div
        class="absolute inset-0 bg-gradient-to-tl from-accent-green/10 via-transparent to-primary/10 animate-pulse"
      ></div>

      <div class="relative flex items-center justify-between">
        <div class="flex items-center gap-4">
          <!-- Icon with glow effect -->
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
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                ></path>
              </svg>
            </div>
          </div>
          <div>
            <h1 class="text-3xl font-bold text-content-primary dark:text-content-primary mb-1">
              Room Servers
            </h1>
            <p class="text-content-secondary dark:text-content-muted text-sm">
              Manage room server identities and messages
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
            Add Room Server
          </span>
        </button>
      </div>
    </div>

    <!-- Enhanced Stats Cards -->
    <div
      v-if="identities && identities.total_configured > 0"
      class="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      <!-- Total Configured -->
      <div class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-content-secondary dark:text-content-muted text-xs font-medium mb-2 uppercase tracking-wide">
              Total Configured
            </div>
            <div class="text-3xl font-bold text-content-primary dark:text-content-primary mb-1">
              {{ roomServerConfiguredCount }}
            </div>
          </div>
          <div class="bg-background-mute dark:bg-white/10 p-3 rounded-[12px]">
            <svg class="w-6 h-6 text-content-secondary dark:text-content-primary/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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
              {{ roomServerRegisteredCount }}
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
            <div class="text-3xl font-bold" :class="roomServersSynced ? 'text-accent-green' : 'text-accent-yellow'">
              {{ roomServersSynced ? 'Synced' : 'Out of Sync' }}
            </div>
          </div>
          <div :class="['p-3 rounded-[12px]', roomServersSynced ? 'bg-accent-green/20' : 'bg-accent-yellow/20']">
            <svg v-if="roomServersSynced" class="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <Spinner class="mx-auto mb-4" />
          <div class="text-content-secondary dark:text-content-primary/70">
            Loading room servers...
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="text-red-600 dark:text-red-400 mb-2">Failed to load room servers</div>
          <div class="text-content-secondary dark:text-content-muted text-sm mb-4">{{ error }}</div>
          <button
            @click="fetchIdentities"
            class="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>

      <!-- Room Servers List -->
      <div v-else-if="identities && identities.configured.length > 0" class="space-y-4">
        <div
          v-for="identity in identities.configured"
          :key="identity.name"
          class="glass-card backdrop-blur-xl rounded-[15px] p-5 border border-stroke-subtle dark:border-white/10"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-4">
                <!-- Status indicator with pulse -->
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

                <h3
                  class="text-xl font-bold text-content-primary dark:text-content-primary"
                >
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
                    identity.settings?.node_name || 'Not set'
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
                  <span v-else class="text-content-muted dark:text-content-muted ml-2 text-xs">
                    ••••••••••••••••
                  </span>
                  <button
                    @click="toggleKeyVisibility(identity.name)"
                    class="text-primary/70 hover:text-primary text-xs underline"
                  >
                    {{ visibleKeys.has(identity.name) ? 'Hide' : 'Show' }}
                  </button>
                </div>
                <div>
                  <span class="text-content-muted dark:text-content-muted">Location:</span>
                  <span class="text-content-primary dark:text-content-primary/90 ml-2">
                    {{ identity.settings?.latitude || 0 }}, {{ identity.settings?.longitude || 0 }}
                  </span>
                </div>
                <div v-if="identity.settings?.admin_password || identity.settings?.guest_password">
                  <span class="text-content-muted dark:text-content-muted">Passwords:</span>
                  <span class="text-content-primary dark:text-content-primary/90 ml-2">
                    <span v-if="identity.settings?.admin_password" class="text-accent-green"
                      >Admin</span
                    >
                    <span
                      v-if="identity.settings?.admin_password && identity.settings?.guest_password"
                      class="text-content-muted dark:text-content-muted"
                    >
                      /
                    </span>
                    <span v-if="identity.settings?.guest_password" class="text-primary">Guest</span>
                  </span>
                </div>
              </div>

              <div
                v-if="identity.address"
                class="text-xs text-content-muted dark:text-content-muted font-mono"
              >
                Address: {{ identity.address }}
              </div>
            </div>

            <div class="ml-4 flex flex-wrap gap-2">
              <button
                @click="openMessagesDialog(identity.name)"
                :disabled="!identity.registered"
                :class="[
                  'group px-4 py-2 rounded-[10px] text-xs font-medium transition-all duration-200 flex items-center gap-2',
                  identity.registered
                    ? 'bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30 hover:scale-105 hover:shadow-lg hover:shadow-secondary/20'
                    : 'bg-background-mute dark:bg-white/5 text-content-muted dark:text-content-muted/60 cursor-not-allowed border border-stroke-subtle dark:border-stroke/10',
                ]"
                :title="
                  identity.registered
                    ? 'Manage messages for this room'
                    : 'Room server must be active to manage messages'
                "
              >
                <svg
                  class="w-4 h-4 group-hover:rotate-12 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Messages
              </button>
              <button
                @click="sendRoomServerAdvert(identity.name)"
                :disabled="!identity.registered"
                :class="[
                  'group px-4 py-2 rounded-[10px] text-xs font-medium transition-all duration-200 flex items-center gap-2',
                  identity.registered
                    ? 'bg-accent-green/20 hover:bg-accent-green/30 text-accent-green border border-accent-green/30 hover:scale-105 hover:shadow-lg hover:shadow-accent-green/20'
                    : 'bg-background-mute dark:bg-white/5 text-content-muted dark:text-content-muted/60 cursor-not-allowed border border-stroke-subtle dark:border-stroke/10',
                ]"
                :title="
                  identity.registered
                    ? 'Send advert for this room server'
                    : 'Room server must be active to send advert'
                "
              >
                <svg
                  class="w-4 h-4 group-hover:scale-110 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Send Advert
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
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p class="text-lg mb-2">No room servers configured</p>
        <p class="text-sm mb-4">Add your first room server to get started</p>
        <button
          @click="openCreateModal"
          class="btn-primary"
        >
          + Add Room Server
        </button>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
    <div
      v-if="showCreateModal"
      class="modal-backdrop"
      @click.self="closeModals"
    >
      <div class="modal-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        <!-- Header -->
        <div class="flex items-center justify-between mb-7">
          <div>
            <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
              Add Room Server
            </h3>
            <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
              Configure a new room server identity
            </p>
          </div>
          <button
            @click="closeModals"
            class="text-content-secondary dark:text-white/60 hover:text-content-primary dark:hover:text-white transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="createIdentity" class="modal-form">

          <!-- Name -->
          <div>
            <label class="modal-field-label">Name <span class="text-red-500">*</span></label>
            <input
              v-model="newIdentity.name"
              type="text"
              placeholder="e.g., MainBBS"
              class="modal-input"
            />
          </div>

          <!-- Identity Key -->
          <div>
            <div class="modal-field-label-row">
              <span class="text-xs font-medium text-content-secondary dark:text-content-muted">Identity Key (Optional)</span>
              <button
                @click="showKeyInCreate = !showKeyInCreate"
                type="button"
                class="text-primary/70 hover:text-primary text-xs underline"
              >
                {{ showKeyInCreate ? 'Hide' : 'Show/Edit' }}
              </button>
            </div>
            <div v-if="showKeyInCreate">
              <input
                v-model="newIdentity.identity_key"
                type="text"
                placeholder="Leave empty to auto-generate"
                class="modal-input font-mono"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">
                Leave empty to automatically generate a secure key
              </p>
            </div>
            <div v-else class="text-content-secondary dark:text-content-muted text-sm">
              Will be auto-generated if not provided
            </div>
          </div>

          <!-- Node Name -->
          <div>
            <label class="modal-field-label">Node Name</label>
            <input
              v-model="newIdentity.settings.node_name"
              type="text"
              placeholder="Display name for the room server"
              class="modal-input"
            />
          </div>

          <!-- Location -->
          <div>
            <label class="modal-field-label">Location</label>
            <button
              type="button"
              @click="showLocationPickerCreate = true"
              class="flex items-center gap-1.5 px-2.5 py-1 mb-3 text-xs bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-secondary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors"
              title="Pick location on map"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pick on Map
            </button>
            <div class="grid grid-cols-2 gap-5">
              <div>
                <label class="modal-field-label">Latitude</label>
                <input
                  v-model.number="newIdentity.settings.latitude"
                  type="number"
                  step="0.000001"
                  class="modal-input"
                />
              </div>
              <div>
                <label class="modal-field-label">Longitude</label>
                <input
                  v-model.number="newIdentity.settings.longitude"
                  type="number"
                  step="0.000001"
                  class="modal-input"
                />
              </div>
            </div>
          </div>

          <!-- Passwords -->
          <div class="grid grid-cols-2 gap-5">
            <div>
              <label class="modal-field-label">Admin Password (Optional)</label>
              <input
                v-model="newIdentity.settings.admin_password"
                type="password"
                placeholder="Leave empty for no password"
                class="modal-input"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">Full access to room server</p>
            </div>
            <div>
              <label class="modal-field-label">Guest Password (Optional)</label>
              <input
                v-model="newIdentity.settings.guest_password"
                type="password"
                placeholder="Leave empty for no password"
                class="modal-input"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">Read-only access</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" @click="closeModals" class="modal-btn-cancel">Cancel</button>
            <button type="submit" class="modal-btn-primary">Create</button>
          </div>

        </form>
      </div>
    </div>
    </Transition>
    </Teleport>

    <!-- Location Picker for Create modal -->
    <LocationPicker
      :is-open="showLocationPickerCreate"
      :latitude="newIdentity.settings.latitude"
      :longitude="newIdentity.settings.longitude"
      @close="showLocationPickerCreate = false"
      @select="handleLocationPickerSelect"
    />

    <!-- Edit Modal -->
    <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
    <div
      v-if="showEditModal && editingIdentity"
      class="modal-backdrop"
      @click.self="closeModals"
    >
      <div class="modal-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        <!-- Header -->
        <div class="flex items-center justify-between mb-7">
          <div>
            <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
              Edit Room Server
            </h3>
            <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
              Update room server identity
            </p>
          </div>
          <button
            @click="closeModals"
            class="text-content-secondary dark:text-white/60 hover:text-content-primary dark:hover:text-white transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="updateIdentity" class="modal-form">

          <!-- Name -->
          <div>
            <label class="modal-field-label">Name <span class="text-red-500">*</span></label>
            <input
              v-model="editingIdentity.name"
              type="text"
              class="modal-input"
            />
          </div>

          <!-- Identity Key -->
          <div>
            <div class="modal-field-label-row">
              <span class="text-xs font-medium text-content-secondary dark:text-content-muted">Identity Key (Optional)</span>
              <button
                @click="showKeyInEdit = !showKeyInEdit"
                type="button"
                class="text-primary/70 hover:text-primary text-xs underline"
              >
                {{ showKeyInEdit ? 'Hide' : 'Show/Edit' }}
              </button>
            </div>
            <div v-if="showKeyInEdit">
              <input
                v-model="editingIdentity.identity_key"
                type="text"
                placeholder="Leave empty to keep current key"
                class="modal-input font-mono"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">
                Leave empty to keep the current identity key
              </p>
            </div>
            <div v-else class="text-content-secondary dark:text-content-muted text-sm">
              Click "Show/Edit" to change the identity key
            </div>
          </div>

          <!-- Node Name -->
          <div>
            <label class="modal-field-label">Node Name</label>
            <input
              v-model="editingIdentity.settings.node_name"
              type="text"
              class="modal-input"
            />
          </div>

          <!-- Location -->
          <div>
            <label class="modal-field-label">Location</label>
            <button
              type="button"
              @click="showLocationPickerEdit = true"
              class="flex items-center gap-1.5 px-2.5 py-1 mb-3 text-xs bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-secondary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 transition-colors"
              title="Pick location on map"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pick on Map
            </button>
            <div class="grid grid-cols-2 gap-5">
              <div>
                <label class="modal-field-label">Latitude</label>
                <input
                  v-model.number="editingIdentity.settings.latitude"
                  type="number"
                  step="0.000001"
                  class="modal-input"
                />
              </div>
              <div>
                <label class="modal-field-label">Longitude</label>
                <input
                  v-model.number="editingIdentity.settings.longitude"
                  type="number"
                  step="0.000001"
                  class="modal-input"
                />
              </div>
            </div>
          </div>

          <!-- Passwords -->
          <div class="grid grid-cols-2 gap-5">
            <div>
              <label class="modal-field-label">Admin Password (Optional)</label>
              <input
                v-model="editingIdentity.settings.admin_password"
                type="password"
                placeholder="Leave empty for no password"
                class="modal-input"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">Full access to room server</p>
            </div>
            <div>
              <label class="modal-field-label">Guest Password (Optional)</label>
              <input
                v-model="editingIdentity.settings.guest_password"
                type="password"
                placeholder="Leave empty for no password"
                class="modal-input"
              />
              <p class="text-content-secondary dark:text-content-muted text-xs mt-1">Read-only access</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" @click="closeModals" class="modal-btn-cancel">Cancel</button>
            <button type="submit" class="modal-btn-primary">Update</button>
          </div>

        </form>
      </div>
    </div>
    </Transition>
    </Teleport>

    <!-- Location Picker for Edit modal -->
    <LocationPicker
      :is-open="showLocationPickerEdit"
      :latitude="editingIdentity?.settings?.latitude"
      :longitude="editingIdentity?.settings?.longitude"
      @close="showLocationPickerEdit = false"
      @select="handleLocationPickerSelectEdit"
    />
  </div>

  <!-- Confirm Delete Dialog -->
  <ConfirmDialog
    :show="showConfirmDelete"
    title="Delete Room Server"
    :message="`Are you sure you want to delete '${deleteTarget}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    variant="danger"
    @close="showConfirmDelete = false"
    @confirm="confirmDeleteIdentity"
  />

  <!-- Message Dialog -->
  <MessageDialog
    :show="showMessageDialog"
    :message="messageDialogContent.message"
    :variant="messageDialogContent.variant"
    @close="showMessageDialog = false"
  />

  <!-- Restart Modal -->
  <RestartModal
    v-model="showRestartModal"
    message="Room server settings have been saved. A service restart is required for the changes to take effect."
  />


  <!-- Room Messages Dialog -->
  <Teleport to="body">
  <div
    v-if="showMessagesDialog"
    class="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-[300] p-4"
    @click.self="showMessagesDialog = false"
  >
    <div
      class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[20px] p-6 max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl"
    >
      <!-- Enhanced Header with Gradient -->
      <div
        class="relative overflow-hidden rounded-[15px] mb-6 p-5 bg-white/50 dark:bg-white/5 border border-stroke-subtle dark:border-white/10"
      >
        <!-- Gradient Background -->
        <div
          class="absolute inset-0 bg-gradient-to-r from-secondary/20 via-primary/20 to-accent-purple/20"
        ></div>
        <div
          class="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent"
        ></div>

        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-4">
            <!-- Message Icon with glow -->
            <div class="relative">
              <div class="absolute inset-0 bg-secondary/40 blur-xl rounded-full"></div>
              <div class="relative bg-secondary/20 p-3 rounded-[12px] border border-secondary/30">
                <svg
                  class="w-6 h-6 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  ></path>
                </svg>
              </div>
            </div>
            <div>
              <h2 class="text-2xl font-bold text-content-primary dark:text-content-primary mb-1">
                Room Messages
              </h2>
              <p
                class="text-content-secondary dark:text-content-muted text-sm flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  ></path>
                </svg>
                <span class="text-primary font-semibold">{{ selectedRoom }}</span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="showSessionsDialog = true"
              class="group px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-[10px] text-xs font-medium transition-all hover:scale-105 border border-primary/30 flex items-center gap-2"
              title="View active sessions"
            >
              <svg
                class="w-4 h-4 group-hover:scale-110 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span class="hidden sm:inline">Sessions</span>
              <span class="bg-primary/30 px-1.5 py-0.5 rounded-full text-[10px]">{{
                aclClients.length
              }}</span>
            </button>
            <button
              @click="closeMessagesDialog"
              class="p-2 text-content-secondary dark:text-content-primary/70 hover:text-content-primary dark:hover:text-content-primary hover:bg-stroke-subtle dark:hover:bg-white/10 rounded-[10px] transition-all"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Messages Container -->
      <div class="flex-1 overflow-y-auto mb-4 space-y-3">
        <!-- Loading State -->
        <div
          v-if="loadingMessages && roomMessages.length === 0"
          class="flex items-center justify-center py-12"
        >
          <div class="text-center">
            <Spinner class="mx-auto mb-4" />
            <div class="text-content-secondary dark:text-content-primary/70">
              Loading messages...
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="messagesError" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="text-red-600 dark:text-red-400 mb-2">Failed to load messages</div>
            <div class="text-content-secondary dark:text-content-muted text-sm mb-4">
              {{ messagesError }}
            </div>
            <button
              @click="fetchRoomMessages(true)"
              class="btn-primary"
            >
              Retry
            </button>
          </div>
        </div>

        <!-- Messages List -->
        <div v-else-if="roomMessages.length > 0" class="space-y-3">
          <div
            v-for="(message, index) in roomMessages"
            :key="message.id || index"
            class="group relative overflow-hidden glass-card backdrop-blur-xl rounded-[12px] p-4 border border-stroke-subtle dark:border-white/10 hover:border-secondary/30 transition-all duration-300 hover:shadow-lg hover:shadow-secondary/10"
          >
            <!-- Subtle gradient on hover -->
            <div
              class="absolute inset-0 bg-gradient-to-r from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>

            <div class="relative flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <!-- Message Header -->
                <div class="flex items-center gap-2 mb-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <!-- Author avatar placeholder -->
                    <div
                      class="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center"
                    >
                      <svg
                        class="w-3 h-3 text-content-secondary dark:text-content-primary/70"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        ></path>
                      </svg>
                    </div>
                    <span v-if="message.author_name" class="text-primary text-sm font-bold">
                      {{ message.author_name }}
                    </span>
                    <span
                      v-if="message.author_pubkey"
                      class="text-primary/80 text-xs font-mono bg-primary/10 px-2 py-1 rounded-md border border-primary/20"
                    >
                      {{ message.author_pubkey.substring(0, 8) }}...
                    </span>
                    <span v-else class="text-content-muted dark:text-content-muted text-xs">
                      Anonymous
                    </span>
                    <span class="text-content-muted dark:text-content-muted/60 text-xs">•</span>
                    <span
                      class="text-content-secondary dark:text-content-muted text-xs flex items-center gap-1"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        ></path>
                      </svg>
                      {{ formatMessageTime(message.timestamp) }}
                    </span>
                    <span
                      v-if="message.id"
                      class="text-content-muted dark:text-content-muted/50 text-[10px] font-mono bg-background-mute dark:bg-white/5 px-1.5 py-0.5 rounded"
                    >
                      #{{ message.id }}
                    </span>
                  </div>
                </div>

                <!-- Message Content -->
                <div
                  class="text-content-primary dark:text-content-primary/90 text-sm leading-relaxed break-words whitespace-pre-wrap bg-gray-50 dark:bg-white/5 p-3 rounded-[10px] border border-stroke-subtle dark:border-white/5"
                >
                  {{ message.message_text }}
                </div>
              </div>

              <!-- Delete Button -->
              <button
                @click="deleteMessage(message.id)"
                class="group/delete flex-shrink-0 p-2 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red rounded-[8px] transition-all hover:scale-110 border border-accent-red/20"
                title="Delete this message"
              >
                <svg
                  class="w-4 h-4 group-hover/delete:rotate-12 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Load More Button -->
          <div v-if="hasMoreMessages && !loadingMessages" class="text-center pt-4">
            <button
              @click="loadMoreMessages"
              class="group px-6 py-2.5 bg-gradient-to-r from-gray-100 dark:from-white/5 to-gray-200 dark:to-white/10 hover:from-gray-200 dark:hover:from-white/10 hover:to-gray-300 dark:hover:to-white/15 text-content-primary dark:text-content-primary rounded-[10px] transition-all hover:scale-105 text-sm font-medium border border-stroke-subtle dark:border-stroke/10 flex items-center gap-2 mx-auto"
            >
              <svg
                class="w-4 h-4 group-hover:translate-y-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
              Load More Messages
            </button>
          </div>
          <div v-else-if="loadingMessages" class="text-center pt-4">
            <div
              class="flex items-center justify-center gap-2 text-content-secondary dark:text-content-muted text-sm"
            >
              <Spinner size="sm" />
              Loading...
            </div>
          </div>
        </div>

        <!-- Enhanced Empty State -->
        <div v-else class="flex items-center justify-center h-full">
          <div class="text-center py-12">
            <div class="relative mb-6">
              <div class="absolute inset-0 bg-secondary/20 blur-3xl rounded-full"></div>
              <div
                class="relative bg-gradient-to-br from-secondary/20 to-primary/20 p-6 rounded-[20px] inline-block border border-stroke-subtle dark:border-white/10"
              >
                <svg
                  class="w-16 h-16 text-content-muted dark:text-content-muted/70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
            </div>
            <p class="text-xl font-bold text-content-primary dark:text-content-primary mb-2">
              No messages yet
            </p>
            <p class="text-sm text-content-secondary dark:text-content-muted">
              Be the first to start the conversation
            </p>
          </div>
        </div>
      </div>

      <!-- Enhanced Message Input Area -->
      <div
        class="relative overflow-hidden rounded-[15px] border-t border-stroke-subtle dark:border-white/20 pt-4 mt-4"
      >
        <!-- Subtle gradient background -->
        <div
          class="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none"
        ></div>

        <div class="relative space-y-3">
          <!-- Message Input -->
          <div class="flex gap-3">
            <div class="flex-1 relative">
              <textarea
                v-model="newMessage"
                @keydown.ctrl.enter="sendMessage"
                @keydown.meta.enter="sendMessage"
                placeholder="Type your message... (Ctrl+Enter to send)"
                rows="3"
                class="w-full bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-[12px] px-4 py-3 text-content-primary dark:text-content-primary text-sm placeholder-gray-500 dark:placeholder-white/30 focus:outline-none focus:border-primary/50 focus:bg-white dark:focus:bg-white/10 transition-all resize-none"
              ></textarea>
            </div>
            <button
              @click="sendMessage"
              :disabled="!newMessage.trim()"
              :class="[
                'group px-6 py-3 rounded-[12px] transition-all duration-200 flex items-center justify-center gap-2 font-medium',
                newMessage.trim()
                  ? 'bg-gradient-to-r from-primary/30 to-secondary/30 hover:from-primary/40 hover:to-secondary/40 text-content-primary dark:text-content-primary border border-primary/50 hover:scale-105 hover:shadow-lg hover:shadow-primary/20'
                  : 'bg-background-mute dark:bg-white/5 text-content-muted dark:text-content-muted/60 cursor-not-allowed border border-stroke-subtle dark:border-stroke/10',
              ]"
            >
              <svg
                class="w-5 h-5 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              <span class="hidden sm:inline">Send</span>
            </button>
          </div>
          <p
            class="text-content-secondary dark:text-content-muted/60 text-xs flex items-center gap-2"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            Press Ctrl+Enter to send message quickly
          </p>
        </div>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- Sessions Dialog -->
  <Teleport to="body">
  <div
    v-if="showSessionsDialog"
    class="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[350] p-4"
  >
    <div
      class="bg-white dark:bg-surface-elevated backdrop-blur-xl border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6 max-w-3xl w-full max-h-[80vh] flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between mb-4 pb-4 border-b border-stroke-subtle dark:border-white/10"
      >
        <div>
          <h2 class="text-xl font-bold text-content-primary dark:text-content-primary">
            Active Sessions
          </h2>
          <p class="text-content-secondary dark:text-content-primary/70 text-sm mt-1">
            Room: <span class="text-primary">{{ selectedRoom }}</span>
          </p>
        </div>
        <button
          @click="showSessionsDialog = false"
          class="text-content-secondary dark:text-content-primary/70 hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Sessions List -->
      <div class="flex-1 overflow-y-auto space-y-3">
        <div v-if="aclClients.length === 0" class="text-center py-12">
          <div class="text-content-secondary dark:text-content-muted">No active sessions found</div>
        </div>

        <div
          v-for="(client, index) in aclClients"
          :key="client.public_key_full || index"
          class="glass-card backdrop-blur-xl rounded-[10px] p-4 border border-stroke-subtle dark:border-white/10"
        >
          <div class="space-y-2">
            <!-- Identity Name & Permissions -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-content-primary dark:text-content-primary font-semibold">{{
                  client.identity_name || 'Unknown'
                }}</span>
                <span
                  :class="[
                    'px-2 py-0.5 text-xs font-medium rounded',
                    client.permissions === 'admin'
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'bg-secondary/20 text-secondary',
                  ]"
                >
                  {{ client.permissions }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-content-secondary dark:text-content-muted text-xs">{{
                  client.identity_type
                }}</span>
                <button
                  @click="removeClient(client.public_key_full, client.identity_hash)"
                  class="px-2 py-1 bg-accent-red/20 hover:bg-accent-red/30 text-accent-red rounded text-xs transition-colors"
                  title="Remove client from ACL"
                >
                  Remove
                </button>
              </div>
            </div>

            <!-- Public Keys -->
            <div class="space-y-1 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-content-secondary dark:text-content-muted">Short Key:</span>
                <code class="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">{{
                  client.public_key
                }}</code>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-content-secondary dark:text-content-muted">Full Key:</span>
                <code
                  class="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded text-[10px] break-all"
                  >{{ client.public_key_full }}</code
                >
              </div>
            </div>

            <!-- Address & Activity -->
            <div
              class="flex items-center justify-between text-xs text-content-secondary dark:text-content-muted"
            >
              <div class="flex items-center gap-4">
                <span v-if="client.address">📍 {{ client.address }}</span>
                <span v-if="client.last_login_success"
                  >Last Login:
                  {{ new Date(client.last_login_success * 1000).toLocaleString() }}</span
                >
              </div>
              <span v-if="client.last_activity"
                >Active: {{ Math.floor((Date.now() / 1000 - client.last_activity) / 60) }}m
                ago</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>
