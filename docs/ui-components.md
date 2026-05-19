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
| `modal-card` | White/elevated inner card. `bg-white dark:bg-surface-elevated`, `rounded-[20px] p-6 w-full`, border. Combine with `max-w-md`, `max-w-lg`, or `max-w-2xl` in the template. |

```html
<!-- primary modal -->
<div class="modal-backdrop" @click.self="close">
  <div class="modal-card max-w-lg">…</div>
</div>
```

### Form and field classes

| Class | Purpose | Notes |
|---|---|---|
| `modal-form` | `flex flex-col gap-4` container for all modal form fields | Apply to every `<form>` inside a modal. Uses flex gap (not `space-y-*`) — immune to margin collapse |
| `modal-field-label` | `block text-xs font-medium text-content-secondary`, `mt-2 mb-1` | Standard field label above an input or select |
| `modal-field-label-row` | Same spacing as `modal-field-label` but `flex items-baseline gap-3` | Use when the label sits beside an inline action button (e.g. a "Show/Edit" toggle) |
| `modal-input` | Full-width text/number/password input, `rounded-md`, focus ring on `border-primary` | Do not write raw Tailwind input classes in modal templates |
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

### Canonical example

See `BrokerEditModal.vue` for a fully-styled modal using all of the above classes.

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
