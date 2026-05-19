<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import TreeNode from '@/components/ui/TreeNode.vue';
import AddKeyModal from '@/components/modals/AddKeyModal.vue';
import EditKeyModal from '@/components/modals/EditKeyModal.vue';
import DeleteConfirmModal from '@/components/modals/DeleteConfirmModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useTreeStateStore } from '@/stores/treeState';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';
import type { TreeNodeData } from '@/types/tree';
import Spinner from '@/components/ui/Spinner.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

defineOptions({ name: 'TransportKeys' });

const treeStore = useTreeStateStore();
const systemStore = useSystemStore();

// ── Edit state ────────────────────────────────────────────────────────────
const isEditing = ref(false);
const isSaving = ref(false);
const saveError = ref<string | null>(null);

// ── Temp ID counter for new (unsaved) nodes ───────────────────────────────
let _nextTempId = -1;
function nextTempId() { return _nextTempId--; }

// ── Flood policy ──────────────────────────────────────────────────────────
const unscopedFloodPolicy = ref<'allow' | 'deny'>('deny');
let snapshotUnscopedPolicy: 'allow' | 'deny' = 'deny';

const statsFloodAllow = computed(() => systemStore.stats?.config?.mesh?.unscoped_flood_allow ?? null);
watch(statsFloodAllow, (val) => {
  if (val !== null && !isEditing.value) unscopedFloodPolicy.value = val ? 'allow' : 'deny';
}, { immediate: true });

// ── Tree data ─────────────────────────────────────────────────────────────
const transportKeysData = ref<TreeNodeData[]>([]);
let snapshot: TreeNodeData[] | null = null;
const loading = ref(false);
const error = ref<string | null>(null);

// ── Modal state ───────────────────────────────────────────────────────────
const showAddModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);
const editingNode = ref<TreeNodeData | null>(null);
const deletingNode = ref<TreeNodeData | null>(null);

// ── Tree helpers ──────────────────────────────────────────────────────────
function cloneTree(nodes: TreeNodeData[]): TreeNodeData[] {
  return nodes.map(n => ({ ...n, children: cloneTree(n.children) }));
}

function flattenTree(
  nodes: TreeNodeData[],
  parentId?: number,
): Array<{ node: TreeNodeData; parentId?: number }> {
  const result: Array<{ node: TreeNodeData; parentId?: number }> = [];
  for (const node of nodes) {
    result.push({ node, parentId });
    result.push(...flattenTree(node.children, node.id));
  }
  return result;
}

function findNodeById(nodes: TreeNodeData[], id: number): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function removeNodeFromTree(nodes: TreeNodeData[], id: number): boolean {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const node of nodes) {
    if (removeNodeFromTree(node.children, id)) return true;
  }
  return false;
}

// ── Load from API ─────────────────────────────────────────────────────────
const buildTreeFromApiData = (apiData: any[]): TreeNodeData[] => {
  const nodeMap = new Map<number, TreeNodeData>();
  const roots: TreeNodeData[] = [];
  apiData.forEach((item) => {
    nodeMap.set(item.id, {
      id: item.id,
      name: item.name,
      floodPolicy: item.flood_policy as 'allow' | 'deny',
      transport_key: item.transport_key,
      last_used: item.last_used ? new Date(item.last_used * 1000) : undefined,
      parent_id: item.parent_id,
      children: [],
    });
  });
  nodeMap.forEach((node) => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

const loadTransportKeys = async () => {
  loading.value = true;
  error.value = null;
  try {
    const response = await ApiService.getTransportKeys();
    if (response.success && response.data) {
      transportKeysData.value = buildTreeFromApiData(response.data as any[]);
    } else {
      error.value = response.error || 'Failed to load regions';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    loading.value = false;
  }
};

onMounted(loadTransportKeys);

// ── Edit workflow ─────────────────────────────────────────────────────────
function startEditing() {
  snapshot = cloneTree(transportKeysData.value);
  snapshotUnscopedPolicy = unscopedFloodPolicy.value;
  isEditing.value = true;
  saveError.value = null;
}

function cancelEditing() {
  if (snapshot) transportKeysData.value = cloneTree(snapshot);
  unscopedFloodPolicy.value = snapshotUnscopedPolicy;
  snapshot = null;
  isEditing.value = false;
  saveError.value = null;
  treeStore.setSelectedNode(null);
}

async function saveChanges() {
  isSaving.value = true;
  saveError.value = null;
  try {
    const currentFlat = flattenTree(transportKeysData.value);
    const snapshotFlat = snapshot ? flattenTree(snapshot) : [];

    const snapshotMap = new Map(snapshotFlat.map(({ node }) => [node.id, node]));
    const currentPositive = currentFlat.filter(({ node }) => node.id > 0);
    const currentNegative = currentFlat.filter(({ node }) => node.id < 0);
    const currentPositiveIds = new Set(currentPositive.map(({ node }) => node.id));

    // 1. Deletes — nodes that were in the snapshot but are no longer present
    for (const { node } of snapshotFlat) {
      if (!currentPositiveIds.has(node.id)) {
        await ApiService.deleteTransportKey(node.id);
      }
    }

    // 2. Creates — new nodes (negative IDs), parents before children
    const tempIdMap = new Map<number, number>();
    const toCreate = [...currentNegative];
    let passes = toCreate.length * 2;
    while (toCreate.length && passes-- > 0) {
      const idx = toCreate.findIndex(({ parentId }) =>
        parentId === undefined || parentId > 0 || (parentId < 0 && tempIdMap.has(parentId)),
      );
      if (idx === -1) break;
      const { node, parentId } = toCreate.splice(idx, 1)[0];
      const realParentId =
        parentId === undefined ? undefined
        : parentId > 0 ? parentId
        : tempIdMap.get(parentId);
      const res = await ApiService.createTransportKey(
        node.name, node.floodPolicy, node.transport_key, realParentId,
      );
      if (res.success && (res.data as any)?.id) {
        tempIdMap.set(node.id, (res.data as any).id);
      }
    }

    // 3. Edits — existing nodes where something changed
    for (const { node } of currentPositive) {
      const original = snapshotMap.get(node.id);
      if (original && (
        node.name !== original.name ||
        node.floodPolicy !== original.floodPolicy ||
        node.transport_key !== original.transport_key
      )) {
        await ApiService.updateTransportKey(node.id, node.name, node.floodPolicy, node.transport_key);
      }
    }

    // 4. Flood policy
    if (unscopedFloodPolicy.value !== snapshotUnscopedPolicy) {
      await ApiService.updateUnscopedFloodPolicy(unscopedFloodPolicy.value === 'allow');
    }

    await loadTransportKeys();
    await systemStore.fetchStats();
    snapshot = null;
    isEditing.value = false;
    treeStore.setSelectedNode(null);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Save failed';
  } finally {
    isSaving.value = false;
  }
}

// ── Selection ─────────────────────────────────────────────────────────────
function selectNode(nodeId: number) {
  treeStore.setSelectedNode(nodeId);
}

function getSelectedNodeName(): string | undefined {
  const id = treeStore.selectedNodeId.value;
  return id ? findNodeById(transportKeysData.value, id)?.name : undefined;
}

// ── In-memory modal handlers ───────────────────────────────────────────────
function addNode() { showAddModal.value = true; }

function handleAddKey(data: { name: string; floodPolicy: 'allow' | 'deny'; parentId?: number }) {
  const newNode: TreeNodeData = {
    id: nextTempId(),
    name: data.name,
    floodPolicy: data.floodPolicy,
    children: [],
  };
  if (data.parentId) {
    const parent = findNodeById(transportKeysData.value, data.parentId);
    if (parent) { parent.children.push(newNode); }
    else { transportKeysData.value.push(newNode); }
  } else {
    transportKeysData.value.push(newNode);
  }
  showAddModal.value = false;
}

function editNodeById(nodeId: number) {
  const node = findNodeById(transportKeysData.value, nodeId);
  if (node) { editingNode.value = node; showEditModal.value = true; }
}

function handleSaveEdit(data: { id: number; name: string; floodPolicy: 'allow' | 'deny'; transportKey?: string }) {
  const node = findNodeById(transportKeysData.value, data.id);
  if (node) {
    node.name = data.name;
    node.floodPolicy = data.floodPolicy;
    if (data.transportKey !== undefined) node.transport_key = data.transportKey;
  }
  showEditModal.value = false;
  editingNode.value = null;
}

function handleCloseEditModal() {
  showEditModal.value = false;
  editingNode.value = null;
}

function deleteNodeById(nodeId: number) {
  const node = findNodeById(transportKeysData.value, nodeId);
  if (node) { deletingNode.value = node; showDeleteModal.value = true; }
}

function handleDeleteAll(nodeId: number) {
  removeNodeFromTree(transportKeysData.value, nodeId);
  treeStore.setSelectedNode(null);
  showDeleteModal.value = false;
  deletingNode.value = null;
}

function handleMoveChildren(data: { nodeId: number; targetParentId: number }) {
  const node = findNodeById(transportKeysData.value, data.nodeId);
  if (node?.children.length) {
    const target = findNodeById(transportKeysData.value, data.targetParentId);
    if (target) { target.children.push(...node.children); }
    else { transportKeysData.value.push(...node.children); }
  }
  removeNodeFromTree(transportKeysData.value, data.nodeId);
  treeStore.setSelectedNode(null);
  showDeleteModal.value = false;
  deletingNode.value = null;
}


function handleUnscopedFloodPolicyChange(policy: 'allow' | 'deny') {
  unscopedFloodPolicy.value = policy;
}

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  isSaving,
  cancelEditing,
  async () => { await saveChanges(); return !isEditing.value; },
);

defineExpose({ requestLeave, isEditing });
</script>

<template>
  <UnsavedChangesModal
    :show="showUnsavedModal"
    :is-saving="isSaving"
    label="Region Configuration"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <!-- Header -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">
          Region Configuration
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Manage regional key hierarchy
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="isEditing"
          @click="addNode"
          class="cfg-btn-secondary flex items-center gap-1.5"
          :disabled="isSaving"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Region
        </button>
        <template v-if="!isEditing">
          <button @click="startEditing" class="cfg-btn-primary">Edit Settings</button>
        </template>
        <template v-else>
          <button @click="cancelEditing" :disabled="isSaving" class="cfg-btn-secondary">Cancel</button>
          <button @click="saveChanges" :disabled="isSaving" class="cfg-btn-primary">
            {{ isSaving ? 'Saving…' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Save Error -->
    <div v-if="saveError" class="bg-red-100 dark:bg-red-500/20 border border-red-500/50 rounded-lg p-3">
      <p class="text-red-600 dark:text-red-400 text-sm">{{ saveError }}</p>
    </div>

    <!-- Unscoped Flood Control -->
    <div class="cfg-section">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 class="text-xs sm:text-sm font-medium text-content-primary dark:text-content-primary mb-1">
            Unscoped Flood Policy (*)
          </h4>
          <p class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
            Allow or Deny unscoped flood packets
          </p>
        </div>
        <div
          :class="[
            'flex bg-background-mute dark:bg-stroke/5 rounded-lg border border-stroke-subtle dark:border-stroke/20 p-0.5 sm:p-1',
            !isEditing ? 'opacity-50 pointer-events-none' : '',
          ]"
        >
          <button
            @click="handleUnscopedFloodPolicyChange('deny')"
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
            @click="handleUnscopedFloodPolicyChange('allow')"
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

    <!-- Tree Viewer -->
    <div class="cfg-section space-y-4" @click="isEditing && treeStore.setSelectedNode(null)">
      <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary">Regions</h3>
      <p v-if="isEditing" class="text-xs text-content-muted dark:text-content-muted pb-1">
        To add a child region, click on a region to select it, then click "Add Region".
      </p>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Spinner />
        <span class="ml-2 text-content-secondary dark:text-content-muted">Loading regions…</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <div class="text-accent-red mb-2">⚠️ Error loading regions</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</div>
        <button @click="loadTransportKeys" class="btn-success mt-4">
          Retry
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="transportKeysData.length === 0" class="text-center py-8">
        <div class="text-content-muted dark:text-content-muted mb-2">No regions found</div>
        <div class="text-content-muted dark:text-content-muted/60 text-sm">
          Click "Edit Settings" then "Add Region" to get started
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
          :unlocked="isEditing"
          @select="selectNode"
          @edit="editNodeById"
          @delete="deleteNodeById"
        />
      </div>
    </div>

    <!-- Add Region Modal -->
    <AddKeyModal
      :show="showAddModal"
      :selected-node-name="getSelectedNodeName()"
      :selected-node-id="treeStore.selectedNodeId.value || undefined"
      @close="showAddModal = false"
      @add="handleAddKey"
    />

    <!-- Edit Region Modal -->
    <EditKeyModal
      :show="showEditModal"
      :node="editingNode"
      @close="handleCloseEditModal"
      @save="handleSaveEdit"
    />

    <!-- Delete Confirm Modal -->
    <DeleteConfirmModal
      :show="showDeleteModal"
      :node="deletingNode"
      :all-nodes="transportKeysData"
      @close="showDeleteModal = false; deletingNode = null"
      @delete-all="handleDeleteAll"
      @move-children="handleMoveChildren"
    />
  </div>
</template>
