<template>
  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Memory</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Diagnose memory usage and trace allocations</p>
      </div>
    </div>

    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Memory Diagnostics
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Trace memory allocations to find leaks. Tracing adds overhead — only enable when needed.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="tracing && hasData"
            @click="fetchStatus"
            :disabled="loading"
            class="cfg-btn-secondary"
          >
            <span v-if="loading" class="flex items-center gap-1.5">
              <Spinner size="xs" color="current" class="inline-block" />
              Checking…
            </span>
            <span v-else>Check Again</span>
          </button>
          <button
            @click="toggleTracing"
            :disabled="toggling"
            class="px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50"
            :class="tracing
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-400 border-red-500/50'
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-400 border-green-500/50'"
          >
            <span v-if="toggling" class="flex items-center gap-1.5">
              <Spinner size="xs" color="current" class="inline-block" />
              {{ tracing ? 'Stopping…' : 'Starting…' }}
            </span>
            <span v-else>{{ tracing ? 'Stop Tracing' : 'Start Tracing' }}</span>
          </button>
        </div>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <!-- RSS when tracing is off -->
      <div v-if="!tracing && rssMb !== null && !loading" class="mb-4">
        <div class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10 inline-block">
          <p class="text-xs text-content-muted mb-1">Current Memory (RSS)</p>
          <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">{{ rssMb }} MB</p>
        </div>
      </div>

      <!-- Tracing active, no data yet -->
      <div
        v-if="tracing && !hasData && !loading"
        class="p-4 rounded-lg bg-cyan-500/10 dark:bg-primary/10 border border-cyan-400/30 dark:border-primary/30"
      >
        <div class="flex items-center gap-2 text-cyan-700 dark:text-primary">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="font-medium">Tracing active</span>
        </div>
        <p class="mt-2 text-sm text-cyan-600 dark:text-primary/80">
          Memory tracing is running. Let the repeater run for a few minutes, then click
          <strong>Check Again</strong> to see which parts of the code are using more memory.
        </p>
      </div>

      <!-- Data display -->
      <div v-if="data && hasData">
        <!-- Health indicator -->
        <div class="mb-5 p-4 rounded-lg border flex items-start gap-3" :class="overallHealthClass">
          <div class="mt-0.5" v-html="overallHealthIcon"></div>
          <div>
            <p class="font-semibold text-sm">{{ overallHealthLabel }}</p>
            <p class="text-sm mt-0.5 opacity-80">{{ overallHealthDesc }}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div v-if="data.rss_mb !== undefined" class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10">
            <p class="text-xs text-content-muted mb-1">Total Memory Used</p>
            <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">{{ data.rss_mb }} MB</p>
          </div>
          <div v-if="data.traced_current_mb !== undefined" class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10">
            <p class="text-xs text-content-muted mb-1">Tracked Now</p>
            <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">{{ data.traced_current_mb }} MB</p>
          </div>
          <div v-if="data.traced_peak_mb !== undefined" class="bg-background-mute dark:bg-background/30 rounded-lg p-3 border border-stroke-subtle dark:border-stroke/10">
            <p class="text-xs text-content-muted mb-1">Peak Tracked</p>
            <p class="text-lg font-semibold text-content-primary dark:text-content-primary font-mono">{{ data.traced_peak_mb }} MB</p>
          </div>
        </div>

        <!-- Growth breakdown -->
        <div v-if="data.growth_since_baseline && data.growth_since_baseline.length > 0" class="mb-6">
          <h4 class="text-sm font-semibold text-content-primary dark:text-content-primary mb-1">Memory Growth Breakdown</h4>
          <p class="text-xs text-content-muted mb-3">
            Items at the top with red/orange tags are the most likely cause of memory issues.
            Green items are normal and can be ignored.
          </p>
          <div class="space-y-2">
            <div
              v-for="(row, i) in data.growth_since_baseline"
              :key="i"
              class="rounded-lg border p-3 transition-colors"
              :class="severityCardClass(row)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="shrink-0 text-xs font-medium text-content-muted w-5 text-right">{{ i + 1 }}</span>
                  <span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" :class="severityBadgeClass(row)">
                    {{ severityLabel(row) }}
                  </span>
                </div>
                <div class="text-right shrink-0">
                  <span class="font-mono text-sm font-semibold" :class="severityTextClass(row)">+{{ formatSize(row.size_diff_kb) }}</span>
                  <p class="text-xs text-content-muted">{{ formatSize(row.current_size_kb) }} total</p>
                </div>
              </div>
              <div class="mt-1.5 ml-7">
                <p class="text-xs font-mono text-content-secondary dark:text-content-muted break-all">{{ simplifyPath(row.file) }}</p>
                <p v-if="row.count_diff !== 0" class="text-xs text-content-muted mt-0.5">
                  {{ row.count_diff > 0 ? '+' : '' }}{{ row.count_diff }} new allocation{{ Math.abs(row.count_diff) !== 1 ? 's' : '' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- No growth -->
        <div
          v-else-if="data.growth_since_baseline && data.growth_since_baseline.length === 0"
          class="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-sm flex items-center gap-3"
        >
          <svg class="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-green-700 dark:text-green-400">No memory growth detected. Everything looks healthy.</span>
        </div>

        <!-- Advanced: current allocations -->
        <div v-if="data.current_top_20 && data.current_top_20.length > 0">
          <button
            @click="showCurrent = !showCurrent"
            class="flex items-center gap-2 text-sm font-semibold text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors mb-3"
          >
            <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-90': showCurrent }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            Advanced: Current Top Allocations
          </button>
          <Transition name="expand">
            <div v-if="showCurrent" class="overflow-x-auto rounded-lg border border-stroke-subtle dark:border-stroke/10">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-background-mute dark:bg-background/30 text-left">
                    <th class="px-3 py-2 text-xs font-medium text-content-muted">#</th>
                    <th class="px-3 py-2 text-xs font-medium text-content-muted">Location</th>
                    <th class="px-3 py-2 text-xs font-medium text-content-muted text-right">Size</th>
                    <th class="px-3 py-2 text-xs font-medium text-content-muted text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in data.current_top_20"
                    :key="i"
                    class="border-t border-stroke-subtle/50 dark:border-stroke/5 hover:bg-background-mute/50 dark:hover:bg-background/20 transition-colors"
                  >
                    <td class="px-3 py-2 text-content-muted font-mono text-xs">{{ i + 1 }}</td>
                    <td class="px-3 py-2 text-content-primary dark:text-content-primary font-mono text-xs break-all">{{ simplifyPath(row.file) }}</td>
                    <td class="px-3 py-2 text-right font-mono text-xs text-content-secondary dark:text-content-muted whitespace-nowrap">{{ formatSize(row.size_kb) }}</td>
                    <td class="px-3 py-2 text-right font-mono text-xs text-content-secondary dark:text-content-muted">{{ row.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!loading && !toggling && !tracing && !hasData && !error && rssMb === null" class="py-8 text-center text-content-muted text-sm">
        Click <strong>Start Tracing</strong> to enable memory diagnostics.
        <br />
        <span class="text-xs">Tracing uses extra memory — remember to stop it when done.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ApiService from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';

interface GrowthStat {
  file: string;
  size_diff_kb: number;
  count_diff: number;
  current_size_kb: number;
}

interface CurrentStat {
  file: string;
  size_kb: number;
  count: number;
}

interface MemoryDebugData {
  tracing?: boolean;
  message?: string;
  current_top_20?: CurrentStat[];
  growth_since_baseline?: GrowthStat[];
  rss_mb?: number;
  traced_current_mb?: number;
  traced_peak_mb?: number;
}

type Severity = 'critical' | 'warning' | 'low' | 'ok';

const loading = ref(false);
const toggling = ref(false);
const error = ref('');
const data = ref<MemoryDebugData | null>(null);
const tracing = ref(false);
const rssMb = ref<number | null>(null);
const showCurrent = ref(false);

const hasData = computed(
  () => data.value && (data.value.current_top_20 || data.value.growth_since_baseline),
);

async function fetchStatus() {
  loading.value = true;
  error.value = '';
  try {
    const res = await ApiService.get<MemoryDebugData>('memory_debug');
    if (res.success && res.data) {
      tracing.value = !!res.data.tracing;
      rssMb.value = res.data.rss_mb ?? null;
      if (res.data.current_top_20 || res.data.growth_since_baseline) {
        data.value = res.data;
      }
    } else {
      error.value = res.error || 'Failed to fetch memory status';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch memory status';
  } finally {
    loading.value = false;
  }
}

async function toggleTracing() {
  toggling.value = true;
  error.value = '';
  const action = tracing.value ? 'stop' : 'start';
  try {
    const res = await ApiService.post<MemoryDebugData>('memory_debug', { action });
    if (res.success && res.data) {
      tracing.value = !!res.data.tracing;
      if (action === 'stop') {
        data.value = null;
        rssMb.value = null;
      }
    } else {
      error.value = res.error || `Failed to ${action} tracing`;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : `Failed to ${action} tracing`;
  } finally {
    toggling.value = false;
    if (tracing.value) {
      await fetchStatus();
    }
  }
}

function getSeverity(row: GrowthStat): Severity {
  if (row.size_diff_kb >= 100) return 'critical';
  if (row.size_diff_kb >= 10) return 'warning';
  if (row.size_diff_kb >= 1) return 'low';
  return 'ok';
}

function severityLabel(row: GrowthStat): string {
  const s = getSeverity(row);
  if (s === 'critical') return 'Investigate';
  if (s === 'warning') return 'Watch';
  if (s === 'low') return 'Minor';
  return 'Normal';
}

function severityBadgeClass(row: GrowthStat): string {
  const s = getSeverity(row);
  if (s === 'critical') return 'bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30';
  if (s === 'warning') return 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30';
  if (s === 'low') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20';
  return 'bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/20';
}

function severityCardClass(row: GrowthStat): string {
  const s = getSeverity(row);
  if (s === 'critical') return 'border-red-500/40 dark:border-red-500/30 bg-red-500/5 dark:bg-red-500/5';
  if (s === 'warning') return 'border-amber-500/40 dark:border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5';
  if (s === 'low') return 'border-stroke-subtle dark:border-stroke/10 bg-background-mute/50 dark:bg-background/20';
  return 'border-stroke-subtle/50 dark:border-stroke/5 bg-background-mute/30 dark:bg-background/10 opacity-60';
}

function severityTextClass(row: GrowthStat): string {
  const s = getSeverity(row);
  if (s === 'critical') return 'text-red-600 dark:text-red-400';
  if (s === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (s === 'low') return 'text-blue-600 dark:text-blue-400';
  return 'text-green-600 dark:text-green-500';
}

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  if (kb >= 10) return `${Math.round(kb)} KB`;
  return `${kb.toFixed(1)} KB`;
}

function simplifyPath(path: string): string {
  return path
    .replace(/.*\/site-packages\//, '')
    .replace(/.*\/lib\/python[^/]*\//, '')
    .replace(/.*\/repeater\//, 'repeater/');
}

const totalGrowthKb = computed(() => {
  if (!data.value?.growth_since_baseline) return 0;
  return data.value.growth_since_baseline.reduce((sum, r) => sum + r.size_diff_kb, 0);
});

const overallHealthLevel = computed((): Severity => {
  if (totalGrowthKb.value >= 500) return 'critical';
  if (totalGrowthKb.value >= 50) return 'warning';
  if (totalGrowthKb.value >= 5) return 'low';
  return 'ok';
});

const overallHealthClass = computed(() => {
  const s = overallHealthLevel.value;
  if (s === 'critical') return 'border-red-500/40 dark:border-red-500/30 bg-red-500/10 dark:bg-red-500/10 text-red-800 dark:text-red-300';
  if (s === 'warning') return 'border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300';
  if (s === 'low') return 'border-blue-500/30 bg-blue-500/10 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300';
  return 'border-green-500/30 bg-green-500/10 dark:bg-green-500/10 text-green-800 dark:text-green-300';
});

const overallHealthIcon = computed(() => {
  const s = overallHealthLevel.value;
  if (s === 'critical')
    return '<svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>';
  if (s === 'warning')
    return '<svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>';
  if (s === 'low')
    return '<svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  return '<svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
});

const overallHealthLabel = computed(() => {
  const s = overallHealthLevel.value;
  if (s === 'critical') return 'Significant memory growth detected';
  if (s === 'warning') return 'Some memory growth detected';
  if (s === 'low') return 'Minor memory growth — likely normal';
  return 'Memory looks healthy';
});

const overallHealthDesc = computed(() => {
  const total = formatSize(totalGrowthKb.value);
  const s = overallHealthLevel.value;
  if (s === 'critical') return `Total growth: ${total}. Red items below need attention.`;
  if (s === 'warning') return `Total growth: ${total}. Orange items below may need attention over time.`;
  if (s === 'low') return `Total growth: ${total}. Nothing to worry about right now.`;
  return 'No significant growth since tracing started.';
});

onMounted(fetchStatus);
</script>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}
</style>