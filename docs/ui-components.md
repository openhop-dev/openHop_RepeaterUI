# Shared UI Components

Reusable primitives in `src/components/ui/`. Use these instead of writing one-off inline markup.

---

## Spinner

`src/components/ui/Spinner.vue`

A single-arc spinner used throughout the app for all loading states. The spinner uses a `border-b` style — only the bottom border of a circle is coloured, creating a single visible arc that rotates. This is intentionally not a full ring.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Physical size and border weight |
| `color` | `'primary' \| 'white' \| 'current'` | `'primary'` | Arc colour |

### Size reference

| `size` | Dimensions | Border | Use case |
|---|---|---|---|
| `xs` | 12 × 12 px | 1 px | Tiny inline indicator (version-check badge, inline log status) |
| `sm` | 16 × 16 px | 2 px | Inside buttons, tight inline states |
| `md` *(default)* | 32 × 32 px | 2 px | Card / section loading states |
| `lg` | 48 × 48 px | 2 px | Full-screen overlays (restart, setup) |

### Color reference

| `color` | Border class | Use when |
|---|---|---|
| `primary` | `border-primary` | Default — follows the theme token (`#0d7377` light / `#aae8e8` dark) |
| `white` | `border-white` | Inside a dark or coloured button background where `primary` would be invisible |
| `current` | `border-current` | Inherits the surrounding text colour — useful inside a coloured label or badge |

### Import path

```ts
import Spinner from '@/components/ui/Spinner.vue';
```

### Usage

```vue
<!-- default (md, primary) — section loading state -->
<Spinner />

<!-- inside a primary action button -->
<Spinner size="sm" color="white" />

<!-- full-page restart or setup overlay -->
<Spinner size="lg" />

<!-- inline version-check indicator -->
<Spinner size="xs" class="inline-block" />
```

**Do not** use inline `animate-spin` divs. The old bar/segment SVG spinner has been removed from `RestartModal.vue` and `Setup.vue`. Do not reintroduce either pattern.

---

## CopyLabel

`src/components/ui/CopyLabel.vue`

A fixed-width label for copy buttons that crossfades between a default state ("Copy") and a confirmed state ("Copied!") without changing the button's size. Uses a CSS grid overlay — an invisible sizer span always occupies the width of the longer string, keeping the button stable while the visible label transitions.

Pair with `useCopyToClipboard` to drive the `copied` prop.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `copied` | `boolean` | — | Required. When true, shows the confirmed label |
| `label` | `string` | `'Copy'` | Default label text |
| `confirmed` | `string` | `'Copied!'` | Label shown when `copied` is true |

### Usage

```vue
<button @click="handleCopy" class="btn-primary flex items-center gap-2">
  <svg>…</svg>
  <CopyLabel :copied="copied" />
</button>

<!-- With a custom default label -->
<button @click="handleCopy" class="btn-success flex items-center gap-2">
  <svg>…</svg>
  <CopyLabel :copied="copied" label="Copy Key" />
</button>
```

The `label-swap` transition (150ms opacity crossfade) is defined in `main.css` and applies automatically — no local `<style>` block needed. **Do not remove the `label-swap` CSS from `main.css`** — `CopyLabel` has an implicit runtime dependency on it. The component will still function (the label still swaps) but the crossfade will disappear silently with no build error.

---

## useAnchoredDropdown

`src/composables/useAnchoredDropdown.ts`

A composable for Teleported dropdown panels that need to escape a CSS stacking context (e.g. a parent with `backdrop-filter` or `transform`). Manages open/close state, click-outside dismissal, and `fixed` viewport-relative positioning anchored to a trigger button.

Use this any time a dropdown panel needs to be teleported to `<body>`. Do not duplicate the Teleport + positioning logic inline.

### Returns

| Name | Type | Description |
|---|---|---|
| `triggerRef` | `Ref<HTMLElement \| null>` | Attach to the button that opens/closes the panel |
| `wrapperRef` | `Ref<HTMLElement \| null>` | Attach to the container div that wraps the trigger |
| `panelRef` | `Ref<HTMLElement \| null>` | Attach to the Teleported panel element |
| `isOpen` | `Ref<boolean>` | Whether the panel is currently open |
| `panelStyle` | `Ref<Record<string, string>>` | Inline style object — bind to the panel with `:style` |
| `open()` | `() => void` | Open the panel and calculate position |
| `close()` | `() => void` | Close the panel |
| `toggle()` | `() => void` | Toggle open/closed |

### Usage

```vue
<script setup>
import { useAnchoredDropdown } from '@/composables/useAnchoredDropdown'
const menu = useAnchoredDropdown()
</script>

<template>
  <div :ref="menu.wrapperRef">
    <button :ref="menu.triggerRef" @click="menu.toggle()" class="topbar-icon-btn">
      <!-- icon -->
    </button>
    <Teleport to="body">
      <div
        v-if="menu.isOpen.value"
        :ref="menu.panelRef"
        :style="menu.panelStyle.value"
        class="fixed z-[250] ..."
      >
        <!-- panel content -->
      </div>
    </Teleport>
  </div>
</template>
```

### Positioning behaviour

- **Desktop (≥ 640 px):** panel is right-aligned to the trigger button's right edge, 4 px below it.
- **Mobile (< 640 px):** panel is horizontally centred in the viewport.
- A scroll listener on `<main>` recalculates position as the page scrolls so the panel tracks the trigger button.

### Click-outside

Handled automatically via a `document` click listener. Do **not** add `@click.stop` to the wrapper — propagation must reach the document so that opening one dropdown closes any other open dropdown.

---

## NeighborMenu

`src/components/ui/NeighborMenu.vue`

A three-dot context menu for neighbor rows in the Neighbors page. Renders via `<Teleport to="body">` at `z-[450]` (above all modals) and automatically flips to avoid viewport overflow.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `neighbor` | `Neighbor` | Yes | The neighbor object the menu acts on |
| `canPing` | `boolean` | No | Reserved — ping is always shown in current implementation |

### Emits

| Event | Payload | When |
|---|---|---|
| `ping` | `Neighbor` | User clicks Ping |
| `delete` | `Neighbor` | User clicks Delete |
| `show-details` | `Neighbor` | User clicks Details |

### Usage

```vue
<NeighborMenu
  :neighbor="row"
  @ping="handlePing"
  @delete="handleDelete"
  @show-details="showDetailsPanel"
/>
```

### Global menu manager pattern

Only one `NeighborMenu` may be open at a time. A module-level singleton (`window.__neighborMenuManager`) tracks the currently open menu instance. When `toggleMenu()` opens a new menu it calls `globalMenuManager.setActiveMenu(menuInstance)`, which calls `closeMenu()` on the previously active instance before opening the new one.

This pattern avoids a centralised event bus while still enforcing a single-open invariant across all rows in a potentially long table. The manager is stored on `window` so it survives hot-reload module re-evaluation during development.

### Viewport-flip behaviour

The menu opens below the trigger button by default. Two overflow corrections are applied in sequence after `nextTick()`:

1. **Horizontal flip (mobile only):** If the menu (`w-36` = 144 px) would extend past the right edge of the viewport with less than 16 px margin, the menu is right-aligned to the button's right edge instead.
2. **Vertical flip:** After the menu is rendered and its actual height is known (`menuRef.offsetHeight`), if `bottom + height > innerHeight - 8` the menu is repositioned above the button (`top = rect.top - height - 4`).

The vertical flip reads the rendered height rather than estimating it, so it works correctly even when the menu contains a variable number of items.

### Dismissal

The menu closes on:
- Click outside any element marked `data-menu-container`
- Escape key
- Selection of any menu item
- Component unmount (`onUnmounted`)

---

## Modal CSS utilities

Defined in `src/assets/main.css` — see [z-index Layering](z-index-layering.md) for backdrop z-index rules.

### Backdrop classes

| Class | Purpose | Notes |
|---|---|---|
| `modal-backdrop` | Fixed full-screen backdrop, `z-[300]`, 50% black, `backdrop-blur-lg` | Standard modals — confirmations, edit dialogs |
| `modal-backdrop-heavy` | Same layout but 80% black overlay | Destructive / irreversible operations where stronger visual separation is needed |

Both classes include `flex items-center justify-center p-4` so the inner card is centred. Add `@click.self="close"` on the backdrop element to close on outside click. Never add a click handler to `modal-card` — use `.stop` propagation only if a child element genuinely needs to block the backdrop click.

**Do not use** `modal-backdrop-heavy` for standard edit dialogs — reserve it for delete confirmations and other irreversible actions.

### Card class

| Class | Purpose |
|---|---|
| `modal-card` | White/elevated inner card. `bg-white dark:bg-surface-elevated`, `rounded-[20px] p-6 w-full`, border. Combine with `max-w-md`, `max-w-lg`, or `max-w-2xl` in the template. Use for all input/form/confirmation modals. |
| `modal-card-glass` | Glass-surface shell for result/notification modals. Uses the glass background token and heavy backdrop blur. No built-in padding — add `overflow-hidden` and manage padding per-section. Inner sections should render content directly without sub-card backgrounds. |

```html
<!-- input / confirmation modal -->
<div class="modal-backdrop" @click.self="close">
  <div class="modal-card max-w-lg">…</div>
</div>

<!-- result / notification modal -->
<div class="modal-backdrop" @click.self="close">
  <div class="modal-card-glass max-w-md overflow-hidden">…</div>
</div>
```

### Form and field classes

| Class | Purpose | Notes |
|---|---|---|
| `modal-form` | `flex flex-col gap-4` container for all modal form fields | Apply to every `<form>` inside a modal. Uses flex gap (not `space-y-*`) — immune to margin collapse |
| `modal-field-label` | `block text-xs font-medium text-content-secondary`, `mt-2 mb-1` | Standard field label above an input or select |
| `modal-field-label-row` | Same spacing as `modal-field-label` but `flex items-baseline gap-3` | Use when the label sits beside an inline action button (e.g. a "Show/Edit" toggle) |
| `modal-input` | Full-width text/number/password input, `rounded-md`, focus ring on `border-primary` | Do not write raw Tailwind input classes in modal templates |
| `modal-input-readonly` | Read-only value display. Same surface as `modal-input`, adds `font-mono cursor-default`, no focus ring | For computed/fetched values the user reads but cannot edit — tokens, keys, coordinates. Provide an explicit copy button if copying is needed. |
| `modal-select` | Full-width `<select>` — same visual style as `modal-input` | No `placeholder-*` token needed for selects |

**Form spacing:** `modal-form` applies `gap-4` between direct children. `modal-field-label` adds `mt-2` for within-group breathing room only. Do not add extra margin or padding between fields — let the container gap handle section spacing.

### Action row and button classes

| Class | Purpose | Notes |
|---|---|---|
| `modal-actions` | `flex gap-3 pt-2` wrapper for the button row | Always the last child of `modal-form` or directly in `modal-card` |
| `modal-btn-cancel` | Muted secondary button | Use for Cancel and safe secondary actions (e.g. "Save Only" in a 3-button row). `flex-1` is built in — buttons share row space equally |
| `modal-btn-primary` | Coloured primary action (`bg-primary/20`, `border-primary/50`, `text-primary`) | Use for the main positive action (Save, Add, Confirm) |
| `modal-btn-danger` | Red destructive action (`bg-accent-red/20`, `border-accent-red/50`, `text-accent-red`) | Use only for Delete, Remove, or other irreversible destructive actions |

All three button classes include `flex-1` so buttons in a `modal-actions` row share width equally. If you need a button that does not stretch (e.g. a narrow icon-only button), do not use these classes — write the button inline.

**Do not** use these classes outside of modal contexts. For configuration page buttons use `cfg-btn-primary` / `cfg-btn-secondary` instead.

### Readonly fields

Use `modal-input-readonly` on any `<input readonly>` that displays a derived or fetched value — API tokens, transport keys, coordinate readouts:

```html
<input :value="generatedToken" readonly class="modal-input-readonly" />

<!-- With callsite size overrides (floor-not-ceiling rule) -->
<input :value="generatedToken" readonly class="modal-input-readonly flex-1 text-sm" />
```

Use `readonly`, not `disabled` — disabled fields cannot be selected or copied.

### Canonical example

See `BrokerEditModal.vue` for a fully-styled modal using all of the above classes.

---

## KeyModal

`src/components/modals/KeyModal.vue`

A dual-mode modal that handles both creating and editing transport key entries (regions and private keys). The mode is determined by the `node` prop — `null` for add, a `TreeNodeData` object for edit.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `show` | `boolean` | Yes | Controls modal visibility |
| `node` | `TreeNodeData \| null` | Yes | `null` = add mode; non-null = edit mode, pre-populates the form |
| `selectedParentId` | `number` | No | In add mode, the node ID that will be the parent of the new entry |
| `allNodes` | `TreeNodeData[]` | Yes | Full flat tree. Used to walk the parent path for display in both modes |

### Emits

| Event | Payload | When |
|---|---|---|
| `close` | — | User cancels or dismisses the modal |
| `add` | `{ name, floodPolicy, parentId? }` | Add mode — user submits a new entry |
| `save` | `{ id, name, floodPolicy, transportKey? }` | Edit mode — user saves changes |

`transportKey` is only present in the `save` payload when the entry is a region (`#`-prefixed) **and** the name has changed. The caller is responsible for applying the key to the API update.

### Add mode

Opens with empty fields and a region/private-key type toggle. Shows the parent node's full path above the form so the user can see where the new entry will appear in the tree. The `#` prefix is added automatically for region entries.

### Edit mode

Pre-populates from the `node` prop (via a `watch`). For region entries with an existing `transport_key`:

- Derives the current transport key client-side using `SHA-256(#name)[:16] → base64`, matching the `pymc_core get_auto_key_for` algorithm.
- Displays the derived key in a `modal-input-readonly` field.
- If the name is changed (`nameChanged` computed), the transport key updates live and the "updated for …" notice appears. The new key is included in the `save` payload only when the name actually changed.
- The copy button (copies the existing server key) is hidden when the name is dirty.

### Usage

The single callsite is `TransportKeys.vue`. Pass `:node="null"` for the add flow and `:node="editingNode"` for the edit flow.

```vue
<!-- Add mode -->
<KeyModal
  :show="showAddModal"
  :node="null"
  :selected-parent-id="selectedNodeId"
  :all-nodes="transportKeysData"
  @close="showAddModal = false"
  @add="handleAddKey"
/>

<!-- Edit mode -->
<KeyModal
  :show="showEditModal"
  :node="editingNode"
  :all-nodes="transportKeysData"
  @close="handleCloseEditModal"
  @save="handleSaveEdit"
/>
```

---

## Glass card utilities

Defined in `src/assets/main.css`. Used on the Dashboard for stat cards that sit over a blurred background.

| Class | Background | Use case |
|---|---|---|
| `glass-card` | `rgba(255,255,255,0.75)` light / `rgba(0,0,0,0.4)` dark | Neutral stat card |
| `glass-card-green` | Green-tinted gradient, both modes | Positive or healthy metric (e.g. duty cycle under limit) |
| `glass-card-orange` | Amber-tinted gradient, both modes | Warning-level metric (e.g. duty cycle near limit) |

All three classes apply `rounded-[10px] backdrop-blur-[50px]` and a mode-appropriate border and box shadow. The exact values (background, border, shadow) are defined as CSS variables in `base.css` and vary between light and dark mode.

```html
<div class="glass-card p-4">…</div>
<div class="glass-card-green p-4">…</div>
<div class="glass-card-orange p-4">…</div>
```

**Do not** use glass cards inside modals or configuration pages — they are a visual element for the Dashboard layout only.

---

## Configuration card utilities

Defined in `src/assets/main.css`. Use these instead of repeating the card/border Tailwind strings inline.

| Class | Purpose |
|---|---|
| `cfg-section` | Standard muted card with 32 px padding (`p-8`) — the main content pane inside every config tab |
| `cfg-card` | Same visual style as `cfg-section` but **no built-in padding** — use when you need to control padding or overflow yourself (e.g. a table, a tree list, a scrollable region) |
| `cfg-page-heading` | Spacing class for the top-of-tab heading block (`pb-2`) |
| `cfg-btn-primary` | Primary action button for config pages (save, generate, etc.) |
| `cfg-btn-secondary` | Secondary/cancel action button for config pages |
| `cfg-input` | Full-width text/number input for config forms |
| `cfg-select` | Full-width `<select>` for config forms |

```vue
<!-- Standard padded section -->
<div class="cfg-section">…</div>

<!-- Table or tree with its own overflow/padding -->
<div class="cfg-card overflow-hidden">
  <table>…</table>
</div>

<!-- Card with explicit padding (e.g. 24 px) -->
<div class="cfg-card p-6">…</div>
```

**Do not** write the raw Tailwind string `bg-transparent dark:bg-white/5 rounded-lg border border-stroke-subtle dark:border-stroke/10` in templates — use `cfg-card` or `cfg-section` so visual changes propagate from one place.

**Do not** use `cfg-btn-*` inside modals — use `modal-btn-*` there.

---

## InteractiveSparkline

`src/components/ui/InteractiveSparkline.vue`

A generic interactive SVG sparkline with hover cursor, snapping dot, and a floating tooltip. Use this for any time-series data sparkline in the app — do not write bespoke SVG sparklines inline.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `{ value: number; timestamp: number }[]` | required | Data points. `timestamp` is Unix seconds. |
| `height` | `number` | `28` | SVG height in px |
| `unit` | `string` | `''` | Unit label appended to the tooltip value (e.g. `'dBm'`) |

### Exposes

| Name | Type | Description |
|---|---|---|
| `hoveredPoint` | `{ value, timestamp, x, y } \| null` | The currently hovered data point, or `null`. Parents can react to this to update labels. |

### Behaviour

- Renders nothing when `data.length < 2`.
- Tooltip is `<Teleport to="body">` at `z-index: 9999` — it escapes all overflow/clip contexts including the sidebar's scroll container.
- Tooltip flips left when the cursor is within 120 px of the right viewport edge.
- Mouse leave clears hover state instantly.

### Data shape contract

The store provides **raw history** data; the consuming component is responsible for filtering and mapping it into `{ value, timestamp }[]`. Do not add UI-specific computed properties to stores.

```ts
// ✓ Correct — mapping in the component
const sparklineData = computed(() =>
  packetStore.noiseFloorHistory
    .filter((p) => p.noise_floor_dbm !== 0 && p.timestamp >= oneHourAgo)
    .map((p) => ({ value: p.noise_floor_dbm, timestamp: p.timestamp })),
)
```

### Usage

```vue
<InteractiveSparkline :data="sparklineData" unit="dBm" />

<!-- with height override -->
<InteractiveSparkline :data="sparklineData" :height="40" unit="%" />

<!-- reading hovered value in parent -->
<InteractiveSparkline ref="sparkRef" :data="sparklineData" unit="dBm" />
<span>{{ sparkRef?.hoveredPoint?.value ?? currentValue }} dBm</span>
```

### Colour

The line uses `text-secondary` (`--color-secondary`, amber) via `stroke="currentColor"`. To use a different colour, wrap the component and override with a parent colour class — do not modify the component itself for one-off colours.

### TODO

All sparklines that currently use the old `RFNoiseFloor.vue` scatter-dot pattern should be migrated to `InteractiveSparkline` when next touched.

---

## Composables

Reusable logic in `src/composables/`. Import directly — no registration needed.

### useCopyToClipboard

`src/composables/useCopyToClipboard.ts`

Handles clipboard writes with a timed `copied` flag. Falls back to a `textarea` + `execCommand` approach for older browsers. Use alongside `CopyLabel` for consistent copy button feedback across the app.

```ts
const { copy, copied } = useCopyToClipboard()
// copied: Ref<boolean> — true for 2 seconds after a successful copy

// In a handler:
const handleCopy = () => copy(someText)
```

The reset delay defaults to 2000 ms and can be overridden: `useCopyToClipboard(3000)`.

**Do not** write ad-hoc `navigator.clipboard.writeText` + `setTimeout` inline in components — use this composable so all copy feedback is consistent.
