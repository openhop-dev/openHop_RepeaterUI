<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import SaveBar from '@/components/ui/SaveBar.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useSettingsDraft } from '@/composables/useSettingsDraft';

const systemStore = useSystemStore();

const delaysConfig = computed(() => systemStore.stats?.config?.delays || {});

const isSaving = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const floodTxDelayInput = ref(0);
const directTxDelayInput = ref(0);

function loadForm() {
  const floodFactor = delaysConfig.value.tx_delay_factor;
  floodTxDelayInput.value = typeof floodFactor === 'number' ? floodFactor : 1.0;
  const directFactor: unknown = delaysConfig.value.direct_tx_delay_factor;
  directTxDelayInput.value = typeof directFactor === 'number' ? directFactor : 0.5;
}

const { isDirty, changes, reset } = useSettingsDraft({
  state: () => ({
    tx_delay_factor: floodTxDelayInput.value,
    direct_tx_delay_factor: directTxDelayInput.value,
  }),
  load: loadForm,
  source: delaysConfig,
  labels: {
    tx_delay_factor: 'Flood TX delay factor',
    direct_tx_delay_factor: 'Direct TX delay factor',
  },
  format: (path, value) => (path === 'tx_delay_factor' ? `${value}x` : `${value} s`),
});

function discardChanges() {
  reset();
  errorMessage.value = '';
}

async function saveChanges(): Promise<boolean> {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const response = await ApiService.post('/update_radio_config', {
      tx_delay_factor: floodTxDelayInput.value,
      direct_tx_delay_factor: directTxDelayInput.value,
    });

    const data = response.data as
      | {
          success?: boolean;
          data?: { persisted?: boolean; message?: string; error?: string };
          persisted?: boolean;
          message?: string;
          error?: string;
        }
      | undefined;
    const inner = data?.data ?? data;
    if (data?.success || inner?.persisted || inner?.message) {
      await systemStore.fetchStats();
      reset();
      successMessage.value = inner?.message || 'Settings saved successfully';
      setTimeout(() => {
        successMessage.value = '';
      }, 3000);
      return true;
    }
    errorMessage.value = inner?.error || 'Failed to save settings';
    return false;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } } };
    console.error('Failed to save delay settings:', error);
    errorMessage.value = e.response?.data?.error || 'Failed to save settings';
    return false;
  } finally {
    isSaving.value = false;
  }
}

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } =
  useUnsavedChanges(isDirty, isSaving, discardChanges, saveChanges);

defineExpose({ requestLeave, isEditing: isDirty });
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
    <div class="cfg-page-heading">
      <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
        TX Delays
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
        Configure transmission delay factors for flood and direct packets
      </p>
    </div>

    <div
      v-if="successMessage"
      role="status"
      class="bg-accent-green/opacity-light dark:bg-accent-green/opacity-medium border border-accent-green dark:border-accent-green/opacity-heavy rounded-lg p-3 text-accent-green text-sm"
    >
      {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      role="alert"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red dark:border-accent-red/opacity-heavy rounded-lg p-3 text-accent-red text-sm"
    >
      {{ errorMessage }}
    </div>

    <div class="cfg-section space-y-3">
      <label
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-3"
      >
        <span class="flex flex-col gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Flood TX Delay Factor</span
          >
          <span class="text-content-muted text-xs"
            >Scales the airtime-based random transmit window for flood packets. Higher values
            increase delay spread for collision avoidance.</span
          >
        </span>
        <input
          v-model.number="floodTxDelayInput"
          type="number"
          step="0.1"
          min="0"
          max="5"
          class="cfg-input w-full sm:w-32 flex-shrink-0 font-mono"
        />
      </label>
      <label class="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 gap-3">
        <span class="flex flex-col gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Direct TX Delay Factor</span
          >
          <span class="text-content-muted text-xs"
            >Fixed delay in seconds before transmitting direct-routed packets. Applied as-is with no
            randomisation.</span
          >
        </span>
        <input
          v-model.number="directTxDelayInput"
          type="number"
          step="0.1"
          min="0"
          max="5"
          class="cfg-input w-full sm:w-32 flex-shrink-0 font-mono"
        />
      </label>
    </div>

    <SaveBar :changes="changes" :saving="isSaving" @save="saveChanges" @discard="discardChanges" />
  </div>
</template>
