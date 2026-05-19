<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import ApiService from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'LogsView' });

// Types
interface LogEntry {
  message: string;
  timestamp: string;
  level: string;
}

// State
const allLogs = ref<LogEntry[]>([]);
const enabledLoggers = ref<Set<string>>(new Set());
const enabledLevels = ref<Set<string>>(new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR'])); // Default: show all levels
const allLoggers = ref<Set<string>>(new Set());
const allLevels = ref<Set<string>>(new Set());
const loading = ref(true);
const error = ref<string | null>(null);

// Auto-refresh interval
let refreshInterval: number | null = null;

// Extract logger name from log message
const extractLoggerName = (message: string): string => {
  // Format: "2025-11-18 21:26:14,333 - SQLiteHandler - DEBUG - Found 1 adverts with contact_type 'Repeater'"
  const match = message.match(/- ([^-]+) - (?:DEBUG|INFO|WARNING|ERROR) -/);
  const loggerName = match ? match[1].trim() : 'Unknown';
  return loggerName;
};

// Clean the log message by removing timestamp and service name
const cleanLogMessage = (message: string): string => {
  // Remove the timestamp and service name prefix: "2025-11-18 21:26:14,333 - SQLiteHandler - DEBUG - "
  const match = message.match(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - [^-]+ - (?:DEBUG|INFO|WARNING|ERROR) - (.+)$/,
  );
  return match ? match[1] : message;
};

// Helper to compare two sets
const setsEqual = (set1: Set<string>, set2: Set<string>): boolean => {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
};

// Load logs from API
const loadLogs = async () => {
  try {
    const response = await ApiService.getLogs();

    // The logs endpoint returns the data directly, not in the standard ApiResponse format
    if (response.logs && response.logs.length > 0) {
      allLogs.value = response.logs;

      // Extract all unique logger names
      const newLoggers = new Set<string>();
      allLogs.value.forEach((log) => {
        const loggerName = extractLoggerName(log.message);
        newLoggers.add(loggerName);
      });

      // Extract all unique log levels
      const newLevels = new Set<string>();
      allLogs.value.forEach((log) => {
        newLevels.add(log.level);
      });

      // On first load, enable all detected loggers
      if (enabledLoggers.value.size === 0) {
        enabledLoggers.value = new Set(newLoggers);
      }

      // Check if logger set has changed
      const loggersChanged = !setsEqual(allLoggers.value, newLoggers);
      const levelsChanged = !setsEqual(allLevels.value, newLevels);

      // Update allLoggers and allLevels with currently active ones
      if (loggersChanged) {
        allLoggers.value = newLoggers;
      }
      if (levelsChanged) {
        allLevels.value = newLevels;
      }

      error.value = null;
    }
  } catch (err) {
    console.error('Error loading logs:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load logs';
  } finally {
    loading.value = false;
  }
};

// Filter logs by enabled loggers and levels
const filteredLogs = computed(() => {
  const filtered = allLogs.value.filter((log) => {
    const loggerName = extractLoggerName(log.message);
    const isLoggerEnabled = enabledLoggers.value.has(loggerName);
    const isLevelEnabled = enabledLevels.value.has(log.level);
    return isLoggerEnabled && isLevelEnabled;
  });

  return filtered;
});

// Get sorted list of loggers for UI
const sortedLoggers = computed(() => {
  return Array.from(allLoggers.value).sort();
});

// Get sorted list of levels for UI (with custom order for log levels)
const sortedLevels = computed(() => {
  const levelOrder = ['ERROR', 'WARNING', 'WARN', 'INFO', 'DEBUG'];
  const levels = Array.from(allLevels.value);
  return levels.sort((a, b) => {
    const aIndex = levelOrder.indexOf(a);
    const bIndex = levelOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  });
});

// Toggle level enable/disable
const toggleLevel = (level: string) => {
  if (enabledLevels.value.has(level)) {
    enabledLevels.value.delete(level);
  } else {
    enabledLevels.value.add(level);
  }
  // Create new Set to trigger reactivity
  enabledLevels.value = new Set(enabledLevels.value);
};

// Format timestamp for display
const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// Get CSS class for log level
const getLevelClass = (level: string): string => {
  const levelMap: Record<string, string> = {
    ERROR: 'text-red-600 dark:text-red-400 bg-red-900/20',
    WARNING: 'text-yellow-600 dark:text-yellow-400 bg-yellow-900/20',
    WARN: 'text-yellow-600 dark:text-yellow-400 bg-yellow-900/20',
    INFO: 'text-blue-600 dark:text-blue-400 bg-blue-900/20',
    DEBUG: 'text-gray-400 bg-gray-900/20',
  };
  return levelMap[level] || 'text-gray-400 bg-gray-900/20';
};

// Get CSS class for level filter buttons
const getLevelFilterClass = (level: string, enabled: boolean): string => {
  if (enabled) {
    const enabledMap: Record<string, string> = {
      ERROR: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/50',
      WARNING:
        'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/50',
      WARN: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/50',
      INFO: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/50',
      DEBUG: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    };
    return enabledMap[level] || 'bg-primary/20 text-primary border-primary/50';
  } else {
    return 'bg-background-mute dark:bg-white/5 text-content-muted dark:text-white/60 border-stroke-subtle dark:border-white/20 hover:bg-stroke-subtle dark:hover:bg-white/10';
  }
};

// Toggle logger filter
const toggleLogger = (logger: string) => {
  if (enabledLoggers.value.has(logger)) {
    enabledLoggers.value.delete(logger);
  } else {
    enabledLoggers.value.add(logger);
  }
  // Create new Set to trigger reactivity
  enabledLoggers.value = new Set(enabledLoggers.value);
};

// Select all loggers
const selectAllLoggers = () => {
  enabledLoggers.value = new Set(allLoggers.value);
};

// Clear all loggers
const clearAllLoggers = () => {
  enabledLoggers.value = new Set();
};

// Select all levels
const selectAllLevels = () => {
  enabledLevels.value = new Set(allLevels.value);
};

// Clear all levels
const clearAllLevels = () => {
  enabledLevels.value = new Set();
};

// Setup auto-refresh
const startAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(loadLogs, 5000); // Refresh every 5 seconds
};

const stopAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

// Lifecycle
onMounted(() => {
  loadLogs();
  startAutoRefresh();
});

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div
      class="glass-card backdrop-blur border border-stroke-subtle dark:border-white/10 rounded-[15px] p-6"
    >
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-content-primary dark:text-content-primary text-2xl font-semibold mb-2">
            System Logs
          </h1>
          <p class="text-content-secondary dark:text-content-muted">
            Real-time system events and diagnostics
          </p>
        </div>
        <button
          @click="loadLogs"
          :disabled="loading"
          class="btn-primary flex items-center gap-2"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': loading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <!-- Filter Controls -->
      <div
        class="bg-gray-50 dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg p-4"
      >
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <span class="text-content-primary dark:text-content-primary font-medium">Filters:</span>
          <button
            @click="selectAllLoggers"
            class="btn-success-xs"
          >
            All Loggers
          </button>
          <button
            @click="clearAllLoggers"
            class="btn-danger-xs"
          >
            Clear Loggers
          </button>
          <div class="w-px h-4 bg-white/20 mx-1"></div>
          <button
            @click="selectAllLevels"
            class="btn-success-xs"
          >
            All Levels
          </button>
          <button
            @click="clearAllLevels"
            class="btn-danger-xs"
          >
            Clear Levels
          </button>
        </div>

        <!-- Combined Filter Buttons -->
        <div class="flex flex-wrap gap-2">
          <!-- Logger Filters -->
          <button
            v-for="logger in sortedLoggers"
            :key="'logger-' + logger"
            @click="toggleLogger(logger)"
            :class="[
              'px-3 py-1 text-xs border rounded-full transition-colors',
              enabledLoggers.has(logger)
                ? 'bg-primary/20 text-primary border-primary/50'
                : 'bg-background-mute dark:bg-white/5 text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke/20 hover:bg-stroke-subtle dark:hover:bg-white/10',
            ]"
          >
            {{ logger }}
          </button>

          <!-- Separator -->
          <div
            v-if="sortedLoggers.length > 0 && sortedLevels.length > 0"
            class="w-px h-6 bg-stroke-subtle dark:bg-stroke/20 mx-2 self-center"
          ></div>

          <!-- Level Filters -->
          <button
            v-for="level in sortedLevels"
            :key="'level-' + level"
            @click="toggleLevel(level)"
            :class="[
              'px-3 py-1 text-xs border rounded-full transition-colors font-medium',
              enabledLevels.has(level)
                ? getLevelFilterClass(level, true)
                : getLevelFilterClass(level, false),
            ]"
          >
            {{ level }}
          </button>
        </div>
      </div>
    </div>

    <!-- Logs Display -->
    <div
      class="glass-card backdrop-blur border border-stroke-subtle dark:border-white/10 rounded-[15px] overflow-hidden"
    >
      <!-- Loading State -->
      <div v-if="loading && allLogs.length === 0" class="p-8 text-center">
        <Spinner class="mx-auto mb-4" />
        <p class="text-content-secondary dark:text-content-muted">Loading system logs...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-8 text-center">
        <div class="text-red-600 dark:text-red-400 mb-4">
          <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 class="text-content-primary dark:text-content-primary text-lg font-medium mb-2">
          Error Loading Logs
        </h3>
        <p class="text-content-secondary dark:text-content-muted mb-4">{{ error }}</p>
        <button
          @click="loadLogs"
          class="px-4 py-2 bg-red-100 dark:bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 border border-red-500/50 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>

      <!-- Logs Container -->
      <div v-else class="max-h-[600px] overflow-y-auto">
        <div v-if="filteredLogs.length === 0" class="p-8 text-center">
          <div class="text-content-muted dark:text-content-muted mb-4">
            <svg
              class="w-12 h-12 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 class="text-content-primary dark:text-content-primary text-lg font-medium mb-2">
            No Logs to Display
          </h3>
          <p class="text-content-secondary dark:text-content-muted">
            No logs match the current filter criteria.
          </p>
        </div>

        <div v-else class="divide-y divide-gray-200 dark:divide-white/5">
          <div
            v-for="(log, index) in filteredLogs"
            :key="index"
            class="flex items-start gap-4 p-4 hover:bg-background-mute dark:hover:bg-stroke/5 transition-colors font-mono text-sm"
          >
            <!-- Timestamp -->
            <span class="flex-shrink-0 text-content-secondary dark:text-content-muted">
              [{{ formatTime(log.timestamp) }}]
            </span>

            <!-- Service Name Badge -->
            <span
              class="flex-shrink-0 px-2 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-600 dark:text-blue-400"
            >
              {{ extractLoggerName(log.message) }}
            </span>

            <!-- Level Badge -->
            <span
              :class="[
                'flex-shrink-0 px-2 py-1 text-xs font-medium rounded',
                getLevelClass(log.level),
              ]"
            >
              {{ log.level }}
            </span>

            <!-- Cleaned Message -->
            <span class="text-content-primary dark:text-content-primary flex-1 break-all">
              {{ cleanLogMessage(log.message) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
