import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { usePacketStore } from './packets';
import { useSystemStore } from './system';
import { useDataService } from './dataService';
import { API_SERVER_URL } from '@/utils/api';
import { getClientId, getToken, isTokenExpired } from '@/utils/auth';
import { useAppRuntimeStore } from '@/stores/appRuntime';

type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
type SnackbarVariant = 'info' | 'success' | 'error';
type PauseReason = 'lifecycle' | 'logout' | 'hidden' | 'offline';

interface DisconnectOptions {
  preventReconnect?: boolean;
  silent?: boolean;
}

export const useWebSocketStore = defineStore('websocket', () => {
  const ws = ref<WebSocket | null>(null);
  const connectionState = ref<ConnectionState>('idle');
  const reconnectAttempts = ref(0);
  const lastPongTime = ref(Date.now());
  const reconnectTimer = ref<number | null>(null);
  const pingInterval = ref<number | null>(null);
  const preventReconnect = ref(false);
  const paused = ref(false);
  const resumeAnnouncementPending = ref(false);
  const maxReconnectAttempts = 6;
  const snackbar = ref<{ visible: boolean; message: string; variant: SnackbarVariant }>({
    visible: false,
    message: '',
    variant: 'info',
  });
  let snackbarTimer: number | null = null;

  const packetStore = usePacketStore();
  const systemStore = useSystemStore();
  const appRuntime = useAppRuntimeStore();
  const dataService = useDataService();

  const isConnected = computed(() => connectionState.value === 'open');

  function showSnackbar(message: string, variant: SnackbarVariant, autoHideMs = 0) {
    if (snackbarTimer !== null) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }

    snackbar.value = {
      visible: true,
      message,
      variant,
    };

    if (autoHideMs > 0) {
      snackbarTimer = window.setTimeout(() => {
        hideSnackbar();
      }, autoHideMs);
    }
  }

  function hideSnackbar() {
    if (snackbarTimer !== null) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }

    snackbar.value.visible = false;
  }

  function clearReconnectTimer() {
    if (reconnectTimer.value !== null) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
  }

  function clearPingInterval() {
    if (pingInterval.value !== null) {
      clearInterval(pingInterval.value);
      pingInterval.value = null;
    }
  }

  function startReconnectSnackbar() {
    showSnackbar('Reconnecting...', 'info');
  }

  function canOpenConnection() {
    const token = getToken();
    return (
      !preventReconnect.value &&
      !paused.value &&
      Boolean(token) &&
      !isTokenExpired() &&
      appRuntime.canMaintainConnections
    );
  }

  function buildUrl() {
    let wsUrl: string;

    const token = getToken();
    const clientId = getClientId();
    const query = new URLSearchParams();
    if (token) query.set('token', token);
    if (clientId) query.set('client_id', clientId);

    if (import.meta.env.DEV) {
      const devApi = import.meta.env.VITE_DEV_API_URL || 'http://localhost:8000';
      const devWs = devApi.replace(/^http/, 'ws');
      wsUrl = `${devWs}/ws/packets?${query.toString()}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = API_SERVER_URL?.trim() ? new URL(API_SERVER_URL).host : window.location.host;
      wsUrl = `${protocol}//${host}/ws/packets?${query.toString()}`;
    }

    return wsUrl;
  }

  async function resyncData() {
    await dataService.onReconnect();
  }

  function cleanupSocket(removeHandlers = false) {
    clearPingInterval();

    if (!ws.value) {
      return;
    }

    if (removeHandlers) {
      ws.value.onopen = null;
      ws.value.onmessage = null;
      ws.value.onerror = null;
      ws.value.onclose = null;
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();

    if (!canOpenConnection()) {
      connectionState.value = 'closed';
      return;
    }

    if (reconnectAttempts.value >= maxReconnectAttempts) {
      connectionState.value = 'closed';
      showSnackbar('Connection lost', 'error', 5000);
      return;
    }

    connectionState.value = 'reconnecting';
    startReconnectSnackbar();

    const delay = Math.min(1000 * 2 ** reconnectAttempts.value, 30000);
    reconnectAttempts.value += 1;
    reconnectTimer.value = window.setTimeout(() => {
      reconnectTimer.value = null;
      connect(true);
    }, delay);
  }

  function connect(isReconnect = false) {
    if (!canOpenConnection()) {
      return;
    }

    if (ws.value?.readyState === WebSocket.OPEN || ws.value?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearReconnectTimer();
    cleanupSocket(true);

    const shouldAnnounceReconnect =
      isReconnect || reconnectAttempts.value > 0 || resumeAnnouncementPending.value;

    connectionState.value = shouldAnnounceReconnect ? 'reconnecting' : 'connecting';

    if (resumeAnnouncementPending.value) {
      startReconnectSnackbar();
    }

    const socket = new WebSocket(buildUrl());
    ws.value = socket;

    socket.onopen = () => {
      connectionState.value = 'open';
      lastPongTime.value = Date.now();
      const wasReconnect = reconnectAttempts.value > 0 || resumeAnnouncementPending.value;
      reconnectAttempts.value = 0;
      resumeAnnouncementPending.value = false;

      clearPingInterval();
      pingInterval.value = window.setInterval(() => {
        if (ws.value?.readyState !== WebSocket.OPEN) {
          return;
        }

        ws.value.send(JSON.stringify({ type: 'ping' }));

        if (Date.now() - lastPongTime.value > 60000) {
          cleanupSocket(true);
          ws.value?.close();
        }
      }, 30000);

      // On reconnect, refresh critical data after a short delay to avoid competing
      // with in-flight requests that were running when the link dropped.
      // First connect is handled by DataService.bootstrap() in useConnectionLifecycle.
      if (wasReconnect) {
        void dataService.onReconnect();
        showSnackbar('Back online', 'success', 2500);
      } else {
        hideSnackbar();
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'packet') {
          packetStore.addRealtimePacket(message.data);
        } else if (message.type === 'stats') {
          if (message.data?.packet_stats) {
            packetStore.updateRealtimeStats({ packet_stats: message.data.packet_stats });
          }
          if (message.data?.system_stats) {
            systemStore.updateRealtimeStats(message.data.system_stats);
          }
        } else if (message.type === 'packet_stats') {
          packetStore.updateRealtimeStats(message.data);
        } else if (message.type === 'system_stats') {
          systemStore.updateRealtimeStats(message.data);
        } else if (message.type === 'pong' || message.type === 'ping') {
          lastPongTime.value = Date.now();

          if (message.type === 'ping' && ws.value?.readyState === WebSocket.OPEN) {
            ws.value.send(JSON.stringify({ type: 'pong' }));
          }
        }
      } catch (error) {
        console.error('[WebSocket] Parse error:', error);
      }
    };

    socket.onerror = () => {
      connectionState.value = reconnectAttempts.value > 0 ? 'reconnecting' : 'closed';
    };

    socket.onclose = (event) => {
      const currentSocket = ws.value;
      cleanupSocket();

      if (currentSocket === ws.value) {
        ws.value = null;
      }

      if (preventReconnect.value || paused.value) {
        connectionState.value = 'closed';
        return;
      }

      if (event.code === 1008 || event.code === 4001 || event.code === 4003) {
        void appRuntime.handleAuthFailure('expired');
        return;
      }

      dataService.noteDisconnect();
      scheduleReconnect();
    };
  }

  function pause(reason: PauseReason = 'lifecycle') {
    paused.value = true;
    clearReconnectTimer();
    connectionState.value = 'closed';

    if (reason === 'offline') {
      resumeAnnouncementPending.value = true;
      showSnackbar('Connection lost', 'error', 4000);
    } else if (reason === 'hidden') {
      resumeAnnouncementPending.value = true;
      hideSnackbar();
    } else if (reason === 'logout') {
      resumeAnnouncementPending.value = false;
      hideSnackbar();
    }

    if (ws.value) {
      const socket = ws.value;
      ws.value = null;
      cleanupSocket(true);
      socket.close();
    }
  }

  function allowReconnect() {
    preventReconnect.value = false;
    paused.value = false;
  }

  function disconnect(options: DisconnectOptions = {}) {
    preventReconnect.value = options.preventReconnect ?? preventReconnect.value;
    if (!options.silent) {
      hideSnackbar();
    }
    pause(options.preventReconnect ? 'logout' : 'lifecycle');
    reconnectAttempts.value = 0;
  }

  return {
    isConnected,
    connectionState,
    reconnectAttempts,
    snackbar,
    connect,
    disconnect,
    pause,
    allowReconnect,
    hideSnackbar,
    resyncData,
  };
});
