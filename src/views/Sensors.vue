<script setup lang="ts">
import { computed } from 'vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import { useSystemStore } from '@/stores/system';

defineOptions({ name: 'SensorsView' });

interface SensorReading {
  name?: string;
  type?: string;
  ok?: boolean;
  timestamp?: string | null;
  error?: string;
  data?: Record<string, unknown>;
}

interface SensorsSummary {
  enabled?: boolean;
  poll_interval_seconds?: number;
  configured?: number;
  loaded?: number;
  running?: boolean;
  readings?: SensorReading[];
}

const systemStore = useSystemStore();

const sensors = computed<SensorsSummary | null>(() => {
  const stats = systemStore.stats as { sensors?: SensorsSummary } | null;
  return stats?.sensors ?? null;
});

const readingRows = computed(() => sensors.value?.readings ?? []);

const summaryCards = computed(() => {
  const s = sensors.value;
  if (!s) {
    return [
      { label: 'Enabled', value: 'n/a' },
      { label: 'Running', value: 'n/a' },
      { label: 'Configured', value: 'n/a' },
      { label: 'Poll Interval', value: 'n/a' },
    ];
  }

  return [
    { label: 'Enabled', value: s.enabled ? 'Yes' : 'No' },
    { label: 'Running', value: s.running ? 'Yes' : 'No' },
    { label: 'Configured / Loaded', value: `${s.configured ?? 0} / ${s.loaded ?? 0}` },
    {
      label: 'Poll Interval',
      value:
        typeof s.poll_interval_seconds === 'number'
          ? `${s.poll_interval_seconds.toFixed(1)}s`
          : 'n/a',
    },
  ];
});

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'n/a';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const refreshNow = async () => {
  await systemStore.fetchStats();
};

useManagedPolling(
  async () => {
    await systemStore.fetchStats();
  },
  { intervalMs: 10_000, immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <div class="glass-card rounded-[15px] p-4 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl sm:text-2xl font-semibold text-content-heading dark:text-white">Sensors</h1>
          <p class="mt-1 text-sm text-content-muted">
            Live sensor summary from the existing stats API.
          </p>
        </div>
        <button
          class="rounded-[10px] border border-stroke-subtle dark:border-white/10 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          @click="refreshNow"
        >
          Refresh
        </button>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="card in summaryCards"
          :key="card.label"
          class="rounded-[12px] border border-stroke-subtle dark:border-white/10 p-3"
        >
          <p class="text-xs uppercase tracking-wide text-content-muted">{{ card.label }}</p>
          <p class="mt-2 text-lg font-semibold text-content-heading dark:text-white">{{ card.value }}</p>
        </div>
      </div>
    </div>

    <div v-if="!sensors" class="glass-card rounded-[15px] p-5 text-content-muted">
      Sensor data is not available yet. Ensure the repeater has started and stats are loading.
    </div>

    <div
      v-for="(reading, idx) in readingRows"
      :key="`${reading.name || 'sensor'}-${idx}`"
      class="glass-card rounded-[15px] p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-content-heading dark:text-white">
            {{ reading.name || `Sensor ${idx + 1}` }}
          </h2>
          <p class="text-sm text-content-muted">Type: {{ reading.type || 'unknown' }}</p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="reading.ok ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'"
        >
          {{ reading.ok ? 'OK' : 'Error' }}
        </span>
      </div>

      <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div class="text-sm">
          <span class="text-content-muted">Timestamp:</span>
          <span class="ml-2 text-content-heading dark:text-white">{{ formatTime(reading.timestamp) }}</span>
        </div>
        <div v-if="reading.error" class="text-sm">
          <span class="text-content-muted">Error:</span>
          <span class="ml-2 text-red-600 dark:text-red-300">{{ reading.error }}</span>
        </div>
      </div>

      <div class="mt-4 overflow-x-auto rounded-[12px] border border-stroke-subtle dark:border-white/10">
        <table class="min-w-full text-sm">
          <thead class="bg-black/5 dark:bg-white/5">
            <tr>
              <th class="px-3 py-2 text-left text-content-muted">Field</th>
              <th class="px-3 py-2 text-left text-content-muted">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(value, key) in (reading.data || {})"
              :key="String(key)"
              class="border-t border-stroke-subtle dark:border-white/10"
            >
              <td class="px-3 py-2 font-medium text-content-heading dark:text-white">{{ key }}</td>
              <td class="px-3 py-2 text-content-muted break-all">{{ formatValue(value) }}</td>
            </tr>
            <tr v-if="!reading.data || Object.keys(reading.data).length === 0">
              <td class="px-3 py-3 text-content-muted" colspan="2">No fields in payload</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="sensors && readingRows.length === 0"
      class="glass-card rounded-[15px] p-5 text-content-muted"
    >
      Sensors are configured but no readings are available yet.
    </div>
  </div>
</template>
