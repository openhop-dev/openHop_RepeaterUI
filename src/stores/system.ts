import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import ApiService, { apiClient } from '@/utils/api';
import type { SystemStats } from '@/types/api';
import { usePacketStore } from './packets';

const CONFIG_CACHE_KEY = 'pymc_config_cache';

function loadConfigCache(): SystemStats['config'] | null {
  try {
    const raw = sessionStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SystemStats['config']) : null;
  } catch {
    return null;
  }
}

function saveConfigCache(config: SystemStats['config']) {
  if (!config) return;
  try {
    sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {}
}

function clearConfigCache() {
  try {
    sessionStorage.removeItem(CONFIG_CACHE_KEY);
  } catch {}
}

export const useSystemStore = defineStore('system', () => {
  // Seed stats with cached config so map coordinates are available immediately,
  // before the first /stats fetch completes
  const _cachedConfig = loadConfigCache();
  const stats = ref<SystemStats | null>(
    _cachedConfig ? ({ config: _cachedConfig } as SystemStats) : null,
  );
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<Date | null>(null);

  // Control states
  const currentMode = ref<'forward' | 'monitor' | 'no_tx'>('forward');
  const dutyCycleEnabled = ref(true);
  const dutyCycleUtilization = ref(0);
  const dutyCycleMax = ref(10);
  const cadCalibrationRunning = ref(false);

  // Node information
  const nodeName = computed(() => stats.value?.config?.node_name ?? 'Unknown');
  const pubKey = computed(() => {
    const key = stats.value?.public_key;
    if (!key || key === 'Unknown') return 'Unknown';

    // Format as <first8...last8>
    if (key.length >= 16) {
      return `${key.slice(0, 8)} ... ${key.slice(-8)}`;
    }
    return `${key}`;
  });

  // Computed
  const hasStats = computed(() => stats.value !== null);
  const version = computed(() => stats.value?.version ?? 'Unknown');
  const coreVersion = computed(() => stats.value?.core_version ?? 'Unknown');
  const noiseFloorDbm = computed(() => stats.value?.noise_floor_dbm ?? null);
  const dutyCyclePercentage = computed(() =>
    dutyCycleMax.value > 0
      ? Math.min((dutyCycleUtilization.value / dutyCycleMax.value) * 100, 100)
      : 0,
  );

  // Status badge text based on current state
  const statusBadge = computed(() => {
    if (currentMode.value === 'no_tx') {
      return {
        text: 'No TX',
        title: 'No repeat, no local TX; adverts skipped',
      };
    }
    if (currentMode.value === 'monitor') {
      return {
        text: 'Monitor Mode',
        title: 'Monitoring only - not forwarding packets',
      };
    }
    if (!dutyCycleEnabled.value) {
      return {
        text: 'No Limits',
        title: 'Forwarding without duty cycle enforcement',
      };
    }
    return {
      text: 'Active',
      title: 'Forwarding with duty cycle enforcement',
    };
  });

  // Button state for three-way mode control (forward = green, monitor = amber, no_tx = red)
  const modeButtonState = computed(() => ({
    mode: currentMode.value,
  }));

  const dutyCycleButtonState = computed(() => {
    return dutyCycleEnabled.value
      ? { active: true, warning: false }
      : { active: false, warning: true };
  });

  // Actions to control CAD calibration state
  const setCadCalibrationRunning = (running: boolean) => {
    cadCalibrationRunning.value = running;
  };

  // Actions
  let _fetchPromise: Promise<SystemStats> | null = null;

  async function fetchStats(options?: { onFirstByte?: () => void }): Promise<SystemStats> {
    // Deduplicate: if a fetch is already in flight return the same promise
    if (_fetchPromise !== null) return _fetchPromise;

    _fetchPromise = (async (): Promise<SystemStats> => {
      try {
        isLoading.value = true;
        error.value = null;

        // /stats is slow on embedded hardware (SPI reads, config parsing) and the
        // response body is large. A total-elapsed timeout abandons slow-but-active
        // transfers. Instead use an idle timeout: reset the clock on every incoming
        // chunk so we only abort if the connection actually goes silent.
        const controller = new AbortController();
        const IDLE_MS = 15_000;
        let idleTimer = window.setTimeout(() => controller.abort(), IDLE_MS);
        let firstByteReceived = false;
        const resetIdle = () => {
          if (!firstByteReceived) {
            firstByteReceived = true;
            options?.onFirstByte?.();
          }
          clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => controller.abort(), IDLE_MS);
        };

        let rawResponse;
        try {
          rawResponse = await apiClient.get('/stats', {
            signal: controller.signal,
            onDownloadProgress: resetIdle,
            timeout: 0, // disable instance-level timeout; idle timer via AbortController handles it
          });
        } finally {
          clearTimeout(idleTimer);
        }

        // apiClient returns the axios response directly; unwrap to match ApiResponse shape
        const response = rawResponse.data as import('@/utils/api').ApiResponse<SystemStats>;

        let statsData: SystemStats;
        if (response.success && response.data) {
          statsData = response.data;
        } else if (response && 'version' in response) {
          // Handle case where API returns stats directly without wrapping
          statsData = response as unknown as SystemStats;
        } else {
          throw new Error(response.error || 'Failed to fetch stats');
        }

        stats.value = statsData;
        lastUpdated.value = new Date();
        updateControlStatesFromStats(statsData);
        saveConfigCache(statsData.config);
        // Keep packetStore.systemStats in sync — avoids a redundant /stats fetch
        usePacketStore().systemStats = statsData;

        return statsData;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Unknown error occurred';
        console.error('Error fetching stats:', err);
        throw err;
      } finally {
        isLoading.value = false;
      }
    })();

    // Clear dedup ref when the fetch settles (success or failure)
    void _fetchPromise.finally(() => {
      _fetchPromise = null;
    });

    return _fetchPromise;
  }

  function updateControlStatesFromStats(statsData: SystemStats) {
    // Extract control states from stats data
    if (statsData.config) {
      // Update mode (normalize unknown to forward per backend)
      const mode = statsData.config.repeater?.mode;
      if (mode === 'forward' || mode === 'monitor' || mode === 'no_tx') {
        currentMode.value = mode;
      } else if (mode !== undefined) {
        currentMode.value = 'forward';
      }

      // Update duty cycle
      const dutyCycle = statsData.config.duty_cycle;
      if (dutyCycle) {
        dutyCycleEnabled.value = dutyCycle.enforcement_enabled !== false;

        // Handle both number and parsed value format for max_airtime_percent
        const maxAirtime = dutyCycle.max_airtime_percent;
        if (typeof maxAirtime === 'number') {
          dutyCycleMax.value = maxAirtime;
        } else if (maxAirtime && typeof maxAirtime === 'object' && 'parsedValue' in maxAirtime) {
          dutyCycleMax.value = maxAirtime.parsedValue || 10;
        }
      }
    }

    // Update utilization from stats - handle both number and parsed value format
    const utilization = statsData.utilization_percent;
    if (typeof utilization === 'number') {
      dutyCycleUtilization.value = utilization;
    } else if (utilization && typeof utilization === 'object' && 'parsedValue' in utilization) {
      dutyCycleUtilization.value = utilization.parsedValue || 0;
    }
  }

  async function setMode(mode: 'forward' | 'monitor' | 'no_tx') {
    try {
      const response = await ApiService.post<{ success: boolean; mode: string }>('/set_mode', {
        mode,
      });

      if (response.success) {
        currentMode.value = mode;
        return true;
      } else {
        throw new Error(response.error || 'Failed to set mode');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error setting mode:', err);
      throw err;
    }
  }

  async function setDutyCycle(enabled: boolean) {
    try {
      const response = await ApiService.post<{ success: boolean; enabled: boolean }>(
        '/set_duty_cycle',
        { enabled },
      );

      if (response.success) {
        dutyCycleEnabled.value = enabled;
        return true;
      } else {
        throw new Error(response.error || 'Failed to set duty cycle');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error setting duty cycle:', err);
      throw err;
    }
  }

  async function sendAdvert() {
    try {
      // Use a longer timeout for advert sending as it may take longer to broadcast
      const response = await ApiService.post<string>(
        '/send_advert',
        {},
        {
          timeout: 10000, // 10 seconds instead of default 5
        },
      );

      // The API returns {"success": true, "data": "Advert sent successfully"}
      // ApiService wraps this in ApiResponse format, so check for success
      if (response.success) {
        return true;
      } else {
        throw new Error(response.error || 'Failed to send advert');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error sending advert:', err);
      throw err;
    }
  }

  async function toggleDutyCycle() {
    return await setDutyCycle(!dutyCycleEnabled.value);
  }

  // Update stats from realtime websocket data
  function updateRealtimeStats(data: SystemStats) {
    // Only update fields that are provided to avoid disrupting stable data like node name, coordinates, etc.
    // WebSocket stats updates typically only include counters/uptime, not configuration
    if (stats.value) {
      // Update only the dynamic fields that change frequently
      if (data.uptime_seconds !== undefined) stats.value.uptime_seconds = data.uptime_seconds;
      if (data.noise_floor_dbm !== undefined) stats.value.noise_floor_dbm = data.noise_floor_dbm;

      // Preserve existing config, node info, and other stable fields
      // Only update them if they're explicitly provided and different
    } else {
      // First time initialization - set everything
      stats.value = data;
    }

    lastUpdated.value = new Date();
    updateControlStatesFromStats(data);
  }

  // Auto-refresh functionality
  async function startAutoRefresh(intervalMs = 5000, wsConnected = false) {
    // Only fetch if websockets are not connected
    if (!wsConnected) {
      // Initial fetch
      await fetchStats();
    }

    // Set up interval for continuous updates (only if websockets not connected)
    let intervalId: number | null = null;
    if (!wsConnected) {
      intervalId = setInterval(async () => {
        try {
          await fetchStats();
        } catch (err) {
          console.error('Auto-refresh error:', err);
        }
      }, intervalMs);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }

  // Reset store state
  function reset() {
    stats.value = null;
    error.value = null;
    lastUpdated.value = null;
    isLoading.value = false;
    currentMode.value = 'forward';
    dutyCycleEnabled.value = true;
    dutyCycleUtilization.value = 0;
    dutyCycleMax.value = 10;
    clearConfigCache();
  }

  return {
    // State
    stats,
    isLoading,
    error,
    lastUpdated,
    currentMode,
    dutyCycleEnabled,
    dutyCycleUtilization,
    dutyCycleMax,
    cadCalibrationRunning,
    nodeName,
    pubKey,

    // Computed
    hasStats,
    version,
    coreVersion,
    noiseFloorDbm,
    dutyCyclePercentage,
    statusBadge,
    modeButtonState,
    dutyCycleButtonState,

    // Actions
    fetchStats,
    setMode,
    setDutyCycle,
    sendAdvert,
    toggleDutyCycle,
    startAutoRefresh,
    updateRealtimeStats,
    reset,
    setCadCalibrationRunning,
  };
});
