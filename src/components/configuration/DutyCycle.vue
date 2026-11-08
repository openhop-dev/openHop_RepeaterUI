<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import SaveBar from '@/components/ui/SaveBar.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import { useSettingsDraft } from '@/composables/useSettingsDraft';

const systemStore = useSystemStore();

const dutyCycleConfig = computed(() => systemStore.stats?.config?.duty_cycle || {});

const isSaving = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const maxAirtimeInput = ref(0);
const enforcementInput = ref(true);

function loadForm() {
  const maxAirtime = dutyCycleConfig.value.max_airtime_percent;
  maxAirtimeInput.value = typeof maxAirtime === 'number' ? maxAirtime : 6.0;
  enforcementInput.value = dutyCycleConfig.value.enforcement_enabled !== false;
}

const { isDirty, changes, reset } = useSettingsDraft({
  state: () => ({
    max_airtime_percent: maxAirtimeInput.value,
    enforcement_enabled: enforcementInput.value,
  }),
  load: loadForm,
  source: dutyCycleConfig,
  labels: { max_airtime_percent: 'Max airtime', enforcement_enabled: 'Enforcement' },
  format: (path, value) =>
    path === 'max_airtime_percent' ? `${value}%` : value ? 'Enabled' : 'Disabled',
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
    const response = await ApiService.post('/update_duty_cycle_config', {
      max_airtime_percent: maxAirtimeInput.value,
      enforcement_enabled: enforcementInput.value,
    });

    const data = response.data as
      | { message?: string; persisted?: boolean; error?: string }
      | undefined;
    if (data?.message || data?.persisted) {
      await systemStore.fetchStats();
      reset();
      successMessage.value = data?.message || 'Settings saved successfully';
      setTimeout(() => {
        successMessage.value = '';
      }, 3000);
      return true;
    }
    errorMessage.value = data?.error || 'Failed to save settings';
    return false;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } } };
    console.error('Failed to save duty cycle settings:', error);
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
    label="Duty Cycle settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <div class="cfg-page-heading">
      <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
        Duty Cycle
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
        Configure duty cycle limits for channel activity
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

    <div class="cfg-section">
      <div class="space-y-3">
        <label
          class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1"
        >
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Max Airtime %</span
          >
          <input
            v-model.number="maxAirtimeInput"
            type="number"
            step="0.1"
            min="0.1"
            max="100"
            class="cfg-input w-full sm:w-32 font-mono"
          />
        </label>

        <label class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Enforcement</span
          >
          <select v-model="enforcementInput" class="cfg-select w-full sm:w-32">
            <option :value="true">Enabled</option>
            <option :value="false">Disabled</option>
          </select>
        </label>
      </div>
    </div>

    <SaveBar
      :changes="changes"
      :saving="isSaving"
      note="Applies immediately"
      @save="saveChanges"
      @discard="discardChanges"
    />
  </div>
</template>
