# Navigation System

The sidebar navigation is driven entirely by a config file. Adding, removing, or restructuring menu items requires editing **only** `src/config/navigation.ts` — no template changes needed.

---

## Config file

`src/config/navigation.ts`

Exports `navigationItems: NavItemConfig[]` — a tree of items rendered by `NavItem.vue`.

### `NavItemConfig` shape

```ts
type NavItemConfig = {
  id: string           // unique identifier (used as Vue :key)
  label: string        // display text
  icon?: string        // key into NavItem's icon map (optional)
  route?: string       // navigates here on click (leaf nodes)
  params?: Record<string, string>  // query params merged into the route
  activeOn?: string[]  // routes that trigger active/expand state
  children?: NavItemConfig[]       // makes this a collapsible group
  action?: string      // named action instead of navigation (see below)
}
```

### Rules

- **Leaf items** must have either `route` or `action` — never both, never neither.
- **Group items** have `children` and no `route`. Clicking toggles expand/collapse.
- **`activeOn`** defaults to `[route]` when `route` is set. Set explicitly when a leaf shares a route with others and uses `params` to distinguish (e.g. config tabs).
- **`id`** must be unique across the entire tree — the test suite enforces this.

### Configuration tabs (4-level nesting)

Configuration tabs are 4 levels deep:

```
Monitoring / System / … (depth 0)
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

### Active state

Only **leaf items** get the active highlight (`bg-primary/20 text-primary border border-primary/40`). Group items never show active styling — they only expand.

`matchesActive` returns `false` for items with no `activeOn` and no `route` (empty targets = never active). This prevents top-level groups from spuriously expanding on load.

### Icons

Icons are registered in NavItem's `iconComponents` map. To add a new icon, import the Vue icon component and add an entry to the map.

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

## GPS / Sensors filtering

GPS and Sensors nav items are filtered out when the device reports those features as disabled. The filter is applied recursively in `Sidebar.vue`'s `filterNavItems` function. The config itself always includes these items — the filter is purely a runtime concern.

---

## Adding a new nav item

1. Open `src/config/navigation.ts`.
2. Add a `NavItemConfig` object to the appropriate group's `children` array (or at the top level for a standalone item).
3. If it's a new action, register the handler in `Sidebar.vue`'s `provide` call.
4. Run `npm run test:unit` — the shape invariants will catch missing `route`/`action`, duplicate `id`s, and config tab leaves without `tab` params.

## Adding a new configuration tab

1. Add the tab panel component to `src/components/configuration/`.
2. Add a leaf item under the correct group in `navigation.ts` with `route: '/configuration'` and `params: { tab: '<id>' }`.
3. Add `'<id>'` to `VALID_TABS` in `Configuration.vue`.
4. Import and render the component in `Configuration.vue`'s panel section with `v-if="activeTab === '<id>'"`.
