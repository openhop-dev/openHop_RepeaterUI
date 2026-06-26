<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import Spinner from '@/components/ui/Spinner.vue';
import apiClient from '@/utils/api';
import {
  RESTART_POLL_ENDPOINT,
  RESTART_INITIAL_DELAY_MS,
  RESTART_POLL_INTERVAL_MS,
  RESTART_STABLE_REQUIRED,
  RESTART_MAX_ATTEMPTS,
} from '@/utils/constants';

interface Props {
  modelValue: boolean;
  message: string;
  title?: string;
  startImmediately?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Service Restart Required',
  startImmediately: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

interface ValidationIssue {
  path: string;
  message: string;
}

interface ValidationResult {
  valid?: boolean;
  blocked_restart?: boolean;
  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
  message?: string;
}

const isRestarting = ref(false);
const isValidating = ref(false);
const hasFailed = ref(false);
const failureMessage = ref('');
const validationChecked = ref(false);
const validationPassed = ref(false);
const validationMessage = ref('');
const validationErrors = ref<ValidationIssue[]>([]);
const validationWarnings = ref<ValidationIssue[]>([]);
const warningConfirmationRequired = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollAttempts = 0;
let stableCount = 0;
const MAX_ATTEMPTS = RESTART_MAX_ATTEMPTS;
const STABLE_REQUIRED = RESTART_STABLE_REQUIRED;

function resetValidationState() {
  isValidating.value = false;
  validationChecked.value = false;
  validationPassed.value = false;
  validationMessage.value = '';
  validationErrors.value = [];
  validationWarnings.value = [];
  warningConfirmationRequired.value = false;
}

function close() {
  if ((isRestarting.value || isValidating.value) && !hasFailed.value) return;
  isRestarting.value = false;
  isValidating.value = false;
  hasFailed.value = false;
  failureMessage.value = '';
  resetValidationState();
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  pollAttempts = 0;
  stableCount = 0;
  emit('update:modelValue', false);
}

async function runConfigPreflight(): Promise<boolean> {
  isValidating.value = true;
  validationChecked.value = false;
  validationPassed.value = false;
  validationMessage.value = '';
  validationErrors.value = [];
  validationWarnings.value = [];
  warningConfirmationRequired.value = false;

  try {
    const response = await apiClient.get<ValidationResult>('/validate_config');
    const payload = response.data || {};
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const blockedRestart = payload.blocked_restart === true;
    const valid = payload.valid === true && !blockedRestart && errors.length === 0;

    validationErrors.value = errors;
    validationWarnings.value = warnings;
    validationPassed.value = valid;
    validationChecked.value = true;

    if (valid) {
      if (warnings.length > 0) {
        validationMessage.value =
          payload.message ||
          'Configuration is valid but has warnings. Review them before continuing.';
        warningConfirmationRequired.value = true;
      } else {
        validationMessage.value = payload.message || 'Configuration preflight passed.';
      }
      return true;
    }

    validationMessage.value =
      payload.message ||
      (errors.length > 0
        ? 'Configuration preflight failed. Fix the errors below before restarting.'
        : 'Configuration preflight blocked restart.');
    return false;
  } catch (err) {
    const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
    if (e.response) {
      const status = e.response.status;
      const detail = e.response.data?.error || e.response.data?.message;
      if (status === 403 || status === 401) {
        failureMessage.value = 'Permission denied. Config preflight could not be completed.';
      } else {
        failureMessage.value = detail
          ? `Config preflight failed: ${detail}`
          : `Config preflight failed (HTTP ${status}).`;
      }
    } else {
      failureMessage.value = 'Config preflight failed due to a network or server error.';
    }
    hasFailed.value = true;
    return false;
  } finally {
    isValidating.value = false;
  }
}

async function handleRestart() {
  hasFailed.value = false;
  failureMessage.value = '';

  if (validationPassed.value && warningConfirmationRequired.value) {
    // Second confirmation click after warnings were shown.
    warningConfirmationRequired.value = false;
  } else {
    const configOk = await runConfigPreflight();
    if (!configOk) {
      return;
    }

    // Pause on warning-only preflight and require explicit user confirmation.
    if (warningConfirmationRequired.value) {
      return;
    }
  }

  isRestarting.value = true;
  try {
    const response = await apiClient.post('/restart_service', {});
    if (!response.success) {
      isRestarting.value = false;
      hasFailed.value = true;
      failureMessage.value = response.error || 'Restart failed.';
      return;
    }
  } catch (err) {
    const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
    if (e.response) {
      isRestarting.value = false;
      hasFailed.value = true;
      const status = e.response.status;
      const detail = e.response.data?.error || e.response.data?.message;
      if (status === 403 || status === 401) {
        failureMessage.value = 'Permission denied. The service could not be restarted. Check polkit configuration.';
      } else {
        failureMessage.value = detail ? `Restart failed: ${detail}` : `Restart failed (HTTP ${status}).`;
      }
      return;
    }
    /* network drop on restart is expected — fall through to polling */
  }
  pollAttempts = 0;
  stableCount = 0;
  pollTimer = setTimeout(poll, RESTART_INITIAL_DELAY_MS);
}

function startPolling() {
  isRestarting.value = true;
  isValidating.value = false;
  hasFailed.value = false;
  pollAttempts = 0;
  stableCount = 0;
  pollTimer = setTimeout(poll, RESTART_INITIAL_DELAY_MS);
}

function poll() {
  pollAttempts++;
  fetch(RESTART_POLL_ENDPOINT, { method: 'GET' })
    .then(res => {
      if (res.ok) {
        stableCount++;
        if (stableCount >= STABLE_REQUIRED) {
          window.location.reload();
        } else {
          // API responded but we need sustained stability before reloading —
          // keep polling without counting this as a failure attempt
          pollTimer = setTimeout(poll, RESTART_POLL_INTERVAL_MS);
        }
      } else {
        stableCount = 0;
        schedulePoll();
      }
    })
    .catch(() => {
      stableCount = 0;
      schedulePoll();
    });
}

function schedulePoll() {
  if (pollAttempts < MAX_ATTEMPTS) {
    pollTimer = setTimeout(poll, RESTART_POLL_INTERVAL_MS);
  } else {
    isRestarting.value = false;
    hasFailed.value = true;
  }
}

watch(() => props.modelValue, (val) => {
  if (!val) {
    isRestarting.value = false;
    isValidating.value = false;
    hasFailed.value = false;
    failureMessage.value = '';
    resetValidationState();
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    pollAttempts = 0;
    stableCount = 0;
  } else if (props.startImmediately) {
    startPolling();
  }
});

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="modal-backdrop"
        @click.self="close"
      >
        <div class="modal-card max-w-md shadow-xl">

          <!-- Restarting state: spinner -->
          <div v-if="isRestarting" class="flex flex-col items-center gap-5 py-2">
            <Spinner size="lg" />
            <div class="text-center">
              <h3 class="text-base font-semibold text-content-primary">
                Restarting&hellip;
              </h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Please wait while the service restarts. This may take up to a minute.
              </p>
            </div>
          </div>

          <!-- Validation state: spinner -->
          <div v-else-if="isValidating" class="flex flex-col items-center gap-5 py-2">
            <Spinner size="lg" />
            <div class="text-center">
              <h3 class="text-base font-semibold text-content-primary">
                Validating Configuration&hellip;
              </h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Running preflight checks on config.yaml before restarting.
              </p>
            </div>
          </div>

          <!-- Failed state: error + dismiss -->
          <template v-else-if="hasFailed">
            <div class="flex items-start gap-3 mb-4">
              <div class="shrink-0 w-10 h-10 rounded-full bg-accent-red/10 dark:bg-accent-red/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary">
                  Service Did Not Restart
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  {{ failureMessage || 'The service did not respond after 60 seconds. Please log into the device and check the system logs.' }}
                </p>
              </div>
            </div>
            <div class="modal-actions">
              <button @click="close" class="modal-btn-cancel">Dismiss</button>
            </div>
          </template>

          <!-- Idle state: warning + buttons -->
          <template v-else>
            <div class="flex items-start gap-3 mb-4">
              <div class="shrink-0 w-10 h-10 rounded-full bg-accent-amber/10 dark:bg-accent-amber/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary">
                  {{ title }}
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  {{ message }}
                </p>
              </div>
            </div>

            <div
              v-if="validationChecked"
              class="mb-4 rounded-lg border px-3 py-3"
              :class="validationPassed
                ? (validationWarnings.length
                  ? 'border-accent-amber/80 bg-accent-amber/10 dark:bg-accent-amber/20 dark:border-accent-amber/60'
                  : 'border-accent-green/80 bg-accent-green/10 dark:bg-accent-green/20 dark:border-accent-green/60')
                : 'border-accent-red/80 bg-accent-red/10 dark:bg-accent-red/20 dark:border-accent-red/60'"
            >
              <div class="flex items-start gap-2">
                <svg
                  v-if="validationPassed && !validationWarnings.length"
                  class="w-5 h-5 text-accent-green mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <svg
                  v-else-if="validationPassed && validationWarnings.length"
                  class="w-5 h-5 text-accent-amber mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <svg
                  v-else
                  class="w-5 h-5 text-accent-red mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div class="min-w-0">
                  <h4 class="text-sm font-semibold text-content-primary">
                    {{
                      validationPassed
                        ? (validationWarnings.length ? 'Preflight Warning' : 'Preflight Passed')
                        : 'Preflight Failed'
                    }}
                  </h4>
                  <p class="text-xs text-content-secondary dark:text-content-muted mt-1">
                    {{ validationMessage }}
                  </p>
                </div>
              </div>

              <div
                v-if="!validationPassed && validationErrors.length"
                class="mt-3 max-h-44 overflow-auto rounded border border-accent-red/70 dark:border-accent-red/60 bg-white/60 dark:bg-black/10"
              >
                <ul class="text-xs divide-y divide-red-100/70 dark:divide-red-800/40">
                  <li
                    v-for="(issue, idx) in validationErrors"
                    :key="`err-${idx}-${issue.path}-${issue.message}`"
                    class="px-2 py-2"
                  >
                    <p class="font-semibold text-accent-red">{{ issue.path || 'config' }}</p>
                    <p class="text-accent-red">{{ issue.message }}</p>
                  </li>
                </ul>
              </div>

              <div
                v-if="validationWarnings.length"
                class="mt-3 max-h-32 overflow-auto rounded border border-accent-amber/70 dark:border-accent-amber/60 bg-white/60 dark:bg-black/10"
              >
                <ul class="text-xs divide-y divide-amber-100/70 dark:divide-amber-800/40">
                  <li
                    v-for="(issue, idx) in validationWarnings"
                    :key="`warn-${idx}-${issue.path}-${issue.message}`"
                    class="px-2 py-2"
                  >
                    <p class="font-semibold text-accent-amber">{{ issue.path || 'config' }}</p>
                    <p class="text-accent-amber">{{ issue.message }}</p>
                  </li>
                </ul>
              </div>
            </div>

            <div class="modal-actions">
              <button @click="close" class="modal-btn-cancel">Cancel</button>
              <button @click="handleRestart" class="modal-btn-primary" :disabled="isValidating || isRestarting">
                {{
                  warningConfirmationRequired
                    ? 'Restart Anyway'
                    : (validationPassed ? 'Restart' : 'Validate & Restart')
                }}
              </button>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

