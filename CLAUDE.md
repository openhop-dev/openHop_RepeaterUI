# Claude Code instructions for pyMC-RepeaterUI

This file is read automatically by Claude Code at the start of every session. Follow these instructions precisely when working in this repository.

---

## Behaviour rules — highest priority

These override Claude's default tendencies. They apply to every action in this repository.

### Only do what was asked

- **Do exactly what the user asked. Nothing more.**
- Do not fix nearby code that wasn't mentioned. Do not refactor while implementing a feature. Do not add error handling, validation, or fallbacks that weren't requested.
- If you notice something worth improving while completing a task, **finish the task first, then mention it separately** and ask if the user wants it addressed.

### Ask before acting on assumptions

- If the request is ambiguous, **ask one clarifying question** before writing any code.
- If you think an approach is a good idea but the user didn't ask for it, **propose it and wait for approval** — do not implement it speculatively.
- If completing a task would require touching files or systems beyond what was explicitly described, **state that and ask** before proceeding.

### Never break the rules without explicit permission

- The hard rules below (styling, DataService, component patterns) **cannot be bypassed** even if you think there is a good reason.
- If you believe a rule should be broken for a specific case, **explain why and ask the user** before deviating. Do not silently violate a rule and note it afterwards.
- "I think this is better" is not sufficient justification to deviate. User approval is required.

### No unrequested cleanup

- Do not rename variables, reorder imports, fix formatting, or adjust unrelated code while making a requested change.
- Do not add comments explaining what code does unless asked.
- Do not delete code that appears unused unless removal was explicitly requested.

### Summarise before acting on investigation tasks

- When asked to investigate, diagnose, or check something ("what are we doing", "why is X slow", "check if"), **summarise your findings first** before writing any code.
- State what you found, what the root cause is, and what you propose to change. Wait for the user to approve before touching any files.
- This applies even when the fix is obvious — the user may have context that changes the approach.

### Never assume the cause of a symptom

- When the user reports unexpected behaviour (wrong values, missing data, visual glitch), **read the code and identify the actual cause**. Do not invent an explanation based on what seems plausible.
- Do not dismiss a reported bug with an assumed explanation ("the device must only have X hours of data", "the network is probably slow"). If you cannot reproduce or trace the cause in code, say so explicitly and ask for more information.
- A wrong assumption stated confidently wastes the user's time and erodes trust. If you are not certain, say you are not certain.

---

## Read documentation before making any changes

Before touching code, read the relevant docs:

| Working on | Read first |
|---|---|
| Any UI change | `docs/style-guide.md`, `docs/ui-components.md` |
| Data fetching or stores | `docs/data-service.md` |
| New modal or form | `docs/ui-components.md` (modal utilities section) |
| Colours or tokens | `docs/design-tokens.md` |
| Z-index or stacking | `docs/z-index-layering.md` |
| Unfamiliar pattern | `docs/development-guide.md` |
| Architectural question | `docs/architecture-decisions.md` |

The full docs index is at `docs/README.md`.

---

## Hard rules — never break these

### Styling

- **Never use raw hex colour values.** Use CSS custom properties (`var(--color-*)`) or Tailwind design tokens (`text-primary`, `bg-surface`, etc.).
- **Never use Tailwind colour literals** like `text-green-500`, `bg-red-700`, `border-blue-200`. Use semantic tokens: `text-accent-green`, `bg-accent-red/20`, `border-stroke-subtle`.
- **Never write `bg-primary text-white`.** In dark mode `--color-primary` is `#aae8e8` (light pastel teal) — white text on a light background is invisible. Use `bg-primary/20 text-primary` (tint pattern) instead.
- **Never add a new inline `:style=` binding** unless the value is genuinely runtime-dynamic (e.g. pixel position from `getBoundingClientRect`, or a colour from an API data payload). Fixed values belong in Tailwind classes or CSS custom properties. See `docs/style-guide.md` for the full audit.
- **Never write an inline `animate-spin` div for a spinner.** Import and use `<Spinner>` from `@/components/ui/Spinner.vue`.

### Global utility classes

Before writing a Tailwind utility string in a template, check `src/assets/main.css` for an existing class. The key ones:

```
Modal:   modal-backdrop  modal-backdrop-heavy  modal-card
         modal-form  modal-field-label  modal-field-label-row
         modal-input  modal-select
         modal-actions  modal-btn-cancel  modal-btn-primary  modal-btn-danger

Config:  cfg-section  cfg-card  cfg-btn-primary  cfg-btn-secondary
         cfg-input  cfg-select

Glass:   glass-card  glass-card-green  glass-card-orange

Buttons: btn-primary  btn-danger  btn-success  btn-secondary
         btn-primary-xs  btn-danger-xs  btn-success-xs
         (use modal-btn-* inside modal footers; btn-* everywhere else)
```

If the same Tailwind string appears in more than two files, add a named class to `main.css` rather than repeating it.

#### Why we use `@apply` here — and where the line is

The standard Tailwind advice is to avoid `@apply` and extract Vue components instead. That advice is correct for most cases, and we follow it: reusable interactive UI is always a component. But our global classes exist for a different reason: **correctness, not DRY**.

The clearest example is `bg-primary text-white`. In light mode it looks fine. In dark mode, `--color-primary` resolves to `#aae8e8` — a light pastel teal — making white text invisible. Every file that wrote this pattern had a silent visual bug. A global class with the correct tint pattern (`bg-primary/20 text-primary`) makes the right thing the default and makes the wrong thing harder to write accidentally. The same applies to the modal backdrop blur, the modal card surface colour, and the button disabled states — patterns where getting the dark-mode interaction wrong is easy and the correct combination is non-obvious.

Our class names are also scoped to *context*, not *appearance* (`modal-btn-primary`, not `blue-rounded-large-button`). That keeps names stable: the class describes where it is used, not what it looks like, so it doesn't need to change if we tweak the visual design.

#### The rule: never modify a global class to fit one special case

If an element needs a variation — different padding, an extra shadow, a wider border radius — **add those as extra classes at the call site**:

```html
<!-- correct: global class handles colour/state, call site handles layout -->
<button class="btn-primary w-full mt-4 shadow-sm">...</button>

<!-- wrong: modifying the global class to accommodate one element -->
<!-- .btn-primary { @apply ... shadow-sm; }  ← now ALL btn-primary buttons have a shadow -->
```

If a variation is complex enough that it can't be handled with one or two extra classes, that is a signal to extract a Vue component — not to grow the global class or create `btn-primary-special`. The global classes are a floor, not a ceiling.

### Data fetching

- **Never bypass DataService** for endpoints it manages: `/api/stats`, `/api/neighbors`, `/api/packets`. Read from the Pinia store via `storeToRefs`.
- **Never show a spinner gated on `systemStore.isLoading`** — it resolves before any page can be visited.
- Fetch directly only for per-page config endpoints (`/api/identities`, `/auth/tokens`, `/api/db_stats`, `/update/*`, etc.) that DataService does not manage.

### Components

- **Always `<Teleport to="body">`** modal and floating-menu components.
- **Always block backdrop-click and X-button** during in-progress or irreversible operations (see `UpdateModal.vue` for reference).
- **Modal footer buttons go inside `<div class="modal-actions">`** and use `modal-btn-*` classes.

---

## Key file locations

| What | Where |
|---|---|
| Design tokens (CSS vars) | `src/assets/base.css` |
| Tailwind token aliases | `tailwind.config.js` |
| Global utility classes | `src/assets/main.css` |
| Spinner component | `src/components/ui/Spinner.vue` |
| DataService store | `src/stores/dataService.ts` |
| System store (stats) | `src/stores/system.ts` |
| API client (auto-JWT) | `src/utils/api.ts` |
| Auth utilities | `src/utils/auth.ts` |
| Modal components | `src/components/modals/` |
| Nav components | `src/components/nav/` |
| Config tab components | `src/components/configuration/` |

---

## Patterns to follow

### New modal
```vue
<Teleport to="body">
  <div v-if="props.show" class="modal-backdrop" @click="emit('close')">
    <div class="modal-card max-w-md" @click.stop>
      <form class="modal-form" @submit.prevent="handleSubmit">
        <label class="modal-field-label">Field</label>
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

### Spinner usage
```vue
<Spinner />                           <!-- default: md, primary -->
<Spinner size="sm" color="white" />   <!-- inside a dark button -->
<Spinner size="xs" color="current" /> <!-- inherits surrounding text colour -->
```

### DataService consumption
```ts
import { useDataService } from '@/stores/dataService'
import { storeToRefs } from 'pinia'

const { neighbors } = storeToRefs(useDataService())
// neighbors is reactive — no manual fetch needed
```

### Button colours (dark-mode safe)
```html
<!-- Primary action -->
<button class="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 ...">

<!-- Danger action -->
<button class="bg-accent-red/20 hover:bg-accent-red/30 text-accent-red border border-accent-red/50 ...">

<!-- Success state -->
<button class="bg-accent-green/20 hover:bg-accent-green/30 text-accent-green border border-accent-green/50 ...">
```

---

## Dev server

Requires Node 20+. Set `VITE_DEV_API_URL` in `.env.local` to point at a device.

```bash
nvm use 20
npm run dev
```
