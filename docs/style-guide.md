# Style Guide — pyMC-RepeaterUI

> Audience: developers and AI assistants working in this codebase.
> This document is auto-maintained — update it whenever you add/change an inline style, utility class, or design token.

---

## 1. Design Token Reference

All tokens are CSS custom properties declared in `src/assets/base.css`.
Tailwind aliases are mapped in `tailwind.config.js` and resolve at build time.

### 1.1 Surface & Background

| CSS variable | Light value | Dark value | Tailwind alias |
|---|---|---|---|
| `--color-surface` | `#ffffff` | `#0f1112` | `bg-surface` |
| `--color-surface-elevated` | `#ffffff` | `#1a1e1f` | `bg-surface-elevated` |
| `--color-background` | `#f5f7fa` | `#09090b` | `bg-background` |
| `--color-background-soft` | `#f8f8f8` | `#111314` | `bg-background-soft` |
| `--color-background-mute` | `#ebeef2` | `#1a1e1f` | `bg-background-mute` |

### 1.2 Text

| CSS variable | Light value | Dark value | Tailwind alias | WCAG ratio on bg |
|---|---|---|---|---|
| `--color-text-primary` | `#111827` | `#f9fafb` | `text-content-primary` | 16:1 |
| `--color-text-secondary` | `#374151` | `#d1d5db` | `text-content-secondary` | 9.5:1 |
| `--color-text-muted` | `#6b7280` | `#9ca3af` | `text-content-muted` | 4.6:1 |
| `--color-heading` | `#030712` | `#ffffff` | `text-content-heading` | 19.5:1 |
| `--color-text` | `#374151` | `#adadad` | `text-content` (default) | — |

### 1.3 Borders

| CSS variable | Light value | Dark value | Tailwind alias |
|---|---|---|---|
| `--color-border` | `#9ca3af` | `#4b4b4b` | `border-stroke` |
| `--color-border-subtle` | `#d1d5db` | `#374151` | `border-stroke-subtle` |
| `--color-border-hover` | `#6b7280` | `#6b7280` | `border-stroke-hover` |

### 1.4 Accent — text/icon use (auto-switch light ↔ dark)

| CSS variable | Light value | Dark value | Tailwind alias | Notes |
|---|---|---|---|---|
| `--color-primary` | `#0d7377` | `#aae8e8` | `text-primary` / `bg-primary` | Teal |
| `--color-secondary` | `#92610a` | `#ffc246` | `text-secondary` / `bg-secondary` | Amber |
| `--color-accent-green` | `#15803d` | `#a5e5b6` | `text-accent-green` / `bg-accent-green` | Green |
| `--color-accent-purple` | `#7c3aed` | `#eba0fc` | `text-accent-purple` | Purple |
| `--color-accent-red` | `#dc2626` | `#fb787b` | `text-accent-red` | Red |
| `--color-accent-cyan` | `#0e7490` | `#d1e6e4` | `text-accent-cyan` | Cyan |

### 1.5 Accent — background fills (pair with dark text on top)

| CSS variable | Light value | Dark value | Tailwind alias |
|---|---|---|---|
| `--color-primary-bg` | `#aae8e8` | `#0d7377` | `bg-primary-bg` |
| `--color-secondary-bg` | `#ffc246` | `#92610a` | `bg-secondary-bg` |
| `--color-accent-green-bg` | `#a5e5b6` | `#15803d` | `bg-accent-bg-green` |
| `--color-accent-purple-bg` | `#eba0fc` | `#7c3aed` | `bg-accent-bg-purple` |
| `--color-accent-red-bg` | `#fb787b` | `#dc2626` | `bg-accent-bg-red` |
| `--color-accent-cyan-bg` | `#d1e6e4` | `#0e7490` | `bg-accent-bg-cyan` |

### 1.6 Badge / pill colours (inverted between light/dark)

| CSS variable | Light value | Dark value | Tailwind alias |
|---|---|---|---|
| `--color-badge-cyan-bg` | `#d1e6e4` | `#223231` | `bg-badge-cyan-bg` |
| `--color-badge-cyan-text` | `#0d7377` | `#d1e6e4` | `text-badge-cyan-text` |
| `--color-badge-neutral-bg` | `#e5e7eb` | `#374151` | `bg-badge-neutral-bg` |
| `--color-badge-neutral-text` | `#374151` | `#d1d5db` | `text-badge-neutral-text` |

### 1.7 Glass card colours

These are used exclusively by the `.glass-card`, `.glass-card-green`, `.glass-card-orange` utility classes and should not be referenced directly in templates.

| CSS variable | Purpose |
|---|---|
| `--color-glass-bg` | Background fill for neutral glass card |
| `--color-glass-border` | Border for neutral glass card |
| `--color-glass-shadow` | Drop shadow for neutral glass card |
| `--color-glass-green-bg` | Gradient fill for green glass card |
| `--color-glass-green-border` | Border for green glass card |
| `--color-glass-green-shadow` | Shadow for green glass card |
| `--color-glass-orange-bg` | Gradient fill for orange glass card |
| `--color-glass-orange-border` | Border for orange glass card |
| `--color-glass-orange-shadow` | Shadow for orange glass card |

---

## 2. Global Utility Class Catalogue

All classes live in `src/assets/main.css` inside `@layer utilities`.

### 2.1 Glass cards

#### `.glass-card`
**Purpose:** Standard frosted-glass card surface. Used for stat cards, info panels, and any elevated content block.  
**Anatomy:** `rounded-[10px]`, `backdrop-blur-[50px]`, `var(--color-glass-bg)` background, subtle border and shadow.  
**Usage:**
```html
<div class="glass-card p-4">…</div>
```

#### `.glass-card-green`
**Purpose:** Variant with a green gradient background. Used for positive/healthy KPI cards.  
**Usage:**
```html
<div class="glass-card-green p-4">…</div>
```

#### `.glass-card-orange`
**Purpose:** Variant with an amber gradient background. Used for warning-level KPI cards.  
**Usage:**
```html
<div class="glass-card-orange p-4">…</div>
```

### 2.2 Chart segment colours

#### `.bg-mode-segment-forward`
**Purpose:** Semi-transparent green fill for "forward" mode segments inside packet-type charts.  
**Value:** `color-mix(in srgb, var(--color-accent-green) 35%, transparent)`

#### `.bg-mode-segment-no-tx`
**Purpose:** Semi-transparent red fill for "no-tx" mode segments.  
**Value:** `color-mix(in srgb, var(--color-accent-red) 35%, transparent)`

### 2.3 Configuration page layout

#### `.cfg-page-heading`
**Purpose:** Bottom padding spacer for page-level headings on configuration views.  
**Usage:**
```html
<h1 class="cfg-page-heading text-2xl font-bold">Radio Settings</h1>
```

#### `.cfg-section`
**Purpose:** Full-padded section container with subtle background and border. Use when the section owns its own padding.  
**Usage:**
```html
<section class="cfg-section">…</section>
```

#### `.cfg-card`
**Purpose:** Padding-free variant of `cfg-section`. Use when the caller needs to control overflow, padding, or has a table/list that should flush to edges.  
**Usage:**
```html
<div class="cfg-card overflow-hidden">…</div>
```

#### `.cfg-btn-primary`
**Purpose:** Primary action button in configuration forms (save, apply).  
**Usage:**
```html
<button class="cfg-btn-primary" type="submit">Save</button>
```

#### `.cfg-btn-secondary`
**Purpose:** Secondary/muted action button in configuration forms (cancel, reset).  
**Usage:**
```html
<button class="cfg-btn-secondary" type="button">Cancel</button>
```

#### `.cfg-input`
**Purpose:** Full-width text/number/password input for configuration forms.  
**Usage:**
```html
<input class="cfg-input" type="text" />
```

#### `.cfg-select`
**Purpose:** Full-width `<select>` for configuration forms. Identical styling to `cfg-input`.  
**Usage:**
```html
<select class="cfg-select">…</select>
```

### 2.4 Modal system

#### `.modal-backdrop`
**Purpose:** Standard semi-opaque backdrop for confirmations and edit dialogs. `z-[300]` per the project z-index layering scale.  
**Usage:**
```html
<div class="modal-backdrop" @click.self="close">…</div>
```

#### `.modal-backdrop-heavy`
**Purpose:** Heavily-opaque backdrop (`bg-black/80`) for destructive/irreversible operations to visually signal danger.  
**Usage:**
```html
<div class="modal-backdrop-heavy" @click.self="close">…</div>
```

#### `.modal-card`
**Purpose:** Inner modal container. Combine with a max-width class in the template.  
**Usage:**
```html
<div class="modal-card max-w-lg">…</div>
```

#### `.modal-form`
**Purpose:** `flex flex-col gap-4` wrapper for modal `<form>` elements. Avoids margin-collapse brittleness.  
**Usage:**
```html
<form class="modal-form">…</form>
```

#### `.modal-field-label`
**Purpose:** Field label inside a modal form. `mt-2 mb-1` provides breathing room between sections; `gap-4` on the form handles section-to-section spacing.  
**Usage:**
```html
<label class="modal-field-label">API Token</label>
```

#### `.modal-field-label-row`
**Purpose:** Variant of `modal-field-label` for labels that sit beside an inline action (e.g. a Show/Edit toggle button).  
**Usage:**
```html
<div class="modal-field-label-row">
  <label>Secret Key</label>
  <button class="text-xs text-primary">Show</button>
</div>
```

#### `.modal-input`
**Purpose:** Full-width input for modal forms. Matches `cfg-input` visually but uses `py-2` (slightly taller) to suit modal density.  
**Usage:**
```html
<input class="modal-input" type="text" />
```

#### `.modal-select`
**Purpose:** Full-width `<select>` for modal forms.  
**Usage:**
```html
<select class="modal-select">…</select>
```

#### `.modal-actions`
**Purpose:** `flex gap-3 pt-2` row that wraps the button row at the bottom of a modal form.  
**Usage:**
```html
<div class="modal-actions">
  <button class="modal-btn-cancel">Cancel</button>
  <button class="modal-btn-primary">Save</button>
</div>
```

#### `.modal-btn-cancel`
**Purpose:** Secondary/muted action inside a modal (cancel, or "Save Only" in a 3-button row).  

#### `.modal-btn-primary`
**Purpose:** Primary positive action inside a modal (save, confirm, apply).  

#### `.modal-btn-danger`
**Purpose:** Destructive action inside a modal (delete, remove). Red colour scheme.  

### 2.5 Global button classes

These replace recurring raw tint-button Tailwind strings throughout the codebase. All include `transition-colors`, `disabled:opacity-50 disabled:cursor-not-allowed`, and their respective colour.

| Class | Size | Colour | When to use |
|---|---|---|---|
| `btn-primary` | `px-4 py-2 rounded-lg text-sm font-medium` | Teal tint (`bg-primary/20`) | Standard primary action outside modals |
| `btn-danger` | `px-4 py-2 rounded-lg text-sm font-medium` | Red tint (`bg-accent-red/20`) | Standard destructive action outside modals |
| `btn-success` | `px-4 py-2 rounded-lg text-sm font-medium` | Green tint (`bg-accent-green/20`) | Positive/confirm action outside modals |
| `btn-secondary` | `px-4 py-2 rounded-lg text-sm` | Neutral muted | Secondary/cancel action outside modals (no `font-medium`) |
| `btn-primary-xs` | `px-3 py-1 rounded text-xs` | Teal tint | Compact/pill teal button (e.g. inline row actions) |
| `btn-danger-xs` | `px-3 py-1 rounded text-xs` | Red tint | Compact/pill red button |
| `btn-success-xs` | `px-3 py-1 rounded text-xs` | Green tint | Compact/pill green button |

**vs. `modal-btn-*`:** Use `modal-btn-primary`, `modal-btn-cancel`, and `modal-btn-danger` for buttons inside modal footers — they include `flex-1` and `py-3` which match the modal layout. The `btn-*` classes use `py-2` and have no `flex-1`, making them appropriate for page-level buttons.

Extra layout/spacing classes (`flex items-center gap-2`, `mt-4`, `flex-shrink-0`, `w-full`) can be added alongside any `btn-*` class as needed.

---

## 3. Inline Styles Audit

### Legend
- **DYNAMIC** — the value is computed at runtime; cannot be replaced with a static class.
- **REPLACED** — was replaced with Tailwind classes or CSS variable references as part of the 2026-05 audit.
- **KEPT** — inspected and confirmed must remain inline, with rationale.

| File | Line | Expression | Decision | Rationale / Replacement |
|---|---|---|---|---|
| `src/components/ui/NeighborMenu.vue` | 201 | `{ top: menuPosition.top + 'px', left: menuPosition.left + 'px' }` | **KEPT — DYNAMIC** | Teleported floating context menu; position is calculated from mouse event coordinates at runtime. Cannot be expressed as static classes. |
| `src/components/ui/Sparkline.vue` | 148 | `{ color }` (prop-driven text colour) | **KEPT — DYNAMIC** | `color` is a prop accepting any valid CSS colour string (hex/rgb/var). Callers pass arbitrary palette values; no static class set covers the open-ended input. |
| `src/components/ui/Sparkline.vue` | 157 | `{ borderTopColor: color }` (spinner accent) | **KEPT — DYNAMIC** | Same prop as above; applies the accent colour to a CSS spinner border. |
| `src/components/ui/ChartSparkline.vue` | 262 | `{ color }` (primary value text colour) | **KEPT — DYNAMIC** | `color` is an open-ended prop; same rationale as Sparkline. |
| `src/components/ui/ChartSparkline.vue` | 268 | `{ color: secondaryColor }` (secondary value text colour) | **KEPT — DYNAMIC** | `secondaryColor` is an open-ended optional prop. |
| `src/components/charts/PacketTypesChart.vue` | 282–285 | `{ height: getBarHeight(bucket.total) + '%', minHeight: '8px' }` | **KEPT — DYNAMIC** | Bar height is a percentage computed from live data (`bucket.total` relative to chart max). |
| `src/components/charts/PacketTypesChart.vue` | 291–294 | `{ height: getSegmentHeight(...) + '%', backgroundColor: item.color }` | **KEPT — DYNAMIC** | Stacked chart segments: both height (% of bucket total) and colour (data-driven per packet type) are runtime values. |
| `src/components/charts/PacketTypesChart.vue` | 318 | `{ backgroundColor: item.color }` (legend swatch) | **KEPT — DYNAMIC** | Legend swatch colour matches the corresponding chart segment colour from data. |
| `src/components/modals/AdvertModal.vue` | 135–143 | `{ filter: ... drop-shadow(...) }` (radio tower glow) | **KEPT — DYNAMIC** | Three-state `drop-shadow` filter (loading / success / error) with colour values that vary by state. `filter` has no Tailwind equivalent at these colour/radius values. |
| `src/components/modals/NeighborDetailsModal.vue` | 428 | `{ height: \`${4 + i * 2}px\` }` | **REPLACED** | Replaced with `BAR_HEIGHTS_SM[i - 1]` lookup array → Tailwind classes `h-1.5 h-2 h-2.5 h-3 h-3.5`. Added to `safelist` in `tailwind.config.js`. |
| `src/components/modals/PacketDetailsModal.vue` | 1771–1773 | `{ width: \`${...}%\` }` (LBT delay bar) | **KEPT — DYNAMIC** | Width is a percentage computed from `delay / Math.max(...delays)`. Varies continuously per packet. |
| `src/components/nav/Sidebar.vue` | 647 | `dutyCycleBarStyle` computed | **PARTLY REPLACED** | `width` remains inline (dynamic %). `backgroundColor` hex literals replaced with `var(--color-accent-green)`, `var(--color-accent-red)`, `var(--color-secondary)` so values adapt to light/dark mode. |
| `src/components/nav/MobileSidebar.vue` | 686 | `dutyCycleBarStyle` computed | **PARTLY REPLACED** | Same as Sidebar.vue above. |
| `src/components/neighbors/NeighborTable.vue` | 260 | `{ backgroundColor: color }` (contact-type colour dot) | **KEPT — DYNAMIC** | `color` is an arbitrary hex string prop passed from the parent view (per contact type). No finite set of values; must remain inline. |
| `src/components/neighbors/NeighborTable.vue` | 720 | `{ height: \`${4 + bar * 2}px\` }` (SM bars) | **REPLACED** | Replaced with `BAR_HEIGHTS_SM[bar - 1]` → `h-1.5 h-2 h-2.5 h-3 h-3.5`. Safelisted. |
| `src/components/neighbors/NeighborTable.vue` | 867 | `{ height: \`${6 + bar * 2}px\` }` (MD bars) | **REPLACED** | Replaced with `BAR_HEIGHTS_MD[bar - 1]` → `h-2 h-2.5 h-3 h-3.5 h-4`. Safelisted. |
| `src/views/Statistics.vue` | 1369–1374 | `{ width: \`${...}%\`, backgroundColor: palette[index % 5] }` | **KEPT — DYNAMIC** | Route stats bar chart: width is a percentage of route count vs max; colour cycles through a 5-colour palette by data index. Both are runtime values. |
| `src/views/Setup.vue` | 155 | `{ width: \`${progressPercentage}%\` }` | **KEPT — DYNAMIC** | Setup wizard progress bar width. Varies continuously 0–100%. |
| `src/views/GPSDiagnostics.vue` | 1171 | `fallbackSatelliteStyle(satellite)` | **KEPT — DYNAMIC** | Positions satellite dots on a polar sky plot using `left`/`top` percentages and a `--size` CSS custom property, all derived from satellite azimuth/elevation/SNR data. |
| `src/views/GPSDiagnostics.vue` | 1182 | `globeTooltipStyle` | **KEPT — DYNAMIC** | Positions a floating tooltip next to the hovered 3D globe satellite using pixel coordinates from pointer events. |
| `src/views/CADCalibration.vue` | 584–586 | `{ width: progressTotal > 0 ? \`${...}%\` : '0%' }` | **KEPT — DYNAMIC** | CAD calibration test-run progress bar. Width is live test-completion percentage. |

---

## 4. Signal Bar Height Lookup Arrays

Three locations in the codebase render signal-strength bar charts using `v-for="bar in 5"` (1-based) or `v-for="i in 5"` (1-based). The bar heights are a fixed 5-element set that maps cleanly to Tailwind height classes.

### BAR_HEIGHTS_SM — 6/8/10/12/14 px

Used in:
- `src/components/modals/NeighborDetailsModal.vue` (index: `i - 1`)
- `src/components/neighbors/NeighborTable.vue` table row view (index: `bar - 1`)

```ts
const BAR_HEIGHTS_SM = ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5'] as const;
```

Apply as: `:class="BAR_HEIGHTS_SM[i - 1]"` (when loop variable is 1-based `i`) or `:class="BAR_HEIGHTS_SM[bar - 1]"`.

### BAR_HEIGHTS_MD — 8/10/12/14/16 px

Used in:
- `src/components/neighbors/NeighborTable.vue` mobile card view (index: `bar - 1`)

```ts
const BAR_HEIGHTS_MD = ['h-2', 'h-2.5', 'h-3', 'h-3.5', 'h-4'] as const;
```

### Tailwind safelist

Because the class names are composed at runtime from array lookups, Tailwind JIT cannot detect them via static analysis. They are safelisted in `tailwind.config.js`:

```js
safelist: ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5', 'h-4'],
```

---

## 5. dutyCycleBarStyle Pattern

Both `src/components/nav/Sidebar.vue` and `src/components/nav/MobileSidebar.vue` expose a `dutyCycleBarStyle` computed that drives the duty-cycle progress bar inside the sidebar footer.

**Rule:** Only the `width` property is inline. Colour is expressed with CSS custom properties (`var(--color-...)`) so it adapts automatically to light/dark mode — never use raw hex strings here.

```ts
const dutyCycleBarStyle = computed(() => {
  const percentage = systemStore.dutyCyclePercentage;
  let backgroundColor = 'var(--color-accent-green)';   // ≤70% — healthy
  if (percentage > 90) {
    backgroundColor = 'var(--color-accent-red)';         // >90% — critical
  } else if (percentage > 70) {
    backgroundColor = 'var(--color-secondary)';          // 70–90% — warning (amber)
  }
  return {
    width: percentage === 0 ? '2px' : `${Math.max(percentage, 2)}%`,
    backgroundColor,
  };
});
```

The minimum displayed width is `2px` (Sidebar) / `.125rem` (MobileSidebar) so the bar is always visible even at 0%.

---

## 6. When to Use What

### Use a Tailwind utility class when…
- The value is static and exists in the Tailwind scale (spacing, colour, typography, etc.)
- The property switches between a small, known set of states → use `:class` with conditional objects/arrays
- You are writing a one-off style that doesn't recur elsewhere in the codebase

### Use a global utility class (from `src/assets/main.css`) when…
- The same pattern repeats across **3+ components** (e.g. every modal uses `.modal-card`)
- The style has semantic meaning beyond what a class name can convey (e.g. `.glass-card` bundles blur + border + shadow)
- The pattern requires `@apply` of multiple Tailwind classes combined with raw CSS (e.g. `background: var(...)`)

#### Why we use `@apply` — and why the standard advice doesn't fully apply here

The standard Tailwind recommendation is to avoid `@apply` and extract reusable UI into components instead. That advice is correct, and we follow it for interactive UI. But our global classes exist for a different reason: **correctness**.

The clearest example is button colour. `bg-primary text-white` looks fine in light mode. In dark mode, `--color-primary` resolves to `#aae8e8` — a light pastel teal — making white text invisible against a light background. Every file that wrote this pattern had a silent visual bug across the entire codebase. A global class that encodes the correct tint pattern (`bg-primary/20 text-primary`) makes the right choice the default and the wrong choice harder to reach accidentally.

Our class names are also scoped to *context*, not *appearance* (`modal-btn-primary`, not `blue-rounded-large-button`). This keeps names stable and honest: a name describes where the class is used, not what it looks like, so it doesn't need to change when the visual design evolves.

#### The rule: never modify a global class to fit one special case

If one element needs a variation — different padding, a shadow, a wider border radius — add those as extra classes at the call site:

```html
<!-- correct: global class handles colour/state; call site handles layout variation -->
<button class="btn-primary w-full mt-4 shadow-sm">...</button>

<!-- wrong: mutating the global class to accommodate one element -->
<!-- .btn-primary { @apply ... shadow-sm; }  ← now every btn-primary has a shadow -->
```

If a variation is too complex to handle with one or two extra classes, that is the signal to extract a Vue component — not to grow the global class or create a `btn-primary-special` variant. The global classes are a floor, not a ceiling.

### Use an inline style (`:style=`) when…
- The value is **computed at runtime** from props, store state, or event coordinates (e.g. progress bar widths, chart bar heights, floating menu positions)
- The CSS property has no Tailwind equivalent at the required values (e.g. arbitrary `filter: drop-shadow(...)`)
- The set of possible values is open-ended and cannot be enumerated in advance (e.g. arbitrary hex colour props)

### Never do these
- Do not put hardcoded hex colour strings in `:style=` when the project has a matching CSS variable (use `var(--color-...)` instead)
- Do not compose Tailwind class names with template literals (e.g. `` `text-${color}-500` ``) — JIT cannot scan them. Use a lookup array and add to `safelist`
- Do not add new one-off classes to `main.css` for styles used in only one component — keep them inline or use Tailwind directly
