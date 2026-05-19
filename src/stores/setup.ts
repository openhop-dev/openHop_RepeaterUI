import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface RadioPreset {
  title: string;
  description: string;
  frequency: string;
  spreading_factor: string;
  bandwidth: string;
  coding_rate: string;
}

interface HardwareOption {
  key: string;
  name: string;
  description: string;
  config: any;
}

type HardwareConnectionType = 'gpio' | 'usb' | 'network';

export const useSetupStore = defineStore('setup', () => {
  // State
  const currentStep = ref(1);
  const totalSteps = ref(6);

  // Form data
  const nodeName = ref(
    `pyRpt${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`,
  );
  const selectedHardware = ref<HardwareOption | null>(null);
  const selectedHardwareConnection = ref<HardwareConnectionType | null>(null);
  const selectedRadioPreset = ref<RadioPreset | null>(null);
  const adminPassword = ref('');
  const confirmPassword = ref('');

  // Custom radio settings
  const useCustomRadio = ref(false);
  const customRadio = ref({
    frequency: '915.0',
    spreading_factor: '7',
    bandwidth: '125',
    coding_rate: '5',
  });

  // Data from API
  const hardwareOptions = ref<HardwareOption[]>([]);
  const radioPresets = ref<RadioPreset[]>([]);

  // Loading states
  const isLoading = ref(false);
  const isSubmitting = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const canGoNext = computed(() => {
    switch (currentStep.value) {
      case 1:
        return true; // Welcome step
      case 2:
        return nodeName.value.trim().length > 0;
      case 3:
        return selectedHardwareConnection.value !== null;
      case 4:
        return selectedHardware.value !== null;
      case 5:
        return useCustomRadio.value
          ? customRadio.value.frequency &&
              customRadio.value.spreading_factor &&
              customRadio.value.bandwidth &&
              customRadio.value.coding_rate
          : selectedRadioPreset.value !== null;
      case 6:
        return adminPassword.value.length >= 6 && adminPassword.value === confirmPassword.value;
      default:
        return false;
    }
  });

  const canGoBack = computed(() => currentStep.value > 1);

  const isLastStep = computed(() => currentStep.value === totalSteps.value);

  // Actions
  async function fetchHardwareOptions() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch('/api/hardware_options');
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      hardwareOptions.value = data.hardware || [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load hardware options';
      console.error('Error fetching hardware options:', e);
    } finally {
      isLoading.value = false;
    }
  }

  const normalizePreset = (entry: Record<string, unknown>): RadioPreset => ({
    title: String(entry.title ?? ''),
    description: String(entry.description ?? ''),
    frequency: String(entry.frequency ?? ''),
    spreading_factor: String(entry.spreading_factor ?? ''),
    bandwidth: String(entry.bandwidth ?? ''),
    coding_rate: String(entry.coding_rate ?? ''),
  });

  async function fetchRadioPresets() {
    isLoading.value = true;
    error.value = null;
    try {
      // Try official MeshCore API first — it's the canonical community-maintained list
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch('https://api.meshcore.nz/api/v1/config', { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            const entries: unknown[] = data?.config?.suggested_radio_settings?.entries ?? [];
            if (entries.length > 0) {
              radioPresets.value = entries.map((e) => normalizePreset(e as Record<string, unknown>));
              return;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Network error or timeout — fall through to local
      }

      // Fall back to pyMC local preset list
      const response = await fetch('/api/radio_presets');
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      radioPresets.value = (data.presets ?? []).map((e: Record<string, unknown>) => normalizePreset(e));
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load radio presets';
      console.error('Error fetching radio presets:', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function completeSetup() {
    if (!canGoNext.value) {
      return { success: false, error: 'Please complete all required fields' };
    }

    isSubmitting.value = true;
    error.value = null;

    try {
      // Use custom radio settings if enabled, otherwise use preset
      const radioConfig = useCustomRadio.value
        ? {
            title: 'Custom Configuration',
            description: 'Custom radio settings',
            frequency: customRadio.value.frequency,
            spreading_factor: customRadio.value.spreading_factor,
            bandwidth: customRadio.value.bandwidth,
            coding_rate: customRadio.value.coding_rate,
          }
        : selectedRadioPreset.value;

      const response = await fetch('/api/setup_wizard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          node_name: nodeName.value.trim(),
          hardware_key: selectedHardware.value?.key,
          radio_preset: radioConfig,
          admin_password: adminPassword.value,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Setup failed');
      }

      return { success: true, data };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to complete setup';
      error.value = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      isSubmitting.value = false;
    }
  }

  function nextStep() {
    if (canGoNext.value && currentStep.value < totalSteps.value) {
      currentStep.value++;
    }
  }

  function previousStep() {
    if (canGoBack.value) {
      currentStep.value--;
    }
  }

  function goToStep(step: number) {
    if (step >= 1 && step <= totalSteps.value) {
      currentStep.value = step;
    }
  }

  function reset() {
    currentStep.value = 1;
    nodeName.value = `pyRpt${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
    selectedHardware.value = null;
    selectedHardwareConnection.value = null;
    selectedRadioPreset.value = null;
    useCustomRadio.value = false;
    customRadio.value = {
      frequency: '915.0',
      spreading_factor: '7',
      bandwidth: '125',
      coding_rate: '5',
    };
    adminPassword.value = '';
    confirmPassword.value = '';
    error.value = null;
  }

  return {
    // State
    currentStep,
    totalSteps,
    nodeName,
    selectedHardware,
    selectedHardwareConnection,
    selectedRadioPreset,
    useCustomRadio,
    customRadio,
    adminPassword,
    confirmPassword,
    hardwareOptions,
    radioPresets,
    isLoading,
    isSubmitting,
    error,

    // Computed
    canGoNext,
    canGoBack,
    isLastStep,

    // Actions
    fetchHardwareOptions,
    fetchRadioPresets,
    completeSetup,
    nextStep,
    previousStep,
    goToStep,
    reset,
  };
});
