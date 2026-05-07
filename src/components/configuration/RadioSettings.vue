<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSystemStore } from '@/stores/system';
import apiClient from '@/utils/api';

const systemStore = useSystemStore();

const radioConfig = computed(() => systemStore.stats?.config?.radio || {});

// Editable form values
const isEditing = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

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
  successMessage.value = null;
};

const cancelEditing = () => {
  isEditing.value = false;
  error.value = null;
  // Reload values from store
  const config = radioConfig.value;
  frequencyMHz.value = config.frequency ? Number((config.frequency / 1000000).toFixed(3)) : 0;
  spreadingFactor.value = config.spreading_factor ?? 0;
  bandwidthKHz.value = config.bandwidth ? Number((config.bandwidth / 1000).toFixed(1)) : 0;
  txPower.value = config.tx_power ?? 0;
  codingRate.value = config.coding_rate ?? 0;
  preambleLength.value = config.preamble_length ?? 0;
};

const saveChanges = async () => {
  isSaving.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    // Convert to backend units (Hz for frequency and bandwidth)
    const payload: Record<string, number> = {};

    if (frequencyMHz.value) payload.frequency = frequencyMHz.value * 1000000;
    if (spreadingFactor.value) payload.spreading_factor = spreadingFactor.value;
    if (bandwidthKHz.value) payload.bandwidth = bandwidthKHz.value * 1000;
    if (txPower.value) payload.tx_power = txPower.value;
    if (codingRate.value) payload.coding_rate = codingRate.value;

    const response = await apiClient.post('/update_radio_config', payload);
    const data = response.data as any;

    // API returns data directly without success wrapper
    // Success if we have a message or persisted flag
    if (data.message || data.persisted) {
      successMessage.value = data.message || 'Settings saved successfully';
      isEditing.value = false;

      // Refresh stats to show updated values
      await systemStore.fetchStats();

      // Clear success message after 3 seconds
      setTimeout(() => {
        successMessage.value = null;
      }, 3000);
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
};
</script>

<template>
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
            @click="saveChanges"
            :disabled="isSaving"
            class="cfg-btn-primary"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Success Message -->
    <div
      v-if="successMessage"
      class="bg-green-100 dark:bg-green-500/20 border border-green-500/50 rounded-lg p-3"
    >
      <p class="text-green-600 dark:text-green-400 text-sm">{{ successMessage }}</p>
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
            class="w-32 px-3 py-1.5 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary"
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
            class="px-3 py-1.5 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary"
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
            class="px-3 py-1.5 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary"
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
            class="w-20 px-3 py-1.5 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary"
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
            class="px-3 py-1.5 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary text-sm focus:outline-none focus:border-primary"
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

    <!-- Info Note -->
    <div
      v-if="isEditing"
      class="bg-yellow-500/10 dark:bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3"
    >
      <p class="text-yellow-700 dark:text-yellow-400 text-xs">
        <strong>Note:</strong> Radio hardware changes (frequency, bandwidth, spreading factor,
        coding rate) may require a service restart to apply.
      </p>
    </div>
  </div>
</template>
