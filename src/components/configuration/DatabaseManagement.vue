<template>
  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Database</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">View database statistics and perform maintenance</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button @click="isUnlocked = !isUnlocked" class="cfg-btn-primary">
          {{ isUnlocked ? 'Lock' : 'Unlock' }}
        </button>
      </div>
    </div>

    <!-- Database Overview -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Database Overview
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Storage usage and table statistics for the repeater database.
          </p>
        </div>
        <button
          @click="loadStats"
          :disabled="loading"
          class="cfg-btn-secondary"
        >
          <span v-if="loading" class="flex items-center gap-1.5">
            <span
              class="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full inline-block"
            ></span>
            Loading…
          </span>
          <span v-else>Refresh</span>
        </button>
      </div>

      <!-- Size summary -->
      <div v-if="stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div
          class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10"
        >
          <p class="text-xs text-content-muted mb-1">Database Size</p>
          <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">
            {{ formatBytes(stats.database_size_bytes) }}
          </p>
        </div>
        <div
          class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10"
        >
          <p class="text-xs text-content-muted mb-1">RRD Metrics</p>
          <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">
            {{ formatBytes(stats.rrd_size_bytes) }}
          </p>
        </div>
        <div
          class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10"
        >
          <p class="text-xs text-content-muted mb-1">Total Size</p>
          <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">
            {{ formatBytes(stats.database_size_bytes + stats.rrd_size_bytes) }}
          </p>
        </div>
        <div
          class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10"
        >
          <p class="text-xs text-content-muted mb-1">Total Rows</p>
          <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">
            {{ totalRows.toLocaleString() }}
          </p>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading && !stats" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div
            class="animate-spin w-8 h-8 border-2 border-stroke-subtle dark:border-stroke/20 border-t-cyan-500 dark:border-t-primary rounded-full mx-auto mb-4"
          ></div>
          <div class="text-content-secondary dark:text-content-muted">Loading database info…</div>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="rounded-lg border border-red-500/30 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 p-3 mb-4"
      >
        <p class="text-xs text-red-700 dark:text-red-400">{{ error }}</p>
      </div>

      <!-- Table list -->
      <div v-if="stats && stats.tables.length > 0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-stroke-subtle dark:border-stroke/10">
                <th
                  class="text-left py-2 pr-4 text-xs font-medium text-content-muted uppercase tracking-wider"
                >
                  Table
                </th>
                <th
                  class="text-right py-2 pr-4 text-xs font-medium text-content-muted uppercase tracking-wider"
                >
                  Rows
                </th>
                <th
                  class="text-right py-2 pr-4 text-xs font-medium text-content-muted uppercase tracking-wider hidden sm:table-cell"
                >
                  Date Range
                </th>
                <th
                  class="text-right py-2 text-xs font-medium text-content-muted uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="table in stats.tables"
                :key="table.name"
                class="border-b border-stroke-subtle/50 dark:border-stroke/5"
              >
                <td class="py-2.5 pr-4">
                  <span class="font-mono text-content-primary dark:text-content-primary">{{
                    table.name
                  }}</span>
                </td>
                <td class="py-2.5 pr-4 text-right">
                  <span class="font-mono text-content-secondary dark:text-content-muted">
                    {{ table.row_count.toLocaleString() }}
                  </span>
                </td>
                <td class="py-2.5 pr-4 text-right hidden sm:table-cell">
                  <span
                    v-if="table.has_timestamp && table.row_count > 0"
                    class="text-xs text-content-muted"
                  >
                    {{ formatDateShort(table.oldest_timestamp) }} —
                    {{ formatDateShort(table.newest_timestamp) }}
                    <span class="text-content-muted/60 ml-1"
                      >({{ dateDays(table.oldest_timestamp, table.newest_timestamp) }}d)</span
                    >
                  </span>
                  <span v-else-if="table.row_count === 0" class="text-xs text-content-muted/50"
                    >—</span
                  >
                  <span v-else class="text-xs text-content-muted/50">n/a</span>
                </td>
                <td class="py-2.5 text-right">
                  <button
                    v-if="isUnlocked && isPurgeable(table.name) && table.row_count > 0"
                    @click="confirmPurge(table.name, table.row_count)"
                    :disabled="purging[table.name]"
                    class="px-2.5 py-1 bg-red-500/10 dark:bg-red-400/10 hover:bg-red-500/20 dark:hover:bg-red-400/20 text-red-700 dark:text-red-400 rounded border border-red-500/30 dark:border-red-400/20 transition-colors text-xs disabled:opacity-50"
                  >
                    <span v-if="purging[table.name]" class="flex items-center gap-1">
                      <span
                        class="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full inline-block"
                      ></span>
                      Purging…
                    </span>
                    <span v-else>Empty</span>
                  </button>
                  <span v-else-if="!isPurgeable(table.name)" class="text-xs text-content-muted/50"
                    >—</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Purge Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="purgeConfirm"
        class="modal-backdrop-heavy"
        @click.self="!purgeConfirm.executing && (purgeConfirm = null)"
      >
        <div
          class="modal-card max-w-lg"
          @click.stop
        >
          <div class="flex items-start gap-3 mb-5">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary">
                {{ purgeConfirm.table === 'all' ? 'Purge All Tables' : `Purge "${purgeConfirm.table}"` }}
              </h3>
              <p class="text-sm text-content-secondary dark:text-content-muted mt-1">
                <template v-if="purgeConfirm.table === 'all'">
                  This will permanently delete <strong class="text-content-primary dark:text-content-primary">all data</strong> from every data table ({{ totalRows.toLocaleString() }} rows total). This cannot be undone.
                </template>
                <template v-else>
                  This will permanently delete <strong class="text-content-primary dark:text-content-primary">{{ purgeConfirm.rowCount.toLocaleString() }} rows</strong> from <strong class="text-content-primary dark:text-content-primary font-mono">{{ purgeConfirm.table }}</strong>. This cannot be undone.
                </template>
              </p>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              @click="purgeConfirm = null"
              :disabled="purgeConfirm.executing"
              class="flex-1 px-4 py-3 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/20 text-content-primary dark:text-content-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="executePurge"
              :disabled="purgeConfirm.executing"
              class="flex-1 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {{ purgeConfirm.executing ? 'Purging…' : 'Yes, Delete Data' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Bulk Actions -->
    <div class="cfg-section">
      <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-4">
        Maintenance
      </h3>
      <div class="flex flex-wrap gap-3">
        <!-- Purge All -->
        <button
          @click="confirmPurge('all', totalRows)"
          :disabled="!stats || totalRows === 0 || !isUnlocked"
          class="px-4 py-2 bg-red-500/20 dark:bg-red-400/20 hover:bg-red-500/30 dark:hover:bg-red-400/30 text-red-900 dark:text-red-200 rounded-lg border border-red-500/50 dark:border-red-400/40 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Purge All Data
          </span>
        </button>

        <!-- Vacuum -->
        <button
          @click="runVacuum"
          :disabled="vacuuming || !stats"
          class="cfg-btn-primary"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {{ vacuuming ? 'Compacting…' : 'Compact Database' }}
          </span>
        </button>
      </div>

      <p v-if="vacuumResult" class="text-xs text-green-600 dark:text-green-400 mt-3">
        {{ vacuumResult }}
      </p>
      <p v-if="purgeSuccess" class="text-xs text-green-600 dark:text-green-400 mt-3">
        {{ purgeSuccess }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ApiService from '@/utils/api';
import { formatBytes, formatDateShort } from '@/utils/formatters';

interface TableInfo {
  name: string;
  row_count: number;
  oldest_timestamp?: number;
  newest_timestamp?: number;
  has_timestamp: boolean;
}

interface DbStats {
  database_size_bytes: number;
  rrd_size_bytes: number;
  tables: TableInfo[];
}

const PURGEABLE_TABLES = new Set([
  'packets',
  'adverts',
  'noise_floor',
  'crc_errors',
  'room_messages',
  'room_client_sync',
  'companion_contacts',
  'companion_channels',
  'companion_messages',
  'companion_prefs',
]);

const isUnlocked = ref(false);
const loading = ref(false);
const error = ref('');
const stats = ref<DbStats | null>(null);
const purging = ref<Record<string, boolean>>({});
const purgeConfirm = ref<{ table: string; rowCount: number; executing: boolean } | null>(null);
const purgeSuccess = ref('');
const vacuuming = ref(false);
const vacuumResult = ref('');

const totalRows = computed(() => {
  if (!stats.value) return 0;
  return stats.value.tables.reduce((sum, t) => sum + t.row_count, 0);
});

function isPurgeable(name: string) {
  return PURGEABLE_TABLES.has(name);
}

function dateDays(oldest?: number, newest?: number): number {
  if (!oldest || !newest) return 0;
  return Math.max(1, Math.round((newest - oldest) / 86400));
}

async function loadStats() {
  loading.value = true;
  error.value = '';
  try {
    const res = await ApiService.getDbStats();
    if (res.success && res.data) {
      stats.value = res.data;
    } else {
      error.value = res.error || 'Failed to load database stats';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load database stats';
  } finally {
    loading.value = false;
  }
}

function confirmPurge(table: string, rowCount: number) {
  purgeSuccess.value = '';
  purgeConfirm.value = { table, rowCount, executing: false };
}

async function executePurge() {
  if (!purgeConfirm.value) return;
  const { table } = purgeConfirm.value;
  purgeConfirm.value.executing = true;
  purgeSuccess.value = '';

  try {
    const tables = table === 'all' ? ('all' as const) : [table];
    if (table !== 'all') purging.value[table] = true;

    const res = await ApiService.purgeTable(tables);
    if (res.success) {
      const data = res.data || {};
      const totalDeleted = Object.values(data).reduce((sum, r) => sum + (r.deleted || 0), 0);
      purgeSuccess.value = `Deleted ${totalDeleted.toLocaleString()} rows${table === 'all' ? ' from all tables' : ` from ${table}`}.`;
      purgeConfirm.value = null;
      await loadStats();
    } else {
      error.value = res.error || 'Purge failed';
      purgeConfirm.value = null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Purge failed';
    purgeConfirm.value = null;
  } finally {
    if (table !== 'all') purging.value[table] = false;
  }
}

async function runVacuum() {
  vacuuming.value = true;
  vacuumResult.value = '';
  error.value = '';
  try {
    const res = await ApiService.vacuumDb();
    if (res.success && res.data) {
      const freed = res.data.freed_bytes;
      vacuumResult.value =
        freed > 0
          ? `Compacted database — freed ${formatBytes(freed)} (${formatBytes(res.data.size_before)} → ${formatBytes(res.data.size_after)}).`
          : `Database already compact (${formatBytes(res.data.size_after)}).`;
      await loadStats();
    } else {
      error.value = res.error || 'Vacuum failed';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Vacuum failed';
  } finally {
    vacuuming.value = false;
  }
}

onMounted(loadStats);
</script>
