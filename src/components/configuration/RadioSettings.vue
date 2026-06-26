<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';
import { useSetupStore } from '@/stores/setup';
import apiClient from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import TxPowerNoticeModal from '@/components/modals/TxPowerNoticeModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const router = useRouter();
const systemStore = useSystemStore();
const dataService = useDataService();
const setupStore = useSetupStore();

const radioConfig = computed(() => systemStore.stats?.config?.radio || {});
const cadConfig = computed(() => (systemStore.stats?.config?.radio as any)?.cad ?? {});

// Editable form values
const isEditing = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
const showRestartModal = ref(false);
const selectedPrefillPreset = ref('');
const showPrefillPicker = ref(false);
const showTxPowerNoticeModal = ref(false);
const txPowerNoticeConfirmed = ref(false);
const txPowerAtEditStart = ref(0);

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

const startEditing = async () => {
  if (setupStore.radioPresets.length === 0) {
    await setupStore.fetchRadioPresets();
  }

  isEditing.value = true;
  error.value = null;
  txPowerNoticeConfirmed.value = false;
  txPowerAtEditStart.value = txPower.value;
};

const applyPresetToForm = (preset: { frequency: string; spreading_factor: string; bandwidth: string; coding_rate: string }) => {
  frequencyMHz.value = preset.frequency ? Number(Number(preset.frequency).toFixed(3)) : 0;
  spreadingFactor.value = preset.spreading_factor ? Number(preset.spreading_factor) : 0;
  bandwidthKHz.value = preset.bandwidth ? Number(Number(preset.bandwidth).toFixed(1)) : 0;
  codingRate.value = preset.coding_rate ? Number(preset.coding_rate) : 0;
};

const formatPresetFrequency = (preset: { frequency: string }) => (preset.frequency ? `${Number(preset.frequency).toFixed(3)} MHz` : 'Not set');
const formatPresetBandwidth = (preset: { bandwidth: string }) => (preset.bandwidth ? `${Number(preset.bandwidth).toFixed(1)} kHz` : 'Not set');
const formatPresetSpreadingFactor = (preset: { spreading_factor: string }) => preset.spreading_factor || 'Not set';
const formatPresetCodingRate = (preset: { coding_rate: string }) => (preset.coding_rate ? `4/${preset.coding_rate}` : 'Not set');

const applySelectedPreset = () => {
  error.value = null;
  const preset = setupStore.radioPresets.find((entry) => entry.title === selectedPrefillPreset.value);
  if (!preset) return;

  applyPresetToForm(preset);
};

watch(selectedPrefillPreset, (presetTitle) => {
  if (!isEditing.value || !presetTitle) return;
  applySelectedPreset();
});

const choosePrefillPreset = (title: string) => {
  selectedPrefillPreset.value = title;
  const preset = setupStore.radioPresets.find((entry) => entry.title === title);
  if (!preset) return;

  applyPresetToForm(preset);
  showPrefillPicker.value = false;
};

const cancelEditing = () => {
  isEditing.value = false;
  error.value = null;
  selectedPrefillPreset.value = '';
  showPrefillPicker.value = false;
  showTxPowerNoticeModal.value = false;
  txPowerNoticeConfirmed.value = false;
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
    if (txPower.value < -9 || txPower.value > 22) {
      error.value = 'TX Power must be between -9 and +22 dBm for SX1262';
      return false;
    }

    const payload: Record<string, number> = {};

    if (frequencyMHz.value) payload.frequency = frequencyMHz.value * 1000000;
    if (spreadingFactor.value) payload.spreading_factor = spreadingFactor.value;
    if (bandwidthKHz.value) payload.bandwidth = bandwidthKHz.value * 1000;
    if (txPower.value || txPower.value === 0) payload.tx_power = txPower.value;
    if (codingRate.value) payload.coding_rate = codingRate.value;

    const response = await apiClient.post('/update_radio_config', payload);
    const data = response.data as any;

    if (data.message || data.persisted) {
      isEditing.value = false;
      txPowerNoticeConfirmed.value = false;
      await systemStore.fetchStats();
      dataService.invalidate('radioConfig');
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

const txPowerChanged = computed(() => txPower.value !== txPowerAtEditStart.value);

const requestSaveChanges = async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
  if (isEditing.value && txPowerChanged.value && !txPowerNoticeConfirmed.value) {
    showTxPowerNoticeModal.value = true;
    return false;
  }
  return saveChanges({ silent });
};

const confirmNoticeAndSave = async () => {
  if (!txPowerNoticeConfirmed.value) return;
  showTxPowerNoticeModal.value = false;
  await saveChanges();
};

const closeTxPowerNotice = () => {
  showTxPowerNoticeModal.value = false;
  txPowerNoticeConfirmed.value = false;
};

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  isSaving,
  cancelEditing,
  () => requestSaveChanges(),
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

  <TxPowerNoticeModal
    :show="showTxPowerNoticeModal"
    :confirmed="txPowerNoticeConfirmed"
    :busy="isSaving"
    action-label="I Understand, Save Changes"
    @update:show="(v) => (v ? (showTxPowerNoticeModal = true) : closeTxPowerNotice())"
    @update:confirmed="(v) => (txPowerNoticeConfirmed = v)"
    @confirm="confirmNoticeAndSave"
  />

  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Radio Settings</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure LoRa radio parameters and frequency presets</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <template v-if="!isEditing">
          <button
            @click="startEditing"
            class="cfg-btn-primary"
          >
            Edit Settings
          </button>
        </template>
        <template v-else>
          <button
            @click="showPrefillPicker = !showPrefillPicker"
            class="cfg-btn-secondary"
          >
            Prefill Preset
          </button>
          <button
            @click="cancelEditing"
            :disabled="isSaving"
            class="cfg-btn-secondary"
          >
            Cancel
          </button>
          <button
            @click="requestSaveChanges()"
            :disabled="isSaving"
            class="cfg-btn-primary"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-accent-red/10 border border-accent-red/50 rounded-lg p-3">
      <p class="text-accent-red text-sm">{{ error }}</p>
    </div>

    <!-- Radio Settings -->
    <div class="cfg-section space-y-3">
      <Transition name="fade">
        <div
          v-if="isEditing && showPrefillPicker"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          @click.self="showPrefillPicker = false"
        >
          <div class="w-full max-w-3xl rounded-3xl border border-stroke-subtle dark:border-white/10 bg-white dark:bg-surface-elevated shadow-[0_20px_80px_color-mix(in_srgb,var(--color-shadow-strong)_35%,transparent)] overflow-hidden">
            <div class="flex items-start justify-between gap-3 p-5 border-b border-stroke-subtle dark:border-white/10">
              <div>
                <div class="text-content-primary dark:text-content-primary font-semibold text-base">
                  Prefill from preset
                </div>
                <div class="text-content-muted dark:text-content-muted text-xs mt-1">
                  Pick a preset to load its radio values into the form.
                </div>
              </div>
              <button
                type="button"
                class="cfg-btn-secondary"
                @click="showPrefillPicker = false"
              >
                Close
              </button>
            </div>

            <div class="p-5">
              <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                <button
                  v-for="preset in setupStore.radioPresets"
                  :key="preset.title"
                  type="button"
                  @click="choosePrefillPreset(preset.title)"
                  :class="[
                    'w-full text-left rounded-[18px] border px-4 py-3 transition-all duration-200 flex items-center justify-between gap-4',
                    selectedPrefillPreset === preset.title
                      ? 'border-primary/60 bg-primary/10 shadow-sm shadow-primary/10'
                      : 'border-stroke-subtle dark:border-white/10 bg-white/60 dark:bg-white/5 hover:border-primary/30 hover:bg-stroke-subtle/60 dark:hover:bg-white/10',
                  ]"
                >
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <div class="text-content-primary dark:text-content-primary font-semibold text-sm truncate">
                        {{ preset.title }}
                      </div>
                      <span
                        v-if="selectedPrefillPreset === preset.title"
                        class="inline-flex items-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5"
                      >
                        Selected
                      </span>
                    </div>
                    <div class="text-content-secondary dark:text-content-muted text-xs mt-1 line-clamp-2">
                      {{ preset.description }}
                    </div>
                  </div>

                  <div class="flex flex-wrap justify-end gap-2 shrink-0 text-[11px] font-mono">
                    <span class="rounded-full bg-background-mute dark:bg-black/20 px-2 py-1 text-content-secondary dark:text-content-muted">
                      Freq {{ formatPresetFrequency(preset) }}
                    </span>
                    <span class="rounded-full bg-background-mute dark:bg-black/20 px-2 py-1 text-content-secondary dark:text-content-muted">
                      SF {{ formatPresetSpreadingFactor(preset) }}
                    </span>
                    <span class="rounded-full bg-background-mute dark:bg-black/20 px-2 py-1 text-content-secondary dark:text-content-muted">
                      BW {{ formatPresetBandwidth(preset) }}
                    </span>
                    <span class="rounded-full bg-background-mute dark:bg-black/20 px-2 py-1 text-content-secondary dark:text-content-muted">
                      CR {{ formatPresetCodingRate(preset) }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

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
            min="-9"
            max="22"
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
        <button @click="router.push('/cad-calibration')" class="cfg-btn-secondary shrink-0">
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
