# Architecture Decisions

Rationale for the significant technology and design choices in this codebase.

---

## State management — Pinia

**What it is.** Pinia is the official Vue 3 state management library (the Vue team deprecated their previous solution, Vuex, in its favour). It creates named stores — singletons that live outside any single component — so data that multiple unrelated components need (connection state, hardware stats, packet history) has one authoritative home. Vue's reactivity system re-renders any component reading from a store the instant that store's data changes.

**Why the Setup Store pattern is used here.** Every store in this project uses the factory-function form:

```ts
export const usePacketStore = defineStore('packets', () => {
  const packetStats = ref<PacketStats | null>(null);   // state
  const currentNoiseFloor = computed(() => …);          // derived
  async function fetchPacketStats(…) { … }              // action
  return { packetStats, currentNoiseFloor, fetchPacketStats };
});
```

This is identical to Vue's Composition API (`ref`, `computed`, plain functions) with a `defineStore` wrapper. There is no separate API to learn on top of what components already use. TypeScript inference flows through without ceremony.

**Domain boundaries.** The stores are partitioned by concern and this separation is enforced:

| Store | Owns |
|---|---|
| `system.ts` | Hardware stats, config, duty cycle |
| `packets.ts` | Packet statistics, noise floor history, recent packets |
| `websocket.ts` | Connection lifecycle, snackbar, ping/pong |
| `neighbors.ts` | Neighbour/contact data |
| `dataService.ts` | HTTP orchestration, TTL caching, polling schedule |
| `treeState.ts` | UI tree expanded-node state |
| `appRuntime.ts` | App-level runtime flags |
| `setup.ts` | Initial device setup flow |

Cross-store dependencies (`usePacketStore()` called inside `websocket.ts`) work cleanly because Pinia manages singleton lifecycles automatically.

**Why not an alternative.**

- *TanStack Query* is excellent at fetch/cache/deduplicate — but DataService already handles all of that. Replacing it would be a substantial rewrite with no user-visible benefit.
- *Plain exported `reactive()` objects* would technically work but lose Vue DevTools integration (store inspection in the browser) and the enforced `defineStore` contract that keeps all stores structurally consistent.

Pinia is the Vue team's recommendation, it matches the Composition API mental model already in use throughout the codebase, and there is no compelling reason to replace it.

---

## Bootstrap modal — why the wait is enforced

`BootstrapModal.vue` blocks navigation until the HTTP bootstrap sequence completes and the WebSocket is open. This is not a cosmetic loading screen — it enforces an ordering that prevents several concrete failure modes.

**What breaks without it.**

| Scenario | Symptom if navigation is allowed early |
|---|---|
| User clicks Configuration before `/stats` resolves | "Loading configuration…" spinner mid-page, or error state — no way for the user to tell if the device is broken or just slow |
| User opens Noise Floor / Sparklines / Packet charts before Phase 2/3 data arrives | Multiple panels showing "Unknown" or empty simultaneously — indistinguishable from a data or display bug |
| User opens Neighbours before Phase 3 adverts load | Empty neighbour table — indistinguishable from "no neighbours exist" |
| HTTP phases and WebSocket open at the same time | Both compete for bandwidth on the same embedded device's radio backhaul; on marginal links this causes timeouts on the HTTP side |
| `/stats` retries in the background (up to 2 retries with backoff) | App appears frozen with no feedback — users assume it is broken |

**What the modal provides instead.**

- A single, visible waiting moment with per-step progress (`pending → loading → done/error`).
- A `"Requesting"` / `"Receiving data"` sub-label on the `/stats` step so users on slow links can see the hardware is actively responding.
- A guaranteed sequencing: HTTP phases complete → WebSocket opens → modal closes. After close, every data-dependent view is safe to navigate to.

The trade-off is one mandatory wait at startup. The benefit is that every subsequent interaction happens against a fully-loaded data layer, with no partial-load states visible anywhere in the UI.

---

## Mobile memory budget — iOS Safari / WebKit constraints

All iOS browsers (Chrome, Firefox, Edge, Brave) run on WebKit. There is no escape: App Store policy prohibits alternative browser engines on iOS. This means every mobile-specific browser constraint described here applies universally on iOS, regardless of which browser icon the user taps.

### WebGL context cleanup — `forceContextLoss()` is mandatory

iOS Safari enforces a hard limit of approximately 8 simultaneous WebGL contexts across the entire browser session. `renderer.dispose()` alone does **not** release a context from the browser's ledger — it only frees Three.js's internal bookkeeping. The GPU context handle itself remains open until the page unloads unless explicitly surrendered.

The correct teardown sequence for any Three.js scene on iOS is:

```ts
renderer.forceContextLoss();   // surrenders the GPU handle to the OS
renderer.dispose();            // frees Three.js internal objects
```

Without `forceContextLoss()`, every visit to the GPS Diagnostics page accumulates a context. After ~8 visits the browser hard-kills the tab with "A problem repeatedly occurred" and no JavaScript exception — the OS terminates the WebKit process before any error can be caught.

`GPSDiagnostics.vue` calls both in its `dispose()` method, called from `onUnmounted`.

### Terminal WebGL addon disposal

`xterm.js`'s `WebglAddon` opens its own WebGL context. The addon reference must be stored at module scope (not inside a try block) so that explicit disposal is guaranteed in `onUnmounted`:

```ts
webglAddon?.dispose();   // surrenders context before xterm tears down its canvas
webglAddon = null;
term?.dispose();
term = null;
```

Relying on `term.dispose()` to cascade through xterm internals is insufficient on iOS — the cascade can silently short-circuit if any internal state check fails.

### GPU texture memory — GPS globe

`earth_atmos_2048.jpg` expands to approximately 10.6 MB of GPU texture memory once mipmaps are generated. On devices with 3–4 GB RAM and a shared CPU/GPU memory pool, this is significant. Two mitigations are applied at load time:

**Texture resolution.** The 1024 variant is loaded on screens narrower than 1024 px (all phones). The 2048 variant is used on wider screens only:

```ts
const EARTH_TEXTURE_URL = window.innerWidth < 1024
  ? '.../earth_atmos_1024.jpg'   // ~2.7 MB GPU
  : '.../earth_atmos_2048.jpg';  // ~10.6 MB GPU
```

**Anisotropy.** `getMaxAnisotropy()` can return 16 on modern GPUs, multiplying sampled texture data per frame by 16×. On mobile this is capped at 2, which retains acceptable quality at the globe's typical viewing distance while reducing per-frame GPU bandwidth:

```ts
texture.anisotropy = window.innerWidth < 1024
  ? Math.min(2, renderer.capabilities.getMaxAnisotropy())
  : renderer.capabilities.getMaxAnisotropy();
```

### Terminal scrollback

xterm.js stores scrollback as live canvas data. At 10,000 lines this is a meaningful portion of mobile RAM. The scrollback buffer is reduced to 500 lines on mobile:

```ts
scrollback: isMobileDevice.value ? 500 : 10000,
```

### Background blur decorators — compositor layer cost

The six decorative `filter: blur(120px)` ellipses in `DashboardLayout.vue` each force the browser to promote the element to a GPU compositor layer. On mobile this occurs even though the ellipses are invisible (they are desktop-only visual chrome). The fix is to suppress them entirely below the `lg` breakpoint:

```html
<!-- was: "dark:hidden absolute..." -->
<div class="hidden lg:block dark:hidden absolute ..."></div>

<!-- was: "hidden dark:block absolute..." -->
<div class="hidden lg:dark:block absolute ..."></div>
```

Six fewer compositor layers removes a non-trivial amount of background GPU work on mobile, which matters on a device already managing a Three.js scene and an xterm WebGL canvas.
