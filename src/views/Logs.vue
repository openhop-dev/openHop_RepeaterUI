<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ApiService, { API_SERVER_URL } from '@/utils/api';
import { getToken } from '@/utils/auth';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'LogsView' });

type StreamState = 'connecting' | 'live' | 'paused' | 'reconnecting' | 'offline';

interface LogEntry {
  id?: number;
  message: string;
  timestamp: string;
  level: string;
  logger?: string;
  exception?: string;
  module?: string;
  pathname?: string;
  line?: number;
  thread?: string;
  process?: string;
}

const MAX_RETAINED_LOGS = 1000;
const STREAM_RETRY_MS = 3000;

const allLogs = ref<LogEntry[]>([]);
const enabledLoggers = ref<Set<string>>(new Set());
const enabledLevels = ref<Set<string>>(new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'WARN']));
const allLoggers = ref<Set<string>>(new Set());
const allLevels = ref<Set<string>>(new Set());
const loadingInitial = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const streamState = ref<StreamState>('connecting');
const liveStreamingEnabled = ref(true);
const followTail = ref(true);
const pendingNewLogs = ref(0);
const searchQuery = ref('');
const loggerSearch = ref('');
const selectedLogId = ref<number | null>(null);
const showLoggerFilters = ref(false);
const lastEventAt = ref<string | null>(null);
const logContainer = ref<HTMLElement | null>(null);
const eventSource = ref<EventSource | null>(null);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const setsEqual = (left: Set<string>, right: Set<string>): boolean => {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
};

const extractLoggerName = (entry: LogEntry): string => {
  if (entry.logger) return entry.logger;
  const match = entry.message.match(/- ([^-]+) - (?:DEBUG|INFO|WARNING|ERROR|WARN) -/);
  return match ? match[1].trim() : 'Unknown';
};

const cleanLogMessage = (entry: LogEntry): string => {
  const match = entry.message.match(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - [^-]+ - (?:DEBUG|INFO|WARNING|ERROR|WARN) - (.+)$/,
  );
  return match ? match[1] : entry.message;
};

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDateTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getLevelClass = (level: string): string => {
  const levelMap: Record<string, string> = {
    ERROR: 'text-accent-red bg-accent-red/opacity-light border-accent-red/opacity-medium',
    WARNING: 'text-accent-amber bg-accent-amber/opacity-light border-accent-amber/opacity-medium',
    WARN: 'text-accent-amber bg-accent-amber/opacity-light border-accent-amber/opacity-medium',
    INFO: 'text-accent-cyan bg-accent-cyan/opacity-light border-accent-cyan/opacity-medium',
    DEBUG: 'text-content-muted bg-background-mute/opacity-light border-slate-500/20',
  };
  return levelMap[level] || 'text-content-muted bg-background-mute/opacity-light border-slate-500/20';
};

const getLevelFilterClass = (level: string, enabled: boolean): string => {
  if (!enabled) {
    return 'border-stroke-subtle dark:border-stroke/opacity-medium text-content-muted bg-background-mute/opacity-heavy dark:bg-white/opacity-light hover:bg-background-mute dark:hover:bg-white/opacity-light';
  }

  const enabledMap: Record<string, string> = {
    ERROR: 'border-accent-red/opacity-heavy bg-accent-red/opacity-light text-accent-red',
    WARNING: 'border-accent-amber/opacity-heavy bg-accent-amber/opacity-light text-accent-amber',
    WARN: 'border-accent-amber/opacity-heavy bg-accent-amber/opacity-light text-accent-amber',
    INFO: 'border-accent-cyan/opacity-heavy bg-accent-cyan/opacity-light text-accent-cyan',
    DEBUG: 'border-slate-500/40 bg-background-mute/opacity-light text-content-muted',
  };
  return enabledMap[level] || 'border-primary/opacity-heavy bg-primary/opacity-light text-primary';
};

const streamStatusClass = computed(() => {
  const classMap: Record<StreamState, string> = {
    connecting: 'border-accent-amber/opacity-medium bg-accent-amber/opacity-light text-accent-amber',
    live: 'border-accent-green/opacity-medium bg-accent-green/opacity-light text-accent-green',
    paused: 'border-stroke/opacity-medium bg-background-mute text-content-muted',
    reconnecting: 'border-accent-amber/opacity-medium bg-accent-amber/opacity-light text-accent-amber',
    offline: 'border-accent-red/opacity-medium bg-accent-red/opacity-light text-accent-red',
  };
  return classMap[streamState.value];
});

const streamStatusLabel = computed(() => {
  const labelMap: Record<StreamState, string> = {
    connecting: 'Connecting',
    live: 'Live',
    paused: 'Paused',
    reconnecting: 'Reconnecting',
    offline: 'Offline',
  };
  return labelMap[streamState.value];
});

const sortedLevels = computed(() => {
  const levelOrder = ['ERROR', 'WARNING', 'WARN', 'INFO', 'DEBUG'];
  return Array.from(allLevels.value).sort((a, b) => {
    const aIndex = levelOrder.indexOf(a);
    const bIndex = levelOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    return a.localeCompare(b);
  });
});

const loggerOptions = computed(() => {
  const query = loggerSearch.value.trim().toLowerCase();
  return Array.from(allLoggers.value)
    .sort()
    .filter((logger) => !query || logger.toLowerCase().includes(query));
});

const filteredLogs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return allLogs.value.filter((entry) => {
    const loggerName = extractLoggerName(entry);
    const loggerEnabled = enabledLoggers.value.has(loggerName);
    const levelEnabled = enabledLevels.value.has(entry.level);
    if (!loggerEnabled || !levelEnabled) return false;
    if (!query) return true;

    const haystack = [
      loggerName,
      entry.level,
      cleanLogMessage(entry),
      entry.exception ?? '',
      entry.module ?? '',
      entry.process ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
});

const visibleLoggerCount = computed(() => enabledLoggers.value.size);
const visibleLevelCount = computed(() => enabledLevels.value.size);
const totalLogCount = computed(() => allLogs.value.length);
const filteredLogCount = computed(() => filteredLogs.value.length);
const lastLogId = computed(() => {
  const last = allLogs.value[allLogs.value.length - 1];
  return last?.id ?? 0;
});

const selectedLog = computed(() => {
  if (selectedLogId.value === null) return null;
  return allLogs.value.find((entry) => entry.id === selectedLogId.value) ?? null;
});

function isNearBottom(): boolean {
  if (!logContainer.value) return true;
  const el = logContainer.value;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 32;
}

function scrollToBottom(force = false) {
  nextTick(() => {
    const el = logContainer.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (force) {
      followTail.value = true;
      pendingNewLogs.value = 0;
    }
  });
}

function syncFilterCatalog(logs: LogEntry[]) {
  const nextLoggers = new Set<string>();
  const nextLevels = new Set<string>();

  logs.forEach((entry) => {
    nextLoggers.add(extractLoggerName(entry));
    nextLevels.add(entry.level);
  });

  const hadAllLoggersSelected =
    enabledLoggers.value.size === 0 || setsEqual(enabledLoggers.value, allLoggers.value);
  const hadAllLevelsSelected =
    enabledLevels.value.size === 0 || setsEqual(enabledLevels.value, allLevels.value);

  allLoggers.value = nextLoggers;
  allLevels.value = nextLevels;

  if (hadAllLoggersSelected || enabledLoggers.value.size === 0) {
    enabledLoggers.value = new Set(nextLoggers);
  } else {
    enabledLoggers.value = new Set(
      Array.from(enabledLoggers.value).filter((logger) => nextLoggers.has(logger)),
    );
  }

  if (hadAllLevelsSelected || enabledLevels.value.size === 0) {
    enabledLevels.value = new Set(nextLevels);
  } else {
    enabledLevels.value = new Set(
      Array.from(enabledLevels.value).filter((level) => nextLevels.has(level)),
    );
  }
}

function normalizeLogEntry(entry: Partial<LogEntry>): LogEntry {
  return {
    id: typeof entry.id === 'number' ? entry.id : undefined,
    message: String(entry.message ?? ''),
    timestamp: String(entry.timestamp ?? new Date().toISOString()),
    level: String(entry.level ?? 'INFO'),
    logger: entry.logger ? String(entry.logger) : undefined,
    exception: entry.exception ? String(entry.exception) : undefined,
    module: entry.module ? String(entry.module) : undefined,
    pathname: entry.pathname ? String(entry.pathname) : undefined,
    line: typeof entry.line === 'number' ? entry.line : undefined,
    thread: entry.thread ? String(entry.thread) : undefined,
    process: entry.process ? String(entry.process) : undefined,
  };
}

function ingestLogs(entries: Partial<LogEntry>[], options: { replace?: boolean; fromStream?: boolean } = {}) {
  const normalizedEntries = entries.map(normalizeLogEntry);
  const wasNearBottom = isNearBottom();
  let appendedCount = 0;

  if (options.replace) {
    allLogs.value = normalizedEntries
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(-MAX_RETAINED_LOGS);
  } else {
    const existingIds = new Set(
      allLogs.value
        .map((entry) => entry.id)
        .filter((id): id is number => typeof id === 'number'),
    );

    const appended = normalizedEntries.filter((entry) => {
      if (typeof entry.id !== 'number') return true;
      return !existingIds.has(entry.id);
    });

    appendedCount = appended.length;
    if (!appended.length) return;

    allLogs.value = [...allLogs.value, ...appended]
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(-MAX_RETAINED_LOGS);
  }

  syncFilterCatalog(allLogs.value);

  if (
    selectedLogId.value !== null &&
    !allLogs.value.some((entry) => entry.id === selectedLogId.value)
  ) {
    selectedLogId.value = null;
  }

  if (options.fromStream && appendedCount > 0) {
    if (followTail.value && wasNearBottom) {
      scrollToBottom();
    } else {
      pendingNewLogs.value += appendedCount;
    }
  } else if (followTail.value) {
    scrollToBottom();
  }
}

async function loadLogs(mode: 'initial' | 'refresh' = 'refresh') {
  if (mode === 'initial') {
    loadingInitial.value = true;
  } else {
    refreshing.value = true;
  }

  try {
    const response = await ApiService.getLogs();
    ingestLogs(response.logs, { replace: true });
    error.value = null;
  } catch (err) {
    console.error('Error loading logs:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load logs';
    if (!allLogs.value.length) {
      streamState.value = 'offline';
    }
  } finally {
    loadingInitial.value = false;
    refreshing.value = false;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function disconnectStream(nextState: StreamState = 'paused') {
  clearReconnectTimer();
  if (eventSource.value) {
    eventSource.value.close();
    eventSource.value = null;
  }
  streamState.value = nextState;
}

function scheduleReconnect() {
  if (!liveStreamingEnabled.value) return;
  clearReconnectTimer();
  streamState.value = 'reconnecting';
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectStream();
  }, STREAM_RETRY_MS);
}

function connectStream() {
  if (!liveStreamingEnabled.value) {
    streamState.value = 'paused';
    return;
  }

  disconnectStream('connecting');

  const token = getToken();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (lastLogId.value > 0) params.set('since_id', String(lastLogId.value));

  const query = params.toString();
  const url = `${API_SERVER_URL}/api/logs_stream${query ? `?${query}` : ''}`;
  const source = new EventSource(url);
  eventSource.value = source;

  source.onopen = () => {
    if (streamState.value === 'connecting' || streamState.value === 'reconnecting') {
      streamState.value = 'live';
    }
    lastEventAt.value = new Date().toISOString();
    error.value = null;
  };

  source.addEventListener('connected', (event) => {
    streamState.value = 'live';
    lastEventAt.value = new Date().toISOString();

    if (event instanceof MessageEvent && event.data) {
      try {
        const payload = JSON.parse(event.data) as { latest_id?: number };
        if ((payload.latest_id ?? 0) > lastLogId.value) {
          void loadLogs('refresh');
        }
      } catch {
        // ignore malformed payloads
      }
    }
  });

  source.addEventListener('log', (event) => {
    if (!(event instanceof MessageEvent)) return;
    try {
      const payload = JSON.parse(event.data) as { entry?: Partial<LogEntry> };
      if (payload.entry) {
        ingestLogs([payload.entry], { fromStream: true });
      }
      streamState.value = 'live';
      lastEventAt.value = new Date().toISOString();
      error.value = null;
    } catch (err) {
      console.error('Failed to parse log stream payload:', err);
    }
  });

  source.addEventListener('keepalive', () => {
    lastEventAt.value = new Date().toISOString();
    if (streamState.value !== 'paused') {
      streamState.value = 'live';
    }
  });

  source.onerror = () => {
    if (!liveStreamingEnabled.value) {
      disconnectStream('paused');
      return;
    }

    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
    scheduleReconnect();
  };
}

function toggleLiveStreaming() {
  liveStreamingEnabled.value = !liveStreamingEnabled.value;
  if (liveStreamingEnabled.value) {
    connectStream();
  } else {
    disconnectStream('paused');
  }
}

function handleLogScroll() {
  const nearBottom = isNearBottom();
  followTail.value = nearBottom;
  if (nearBottom) {
    pendingNewLogs.value = 0;
  }
}

function jumpToLatest() {
  scrollToBottom(true);
}

function selectLog(entry: LogEntry) {
  selectedLogId.value = selectedLogId.value === entry.id ? null : (entry.id ?? null);
}

function toggleLevel(level: string) {
  if (enabledLevels.value.has(level)) {
    enabledLevels.value.delete(level);
  } else {
    enabledLevels.value.add(level);
  }
  enabledLevels.value = new Set(enabledLevels.value);
}

function toggleLogger(logger: string) {
  if (enabledLoggers.value.has(logger)) {
    enabledLoggers.value.delete(logger);
  } else {
    enabledLoggers.value.add(logger);
  }
  enabledLoggers.value = new Set(enabledLoggers.value);
}

function selectAllLoggers() {
  enabledLoggers.value = new Set(allLoggers.value);
}

function clearAllLoggers() {
  enabledLoggers.value = new Set();
}

function selectAllLevels() {
  enabledLevels.value = new Set(allLevels.value);
}

function clearAllLevels() {
  enabledLevels.value = new Set();
}

function resetFilters() {
  searchQuery.value = '';
  loggerSearch.value = '';
  selectAllLoggers();
  selectAllLevels();
}

onMounted(async () => {
  await loadLogs('initial');
  connectStream();
});

onBeforeUnmount(() => {
  disconnectStream('offline');
});
</script>

<template>
  <div class="space-y-6">
    <div class="glass-card backdrop-blur border border-stroke-subtle dark:border-white/opacity-light rounded-[15px] p-6 space-y-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 class="text-content-primary text-2xl font-semibold mb-2">
            System Logs
          </h1>
          <p class="text-content-secondary dark:text-content-muted max-w-2xl">
            Live tail for repeater logs with pause, follow, search, and logger-level filtering.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            :class="[
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              streamStatusClass,
            ]"
          >
            <span class="h-2 w-2 rounded-full bg-current"></span>
            {{ streamStatusLabel }}
          </span>
          <button @click="toggleLiveStreaming" class="btn-secondary">
            {{ liveStreamingEnabled ? 'Pause Live' : 'Resume Live' }}
          </button>
          <button @click="loadLogs('refresh')" :disabled="refreshing" class="btn-primary flex items-center gap-2">
            <svg class="w-4 h-4" :class="{ 'animate-spin': refreshing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ refreshing ? 'Refreshing…' : 'Refresh Snapshot' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/opacity-light px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-content-muted">Visible</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">{{ filteredLogCount }}</div>
          <div class="text-xs text-content-secondary dark:text-content-muted">of {{ totalLogCount }} retained lines</div>
        </div>
        <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/opacity-light px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-content-muted">Logger Filters</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">{{ visibleLoggerCount }}</div>
          <div class="text-xs text-content-secondary dark:text-content-muted">of {{ allLoggers.size }} selected</div>
        </div>
        <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/opacity-light px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-content-muted">Level Filters</div>
          <div class="mt-1 text-xl font-semibold text-content-primary">{{ visibleLevelCount }}</div>
          <div class="text-xs text-content-secondary dark:text-content-muted">of {{ allLevels.size }} selected</div>
        </div>
        <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/opacity-light px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-content-muted">Last Activity</div>
          <div class="mt-1 text-sm font-semibold text-content-primary">
            {{ lastEventAt ? formatDateTime(lastEventAt) : 'Waiting for stream' }}
          </div>
          <div class="text-xs text-content-secondary dark:text-content-muted">
            {{ pendingNewLogs ? `${pendingNewLogs} new line${pendingNewLogs === 1 ? '' : 's'} waiting` : 'Up to date' }}
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-main dark:bg-surface-900 p-4 space-y-4">
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div class="xl:col-span-8">
            <label class="block text-xs font-semibold uppercase tracking-wide text-content-muted mb-2">
              Search Logs
            </label>
            <input
              v-model="searchQuery"
              type="text"
              class="cfg-input"
              placeholder="Search logger, message, exception, module..."
            />
          </div>
          <div class="xl:col-span-4">
            <label class="block text-xs font-semibold uppercase tracking-wide text-content-muted mb-2">
              Actions
            </label>
            <div class="flex flex-wrap items-center gap-2 xl:justify-end">
              <button @click="followTail = !followTail" class="btn-secondary">
                {{ followTail ? 'Following Tail' : 'Follow Off' }}
              </button>
              <button v-if="pendingNewLogs" @click="jumpToLatest" class="btn-primary">
                Jump to Latest ({{ pendingNewLogs }})
              </button>
              <button @click="resetFilters" class="btn-secondary">Reset Filters</button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/[0.03] p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div class="text-sm font-semibold text-content-primary">Level Filters</div>
                <div class="text-xs text-content-secondary dark:text-content-muted">{{ visibleLevelCount }} of {{ allLevels.size }} selected</div>
              </div>
              <div class="flex items-center gap-2">
                <button @click="selectAllLevels" class="btn-success-xs">All</button>
                <button @click="clearAllLevels" class="btn-danger-xs">None</button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="level in sortedLevels"
                :key="level"
                @click="toggleLevel(level)"
                :class="[
                  'px-3 py-1.5 text-xs border rounded-full transition-colors font-semibold',
                  getLevelFilterClass(level, enabledLevels.has(level)),
                ]"
              >
                {{ level }}
              </button>
            </div>
          </div>

          <div class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-medium bg-background-mute/opacity-heavy dark:bg-white/[0.03] overflow-hidden">
            <button
              @click="showLoggerFilters = !showLoggerFilters"
              class="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <div class="text-sm font-semibold text-content-primary">Logger Filters</div>
                <div class="text-xs text-content-secondary dark:text-content-muted">{{ visibleLoggerCount }} of {{ allLoggers.size }} selected</div>
              </div>
              <svg class="w-4 h-4 text-content-muted transition-transform" :class="{ 'rotate-180': showLoggerFilters }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div v-if="showLoggerFilters" class="border-t border-stroke-subtle dark:border-stroke/opacity-medium px-4 py-4 space-y-3">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  v-model="loggerSearch"
                  type="text"
                  class="cfg-input lg:max-w-sm"
                  placeholder="Find a logger..."
                />
                <div class="flex flex-wrap items-center gap-2">
                  <button @click="selectAllLoggers" class="btn-success-xs">All Loggers</button>
                  <button @click="clearAllLoggers" class="btn-danger-xs">Clear Loggers</button>
                </div>
              </div>

              <div class="max-h-52 overflow-y-auto pr-1">
                <div v-if="loggerOptions.length" class="flex flex-wrap gap-2">
                  <button
                    v-for="logger in loggerOptions"
                    :key="logger"
                    @click="toggleLogger(logger)"
                    :class="[
                      'px-3 py-1.5 text-xs border rounded-full transition-colors',
                      enabledLoggers.has(logger)
                        ? 'bg-primary/opacity-light border-primary/opacity-heavy text-primary'
                        : 'bg-background-main dark:bg-white/opacity-light border-stroke-subtle dark:border-stroke/opacity-medium text-content-secondary dark:text-content-muted hover:bg-background-mute dark:hover:bg-white/opacity-light',
                    ]"
                  >
                    {{ logger }}
                  </button>
                </div>
                <div v-else class="text-sm text-content-secondary dark:text-content-muted py-6 text-center">
                  No loggers match this filter.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card backdrop-blur border border-stroke-subtle dark:border-white/opacity-light rounded-[15px] overflow-hidden">
      <div v-if="loadingInitial && allLogs.length === 0" class="p-8 text-center">
        <Spinner class="mx-auto mb-4" />
        <p class="text-content-secondary dark:text-content-muted">Loading log history...</p>
      </div>

      <div v-else-if="error && allLogs.length === 0" class="p-8 text-center">
        <div class="text-accent-red mb-4">
          <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 class="text-content-primary text-lg font-medium mb-2">Error Loading Logs</h3>
        <p class="text-content-secondary dark:text-content-muted mb-4">{{ error }}</p>
        <button @click="loadLogs('refresh')" class="btn-primary">Try Again</button>
      </div>

      <div v-else class="relative">
        <div
          ref="logContainer"
          class="max-h-[70vh] overflow-y-auto bg-background-mute dark:bg-background-mute/opacity-heavy text-content-primary"
          @scroll="handleLogScroll"
        >
          <div v-if="filteredLogs.length === 0" class="p-10 text-center text-content-secondary">
            <h3 class="text-lg font-medium text-content-primary mb-2">No Logs to Display</h3>
            <p class="text-sm text-content-muted">The current search and filter settings removed every retained line.</p>
          </div>

          <div v-else class="divide-y divide-stroke-subtle dark:divide-white/opacity-subtle">
            <div
              v-for="(log, index) in filteredLogs"
              :key="log.id ?? `${log.timestamp}-${index}`"
              class="px-3 py-1 transition-colors cursor-pointer"
              :class="selectedLogId === log.id ? 'bg-stroke-subtle dark:bg-white/opacity-light' : 'hover:bg-stroke-subtle/50 dark:hover:bg-white/opacity-light'"
              @click="selectLog(log)"
            >
              <div class="flex flex-col gap-0.5 xl:flex-row xl:items-start">
                <div class="flex flex-wrap items-center gap-1.5 xl:min-w-[260px] xl:max-w-[260px] xl:flex-none">
                  <span class="text-[11px] text-content-muted">{{ formatTime(log.timestamp) }}</span>
                  <span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-full border border-stroke-subtle dark:border-white/opacity-light bg-stroke-subtle/50 dark:bg-white/opacity-light text-content-secondary dark:text-content-muted">
                    {{ extractLoggerName(log) }}
                  </span>
                  <span :class="['px-1.5 py-0.5 text-[10px] font-semibold rounded-full border', getLevelClass(log.level)]">
                    {{ log.level }}
                  </span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs leading-4 break-words text-content-primary">
                    {{ cleanLogMessage(log) }}
                  </div>

                  <div v-if="selectedLogId === log.id" class="mt-3 rounded-xl border border-stroke-subtle dark:border-white/opacity-light bg-background-mute dark:bg-black/opacity-medium p-3 space-y-3 text-xs text-content-secondary">
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div class="uppercase tracking-wide text-content-muted">Timestamp</div>
                        <div class="mt-1 text-content-primary">{{ formatDateTime(log.timestamp) }}</div>
                      </div>
                      <div>
                        <div class="uppercase tracking-wide text-content-muted">Logger</div>
                        <div class="mt-1 text-content-primary">{{ extractLoggerName(log) }}</div>
                      </div>
                      <div>
                        <div class="uppercase tracking-wide text-content-muted">Module</div>
                        <div class="mt-1 text-content-primary">{{ log.module || '—' }}</div>
                      </div>
                      <div>
                        <div class="uppercase tracking-wide text-content-muted">Line</div>
                        <div class="mt-1 text-content-primary">{{ log.line ?? '—' }}</div>
                      </div>
                    </div>

                    <div>
                      <div class="uppercase tracking-wide text-content-muted mb-1">Full Message</div>
                      <pre class="whitespace-pre-wrap break-words text-content-primary">{{ log.message }}</pre>
                    </div>

                    <div v-if="log.exception">
                      <div class="uppercase tracking-wide text-content-muted mb-1">Exception</div>
                      <pre class="whitespace-pre-wrap break-words text-accent-red/opacity-heavy">{{ log.exception }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!followTail && pendingNewLogs" class="absolute bottom-4 right-4">
          <button @click="jumpToLatest" class="rounded-full border border-primary/opacity-heavy bg-primary/opacity-medium hover:bg-primary/opacity-medium text-primary px-4 py-2 shadow-lg">
            {{ pendingNewLogs }} new line{{ pendingNewLogs === 1 ? '' : 's' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
