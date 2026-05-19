<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TreeNodeData } from '@/types/tree';

interface Props {
  show: boolean;
  node: TreeNodeData | null;
  allNodes: TreeNodeData[];
}

interface Emits {
  (e: 'close'): void;
  (e: 'delete-all', nodeId: number): void;
  (e: 'move-children', data: { nodeId: number; targetParentId: number }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectedMoveTarget = ref<number | null>(null);
const searchQuery = ref('');

// Get all children recursively
const getAllChildren = (node: TreeNodeData): TreeNodeData[] => {
  const children: TreeNodeData[] = [];

  const collectChildren = (currentNode: TreeNodeData) => {
    for (const child of currentNode.children) {
      children.push(child);
      collectChildren(child);
    }
  };

  collectChildren(node);
  return children;
};

// Get all children of the node to be deleted
const childrenToAffect = computed(() => {
  if (!props.node) return [];
  return getAllChildren(props.node);
});

// Get potential move targets (regions only, excluding the node being deleted and its descendants)
const moveTargets = computed(() => {
  if (!props.node) return [];

  const excludeIds = new Set([props.node.id, ...childrenToAffect.value.map((n) => n.id)]);

  const getRegions = (nodes: TreeNodeData[]): TreeNodeData[] => {
    const regions: TreeNodeData[] = [];

    for (const node of nodes) {
      if (node.name.startsWith('#') && !excludeIds.has(node.id)) {
        regions.push(node);
      }
      if (node.children.length > 0) {
        regions.push(...getRegions(node.children));
      }
    }

    return regions;
  };

  return getRegions(props.allNodes);
});

// Filtered move targets based on search
const filteredMoveTargets = computed(() => {
  if (!searchQuery.value.trim()) return moveTargets.value;

  const query = searchQuery.value.toLowerCase();
  return moveTargets.value.filter((target) => target.name.toLowerCase().includes(query));
});

// Handle delete all
const handleDeleteAll = () => {
  if (!props.node) return;
  emit('delete-all', props.node.id);
  handleClose();
};

// Handle move children
const handleMoveChildren = () => {
  if (!props.node || !selectedMoveTarget.value) return;
  emit('move-children', {
    nodeId: props.node.id,
    targetParentId: selectedMoveTarget.value,
  });
  handleClose();
};

// Handle cancel
const handleClose = () => {
  selectedMoveTarget.value = null;
  searchQuery.value = '';
  emit('close');
};

</script>

<template>
  <Teleport to="body">
  <!-- Modal Backdrop -->
  <div
    v-if="show && node"
    @click.self="handleClose()"
    class="modal-backdrop-heavy"
  >
    <!-- Modal Content -->
    <div
      class="modal-card max-w-lg"
    >
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <svg class="w-6 h-6 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
            Confirm Deletion
          </h3>
          <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
            Deleting <span class="text-accent-red font-mono">{{ node?.name }}</span>
          </p>
        </div>
        <button
          @click="handleClose"
          class="ml-auto text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Children Warning -->
      <div
        v-if="childrenToAffect.length > 0"
        class="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 mb-6"
      >
        <div class="flex items-start gap-3">
          <svg
            class="w-5 h-5 text-accent-red flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div class="flex-1">
            <h4 class="text-accent-red font-medium text-sm mb-2">
              This will affect {{ childrenToAffect.length }} child
              {{ childrenToAffect.length === 1 ? 'entry' : 'entries' }}:
            </h4>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              <div
                v-for="child in childrenToAffect.slice(0, 10)"
                :key="child.id"
                class="flex items-center gap-2 text-xs text-content-secondary dark:text-content-primary/80"
              >
                <svg
                  v-if="child.name.startsWith('#')"
                  class="w-3 h-3 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                <svg
                  v-else
                  class="w-3 h-3 text-accent-green"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                  />
                </svg>
                <span class="font-mono">{{ child.name }}</span>
                <span
                  class="px-1 py-0.5 text-xs rounded"
                  :class="
                    child.floodPolicy === 'allow'
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'bg-accent-red/20 text-accent-red'
                  "
                >
                  {{ child.floodPolicy }}
                </span>
              </div>
              <div
                v-if="childrenToAffect.length > 10"
                class="text-content-secondary dark:text-content-muted text-xs"
              >
                ...and {{ childrenToAffect.length - 10 }} more
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Move Option (only show if there are children and available targets) -->
      <div v-if="childrenToAffect.length > 0 && moveTargets.length > 0" class="mb-6">
        <h4 class="text-content-primary dark:text-content-primary font-medium text-sm mb-3">
          Move children to another region:
        </h4>

        <!-- Search Input -->
        <div class="mb-3">
          <div class="relative">
            <svg
              class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-content-muted dark:text-content-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search regions..."
              class="w-full pl-9 pr-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/20 rounded-lg text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors text-sm"
            />
          </div>
        </div>

        <!-- Region List -->
        <div
          class="space-y-2 max-h-40 overflow-y-auto border border-stroke-subtle dark:border-stroke/20 rounded-lg p-3 bg-gray-50 dark:bg-white/5"
        >
          <div
            v-if="filteredMoveTargets.length === 0"
            class="text-center py-4 text-content-secondary dark:text-content-muted text-sm"
          >
            {{ searchQuery ? 'No regions match your search' : 'No available regions' }}
          </div>
          <label
            v-for="target in filteredMoveTargets"
            :key="target.id"
            class="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-stroke-subtle dark:hover:bg-white/10 transition-colors group"
          >
            <!-- Custom Radio Button -->
            <div class="relative">
              <input
                type="radio"
                :value="target.id"
                v-model="selectedMoveTarget"
                class="sr-only peer"
              />
              <div
                class="w-4 h-4 border-2 border-stroke dark:border-stroke/30 rounded-full group-hover:border-stroke dark:group-hover:border-stroke/50 peer-checked:border-primary peer-checked:bg-primary/20 transition-all"
              >
                <div
                  class="w-2 h-2 rounded-full bg-primary scale-0 peer-checked:scale-100 transition-transform absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                ></div>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-1">
              <svg
                class="w-4 h-4 text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
              <span class="text-content-primary dark:text-content-primary font-mono text-sm">{{
                target.name
              }}</span>

              <!-- Children count badge -->
              <span
                v-if="target.children.length > 0"
                class="ml-auto px-2 py-0.5 bg-background-mute dark:bg-stroke/10 text-content-secondary dark:text-content-muted text-xs rounded-full"
              >
                {{ target.children.length }}
              </span>
            </div>
          </label>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <button
          @click="handleClose"
          class="flex-1 px-4 py-3 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/20 text-content-primary dark:text-content-primary rounded-lg transition-colors"
        >
          Cancel
        </button>

        <!-- Move Button (only show if children exist and target selected) -->
        <button
          v-if="childrenToAffect.length > 0 && selectedMoveTarget"
          @click="handleMoveChildren"
          class="modal-btn-primary"
        >
          Move & Delete
        </button>

        <!-- Delete All Button -->
        <button
          @click="handleDeleteAll"
          class="modal-btn-danger"
        >
          {{ childrenToAffect.length > 0 ? 'Delete All' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
