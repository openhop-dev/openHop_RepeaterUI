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

## Dashboard vs Statistics — live data vs historical reports

**Decision.** The Dashboard is the home for real-time data. The Statistics page is a historical reporting page. These two purposes are mutually exclusive and must not be mixed.

**Dashboard** shows live counters updated by the WebSocket: uptime, RX packet count, forwarded, dropped, CRC errors, and Hash Cache size. All of these are point-in-time values with no meaningful time-range parameter.

**Statistics** shows time-scoped historical charts drawn from the RRD backend: packet rate over time, noise floor, route distribution, CRC error trend. The user selects a time range (1 h – 7 d). Data loads once on mount and again when the range changes. Nothing updates between those two events — the page does not poll and does not respond to WebSocket pushes.

**Why this distinction matters.** Before this was enforced, the Statistics page was attempting to do both. The `topStats` ref (Total RX / Total TX numerical values) was a `computed` reading from `packetStore.packetStats`, which the WebSocket handler also writes on every push. This meant:

- Changing the time range from 7 days to 2 days would trigger a time-scoped fetch, but the next WebSocket push would overwrite the result with the current live counter.
- The page was polling every 30 seconds via `useManagedPolling` for data with one-hour RRD resolution — meaningless churn.
- Hash Cache (`duplicate_cache_size`) was displayed on Statistics even though it has no historical dimension and cannot respond to the time-range picker.

**What to put where.** If a metric has a historical series in the RRD database and responds meaningfully to the time-range picker → Statistics. If it is a live operational counter updated by the WebSocket → Dashboard StatsCards.

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

---

## Spinner unification — single `Spinner.vue` component

**Decision.** All loading indicators in the app use a single `Spinner.vue` component with a `border-b` single-arc style. Inline `animate-spin` divs and the legacy bar/segment SVG spinner are prohibited.

**What changed.** Before unification, loading states were implemented ad-hoc:
- Some components used inline `<div class="animate-spin border-2 border-primary border-t-transparent rounded-full">` with varying sizes.
- `RestartModal.vue` and `Setup.vue` used a multi-segment SVG spinner that animated each arc independently.
- Size, border weight, and colour varied between components with no consistency.

**Why `border-b` instead of `border-t-transparent`.** The `border-b` approach applies a single border only to the bottom edge of the circle. Only that one edge is visible — the other three are transparent by default. This is simpler to understand than `border-t-transparent` (which applies all four borders and then hides one), and the CSS output is identical in practice. The single-arc visual is intentional — it reads as a clean, minimal indicator rather than a segmented ring.

**Props.** `size` (`xs` / `sm` / `md` / `lg`) and `color` (`primary` / `white` / `current`) are the only variation points. See [UI Components — Spinner](ui-components.md#spinner) for the full reference.

**Rule.** Do not reintroduce inline `animate-spin` divs or SVG spinners. If a new size is needed, add it to `Spinner.vue`.

---

## Modal button global classes — layout-neutral semantic tokens

**Decision.** `modal-btn-primary`, `modal-btn-cancel`, and `modal-btn-danger` are defined once in `src/assets/main.css` rather than repeating the full Tailwind string in every modal template.

**What changed.** Before these classes existed, each modal wrote its own button styles:

```html
<!-- old pattern — repeated across every modal -->
<button class="flex-1 px-4 py-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary font-medium transition-colors">
  Save
</button>
```

Changing the primary button appearance required editing every modal file. The classes centralise that in `main.css`.

**`flex-1` is built into the classes.** All three button classes include `flex-1` so buttons in a `modal-actions` row share width equally by default. This is intentional for the standard two-button (Cancel / Primary) and three-button (Cancel / Save / Danger) layouts.

**When NOT to use.** Do not apply these classes to buttons that must not stretch (e.g. a narrow icon button, a pill badge, or any button outside a `modal-actions` flex row). Write those buttons inline. Do not use these classes in configuration pages — use `cfg-btn-primary` / `cfg-btn-secondary` there.

---

## OTA update modal exit lock — `installState === 'verified'`

**Decision.** After `installState` reaches `'verified'` (pip install succeeded and the post-restart version check confirmed the correct version is running), all exit paths from `UpdateModal.vue` are locked. The user must click "Refresh Page to Load New Version" — there is no other way to close the modal.

**Locked paths when `installState === 'verified'`:**

| Exit path | Behaviour |
|---|---|
| X button (header close icon) | Hidden via `v-if="installState !== 'verified'"` |
| Backdrop click | `handleBackdropClick` checks `installState !== 'verified'` before emitting `close` |
| Close button (footer) | Hidden via `v-if="installState !== 'verified'"` |
| Apply / Install button | Disabled (`canInstall` is `false` when `verified`) |

The only interactive element shown is "Refresh Page to Load New Version", which calls `window.location.reload()`.

**Why.** After a successful OTA install the running JavaScript bundle is stale. If the user dismisses the modal and continues interacting with the UI, they are running old code against a new backend. Config page saves, API calls, and WebSocket message parsing may all silently break. Forcing a reload before the user can continue prevents this class of confusion entirely.

The same lock applies during `'installing'` and `'restarting'` states (exit is also blocked) to prevent the user from navigating away mid-install and leaving an interrupted pip process running on the device.
