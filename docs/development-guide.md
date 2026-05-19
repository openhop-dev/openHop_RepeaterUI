# Development Guide

A practical reference for anyone new to this codebase. Read this before writing code.

---

## Project overview

pyMC-RepeaterUI is a **Vue 3 + TypeScript + Tailwind CSS** single-page application that manages one or more pyMC Meshtastic repeaters. It communicates with the pyMC_Repeater Python backend over HTTP and WebSocket. The UI is served by the backend in production; in development a Vite dev server proxies API requests to a real device or local backend.

**Key stack:**
- Vue 3 Composition API (`<script setup>`)
- Pinia for state management
- Tailwind CSS with a custom design token layer
- Vite build tooling
- The backend is accessed over 4G mobile links in the field — bundle size and request efficiency matter

---

## Running locally

```bash
# Install dependencies
npm install

# Set your backend target (copy from .env.example)
echo 'VITE_DEV_API_URL=http://<device-ip>:8000' > .env.local

# Start dev server (requires Node 20+)
nvm use 20
npm run dev
```

The Vite proxy forwards `/api/*` and WebSocket connections to `VITE_DEV_API_URL`.

---

## DataService — the source of truth

> **Rule: never fetch data directly in a component unless DataService explicitly does not manage that endpoint.**

`src/stores/dataService.ts` is a Pinia store that manages all high-frequency, shared data:

| Endpoint | Delivery | TTL |
|---|---|---|
| `/api/stats` | WebSocket-first, HTTP fallback | 30 s |
| `/api/neighbors` | WebSocket-first, HTTP fallback | 60 s |
| `/api/packets` | WebSocket-first, HTTP fallback | 30 s |

**WebSocket-first model:** DataService subscribes to the WebSocket; when a push arrives it updates the store and resets the polling timer. HTTP polling only fires when the WebSocket is silent past the TTL. Do not race these two paths in your own code.

**What DataService does NOT manage** (fetch these yourself, per page):

| Endpoint | Who fetches |
|---|---|
| `/api/identities` | RoomServers.vue, Companions.vue |
| `/auth/tokens`, ACL endpoints | APITokens.vue, Sessions.vue |
| `/api/db_stats` | DatabaseManagement.vue |
| `/api/advert_rate_limit_stats` | AdvertSettings.vue |
| `/update/*` | UpdateModal.vue |

For configuration pages, the data is not pre-cached — show a loading state while fetching and handle errors inline.

**Using DataService in a component:**

```ts
import { useDataService } from '@/stores/dataService'
import { storeToRefs } from 'pinia'

const dataService = useDataService()
const { neighbors, packets } = storeToRefs(dataService)
// neighbors and packets are reactive — no manual fetching needed
```

**systemStore (`src/stores/system.ts`)** holds `stats` from `/api/stats` and is populated at app bootstrap. By the time any page renders, `systemStore.stats` is available. Do not show loading spinners gated on `systemStore.isLoading` — it will never be true on a normal page visit.

---

## Design system

### Design tokens

All colours, surfaces, and borders are CSS custom properties defined in `src/assets/base.css` and aliased in `tailwind.config.js`. **Never use raw hex values or Tailwind colour literals** (e.g. `text-green-500`). Use semantic tokens instead.

Key tokens:

| Token | Light | Dark | Use for |
|---|---|---|---|
| `text-content-primary` | `#111827` | `#f9fafb` | Body text, labels |
| `text-content-secondary` | `#374151` | `#d1d5db` | Secondary text |
| `text-content-muted` | `#6b7280` | `#9ca3af` | Hints, timestamps |
| `text-primary` | `#0d7377` (teal) | `#aae8e8` (pastel teal) | Branded/action text |
| `text-accent-green` | `#15803d` | `#a5e5b6` | Success states |
| `text-accent-red` | `#dc2626` | `#fb787b` | Error/danger states |
| `bg-surface` | `#ffffff` | `#0f1112` | Card surfaces |
| `bg-surface-elevated` | `#ffffff` | `#1a1e1f` | Modal surfaces |
| `bg-background-mute` | `#ebeef2` | `#1a1e1f` | Subtle fills |
| `border-stroke-subtle` | `#d1d5db` | `#374151` | Dividers |

> **Critical dark mode rule:** `--color-primary` in dark mode is `#aae8e8` — a light pastel teal. Using `bg-primary text-white` will produce white text on a near-white background. Always use `bg-primary/20 text-primary` (tint pattern) instead. See `docs/design-tokens.md` for the full reference.

Full reference: [`docs/design-tokens.md`](design-tokens.md) and [`docs/style-guide.md`](style-guide.md).

---

## Global utility classes

Common patterns are centralised in `src/assets/main.css`. Use these instead of repeating Tailwind strings.

### Modal classes

```html
<!-- Standard modal -->
<div class="modal-backdrop" @click="close">
  <div class="modal-card max-w-lg" @click.stop>
    <form class="modal-form">
      <label class="modal-field-label">Name</label>
      <input class="modal-input" />
      <div class="modal-actions">
        <button class="modal-btn-cancel" @click="close">Cancel</button>
        <button class="modal-btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>
```

| Class | Purpose |
|---|---|
| `modal-backdrop` | Fixed overlay, blur, `z-[300]` |
| `modal-backdrop-heavy` | As above with `bg-black/80` for destructive ops |
| `modal-card` | White/dark modal card with rounded corners — add `max-w-*` |
| `modal-form` | Flex-column form with `gap-4` |
| `modal-field-label` | Small uppercase field label |
| `modal-input` / `modal-select` | Styled text input and select |
| `modal-actions` | Button row (`flex gap-3 pt-2`) |
| `modal-btn-cancel` | Secondary muted button (full-width in `modal-actions`) |
| `modal-btn-primary` | Teal tint positive action button |
| `modal-btn-danger` | Red tint destructive action button |

### Config page classes

```html
<section class="cfg-section">
  <input class="cfg-input" />
  <button class="cfg-btn-primary">Save</button>
  <button class="cfg-btn-secondary">Reset</button>
</section>
```

### Glass cards

```html
<div class="glass-card">...</div>
<div class="glass-card-green">...</div>  <!-- success tint -->
<div class="glass-card-orange">...</div> <!-- warning tint -->
```

Full catalogue: [`docs/style-guide.md`](style-guide.md).

---

## Common patterns

### Spinners

Always use the `<Spinner>` component. Never write an inline `animate-spin` div.

```vue
<Spinner />                          <!-- md, primary -->
<Spinner size="sm" color="white" />  <!-- sm, white — for dark button interiors -->
<Spinner size="xs" color="current" /><!-- xs, inherits text colour -->
```

Sizes: `xs` (12px) · `sm` (16px) · `md` (32px) · `lg` (48px)  
Colours: `primary` · `white` · `current`

The spinner uses a single-arc `border-b` style, not a full ring.

### Modals — lifecycle pattern

```vue
<script setup>
const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="props.show" class="modal-backdrop" @click="emit('close')">
      <div class="modal-card max-w-md" @click.stop>
        <!-- header / body / modal-actions -->
      </div>
    </div>
  </Teleport>
</template>
```

Always teleport modals to `body`. Always use `@click.stop` on the inner card to prevent backdrop-click from firing through.

### Pinia store access

```ts
// Reactive (keeps updating):
const { stats } = storeToRefs(useSystemStore())

// One-time read (fine for non-reactive logic):
const stats = useSystemStore().stats
```

### API calls

```ts
import ApiService from '@/utils/api'

const res = await ApiService.get('/some/endpoint') as SomeType
const res = await ApiService.post('/some/endpoint', { payload })
```

`ApiService` automatically injects the JWT from `localStorage` and handles 401 redirects.

### Inline styles — when they are acceptable

`:style=` bindings are **only acceptable** when the value is genuinely runtime-dynamic and cannot be expressed as a Tailwind class or CSS custom property:

- **OK:** Floating menu position (`top`/`left` from `getBoundingClientRect`)
- **OK:** Chart colours from data (arbitrary hex from an API payload)  
- **OK:** Progress bar `width` from a live percentage
- **Not OK:** Hardcoded colour hex values — use `var(--color-*)` instead
- **Not OK:** Fixed heights/widths from a small known set — use a Tailwind class lookup array

See [`docs/style-guide.md`](style-guide.md) for the full inline styles audit and decision table.

---

## Making changes — a checklist

**Adding a new page:**
- [ ] Create view in `src/views/`
- [ ] Add route in `src/router/`
- [ ] Add nav entry in `Sidebar.vue` and `MobileSidebar.vue`
- [ ] If the page needs live data, consume it from DataService — do not create a new polling loop
- [ ] Use `cfg-section` / `cfg-card` for layout, `cfg-input` / `cfg-btn-primary` for form elements

**Adding a new modal:**
- [ ] Use `modal-backdrop`, `modal-card`, `modal-form`, `modal-actions` classes
- [ ] Teleport to `body`
- [ ] Block backdrop click and X button during destructive/in-progress states
- [ ] Use `modal-btn-primary` / `modal-btn-cancel` / `modal-btn-danger` for footer buttons

**Adding a loading state:**
- [ ] Use `<Spinner>` — not an inline div
- [ ] Ask: will this spinner ever actually be visible? If the data is already in the store by the time the user navigates here, omit it

**Styling:**
- [ ] Use design tokens — no raw hex, no Tailwind colour literals
- [ ] Use global classes before writing a new Tailwind string
- [ ] If you write the same Tailwind string in more than two places, add a global class to `main.css`
- [ ] Never `bg-primary text-white` — use `bg-primary/20 text-primary` (dark mode safe)

---

## Further reading

| Document | Contents |
|---|---|
| [`docs/README.md`](README.md) | Docs index |
| [`docs/design-tokens.md`](design-tokens.md) | Full CSS variable + Tailwind alias reference |
| [`docs/style-guide.md`](style-guide.md) | Global utility class catalogue + inline styles audit |
| [`docs/ui-components.md`](ui-components.md) | Shared components (Spinner, NeighborMenu, modal utilities) |
| [`docs/data-service.md`](data-service.md) | DataService architecture, WebSocket model, endpoint ownership |
| [`docs/z-index-layering.md`](z-index-layering.md) | Z-index scale and stacking rules |
| [`docs/architecture-decisions.md`](architecture-decisions.md) | ADRs for significant design decisions |
