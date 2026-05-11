# Shared UI Components

Reusable primitives in `src/components/ui/`. Use these instead of writing one-off inline markup.

## Spinner

`src/components/ui/Spinner.vue`

A single circular ring spinner used everywhere a loading state needs a visual indicator. Three sizes:

| Prop `size` | Dimensions | Border | Use case |
|---|---|---|---|
| `sm` | 20 × 20 px | 2 px | Inside buttons, tight inline states |
| `md` *(default)* | 32 × 32 px | 3 px | Card / section loading states |
| `lg` | 64 × 64 px | 4 px | Full-screen overlays (restart, setup) |

Color is always `border-primary` (follows the theme token).

```vue
<!-- default (md) -->
<Spinner />

<!-- inside a button -->
<Spinner size="sm" />

<!-- restart / setup overlay -->
<Spinner size="lg" />
```

**Do not use** the old bar/segment SVG spinner — it has been removed from `RestartModal.vue` and `Setup.vue`. Do not reintroduce it.

---

## Modal CSS utilities

Defined in `src/assets/main.css` — see [z-index Layering](z-index-layering.md) for backdrop z-index rules.

| Class | Purpose |
|---|---|
| `modal-backdrop` | Fixed full-screen backdrop, `z-[300]` |
| `modal-backdrop-heavy` | Same with 80% black overlay for destructive dialogs |
| `modal-card` | White/elevated inner card, `rounded-[20px] p-6` |
| `modal-field-label` | Form field label (`xs`, secondary colour, `mt-2 mb-1`) |
| `modal-field-label-row` | Label row with an inline action button (e.g. Show/Edit); same spacing as `modal-field-label` but `flex items-baseline gap-3` |
| `modal-input` | Text / number / password input |
| `modal-select` | `<select>` element |
| `modal-actions` | `flex gap-3 pt-2` button row |
| `modal-btn-cancel` | Muted secondary button (cancel + secondary actions) |
| `modal-btn-primary` | Coloured primary action |
| `modal-btn-danger` | Red destructive action |

**Form spacing:** use `<form class="modal-form">` on every modal form. `modal-form` uses `flex flex-col gap-8` (not `space-y-*`) — flex gap is applied by the container and is immune to margin-collapse. `modal-field-label` carries only a small `mt-2` for within-section breathing room; the 32 px section-to-section gap comes entirely from the flex container.

See `BrokerEditModal.vue` for the canonical example of a fully-styled modal using all of the above.

---

## Configuration card utilities

Defined in `src/assets/main.css`. Use these instead of repeating the card/border Tailwind strings inline.

| Class | Purpose |
|---|---|
| `cfg-section` | Standard muted card with 32 px padding — the main content pane inside every config tab |
| `cfg-card` | Same visual style as `cfg-section` but **no built-in padding** — use when you need to control padding or overflow yourself (e.g. a table, a tree list, a scrollable region) |
| `cfg-page-heading` | Spacing class for the top-of-tab heading block (`pb-2`) |
| `cfg-btn-primary` | Primary action button (config save, generate, etc.) |
| `cfg-btn-secondary` | Secondary/cancel action button |
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
