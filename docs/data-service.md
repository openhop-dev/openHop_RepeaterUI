# DataService — Centralised Data Layer

`src/stores/dataService.ts`

All background HTTP communication flows through DataService. Components read reactive store state; they do not fetch data themselves except in the specific cases documented below.

---

## Why it exists

Before DataService, every component managed its own fetches, polling intervals, and retry logic independently. This caused:

- Duplicate requests to the same endpoint from different components mounting simultaneously
- Competing HTTP and WebSocket traffic on the initial load, causing timeouts on marginal links
- No TTL awareness — components refetched on every mount regardless of cache freshness
- No retry logic on critical endpoints
- Staggered, inconsistent polling across `setInterval` calls scattered through the codebase

DataService consolidates all of this into one place.

---

## WebSocket-first delivery with HTTP polling fallback

Live data is delivered via two paths:

1. **WebSocket push (primary).** The WebSocket store receives real-time messages from the backend. `stats` updates, packet events, and noise floor readings arrive this way on an active connection. The WS message handler updates the relevant Pinia stores directly, which triggers reactive re-renders in all consuming components.

2. **HTTP polling (fallback and supplement).** DataService runs timed polling for each `DataKey` via `_startPolling()`. Each poll calls `ensure(key)`, which checks the TTL and skips the HTTP request if a WS push arrived within the TTL window. On a healthy connection the polls rarely hit the network for `stats` — the WS pushes keep the cache fresh. Polling exists so that if the WS drops silently (network partition, idle timeout), the UI continues to receive updated data via HTTP without the user noticing.

**Practical implication:** the Configuration page reads `systemStore.stats`, which is updated by both WS pushes and HTTP polling. Do not check `dataService._lastFetch` on that page to determine data freshness — use `systemStore.stats !== null` instead, because WS pushes do not update `_lastFetch`.

---

## Bootstrap sequence

`useConnectionLifecycle.ts` calls `await dataService.bootstrap()` **before** opening the WebSocket connection. The HTTP phases complete in full before the WS handshake begins — this prevents the initial HTTP burst and WS from competing on marginal links.

Bootstrap runs once per session (guarded by `_bootstrapped`). Re-connecting after a tab going hidden/offline does not re-run bootstrap; the WebSocket reconnects and `onReconnect()` handles a lightweight data refresh.

### Phases

| Phase | Endpoints | Strategy |
|---|---|---|
| 1 — Critical | `/stats` | Sequential, 2 retries (500 ms / 1 s backoff) |
| 2 — Secondary | `/packet_stats`, `/noise_floor_history`, `/recent_packets` | Parallel (`Promise.allSettled`) |
| 3 — Background | `/sparkline_history`, `/advert_rate_limit_stats`, neighbor adverts | Parallel (`Promise.allSettled`) |

Phase 2 and 3 run regardless of whether Phase 1 succeeded — the UI degrades gracefully.

---

## DataKeys and TTLs

| Key | Endpoint(s) | TTL | Poll interval |
|---|---|---|---|
| `stats` | `/stats` | 30 s | 30 s (skipped if WS pushed an update within 25 s) |
| `packetStats` | `/packet_stats` | 60 s | 60 s |
| `noiseFloor` | `/noise_floor_history` | 15 s | 15 s |
| `recentPackets` | `/recent_packets` | 30 s | not polled (WS push handles live updates) |
| `sparklines` | `/sparkline_history` | 300 s | 300 s |
| `advertTier` | `/advert_rate_limit_stats` | 60 s | 30 s |
| `neighbors` | `/adverts` (5 contact types) | 10 min | not polled (user-triggered via `neighborStore.fetchAll`) |

Polling starts after bootstrap completes (`_startPolling()`). Each interval calls `ensure(key)`, which checks the TTL and skips the fetch if the cached data is still fresh.

---

## `ensure(key)`

The safe way for a component to request data without caring whether it is already loaded:

```ts
// Returns immediately if data was fetched within the TTL window.
// Only fetches if stale or never loaded.
void dataService.ensure('sparklines');
```

Use `ensure` in `onMounted` as a safety net — bootstrap normally pre-loads everything, but `ensure` protects against edge cases (bootstrap failure, hot reload, deep-link navigation).

**Do not call `ensure` to check freshness on the Configuration page.** Check `systemStore.stats !== null` instead — WS pushes keep the data fresh without updating `_lastFetch`, so `ensure` would trigger unnecessary refetches on that page.

---

## `onReconnect()`

Called automatically by the WebSocket store when the connection re-opens after a drop. Waits 3 s (lets the WS flush buffered messages first) then refreshes `stats`, `packetStats`, and `recentPackets`.

---

## Request deduplication

`_inFlight: Map<DataKey, Promise<void>>` ensures that if two callers ask for the same key simultaneously, they share one in-flight request rather than issuing two. The second caller receives the same promise.

---

## Streaming timeout — `streamingFetch.ts`

The global Axios timeout on `apiClient` is 10 seconds. Several backend queries (RRD history endpoints, hardware stats) regularly take longer than this on real hardware — a 7-day `/packet_stats` query takes ~10.5 s; a 2-day query ~15 s. Using `ApiService.get` for these endpoints causes silent timeouts: the error is caught and swallowed, the spinner is cleared by an unrelated faster fetch, and stale cached values from the previous state are left on screen.

`src/utils/streamingFetch.ts` wraps `ApiService.get` with a two-phase `AbortController`:

1. **Connect phase** — if no bytes arrive within `connectTimeoutMs` (default 15 s), abort.
2. **Stream phase** — once bytes start flowing, arm a rolling idle timer that resets on every `onDownloadProgress` chunk. Only fires if data stops for `idleTimeoutMs` (default 5 s).

This means an actively-streaming response is never aborted regardless of total duration. Use `streamingGet` (not `ApiService.get`) for any endpoint that may take more than a few seconds on a marginal link — in practice, all per-page chart and history fetches.

---

## `/stats` special handling

`/stats` is the most expensive endpoint — it aggregates hardware state (SPI bus reads), config file parsing, and duty-cycle calculations on the embedded backend. It gets special treatment:

- **Idle timeout instead of total timeout.** The axios instance default of 10 s is overridden with `timeout: 0`. An `AbortController` fires after **15 s of silence** on the wire. If data is flowing (even slowly), the timer resets on each `onDownloadProgress` chunk — so slow transfers on high-latency links are not abandoned mid-stream.
- **Sub-status reporting.** `dataService.statsSubStatus` transitions `'requesting' → 'reading' → null` as the first byte arrives. `BootstrapModal` displays this as "(Requesting)" / "(Receiving data)" next to the System Configuration step.

---

## DataService-managed vs per-page endpoints

Not all HTTP calls go through DataService. The distinction is:

**DataService manages** all endpoints that multiple pages or components might need simultaneously, or that benefit from TTL caching and polling:

| Endpoint | DataKey |
|---|---|
| `/stats` | `stats` |
| `/packet_stats` | `packetStats` |
| `/noise_floor_history` | `noiseFloor` |
| `/recent_packets` | `recentPackets` |
| `/sparkline_history` | `sparklines` |
| `/advert_rate_limit_stats` | `advertTier` |
| `/adverts` (5 contact types) | `neighbors` |

**Pages fetch directly** (via `ApiService` or their store's fetch method) when the data is specific to that page, needs custom parameters, or must bypass the cache:

| Endpoint / action | Who calls it | Reason for direct fetch |
|---|---|---|
| `/identities` | `RoomServers.vue`, `Companions.vue` | Page-specific list, no shared consumer |
| `/transport_keys` | Configuration transport-keys tab | Page-specific |
| `/logs` | Logs page | Streamed, no TTL caching makes sense |
| `/gps` | GPS Diagnostics | Polled by the page itself while open |
| `/room_messages` | Room Messages dialog | Paginated, query-specific |
| `/update/status`, `/update/install`, etc. | `UpdateModal.vue` | Install flow with SSE progress stream |
| `/restart_service` | `RestartModal.vue` | One-shot action, not cacheable |
| `systemStore.fetchStats()` (direct) | Configuration page after save | Intentional cache-bust after a write |
| `streamingGet('/packet_stats', { hours })` | Statistics page | Custom time range not covered by the 24 h cache. **Not routed through the store** — `packetStore.packetStats` is also written by the WebSocket push handler, so using it as the delivery mechanism would allow WebSocket events to overwrite time-scoped results between user interactions. The Statistics page stores the result in a local `ref` snapshot instead. |
| `streamingGet('/metrics_graph_data')`, `/route_stats`, `/noise_floor_history`, `/crc_error_history` | Statistics page | Time-scoped historical queries parameterised by the page's time-range picker. No shared consumer; TTL caching would require keying by range parameter. |

---

## What components should and should not do

| Scenario | Correct approach |
|---|---|
| Display data that DataService loads | Read from the Pinia store directly (`systemStore.stats`, `packetStore.packetStats`, etc.) |
| Ensure data is present on mount | `void dataService.ensure(key)` in `onMounted` |
| Force a refresh after a config save | Call the store fetch method directly (e.g. `systemStore.fetchStats()`) — this is an intentional cache-bust and should bypass `ensure` |
| Poll data on your own | Don't — DataService owns all polling. If the interval is wrong, change it in `_startPolling()` |
| Fetch data with a custom time range | Fetch directly from the store (e.g. `packetStore.fetchPacketStats({ hours: 48 })`) — DataService caches 24 h only |

---

## BootstrapModal

`src/components/modals/BootstrapModal.vue`

A full-screen overlay shown during the initial bootstrap sequence. Mounted in `App.vue` with `v-if="showLayout"`.

### Phase state machine

```
loading → connecting → connected → closed
```

- **loading** — DataService is running bootstrap HTTP phases
- **connecting** — bootstrap complete, waiting for WebSocket to open
- **connected** — WebSocket open; auto-closes after 2 s
- **closed** — modal hidden (`v-if="false"`)

`initialPhase()` is called once on mount. It reads `loadProgress` to distinguish "not started" (all `'pending'`) from "already done" — important because `isBootstrapping` is `false` in both states.

### Progress display

Each DataKey has a step row showing `pending → loading → done/error`. The `stats` step additionally shows a sub-status label ("Requesting" / "Receiving data") driven by `dataService.statsSubStatus`.
