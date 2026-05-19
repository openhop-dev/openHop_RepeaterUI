<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import apiClient, { API_SERVER_URL } from '@/utils/api';
import ConfirmDialog from '@/components/modals/ConfirmDialog.vue';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'APITokens' });

interface APIToken {
  id: number;
  name: string;
  created_at: number;
  last_used: number | null;
}

interface TokenListResponse {
  success: boolean;
  tokens: APIToken[];
}

interface TokenCreateResponse {
  success: boolean;
  token: string;
  token_id: number;
  name: string;
  warning?: string;
}

const tokens = ref<APIToken[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const showCreateModal = ref(false);
const newTokenName = ref('');
const createdToken = ref<string | null>(null);
const showToken = ref(false);
const showRevokeConfirm = ref(false);
const tokenToRevoke = ref<{ id: number; name: string } | null>(null);

const fetchTokens = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const response = await apiClient.get<TokenListResponse>('/auth/tokens');
    const data = response.data || (response as any);
    tokens.value = data.tokens || [];
  } catch (err) {
    console.error('Failed to fetch API tokens:', err);
    error.value = err instanceof Error ? err.message : 'Failed to fetch tokens';
  } finally {
    isLoading.value = false;
  }
};

const createToken = async () => {
  if (!newTokenName.value.trim()) {
    error.value = 'Token name is required';
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    const response = await apiClient.post<TokenCreateResponse>('/auth/tokens', {
      name: newTokenName.value.trim(),
    });
    // Response is already unwrapped by axios
    const data = response.data || (response as any);
    createdToken.value = data.token || null;
    showCreateModal.value = false;
    showToken.value = true;
    newTokenName.value = '';
    await fetchTokens();
  } catch (err) {
    console.error('Failed to create API token:', err);
    error.value = err instanceof Error ? err.message : 'Failed to create token';
  } finally {
    isLoading.value = false;
  }
};

const openRevokeConfirm = (tokenId: number, tokenName: string) => {
  tokenToRevoke.value = { id: tokenId, name: tokenName };
  showRevokeConfirm.value = true;
};

const revokeToken = async () => {
  if (!tokenToRevoke.value) return;

  isLoading.value = true;
  error.value = null;
  try {
    await apiClient.delete(`/auth/tokens/${tokenToRevoke.value.id}`);
    await fetchTokens();
    showRevokeConfirm.value = false;
    tokenToRevoke.value = null;
  } catch (err) {
    console.error('Failed to revoke API token:', err);
    error.value = err instanceof Error ? err.message : 'Failed to revoke token';
  } finally {
    isLoading.value = false;
  }
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  newTokenName.value = '';
  error.value = null;
};

const closeTokenModal = () => {
  showToken.value = false;
  createdToken.value = null;
};

const copyToken = () => {
  if (createdToken.value) {
    navigator.clipboard.writeText(createdToken.value);
    // Could add a toast notification here
  }
};

const formatTimestamp = (timestamp: number | null) => {
  if (!timestamp) return 'Never';
  return new Date(timestamp * 1000).toLocaleString();
};

// Compute the actual server URL for the example
const exampleUrl = computed(() => {
  // If in production, use relative path since we're on same domain
  // Otherwise use the actual API_SERVER_URL (with IP)
  const baseUrl = API_SERVER_URL || window.location.origin;
  return `${baseUrl}/api/stats`;
});

onMounted(() => {
  fetchTokens();
});
</script>

<template>
  <div class="space-y-12">
    <!-- Header -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h2 class="text-lg sm:text-xl font-semibold text-content-primary dark:text-content-primary">
          API Tokens
        </h2>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm mt-1">
          Manage API tokens for machine-to-machine authentication
        </p>
      </div>
      <button
        @click="showCreateModal = true"
        class="cfg-btn-primary flex items-center justify-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Create Token
      </button>
    </div>

    <!-- Info Box -->
    <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4">
      <div class="flex gap-2 sm:gap-3">
        <svg
          class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div class="text-xs sm:text-sm text-blue-700 dark:text-blue-200">
          <p>
            <strong>API tokens</strong> are used for machine-to-machine authentication. Include the
            token in the <code class="bg-blue-500/20 px-1 rounded">X-API-Key</code> header when
            making API requests.
          </p>
          <p class="mt-2">Tokens are only shown once at creation. Store them securely.</p>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {{ error }}
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && tokens.length === 0" class="flex items-center justify-center py-12">
      <div class="text-center">
        <Spinner class="mx-auto mb-4" />
        <div class="text-content-secondary dark:text-content-muted">Loading tokens...</div>
      </div>
    </div>

    <!-- Tokens List -->
    <div v-else-if="tokens.length > 0" class="space-y-3">
      <div
        v-for="token in tokens"
        :key="token.id"
        class="bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg p-3 sm:p-4 hover:bg-stroke-subtle dark:hover:bg-white/10 transition-colors"
      >
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 sm:gap-3">
              <svg
                class="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0"
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
              <div class="min-w-0 flex-1">
                <h3
                  class="text-content-primary dark:text-content-primary font-medium text-sm sm:text-base break-all"
                >
                  {{ token.name }}
                </h3>
                <div
                  class="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-1 text-xs text-content-secondary dark:text-content-muted"
                >
                  <span class="truncate">Created: {{ formatTimestamp(token.created_at) }}</span>
                  <span class="truncate">Last used: {{ formatTimestamp(token.last_used) }}</span>
                </div>
              </div>
            </div>
          </div>
          <button
            @click="openRevokeConfirm(token.id, token.name)"
            :disabled="isLoading"
            class="w-full sm:w-auto px-3 py-1.5 bg-red-100 dark:bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded-lg border border-red-500/50 transition-colors disabled:opacity-50 text-sm"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <svg
        class="w-16 h-16 text-content-muted dark:text-content-muted/40 mx-auto mb-4"
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
      <h3 class="text-content-primary dark:text-content-primary font-medium mb-2">No API Tokens</h3>
      <p class="text-content-secondary dark:text-content-muted text-sm mb-4">
        Create a token to enable API access
      </p>
      <button
        @click="showCreateModal = true"
        class="cfg-btn-primary"
      >
        Create Your First Token
      </button>
    </div>

    <!-- Create Token Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="closeCreateModal"
    >
      <div
        class="bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-[15px] p-6 max-w-md w-full shadow-2xl"
      >
        <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary mb-4">
          Create API Token
        </h3>

        <div class="space-y-4">
          <div>
            <label
              class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Token Name</label
            >
            <input
              v-model="newTokenName"
              type="text"
              placeholder="e.g., Production Server, CI/CD Pipeline"
              class="cfg-input placeholder-gray-400 dark:placeholder-white/40"
              @keydown.enter="createToken"
            />
            <p class="text-xs text-content-muted dark:text-content-muted mt-1">
              Give your token a descriptive name to identify its purpose
            </p>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button
              @click="closeCreateModal"
              :disabled="isLoading"
              class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              @click="createToken"
              :disabled="isLoading || !newTokenName.trim()"
              class="btn-primary"
            >
              {{ isLoading ? 'Creating...' : 'Create Token' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Show Token Modal -->
    <div
      v-if="showToken && createdToken"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="closeTokenModal"
    >
      <div
        class="bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-[15px] p-6 max-w-lg w-full shadow-2xl"
      >
        <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary mb-4">
          Token Created Successfully
        </h3>

        <div class="space-y-4">
          <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div class="flex gap-3">
              <svg
                class="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div class="text-sm text-yellow-200">
                <strong>Save this token now!</strong> For security reasons, it will not be shown
                again.
              </div>
            </div>
          </div>

          <div>
            <label
              class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Your API Token</label
            >
            <div class="flex gap-2">
              <input
                :value="createdToken"
                readonly
                class="flex-1 px-4 py-2 bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary font-mono text-sm"
              />
              <button
                @click="copyToken"
                class="btn-primary flex items-center gap-2"
                title="Copy to clipboard"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </button>
            </div>
          </div>

          <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p class="text-sm text-blue-200 mb-2"><strong>Usage Example:</strong></p>
            <code
              class="block bg-blue-500/20 px-3 py-2 rounded text-xs text-blue-100 font-mono overflow-x-auto"
            >
              curl -H "X-API-Key: {{ createdToken }}" {{ exampleUrl }}
            </code>
          </div>

          <div class="flex justify-end mt-6">
            <button
              @click="closeTokenModal"
              class="btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Revoke Confirmation Dialog -->
  <ConfirmDialog
    :show="showRevokeConfirm"
    title="Revoke API Token"
    :message="`Are you sure you want to revoke the token '${tokenToRevoke?.name}'? This action cannot be undone.`"
    confirm-text="Revoke"
    cancel-text="Cancel"
    variant="danger"
    @confirm="revokeToken"
    @close="showRevokeConfirm = false"
  />
</template>
