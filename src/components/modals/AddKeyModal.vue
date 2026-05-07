<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  show: boolean;
  selectedNodeName?: string;
  selectedNodeId?: number;
}

interface Emits {
  (e: 'close'): void;
  (e: 'add', data: { name: string; floodPolicy: 'allow' | 'deny'; parentId?: number }): void;
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

// Form validation
const isValid = computed(() => {
  return keyName.value.trim().length > 0;
});

// Handle form submission
const handleAdd = () => {
  if (!isValid.value) return;

  const finalName = isRegion.value ? `#${keyName.value.trim()}` : keyName.value.trim();
  emit('add', {
    name: finalName,
    floodPolicy: floodPolicy.value,
    parentId: props.selectedNodeId,
  });

  keyName.value = '';
  floodPolicy.value = 'allow';
  entryType.value = 'region';
};

// Handle cancel
const handleCancel = () => {
  keyName.value = '';
  floodPolicy.value = 'allow';
  entryType.value = 'region';
  emit('close');
};

// Handle backdrop click
const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    handleCancel();
  }
};
</script>

<template>
  <!-- Modal Backdrop -->
  <div
    v-if="show"
    @click="handleBackdropClick"
    class="fixed inset-0 bg-black/40 backdrop-blur-lg z-[99999] flex items-center justify-center p-4"
    style="
      backdrop-filter: blur(8px) saturate(180%);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    "
  >
    <!-- Modal Content -->
    <div
      class="bg-white dark:bg-surface-elevated backdrop-blur-xl rounded-[20px] p-6 w-full max-w-md border border-stroke-subtle dark:border-white/10"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
            Add New Entry
          </h3>
          <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
            <span v-if="props.selectedNodeName">
              Add to: <span class="text-primary font-mono">{{ props.selectedNodeName }}</span>
            </span>
            <span v-else> Add to root level (#uk) </span>
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
      <form @submit.prevent="handleAdd" class="space-y-5">
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
          <label for="keyName" class="block text-sm font-medium text-content-primary dark:text-content-primary mb-2">
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
                : 'bg-background-mute dark:bg-stroke/5 border border-stroke-subtle dark:border-stroke/20 text-content-muted dark:text-content-muted cursor-not-allowed',
            ]"
          >
            Add {{ keyType.type }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
