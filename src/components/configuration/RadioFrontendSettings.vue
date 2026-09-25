<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ApiService } from '@/utils/api';
import type { RadioFrontendSettings, RadioFrontendStatus } from '@/generated/openapi';

// RF front-end rows for the default radio's KISS modem, shown inside Radio
// Hardware and driven by that page's Edit / Save. Unlike the rest of the page,
// these apply to the modem immediately rather than after a restart, so the
// parent calls apply() first and only offers a restart for hardware changes.

const props = defineProps<{
  /** Follows the parent page's edit mode; entering it reloads the inputs. */
  editing: boolean;
}>();

type GainChoice = 'on' | 'off' | '';

const status = ref<RadioFrontendStatus | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

const agcInput = ref<number | null>(null);
// On/off controls. Boosted RX gain is the radio chip's own (MeshCore radio.rxgain),
// independent of the external FEM LNA.
type GainKey = 'fem_rx_gain' | 'fem_tx_gain' | 'rx_boosted_gain';
const gainInput = reactive<Record<GainKey, GainChoice>>({
  fem_rx_gain: '',
  fem_tx_gain: '',
  rx_boosted_gain: '',
});
const gainRows: ReadonlyArray<{ key: GainKey; label: string; hint?: string }> = [
  { key: 'fem_rx_gain', label: 'FEM RX Gain (LNA)' },
  { key: 'fem_tx_gain', label: 'FEM TX Gain (PA)' },
  { key: 'rx_boosted_gain', label: 'Radio RX Boosted Gain', hint: 'The LoRa chip’s own gain mode' },
];

const supports = computed(() => status.value?.supports);
const hasAnyControl = computed(
  () =>
    !!supports.value &&
    (supports.value.agc_reset_interval_seconds ||
      supports.value.fem_rx_gain ||
      supports.value.fem_tx_gain ||
      supports.value.rx_boosted_gain),
);
const available = computed(() => !loading.value && !!status.value?.available);

async function load() {
  loading.value = true;
  try {
    const result = await ApiService.getRadioFrontend();
    status.value = result.success ? result.data : null;
  } catch {
    status.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function agcLabel(seconds: number | undefined): string {
  if (seconds === undefined) return 'Unknown';
  return seconds === 0 ? 'Off' : `${seconds} s`;
}

function gainLabel(value: boolean | undefined): string {
  if (value === undefined) return 'Unknown';
  return value ? 'On' : 'Off';
}

function configuredNote(key: keyof RadioFrontendSettings): string {
  return status.value?.configured[key] === undefined ? ' (board default)' : '';
}

function gainChoice(value: boolean | undefined): GainChoice {
  return value === undefined ? '' : value ? 'on' : 'off';
}

function resetInputs() {
  const running = status.value?.running ?? {};
  agcInput.value = running.agc_reset_interval_seconds ?? null;
  for (const { key } of gainRows) gainInput[key] = gainChoice(running[key]);
  errorMessage.value = '';
}

watch(
  () => props.editing,
  (editing) => {
    if (editing) {
      successMessage.value = '';
      resetInputs();
    } else {
      errorMessage.value = '';
    }
  },
);

/** Settings the operator changed from what the modem runs, or an error message. */
function changes(): RadioFrontendSettings | string {
  if (!available.value) return {};
  const running = status.value?.running ?? {};
  const result: RadioFrontendSettings = {};
  if (supports.value?.agc_reset_interval_seconds && agcInput.value !== null) {
    const agc = Number(agcInput.value);
    if (!Number.isInteger(agc) || agc < 0 || agc > 1020) {
      return 'AGC reset interval must be a whole number of seconds, 0-1020';
    }
    if (agc !== running.agc_reset_interval_seconds) result.agc_reset_interval_seconds = agc;
  }
  for (const { key } of gainRows) {
    if (!supports.value?.[key] || !gainInput[key]) continue;
    const enabled = gainInput[key] === 'on';
    if (enabled !== running[key]) result[key] = enabled;
  }
  return result;
}

/** Check the inputs without sending anything; returns an error message or ''. */
function validate(): string {
  const result = changes();
  errorMessage.value = typeof result === 'string' ? result : '';
  return errorMessage.value;
}

function hasChanges(): boolean {
  const result = changes();
  return typeof result !== 'string' && Object.keys(result).length > 0;
}

/**
 * Apply changed settings to the modem. Resolves true when there was nothing to
 * apply or everything applied; on failure the reason is shown next to the rows.
 */
async function apply(): Promise<boolean> {
  const result = changes();
  if (typeof result === 'string') {
    errorMessage.value = result;
    return false;
  }
  if (Object.keys(result).length === 0) return true;
  errorMessage.value = '';
  try {
    const response = await ApiService.setRadioFrontend(result);
    if (response.data) status.value = response.data;
    if (!response.success) {
      errorMessage.value = response.error || 'Failed to apply RF front-end settings';
      return false;
    }
    const agc = response.data?.applied.agc_reset_interval_seconds;
    successMessage.value =
      agc !== undefined && agc !== result.agc_reset_interval_seconds
        ? `RF front end applied. AGC reset interval rounded to ${agc} s.`
        : 'RF front end applied to the radio.';
    setTimeout(() => (successMessage.value = ''), 4000);
    return true;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } }; message?: string };
    errorMessage.value =
      e.response?.data?.error || e.message || 'Failed to apply RF front-end settings';
    return false;
  }
}

defineExpose({ apply, validate, hasChanges, reload: load, available });
</script>

<template>
  <template v-if="available">
    <div class="pt-2 text-xs text-content-muted" data-testid="radio-frontend">
      RF Front End
      <span class="block text-[11px]">Applied to the modem on Save, without a restart.</span>
    </div>

    <div
      v-if="successMessage"
      class="bg-accent-green/opacity-light dark:bg-accent-green/opacity-medium border border-accent-green dark:border-accent-green/opacity-heavy rounded-lg p-3 text-accent-green text-sm"
      data-testid="frontend-success"
    >
      {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      class="bg-accent-red/opacity-light dark:bg-accent-red/opacity-medium border border-accent-red dark:border-accent-red/opacity-heavy rounded-lg p-3 text-accent-red text-sm"
      data-testid="frontend-error"
    >
      {{ errorMessage }}
    </div>

    <p v-if="!hasAnyControl" class="text-xs text-content-muted py-2" data-testid="frontend-none">
      This modem reports no front-end controls. They need MeshCore KISS firmware v2 or newer, and
      FEM gain also needs a board that exposes it.
    </p>

    <template v-else>
      <div
        v-if="supports?.agc_reset_interval_seconds"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          AGC Reset Interval
          <span class="block text-[11px] text-content-muted"
            >Seconds, rounded down to a multiple of 4; 0 turns it off</span
          >
        </span>
        <span
          v-if="!props.editing"
          class="text-content-primary font-mono text-sm"
          data-testid="frontend-agc"
        >
          {{ agcLabel(status!.running.agc_reset_interval_seconds)
          }}{{ configuredNote('agc_reset_interval_seconds') }}
        </span>
        <input
          v-else
          v-model.number="agcInput"
          type="number"
          min="0"
          max="1020"
          step="4"
          class="cfg-input w-full sm:w-40"
          data-testid="frontend-agc-input"
        />
      </div>

      <div
        v-for="row in gainRows"
        :key="row.key"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/opacity-light gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          {{ row.label }}
          <span v-if="row.hint" class="block text-[11px] text-content-muted">{{ row.hint }}</span>
        </span>
        <template v-if="supports?.[row.key]">
          <span
            v-if="!props.editing"
            class="text-content-primary font-mono text-sm"
            :data-testid="`frontend-${row.key}`"
          >
            {{ gainLabel(status!.running[row.key]) }}{{ configuredNote(row.key) }}
          </span>
          <select
            v-else
            v-model="gainInput[row.key]"
            class="cfg-select w-full sm:w-40"
            :data-testid="`frontend-${row.key}-input`"
          >
            <option v-if="gainInput[row.key] === ''" value="" disabled>Unknown</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </template>
        <span v-else class="text-content-muted text-sm" :data-testid="`frontend-${row.key}`"
          >Not available on this board</span
        >
      </div>
    </template>
  </template>
</template>
