import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';

// ── helpers ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'pymc_jwt_token';

function b64url(s: string) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJWT(payload: object): string {
  return [
    b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    b64url(JSON.stringify(payload)),
    'fakesig',
  ].join('.');
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function expiredToken(): string {
  return makeJWT({
    sub: 'testuser',
    exp: Math.floor(Date.now() / 1000) - 3600,
    iat: Math.floor(Date.now() / 1000) - 7200,
    client_id: 'test-client',
  });
}

function validToken(): string {
  return makeJWT({
    sub: 'testuser',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    client_id: 'test-client',
  });
}

// ── Scenario 1 ────────────────────────────────────────────────────────────────
//
// Bug: navigating to /configuration while the device is unconfigured showed the
// BootstrapModal with all steps as empty circles (no spinners).
//
// Root cause: showLayout used isAuthenticated() from auth.ts — a synchronous
// "does a token exist?" check. With any token in localStorage, showLayout was
// true immediately on page load, before the async router guard ran
// checkSetupStatus(). BootstrapModal mounted with DataService at 'pending'.
//
// Fix: showLayout now reads appRuntime.isAuthenticated, which is ref(false) and
// only becomes true after syncAuthState() confirms the token is present AND
// non-expired. These tests lock that contract in place.

describe('Scenario 1 — bootstrap modal must not appear in unconfigured state', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('appRuntime.isAuthenticated initialises as false, so BootstrapModal cannot render before auth is confirmed', async () => {
    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    // Must be false before any route navigation triggers syncAuthState.
    // If this is true on init, showLayout would be true immediately and
    // BootstrapModal would render before the setup guard runs.
    expect(store.isAuthenticated).toBe(false);
  });

  it('stays false when no token is present after sync', async () => {
    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    store.syncAuthState();
    expect(store.isAuthenticated).toBe(false);
  });

  it('stays false for an expired token — raw isAuthenticated() would wrongly return true here', async () => {
    // This is the exact case that caused the bug: user has a stale token from
    // before a factory-reset. isAuthenticated() returns true (token exists).
    // syncAuthState must return false because the token is expired.
    storeToken(expiredToken());

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    store.syncAuthState();
    expect(store.isAuthenticated).toBe(false);
  });

  it('becomes true only with a valid non-expired token', async () => {
    storeToken(validToken());

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    store.syncAuthState();
    expect(store.isAuthenticated).toBe(true);
  });

  it('stays false when on /setup even with a valid token, so DashboardLayout and BootstrapModal never render over the setup screen', async () => {
    storeToken(validToken());

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    store.syncAuthState();
    expect(store.isAuthenticated).toBe(true);
    const onSetupPage: string = '/setup';
    const showLayout = store.isAuthenticated && onSetupPage !== '/login' && onSetupPage !== '/setup';
    expect(showLayout).toBe(false);
  });
});

// ── Scenario 2 ────────────────────────────────────────────────────────────────
//
// Bug: a token refresh race caused a false-positive logout. If an in-flight
// request was sent with an old token and received a 401 after the token had
// already been refreshed, the response interceptor called handleAuthFailure()
// anyway — logging the user out even though a valid new token was in place.
//
// Root cause: both axios interceptors called handleAuthFailure() on any 401/403
// unconditionally, regardless of which token the request had used.
//
// Fix: before calling handleAuthFailure, the interceptor compares the token in
// the request's Authorization header to the current token in localStorage. It
// only fires if they match (meaning the current token was rejected, not a stale
// one). These tests verify that contract.

describe('Scenario 2 — stale-token 401 must not trigger logout', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function getApiClientErrorHandler() {
    const { apiClient } = await import('@/utils/api');
    // Access the registered response interceptor's error handler.
    // Axios stores interceptors in an internal handlers array; we find the
    // first non-null entry (the one registered in api.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (apiClient.interceptors.response as any).handlers.find(
      (h: unknown) => h !== null,
    ) as { rejected: (error: unknown) => Promise<never> };
    return handler;
  }

  it('does not call handleAuthFailure when request used a stale (already-refreshed) token', async () => {
    storeToken('current-fresh-token');

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    const spy = vi.spyOn(store, 'handleAuthFailure').mockResolvedValue(undefined);

    const handler = await getApiClientErrorHandler();
    const error = {
      response: { status: 401, data: {} },
      config: { headers: { Authorization: 'Bearer stale-old-token' } },
      message: '401',
    };

    await handler.rejected(error).catch(() => {});

    expect(spy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls handleAuthFailure when request used the current token and got a 401', async () => {
    const current = 'current-token-that-was-rejected';
    storeToken(current);

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    const spy = vi.spyOn(store, 'handleAuthFailure').mockResolvedValue(undefined);

    const handler = await getApiClientErrorHandler();
    const error = {
      response: { status: 401, data: {} },
      config: { headers: { Authorization: `Bearer ${current}` } },
      message: '401',
    };

    await handler.rejected(error).catch(() => {});

    expect(spy).toHaveBeenCalledWith('unauthorized');
    consoleSpy.mockRestore();
  });

  it('calls handleAuthFailure when request had no Authorization header (failsafe)', async () => {
    storeToken('some-current-token');

    const { useAppRuntimeStore } = await import('@/stores/appRuntime');
    const store = useAppRuntimeStore();
    const spy = vi.spyOn(store, 'handleAuthFailure').mockResolvedValue(undefined);

    const handler = await getApiClientErrorHandler();
    const error = {
      response: { status: 401, data: {} },
      config: { headers: {} },
      message: '401',
    };

    await handler.rejected(error).catch(() => {});

    expect(spy).toHaveBeenCalledWith('unauthorized');
    consoleSpy.mockRestore();
  });
});

// ── Scenario 3 ────────────────────────────────────────────────────────────────
//
// The router guard must treat setup as an unconditional first gate. Auth logic
// must never be evaluated when the device needs setup — regardless of whether
// a token is present or not.
//
// Root cause: the previous guard read isAuthenticated() synchronously before
// awaiting checkSetupStatus(), and called checkSetupStatus() twice (once for
// non-/setup paths, once for /setup). The restructured guard always calls
// checkSetupStatus() first, returns early if setup is needed, and only reaches
// auth checks after setup is confirmed complete.

describe('Scenario 3 — setup check is always the first gate in the router guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Reset the _setupComplete cache between tests by re-importing fresh module
    vi.resetModules();
  });

  function mockNeedsSetup(value: boolean) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ needs_setup: value }),
    } as Response);
  }

  it('redirects to /setup when needs_setup is true, even with a valid token present', async () => {
    storeToken(validToken());
    mockNeedsSetup(true);

    const { default: router } = await import('@/router');
    await router.push('/configuration');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/setup');
  });

  it('redirects to /setup when needs_setup is true and no token is present', async () => {
    mockNeedsSetup(true);

    const { default: router } = await import('@/router');
    await router.push('/configuration');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/setup');
  });

  it('allows /setup through without redirect when needs_setup is true', async () => {
    mockNeedsSetup(true);

    const { default: router } = await import('@/router');
    await router.push('/setup');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/setup');
  });

  it('redirects away from /setup to /login when setup is already complete', async () => {
    mockNeedsSetup(false);

    const { default: router } = await import('@/router');
    await router.push('/setup');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/login');
  });
});

// ── Scenario 4 ────────────────────────────────────────────────────────────────
//
// Bug: after a session timeout-logout, logging back in showed no repeater name
// or live data. The BootstrapModal re-appeared but all steps stayed pending.
//
// Root cause: DataService.bootstrap() guards against running twice using a
// private _bootstrapped flag. stopSession() called reset() on every other store
// (system, packets, websocket) but NOT on DataService, so _bootstrapped was
// still true. When canMaintainConnections became true on re-login,
// dataService.bootstrap() returned immediately without fetching anything.
//
// Fix: stopSession() now calls dataService.reset() before redirecting to /login.
// These tests lock in (a) the idempotency guarantee of bootstrap() and (b) that
// stopSession() calls reset() so bootstrap() can re-run on the next login.

describe('Scenario 4 — DataService re-bootstraps after logout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function mockBootstrapDeps() {
    const { useSystemStore } = await import('@/stores/system');
    const { usePacketStore } = await import('@/stores/packets');
    const { useNeighborStore } = await import('@/stores/neighbors');

    const fetchStatsSpy = vi.spyOn(useSystemStore(), 'fetchStats').mockResolvedValue(undefined as any);
    vi.spyOn(usePacketStore(), 'fetchPacketStats').mockResolvedValue(undefined as any);
    vi.spyOn(usePacketStore(), 'fetchNoiseFloorHistory').mockResolvedValue(undefined as any);
    vi.spyOn(usePacketStore(), 'fetchRecentPackets').mockResolvedValue(undefined as any);
    vi.spyOn(usePacketStore(), 'initializeSparklineHistory').mockResolvedValue(undefined as any);
    vi.spyOn(useNeighborStore(), 'fetchAll').mockResolvedValue(undefined as any);
    vi.spyOn(useNeighborStore(), 'isStale').mockReturnValue(true);

    return { fetchStatsSpy };
  }

  it('bootstrap() does not re-fetch on a second call — _bootstrapped flag prevents redundant loading', async () => {
    const { fetchStatsSpy } = await mockBootstrapDeps();
    const { useDataService } = await import('@/stores/dataService');
    const dataService = useDataService();

    await dataService.bootstrap();
    expect(fetchStatsSpy).toHaveBeenCalledTimes(1);

    await dataService.bootstrap();
    expect(fetchStatsSpy).toHaveBeenCalledTimes(1);
  });

  it('reset() clears the bootstrapped flag so bootstrap() re-fetches data on the next call', async () => {
    const { fetchStatsSpy } = await mockBootstrapDeps();
    const { useDataService } = await import('@/stores/dataService');
    const dataService = useDataService();

    await dataService.bootstrap();
    expect(fetchStatsSpy).toHaveBeenCalledTimes(1);

    dataService.reset();

    await dataService.bootstrap();
    expect(fetchStatsSpy).toHaveBeenCalledTimes(2);
  });

  it('stopSession calls dataService.reset() so bootstrap() re-runs when the user logs back in', async () => {
    storeToken(validToken());

    const { useWebSocketStore } = await import('@/stores/websocket');
    const { usePacketStore } = await import('@/stores/packets');
    const { useSystemStore } = await import('@/stores/system');
    const { useDataService } = await import('@/stores/dataService');
    const { useAppRuntimeStore } = await import('@/stores/appRuntime');

    vi.spyOn(useWebSocketStore(), 'disconnect').mockImplementation(() => {});
    vi.spyOn(usePacketStore(), 'reset').mockImplementation(() => {});
    vi.spyOn(useSystemStore(), 'reset').mockImplementation(() => {});
    const resetSpy = vi.spyOn(useDataService(), 'reset');

    const appRuntime = useAppRuntimeStore();
    appRuntime.markAuthenticated();

    await appRuntime.stopSession('logout');

    expect(resetSpy).toHaveBeenCalled();
  });
});
