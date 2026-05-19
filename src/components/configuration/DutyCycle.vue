<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSystemStore } from '@/stores/system';
import { authClient } from '@/utils/api';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const systemStore = useSystemStore();

const dutyCycleConfig = computed(() => systemStore.stats?.config?.duty_cycle || {});

const maxAirtimePercent = computed(() => {
  const maxAirtime = dutyCycleConfig.value.max_airtime_percent;
  if (typeof maxAirtime === 'number') {
    return maxAirtime.toFixed(1) + '%';
  } else if (maxAirtime && typeof maxAirtime === 'object' && 'parsedValue' in maxAirtime) {
    return (maxAirtime.parsedValue || 0).toFixed(1) + '%';
  }
  return 'Not set';
});

const enforcement = computed(() => {
  return dutyCycleConfig.value.enforcement_enabled ? 'Enabled' : 'Disabled';
});

// Edit mode state
const isEditing = ref(false);
const isSaving = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

// Edit form values
const maxAirtimeInput = ref(0);
const enforcementInput = ref(true);

const startEditing = () => {
  // Parse current values
  const maxAirtime = dutyCycleConfig.value.max_airtime_percent;
  if (typeof maxAirtime === 'number') {
    maxAirtimeInput.value = maxAirtime;
  } else if (maxAirtime && typeof maxAirtime === 'object' && 'parsedValue' in maxAirtime) {
    maxAirtimeInput.value = maxAirtime.parsedValue || 0;
  } else {
    maxAirtimeInput.value = 6.0;
  }

  enforcementInput.value = dutyCycleConfig.value.enforcement_enabled !== false;
  isEditing.value = true;
  successMessage.value = '';
  errorMessage.value = '';
};

const cancelEditing = () => {
  isEditing.value = false;
  successMessage.value = '';
  errorMessage.value = '';
};

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  isSaving,
  cancelEditing,
  async () => { await saveChanges(); return !isEditing.value; },
);

defineExpose({ requestLeave, isEditing });

const saveChanges = async () => {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const response = await authClient.post('/api/update_duty_cycle_config', {
      max_airtime_percent: maxAirtimeInput.value,
      enforcement_enabled: enforcementInput.value,
    });

    const data = response.data;
    if (data.message || data.persisted) {
      successMessage.value = data.message || 'Settings saved successfully';
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
    console.error('Failed to save duty cycle settings:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to save settings';
  } finally {
    isSaving.value = false;
  }
};
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
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Duty Cycle</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure duty cycle limits for channel activity</p>
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

    <!-- Duty Cycle Settings -->
    <div class="cfg-section"><div class="space-y-3">
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Max Airtime %</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ maxAirtimePercent }}
        </div>
        <input
          v-else
          v-model.number="maxAirtimeInput"
          type="number"
          step="0.1"
          min="0.1"
          max="100"
          class="cfg-input w-full sm:w-32"
        />
      </div>

      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Enforcement</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ enforcement }}
        </div>
        <select
          v-else
          v-model="enforcementInput"
          class="cfg-select w-full sm:w-32"
        >
          <option :value="true">Enabled</option>
          <option :value="false">Disabled</option>
        </select>
      </div>
    </div></div>
  </div>
</template>
