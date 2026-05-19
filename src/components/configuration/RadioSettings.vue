<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import apiClient from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const router = useRouter();
const systemStore = useSystemStore();

const radioConfig = computed(() => systemStore.stats?.config?.radio || {});
const cadConfig = computed(() => (systemStore.stats?.config?.radio as any)?.cad ?? {});

// Editable form values
const isEditing = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
const showRestartModal = ref(false);

// Form values (in user-friendly units)
const frequencyMHz = ref(0);
const spreadingFactor = ref(0);
const bandwidthKHz = ref(0);
const txPower = ref(0);
const codingRate = ref(0);
const preambleLength = ref(0);

// Bandwidth options (in kHz)
const bandwidthOptions = [
  { value: 7.8, label: '7.8 kHz' },
  { value: 10.4, label: '10.4 kHz' },
  { value: 15.6, label: '15.6 kHz' },
  { value: 20.8, label: '20.8 kHz' },
  { value: 31.25, label: '31.25 kHz' },
  { value: 41.7, label: '41.7 kHz' },
  { value: 62.5, label: '62.5 kHz' },
  { value: 125, label: '125 kHz' },
  { value: 250, label: '250 kHz' },
  { value: 500, label: '500 kHz' },
];

// Load current values into form
watch(
  radioConfig,
  (config) => {
    if (config && !isEditing.value) {
      frequencyMHz.value = config.frequency ? Number((config.frequency / 1000000).toFixed(3)) : 0;
      spreadingFactor.value = config.spreading_factor ?? 0;
      bandwidthKHz.value = config.bandwidth ? Number((config.bandwidth / 1000).toFixed(1)) : 0;
      txPower.value = config.tx_power ?? 0;
      codingRate.value = config.coding_rate ?? 0;
      preambleLength.value = config.preamble_length ?? 0;
    }
  },
  { immediate: true },
);

// Formatted display values
const formattedFrequency = computed(() => {
  const freq = radioConfig.value.frequency;
  return freq ? (freq / 1000000).toFixed(3) + ' MHz' : 'Not set';
});

const formattedBandwidth = computed(() => {
  const bw = radioConfig.value.bandwidth;
  return bw ? (bw / 1000).toFixed(1) + ' kHz' : 'Not set';
});

const formattedTxPower = computed(() => {
  const power = radioConfig.value.tx_power;
  return power !== undefined ? power + ' dBm' : 'Not set';
});

const formattedCodingRate = computed(() => {
  const cr = radioConfig.value.coding_rate;
  return cr ? '4/' + cr : 'Not set';
});

const formattedPreambleLength = computed(() => {
  const preamble = radioConfig.value.preamble_length;
  return preamble ? preamble + ' symbols' : 'Not set';
});

const formattedSpreadingFactor = computed(() => {
  return radioConfig.value.spreading_factor ?? 'Not set';
});

const startEditing = () => {
  isEditing.value = true;
  error.value = null;
};

const cancelEditing = () => {
  isEditing.value = false;
  error.value = null;
  const config = radioConfig.value;
  frequencyMHz.value = config.frequency ? Number((config.frequency / 1000000).toFixed(3)) : 0;
  spreadingFactor.value = config.spreading_factor ?? 0;
  bandwidthKHz.value = config.bandwidth ? Number((config.bandwidth / 1000).toFixed(1)) : 0;
  txPower.value = config.tx_power ?? 0;
  codingRate.value = config.coding_rate ?? 0;
  preambleLength.value = config.preamble_length ?? 0;
};

const saveChanges = async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
  isSaving.value = true;
  error.value = null;

  try {
    const payload: Record<string, number> = {};

    if (frequencyMHz.value) payload.frequency = frequencyMHz.value * 1000000;
    if (spreadingFactor.value) payload.spreading_factor = spreadingFactor.value;
    if (bandwidthKHz.value) payload.bandwidth = bandwidthKHz.value * 1000;
    if (txPower.value) payload.tx_power = txPower.value;
    if (codingRate.value) payload.coding_rate = codingRate.value;

    const response = await apiClient.post('/update_radio_config', payload);
    const data = response.data as any;

    if (data.message || data.persisted) {
      isEditing.value = false;
      await systemStore.fetchStats();
      if (!silent) showRestartModal.value = true;
      return true;
    } else if (data.error) {
      error.value = data.error;
    } else {
      error.value = 'Unknown response from server';
    }
  } catch (err: unknown) {
    console.error('Failed to update radio settings:', err);
    const e = err as { response?: { data?: { error?: string } } };
    error.value = e.response?.data?.error || 'Failed to update settings';
  } finally {
    isSaving.value = false;
  }
  return false;
};

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  isSaving,
  cancelEditing,
  () => saveChanges(),
);

defineExpose({ requestLeave, isEditing });

</script>

<template>
  <RestartModal
    v-model="showRestartModal"
    title="Radio Settings Changes require a restart."
    message="Restart Now?"
  />

  <UnsavedChangesModal
    :show="showUnsavedModal"
    :is-saving="isSaving"
    label="Radio Settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Radio Settings</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure LoRa radio parameters and frequency presets</p>
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
            @click="saveChanges()"
            :disabled="isSaving"
            class="cfg-btn-primary"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-100 dark:bg-red-500/20 border border-red-500/50 rounded-lg p-3">
      <p class="text-red-600 dark:text-red-400 text-sm">{{ error }}</p>
    </div>

    <!-- Radio Settings -->
    <div class="cfg-section space-y-3">
      <!-- Frequency -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Frequency</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ formattedFrequency }}
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="frequencyMHz"
            type="number"
            step="0.001"
            min="100"
            max="1000"
            class="cfg-input w-32"
          />
          <span class="text-content-muted dark:text-content-muted text-sm">MHz</span>
        </div>
      </div>

      <!-- Spreading Factor -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Spreading Factor</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ formattedSpreadingFactor }}
        </div>
        <div v-else>
          <select
            v-model.number="spreadingFactor"
            class="cfg-select"
          >
            <option v-for="sf in [5, 6, 7, 8, 9, 10, 11, 12]" :key="sf" :value="sf">
              {{ sf }}
            </option>
          </select>
        </div>
      </div>

      <!-- Bandwidth -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Bandwidth</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ formattedBandwidth }}
        </div>
        <div v-else>
          <select
            v-model.number="bandwidthKHz"
            class="cfg-select"
          >
            <option v-for="bw in bandwidthOptions" :key="bw.value" :value="bw.value">
              {{ bw.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- TX Power -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >TX Power</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ formattedTxPower }}
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="txPower"
            type="number"
            min="2"
            max="30"
            class="cfg-input w-20"
          />
          <span class="text-content-muted dark:text-content-muted text-sm">dBm</span>
        </div>
      </div>

      <!-- Coding Rate -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Coding Rate</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ formattedCodingRate }}
        </div>
        <div v-else>
          <select
            v-model.number="codingRate"
            class="cfg-select"
          >
            <option :value="5">4/5</option>
            <option :value="6">4/6</option>
            <option :value="7">4/7</option>
            <option :value="8">4/8</option>
          </select>
        </div>
      </div>

      <!-- Preamble Length (Read-only) -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Preamble Length</span
        >
        <span class="text-content-primary dark:text-content-primary font-mono text-sm">{{
          formattedPreambleLength
        }}</span>
      </div>
    </div>

    <!-- CAD Calibration Section -->
    <div class="cfg-section space-y-3">
      <!-- Section header -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">CAD Calibration</h3>
          <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Channel Activity Detection: Run Calibration to update</p>
          <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm mt-1">These settings tune the receivers ability to detect channel status prior to transmission</p>
        </div>
        <button @click="router.push('/cad-calibration')" class="cfg-btn-secondary flex-shrink-0">
          Run Calibration
        </button>
      </div>

      <div class="pt-2" />

      <!-- Peak Threshold -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Peak Threshold</span>
        <span class="text-content-primary dark:text-content-primary font-mono text-sm">
          {{ cadConfig.peak_threshold ?? 'Not calibrated' }}
        </span>
      </div>

      <!-- Min Threshold -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Min Threshold</span>
        <span class="text-content-primary dark:text-content-primary font-mono text-sm">
          {{ cadConfig.min_threshold ?? 'Not calibrated' }}
        </span>
      </div>
    </div>
  </div>
</template>
