<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import ApiService from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'SessionsView' });

const activeTab = ref('overview');
const initialLoadComplete = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

// ACL data
const aclInfo = ref<any>(null);
const aclClients = ref<any[]>([]);
const aclStats = ref<any>(null);
const selectedIdentity = ref<string | null>(null);

const tabs = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'clients', label: 'Authenticated Clients', icon: 'clients' },
  { id: 'identities', label: 'By Identity', icon: 'identities' },
];

onMounted(async () => {
  await fetchAllACLData();
  initialLoadComplete.value = true;
});

async function fetchAllACLData() {
  loading.value = true;
  error.value = null;

  try {
    // Fetch ACL info
    const infoResponse = await ApiService.getACLInfo();
    if (infoResponse.success) {
      aclInfo.value = infoResponse.data;
    }

    // Fetch ACL clients
    const clientsResponse = await ApiService.getACLClients();
    if (clientsResponse.success && clientsResponse.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aclClients.value = (clientsResponse.data as any).clients || [];
    }

    // Fetch ACL stats
    const statsResponse = await ApiService.getACLStats();
    if (statsResponse.success) {
      aclStats.value = statsResponse.data;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load ACL data';
    console.error('Error fetching ACL data:', err);
  } finally {
    loading.value = false;
  }
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
      await fetchAllACLData();
    } else {
      alert(`Failed to remove client: ${response.error}`);
    }
  } catch (err) {
    alert(`Error removing client: ${err}`);
  }
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'Never';
  return new Date(timestamp * 1000).toLocaleString();
}

function setActiveTab(tabId: string) {
  activeTab.value = tabId;
}

const filteredClients = computed(() => {
  if (!selectedIdentity.value) return aclClients.value;
  return aclClients.value.filter((c) => c.identity_name === selectedIdentity.value);
});

const identityList = computed(() => {
  if (!aclInfo.value) return [];
  return aclInfo.value.acls || [];
});

function isCompanion(identity: { type?: string }): boolean {
  return identity?.type === 'companion';
}

function identityTypeBadgeClass(type: string | undefined): string {
  if (type === 'repeater')
    return 'bg-primary/20 text-primary';
  if (type === 'companion')
    return 'bg-accent-purple/20 text-accent-purple';
  return 'bg-secondary/20 text-secondary';
}

function formatOptionalAcl(value: unknown): string {
  if (value === undefined || value === null) return 'N/A';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return String(value);
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-content-primary dark:text-content-primary">
        Sessions & Access Control
      </h1>
      <p class="text-content-secondary dark:text-content-muted mt-2">
        Manage authenticated clients and access control lists
      </p>
      <p class="text-content-muted dark:text-content-muted text-sm mt-1">
        Repeater, room servers, and companion identities; companions do not accept client logins.
      </p>
    </div>

    <!-- Stats Cards -->
    <div v-if="aclStats" class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary dark:text-content-muted text-sm mb-1">
          Total Identities
        </div>
        <div class="text-2xl font-bold text-content-primary dark:text-content-primary">
          {{ aclStats.total_identities }}
        </div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary dark:text-content-muted text-sm mb-1">
          Authenticated Clients
        </div>
        <div class="text-2xl font-bold text-primary">
          {{ aclStats.total_clients }}
        </div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary dark:text-content-muted text-sm mb-1">Admin Clients</div>
        <div class="text-2xl font-bold text-accent-green">
          {{ aclStats.admin_clients }}
        </div>
      </div>
      <div class="glass-card rounded-[15px] p-4">
        <div class="text-content-secondary dark:text-content-muted text-sm mb-1">Guest Clients</div>
        <div class="text-2xl font-bold text-secondary">
          {{ aclStats.guest_clients }}
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="glass-card rounded-[15px] p-6">
      <!-- Tab Navigation -->
      <div class="flex flex-wrap border-b border-stroke-subtle dark:border-stroke/10 mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="setActiveTab(tab.id)"
          :class="[
            'px-4 py-2 text-sm font-medium transition-colors duration-200 border-b-2 mr-6 mb-2',
            activeTab === tab.id
              ? 'text-primary border-primary'
              : 'text-content-secondary dark:text-content-muted border-transparent hover:text-content-primary dark:hover:text-content-primary hover:border-stroke-subtle dark:hover:border-stroke/30',
          ]"
        >
          <div class="flex items-center gap-2">
            <svg
              v-if="tab.icon === 'overview'"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <svg
              v-else-if="tab.icon === 'clients'"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <svg
              v-else-if="tab.icon === 'identities'"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
              />
            </svg>
            {{ tab.label }}
          </div>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="min-h-[400px]">
        <!-- Loading State -->
        <div v-if="loading && !initialLoadComplete" class="flex items-center justify-center py-12">
          <div class="text-center">
            <Spinner class="mx-auto mb-4" />
            <div class="text-content-secondary dark:text-content-muted">Loading ACL data...</div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="text-accent-red mb-2">Failed to load ACL data</div>
            <div class="text-content-secondary dark:text-content-muted text-sm mb-4">
              {{ error }}
            </div>
            <button
              @click="fetchAllACLData"
              class="btn-primary"
            >
              Retry
            </button>
          </div>
        </div>

        <!-- Overview Tab -->
        <div v-else-if="activeTab === 'overview'" class="space-y-4">
          <div
            v-if="identityList.length === 0"
            class="text-center py-12 text-content-secondary dark:text-content-muted"
          >
            No identities configured
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="identity in identityList"
              :key="identity.hash"
              class="glass-card rounded-[10px] p-4 border border-stroke-subtle dark:border-white/10 hover:border-primary/30 transition-colors"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <!-- Title row: name + type badge -->
                  <div class="flex items-center gap-2 flex-wrap mb-3">
                    <h3
                      class="text-lg font-semibold text-content-primary dark:text-content-primary truncate"
                    >
                      {{ identity.name }}
                    </h3>
                    <span
                      :class="[
                        'px-2 py-0.5 text-xs font-medium rounded shrink-0',
                        identityTypeBadgeClass(identity.type),
                      ]"
                    >
                      {{ identity.type }}
                    </span>
                  </div>

                  <!-- Companion: status row + no client sessions + optional last_seen -->
                  <template v-if="isCompanion(identity)">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span
                        v-if="identity.registered !== undefined"
                        class="flex items-center gap-1.5"
                      >
                        <span
                          :class="[
                            'w-2 h-2 rounded-full shrink-0',
                            identity.registered ? 'bg-accent-green' : 'bg-accent-red',
                          ]"
                          aria-hidden
                        />
                        <span class="text-content-secondary dark:text-content-muted"
                          >Registered: {{ identity.registered ? 'Active' : 'Inactive' }}</span
                        >
                      </span>
                      <span v-if="identity.active !== undefined" class="flex items-center gap-1.5">
                        <span
                          :class="[
                            'w-2 h-2 rounded-full shrink-0',
                            identity.active ? 'bg-accent-green' : 'bg-accent-red',
                          ]"
                          aria-hidden
                        />
                        <span class="text-content-secondary dark:text-content-muted"
                          >Bridge: {{ identity.active ? 'Connected' : 'Disconnected' }}</span
                        >
                      </span>
                      <span
                        v-if="identity.client_ip"
                        class="text-content-secondary dark:text-content-muted font-mono text-xs"
                      >
                        Client: {{ identity.client_ip }}
                      </span>
                      <span
                        v-if="identity.hash"
                        class="text-content-muted dark:text-content-muted font-mono text-xs"
                      >
                        Hash: {{ identity.hash }}
                      </span>
                    </div>
                    <p
                      v-if="identity.last_seen != null"
                      class="text-content-muted dark:text-content-muted text-xs mt-2 mb-0"
                    >
                      Last seen: {{ formatTimestamp(identity.last_seen) }}
                    </p>
                  </template>

                  <!-- Repeater / room: ACL fields (N/A when missing) -->
                  <template v-else>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Max Clients
                        </div>
                        <div class="text-content-primary dark:text-content-primary font-medium">
                          {{ formatOptionalAcl(identity.max_clients) }}
                        </div>
                      </div>
                      <div>
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Authenticated
                        </div>
                        <div class="text-primary font-medium">
                          {{ formatOptionalAcl(identity.authenticated_clients) }}
                        </div>
                      </div>
                      <div>
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Admin Password
                        </div>
                        <div
                          :class="
                            identity.has_admin_password
                              ? 'text-accent-green'
                              : 'text-accent-red'
                          "
                        >
                          {{
                            identity.has_admin_password != null
                              ? identity.has_admin_password
                                ? '✓ Set'
                                : '✗ Not Set'
                              : 'N/A'
                          }}
                        </div>
                      </div>
                      <div>
                        <div class="text-content-secondary dark:text-content-muted text-xs mb-1">
                          Guest Password
                        </div>
                        <div
                          :class="
                            identity.has_guest_password
                              ? 'text-accent-green'
                              : 'text-accent-red'
                          "
                        >
                          {{
                            identity.has_guest_password != null
                              ? identity.has_guest_password
                                ? '✓ Set'
                                : '✗ Not Set'
                              : 'N/A'
                          }}
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 flex items-center gap-2">
                      <span class="text-content-secondary dark:text-content-muted text-xs"
                        >Read-Only Access:</span
                      >
                      <span
                        :class="
                          identity.allow_read_only
                            ? 'text-accent-green'
                            : 'text-accent-red'
                        "
                      >
                        {{
                          identity.allow_read_only != null
                            ? identity.allow_read_only
                              ? 'Allowed'
                              : 'Disabled'
                            : 'N/A'
                        }}
                      </span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Clients Tab -->
        <div v-else-if="activeTab === 'clients'" class="space-y-4">
          <div
            v-if="aclClients.length === 0"
            class="text-center py-12 text-content-secondary dark:text-content-muted"
          >
            No authenticated clients
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-stroke-subtle dark:border-stroke/10">
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Client
                  </th>
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Address
                  </th>
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Identity
                  </th>
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Permissions
                  </th>
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Last Activity
                  </th>
                  <th
                    class="text-left text-content-secondary dark:text-content-muted text-sm font-medium pb-3"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="client in aclClients"
                  :key="client.public_key_full"
                  class="border-b border-stroke-subtle dark:border-white/5 hover:bg-gray-100/50 dark:hover:bg-white/5 transition-colors"
                >
                  <td class="py-3">
                    <div class="font-mono text-sm text-content-primary dark:text-content-primary">
                      {{ client.public_key }}
                    </div>
                  </td>
                  <td class="py-3">
                    <div class="font-mono text-xs text-content-secondary dark:text-content-muted">
                      {{ client.address }}
                    </div>
                  </td>
                  <td class="py-3">
                    <div class="text-sm text-content-primary dark:text-content-primary">
                      {{ client.identity_name }}
                    </div>
                    <div class="text-xs text-content-muted dark:text-content-muted">
                      {{ client.identity_hash }}
                    </div>
                  </td>
                  <td class="py-3">
                    <span
                      :class="[
                        'px-2 py-1 text-xs font-medium rounded',
                        client.permissions === 'admin'
                          ? 'bg-accent-green/20 text-accent-green'
                          : 'bg-secondary/20 text-secondary',
                      ]"
                    >
                      {{ client.permissions }}
                    </span>
                  </td>
                  <td class="py-3">
                    <div class="text-sm text-content-secondary dark:text-content-muted">
                      {{ formatTimestamp(client.last_activity) }}
                    </div>
                  </td>
                  <td class="py-3">
                    <button
                      @click="removeClient(client.public_key_full, client.identity_hash)"
                      class="btn-danger-xs"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- By Identity Tab -->
        <div v-else-if="activeTab === 'identities'" class="space-y-4">
          <!-- Identity Selector -->
          <div class="mb-4">
            <label class="block text-content-secondary dark:text-content-muted text-sm mb-2"
              >Filter by Identity</label
            >
            <select
              v-model="selectedIdentity"
              class="bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg px-4 py-2 text-content-primary dark:text-content-primary focus:outline-none focus:border-primary/50 transition-colors"
            >
              <option :value="null">All Identities</option>
              <option v-for="identity in identityList" :key="identity.name" :value="identity.name">
                {{ identity.name }} ({{ identity.authenticated_clients ?? 0 }} clients)
              </option>
            </select>
          </div>

          <!-- Filtered Clients -->
          <div
            v-if="filteredClients.length === 0"
            class="text-center py-12 text-content-secondary dark:text-content-muted"
          >
            No clients for selected identity
          </div>
          <div v-else class="grid grid-cols-1 gap-4">
            <div
              v-for="client in filteredClients"
              :key="client.public_key_full"
              class="glass-card rounded-[10px] p-4 border border-stroke-subtle dark:border-white/10"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-3">
                    <span
                      :class="[
                        'px-2 py-1 text-xs font-medium rounded',
                        client.permissions === 'admin'
                          ? 'bg-accent-green/20 text-accent-green'
                          : 'bg-secondary/20 text-secondary',
                      ]"
                    >
                      {{ client.permissions }}
                    </span>
                    <span
                      class="text-content-primary dark:text-content-primary font-mono text-sm"
                      >{{ client.public_key }}</span
                    >
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span class="text-content-secondary dark:text-content-muted">Address:</span>
                      <span
                        class="text-content-primary dark:text-content-primary/90 font-mono ml-2"
                        >{{ client.address }}</span
                      >
                    </div>
                    <div>
                      <span class="text-content-secondary dark:text-content-muted">Identity:</span>
                      <span class="text-content-primary dark:text-content-primary/90 ml-2"
                        >{{ client.identity_name }} ({{ client.identity_hash }})</span
                      >
                    </div>
                    <div>
                      <span class="text-content-secondary dark:text-content-muted"
                        >Last Activity:</span
                      >
                      <span class="text-content-primary dark:text-content-primary/90 ml-2">{{
                        formatTimestamp(client.last_activity)
                      }}</span>
                    </div>
                    <div>
                      <span class="text-content-secondary dark:text-content-muted"
                        >Last Login:</span
                      >
                      <span class="text-content-primary dark:text-content-primary/90 ml-2">{{
                        formatTimestamp(client.last_login_success)
                      }}</span>
                    </div>
                  </div>
                </div>
                <button
                  @click="removeClient(client.public_key_full, client.identity_hash)"
                  class="ml-4 btn-danger-xs"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Refresh Button -->
    <div class="flex justify-end">
      <button
        @click="fetchAllACLData"
        :disabled="loading"
        class="btn-primary"
      >
        {{ loading ? 'Refreshing...' : 'Refresh Data' }}
      </button>
    </div>
  </div>
</template>
