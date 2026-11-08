<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import TreeNode from '@/components/ui/TreeNode.vue';
import KeyModal from '@/components/modals/KeyModal.vue';
import DeleteConfirmModal from '@/components/modals/DeleteConfirmModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import SaveBar, { type SaveBarChange } from '@/components/ui/SaveBar.vue';
import DiscoveredRegions from '@/components/configuration/DiscoveredRegions.vue';
import { useTreeStateStore } from '@/stores/treeState';
import { useSystemStore } from '@/stores/system';
import { useNeighborStore } from '@/stores/neighbors';
import ApiService from '@/utils/api';
import type { TreeNodeData } from '@/types/tree';
import Spinner from '@/components/ui/Spinner.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

defineOptions({ name: 'TransportKeys' });

const treeStore = useTreeStateStore();
const systemStore = useSystemStore();
const neighborStore = useNeighborStore();

// ── Save state ────────────────────────────────────────────────────────────
const isSaving = ref(false);
const saveError = ref<string | null>(null);

// ── Temp ID counter for new (unsaved) nodes ───────────────────────────────
let _nextTempId = -1;
function nextTempId() { return _nextTempId--; }

// ── Flood policy ──────────────────────────────────────────────────────────
const unscopedFloodPolicy = ref<'allow' | 'deny'>('deny');
const snapshotUnscopedPolicy = ref<'allow' | 'deny'>('deny');
const defaultRegion = ref<string | null>(null);
const defaultRegionInput = ref('');
const snapshotDefaultRegion = ref<string | null>(null);

// ── Tree data ─────────────────────────────────────────────────────────────
// The tree as loaded is the snapshot; edits work on transportKeysData and are
// written (deletes, creates, edits) as a diff against it on save.
const transportKeysData = ref<TreeNodeData[]>([]);
const snapshot = ref<TreeNodeData[]>([]);
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
    const [keysResponse, defaultRegionResponse] = await Promise.all([
      ApiService.getTransportKeys(),
      ApiService.getDefaultRegion(),
    ]);

    if (keysResponse.success && keysResponse.data) {
      transportKeysData.value = buildTreeFromApiData(keysResponse.data as any[]);
      snapshot.value = cloneTree(transportKeysData.value);
    } else {
      error.value = keysResponse.error || 'Failed to load regions';
    }

    if (defaultRegionResponse.success) {
      const loadedDefault = defaultRegionResponse.data?.default_region ?? null;
      defaultRegion.value = loadedDefault;
      snapshotDefaultRegion.value = loadedDefault;
      defaultRegionInput.value = loadedDefault ?? '';
    } else if (!error.value) {
      error.value = defaultRegionResponse.error || 'Failed to load default region';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    loading.value = false;
  }
};

// ── Discovered regions ────────────────────────────────────────────────────
// Sourced from the scope answers neighbours gave, which the repeater stores for
// the Neighbors page; nothing is queried over the radio from here.
const discoveredLoading = ref(false);
const discoveredError = ref<string | null>(null);

const loadDiscoveredRegions = async () => {
  discoveredLoading.value = true;
  discoveredError.value = null;
  const ok = await neighborStore.fetchScopes();
  if (!ok) {
    discoveredError.value = 'The repeater did not return the stored scope answers.';
  }
  discoveredLoading.value = false;
};

/** Region names already in the list, '#'-stripped and lowercased for matching. */
const carriedRegionNames = computed(() => {
  const names = new Set<string>();
  for (const { node } of flattenTree(transportKeysData.value)) {
    const name = (node.name || '').trim();
    names.add((name.startsWith('#') ? name.slice(1) : name).toLowerCase());
  }
  return names;
});

// Compared against the working tree, not the saved one, so a region added below
// flips to "Carried" straight away instead of offering to be added twice.
const discoveredRegions = computed(() =>
  neighborStore.discoveredScopes.map((region) => ({
    ...region,
    carried: carriedRegionNames.value.has(region.name.toLowerCase()),
  })),
);

function addDiscoveredRegion(name: string) {
  if (isSaving.value) return;
  if (carriedRegionNames.value.has(name.toLowerCase())) return;
  // A draft node like any other addition on this tab: the '#' prefix matches what
  // the region editor stores, flood 'allow' is what makes it advertised, and the
  // transport key is left for the repeater to derive from the name on save.
  transportKeysData.value.push({
    id: nextTempId(),
    name: `#${name}`,
    floodPolicy: 'allow',
    children: [],
  });
}

onMounted(async () => {
  await loadTransportKeys();
  await loadDiscoveredRegions();
});

// ── Unsaved changes ───────────────────────────────────────────────────────
function normalizeDefaultRegionInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '<null>') {
    return null;
  }
  return trimmed;
}

/** A node's saved fields and place in the tree, for comparing with the snapshot. */
function treeShape(nodes: TreeNodeData[]) {
  return flattenTree(nodes).map(({ node, parentId }) => ({
    id: node.id,
    parentId: parentId ?? null,
    name: node.name,
    floodPolicy: node.floodPolicy,
    transport_key: node.transport_key ?? null,
  }));
}

const statsFloodAllow = computed(() => systemStore.stats?.config?.mesh?.unscoped_flood_allow ?? null);

const regionChanges = computed<SaveBarChange[]>(() => {
  const items: SaveBarChange[] = [];
  const before = new Map(treeShape(snapshot.value).map((n) => [n.id, n]));
  const after = treeShape(transportKeysData.value);
  const afterIds = new Set(after.map((n) => n.id));
  for (const node of before.values()) {
    if (!afterIds.has(node.id)) items.push({ label: `Remove region ${node.name}` });
  }
  for (const node of after) {
    const old = before.get(node.id);
    if (!old) {
      items.push({ label: `Add region ${node.name}`, detail: `flood ${node.floodPolicy}` });
      continue;
    }
    if (old.name !== node.name) {
      items.push({ label: `Rename region ${old.name}`, detail: `→ ${node.name}` });
    }
    if (old.floodPolicy !== node.floodPolicy) {
      items.push({
        label: `Region ${node.name} flood`,
        detail: `${old.floodPolicy} → ${node.floodPolicy}`,
      });
    }
    if (old.transport_key !== node.transport_key) {
      items.push({ label: `Region ${node.name} transport key`, detail: 'changed' });
    }
  }
  if (unscopedFloodPolicy.value !== snapshotUnscopedPolicy.value) {
    items.push({
      label: 'Unscoped flood policy',
      detail: `${snapshotUnscopedPolicy.value} → ${unscopedFloodPolicy.value}`,
    });
  }
  const region = normalizeDefaultRegionInput(defaultRegionInput.value);
  if (region !== snapshotDefaultRegion.value) {
    items.push({
      label: 'Default region',
      detail: `${snapshotDefaultRegion.value ?? '—'} → ${region ?? '—'}`,
    });
  }
  return items;
});

const isDirty = computed(() => regionChanges.value.length > 0);

watch(
  statsFloodAllow,
  (val) => {
    if (val === null) return;
    const policy = val ? 'allow' : 'deny';
    // A clean page follows the saved policy; an edited one keeps the edit.
    if (unscopedFloodPolicy.value === snapshotUnscopedPolicy.value) {
      unscopedFloodPolicy.value = policy;
    }
    snapshotUnscopedPolicy.value = policy;
  },
  { immediate: true },
);

function cancelEditing() {
  transportKeysData.value = cloneTree(snapshot.value);
  unscopedFloodPolicy.value = snapshotUnscopedPolicy.value;
  defaultRegion.value = snapshotDefaultRegion.value;
  defaultRegionInput.value = snapshotDefaultRegion.value ?? '';
  saveError.value = null;
  treeStore.setSelectedNode(null);
}

async function saveChanges(): Promise<boolean> {
  isSaving.value = true;
  saveError.value = null;
  try {
    const currentFlat = flattenTree(transportKeysData.value);
    const snapshotFlat = flattenTree(snapshot.value);

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
    if (unscopedFloodPolicy.value !== snapshotUnscopedPolicy.value) {
      await ApiService.updateUnscopedFloodPolicy(unscopedFloodPolicy.value === 'allow');
    }

    // 5. Default region
    const currentDefaultRegion = normalizeDefaultRegionInput(defaultRegionInput.value);
    if (currentDefaultRegion !== snapshotDefaultRegion.value) {
      await ApiService.updateDefaultRegion(currentDefaultRegion);
      defaultRegion.value = currentDefaultRegion;
    }

    // Reloading takes a fresh snapshot of what the server now holds.
    snapshotUnscopedPolicy.value = unscopedFloodPolicy.value;
    await loadTransportKeys();
    await systemStore.fetchStats({ fresh: true });
    treeStore.setSelectedNode(null);
    return true;
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Save failed';
    return false;
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
  isDirty,
  isSaving,
  cancelEditing,
  saveChanges,
);

defineExpose({ requestLeave, isEditing: isDirty });
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
        <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
          Region Configuration
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Manage regional key hierarchy
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          @click="addNode"
          class="cfg-btn-secondary flex items-center gap-1.5"
          :disabled="isSaving"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Region
        </button>
      </div>
    </div>

    <!-- Save Error -->
    <div v-if="saveError" class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red/opacity-heavy rounded-lg p-3">
      <p class="text-accent-red text-sm">{{ saveError }}</p>
    </div>

    <!-- Unscoped Flood Control -->
    <div class="cfg-section">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 class="text-xs sm:text-sm font-medium text-content-primary mb-1">
            Unscoped Flood Policy (*)
          </h4>
          <p class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
            Allow or Deny unscoped flood packets
          </p>
        </div>
        <div
          :class="[
            'flex bg-background-mute dark:bg-stroke/opacity-subtle rounded-lg border border-stroke-subtle dark:border-stroke/opacity-medium p-0.5 sm:p-1',
            isSaving ? 'opacity-50 pointer-events-none' : '',
          ]"
        >
          <button
            @click="handleUnscopedFloodPolicyChange('deny')"
            :class="[
              'px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded transition-colors',
              unscopedFloodPolicy === 'deny'
                ? 'bg-accent-red/opacity-medium text-accent-red border border-accent-red/opacity-heavy'
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
                ? 'bg-accent-green/opacity-medium text-accent-green border border-accent-green/opacity-heavy'
                : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
            ]"
          >
            ALLOW
          </button>
        </div>
      </div>
    </div>

    <!-- Default Region Control -->
    <div class="cfg-section">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 class="text-xs sm:text-sm font-medium text-content-primary mb-1">
            Default Region Scope
          </h4>
          <p class="text-content-secondary dark:text-content-muted text-[10px] sm:text-xs">
            Used for locally-originated flood adverts. Current: {{ defaultRegion || '<null>' }}
          </p>
        </div>
        <div class="w-full sm:w-auto sm:min-w-[320px] flex items-center gap-2">
          <input
            v-model="defaultRegionInput"
            :disabled="isSaving"
            class="cfg-input flex-1"
            placeholder="Region name or &lt;null&gt;"
          />
          <button
            @click="defaultRegionInput = ''"
            :disabled="isSaving"
            class="cfg-btn-secondary whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Regions + Discovered Regions: side by side on desktop, stacked on mobile -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
    <!-- Tree Viewer -->
    <div class="cfg-section space-y-4 h-full flex flex-col" @click="treeStore.setSelectedNode(null)">
      <div>
        <h3 class="text-lg font-semibold text-content-primary">Regions</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs mt-1">
          Regional key hierarchy carried by this repeater.
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center py-8">
        <Spinner />
        <span class="ml-2 text-content-secondary dark:text-content-muted">Loading regions…</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <div class="text-accent-red mb-2">⚠️ Error loading regions</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</div>
        <button @click="loadTransportKeys" class="cfg-btn-secondary mt-4">
          Retry
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="transportKeysData.length === 0" class="text-center py-8">
        <div class="text-content-muted mb-2">No regions found</div>
        <div class="text-content-muted/opacity-heavy text-sm">
          Click "Add Region" to get started
        </div>
      </div>

      <!-- Tree Data -->
      <template v-else>
        <div class="space-y-2 flex-1">
          <TreeNode
            v-for="node in transportKeysData"
            :key="node.id"
            :node="node"
            :selected-node-id="treeStore.selectedNodeId.value"
            :level="0"
            :unlocked="!isSaving"
            @select="selectNode"
            @edit="editNodeById"
            @delete="deleteNodeById"
          />
        </div>
        <p class="text-content-muted text-xs">
          To add a child region, click on a region to select it, then click "Add Region".
        </p>
      </template>
    </div>

      <DiscoveredRegions
        :regions="discoveredRegions"
        :loading="discoveredLoading"
        :error="discoveredError"
        :can-add="!isSaving"
        @add="addDiscoveredRegion"
        @refresh="loadDiscoveredRegions"
      />
    </div>

    <SaveBar
      :changes="regionChanges"
      :saving="isSaving"
      @save="saveChanges"
      @discard="cancelEditing"
    />

    <!-- Add Modal -->
    <KeyModal
      :show="showAddModal"
      :node="null"
      :selected-parent-id="treeStore.selectedNodeId.value || undefined"
      :all-nodes="transportKeysData"
      @close="showAddModal = false"
      @add="handleAddKey"
    />

    <!-- Edit Modal -->
    <KeyModal
      :show="showEditModal"
      :node="editingNode"
      :all-nodes="transportKeysData"
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
