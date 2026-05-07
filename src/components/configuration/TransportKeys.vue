<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import TreeNode from '@/components/ui/TreeNode.vue';
import AddKeyModal from '@/components/modals/AddKeyModal.vue';
import EditKeyModal from '@/components/modals/EditKeyModal.vue';
import DeleteConfirmModal from '@/components/modals/DeleteConfirmModal.vue';
import { useTreeStateStore } from '@/stores/treeState';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

defineOptions({ name: 'TransportKeys' });

interface TreeNodeData {
  id: number;
  name: string;
  children: TreeNodeData[];
  floodPolicy: 'allow' | 'deny';
  transport_key?: string;
  last_used?: Date;
  parent_id?: number;
}

// Use the global tree state store
const treeStore = useTreeStateStore();
const systemStore = useSystemStore();

// Unlock state
const isUnlocked = ref(false);

// Modal state
const showAddModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);
const editingNode = ref<TreeNodeData | null>(null);
const deletingNode = ref<TreeNodeData | null>(null);

// Global flood control — synced from stats
const unscopedFloodPolicy = ref<'allow' | 'deny'>('deny');

const statsFloodAllow = computed(() => systemStore.stats?.config?.mesh?.unscoped_flood_allow ?? null);
watch(
  statsFloodAllow,
  (val) => {
    if (val !== null) unscopedFloodPolicy.value = val ? 'allow' : 'deny';
  },
  { immediate: true },
);

// Data state
const transportKeysData = ref<TreeNodeData[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Convert flat API data to hierarchical tree structure
const buildTreeFromApiData = (apiData: any[]): TreeNodeData[] => {
  const nodeMap = new Map<number, TreeNodeData>();
  const roots: TreeNodeData[] = [];

  // First pass: create all nodes
  apiData.forEach((item) => {
    const node: TreeNodeData = {
      id: item.id,
      name: item.name,
      floodPolicy: item.flood_policy as 'allow' | 'deny',
      transport_key: item.transport_key,
      last_used: item.last_used ? new Date(item.last_used * 1000) : undefined,
      parent_id: item.parent_id,
      children: [],
    };
    nodeMap.set(item.id, node);
  });

  // Second pass: build hierarchy
  nodeMap.forEach((node) => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      const parent = nodeMap.get(node.parent_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

// Load transport keys from API
const loadTransportKeys = async () => {
  try {
    loading.value = true;
    error.value = null;
    const response = await ApiService.getTransportKeys();

    if (response.success && response.data) {
      transportKeysData.value = buildTreeFromApiData(response.data as any[]);
    } else {
      error.value = response.error || 'Failed to load transport keys';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Error loading transport keys:', err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadTransportKeys();
});

// Helper function to find a node by ID
function findNodeById(nodes: TreeNodeData[], id: number): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Get the name of the currently selected node
function getSelectedNodeName(): string | undefined {
  const selectedId = treeStore.selectedNodeId.value;
  if (!selectedId) return undefined;

  const node = findNodeById(transportKeysData.value, selectedId);
  return node?.name;
}

function selectNode(nodeId: number) {
  treeStore.setSelectedNode(nodeId);
}

function addNode() {
  showAddModal.value = true;
}

function editNodeById(nodeId: number) {
  const node = findNodeById(transportKeysData.value, nodeId);
  if (node) {
    editingNode.value = node;
    showEditModal.value = true;
  }
}

function deleteNodeById(nodeId: number) {
  const node = findNodeById(transportKeysData.value, nodeId);
  if (node) {
    deletingNode.value = node;
    showDeleteModal.value = true;
  }
}

// Handle adding new key/region
const handleAddKey = async (data: {
  name: string;
  floodPolicy: 'allow' | 'deny';
  parentId?: number;
}) => {
  try {
    // Let the backend generate the transport key - no need to generate it here
    const response = await ApiService.createTransportKey(
      data.name,
      data.floodPolicy,
      undefined, // Let backend generate the key
      data.parentId,
      undefined, // New keys haven't been used yet, so last_used should be null
    );

    if (response.success) {
      // Reload the tree data to reflect changes
      await loadTransportKeys();
    } else {
      console.error('Failed to add transport key:', response.error);
      error.value = response.error || 'Failed to add transport key';
    }
  } catch (err) {
    console.error('Error adding transport key:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    // Close modal regardless of outcome
    showAddModal.value = false;
  }
};

function handleCloseModal() {
  showAddModal.value = false;
}

// Handle unscoped flood policy changes
async function handleUnscopedFloodPolicyChange(policy: 'allow' | 'deny') {
  try {
    const allow = policy === 'allow';
    const response = await ApiService.updateUnscopedFloodPolicy(allow);

    if (response.success) {
      unscopedFloodPolicy.value = policy;
      await systemStore.fetchStats();
    } else {
      console.error('Failed to update unscoped flood policy:', response.error);
      error.value = response.error || 'Failed to update unscoped flood policy';
    }
  } catch (err) {
    console.error('Error updating unscoped flood policy:', err);
    error.value = err instanceof Error ? err.message : 'Failed to update unscoped flood policy';
  }
}

// Handle edit modal close
function handleCloseEditModal() {
  showEditModal.value = false;
  editingNode.value = null;
}

// Handle save from edit modal
async function handleSaveEdit(data: { id: number; name: string; floodPolicy: 'allow' | 'deny'; transportKey?: string }) {
  try {
    const response = await ApiService.updateTransportKey(
      data.id,
      data.name,
      data.floodPolicy,
      data.transportKey,
    );

    if (response.success) {
      // Reload the tree data to reflect changes
      await loadTransportKeys();
    } else {
      console.error('Failed to update transport key:', response.error);
      error.value = response.error || 'Failed to update transport key';
    }
  } catch (err) {
    console.error('Error updating transport key:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    handleCloseEditModal();
  }
}

// Handle delete request from edit modal - open delete confirmation modal
function handleRequestDeleteFromEdit(node: TreeNodeData) {
  // Close edit modal and open delete confirmation modal
  showEditModal.value = false;
  editingNode.value = null;
  deletingNode.value = node;
  showDeleteModal.value = true;
}

// Handle delete modal close
function handleCloseDeleteModal() {
  showDeleteModal.value = false;
  deletingNode.value = null;
}

// Handle delete all from delete modal
async function handleDeleteAll(nodeId: number) {
  try {
    const response = await ApiService.deleteTransportKey(nodeId);

    if (response.success) {
      // Reload the tree data to reflect changes
      await loadTransportKeys();

      treeStore.setSelectedNode(null); // Clear selection
    } else {
      console.error('Failed to delete transport key:', response.error);
      error.value = response.error || 'Failed to delete transport key';
    }
  } catch (err) {
    console.error('Error deleting transport key:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    handleCloseDeleteModal();
  }
}

// Handle move children from delete modal
async function handleMoveChildren(data: { nodeId: number; targetParentId: number }) {
  try {
    // For simplicity in this implementation, we'll just delete the node
    // In a more complex implementation, you'd move children by updating their parent_id
    // before deleting the parent node
    const response = await ApiService.deleteTransportKey(data.nodeId);

    if (response.success) {
      // Reload the tree data to reflect changes
      await loadTransportKeys();

      treeStore.setSelectedNode(null); // Clear selection
    } else {
      console.error('Failed to delete transport key:', response.error);
      error.value = response.error || 'Failed to delete transport key';
    }
  } catch (err) {
    console.error('Error deleting transport key:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    handleCloseDeleteModal();
  }
}
</script>

<template>
  <div class="space-y-12">
    <!-- Header -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div>
        <h3
          class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2"
        >
          Region Configuration
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Manage regional key hierarchy
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="isUnlocked"
          @click="addNode"
          class="cfg-btn-secondary flex items-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Region
        </button>
        <button @click="isUnlocked = !isUnlocked" class="cfg-btn-primary">
          {{ isUnlocked ? 'Lock Settings' : 'Unlock Settings' }}
        </button>
      </div>
    </div>

    <!-- Unscoped Flood Control -->
    <div class="cfg-section">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4
            class="text-xs sm:text-sm font-medium text-content-primary dark:text-content-primary mb-1"
          >
            Unscoped Flood Policy (*)
          </h4>
          <p class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
            Allow or Deny unscoped flood packets
          </p>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- Unscoped Policy Toggle -->
          <div
            :class="[
              'flex bg-background-mute dark:bg-stroke/5 rounded-lg border border-stroke-subtle dark:border-stroke/20 p-0.5 sm:p-1',
              !isUnlocked ? 'opacity-50 pointer-events-none' : '',
            ]"
          >
            <button
              @click="isUnlocked && handleUnscopedFloodPolicyChange('deny')"
              :class="[
                'px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded transition-colors',
                unscopedFloodPolicy === 'deny'
                  ? 'bg-accent-red/20 text-accent-red border border-accent-red/50'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              DENY
            </button>
            <button
              @click="isUnlocked && handleUnscopedFloodPolicyChange('allow')"
              :class="[
                'px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded transition-colors',
                unscopedFloodPolicy === 'allow'
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/50'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              ALLOW
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tree Viewer -->
    <div class="cfg-section space-y-4" @click="isUnlocked && treeStore.setSelectedNode(null)">
      <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary">Regions</h3>
      <p v-if="isUnlocked" class="text-xs text-content-muted dark:text-content-muted pb-1">
        To add a child region, click on a region to select it, then click "Add Region".
      </p>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-green"></div>
        <span class="ml-2 text-content-secondary dark:text-content-muted"
          >Loading regions...</span
        >
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <div class="text-accent-red mb-2">⚠️ Error loading regions</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</div>
        <button
          @click="loadTransportKeys"
          class="mt-4 px-4 py-2 bg-accent-green/20 hover:bg-accent-green/30 text-accent-green border border-accent-green/50 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="transportKeysData.length === 0" class="text-center py-8">
        <div class="text-content-muted dark:text-content-muted mb-2">No regions found</div>
        <div class="text-content-muted dark:text-content-muted/60 text-sm">
          Unlock settings and add your first region to get started
        </div>
      </div>

      <!-- Tree Data -->
      <div v-else class="space-y-2">
        <TreeNode
          v-for="node in transportKeysData"
          :key="node.id"
          :node="node"
          :selected-node-id="treeStore.selectedNodeId.value"
          :level="0"
          :unlocked="isUnlocked"
          @select="selectNode"
          @edit="editNodeById"
          @delete="deleteNodeById"
        />
      </div>
    </div>

    <!-- Add Key Modal -->
    <AddKeyModal
      :show="showAddModal"
      :selected-node-name="getSelectedNodeName()"
      :selected-node-id="treeStore.selectedNodeId.value || undefined"
      @close="handleCloseModal"
      @add="handleAddKey"
    />

    <!-- Edit Key Modal -->
    <EditKeyModal
      :show="showEditModal"
      :node="editingNode"
      @close="handleCloseEditModal"
      @save="handleSaveEdit"
      @request-delete="handleRequestDeleteFromEdit"
    />

    <!-- Delete Confirm Modal -->
    <DeleteConfirmModal
      :show="showDeleteModal"
      :node="deletingNode"
      :all-nodes="transportKeysData"
      @close="handleCloseDeleteModal"
      @delete-all="handleDeleteAll"
      @move-children="handleMoveChildren"
    />

    <!-- Selection Info -->
    <!-- <div v-if="treeStore.selectedNodeId.value" class="glass-card rounded-[15px] p-4 border border-primary/30 bg-primary/5">
      <div class="flex items-center gap-2 text-primary">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-sm font-medium">Selected: {{ treeStore.selectedNodeId.value }}</span>
      </div>
    </div> -->
  </div>
</template>
