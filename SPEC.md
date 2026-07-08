# openHop-RepeaterUI — Coding Specification

> For AI assistants (Claude, Cursor, Copilot, etc.) and human contributors.
> These are the standards. Read and follow them before writing any code.
> Rules here override general training knowledge and default conventions.

---

## Authoritative sources

When in doubt, read the source — do not infer, assume, or hallucinate values.

| What you need | Where to look |
|---|---|
| Every valid CSS token (`--color-*`) | `src/assets/base.css` |
| Every valid Tailwind alias (`text-primary`, `bg-surface`, etc.) | `tailwind.config.js` |
| Every valid utility class (`.modal-card`, `.btn-primary`, etc.) | `src/assets/main.css` |
| Shared UI components and composables | `src/components/ui/` and `src/composables/` |

---

## Colour and tokens

**Rule: a token is only valid if it exists in `src/assets/base.css` or `tailwind.config.js`. If it is not defined there, it does not exist.**

Tailwind v4 silently emits no CSS for an undefined class — there is no warning, no error, and nothing visible in the browser. This makes hallucinated tokens especially dangerous.

Before using any `text-*`, `bg-*`, or `border-*` class, verify it exists in `tailwind.config.js`. If it is not there, do not use it.

The following tokens **do not exist** in this codebase and must never be written:

```
text-danger   bg-danger   border-danger
text-warning  bg-warning  border-warning
text-success  bg-success  border-success
text-error    bg-error    border-error
text-info     bg-info     border-info
```

These were never defined. They were not removed — they never existed. Use the actual tokens: `text-accent-red`, `bg-accent-amber`, `text-accent-green`, etc. See `tailwind.config.js` for the complete list.

### Never write `bg-primary text-white`

In dark mode `--color-primary` resolves to `#aae8e8` (light pastel teal). `bg-primary/opacity-medium` therefore creates a light teal tinted fill — white text on that light tinted element is invisible. The correct pattern is always `bg-primary/opacity-medium text-primary`. This applies to all accent colours — always pair a tint background with its matching text token, never `text-white`.

### Use the named opacity scale

Numeric opacity modifiers (`/5`, `/10`, `/20`, `/50`) are not used on design tokens. Use the named scale defined in `tailwind.config.js`:

- `/opacity-subtle` — 5% — standard dark-mode surface tint (`dark:bg-white/opacity-subtle`), very subtle row hover, faint gradient starts
- `/opacity-light` — 10% — hover states over subtle surfaces, slightly elevated cards
- `/opacity-medium` — 25% — prominent tints, active states
- `/opacity-heavy` — 50% — strong overlays, modal backdrops

Example: `dark:bg-white/opacity-subtle`, `bg-accent-red/opacity-light`, `border-stroke/opacity-medium`, `bg-black/opacity-heavy`.

### Never add `dark:text-white` alongside semantic text tokens

`text-content-heading` resolves to `#ffffff` in dark mode. `text-content-primary` resolves to `#f9fafb`. Adding `dark:text-white` alongside either is redundant and creates maintenance noise. Remove it.

The only valid use of `dark:text-white` (or `text-on-dark-*`) is on elements that sit on an **explicitly overridden dark background** — e.g. a terminal pane with `dark:bg-black/opacity-medium`. The `text-on-dark-*` utility classes are defined in `src/assets/main.css`.

### Never use raw Tailwind palette literals

`text-green-500`, `bg-red-700`, `border-blue-200` and their variants are not allowed. They are not theme-aware and will not adapt to dark mode. Use the semantic tokens from `tailwind.config.js`.

### Never put hardcoded hex in `:style=` bindings

When a colour value must be inline (runtime-dynamic), use a CSS variable — never a raw hex string:

```ts
// Wrong
backgroundColor: '#15803d'

// Right
backgroundColor: 'var(--color-accent-green)'
```

---

## Utility classes

**Rule: before writing a Tailwind class string in a template, check `src/assets/main.css` for an existing utility class. If one exists, use it.**

The codebase has named classes for modals, config pages, buttons, alerts, status badges, status dots, glass cards, and the top bar. Writing the equivalent inline Tailwind string when a class already exists is wrong — it bypasses the single source of truth and reintroduces patterns the utility classes were specifically created to prevent.

**Rule: if the same Tailwind string appears in more than two components, it belongs in `src/assets/main.css` as a named class — not repeated inline.**

### Context matters for button classes

- `modal-btn-*` — use **only inside** `.modal-actions` in a modal footer. They include `flex-1` and `py-3`.
- `btn-*` — use for page-level and general buttons. They use `py-2` with no `flex-1`.
- `cfg-btn-*` — use inside configuration page forms.

Using `modal-btn-*` outside a modal or `cfg-btn-*` inside a modal is wrong — the sizing assumptions will break the layout.

### Never modify a utility class to fit one special case

If an element needs a variation, add extra classes at the call site:

```html
<!-- Correct: class handles colour/state, call site handles layout -->
<button class="btn-primary w-full mt-4">Save</button>

<!-- Wrong: mutating the shared class to fit one element -->
<!-- .btn-primary { @apply ... w-full mt-4; } — now every btn-primary is full-width -->
```

If the variation is too complex for one or two extra classes, extract a Vue component — not a new variant class.

---

## Shared components

**Rule: always use existing shared components — never write one-off inline equivalents.**

### Spinner — `src/components/ui/Spinner.vue`

Use `<Spinner />` for all loading states. Never write `<div class="animate-spin ...">` and never use the old SVG bar spinner.

| Prop | Options | Default | Use when |
|---|---|---|---|
| `size` | `xs` / `sm` / `md` / `lg` | `md` | `sm` inside buttons; `lg` for full-page overlays; `xs` for inline indicators |
| `color` | `primary` / `white` / `current` | `primary` | `white` inside dark/coloured buttons; `current` to inherit text colour |

```vue
<Spinner />                           <!-- section loading state -->
<Spinner size="sm" color="white" />   <!-- inside a button -->
<Spinner size="lg" />                 <!-- full-page restart overlay -->
<Spinner size="xs" color="current" /> <!-- inline badge indicator -->
```

### CopyLabel + useCopyToClipboard

Never write ad-hoc `navigator.clipboard.writeText` + `setTimeout` inline. Use the composable and component:

```vue
<script setup>
import { useCopyToClipboard } from '@/composables/useCopyToClipboard'
import CopyLabel from '@/components/ui/CopyLabel.vue'
const { copy, copied } = useCopyToClipboard()
</script>
<template>
  <button @click="copy(value)" class="btn-primary flex items-center gap-2">
    <CopyLabel :copied="copied" />
  </button>
</template>
```

`CopyLabel` has a runtime CSS dependency on the `label-swap` transition in `main.css`. Do not remove that rule.

### useAnchoredDropdown — `src/composables/useAnchoredDropdown.ts`

Use this for any dropdown panel that must be teleported to `<body>` to escape a CSS stacking context (e.g. a parent with `backdrop-filter` or `transform`). It manages open/close state, click-outside dismissal, and viewport-relative positioning anchored to a trigger button. Do not duplicate the Teleport + positioning logic inline.

```vue
<script setup>
import { useAnchoredDropdown } from '@/composables/useAnchoredDropdown'
const menu = useAnchoredDropdown()
</script>
<template>
  <div :ref="menu.wrapperRef">
    <button :ref="menu.triggerRef" @click="menu.toggle()" class="topbar-icon-btn">…</button>
    <Teleport to="body">
      <div v-if="menu.isOpen.value" :ref="menu.panelRef" :style="menu.panelStyle.value" class="fixed z-[250] …">
        <!-- panel content -->
      </div>
    </Teleport>
  </div>
</template>
```

Do not add `@click.stop` to the wrapper — propagation must reach `document` so that opening one dropdown closes any other.

### Icons

Always use Lucide (`@lucide/vue`). Never draw inline `<svg>` blocks unless the icon provably does not exist in Lucide — check [lucide.dev/icons](https://lucide.dev/icons) first.

```ts
import { ChevronDown, Pin, X } from '@lucide/vue'
```
```html
<ChevronDown class="w-4 h-4" />
```

### InteractiveSparkline — `src/components/ui/InteractiveSparkline.vue`

Use for all time-series sparklines. Do not write bespoke SVG sparklines inline.

- Data shape: `{ value: number; timestamp: number }[]` — filter and map in the component, not the store.
- Line colour uses `text-secondary` (amber) by default. Override with a parent colour class, not by modifying the component.
- Renders nothing when `data.length < 2`.

---

## Modals

**Rule: modals are for exclusive attention only.** A modal blocks all other interaction — use one only when the user's full attention is genuinely required: a destructive confirmation, a multi-field form that must be completed before continuing, or a critical result. Do not use a modal for supplementary information, status panels, or contextual detail that the user might want to glance at while continuing to use the app.

For UI that appears in response to a topbar action, a nav item, or any trigger where the user should remain oriented to the rest of the page — use a card or panel instead.

Every modal must:

1. Be wrapped in `<Teleport to="body">`
2. Use `.modal-backdrop` (standard) or `.modal-backdrop-heavy` (destructive/irreversible) as the outer div
3. Use `.modal-card` (input/form modals) or `.modal-card-glass` (result/notification modals) as the inner container
4. Put footer buttons inside `.modal-actions` using `modal-btn-*` classes
5. Block backdrop-click and the X button during in-progress or irreversible operations

```vue
<Teleport to="body">
  <div v-if="props.show" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card max-w-md" @click.stop>
      <form class="modal-form" @submit.prevent="handleSubmit">
        <label class="modal-field-label">Label</label>
        <input class="modal-input" />
        <div class="modal-actions">
          <button type="button" class="modal-btn-cancel" @click="emit('close')">Cancel</button>
          <button type="submit" class="modal-btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>
</Teleport>
```

For read-only value display fields (tokens, keys, coordinates) use `modal-input-readonly` with `readonly` (not `disabled` — disabled fields cannot be selected or copied). Provide an explicit copy button alongside if copying is needed.

The full set of modal utility classes is in `src/assets/main.css`.

---

## Z-index layering

Never use ad-hoc values like `z-[9999]`. All z-index values follow a fixed scale with 50-unit gaps:

| Layer | Value | Used for |
|---|---|---|
| Page chrome | `z-[100]` | TopBar inline absolute dropdowns |
| Fixed UI | `z-[150]` | `ConnectionSnackbar` toast |
| Map overlays | `z-[200]` | NetworkMap controls and legend |
| Mobile nav / popovers | `z-[250]` | MobileSidebar backdrop; TopBar panels (via `useAnchoredDropdown`) |
| Primary modals | `z-[300]` | All standard full-screen modals — use this by default |
| Secondary modals | `z-[350]` | Modals opened from inside a primary modal |
| Pickers | `z-[400]` | `LocationPicker` — can open from any modal tier |
| Context menus | `z-[450]` | `NeighborMenu` |
| System overlays | `z-[500]` | `BootstrapModal`, setup restart overlay |

**Rule:** new modals go at `z-[300]` unless opened from inside an existing modal. If a new tier is genuinely needed, document it here first.

**Rule:** every fixed or modal element must use `<Teleport to="body">`. Ancestor `backdrop-filter` or `transform` styles create a new stacking context that traps children regardless of z-index. The `glass-card` class applies `backdrop-filter: blur(50px)` — any dropdown inside a glass-card parent must be teleported. Use `useAnchoredDropdown` for this.

---

## Inline styles

Only use `:style=` when:

- The value is computed at runtime from props, store data, or event coordinates (progress widths, chart heights, floating menu positions)
- The CSS property has no Tailwind equivalent at the required values
- The set of values is open-ended and cannot be enumerated in advance

All other styles belong in Tailwind classes or `src/assets/main.css`.

Never compose Tailwind class names using template literals (`` `text-${color}-500` ``). Tailwind JIT cannot scan them. Use a lookup array and add entries to `safelist` in `tailwind.config.js`.

---

## Data fetching

### DataService-managed endpoints

These endpoints are owned by `src/stores/dataService.ts`. Never fetch them directly from a component — read from the Pinia store via `storeToRefs`:

```ts
import { useDataService } from '@/stores/dataService'
import { storeToRefs } from 'pinia'
const { neighbors } = storeToRefs(useDataService())
```

Managed endpoints: `/stats`, `/packet_stats`, `/noise_floor_history`, `/recent_packets`, `/sparkline_history`, `/advert_rate_limit_stats`, `/adverts`.

If data must be present on mount: `void dataService.ensure('key')` in `onMounted`. Do not check `_lastFetch` for freshness — check `store.data !== null` instead, because WebSocket pushes update stores without updating `_lastFetch`.

After a config save that modifies data: call `systemStore.fetchStats()` directly (intentional cache-bust), then `dataService.invalidate('key')`.

### Per-page direct fetches

Fetch directly (via `src/utils/api.ts`) only for endpoints DataService does not manage: `/identities`, `/transport_keys`, `/logs`, `/gps`, `/room_messages`, `/update/*`, `/restart_service`, and any time-scoped historical query with custom parameters (Statistics page chart data).

For endpoints that may take more than a few seconds (RRD history, packet stats with long ranges), use `streamingGet` from `src/utils/streamingFetch.ts` instead of `ApiService.get` — the standard axios timeout of 10 s will silently abort these requests on real hardware.

### Never gate a spinner on `systemStore.isLoading`

It resolves before any page can be visited and will never show.

### All HTTP calls must use `src/utils/api.ts`

It handles JWT automatically. Never construct raw `fetch` or `axios` calls directly.

---

## Navigation

The sidebar nav is driven entirely by `src/config/navigation.ts`. To add, remove, or restructure menu items, edit only that file — no template changes are needed.

Each item in `navigationItems` follows `NavItemConfig`:

```ts
{
  id: string           // unique across the entire tree — enforced by tests
  label: string
  icon?: Component     // Lucide component
  route?: string       // leaf: navigates on click
  params?: Record<string, string>  // query params added to the route
  activeOn?: string[]  // routes that trigger active/highlight state
  children?: NavItemConfig[]       // makes this a collapsible group
  action?: string      // named action registered in Sidebar.vue's provide() instead of navigation
  enabledWhen?: Capability         // hide when device capability is disabled
}
```

- Leaf items must have `route` or `action` — never both, never neither.
- Group items have `children` and no `route`.
- Configuration tabs use `route: '/configuration'` and `params: { tab: '<id>' }`.

To add a nav action: register a handler in `Sidebar.vue`'s `provide(NAV_ACTION_HANDLERS_KEY, { myAction: () => { ... } })` and add `action: 'myAction'` to the item in `navigation.ts`.

Do not create a separate mobile sidebar component — `Sidebar.vue` handles both desktop and mobile layouts. All content changes apply to both automatically.

---

## Documented exceptions

These are **intentional deviations** from the rules above. Do not "fix" them — they exist for specific reasons. Any compliance sweep that flags these is wrong.

---

### Inline `:style=` on specific components

These inline styles are load-bearing runtime values that cannot be expressed as static classes. Do not replace them with Tailwind classes or CSS variables.

| File | Expression | Why it must stay inline |
|---|---|---|
| `Sidebar.vue`, `MobileSidebar.vue` | `dutyCycleBarStyle` — `width` only | Width is a live percentage (`0–100%`). The `backgroundColor` uses `var(--color-*)` — not hex. Only the width is inline. |
| `PacketTypesChart.vue` | Bar heights (`%`) and segment `backgroundColor` | Both are runtime values per data bucket. Colour cycles through a data-driven palette. |
| `Statistics.vue` | Route stats bar `width` and `backgroundColor` | Width is a percentage of route count vs max; colour cycles through a fixed 5-colour palette by data index. |
| `NeighborMenu.vue` | `top`/`left` position | Calculated from mouse event coordinates at runtime. |
| `Sparkline.vue`, `ChartSparkline.vue` | `color` prop on text and border | Open-ended prop — callers pass arbitrary CSS colour strings. No finite class set covers the input. |
| `GPSDiagnostics.vue` | Satellite `left`/`top`/`--size` on polar plot | Derived from satellite azimuth, elevation, and SNR data. |
| `GPSDiagnostics.vue` | Globe tooltip `top`/`left` | Pointer-event pixel coordinates. |
| `Setup.vue`, `CADCalibration.vue` | Progress bar `width` | Continuous 0–100% value. |
| `AdvertModal.vue` | `filter: drop-shadow(...)` glow | Three-state filter with colour values varying by state. `filter` has no Tailwind equivalent at these values. |
| `NeighborTable.vue` | Contact-type colour dot `backgroundColor` | Arbitrary hex prop from parent. No finite set. |

---

### Forced-dark surface text in TreeNode and GPSDiagnostics

`src/components/ui/TreeNode.vue` and `src/views/GPSDiagnostics.vue` use `text-on-dark-*` classes instead of `text-content-*`.

**Reason:** both elements sit on backgrounds that are explicitly overridden to near-black (`dark:bg-black/opacity-medium` or a full-screen dark overlay). On those surfaces, `text-content-primary` resolves to the wrong value — it's calibrated for the standard page background, not a forced-dark fill. `text-on-dark-*` is the correct pattern here. Do not replace these with `text-content-*` tokens.

---

### Signal bar height lookup arrays + safelist

`NeighborDetailsModal.vue` and `NeighborTable.vue` build Tailwind height classes from arrays at runtime:

```ts
const BAR_HEIGHTS_SM = ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5']
// used as: :class="BAR_HEIGHTS_SM[i - 1]"
```

These class names are safelisted in `tailwind.config.js` because JIT cannot detect them via static scanning. Do not remove them from the safelist, and do not replace the array lookup with inline height calculations.

---

### Statistics page uses a local `ref` snapshot, not the store

`Statistics.vue` stores time-scoped chart data in a local `ref` rather than reading from `packetStore.packetStats`.

**Reason:** `packetStore.packetStats` is also written by the WebSocket push handler on every live update. If the Statistics page read directly from the store, the next WebSocket event would overwrite the user's selected time-range result mid-session — the 7-day chart would silently revert to the live 24-hour view. The local snapshot is deliberate isolation, not a missing refactor.

---

### TopBar dropdown panels use `useAnchoredDropdown` at `z-[250]`, not `z-[300]`

TopBar system status and user menu panels are teleported to `<body>` at `z-[250]` via `useAnchoredDropdown` — lower than the primary modal tier.

**Reason:** `glass-card` applies `backdrop-filter: blur(50px)`, which creates a new CSS stacking context. An absolutely-positioned child inside a `glass-card` parent is trapped within that context regardless of z-index. Teleporting to `<body>` at `z-[250]` escapes the stacking context. This is lower than primary modals (`z-[300]`) because these panels should be covered by modals that open on top of them.

---

### `animate-spin` on the Logs refresh icon

`src/views/Logs.vue` — the "Refresh Snapshot" button uses `:class="{ 'animate-spin': refreshing }"` on an inline SVG refresh icon.

**Reason:** this is a rotating action icon (a circular-arrow refresh), not a loading spinner. `animate-spin` here conveys that the refresh action is in progress on the button the user just pressed. The SPEC prohibition covers building a spinner from scratch with `animate-spin` — it does not prohibit adding spin behaviour to an existing icon that semantically represents rotation. This is the only permitted use of `animate-spin` outside `Spinner.vue`.

---

### Commented-out spinner in PacketTable

`src/components/tables/PacketTable.vue:464` — there is a `border-*-transparent rounded-full animate-spin` div inside an HTML comment block.

**Reason:** it is dead code inside `<!-- ... -->` and is not rendered. The SPEC applies to rendered markup only. Leave the comment in place — it documents an approach that was tried and abandoned.

---

### Discord icon uses `text-indigo-500` on hover

`src/components/nav/Sidebar.vue` — the Discord icon uses `group-hover:text-indigo-500` for its hover colour.

**Reason:** Discord's brand colour is indigo. There is no `text-accent-indigo` semantic token and adding one solely for this one icon would be wrong — it is not a semantic colour, it is a brand identity colour. This is the only permitted raw Tailwind palette literal in the codebase.

---

### Mobile sidebar backdrop uses `z-[249]`

`src/components/nav/Sidebar.vue:244` — the mobile backdrop overlay is `z-[249]`, one below the sidebar's `z-[250]`.

**Reason:** the backdrop must sit immediately behind the sidebar panel but above everything else at the mobile nav tier. There is no scale tier between `z-[200]` and `z-[250]` for this purpose. `z-[249]` is an intentional sub-tier, not a missing entry.

---

### `window.__neighborMenuManager` singleton

`NeighborMenu.vue` stores a global menu manager on `window.__neighborMenuManager`.

**Reason:** the singleton must survive Vite hot-reload module re-evaluation during development. Module-level variables reset on hot reload; `window` does not. This is a development-environment necessity, not sloppy code.

---

### NavItem tree lines use pixel-precise `top: 16px` and `bottom: calc(100% - 16px)`

The scoped CSS in `NavItem.vue` positions pseudo-elements and the `.nav-tick` span at `16px` from the top of each child div.

**Reason:** this value is derived from the current button padding — `py-1.5` (6px) + icon height (20px) + `py-1.5` (6px) = 32px total, centre = 16px. If the button padding ever changes, this value must be updated to match. Do not "fix" it to 18px or any other value without recalculating from the padding.

---

### `streamingGet` on `/stats` uses `timeout: 0`

The `/stats` endpoint overrides the standard 10 s axios timeout with `timeout: 0` and uses an idle-based abort instead.

**Reason:** `/stats` aggregates SPI bus reads, config parsing, and duty-cycle calculations on the embedded backend. On real hardware over a marginal link this can take 12–15 s. The 10 s axios timeout would silently abort it mid-flight, clear the spinner via an unrelated faster response, and leave stale data on screen with no error shown. The idle-based abort only fires if the connection goes silent — an actively-streaming response is never cut off regardless of total duration.

---

## Anti-pattern reference

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| `text-green-500`, `bg-red-700` | Raw palette literal — not theme-aware | `text-accent-green`, `bg-accent-red` |
| `text-danger`, `bg-warning`, `text-success` | These tokens do not exist — emit no CSS | `text-accent-red`, `bg-accent-amber`, `text-accent-green` |
| `bg-primary text-white` | Primary is light teal in dark mode — text is invisible on the tinted fill | `bg-primary/opacity-medium text-primary` |
| `bg-accent-red/10`, `border-stroke/20`, `dark:bg-white/5` | Numeric opacity not used on tokens | `/opacity-subtle` (5%), `/opacity-light` (10%), `/opacity-medium` (25%), `/opacity-heavy` (50%) |
| `text-content-heading dark:text-white` | Token already resolves to white in dark | Remove the `dark:` class |
| `backgroundColor: '#15803d'` in `:style=` | Hardcoded hex doesn't adapt to dark mode | `backgroundColor: 'var(--color-accent-green)'` |
| Inline SVG icon blocks | Inconsistent, hard to maintain | `import { Icon } from '@lucide/vue'` |
| `<div class="animate-spin …">` spinner | Not the project spinner | `<Spinner />` |
| Ad-hoc clipboard + `setTimeout` | Already solved as a composable | `useCopyToClipboard` + `<CopyLabel>` |
| Teleported dropdown built inline | Already solved | `useAnchoredDropdown` composable |
| `` `text-${color}-500` `` | JIT cannot scan template literals | Lookup array + `safelist` |
| Same 6-class string in 3+ files | Single point of failure, hard to update | Named class in `src/assets/main.css` |
| `modal-btn-*` outside a modal footer | Includes `flex-1 py-3` — breaks page layout | `btn-*` for page-level buttons |
| `cfg-btn-*` inside a modal | Wrong size/context | `modal-btn-*` inside modals |
| Modal used for supplementary info | Blocks all interaction unnecessarily | Card or panel |
| `z-[9999]` or other ad-hoc z values | Breaks the layering contract | Use the z-index scale above |
| Missing `<Teleport to="body">` on a modal or fixed panel | Parent `backdrop-filter` traps the element | Always teleport fixed/modal elements |
| Fetching `/stats`, `/neighbors`, `/packets` directly in a component | Bypasses DataService TTL, caching, and deduplication | Read from Pinia store via `storeToRefs` |
| `ApiService.get` for long-running history endpoints | 10 s axios timeout silently aborts on real hardware | Use `streamingGet` from `src/utils/streamingFetch.ts` |
| Token not in `tailwind.config.js` | Silently emits nothing | Verify before use; add if legitimately new |
