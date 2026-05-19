<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSystemStore } from '@/stores/system';
import { authClient } from '@/utils/api';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const systemStore = useSystemStore();

const delaysConfig = computed(() => systemStore.stats?.config?.delays || {});

const floodTxDelayFactor = computed(() => {
  const factor: unknown = delaysConfig.value.tx_delay_factor;
  if (typeof factor === 'number') return factor.toFixed(2) + 'x';
  if (factor && typeof factor === 'object' && 'parsedValue' in factor) {
    const value = (factor as { parsedValue?: number }).parsedValue;
    if (typeof value === 'number') return value.toFixed(2) + 'x';
  }
  return 'Not set';
});

const directTxDelayFactor = computed(() => {
  const factor: unknown = delaysConfig.value.direct_tx_delay_factor;
  return typeof factor === 'number' ? factor.toFixed(2) + 's' : 'Not set';
});

// Edit mode state
const isEditing = ref(false);
const isSaving = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

// Edit form values
const floodTxDelayInput = ref(0);
const directTxDelayInput = ref(0);

const startEditing = () => {
  // Parse current values
  const floodFactor: unknown = delaysConfig.value.tx_delay_factor;
  if (floodFactor && typeof floodFactor === 'object' && 'parsedValue' in floodFactor) {
    floodTxDelayInput.value = (floodFactor as { parsedValue?: number }).parsedValue || 1.0;
  } else if (typeof floodFactor === 'number') {
    floodTxDelayInput.value = floodFactor;
  } else {
    floodTxDelayInput.value = 1.0;
  }

  const directFactor: unknown = delaysConfig.value.direct_tx_delay_factor;
  directTxDelayInput.value = typeof directFactor === 'number' ? directFactor : 0.5;

  isEditing.value = true;
  successMessage.value = '';
  errorMessage.value = '';
};

const cancelEditing = () => {
  isEditing.value = false;
  successMessage.value = '';
  errorMessage.value = '';
};

const saveChanges = async () => {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const response = await authClient.post('/api/update_radio_config', {
      tx_delay_factor: floodTxDelayInput.value,
      direct_tx_delay_factor: directTxDelayInput.value,
    });

    const data = response.data;
    const inner = data?.data ?? data;
    if (data.success || inner.persisted || inner.message) {
      successMessage.value = inner.message || 'Settings saved successfully';
      isEditing.value = false;

      // Refresh stats to show updated values
      await systemStore.fetchStats();

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = '';
      }, 3000);
    } else {
      errorMessage.value = 'Failed to save settings';
    }
  } catch (error: any) {
    console.error('Failed to save delay settings:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to save settings';
  } finally {
    isSaving.value = false;
  }
};

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
    label="TX Delay settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">TX Delays</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure transmission delay factors for flood and direct packets</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="!isEditing"
          @click="startEditing"
          class="cfg-btn-primary"
        >
          Edit Settings
        </button>
        <template v-else>
          <button
            @click="cancelEditing"
            :disabled="isSaving"
            class="cfg-btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="saveChanges"
            :disabled="isSaving"
            class="cfg-btn-primary"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Success/Error Messages -->
    <div
      v-if="successMessage"
      class="bg-green-100 dark:bg-green-500/20 border border-green-500 dark:border-green-500/50 rounded-lg p-3 text-green-700 dark:text-green-400 text-sm"
    >
      {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      class="bg-red-100 dark:bg-red-500/20 border border-red-500 dark:border-red-500/50 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm"
    >
      {{ errorMessage }}
    </div>

    <!-- Transmission Delays Settings -->
    <div class="cfg-section space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Flood TX Delay Factor</span>
          <span class="text-content-muted dark:text-content-muted text-xs">Scales the airtime-based random transmit window for flood packets. Higher values increase delay spread for collision avoidance.</span>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm flex-shrink-0"
        >
          {{ floodTxDelayFactor }}
        </div>
        <input
          v-else
          v-model.number="floodTxDelayInput"
          type="number"
          step="0.1"
          min="0"
          max="5"
          class="cfg-input w-full sm:w-32 flex-shrink-0"
        />
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Direct TX Delay Factor</span>
          <span class="text-content-muted dark:text-content-muted text-xs">Fixed delay in seconds before transmitting direct-routed packets. Applied as-is with no randomisation.</span>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm flex-shrink-0"
        >
          {{ directTxDelayFactor }}
        </div>
        <input
          v-else
          v-model.number="directTxDelayInput"
          type="number"
          step="0.1"
          min="0"
          max="5"
          class="cfg-input w-full sm:w-32 flex-shrink-0"
        />
      </div>
    </div>
  </div>
</template>
