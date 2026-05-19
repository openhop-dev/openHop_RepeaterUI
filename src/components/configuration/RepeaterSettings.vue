<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useSystemStore } from '@/stores/system';
import type { SystemStats } from '@/types/api';
import apiClient from '@/utils/api';
import { ApiService } from '@/utils/api';
import LocationPicker from '@/components/modals/LocationPicker.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

const systemStore = useSystemStore();

const config = computed(() => systemStore.stats?.config || {});
const repeaterConfig = computed(() => config.value.repeater || {});
const stats = computed(() => systemStore.stats as SystemStats | null);

// Editable form values
const isEditing = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const showMapPicker = ref(false);

const nodeNameInput = ref('');
const latitudeInput = ref(0);
const longitudeInput = ref(0);
const advertIntervalInput = ref(0);
const pathHashModeInput = ref(1); // 1, 2, or 3 bytes (UI); backend uses 0, 1, 2

// Mesh config: path_hash_mode 0=1-byte, 1=2-byte, 2=3-byte
const meshConfig = computed(() => config.value.mesh || {});
// Load current values into form
watch(
  [config, repeaterConfig, meshConfig],
  () => {
    if (!isEditing.value) {
      nodeNameInput.value = config.value.node_name || '';
      latitudeInput.value = repeaterConfig.value.latitude || 0;
      longitudeInput.value = repeaterConfig.value.longitude || 0;
      advertIntervalInput.value = repeaterConfig.value.send_advert_interval_hours || 0;
      const phm = meshConfig.value.path_hash_mode;
      pathHashModeInput.value = phm === 0 || phm === 1 || phm === 2 ? phm + 1 : 1;
    }
  },
  { immediate: true },
);

const nodeName = computed(() => {
  return config.value.node_name || 'Not set';
});

const localHash = computed(() => {
  return (stats.value as SystemStats & { local_hash?: string })?.local_hash || 'Not available';
});

const publicKey = computed(() => {
  const key = stats.value?.public_key;
  if (!key || key === 'Not set') return 'Not set';
  return key;
});

const latitude = computed(() => {
  const lat = repeaterConfig.value.latitude;
  return lat && lat !== 0 ? lat.toFixed(6) : 'Not set';
});

const longitude = computed(() => {
  const lng = repeaterConfig.value.longitude;
  return lng && lng !== 0 ? lng.toFixed(6) : 'Not set';
});

const mode = computed(() => {
  const m = repeaterConfig.value.mode;
  if (!m) return 'Not set';
  if (m === 'no_tx') return 'No TX';
  return m.charAt(0).toUpperCase() + m.slice(1);
});

const advertInterval = computed(() => {
  const interval = repeaterConfig.value.send_advert_interval_hours;
  if (interval === undefined) return 'Not set';
  if (interval === 0) return 'Disabled';
  return interval + ' hour' + (interval !== 1 ? 's' : '');
});

const pathHashModeDisplay = computed(() => {
  const phm = meshConfig.value.path_hash_mode;
  if (phm === 0 || phm === 1 || phm === 2) return phm + 1 + (phm === 0 ? ' byte' : ' bytes');
  return 'Not set';
});

const startEditing = () => {
  isEditing.value = true;
  error.value = null;
  successMessage.value = null;
};

const cancelEditing = () => {
  isEditing.value = false;
  error.value = null;
  // Reload values
  nodeNameInput.value = config.value.node_name || '';
  latitudeInput.value = repeaterConfig.value.latitude || 0;
  longitudeInput.value = repeaterConfig.value.longitude || 0;
  advertIntervalInput.value = repeaterConfig.value.send_advert_interval_hours || 0;
  const phm = meshConfig.value.path_hash_mode;
  pathHashModeInput.value = phm === 0 || phm === 1 || phm === 2 ? phm + 1 : 1;
};

const saveChanges = async () => {
  isSaving.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    const payload: Record<string, string | number> = {};

    if (nodeNameInput.value) payload.node_name = nodeNameInput.value;
    payload.latitude = latitudeInput.value;
    payload.longitude = longitudeInput.value;
    payload.flood_advert_interval_hours = advertIntervalInput.value;
    payload.path_hash_mode = pathHashModeInput.value - 1; // 1/2/3 bytes -> 0/1/2

    const response = await apiClient.post('/update_radio_config', payload);
    const data = response.data as any;

    if (data.message || data.persisted) {
      successMessage.value = data.message || 'Settings saved successfully';
      isEditing.value = false;

      await systemStore.fetchStats();

      setTimeout(() => {
        successMessage.value = null;
      }, 3000);
    } else if (data.error) {
      error.value = data.error;
    } else {
      error.value = 'Unknown response from server';
    }
  } catch (err: unknown) {
    console.error('Failed to update repeater settings:', err);
    const e = err as { response?: { data?: { error?: string } } };
    error.value = e.response?.data?.error || 'Failed to update settings';
  } finally {
    isSaving.value = false;
  }
};

const openMapPicker = () => {
  showMapPicker.value = true;
};

const handleLocationSelect = (location: { latitude: number; longitude: number }) => {
  latitudeInput.value = location.latitude;
  longitudeInput.value = location.longitude;
};

// Vanity Key Generator
const showKeygenDialog = ref(false);
const keygenPrefix = ref('');
const keygenGenerating = ref(false);
const keygenResult = ref<{ public_hex: string; private_hex: string; attempts: number } | null>(
  null,
);
const keygenError = ref<string | null>(null);
const showApplyConfirm = ref(false);
const keygenApplying = ref(false);
const keygenAdvanced = ref(false);

const keygenElapsed = ref(0);
let keygenTimer: ReturnType<typeof setInterval> | null = null;

const maxPrefixLength = computed(() => (keygenAdvanced.value ? 8 : 4));

const isValidPrefix = computed(() => {
  const p = keygenPrefix.value.trim();
  if (!p || p.length > maxPrefixLength.value) return false;
  return /^[0-9a-fA-F]+$/.test(p);
});

const difficultyHint = computed(() => {
  const len = keygenPrefix.value.trim().length;
  if (len === 0) return '';
  if (len === 1) return 'Very fast — ~16 attempts on average';
  if (len === 2) return 'Fast — ~256 attempts on average';
  if (len === 3) return 'Moderate — ~4,096 attempts, a few seconds';
  if (len === 4) return 'Slow — ~65,536 attempts, may take 10-30 seconds';
  if (len === 5) return 'Very slow — ~1 million attempts, could take minutes';
  if (len === 6) return 'Extremely slow — ~16 million attempts, could take a very long time';
  if (len === 7) return 'Extreme — ~268 million attempts, may not complete';
  return 'Extreme — ~4 billion attempts, extremely unlikely to complete';
});

const startTimer = () => {
  keygenElapsed.value = 0;
  keygenTimer = setInterval(() => {
    keygenElapsed.value++;
  }, 1000);
};

const stopTimer = () => {
  if (keygenTimer) {
    clearInterval(keygenTimer);
    keygenTimer = null;
  }
};

onBeforeUnmount(() => stopTimer());

const openKeygenDialog = () => {
  keygenPrefix.value = '';
  keygenResult.value = null;
  keygenError.value = null;
  showApplyConfirm.value = false;
  keygenAdvanced.value = false;
  showKeygenDialog.value = true;
};

const generateKey = async () => {
  keygenGenerating.value = true;
  keygenError.value = null;
  keygenResult.value = null;
  startTimer();
  try {
    const resp = await ApiService.generateVanityKey(keygenPrefix.value.trim());
    if (resp.success && resp.data) {
      keygenResult.value = resp.data;
    } else {
      keygenError.value = resp.error || 'Generation failed';
    }
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string };
    keygenError.value = e.response?.data?.error || e.message || 'Generation failed';
  } finally {
    stopTimer();
    keygenGenerating.value = false;
  }
};

const applyGeneratedKey = async () => {
  if (!keygenResult.value) return;
  keygenApplying.value = true;
  keygenError.value = null;
  try {
    const resp = await ApiService.generateVanityKey(keygenPrefix.value.trim(), true);
    if (resp.success && resp.data) {
      keygenResult.value = resp.data;
      showApplyConfirm.value = false;
      showKeygenDialog.value = false;
      successMessage.value =
        'New identity key applied. Restart the repeater for the change to take effect.';
      await systemStore.fetchStats();
      setTimeout(() => {
        successMessage.value = null;
      }, 8000);
    } else {
      keygenError.value = resp.error || 'Failed to apply key';
    }
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } }; message?: string };
    keygenError.value = e.response?.data?.error || e.message || 'Failed to apply key';
  } finally {
    keygenApplying.value = false;
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
    label="Repeater Settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Repeater Settings</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure repeater identity, location, and network settings</p>
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
      class="bg-green-100 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 rounded-lg p-3"
    >
      <p class="text-green-700 dark:text-green-400 text-sm">{{ successMessage }}</p>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      class="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-3"
    >
      <p class="text-red-700 dark:text-red-400 text-sm">{{ error }}</p>
    </div>

    <!-- General Settings -->
    <div class="cfg-section space-y-3">
      <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary pb-2">General Settings</h3>

      <!-- Node Name -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Node Name</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm break-all"
        >
          {{ nodeName }}
        </div>
        <input
          v-else
          v-model="nodeNameInput"
          type="text"
          maxlength="50"
          class="cfg-input w-full sm:w-64"
          placeholder="Enter node name"
        />
      </div>

      <!-- Local Hash (Read-only) -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Local Hash</span
        >
        <span class="text-content-primary dark:text-content-primary font-mono text-xs break-all">{{
          localHash
        }}</span>
      </div>

      <!-- Public Key (Read-only) -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span
          class="text-content-secondary dark:text-content-muted text-xs sm:text-sm flex-shrink-0"
          >Public Key</span
        >
        <div class="flex items-center gap-2 min-w-0 sm:justify-end">
          <span
            class="text-content-primary dark:text-content-primary font-mono text-xs break-all sm:text-right min-w-0"
            >{{ publicKey }}</span
          >
          <button
            v-if="isEditing"
            @click="openKeygenDialog"
            class="flex-shrink-0 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-content-secondary dark:text-content-muted rounded border border-primary/30 transition-colors whitespace-nowrap"
          >
            Generate New Key
          </button>
        </div>
      </div>

      <!-- Mode (Read-only) -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Mode</span>
        <span class="text-content-primary dark:text-content-primary font-mono text-sm">{{
          mode
        }}</span>
      </div>

      <!-- Path hash length -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Path hash length</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ pathHashModeDisplay }}
        </div>
        <select
          v-else
          v-model.number="pathHashModeInput"
          class="cfg-select w-full sm:w-32"
        >
          <option :value="1">1 byte</option>
          <option :value="2">2 bytes</option>
          <option :value="3">3 bytes</option>
        </select>
      </div>

      <!-- Advertisement Interval -->
      <div class="flex flex-col py-2 gap-2">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Periodic Advertisement Interval</span
          >
          <div
            v-if="!isEditing"
            class="text-content-primary dark:text-content-primary font-mono text-sm sm:ml-4"
          >
            {{ advertInterval }}
          </div>
          <div v-else class="flex items-center gap-2">
            <input
              v-model.number="advertIntervalInput"
              type="number"
              min="0"
              max="48"
              class="cfg-input w-20"
            />
            <span class="text-content-muted dark:text-content-muted text-sm">hours</span>
          </div>
        </div>
        <span class="text-content-muted dark:text-content-muted text-xs"
          >How often the repeater sends an advertisement packet (0 = disabled, 3-48 hours)</span
        >
      </div>
    </div>

    <!-- Location Settings -->
    <div class="cfg-section space-y-3">
      <div class="pb-2">
        <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-3">Location Settings</h3>
        <button
          v-if="isEditing"
          @click="openMapPicker"
          class="btn-primary flex items-center gap-2"
          title="Pick location on map"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Pick Location on Map
        </button>
      </div>

      <!-- Manual Latitude -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Manual Latitude</span>
        <div v-if="!isEditing" class="text-content-primary dark:text-content-primary font-mono text-sm">
          {{ latitude }}
        </div>
        <input
          v-else
          v-model.number="latitudeInput"
          type="number"
          step="0.000001"
          min="-90"
          max="90"
          class="cfg-input w-full sm:w-48"
        />
      </div>

      <!-- Manual Longitude -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Manual Longitude</span>
        <div v-if="!isEditing" class="text-content-primary dark:text-content-primary font-mono text-sm">
          {{ longitude }}
        </div>
        <input
          v-else
          v-model.number="longitudeInput"
          type="number"
          step="0.000001"
          min="-180"
          max="180"
          class="cfg-input w-full sm:w-48"
        />
      </div>
    </div>

    <!-- Location Picker Modal -->
    <LocationPicker
      :is-open="showMapPicker"
      :latitude="latitudeInput"
      :longitude="longitudeInput"
      @close="showMapPicker = false"
      @select="handleLocationSelect"
    />

    <!-- Vanity Key Generator Dialog -->
    <Teleport to="body">
      <div
        v-if="showKeygenDialog"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showKeygenDialog = false"
      >
        <div
          class="bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-[15px] shadow-2xl w-full max-w-md p-6 space-y-4"
        >
          <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
            Generate Vanity Identity Key
          </h3>
          <p class="text-xs text-content-muted dark:text-content-muted">
            Generate a new Ed25519 identity key whose public key starts with your chosen hex prefix
            (0-9, A-F). Longer prefixes take more time to find.
          </p>

          <!-- Prefix Input -->
          <div>
            <label
              class="block text-sm font-medium text-content-secondary dark:text-content-muted mb-2"
              >Hex Prefix (1-{{ maxPrefixLength }} characters)</label
            >
            <input
              v-model="keygenPrefix"
              type="text"
              :maxlength="maxPrefixLength"
              placeholder="e.g. F8A1"
              :disabled="keygenGenerating"
              class="cfg-input py-2 placeholder-gray-400 dark:placeholder-white/40 font-mono uppercase disabled:opacity-50"
            />
            <p v-if="keygenPrefix && !isValidPrefix" class="text-red-500 text-xs mt-1">
              Enter 1-{{ maxPrefixLength }} valid hex characters (0-9, A-F)
            </p>
            <p
              v-else-if="difficultyHint"
              class="text-content-muted dark:text-content-muted text-xs mt-1"
            >
              {{ difficultyHint }}
            </p>
          </div>

          <!-- Advanced Toggle -->
          <div>
            <button
              @click="keygenAdvanced = !keygenAdvanced"
              :disabled="keygenGenerating"
              class="text-xs text-content-muted dark:text-content-muted hover:text-content-secondary dark:hover:text-content-secondary transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <svg
                class="w-3 h-3 transition-transform"
                :class="{ 'rotate-90': keygenAdvanced }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Advanced
            </button>
            <div
              v-if="keygenAdvanced"
              class="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"
            >
              <p class="text-amber-600 dark:text-amber-400 text-xs font-medium">
                Extended prefix mode (up to 8 characters)
              </p>
              <p class="text-amber-600 dark:text-amber-500 text-xs mt-1">
                Prefixes longer than 4 characters require exponentially more attempts and can take a
                very long time or may not complete at all. The request may time out.
              </p>
            </div>
          </div>

          <!-- Generating Progress -->
          <div
            v-if="keygenGenerating"
            class="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"
          >
            <svg
              class="animate-spin h-5 w-5 text-blue-500 flex-shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <div>
              <p class="text-blue-700 dark:text-blue-400 text-xs font-medium">
                Searching for key with prefix "{{ keygenPrefix.toUpperCase() }}"...
              </p>
              <p class="text-blue-600 dark:text-blue-500 text-xs mt-0.5">
                Elapsed: {{ keygenElapsed }}s
              </p>
            </div>
          </div>

          <!-- Error -->
          <div v-if="keygenError" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p class="text-red-600 dark:text-red-400 text-sm">{{ keygenError }}</p>
          </div>

          <!-- Result -->
          <div
            v-if="keygenResult"
            class="bg-green-500/10 border border-green-600/40 dark:border-green-500/30 rounded-lg p-3 space-y-2"
          >
            <p class="text-green-600 dark:text-green-400 text-sm font-medium">
              Key found in {{ keygenResult.attempts.toLocaleString() }} attempts
            </p>
            <div>
              <span class="text-xs text-content-muted dark:text-content-muted">Public Key:</span>
              <p class="font-mono text-xs break-all text-content-primary dark:text-content-primary">
                {{ keygenResult.public_hex }}
              </p>
            </div>
          </div>

          <!-- Apply Confirmation -->
          <div
            v-if="showApplyConfirm && keygenResult"
            class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"
          >
            <p class="text-amber-600 dark:text-amber-400 text-sm font-medium">
              Warning: This will replace your current identity key.
            </p>
            <p class="text-amber-600 dark:text-amber-500 text-xs mt-1">
              Your node address and public key will change. Other nodes will need to re-discover
              you. This cannot be undone unless you have a backup.
            </p>
            <div class="flex gap-2 mt-3">
              <button
                @click="applyGeneratedKey"
                :disabled="keygenApplying"
                class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                {{ keygenApplying ? 'Applying...' : 'Confirm Replace Key' }}
              </button>
              <button
                @click="showApplyConfirm = false"
                :disabled="keygenApplying"
                class="px-3 py-1.5 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/20 text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end gap-3 mt-6">
            <button
              @click="showKeygenDialog = false"
              :disabled="keygenGenerating"
              class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/10 transition-colors"
            >
              Close
            </button>
            <button
              v-if="!keygenResult"
              @click="generateKey"
              :disabled="!isValidPrefix || keygenGenerating"
              class="btn-primary"
            >
              {{ keygenGenerating ? 'Generating...' : 'Generate' }}
            </button>
            <template v-else>
              <button
                @click="
                  keygenResult = null;
                  keygenError = null;
                "
                class="btn-primary"
              >
                Try Again
              </button>
              <button
                v-if="!showApplyConfirm"
                @click="showApplyConfirm = true"
                class="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-600 dark:text-red-400 rounded-lg border border-red-500/50 text-sm transition-colors"
              >
                Apply Key
              </button>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
