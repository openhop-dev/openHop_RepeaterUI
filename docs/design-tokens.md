# Design Tokens

The design token system has two layers:

1. **CSS variables** — defined in `src/assets/base.css`. Each variable has a light-mode value in `:root` and a dark-mode override in `.dark`. Dark mode is activated by adding the `dark` class to the `<html>` element (configured via `darkMode: 'class'` in `tailwind.config.js`).
2. **Tailwind aliases** — defined in `tailwind.config.js`. Each alias maps a semantic name (e.g. `surface`, `primary`, `stroke`) to the CSS variable, so Tailwind utility classes like `bg-surface`, `text-primary`, and `border-stroke-subtle` automatically track the active theme.

---

## Surface tokens

Control the background colour of page regions and elevated elements.

| CSS variable | Tailwind alias | Light value | Dark value |
|---|---|---|---|
| `--color-surface` | `bg-surface` / `text-surface` | `#ffffff` | `#0f1112` |
| `--color-surface-elevated` | `bg-surface-elevated` | `#ffffff` | `#1a1e1f` |
| `--color-background` | `bg-background` | `#f5f7fa` | `#09090b` |
| `--color-background-soft` | `bg-background-soft` | `#f8f8f8` | `#111314` |
| `--color-background-mute` | `bg-background-mute` | `#ebeef2` | `#1a1e1f` |

**Semantic intent:**

- `background` — page body background
- `background-soft` — slightly lighter than body, for subtle section backgrounds
- `background-mute` — input fields, read-only chips, muted card fills
- `surface` — opaque card backgrounds (sidebar, modal base)
- `surface-elevated` — modal inner cards, dropdowns — slightly lighter than `surface` in dark mode

---

## Content / text tokens

All values are WCAG AA compliant on their respective background surfaces.

| CSS variable | Tailwind alias | Light value | Dark value | Contrast (light) |
|---|---|---|---|---|
| `--color-heading` | `text-content-heading` | `#030712` | `#ffffff` | 19.5:1 |
| `--color-text-primary` | `text-content-primary` | `#111827` | `#f9fafb` | 16:1 |
| `--color-text-secondary` | `text-content-secondary` | `#374151` | `#d1d5db` | 9.5:1 |
| `--color-text-muted` | `text-content-muted` | `#6b7280` | `#9ca3af` | 4.6:1 |
| `--color-text` | `text-content` (via `content` key) | `#374151` | `#adadad` | 9.5:1 |

`--color-text` is the `body` default — it matches `text-secondary` in light mode but uses a slightly warmer mid-grey in dark mode.

---

## Stroke / border tokens

| CSS variable | Tailwind alias | Light value | Dark value |
|---|---|---|---|
| `--color-border` | `border-stroke` | `#9ca3af` | `#4b4b4b` |
| `--color-border-subtle` | `border-stroke-subtle` | `#d1d5db` | `#374151` |
| `--color-border-hover` | `border-stroke-hover` | `#6b7280` | `#6b7280` |

Use `stroke-subtle` for most dividers and card outlines. Use `stroke` for interactive borders (focused inputs, explicit dividers that must be visible against `background-mute`). Use `stroke-hover` only for hover/active state overrides.

---

## Accent colours — text/icon use

These are the semantic accent values used for text, icons, and light fills. They auto-switch between light and dark mode to maintain contrast on their respective surfaces.

| CSS variable | Tailwind alias | Light value | Dark value | Semantic role |
|---|---|---|---|---|
| `--color-primary` | `text-primary` / `border-primary` / `bg-primary` | `#0d7377` (dark teal) | `#aae8e8` (light pastel teal) | Primary brand, active states, links |
| `--color-secondary` | `text-secondary` / `bg-secondary` | `#92610a` (amber) | `#ffc246` (bright amber) | Secondary brand accent |
| `--color-accent-green` | `text-accent-green` / `bg-accent-green` | `#15803d` | `#a5e5b6` | Success, healthy, positive |
| `--color-accent-purple` | `text-accent-purple` / `bg-accent-purple` | `#7c3aed` | `#eba0fc` | Special / admin |
| `--color-accent-red` | `text-accent-red` / `bg-accent-red` | `#dc2626` | `#fb787b` | Error, destructive, danger |
| `--color-accent-cyan` | `text-accent-cyan` / `bg-accent-cyan` | `#0e7490` | `#d1e6e4` | Info, neutral highlight |

**Critical note on `primary` in dark mode.** In dark mode `--color-primary` becomes `#aae8e8` — a light pastel teal. Do **not** use `text-white` when displaying text in a primary-tinted context in dark mode. Use `text-primary` so the token switches automatically. Writing `text-white` against a `bg-primary/20` fill will look correct in dark mode but is wrong in light mode (dark text on a teal tint reads correctly; white on teal does not).

---

## Accent colours — background fills

Used when you need a coloured fill with text or icons on top. The light and dark values are intentionally inverted so the fill remains visually distinct in both modes.

| CSS variable | Tailwind alias | Light value | Dark value |
|---|---|---|---|
| `--color-primary-bg` | `bg-primary-bg` | `#aae8e8` (pastel teal) | `#0d7377` (dark teal) |
| `--color-secondary-bg` | `bg-secondary-bg` | `#ffc246` (amber) | `#92610a` (dark amber) |
| `--color-accent-green-bg` | `bg-accent-bg-green` | `#a5e5b6` | `#15803d` |
| `--color-accent-purple-bg` | `bg-accent-bg-purple` | `#eba0fc` | `#7c3aed` |
| `--color-accent-red-bg` | `bg-accent-bg-red` | `#fb787b` | `#dc2626` |
| `--color-accent-cyan-bg` | `bg-accent-bg-cyan` | `#d1e6e4` | `#0e7490` |

Note the inversion: `primary-bg` in light mode is the same pastel teal that `primary` becomes in dark mode. This symmetry is intentional — the fill colour and the text colour swap roles across modes.

---

## Badge / pill tokens

Pre-paired background + text colour combinations for status badges and pills. Values are auto-inverted between light and dark modes.

| CSS variable | Tailwind alias | Light value | Dark value |
|---|---|---|---|
| `--color-badge-cyan-bg` | `bg-badge-cyan-bg` | `#d1e6e4` (light teal) | `#223231` (dark teal) |
| `--color-badge-cyan-text` | `text-badge-cyan-text` | `#0d7377` | `#d1e6e4` |
| `--color-badge-neutral-bg` | `bg-badge-neutral-bg` | `#e5e7eb` | `#374151` |
| `--color-badge-neutral-text` | `text-badge-neutral-text` | `#374151` | `#d1d5db` |

---

## Glass card tokens

Used exclusively by the `.glass-card`, `.glass-card-green`, and `.glass-card-orange` utility classes in `main.css`. Do not reference these variables directly in templates — use the utility classes.

| Variable group | Purpose |
|---|---|
| `--color-glass-bg` / `--color-glass-border` / `--color-glass-shadow` | Neutral glass card (white translucent in light, dark translucent in dark) |
| `--color-glass-green-*` | Green-tinted gradient card — same visual in both modes, darker in dark |
| `--color-glass-orange-*` | Amber-tinted gradient card — same visual in both modes, darker in dark |

---

## Tailwind alias reference

The full mapping from `tailwind.config.js`:

```
surface               → --color-surface
surface-elevated      → --color-surface-elevated
background            → --color-background
background-soft       → --color-background-soft
background-mute       → --color-background-mute

content               → --color-text
content-primary       → --color-text-primary
content-secondary     → --color-text-secondary
content-muted         → --color-text-muted
content-heading       → --color-heading

stroke                → --color-border
stroke-subtle         → --color-border-subtle
stroke-hover          → --color-border-hover

primary               → --color-primary
secondary             → --color-secondary
accent-green          → --color-accent-green
accent-purple         → --color-accent-purple
accent-red            → --color-accent-red
accent-cyan           → --color-accent-cyan

primary-bg            → --color-primary-bg
secondary-bg          → --color-secondary-bg
accent-bg-green       → --color-accent-green-bg
accent-bg-purple      → --color-accent-purple-bg
accent-bg-red         → --color-accent-red-bg
accent-bg-cyan        → --color-accent-cyan-bg

badge-cyan-bg         → --color-badge-cyan-bg
badge-cyan-text       → --color-badge-cyan-text
badge-neutral-bg      → --color-badge-neutral-bg
badge-neutral-text    → --color-badge-neutral-text
```

**Legacy aliases.** `light.bg`, `light.card`, `dark.bg`, `dark.card`, etc. are present in `tailwind.config.js` for backward compatibility during a migration. Do not use them in new code — use the semantic aliases above.

---

## Usage guidance

**Prefer semantic tokens over raw hex.** Never write `text-[#0d7377]` — write `text-primary`. Token values may change; semantic names will not.

**Opacity modifiers work on all tokens.** Because the tokens are CSS variables, Tailwind's opacity modifiers apply cleanly: `bg-primary/20`, `border-stroke/10`, `text-accent-red/80` all work as expected.

**Dark mode variants.** Because dark mode is class-based, always pair a light and dark class when the semantic token alone is insufficient:

```html
<!-- correct: let the token switch automatically -->
<div class="text-primary">…</div>

<!-- only needed when a token has no automatic semantic: -->
<div class="bg-white dark:bg-surface-elevated">…</div>
```
