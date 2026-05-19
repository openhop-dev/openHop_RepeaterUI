# Configuration Tab Workflow

This document covers the unsaved-changes guard and save/restart flow that applies across all editable configuration tabs.

---

## Overview

Every configuration tab that has an **Edit Settings** button follows a shared pattern:

1. User enters edit mode via the Edit Settings button.
2. On explicit save, settings are posted to the API.
3. On navigation away while in edit mode (either switching tabs or leaving the `/configuration` route), the user is prompted to discard or save before leaving.
4. **Two tabs** (Radio Settings and Observer) additionally prompt the user to restart the service after a successful save, because their settings require a running-service restart to take effect. All other tabs do not.

---

## Shared components and composables

### `useUnsavedChanges` composable

`src/composables/useUnsavedChanges.ts`

Wires up both navigation guard vectors (route leave and tab switch) and owns the `UnsavedChangesModal` visibility state.

```ts
const { showUnsavedModal, requestLeave, handleDiscard, handleSave } = useUnsavedChanges(
  isEditing,   // Ref<boolean> — true when the tab is in edit mode
  isSaving,    // Ref<boolean> — true during an in-flight API call
  cancelFn,    // () => void  — restores form to pre-edit state and exits edit mode
  saveFn,      // () => Promise<boolean> — calls the API; returns true on success
);
```

Internally the composable:

- Registers `onBeforeRouteLeave` to intercept Vue Router navigation away from `/configuration`. If the tab is editing, it blocks navigation and shows the modal instead.
- Exposes `requestLeave(callback)` for tab-switch interception (called by `Configuration.vue` before changing the active tab).
- On **Discard**: calls `cancelFn()` then executes the pending navigation.
- On **Save**: calls `saveFn()` and, if it returns `true`, executes the pending navigation.

### `UnsavedChangesModal`

`src/components/ui/UnsavedChangesModal.vue`

A shared two-button modal (Discard Changes / Save Settings). Teleported to `body`, appears over all page content regardless of which tab is active.

| Prop | Type | Description |
|---|---|---|
| `show` | `boolean` | Controls visibility |
| `isSaving` | `boolean` | Disables both buttons and shows "Saving…" on the save button |
| `label` | `string?` | Name of the settings being guarded, e.g. `"Radio Settings"` |

| Emit | When |
|---|---|
| `discard` | User confirms Discard Changes |
| `save` | User confirms Save Settings |

Usage in a tab:
```vue
<UnsavedChangesModal
  :show="showUnsavedModal"
  :is-saving="isSaving"
  label="Radio Settings"
  @discard="handleDiscard"
  @save="handleSave"
/>
```

---

## Tab-by-tab behaviour

### Tabs with save + restart prompt

**Radio Settings** (`RadioSettings.vue`) and **Observer** (`LetsMeshSettings.vue`)

These tabs affect hardware or service-level configuration that requires a service restart to take effect. Both the explicit save button and the unsaved-changes guard path show the `RestartModal` after a successful save.

| Action | Result |
|---|---|
| Click **Save Changes** button | API call → on success → RestartModal |
| Navigate away while editing → click **Save Settings** in guard modal | API call → on success → RestartModal → then navigation |

The `RestartModal` is teleported to `body`. Because Configuration.vue renders tabs with `v-show` (not `v-if`), the component stays mounted after a tab switch, so the restart modal remains visible over the new tab until the user dismisses it or triggers a restart.

**Important:** the save button must be called with explicit parentheses (`@click="saveChanges()"`) so that Vue does not pass the native `MouseEvent` as the first argument. Passing the event as an argument would shadow the function's named parameters and is the historical source of silent failures.

### Tabs with save only (no restart prompt)

**Repeater Settings**, **Advert Limits**, **Duty Cycle**, **TX Delays**, **Region Configuration**

These tabs post settings to the API and exit edit mode on success. No restart is required. The unsaved-changes guard is still active — if the user navigates away while editing, the `UnsavedChangesModal` appears — but after saving via the guard, navigation proceeds immediately without a restart modal.

| Action | Result |
|---|---|
| Click **Save Changes** button | API call → on success → edit mode exits, no modal |
| Navigate away while editing → click **Save Settings** in guard modal | API call → on success → navigation proceeds |

### Tabs without an edit flow

**API Tokens**, **Web Options**, **Backup**, **Database**, **Memory**

These tabs do not have an Edit Settings / Save Changes workflow. They manage their own inline actions (create, delete, download, etc.) without entering a global edit mode. The unsaved-changes guard is not applied to them. `Configuration.vue` will not call `requestLeave` on these tabs before switching away.

---

## How Configuration.vue routes tab-leave requests

`Configuration.vue` maintains a map of every guarded tab's component ref:

```ts
const editableTabRefs: Record<string, Ref<EditableTabRef | null>> = {
  radio:    radioRef,
  repeater: repeaterRef,
  advert:   advertRef,
  duty:     dutyRef,
  delays:   delaysRef,
  transport: transportRef,
  observer: letsMeshRef,
};
```

When the user clicks a tab, `setActiveTab()` checks whether the current tab is editing before switching:

```ts
function setActiveTab(tabId: string) {
  if (tabId !== activeTab.value && isCurrentTabEditing()) {
    requestCurrentTabLeave(() => { activeTab.value = tabId; });
    return;
  }
  activeTab.value = tabId;
}
```

`isCurrentTabEditing()` reads the `isEditing` ref that each guarded tab exposes. `requestCurrentTabLeave()` calls `requestLeave(callback)` on the active tab's ref, which the composable handles.

Tabs that are not in `editableTabRefs` (API Tokens, Web Options, etc.) are not checked — switching to or away from them is always immediate.

---

## Contract every guarded tab must fulfil

For a tab to participate in the guard, its component must:

1. Call `useUnsavedChanges(isEditing, isSaving, cancelFn, saveFn)`.
2. Expose `requestLeave` and `isEditing` via `defineExpose`:
   ```ts
   defineExpose({ requestLeave, isEditing });
   ```
3. Add a `<UnsavedChangesModal>` to its template.
4. Add its ref to `editableTabRefs` in `Configuration.vue`.

The `isEditing` ref name in `defineExpose` must match exactly — `Configuration.vue` reads it as `r.isEditing`. If a tab's internal ref has a different name (e.g. `isGlobalEditing` in Observer), alias it at the `defineExpose` call site:
```ts
defineExpose({ requestLeave, isEditing: isGlobalEditing });
```

---

## Adding a new guarded tab

1. In the tab component:
   - Add `isEditing`, `isSaving`, `cancelFn` refs/functions.
   - Define `saveFn` as `async (): Promise<boolean>` — return `true` on success, `false` on failure.
   - Call `useUnsavedChanges` and destructure the return values.
   - Add `<UnsavedChangesModal>` to the template.
   - `defineExpose({ requestLeave, isEditing })`.
   - If the tab requires a restart after save, show `RestartModal` inside `saveFn` (or inside the explicit save button handler) before returning `true`. Also show `RestartModal` in the explicit save button handler.

2. In `Configuration.vue`:
   - Add a typed ref: `const myTabRef = ref<EditableTabRef | null>(null)`.
   - Add it to `editableTabRefs`: `myTab: myTabRef`.
   - Bind it in the template: `<MyTab ref="myTabRef" />`.
