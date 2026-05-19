<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTreeStateStore } from '@/stores/treeState';
import type { TreeNodeData } from '@/types/tree';
import { formatTimeAgo, getTruncatedKey } from '@/utils/formatters';

interface Props {
  node: TreeNodeData;
  selectedNodeId: number | null;
  level: number;
  disabled?: boolean;
  unlocked?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [nodeId: number];
  edit: [nodeId: number];
  delete: [nodeId: number];
}>();

// Use the global tree state store
const treeStore = useTreeStateStore();

// State for showing full key
const showFullKey = ref(false);

// Use the global expanded state instead of local state
const isExpanded = computed({
  get: () => treeStore.isNodeExpanded(props.node.id),
  set: (value: boolean) => {
    if (value) {
      treeStore.addExpandedNode(props.node.id);
    } else {
      treeStore.removeExpandedNode(props.node.id);
    }
  },
});

// Memoize whether node has children to prevent unnecessary reactivity
const hasChildren = computed(() => props.node.children.length > 0);


function handleRowClick() {
  if (props.unlocked) {
    selectNode();
  }
  if (hasChildren.value) {
    toggleExpanded();
  }
}

function toggleExpanded() {
  if (hasChildren.value) {
    const newValue = !isExpanded.value;
    isExpanded.value = newValue;
  }
}

function selectNode() {
  emit('select', props.node.id);
}

function handleChildSelect(nodeId: number) {
  emit('select', nodeId);
}

function handleChildEdit(nodeId: number) {
  emit('edit', nodeId);
}

function handleChildDelete(nodeId: number) {
  emit('delete', nodeId);
}

function toggleShowFullKey(event: Event) {
  event.stopPropagation();
  showFullKey.value = !showFullKey.value;
}

function copyToClipboard(event: Event) {
  event.stopPropagation();
  if (props.node.transport_key && window.navigator?.clipboard) {
    window.navigator.clipboard.writeText(props.node.transport_key);
  }
}
</script>

<template>
  <div class="select-none">
    <!-- Node Content -->
    <div
      :class="[
        'flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-1 sm:gap-2 py-2 px-2 sm:px-3 rounded-lg border transition-colors duration-150',
        props.disabled ? 'opacity-50' : '',
        props.unlocked && selectedNodeId === node.id
          ? 'bg-primary/10 border-primary/30 text-content-primary dark:text-white'
          : 'cfg-card text-content-primary dark:text-white/80',
        props.unlocked && selectedNodeId !== node.id ? 'hover:bg-stroke-subtle/40 dark:hover:bg-white/5 hover:border-stroke dark:hover:border-white/15' : '',
        hasChildren && !props.disabled ? 'cursor-pointer' : '',
        `ml-${level * 4}`,
      ]"
      @click.stop="!props.disabled && handleRowClick()"
    >
      <!-- Expand/Collapse Arrow -->
      <div
        class="flex-shrink-0 w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center"
        @click.stop="toggleExpanded"
      >
        <svg
          v-if="hasChildren"
          :class="[
            'w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0',
          ]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <!-- Node Icon -->
      <div class="flex-shrink-0">
        <!-- Region icon (hashtag) for names starting with # -->
        <svg
          v-if="props.node.name.startsWith('#')"
          class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary"
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
        <!-- Private key icon for all other names -->
        <svg
          v-else
          class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-green"
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
      </div>

      <!-- Node Name -->
      <span
        :class="[
          'font-mono text-xs sm:text-sm transition-colors duration-200 break-all',
          selectedNodeId === node.id ? 'text-primary font-medium' : '',
        ]"
      >
        {{ node.name.startsWith('#') ? node.name.slice(1) : node.name }}
      </span>

      <!-- Transport Key Display -->
      <div v-if="node.transport_key" class="hidden sm:flex items-center gap-1 ml-2">
        <div class="relative group">
          <!-- Key Icon with tooltip -->
          <button
            @click="toggleShowFullKey"
            class="p-1 rounded hover:bg-stroke-subtle dark:hover:bg-white/10 transition-colors"
            :title="showFullKey ? 'Hide full key' : 'Show full key'"
          >
            <svg
              class="w-3 h-3 text-content-muted dark:text-white/60 hover:text-content-secondary dark:hover:text-white/80"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>

          <!-- Truncated key display -->
          <span
            v-if="!showFullKey"
            class="text-xs font-mono text-content-secondary dark:text-white/50 bg-stroke-subtle/40 dark:bg-white/5 px-1.5 py-0.5 rounded border border-stroke-subtle dark:border-white/10"
          >
            {{ getTruncatedKey(node.transport_key) }}
          </span>

          <!-- Full key display - improved popup -->
          <div
            v-if="showFullKey"
            class="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md"
            @click="showFullKey = false"
          >
            <div
              class="bg-black/20 border border-white/20 rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4"
              @click.stop
            >
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-semibold text-white">Transport Key</h3>
                <button
                  @click="showFullKey = false"
                  class="text-white/60 hover:text-white transition-colors"
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

              <div class="bg-black/20 border border-white/10 rounded-md p-4 mb-4">
                <div class="text-sm font-mono text-white/80 break-all leading-relaxed">
                  {{ node.transport_key }}
                </div>
              </div>

              <div class="flex justify-end">
                <button
                  @click="copyToClipboard"
                  class="btn-success flex items-center gap-2"
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
                  Copy Key
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Last Used Display and Flood Policy Container -->
      <div class="flex items-center gap-2 sm:gap-3 ml-auto flex-shrink-0">
        <!-- Last Heard -->
        <div v-if="node.last_used" class="hidden sm:flex items-center gap-1">
          <span class="text-xs text-content-muted dark:text-white/40">Last Heard:</span>
          <span class="text-xs text-content-secondary dark:text-white/50" :title="node.last_used.toLocaleString()">
            {{ formatTimeAgo(node.last_used) }}
          </span>
        </div>
        <div v-else class="hidden sm:flex items-center gap-1">
          <span class="text-xs text-content-muted dark:text-white/30">Last Heard:</span>
          <span class="text-xs text-content-muted dark:text-white/30 italic">Never</span>
        </div>

        <!-- Flood Policy -->
        <span
          :class="[
            'text-[10px] sm:text-xs',
            node.floodPolicy === 'allow' ? 'text-accent-green/80' : 'text-accent-red/80',
          ]"
        >
          Flood: {{ node.floodPolicy === 'allow' ? 'Allow' : 'Deny' }}
        </span>

        <!-- Inline Edit / Delete (unlocked mode) -->
        <template v-if="props.unlocked">
          <button
            @click.stop="emit('edit', node.id)"
            class="px-2 py-0.5 text-[10px] sm:text-xs bg-primary/10 hover:bg-primary/20 text-content-secondary dark:text-content-muted rounded border border-primary/30 transition-colors whitespace-nowrap"
          >
            Edit
          </button>
          <button
            @click.stop="emit('delete', node.id)"
            class="p-1 text-accent-red/50 hover:text-accent-red transition-colors"
            title="Delete"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </template>

        <!-- Children Count Badge -->
        <span
          v-if="hasChildren && !props.unlocked"
          class="hidden sm:inline-block px-2 py-1 bg-stroke-subtle dark:bg-white/10 text-content-secondary dark:text-white/60 text-xs rounded-full ml-1"
        >
          {{ node.children.length }}
        </span>
      </div>
    </div>

    <!-- Children (Recursive) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 max-h-0 overflow-hidden"
      enter-to-class="opacity-100 max-h-screen overflow-visible"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="opacity-100 max-h-screen overflow-visible"
      leave-to-class="opacity-0 max-h-0 overflow-hidden"
    >
      <div v-if="isExpanded && node.children.length > 0" class="space-y-1">
        <TreeNode
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :selected-node-id="selectedNodeId"
          :level="level + 1"
          :disabled="props.disabled"
          :unlocked="props.unlocked"
          @select="handleChildSelect"
          @edit="handleChildEdit"
          @delete="handleChildDelete"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Custom indentation classes */
.ml-0 {
  margin-left: 0rem;
}
.ml-4 {
  margin-left: 1rem;
}
.ml-8 {
  margin-left: 2rem;
}
.ml-12 {
  margin-left: 3rem;
}
.ml-16 {
  margin-left: 4rem;
}
.ml-20 {
  margin-left: 5rem;
}
.ml-24 {
  margin-left: 6rem;
}
.ml-28 {
  margin-left: 7rem;
}
.ml-32 {
  margin-left: 8rem;
}
</style>
