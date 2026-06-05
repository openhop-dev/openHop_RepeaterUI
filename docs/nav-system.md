# Navigation System

The sidebar navigation is driven entirely by a config file. Adding, removing, or restructuring menu items requires editing **only** `src/config/navigation.ts` — no template changes needed.

---

## Config file

`src/config/navigation.ts`

Exports `navigationItems: NavItemConfig[]` — a tree of items rendered by `NavItem.vue`.

### `NavItemConfig` shape

```ts
import type { Component } from 'vue'

type NavItemConfig = {
  id: string                        // unique identifier (used as Vue :key)
  label: string                     // display text
  icon?: Component                  // Lucide icon component (optional)
  route?: string                    // navigates here on click (leaf nodes)
  params?: Record<string, string>   // query params merged into the route
  activeOn?: string[]               // routes that trigger active/expand state
  children?: NavItemConfig[]        // makes this a collapsible group
  action?: string                   // named action instead of navigation (see below)
  enabledWhen?: Capability          // hide unless device capability is enabled
}
```

### Rules

- **Leaf items** must have either `route` or `action` — never both, never neither.
- **Group items** have `children` and no `route`. Clicking toggles expand/collapse.
- **`activeOn`** defaults to `[route]` when `route` is set. Set explicitly when a leaf shares a route with others and uses `params` to distinguish (e.g. config tabs).
- **`id`** must be unique across the entire tree — the test suite enforces this.

### Icons

Icons are [Lucide Vue](https://lucide.dev) components imported directly in `navigation.ts` and assigned on each item. There is no separate icon map — the component reference lives in the config.

```ts
import { LayoutDashboard, Settings } from '@lucide/vue'

{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, route: '/' }
```

To add or change an icon, import the Lucide component at the top of `navigation.ts` and assign it. Items without an `icon` field render text-only (no icon shown).

Browse available icons at [lucide.dev](https://lucide.dev).

### Capability-gated items

Items with `enabledWhen` are hidden when the device reports that feature as disabled.

```ts
{ id: 'gps', label: 'GPS', icon: MapPin, route: '/gps', enabledWhen: 'gps' }
```

Every `enabledWhen` value must be registered in `knownCapabilities` (also in `navigation.ts`) and have a corresponding resolver in `Sidebar.vue`'s `capabilities` computed. The test suite enforces this — adding an unknown value will fail `navCapabilities.test.ts`.

### Configuration tabs (4-level nesting)

Configuration tabs are 4 levels deep:

```
System (depth 0)
  └ Configuration (depth 1, group)
      └ Radio / Access / Maintenance (depth 2, group)
          └ Radio Settings / … (depth 3, leaf, route + params)
```

Each leaf uses `route: '/configuration'` and `params: { tab: '<id>' }`. `Configuration.vue` reads `route.query.tab` to render the correct panel.

---

## NavItem component

`src/components/nav/NavItem.vue`

Recursive renderer. Handles:
- **Leaf**: navigates via `router.push({ path, query })` on click.
- **Group**: toggles `expanded` on click. Auto-expands when `hasActiveDescendant` is true (page load and route changes).
- **Action item**: calls `actionHandlers[item.action]?.()` injected via `provide`/`inject`.

### Props

| Prop | Type | Description |
|---|---|---|
| `item` | `NavItemConfig` | The item to render |
| `depth` | `number?` | Nesting depth (0 = top level). Controls padding and tree line offsets |
| `precedesActive` | `boolean?` | Set by the parent loop when this item comes before the active/has-active child |

### Active state

Only **leaf items** get the active highlight (`bg-primary/15 text-primary font-semibold`). Group items never show active styling — they only expand.

`matchesActive` returns `false` for items with no `activeOn` and no `route` (empty targets = never active). This prevents top-level groups from spuriously expanding on load.

### Active path colouring

The parent loop computes `activeChildIndex` — the index of the first child that is active or contains the active item. Children before this index receive `precedesActive: true`.

Three CSS classes drive the tree line colouring on each child div:

| Class | Role | Vertical overlay |
|---|---|---|
| `nav-item-active` | Selected leaf | Primary, stops at tick |
| `nav-has-active` | Ancestor of selected leaf | Primary, stops at tick |
| `nav-precedes-active` | Sibling before the active path | Primary, full height |

Only `nav-item-active` items get a primary-coloured tick. Ancestors and preceding siblings keep their tick in the subtle guide colour.

### Tree lines

Two independent CSS layers ensure the structural guide is never removed when the primary overlay changes:

- **`div::before`** — subtle structural line, always full height. First-child items extend upward into the parent button space (`top: -10px` for root groups, `-8px` for nested). Last-child items stop at the tick (`bottom: calc(100% - 18px)`).
- **`div::after`** — primary coloured overlay, only generated for active-path items.
- **`.nav-tick` span** — a real DOM element (not a pseudo-element) to avoid button pseudo-element positioning quirks. Positioned at `top: 18px` from the child div (= centre of a `py-2 text-sm` button).

### Hover glow

On hover, the item label gets a `text-shadow` glow in `var(--color-primary)` with a thin `var(--color-surface)` knock-out shadow around each letter for visual separation. The content icon gets a matching `filter: drop-shadow`.

---

## Action items

Actions let nav items trigger behaviour instead of navigating. The pattern uses `provide`/`inject` to keep the config decoupled from stores.

**Register a handler in `Sidebar.vue`:**

```ts
import { NAV_ACTION_HANDLERS_KEY } from '@/config/navActionHandlers'
provide(NAV_ACTION_HANDLERS_KEY, {
  sendAdvert: () => { showAdvertModal.value = true },
  myNewAction: () => { /* ... */ },
})
```

**Declare the item in `navigation.ts`:**

```ts
{ id: 'my-action', label: 'Do Something', action: 'myNewAction' }
```

NavItem injects the handler map and calls the matching function on click. If no handler is registered for the action key, the click is silently ignored.

---

## Sidebar component

`src/components/nav/Sidebar.vue`

A **single unified component** that handles both desktop and mobile layouts. The rendering mode is determined by a reactive `matchMedia('(max-width: 1023px)')` watcher initialised in `onMounted`.

| Mode | Container | Extras |
|---|---|---|
| Desktop (`lg+`) | `w-[285px] h-full` inline in flex layout | — |
| Mobile (`< lg`) | `fixed left-0 top-0 bottom-0 w-72 z-[250]` overlay | Backdrop (Teleport), ✕ close button, Logout button |

**Mobile auto-close:** the component watches `route.fullPath` and emits `close` on any navigation when in mobile mode.

**`DashboardLayout.vue` wires the toggle:**

```vue
<Sidebar :mobile-open="showMobileSidebar" @close="closeMobileSidebar" />
```

Do not create a separate mobile sidebar component. All content changes must be made in `Sidebar.vue` — they apply to both layouts automatically.

---

## Adding a new nav item

1. Open `src/config/navigation.ts`.
2. Import the Lucide icon at the top of the file (browse at [lucide.dev](https://lucide.dev)).
3. Add a `NavItemConfig` object to the appropriate group's `children` array (or at the top level for a standalone item), including the `icon` field.
4. If it's a new action, register the handler in `Sidebar.vue`'s `provide` call.
5. Run `npm run test:unit` — the shape invariants will catch missing `route`/`action`, duplicate `id`s, unregistered `enabledWhen` values, and config tab leaves without `tab` params.

## Adding a new configuration tab

1. Add the tab panel component to `src/components/configuration/`.
2. Add a leaf item under the correct group in `navigation.ts` with `route: '/configuration'` and `params: { tab: '<id>' }`.
3. Add `'<id>'` to `VALID_TABS` in `Configuration.vue`.
4. Import and render the component in `Configuration.vue`'s panel section with `v-if="activeTab === '<id>'"`.
