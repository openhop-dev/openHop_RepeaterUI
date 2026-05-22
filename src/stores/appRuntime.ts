import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import router from '@/router';
import { clearToken, getToken, isTokenExpired } from '@/utils/auth';

export type AuthFailureReason = 'unauthorized' | 'forbidden' | 'expired' | 'logout';

export const useAppRuntimeStore = defineStore('appRuntime', () => {
  const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const isDocumentVisible = ref(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  const isAuthenticated = ref(false);
  const authFailureReason = ref<AuthFailureReason | null>(null);
  const logoutInProgress = ref(false);

  const canMaintainConnections = computed(
    () =>
      isOnline.value &&
      isDocumentVisible.value &&
      isAuthenticated.value &&
      !logoutInProgress.value,
  );

  function syncAuthState() {
    const token = getToken();
    isAuthenticated.value = Boolean(token) && !isTokenExpired();
    if (!isAuthenticated.value) {
      authFailureReason.value = authFailureReason.value ?? 'expired';
    }
  }

  function markAuthenticated() {
    isAuthenticated.value = true;
    authFailureReason.value = null;
    logoutInProgress.value = false;
  }

  function setOnline(value: boolean) {
    isOnline.value = value;
  }

  function setDocumentVisible(value: boolean) {
    isDocumentVisible.value = value;
  }

  async function stopSession(reason: AuthFailureReason) {
    if (logoutInProgress.value) {
      return;
    }

    logoutInProgress.value = true;
    authFailureReason.value = reason;
    isAuthenticated.value = false;

    const { useWebSocketStore } = await import('@/stores/websocket');
    const { usePacketStore } = await import('@/stores/packets');
    const { useSystemStore } = await import('@/stores/system');
    const { useDataService } = await import('@/stores/dataService');

    const websocketStore = useWebSocketStore();
    const packetStore = usePacketStore();
    const systemStore = useSystemStore();
    const dataService = useDataService();

    websocketStore.disconnect({ preventReconnect: true, silent: reason !== 'logout' });
    packetStore.reset();
    systemStore.reset();
    dataService.reset();
    clearToken();

    if (router.currentRoute.value.path !== '/login') {
      await router.push('/login');
    }

    logoutInProgress.value = false;
  }

  async function handleAuthFailure(reason: AuthFailureReason) {
    await stopSession(reason);
  }

  return {
    isOnline,
    isDocumentVisible,
    isAuthenticated,
    authFailureReason,
    canMaintainConnections,
    syncAuthState,
    markAuthenticated,
    setOnline,
    setDocumentVisible,
    stopSession,
    handleAuthFailure,
  };
});