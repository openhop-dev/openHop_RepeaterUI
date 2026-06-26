<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import { useCopyToClipboard } from '@/composables/useCopyToClipboard';
import CopyLabel from '@/components/ui/CopyLabel.vue';
import { sha256 } from '@noble/hashes/sha2.js';
import type { TreeNodeData } from '@/types/tree';
import { formatTimeAgo } from '@/utils/formatters';

defineOptions({ name: 'KeyModal' })

interface Props {
  show: boolean;
  node: TreeNodeData | null;
  selectedParentId?: number;
  allNodes: TreeNodeData[];
}

interface Emits {
  (e: 'close'): void;
  (e: 'add', data: { name: string; floodPolicy: 'allow' | 'deny'; parentId?: number }): void;
  (e: 'save', data: { id: number; name: string; floodPolicy: 'allow' | 'deny'; transportKey?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isAddMode = computed(() => props.node === null);

// ── Form state ────────────────────────────────────────────────────────────────

const keyName = ref('');
const floodPolicy = ref<'allow' | 'deny'>('allow');
const entryType = ref<'region' | 'privateKey'>('region');

const isRegion = computed(() => entryType.value === 'region');

const keyType = computed(() => ({
  type: isRegion.value ? 'Region' : 'Private Key',
}));

watch(
  () => props.node,
  (newNode) => {
    if (newNode) {
      const nameIsRegion = newNode.name.startsWith('#');
      entryType.value = nameIsRegion ? 'region' : 'privateKey';
      keyName.value = nameIsRegion ? newNode.name.slice(1) : newNode.name;
      floodPolicy.value = newNode.floodPolicy;
    } else {
      keyName.value = '';
      floodPolicy.value = 'allow';
      entryType.value = 'region';
    }
  },
  { immediate: true },
);

// ── Parent path ───────────────────────────────────────────────────────────────

function findNodeById(nodes: TreeNodeData[], id: number): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function buildPath(nodes: TreeNodeData[], targetId: number): TreeNodeData[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    const sub = buildPath(node.children, targetId);
    if (sub.length) return [node, ...sub];
  }
  return [];
}

const parentPath = computed((): TreeNodeData[] => {
  const parentId = isAddMode.value ? props.selectedParentId : props.node?.parent_id;
  if (!parentId) return [];
  return buildPath(props.allNodes, parentId);
});

// ── Edit-mode helpers ─────────────────────────────────────────────────────────

const liveDisplayName = computed(() => {
  const name = keyName.value.trim();
  if (!name) return props.node?.name || '';
  return isRegion.value ? `#${name}` : name;
});

const originalKeyName = computed(() => {
  if (!props.node) return '';
  return props.node.name.startsWith('#') ? props.node.name.slice(1) : props.node.name;
});

const nameChanged = computed(() => keyName.value.trim() !== originalKeyName.value);

function deriveTransportKey(name: string): string {
  const fullName = name.startsWith('#') ? name : `#${name}`;
  const data = new TextEncoder().encode(fullName);
  const bytes = sha256(data).slice(0, 16);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

const liveTransportKey = ref<string | null>(null);

watchEffect(() => {
  if (isAddMode.value) { liveTransportKey.value = null; return; }
  const name = keyName.value.trim();
  if (!isRegion.value || !name) { liveTransportKey.value = null; return; }
  liveTransportKey.value = deriveTransportKey(name);
});

const { copy: copyToClipboard, copied: keyCopied } = useCopyToClipboard();;

// ── Validation ────────────────────────────────────────────────────────────────

const isValid = computed(() => {
  if (isAddMode.value) return keyName.value.trim().length > 0;
  return keyName.value.trim().length > 0 && props.node !== null;
});

// ── Handlers ──────────────────────────────────────────────────────────────────

const handleSubmit = () => {
  if (!isValid.value) return;
  const finalName = isRegion.value ? `#${keyName.value.trim()}` : keyName.value.trim();

  if (isAddMode.value) {
    emit('add', {
      name: finalName,
      floodPolicy: floodPolicy.value,
      parentId: props.selectedParentId,
    });
    keyName.value = '';
    floodPolicy.value = 'allow';
    entryType.value = 'region';
  } else {
    const transportKey = isRegion.value && nameChanged.value
      ? (liveTransportKey.value ?? deriveTransportKey(keyName.value.trim()))
      : undefined;
    emit('save', {
      id: props.node!.id,
      name: finalName,
      floodPolicy: floodPolicy.value,
      transportKey,
    });
    emit('close');
  }
};

const handleCancel = () => {
  if (isAddMode.value) {
    keyName.value = '';
    floodPolicy.value = 'allow';
    entryType.value = 'region';
  }
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-backdrop" @click.self="handleCancel">
      <div class="modal-card" :class="isAddMode ? 'max-w-md' : 'max-w-lg'">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-xl font-semibold text-content-primary">
              {{ isAddMode ? 'Add New Entry' : 'Edit Entry' }}
            </h3>
            <p v-if="!isAddMode" class="text-content-secondary dark:text-content-muted text-sm mt-1">
              Modify <span class="text-primary font-mono">{{ liveDisplayName }}</span>
            </p>
          </div>
          <button @click="handleCancel" class="text-content-muted hover:text-content-primary transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Parent context -->
        <div v-if="parentPath.length > 0" class="mb-4 text-sm text-content-secondary dark:text-content-muted">
          <span>{{ isAddMode ? 'Adding under:' : 'Parent:' }}</span>
          <span v-for="(ancestor, i) in parentPath" :key="ancestor.id">
            <span class="text-content-muted"> / </span>
            <span :class="i === parentPath.length - 1 ? 'text-primary font-mono' : 'font-mono'">{{ ancestor.name }}</span>
          </span>
        </div>
        <div v-else-if="isAddMode" class="mb-4 text-sm text-content-secondary dark:text-content-muted">
          Adding at root level
        </div>

        <!-- Form -->
        <form @submit.prevent="handleSubmit" class="modal-form">
          <!-- Entry Type Toggle -->
          <div class="pb-2">
            <label class="modal-field-label">Entry Type</label>
            <div class="flex bg-background-mute dark:bg-stroke/opacity-subtle rounded-lg border border-stroke-subtle dark:border-stroke/opacity-medium p-0.5">
              <button
                type="button"
                @click="entryType = 'region'"
                :class="[
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                  entryType === 'region'
                    ? 'bg-secondary/opacity-medium text-secondary border border-secondary/opacity-heavy'
                    : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
                ]"
              >REGION</button>
              <button
                type="button"
                @click="entryType = 'privateKey'"
                :class="[
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                  entryType === 'privateKey'
                    ? 'bg-accent-green/opacity-medium text-accent-green border border-accent-green/opacity-heavy'
                    : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
                ]"
              >PRIVATE KEY</button>
            </div>
          </div>

          <!-- Key Name -->
          <div>
            <label class="modal-field-label">{{ keyType.type }} Name</label>
            <div class="flex items-center">
              <span v-if="isRegion" class="px-3 py-2 bg-secondary/opacity-light border border-r-0 border-secondary/opacity-medium rounded-l-md text-secondary text-sm font-mono">#</span>
              <input
                v-model="keyName"
                type="text"
                :placeholder="isRegion ? 'e.g., uk, au, us' : 'Enter key name'"
                :class="['modal-input', isRegion ? 'rounded-l-none' : '']"
                autocomplete="off"
              />
            </div>
            <p v-if="isRegion" class="text-content-muted text-xs mt-1">
              The # prefix is added automatically for regions.
            </p>

            <!-- Transport key (edit mode, region only) -->
            <div v-if="!isAddMode && isRegion && node?.transport_key" class="mt-3">
              <div class="flex items-center justify-between mb-1">
                <span class="modal-field-label mb-0 mt-0">Transport Key</span>
                <button
                  v-if="!nameChanged"
                  type="button"
                  @click="copyToClipboard(node.transport_key || '')"
                  :class="['text-xs flex items-center gap-1 transition-colors', keyCopied ? 'text-accent-green' : 'text-content-muted hover:text-accent-green']"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <CopyLabel :copied="keyCopied" />
                </button>
              </div>
              <input
                :value="liveTransportKey ?? node.transport_key"
                readonly
                class="modal-input-readonly w-full text-xs"
              />
              <p v-if="nameChanged" class="text-xs text-accent-amber mt-1">
                Updated for "{{ liveDisplayName }}"
              </p>
            </div>
          </div>

          <!-- Last Used (edit mode) -->
          <div v-if="!isAddMode && node?.last_used" class="bg-background-mute dark:bg-white/opacity-light border border-stroke-subtle dark:border-stroke/opacity-light rounded-lg p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-sm font-medium text-content-primary">Last Used</span>
              </div>
              <div class="text-right">
                <div class="text-sm text-content-secondary dark:text-content-muted">
                  {{ node.last_used.toLocaleDateString() }} at {{ node.last_used.toLocaleTimeString() }}
                </div>
                <div class="text-xs text-content-muted">{{ formatTimeAgo(node.last_used) }}</div>
              </div>
            </div>
          </div>

          <!-- Flood Policy -->
          <div class="pt-1 border-t border-stroke-subtle dark:border-stroke/opacity-light">
            <label class="modal-field-label pt-4">Flood Policy</label>
            <div class="flex bg-background-mute dark:bg-stroke/opacity-subtle rounded-lg border border-stroke-subtle dark:border-stroke/opacity-medium p-0.5">
              <button
                type="button"
                @click="floodPolicy = 'allow'"
                :class="[
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                  floodPolicy === 'allow'
                    ? 'bg-accent-green/opacity-light text-accent-green border border-accent-green/opacity-medium'
                    : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
                ]"
              >ALLOW</button>
              <button
                type="button"
                @click="floodPolicy = 'deny'"
                :class="[
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                  floodPolicy === 'deny'
                    ? 'bg-accent-red/opacity-light text-accent-red border border-accent-red/opacity-medium'
                    : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
                ]"
              >DENY</button>
            </div>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" class="modal-btn-cancel" @click="handleCancel">Cancel</button>
            <button
              type="submit"
              :disabled="!isValid"
              :class="[
                'flex-1 px-4 py-3 rounded-lg transition-colors font-medium',
                isValid
                  ? 'bg-accent-green/opacity-medium hover:bg-accent-green/opacity-medium border border-accent-green/opacity-heavy text-accent-green'
                  : 'bg-background-mute dark:bg-stroke/opacity-subtle border border-stroke-subtle dark:border-stroke/opacity-medium text-content-muted cursor-not-allowed',
              ]"
            >
              {{ isAddMode ? `Add ${keyType.type}` : 'Done' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
