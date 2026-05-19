<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import { sha256 } from '@noble/hashes/sha2.js';
import type { TreeNodeData } from '@/types/tree';
import { formatTimeAgo } from '@/utils/formatters';

interface Props {
  show: boolean;
  node: TreeNodeData | null;
}

interface Emits {
  (e: 'close'): void;
  (e: 'save', data: { id: number; name: string; floodPolicy: 'allow' | 'deny'; transportKey?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Form state
const keyName = ref('');
const floodPolicy = ref<'allow' | 'deny'>('allow');
const entryType = ref<'region' | 'privateKey'>('region');

const isRegion = computed(() => entryType.value === 'region');

const keyType = computed(() => ({
  type: isRegion.value ? 'Region' : 'Private Key',
  description: isRegion.value ? 'Regional organisational key' : 'Individual assigned key',
}));

// Watch for node changes to populate form
watch(
  () => props.node,
  (newNode) => {
    if (newNode) {
      const nameIsRegion = newNode.name.startsWith('#');
      entryType.value = nameIsRegion ? 'region' : 'privateKey';
      // Strip the # prefix so the user sees just the name
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

// Form validation
const isValid = computed(() => {
  return keyName.value.trim().length > 0 && props.node;
});

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

// Derive transport key client-side: SHA-256(#name)[:16] → base64
// Matches pymc_core get_auto_key_for algorithm
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
  const name = keyName.value.trim();
  if (!isRegion.value || !name) {
    liveTransportKey.value = null;
    return;
  }
  liveTransportKey.value = deriveTransportKey(name);
});

// Copy to clipboard function
const copyToClipboard = (text: string) => {
  if (window.navigator?.clipboard) {
    window.navigator.clipboard.writeText(text);
  }
};

// Handle form submission
const handleSave = () => {
  if (!isValid.value || !props.node) return;

  const finalName = isRegion.value ? `#${keyName.value.trim()}` : keyName.value.trim();
  const transportKey = isRegion.value && nameChanged.value
    ? (liveTransportKey.value ?? deriveTransportKey(keyName.value.trim()))
    : undefined;

  emit('save', {
    id: props.node.id,
    name: finalName,
    floodPolicy: floodPolicy.value,
    transportKey,
  });

  handleCancel();
};

// Handle cancel
const handleCancel = () => {
  emit('close');
};

</script>

<template>
  <Teleport to="body">
  <!-- Modal Backdrop -->
  <div
    v-if="show"
    @click.self="handleCancel()"
    class="modal-backdrop"
  >
    <!-- Modal Content -->
    <div
      class="modal-card max-w-lg"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
            Edit Entry
          </h3>
          <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
            Modify <span class="text-primary font-mono">{{ liveDisplayName }}</span>
          </p>
        </div>
        <button @click="handleCancel" class="text-white/60 hover:text-white transition-colors">
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

      <!-- Form -->
      <form @submit.prevent="handleSave" class="space-y-5">
        <!-- Entry Type Toggle -->
        <div class="pb-2">
          <label class="block text-sm font-medium text-content-primary dark:text-content-primary mb-2">
            Entry Type
          </label>
          <div class="flex bg-background-mute dark:bg-stroke/5 rounded-lg border border-stroke-subtle dark:border-stroke/20 p-0.5">
            <button
              type="button"
              @click="entryType = 'region'"
              :class="[
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                entryType === 'region'
                  ? 'bg-secondary/20 text-secondary border border-secondary/50'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              REGION
            </button>
            <button
              type="button"
              @click="entryType = 'privateKey'"
              :class="[
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                entryType === 'privateKey'
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/50'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              PRIVATE KEY
            </button>
          </div>
        </div>

        <!-- Key Name Input -->
        <div>
          <label
            for="keyName"
            class="block text-sm font-medium text-content-primary dark:text-content-primary mb-2"
          >
            {{ keyType.type }} Name
          </label>
          <div class="flex items-center">
            <span v-if="isRegion" class="px-3 py-3 bg-secondary/10 border border-r-0 border-secondary/30 rounded-l-lg text-secondary text-sm font-mono">#</span>
            <input
              id="keyName"
              v-model="keyName"
              type="text"
              :placeholder="isRegion ? 'e.g., uk, au, us' : 'Enter key name'"
              :class="[
                'flex-1 px-4 py-3 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/20 text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors',
                isRegion ? 'rounded-r-lg' : 'rounded-lg',
              ]"
              autocomplete="off"
            />
          </div>
          <p v-if="isRegion" class="text-content-muted dark:text-content-muted text-xs mt-1">
            The # prefix is added automatically for regions.
          </p>
          <!-- Transport key inline, only when editing a region -->
          <div
            v-if="isRegion && node?.transport_key"
            class="mt-3 bg-background-mute dark:bg-black/20 border border-stroke-subtle dark:border-stroke/10 rounded-md p-3"
          >
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-medium text-content-secondary dark:text-content-muted">Transport Key</span>
              <button
                v-if="!nameChanged"
                type="button"
                @click="copyToClipboard(node.transport_key || '')"
                class="text-xs text-accent-green hover:text-accent-green/80 flex items-center gap-1"
                title="Copy to clipboard"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>
            <div class="text-xs font-mono text-content-primary dark:text-content-primary/80 break-all">
              {{ liveTransportKey ?? node.transport_key }}
            </div>
            <div v-if="nameChanged" class="text-xs text-amber-500 dark:text-amber-400 mt-1">
              Updated for "{{ liveDisplayName }}"
            </div>
          </div>
        </div>

        <!-- Last Used (if present) -->
        <div
          v-if="node?.last_used"
          class="mt-1 bg-gray-50 dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg p-3"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-sm font-medium text-content-primary dark:text-content-primary">Last Used</span>
            </div>
            <div class="text-right">
              <div class="text-sm text-content-secondary dark:text-content-muted">
                {{ node.last_used.toLocaleDateString() }} at {{ node.last_used.toLocaleTimeString() }}
              </div>
              <div class="text-xs text-content-muted dark:text-content-muted">{{ formatTimeAgo(node.last_used) }}</div>
            </div>
          </div>
        </div>

        <!-- Flood Policy -->
        <div class="pt-1 border-t border-stroke-subtle dark:border-stroke/10">
          <label class="block text-sm font-medium text-content-primary dark:text-content-primary mb-3 pt-4">
            Flood Policy
          </label>

          <div class="flex bg-background-mute dark:bg-stroke/5 rounded-lg border border-stroke-subtle dark:border-stroke/20 p-0.5">
            <button
              type="button"
              @click="floodPolicy = 'allow'"
              :class="[
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                floodPolicy === 'allow'
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              ALLOW
            </button>
            <button
              type="button"
              @click="floodPolicy = 'deny'"
              :class="[
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                floodPolicy === 'deny'
                  ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                  : 'text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-secondary',
              ]"
            >
              DENY
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-4">
          <button
            type="button"
            @click="handleCancel"
            class="flex-1 px-4 py-3 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/20 text-content-primary dark:text-content-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!isValid"
            :class="[
              'flex-1 px-4 py-3 rounded-lg transition-colors font-medium',
              isValid
                ? 'bg-accent-green/20 hover:bg-accent-green/30 border border-accent-green/50 text-accent-green'
                : 'bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/20 text-content-muted dark:text-content-muted/70 cursor-not-allowed',
            ]"
          >
            Done
          </button>
        </div>
      </form>
    </div>
  </div>
  </Teleport>
</template>
