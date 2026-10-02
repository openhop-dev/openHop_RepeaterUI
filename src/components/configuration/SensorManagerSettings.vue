<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ApiService } from '@/utils/api';
import RestartModal from '@/components/modals/RestartModal.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';
import Spinner from '@/components/ui/Spinner.vue';

interface SensorType {
  type: string;
  name: string;
  description: string;
  settings: Array<{
    key: string;
    type: string;
    label: string;
    default?: unknown;
    help?: string;
  }>;
}

interface SensorDefinition {
  name: string;
  _original_name?: string;
  type: string;
  enabled: boolean;
  auto_install_packages?: boolean;
  settings: Record<string, unknown>;
}

interface SensorConfig {
  enabled: boolean;
  poll_interval_seconds: number;
  auto_install_packages: boolean;
  definitions: SensorDefinition[];
}

const sensorTypes = ref<SensorType[]>([]);
const config = ref<SensorConfig | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showRestartModal = ref(false);

// Editing state
const isEditing = ref(false);
const isSaving = ref(false);
const draftConfig = ref<SensorConfig | null>(null);

// Add-sensor form state
const showAddForm = ref(false);
const selectedNewType = ref('');
const newSensorName = ref('');
const newSensorSettings = ref<Record<string, unknown>>({});

// Selected sensor for editing
const editingIndex = ref<number | null>(null);
const editDraft = ref<SensorDefinition | null>(null);

const selectedType = computed(() =>
  sensorTypes.value.find((t) => t.type === selectedNewType.value),
);

// Mask sensitive values even when talking to an older backend.
const displaySettings = (settings: Record<string, unknown>): string =>
  JSON.stringify(settings, (key, value) =>
    key.toLowerCase() === 'password' && value ? '*****' : value,
  );

const availableTypes = computed(() => sensorTypes.value.filter((t) => t.type !== 'pymc_modem'));

// Load sensor types and config
async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [typesRes, configRes] = await Promise.all([
      ApiService.getSensorTypes(),
      ApiService.getSensorConfig(),
    ]);
    if (typesRes.success && typesRes.data) {
      sensorTypes.value = typesRes.data.types;
    }
    if (configRes.success && configRes.data) {
      config.value = configRes.data;
      draftConfig.value = JSON.parse(JSON.stringify(configRes.data));
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    error.value = err.message || 'Failed to load sensor data';
  } finally {
    loading.value = false;
  }
}

function startEditing() {
  isEditing.value = true;
  draftConfig.value = JSON.parse(JSON.stringify(config.value));
  showAddForm.value = false;
}

function cancelEditing() {
  isEditing.value = false;
  showAddForm.value = false;
  selectedNewType.value = '';
  newSensorName.value = '';
  newSensorSettings.value = {};
  editingIndex.value = null;
  editDraft.value = null;
}

// Add sensor
function beginAddSensor() {
  showAddForm.value = true;
  selectedNewType.value = '';
  newSensorName.value = '';
  newSensorSettings.value = {};
}

function resetAddForm() {
  selectedNewType.value = '';
  newSensorName.value = '';
  newSensorSettings.value = {};
}

function onTypeSelected() {
  const type = sensorTypes.value.find((t) => t.type === selectedNewType.value);
  if (type) {
    newSensorSettings.value = {};
    for (const setting of type.settings) {
      newSensorSettings.value[setting.key] = setting.default;
    }
  }
}

function canAddSensor(): boolean {
  if (!selectedNewType.value || !newSensorName.value.trim()) return false;
  if (draftConfig.value?.definitions.some((d) => d.name === newSensorName.value.trim()))
    return false;
  const type = selectedType.value;
  if (!type) return false;
  // Validate required settings
  for (const setting of type.settings) {
    const val = newSensorSettings.value[setting.key];
    if (val === undefined || val === null || val === '') {
      return false;
    }
  }
  return true;
}

function addSensor() {
  if (!draftConfig.value || !selectedType.value || !canAddSensor()) return;
  const def: SensorDefinition = {
    name: newSensorName.value.trim(),
    type: selectedNewType.value,
    enabled: true,
    auto_install_packages: draftConfig.value.auto_install_packages,
    settings: { ...newSensorSettings.value },
  };
  draftConfig.value.definitions.push(def);
  resetAddForm();
  showAddForm.value = false;
}

// Edit sensor
function beginEditSensor(index: number) {
  if (!draftConfig.value) return;
  editingIndex.value = index;
  editDraft.value = JSON.parse(JSON.stringify(draftConfig.value.definitions[index]));
}

function cancelEditSensor() {
  editingIndex.value = null;
  editDraft.value = null;
}

function saveEditSensor() {
  if (!draftConfig.value || editingIndex.value === null || !editDraft.value) return;
  draftConfig.value.definitions[editingIndex.value] = { ...editDraft.value };
  editingIndex.value = null;
  editDraft.value = null;
}

// Delete sensor
function removeSensor(index: number) {
  if (!draftConfig.value) return;
  draftConfig.value.definitions.splice(index, 1);
}

// Toggle sensor enabled
function toggleSensor(index: number) {
  if (!draftConfig.value) return;
  draftConfig.value.definitions[index].enabled = !draftConfig.value.definitions[index].enabled;
}

// Save all
async function saveAll(): Promise<boolean> {
  if (!draftConfig.value || isSaving.value) return false;
  // The row editor is a separate draft; include it in both page and leave-guard saves.
  if (editingIndex.value !== null) saveEditSensor();
  isSaving.value = true;
  error.value = null;
  try {
    const result = await ApiService.updateSensorConfig(draftConfig.value);
    if (result.success && result.data) {
      isEditing.value = false;
      // Reload server-issued origins and masked passwords. Reusing the old
      // draft after a rename would point at a no-longer-existing identity.
      await loadData();
      showRestartModal.value = result.data.restart_required;
      return true;
    }
    error.value = result.error || 'Failed to save sensor configuration';
    return false;
  } catch (e: unknown) {
    const err = e as { message?: string };
    error.value = err.message || 'Failed to save sensor configuration';
    return false;
  } finally {
    isSaving.value = false;
  }
}

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } =
  useUnsavedChanges(isEditing, isSaving, cancelEditing, saveAll);

defineExpose({ requestLeave, isEditing });

onMounted(() => {
  void loadData();
});

// Watch config changes for unsaved-changes guard
watch(
  () => draftConfig.value?.enabled,
  () => {
    // Handled by useUnsavedChanges via isEditing flag
  },
);
</script>

<template>
  <RestartModal
    v-model="showRestartModal"
    title="Sensor configuration change requires a restart."
    message="Restart now?"
  />

  <UnsavedChangesModal
    :show="showUnsavedModal"
    :is-saving="isSaving"
    label="Sensor Manager"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-6">
    <!-- Header -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
          Sensor Manager
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Configure and manage I2C sensors — add, edit, enable, or disable sensor definitions.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <template v-if="!isEditing">
          <button @click="startEditing" class="cfg-btn-primary">Edit Sensors</button>
        </template>
        <template v-else>
          <button @click="cancelEditing" class="cfg-btn-secondary">Discard</button>
          <button @click="saveAll" :disabled="isSaving" class="cfg-btn-primary">
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red/opacity-heavy rounded-lg p-3"
    >
      <p class="text-accent-red text-sm">{{ error }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <Spinner />
    </div>

    <!-- Non-editing view -->
    <template v-if="!isEditing && !loading && config">
      <!-- Global settings -->
      <div
        class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-4 sm:p-5 space-y-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-content-primary">Sensor Manager</div>
            <div class="text-xs text-content-muted mt-0.5">
              {{ config.enabled ? 'Enabled' : 'Disabled' }} ·
              {{ config.definitions.length }} configured
            </div>
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="config.enabled"
              class="w-4 h-4 accent-primary"
              disabled
            />
            <span class="text-sm text-content-primary">Enable sensor manager</span>
          </label>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-content-muted">Poll interval:</span>
          <span class="text-sm font-mono text-content-primary"
            >{{ config.poll_interval_seconds }}s</span
          >
        </div>
      </div>

      <!-- Sensor list -->
      <div
        class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-4 sm:p-5 space-y-3"
      >
        <div class="text-sm font-semibold text-content-primary">Configured Sensors</div>

        <div
          v-if="config.definitions.length === 0"
          class="text-xs text-content-muted py-4 text-center"
        >
          No sensors configured. Click "Edit Sensors" to add one.
        </div>

        <div
          v-for="def in config.definitions"
          :key="def.name"
          class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-content-primary text-sm">{{ def.name }}</span>
              <span
                class="text-xs px-2 py-0.5 rounded-full bg-primary/opacity-light text-primary font-mono"
              >
                {{ def.type }}
              </span>
              <span
                class="text-[10px] px-2 py-0.5 rounded-full"
                :class="
                  def.enabled
                    ? 'bg-accent-green/opacity-light text-accent-green dark:bg-accent-green/opacity-medium dark:text-accent-green'
                    : 'bg-accent-amber/opacity-light text-accent-amber dark:bg-accent-amber/opacity-medium dark:text-accent-amber'
                "
              >
                {{ def.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
            <div class="flex items-center gap-2 text-xs text-content-muted">
              <span class="font-mono">{{ displaySettings(def.settings) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Editing view -->
    <template v-if="isEditing && !loading && draftConfig">
      <!-- Global settings -->
      <div
        class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-4 sm:p-5 space-y-4"
      >
        <div class="text-sm font-semibold text-content-primary">Global Settings</div>

        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="draftConfig.enabled" class="w-4 h-4 accent-primary" />
            <span class="text-sm text-content-primary">Enable sensor manager</span>
          </label>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-content-muted">Poll interval (seconds):</span>
          <input
            v-model.number="draftConfig.poll_interval_seconds"
            type="number"
            min="1"
            step="1"
            class="cfg-input w-24"
          />
        </div>
      </div>

      <!-- Sensor list with add/edit/delete -->
      <div
        class="cfg-section rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light p-4 sm:p-5 space-y-3"
      >
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div class="text-sm font-semibold text-content-primary">Configured Sensors</div>
          <button v-if="!showAddForm" @click="beginAddSensor" class="cfg-btn-primary text-xs">
            + Add Sensor
          </button>
        </div>

        <!-- Add sensor form -->
        <Transition name="fade">
          <div
            v-if="showAddForm"
            class="rounded-lg border border-primary/opacity-heavy bg-primary/opacity-light p-4 space-y-3"
          >
            <div class="text-sm font-semibold text-content-primary">Add New Sensor</div>

            <!-- Type selector -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
              <label class="text-xs text-content-muted sm:w-32">Sensor type:</label>
              <select v-model="selectedNewType" class="cfg-select flex-1" @change="onTypeSelected">
                <option value="">— Select type —</option>
                <option v-for="t in availableTypes" :key="t.type" :value="t.type">
                  {{ t.name }} ({{ t.type }})
                </option>
              </select>
            </div>

            <!-- Name input -->
            <div v-if="selectedType" class="flex flex-col sm:flex-row sm:items-center gap-2">
              <label class="text-xs text-content-muted sm:w-32">Sensor name:</label>
              <input
                v-model="newSensorName"
                type="text"
                placeholder="e.g. living-room-temp"
                class="cfg-input flex-1"
                :pattern="'^[a-z0-9]+(-[a-z0-9]+)*$'"
                title="Lowercase letters, numbers, and hyphens only"
              />
            </div>

            <!-- Dynamic settings fields -->
            <div v-if="selectedType" class="space-y-2">
              <div
                v-for="setting in selectedType.settings"
                :key="setting.key"
                class="flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <label class="text-xs text-content-muted sm:w-48">
                  {{ setting.label }}
                  <span v-if="setting.help" class="block text-[10px] text-content-muted mt-0.5">{{
                    setting.help
                  }}</span>
                </label>
                <input
                  v-model="newSensorSettings[setting.key]"
                  :type="
                    setting.key.toLowerCase() === 'password'
                      ? 'password'
                      : setting.type === 'integer' || setting.type === 'number'
                        ? 'number'
                        : 'text'
                  "
                  :step="setting.type === 'number' ? '0.01' : '1'"
                  :min="
                    setting.type === 'integer' || setting.type === 'number' ? '-999999' : undefined
                  "
                  :max="
                    setting.type === 'integer' || setting.type === 'number' ? '999999' : undefined
                  "
                  class="cfg-input flex-1"
                  :placeholder="String(setting.default)"
                />
              </div>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <button
                @click="addSensor"
                :disabled="!canAddSensor()"
                class="cfg-btn-primary text-xs"
              >
                Add
              </button>
              <button
                @click="
                  () => {
                    showAddForm = false;
                    resetAddForm();
                  }
                "
                class="cfg-btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </Transition>

        <!-- Sensor definitions -->
        <div class="space-y-2">
          <div
            v-for="(def, idx) in draftConfig.definitions"
            :key="def.name"
            class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light p-3"
          >
            <!-- View mode -->
            <div v-if="editingIndex !== idx">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-content-primary text-sm">{{ def.name }}</span>
                  <span
                    class="text-xs px-2 py-0.5 rounded-full bg-primary/opacity-light text-primary font-mono"
                  >
                    {{ def.type }}
                  </span>
                  <label class="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      :checked="def.enabled"
                      @change="toggleSensor(idx)"
                      class="w-3 h-3 accent-primary"
                    />
                    <span :class="def.enabled ? 'text-accent-green' : 'text-accent-amber'">
                      {{ def.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </label>
                </div>
                <div class="flex items-center gap-1">
                  <button @click="beginEditSensor(idx)" class="cfg-btn-secondary text-xs px-2 py-1">
                    Edit
                  </button>
                  <button
                    @click="removeSensor(idx)"
                    class="text-xs px-2 py-1 rounded-lg border border-accent-red/opacity-medium text-accent-red hover:bg-accent-red/opacity-light"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div class="mt-2 text-xs text-content-muted font-mono break-all">
                Settings: {{ displaySettings(def.settings) }}
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else class="space-y-2">
              <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <label class="text-xs text-content-muted sm:w-24">Name:</label>
                <input v-model="editDraft!.name" type="text" class="cfg-input flex-1" />
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <label class="text-xs text-content-muted sm:w-24">Type:</label>
                <input :value="editDraft!.type" type="text" disabled class="cfg-input flex-1" />
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                <label class="text-xs text-content-muted sm:w-24">Enabled:</label>
                <input
                  type="checkbox"
                  v-model="editDraft!.enabled"
                  class="w-4 h-4 accent-primary"
                />
              </div>
              <div class="space-y-2">
                <div
                  v-for="(value, key) in editDraft!.settings"
                  :key="key"
                  class="flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <label class="text-xs text-content-muted sm:w-48">{{ key }}:</label>
                  <input
                    v-model="editDraft!.settings[key]"
                    :type="key.toLowerCase() === 'password' ? 'password' : 'text'"
                    class="cfg-input flex-1"
                  />
                </div>
              </div>
              <div class="flex items-center gap-2 pt-2">
                <button @click="saveEditSensor" class="cfg-btn-primary text-xs">Save</button>
                <button @click="cancelEditSensor" class="cfg-btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          </div>

          <div
            v-if="draftConfig.definitions.length === 0"
            class="text-xs text-content-muted py-4 text-center"
          >
            No sensors configured. Click "+ Add Sensor" to add one.
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
