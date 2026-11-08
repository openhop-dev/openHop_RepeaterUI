<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ApiService } from '@/utils/api';
import type { RadioFrontendSettings, RadioFrontendStatus } from '@/generated/openapi';
import { AGC_HOST_MAX_SEC } from '@/commands/radioFrontend';

// Live tuning for one radio (KISS or openHop modem): AGC reset interval, FEM
// gain and the chip's boosted RX gain. Each control is sent to the modem as it
// changes and the server saves what the modem confirms, so these never wait for
// the page's Save or a restart. Shown inside Radio Hardware under the selected
// radio.

const props = defineProps<{
  /** radios[] entry on a multi-radio node; omitted for the default radio. */
  radioId?: string;
}>();

const emit = defineEmits<{
  /** The modem confirmed a change; `configured` is the server's saved set. */
  applied: [configured: Record<string, unknown>, radioId: string | undefined];
}>();

type GainKey = 'fem_rx_gain' | 'fem_tx_gain' | 'rx_boosted_gain';

const status = ref<RadioFrontendStatus | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const pending = ref<string | null>(null);

const agcInput = ref<number | null>(null);
const gainRows: ReadonlyArray<{ key: GainKey; label: string; hint?: string }> = [
  { key: 'fem_rx_gain', label: 'FEM RX gain (LNA)', hint: 'External front-end receive amplifier' },
  { key: 'fem_tx_gain', label: 'FEM TX gain (PA)', hint: 'External front-end transmit amplifier' },
  { key: 'rx_boosted_gain', label: 'Radio RX boosted gain', hint: 'The LoRa chip’s own gain mode' },
];

const supports = computed(() => status.value?.supports);
const running = computed(() => status.value?.running ?? {});
const hasAnyControl = computed(
  () =>
    !!supports.value &&
    (supports.value.agc_reset_interval_seconds ||
      supports.value.fem_rx_gain ||
      supports.value.fem_tx_gain ||
      supports.value.rx_boosted_gain),
);
const available = computed(() => !loading.value && !!status.value?.available);

// The radio's own AGC range: KISS firmware stops at 1020 s and rounds down to 4 s,
// an openHop modem takes 0-3600 s in 1 s steps. Without limits from the server,
// only the host bound is checked and the server names the radio's range.
const agcMax = computed(
  () => status.value?.limits?.agc_reset_interval_seconds?.max ?? AGC_HOST_MAX_SEC,
);
const agcStep = computed(() => status.value?.limits?.agc_reset_interval_seconds?.step ?? 1);
const agcHint = computed(() =>
  agcStep.value > 1
    ? `Seconds, 0-${agcMax.value}, rounded down to a multiple of ${agcStep.value}; 0 turns it off`
    : `Seconds, 0-${agcMax.value}; 0 turns it off`,
);

// A response for a radio that is no longer selected must not land on this one.
let loadToken = 0;

async function load() {
  const token = ++loadToken;
  loading.value = true;
  try {
    const result = await ApiService.getRadioFrontend(props.radioId || undefined);
    if (token !== loadToken) return;
    status.value = result.success ? result.data : null;
  } catch {
    if (token !== loadToken) return;
    status.value = null;
  } finally {
    if (token === loadToken) {
      loading.value = false;
      agcInput.value = status.value?.running.agc_reset_interval_seconds ?? null;
    }
  }
}

onMounted(load);

watch(
  () => props.radioId,
  () => {
    successMessage.value = '';
    errorMessage.value = '';
    void load();
  },
);

function agcLabel(seconds: number | undefined): string {
  if (seconds === undefined) return 'unknown';
  return seconds === 0 ? 'off' : `${seconds} s`;
}

function boardDefault(key: keyof RadioFrontendSettings): boolean {
  return status.value?.configured[key] === undefined;
}

/** Send one setting; on failure the control returns to what the modem runs. */
async function send(settings: RadioFrontendSettings, key: string): Promise<boolean> {
  pending.value = key;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const response = await ApiService.setRadioFrontend(settings, props.radioId || undefined);
    if (response.data) status.value = response.data;
    if (!response.success) {
      errorMessage.value = response.error || 'Failed to apply RF front-end settings';
      return false;
    }
    const agc = response.data?.applied.agc_reset_interval_seconds;
    successMessage.value =
      agc !== undefined && agc !== settings.agc_reset_interval_seconds
        ? `Applied. The radio set the AGC reset interval to ${agc} s.`
        : 'Applied to the radio.';
    setTimeout(() => (successMessage.value = ''), 4000);
    emit('applied', { ...(response.data?.configured ?? {}) }, props.radioId || undefined);
    return true;
  } catch (error: unknown) {
    const e = error as { response?: { data?: { error?: string } }; message?: string };
    errorMessage.value =
      e.response?.data?.error || e.message || 'Failed to apply RF front-end settings';
    return false;
  } finally {
    pending.value = null;
    agcInput.value = status.value?.running.agc_reset_interval_seconds ?? agcInput.value;
  }
}

async function commitAgc() {
  if (agcInput.value === null || pending.value) return;
  const agc = Number(agcInput.value);
  if (!Number.isInteger(agc) || agc < 0 || agc > agcMax.value) {
    errorMessage.value = `AGC reset interval must be a whole number of seconds, 0-${agcMax.value}`;
    return;
  }
  if (agc === running.value.agc_reset_interval_seconds) return;
  await send({ agc_reset_interval_seconds: agc }, 'agc_reset_interval_seconds');
}

async function toggleGain(key: GainKey) {
  if (pending.value) return;
  await send({ [key]: !running.value[key] }, key);
}

// What the server now has configured for this radio.
const configured = computed<Record<string, unknown>>(() => ({
  ...(status.value?.configured ?? {}),
}));

defineExpose({ reload: load, available, configured });
</script>

<template>
  <section
    v-if="available"
    aria-labelledby="live-tuning-heading"
    class="cfg-section !p-4 sm:!p-5 space-y-1"
    data-testid="radio-frontend"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 id="live-tuning-heading" class="text-sm font-semibold text-content-primary">
        Live tuning
      </h4>
      <span
        class="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-accent-green/opacity-light text-accent-green"
        >Applies immediately</span
      >
    </div>
    <p class="text-xs text-content-muted pb-1">
      Sent to the modem as you change it and saved once the modem confirms. No restart.
    </p>

    <div
      v-if="successMessage"
      role="status"
      class="bg-accent-green/opacity-light border border-accent-green/opacity-heavy rounded-lg px-3 py-2 text-accent-green text-xs"
      data-testid="frontend-success"
    >
      {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      role="alert"
      class="bg-accent-red/opacity-light border border-accent-red/opacity-heavy rounded-lg px-3 py-2 text-accent-red text-xs"
      data-testid="frontend-error"
    >
      {{ errorMessage }}
    </div>

    <p v-if="!hasAnyControl" class="text-xs text-content-muted py-2" data-testid="frontend-none">
      This radio reports no front-end controls. They need MeshCore KISS firmware v2 or newer, or
      openHop modem firmware with RF front-end support, and FEM gain also needs a board that exposes
      it.
    </p>

    <template v-else>
      <div
        v-if="supports?.agc_reset_interval_seconds"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-2.5 border-t border-stroke-subtle dark:border-stroke/opacity-light"
      >
        <label for="frontend-agc-input" class="text-sm text-content-primary">
          AGC reset interval
          <span class="block text-[11px] text-content-muted" data-testid="frontend-agc-hint">{{
            agcHint
          }}</span>
        </label>
        <span class="flex items-center gap-2">
          <input
            id="frontend-agc-input"
            v-model.number="agcInput"
            type="number"
            min="0"
            :max="agcMax"
            :step="agcStep"
            :disabled="pending !== null"
            class="cfg-input w-28 font-mono"
            data-testid="frontend-agc-input"
            @change="commitAgc"
            @keydown.enter.prevent="commitAgc"
          />
          <span class="text-[11px] text-content-muted whitespace-nowrap" data-testid="frontend-agc">
            running: {{ agcLabel(running.agc_reset_interval_seconds)
            }}{{ boardDefault('agc_reset_interval_seconds') ? ' (board default)' : '' }}
          </span>
        </span>
      </div>

      <div
        v-for="row in gainRows"
        :key="row.key"
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-2.5 border-t border-stroke-subtle dark:border-stroke/opacity-light"
      >
        <span class="text-sm text-content-primary">
          {{ row.label }}
          <span v-if="row.hint" class="block text-[11px] text-content-muted">{{ row.hint }}</span>
        </span>
        <span v-if="supports?.[row.key]" class="flex items-center gap-2">
          <span class="text-[11px] text-content-muted" :data-testid="`frontend-${row.key}`">
            {{ running[row.key] === undefined ? 'Unknown' : running[row.key] ? 'On' : 'Off'
            }}{{ boardDefault(row.key) ? ' (board default)' : '' }}
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="running[row.key] === true"
            :aria-label="row.label"
            :disabled="pending !== null"
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
            :class="
              running[row.key] ? 'bg-primary' : 'bg-stroke-subtle dark:bg-white/opacity-medium'
            "
            :data-testid="`frontend-${row.key}-input`"
            @click="toggleGain(row.key)"
          >
            <span
              aria-hidden="true"
              class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
              :class="running[row.key] ? 'translate-x-[22px]' : 'translate-x-0.5'"
            ></span>
          </button>
        </span>
        <span v-else class="text-[11px] text-content-muted" :data-testid="`frontend-${row.key}`"
          >Not available on this board</span
        >
      </div>
    </template>
  </section>
  <p
    v-else-if="!loading && status?.unavailable_reason"
    class="cfg-section !p-4 sm:!p-5 text-xs text-content-muted"
    data-testid="radio-frontend-unavailable"
  >
    Live tuning: {{ status.unavailable_reason }}
  </p>
</template>
