<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { useSystemStore } from '@/stores/system';
import { authClient } from '@/utils/api';

const systemStore = useSystemStore();

// Config sections from store
const repeaterConfig = computed(() => systemStore.stats?.config?.repeater || {});
const rateLimitConfig = computed(() => repeaterConfig.value.advert_rate_limit || {});
const penaltyConfig = computed(() => repeaterConfig.value.advert_penalty_box || {});
const adaptiveConfig = computed(() => repeaterConfig.value.advert_adaptive || {});
const thresholds = computed(() => adaptiveConfig.value.thresholds || {});

// Edit mode state
const isEditing = ref(false);
const isSaving = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const showHelp = ref(false);

// Stats from API
const statsLoading = ref(false);
const rateLimitStats = ref<any>(null);

// Edit form values - Rate Limit
const rateLimitEnabled = ref(true);
const bucketCapacity = ref(2);
const refillTokens = ref(1);
const refillIntervalHours = ref(10); // User-friendly hours
const minIntervalMinutes = ref(60); // User-friendly minutes

// Edit form values - Penalty Box
const penaltyEnabled = ref(true);
const violationThreshold = ref(2);
const violationDecayHours = ref(12); // User-friendly hours
const basePenaltyHours = ref(6); // User-friendly hours
const penaltyMultiplier = ref(2.0);
const maxPenaltyHours = ref(24); // User-friendly hours

// Edit form values - Adaptive
const adaptiveEnabled = ref(true);
const ewmaAlpha = ref(0.1);
const hysteresisMinutes = ref(5); // User-friendly minutes
const quietMax = ref(0.05);
const normalMax = ref(0.2);
const busyMax = ref(0.5);

// Fetch current stats
const fetchStats = async () => {
  statsLoading.value = true;
  try {
    const response = await authClient.get('/api/advert_rate_limit_stats');
    if (response.data?.success) {
      rateLimitStats.value = response.data.data;
    }
  } catch (err) {
    console.error('Failed to fetch rate limit stats:', err);
  } finally {
    statsLoading.value = false;
  }
};

// Load current values into form
watch(
  [rateLimitConfig, penaltyConfig, adaptiveConfig],
  () => {
    if (!isEditing.value) {

      // Rate limit
      rateLimitEnabled.value = rateLimitConfig.value.enabled ?? false;
      bucketCapacity.value = rateLimitConfig.value.bucket_capacity ?? 2;
      refillTokens.value = rateLimitConfig.value.refill_tokens ?? 1;
      refillIntervalHours.value = Math.round(
        (rateLimitConfig.value.refill_interval_seconds ?? 36000) / 3600,
      );
      minIntervalMinutes.value = Math.round((rateLimitConfig.value.min_interval_seconds ?? 0) / 60);

      // Penalty box
      penaltyEnabled.value = penaltyConfig.value.enabled ?? false;
      violationThreshold.value = penaltyConfig.value.violation_threshold ?? 2;
      violationDecayHours.value = Math.round(
        (penaltyConfig.value.violation_decay_seconds ?? 43200) / 3600,
      );
      basePenaltyHours.value = Math.round(
        (penaltyConfig.value.base_penalty_seconds ?? 21600) / 3600,
      );
      penaltyMultiplier.value = penaltyConfig.value.penalty_multiplier ?? 2.0;
      maxPenaltyHours.value = Math.round((penaltyConfig.value.max_penalty_seconds ?? 86400) / 3600);

      // Adaptive
      adaptiveEnabled.value = adaptiveConfig.value.enabled ?? false;
      ewmaAlpha.value = adaptiveConfig.value.ewma_alpha ?? 0.1;
      hysteresisMinutes.value = Math.round((adaptiveConfig.value.hysteresis_seconds ?? 300) / 60);
      quietMax.value = thresholds.value.quiet_max ?? 0.05;
      normalMax.value = thresholds.value.normal_max ?? 0.2;
      busyMax.value = thresholds.value.busy_max ?? 0.5;
    }
  },
  { immediate: true },
);

onMounted(() => {
  fetchStats();
});

const reloadFormValues = () => {
  // Rate limit
  rateLimitEnabled.value = rateLimitConfig.value.enabled ?? false;
  bucketCapacity.value = rateLimitConfig.value.bucket_capacity ?? 2;
  refillTokens.value = rateLimitConfig.value.refill_tokens ?? 1;
  refillIntervalHours.value = Math.round(
    (rateLimitConfig.value.refill_interval_seconds ?? 36000) / 3600,
  );
  minIntervalMinutes.value = Math.round((rateLimitConfig.value.min_interval_seconds ?? 0) / 60);

  // Penalty box
  penaltyEnabled.value = penaltyConfig.value.enabled ?? false;
  violationThreshold.value = penaltyConfig.value.violation_threshold ?? 2;
  violationDecayHours.value = Math.round(
    (penaltyConfig.value.violation_decay_seconds ?? 43200) / 3600,
  );
  basePenaltyHours.value = Math.round((penaltyConfig.value.base_penalty_seconds ?? 21600) / 3600);
  penaltyMultiplier.value = penaltyConfig.value.penalty_multiplier ?? 2.0;
  maxPenaltyHours.value = Math.round((penaltyConfig.value.max_penalty_seconds ?? 86400) / 3600);

  // Adaptive
  adaptiveEnabled.value = adaptiveConfig.value.enabled ?? false;
  ewmaAlpha.value = adaptiveConfig.value.ewma_alpha ?? 0.1;
  hysteresisMinutes.value = Math.round((adaptiveConfig.value.hysteresis_seconds ?? 300) / 60);
  quietMax.value = thresholds.value.quiet_max ?? 0.05;
  normalMax.value = thresholds.value.normal_max ?? 0.2;
  busyMax.value = thresholds.value.busy_max ?? 0.5;
};

const startEditing = () => {
  isEditing.value = true;
  successMessage.value = '';
  errorMessage.value = '';
};

const cancelEditing = () => {
  isEditing.value = false;
  successMessage.value = '';
  errorMessage.value = '';
  // Reload values from store
  reloadFormValues();
};

const saveChanges = async () => {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const payload = {
      // Rate limit
      rate_limit_enabled: rateLimitEnabled.value,
      bucket_capacity: bucketCapacity.value,
      refill_tokens: refillTokens.value,
      refill_interval_seconds: refillIntervalHours.value * 3600,
      min_interval_seconds: minIntervalMinutes.value * 60,
      // Penalty box
      penalty_enabled: penaltyEnabled.value,
      violation_threshold: violationThreshold.value,
      violation_decay_seconds: violationDecayHours.value * 3600,
      base_penalty_seconds: basePenaltyHours.value * 3600,
      penalty_multiplier: penaltyMultiplier.value,
      max_penalty_seconds: maxPenaltyHours.value * 3600,
      // Adaptive
      adaptive_enabled: adaptiveEnabled.value,
      ewma_alpha: ewmaAlpha.value,
      hysteresis_seconds: hysteresisMinutes.value * 60,
      quiet_max: quietMax.value,
      normal_max: normalMax.value,
      busy_max: busyMax.value,
    };

    const response = await authClient.post('/api/update_advert_rate_limit_config', payload);
    const data = response.data;

    if (data.success) {
      successMessage.value = data.data?.message || 'Settings saved successfully';

      // Fetch updated config from backend first
      await systemStore.fetchStats();

      await fetchStats();

      // Wait for Vue reactivity to update computed values from store
      await nextTick();

      // Reload form values from updated store
      reloadFormValues();

      // Exit edit mode AFTER reloading to prevent watch from loading stale values
      isEditing.value = false;
      setTimeout(() => {
        successMessage.value = '';
      }, 3000);
    } else {
      errorMessage.value = data.error || 'Failed to save settings';
      console.error('[AdvertSettings] Save failed:', data.error);
    }
  } catch (error: any) {
    console.error('Failed to save advert settings:', error);
    errorMessage.value = error.response?.data?.error || 'Failed to save settings';
  } finally {
    isSaving.value = false;
  }
};

// Computed display values
const currentTier = computed(() => rateLimitStats.value?.adaptive?.current_tier || 'unknown');
const tierBadgeClass = computed(() => {
  switch (currentTier.value) {
    case 'quiet':
      return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500';
    case 'normal':
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500';
    case 'busy':
      return 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500';
    case 'congested':
      return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500';
    default:
      return 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500';
  }
});
</script>

<template>
  <div ref="rootEl" class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Advert Limits</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Configure advertisement rate limiting and adaptive controls</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          @click="showHelp = true"
          class="self-stretch flex items-center justify-center px-3 text-xs bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-500/50 transition-colors"
          title="How rate limiting works"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
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

    <!-- Current Status Card -->
    <div class="cfg-section space-y-3">
      <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary">
        Current Status
      </h3>

      <!-- Loading State -->
      <div v-if="statsLoading && !rateLimitStats" class="flex items-center justify-center py-4">
        <div
          class="animate-spin w-5 h-5 border-2 border-stroke-subtle dark:border-stroke/20 border-t-cyan-500 dark:border-t-primary rounded-full"
        ></div>
        <span class="ml-2 text-sm text-content-muted">Loading stats...</span>
      </div>

      <!-- No Stats Available -->
      <div v-else-if="!rateLimitStats" class="text-center py-4">
        <p class="text-xs text-content-muted dark:text-content-muted">
          Stats not available. Click "Refresh Stats" to load.
        </p>
      </div>

      <!-- Stats Grid -->
      <template v-else>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-content-muted dark:text-content-muted">Mesh Tier</div>
            <div
              :class="[
                'mt-1 px-2 py-0.5 rounded border text-xs font-medium inline-block',
                tierBadgeClass,
              ]"
            >
              {{ currentTier.toUpperCase() }}
            </div>
          </div>
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-content-muted dark:text-content-muted">Adverts/min</div>
            <div class="text-lg font-mono text-content-primary dark:text-content-primary">
              {{ rateLimitStats.metrics?.adverts_per_min_ewma?.toFixed(2) || '0.00' }}
            </div>
          </div>
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-content-muted dark:text-content-muted">Allowed</div>
            <div class="text-lg font-mono text-green-600 dark:text-green-400">
              {{ rateLimitStats.stats?.adverts_allowed || 0 }}
            </div>
          </div>
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-content-muted dark:text-content-muted">Dropped</div>
            <div class="text-lg font-mono text-red-600 dark:text-red-400">
              {{ rateLimitStats.stats?.adverts_dropped || 0 }}
            </div>
          </div>
        </div>

        <div
          v-if="Object.keys(rateLimitStats.active_penalties || {}).length > 0"
          class="mt-2 p-2 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/30"
        >
          <div class="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
            Active Penalties
          </div>
          <div
            v-for="(remaining, pubkey) in rateLimitStats.active_penalties"
            :key="pubkey"
            class="text-xs font-mono text-red-600 dark:text-red-400"
          >
            {{ pubkey }}... - {{ Math.round(remaining) }}s remaining
          </div>
        </div>

        <div
          v-if="rateLimitStats.recent_drops && rateLimitStats.recent_drops.length > 0"
          class="mt-2 p-2 bg-orange-50 dark:bg-orange-500/10 rounded-lg border border-orange-200 dark:border-orange-500/30"
        >
          <div class="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">
            Recently Dropped Adverts
          </div>
          <div
            v-for="(drop, idx) in rateLimitStats.recent_drops"
            :key="idx"
            class="text-xs text-orange-600 dark:text-orange-400 py-0.5"
          >
            <span class="font-medium">{{ drop.name }}</span>
            <span class="font-mono text-[10px] opacity-70">({{ drop.pubkey }}...)</span>
            <span class="text-[10px]"> - {{ drop.reason }} ({{ drop.seconds_ago }}s ago)</span>
          </div>
        </div>
      </template>

      <!-- How the three systems work together -->
      <div
        class="mt-3 p-3 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 rounded-lg"
      >
        <p class="text-xs text-cyan-700 dark:text-cyan-300 leading-relaxed">
          <strong>There are three layers of advert rate limit control:</strong> Each layer can be enabled/disabled
          independently and the others will still function.
        </p>
        <ul class="text-xs text-cyan-700 dark:text-cyan-300 mt-2 space-y-1 ml-4 list-disc">
          <li>
            <strong>Rate Limiting OFF:</strong> All limiting disabled — adverts pass through freely
          </li>
          <li>
            <strong>Adaptive OFF:</strong> Token bucket uses fixed limits (no tier scaling), penalty
            box still works
          </li>
          <li>
            <strong>Penalty Box OFF:</strong> Token bucket still applies, but no escalating
            cooldowns for repeat offenders
          </li>
        </ul>
        <p class="text-xs text-cyan-700 dark:text-cyan-300 mt-2">
          <strong>Decision flow when all enabled:</strong> Adaptive tier check → Penalty box check →
          Token bucket check → Violation recording (triggers penalty box)
        </p>
        <p class="text-xs text-cyan-700 dark:text-cyan-300 mt-1">
          <strong>Activity tiers:</strong>
          <span class="text-green-600 dark:text-green-400 font-medium">Quiet</span> (bypass
          limiting) →
          <span class="text-blue-600 dark:text-blue-400 font-medium">Normal</span> (lighter: 0.5x
          intervals) →
          <span class="text-yellow-600 dark:text-yellow-400 font-medium">Busy</span> (base: 1.0x
          intervals) →
          <span class="text-red-600 dark:text-red-400 font-medium">Congested</span> (stricter: 2.0x
          intervals)
        </p>
        <p class="text-xs text-cyan-700 dark:text-cyan-300 mt-1">
          <strong>Note:</strong> Adaptive mode scales refill/min-interval timing; bucket capacity
          stays at the configured base value.
        </p>
      </div>
    </div>

    <!-- Rate Limit Settings -->
    <div class="cfg-section space-y-3">
      <h3
        class="text-lg font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Token Bucket Rate Limiting
      </h3>
      <p class="text-xs text-content-muted dark:text-content-muted">
        Controls how many adverts each pubkey can send in a given time period.
      </p>

      <!-- Enabled Toggle -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Rate Limiting</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ rateLimitEnabled ? 'Enabled' : 'Disabled' }}
        </div>
        <select
          v-else
          v-model="rateLimitEnabled"
          class="cfg-select w-full sm:w-32"
        >
          <option :value="true">Enabled</option>
          <option :value="false">Disabled</option>
        </select>
      </div>

      <!-- Bucket Capacity -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Bucket Capacity</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">Max burst size (adverts)</p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ bucketCapacity }}
        </div>
        <input
          v-else
          v-model.number="bucketCapacity"
          type="number"
          min="1"
          max="10"
          class="cfg-input w-full sm:w-24"
        />
      </div>

      <!-- Refill Interval -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Refill Interval</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">
            Time between token refills
          </p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ refillIntervalHours }} hours
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="refillIntervalHours"
            type="number"
            min="1"
            max="48"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">hours</span>
        </div>
      </div>

      <!-- Min Interval -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Minimum Interval</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">
            Hard minimum between adverts
          </p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ minIntervalMinutes }} min
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="minIntervalMinutes"
            type="number"
            min="0"
            max="1440"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">min</span>
        </div>
      </div>
    </div>

    <!-- Penalty Box Settings -->
    <div class="cfg-section space-y-3">
      <h3
        class="text-lg font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
        Penalty Box (Repeat Offenders)
      </h3>
      <p class="text-xs text-content-muted dark:text-content-muted">
        Applies escalating cooldowns to pubkeys that repeatedly violate limits.
      </p>

      <!-- Enabled Toggle -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Penalty Box</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ penaltyEnabled ? 'Enabled' : 'Disabled' }}
        </div>
        <select
          v-else
          v-model="penaltyEnabled"
          class="cfg-select w-full sm:w-32"
        >
          <option :value="true">Enabled</option>
          <option :value="false">Disabled</option>
        </select>
      </div>

      <!-- Violation Threshold -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Violation Threshold</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">
            Violations before penalty
          </p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ violationThreshold }}
        </div>
        <input
          v-else
          v-model.number="violationThreshold"
          type="number"
          min="1"
          max="10"
          class="cfg-input w-full sm:w-24"
        />
      </div>

      <!-- Base Penalty -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Base Penalty Duration</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">First penalty duration</p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ basePenaltyHours }} hours
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="basePenaltyHours"
            type="number"
            min="1"
            max="48"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">hours</span>
        </div>
      </div>

      <!-- Penalty Multiplier -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Penalty Multiplier</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">Escalation factor</p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ penaltyMultiplier }}x
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="penaltyMultiplier"
            type="number"
            min="1"
            max="5"
            step="0.5"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">x</span>
        </div>
      </div>

      <!-- Max Penalty -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 gap-1">
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Max Penalty Duration</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">Maximum cooldown cap</p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ maxPenaltyHours }} hours
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="maxPenaltyHours"
            type="number"
            min="1"
            max="168"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">hours</span>
        </div>
      </div>
    </div>

    <!-- Adaptive Settings -->
    <div class="cfg-section space-y-3">
      <h3
        class="text-lg font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Adaptive Rate Limiting
      </h3>

      <!-- Enabled Toggle -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
          >Adaptive Mode</span
        >
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ adaptiveEnabled ? 'Enabled' : 'Disabled' }}
        </div>
        <select
          v-else
          v-model="adaptiveEnabled"
          class="cfg-select w-full sm:w-32"
        >
          <option :value="true">Enabled</option>
          <option :value="false">Disabled</option>
        </select>
      </div>

      <!-- Hysteresis -->
      <div
        class="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b border-stroke-subtle dark:border-stroke/10 gap-1"
      >
        <div>
          <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm"
            >Tier Change Delay</span
          >
          <p class="text-xs text-content-muted dark:text-content-muted">Prevents tier flapping</p>
        </div>
        <div
          v-if="!isEditing"
          class="text-content-primary dark:text-content-primary font-mono text-sm"
        >
          {{ hysteresisMinutes }} min
        </div>
        <div v-else class="flex items-center gap-2">
          <input
            v-model.number="hysteresisMinutes"
            type="number"
            min="0"
            max="60"
            class="cfg-input w-20"
          />
          <span class="text-content-muted text-sm">min</span>
        </div>
      </div>

      <!-- Tier Thresholds -->
      <div class="py-2">
        <span class="text-content-secondary dark:text-content-muted text-xs sm:text-sm mb-2 block"
          >Activity Tier Thresholds (adverts/min)</span
        >
        <div class="grid grid-cols-3 gap-2 mt-2">
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-green-600 dark:text-green-400 mb-1">Quiet Max</div>
            <div
              v-if="!isEditing"
              class="font-mono text-sm text-content-primary dark:text-content-primary"
            >
              {{ quietMax }}
            </div>
            <input
              v-else
              v-model.number="quietMax"
              type="number"
              min="0"
              max="1"
              step="0.01"
              class="cfg-input w-full py-1 text-center"
            />
          </div>
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Normal Max</div>
            <div
              v-if="!isEditing"
              class="font-mono text-sm text-content-primary dark:text-content-primary"
            >
              {{ normalMax }}
            </div>
            <input
              v-else
              v-model.number="normalMax"
              type="number"
              min="0"
              max="5"
              step="0.01"
              class="cfg-input w-full py-1 text-center"
            />
          </div>
          <div class="text-center p-2 bg-white dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-white/10">
            <div class="text-xs text-yellow-600 dark:text-yellow-400 mb-1">Busy Max</div>
            <div
              v-if="!isEditing"
              class="font-mono text-sm text-content-primary dark:text-content-primary"
            >
              {{ busyMax }}
            </div>
            <input
              v-else
              v-model.number="busyMax"
              type="number"
              min="0"
              max="10"
              step="0.01"
              class="cfg-input w-full py-1 text-center"
            />
          </div>
        </div>
        <p class="text-xs text-content-muted dark:text-content-muted mt-2">
          Above Busy Max = Congested tier (strictest limiting)
        </p>
      </div>
    </div>

    <!-- Help Dialog -->
    <div
      v-if="showHelp"
      class="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      @click.self="showHelp = false"
    >
      <div
        class="bg-background dark:bg-background-dark rounded-lg shadow-xl max-w-3xl w-full my-8"
        @click.stop
      >
        <div class="p-6 space-y-4">
          <!-- Header -->
          <div class="flex justify-between items-start">
            <h2 class="text-xl font-semibold text-content-primary dark:text-content-primary">
              How Advert Rate Limiting Works
            </h2>
            <button
              @click="showHelp = false"
              class="text-content-muted hover:text-content-primary dark:text-content-muted dark:hover:text-content-primary"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Understanding Mesh Behavior -->
          <div
            class="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-4 border border-blue-200 dark:border-blue-500/30"
          >
            <h3 class="font-semibold text-blue-900 dark:text-blue-400 mb-2">
              Why you may see the same advert more than once
            </h3>
            <p class="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              Mesh traffic can reach your repeater through different paths, so duplicate advert
              packets are expected.
            </p>
            <ul
              class="text-sm text-blue-800 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside"
            >
              <li>First copy arrives and is forwarded</li>
              <li>Second copy arrives through another repeater path</li>
              <li>Later copies may be dropped once limits are hit</li>
            </ul>
            <p class="text-sm text-blue-800 dark:text-blue-300 mt-2">
              This is normal behavior and helps prevent repeated rebroadcasts from flooding the
              mesh.
            </p>
          </div>

          <!-- Token Bucket -->
          <div class="space-y-2">
            <h3
              class="font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Token Bucket Rate Limiting
            </h3>
            <p class="text-sm text-content-secondary dark:text-content-muted leading-relaxed">
              Each sender has a token bucket. Every forwarded advert uses one token.
            </p>
            <ul
              class="text-sm text-content-secondary dark:text-content-muted space-y-1 list-disc list-inside ml-4"
            >
              <li><strong>Bucket Capacity:</strong> How many adverts can pass in a burst.</li>
              <li><strong>Refill Rate:</strong> How quickly tokens come back over time.</li>
              <li>
                <strong>Min Interval:</strong> Optional gap between adverts from the same sender
                (usually set to 0).
              </li>
            </ul>
            <div
              class="mt-2 p-3 bg-background-mute dark:bg-white/5 rounded text-xs font-mono text-content-muted dark:text-content-muted"
            >
              Example (capacity 2):<br />
              - Copy 1 forwarded (2 → 1 tokens)<br />
              - Copy 2 forwarded (1 → 0 tokens)<br />
              - Copy 3 dropped (no tokens left)
            </div>
          </div>

          <!-- Penalty Box -->
          <div class="space-y-2">
            <h3
              class="font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Penalty Box (Repeat Offenders)
            </h3>
            <p class="text-sm text-content-secondary dark:text-content-muted leading-relaxed">
              If a sender keeps hitting the limit, it is temporarily blocked.
            </p>
            <ul
              class="text-sm text-content-secondary dark:text-content-muted space-y-1 list-disc list-inside ml-4"
            >
              <li><strong>Violation Threshold:</strong> How many hits before penalty starts.</li>
              <li><strong>Base Penalty:</strong> First block duration.</li>
              <li><strong>Multiplier:</strong> Repeated penalties get longer.</li>
              <li><strong>Decay Time:</strong> Violations age out after stable behavior.</li>
            </ul>
          </div>

          <!-- Adaptive Mode -->
          <div class="space-y-2">
            <h3
              class="font-semibold text-content-primary dark:text-content-primary flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Adaptive Mesh Activity Tiers
            </h3>
            <p class="text-sm text-content-secondary dark:text-content-muted leading-relaxed">
              Adaptive mode adjusts limits based on recent advert activity.
            </p>
            <div
              class="mt-2 p-3 bg-background-mute dark:bg-white/5 rounded-lg text-sm text-content-secondary dark:text-content-muted"
            >
              <span class="font-semibold">How Congestion is Measured:</span>
              <ul class="mt-1 space-y-1 list-disc list-inside ml-2">
                <li>
                  <strong>What is counted:</strong> Advert packets only (not chat/data traffic)
                </li>
                <li>
                  <strong>Smoothing:</strong> 60-second EWMA to avoid reacting to short spikes
                </li>
                <li><strong>Score:</strong> Tier is based on adverts per minute</li>
                <li><strong>Hysteresis:</strong> Tier changes must hold for 5 minutes</li>
              </ul>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div class="p-2 bg-green-50 dark:bg-green-500/10 rounded border border-green-500/30">
                <div class="text-xs font-semibold text-green-700 dark:text-green-400">QUIET</div>
                <div class="text-xs text-green-600 dark:text-green-500">Activity &lt; 0.05/min</div>
                <div class="text-xs text-green-700 dark:text-green-400 font-medium mt-1">
                  No rate limiting
                </div>
              </div>
              <div class="p-2 bg-blue-50 dark:bg-blue-500/10 rounded border border-blue-500/30">
                <div class="text-xs font-semibold text-blue-700 dark:text-blue-400">NORMAL</div>
                <div class="text-xs text-blue-600 dark:text-blue-500">Activity 0.05-0.20/min</div>
                <div class="text-xs text-blue-700 dark:text-blue-400 font-medium mt-1">
                  Light limiting (50%)
                </div>
              </div>
              <div
                class="p-2 bg-yellow-50 dark:bg-yellow-500/10 rounded border border-yellow-500/30"
              >
                <div class="text-xs font-semibold text-yellow-700 dark:text-yellow-400">BUSY</div>
                <div class="text-xs text-yellow-600 dark:text-yellow-500">
                  Activity 0.20-0.50/min
                </div>
                <div class="text-xs text-yellow-700 dark:text-yellow-400 font-medium mt-1">
                  Standard limiting (100%)
                </div>
              </div>
              <div class="p-2 bg-red-50 dark:bg-red-500/10 rounded border border-red-500/30">
                <div class="text-xs font-semibold text-red-700 dark:text-red-400">CONGESTED</div>
                <div class="text-xs text-red-600 dark:text-red-500">Activity &gt; 0.50/min</div>
                <div class="text-xs text-red-700 dark:text-red-400 font-medium mt-1">
                  Aggressive (200%)
                </div>
              </div>
            </div>
            <div
              class="mt-2 p-3 bg-background-mute dark:bg-white/5 rounded text-xs font-mono text-content-muted dark:text-content-muted"
            >
              Quick examples:<br />
              - 0.02 adverts/min →
              <span class="text-green-600 dark:text-green-400 font-semibold">QUIET</span>
              (bypass)<br />
              - 0.35 adverts/min →
              <span class="text-yellow-600 dark:text-yellow-400 font-semibold">BUSY</span> (tighter
              limits)<br />
              - 0.68 adverts/min →
              <span class="text-red-600 dark:text-red-400 font-semibold">CONGESTED</span> (strict
              limits)
            </div>
          </div>

          <!-- Recommendations -->
          <div
            class="bg-green-50 dark:bg-green-500/10 rounded-lg p-4 border border-green-200 dark:border-green-500/30"
          >
            <h3 class="font-semibold text-green-900 dark:text-green-400 mb-2">
              Recommended starting settings
            </h3>
            <ul class="text-sm text-green-800 dark:text-green-300 space-y-1 list-disc list-inside">
              <li><strong>Min Interval:</strong> 0 (disabled), let adaptive mode do the work</li>
              <li><strong>Bucket Capacity:</strong> 2-3 tokens for normal mesh propagation</li>
              <li><strong>Adaptive Mode:</strong> On</li>
              <li><strong>Penalty Box:</strong> On</li>
            </ul>
          </div>

          <!-- Close Button -->
          <div class="flex justify-end pt-4 border-t border-stroke-subtle dark:border-stroke/20">
            <button
              @click="showHelp = false"
              class="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-content-primary dark:text-content-primary rounded-lg border border-primary/50 transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
