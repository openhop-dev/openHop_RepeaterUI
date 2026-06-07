## Why this PR exists

The pyMC-RepeaterUI codebase accumulated a silent inconsistency over time: different developers building different screens used different inline Tailwind class strings to style form fields — the `<input>`, `<select>`, and `<textarea>` elements that the browser renders natively. Some screens used `bg-white` as the field background; others used `bg-background-mute` (a light grey). In dark mode both approaches look identical, because the dark override (`dark:bg-white/5`) is the same either way. In light mode they are visibly different: `bg-white` produces a pure white field while `bg-background-mute` produces a soft grey — and the two were mixed across screens with no consistency.

This wasn't a deliberate design decision. A global class system (`modal-input`, `modal-select`, `cfg-input`, `cfg-select`) was introduced as part of a UI consistency refactor, and it was always known that refactor would miss things — it standardised new work going forward rather than retrofitting every existing screen. This PR addresses the form field gap that surfaced during investigation. There will likely be other areas of the codebase not yet using the global class system; those are tracked separately in issue #54.

This PR retrofits every remaining native form element (`<input>`, `<select>`, `<textarea>`) to the standard class system, achieving **100% coverage** on that element type. From this point forward, a single edit to `modal-input` in `main.css` changes the surface colour, border, focus ring, and placeholder of every editable input in the app — without touching a single component file.

---

## Trigger: issue #39

The immediate trigger was upstream issue #39, where a user reported that dropdowns and password autofill fields rendered in light mode while the rest of the UI was in dark mode on Edge/Windows. The root cause was that `color-scheme: dark` was not being set on native form controls, causing the browser to apply its own light-mode chrome to those elements.

Investigation confirmed a redundant CSS block in `base.css` — `.dark select, .dark input, .dark textarea { color-scheme: dark }` — that had been added to address this but was actually a no-op: `html.dark { color-scheme: dark }` already existed above it and cascades to all descendants via normal CSS inheritance. Removing the redundancy was the one-line fix for issue #39.

That audit of form fields is what surfaced the broader inconsistency described above.

---

## What this PR changes

**`src/assets/base.css`** — Remove the redundant 3-line `color-scheme: dark` block for select/input/textarea (already inherited from `html.dark`). Keep the `.dark select { background-color: transparent !important; }` line below it — that one is functional.

**`src/assets/main.css`** — Add `modal-input-readonly` global class. Same surface as `modal-input`, with `font-mono cursor-default select-all` and no focus ring. For display-only value fields — API tokens, derived transport keys, coordinate readouts — that the user reads but cannot edit. Previously each of these was a one-off inline string. (Use `readonly` on the element, not `disabled` — disabled fields cannot be selected or copied.)

**`src/components/modals/ChangePasswordModal.vue`** — 3 password inputs → `modal-input`.

**`src/components/modals/DeleteConfirmModal.vue`** — Search input → `modal-input pl-9` (callsite indent override for the icon).

**`src/components/modals/LocationPicker.vue`** — 2 readonly coordinate inputs → `modal-input-readonly`.

**`src/components/modals/ImportRepeaterContactsModal.vue`** — 2 compact number inputs: `bg-white` → `bg-background-mute` only. These are specialised narrow controls that cannot structurally migrate to `modal-input`; background-only fix resolves the light-mode inconsistency. Full structural review tracked in issue #53.

**`src/views/Terminal.vue`** — Search input → `modal-input flex-1 px-4`.

**`src/views/Statistics.vue`** — Time-range select → `modal-select w-auto`. Also corrects the non-standard `dark:bg-white/10` opacity (was inconsistent with the `/5` standard).

**`src/views/Companions.vue`** — 9 inputs across add and edit companion modals → `modal-input`. Identity key inputs retain `font-mono text-sm` at the callsite.

**`src/views/Setup.vue`** — 13 inputs and selects across the setup wizard (node name, USB serial, TCP connection, custom radio parameters, admin password) → `modal-input` / `modal-select` with callsite padding overrides where the wizard's larger touch targets require it.

**`src/views/RoomServers.vue`** — Chat message textarea → `modal-input resize-none px-4 py-3`. Also removes the non-standard `focus:bg-white dark:focus:bg-white/10` that was included in the original inline string.

**`src/components/configuration/APITokens.vue`** — Generated token display → `modal-input-readonly flex-1 text-sm`.

**`src/components/modals/KeyModal.vue`** (new) — Merges `AddKeyModal.vue` and `EditKeyModal.vue` into a single component. `AddKeyModal` was built first; `EditKeyModal` was added later as a near-copy with more fields. With Edit being a strict superset of Add, keeping them separate created a maintenance hazard where the two could silently drift apart. The merged component is mode-driven by a `node: TreeNodeData | null` prop (null = add, set = edit). Both modes show the parent node path for context. Edit mode adds transport key derivation (`SHA-256(#name)[:16] → base64`, matching the `pymc_core get_auto_key_for` algorithm), `nameChanged` dirty tracking, copy-to-clipboard, and `formatTimeAgo` metadata. Transport key display uses `modal-input-readonly`.

**Delete** `src/components/modals/AddKeyModal.vue` and `src/components/modals/EditKeyModal.vue`.

**`src/components/configuration/TransportKeys.vue`** — Updated to import `KeyModal` only.

---

## Things found during testing

| Finding | Action |
|---|---|
| LocationPicker coordinate fields displayed 14–15 decimal places from raw Leaflet floats | **Fixed here** — rounding extracted to `roundCoord()` helper, applied at all assignment points |
| APITokens "Token Created Successfully" modal used Tailwind colour literals invisible in light mode | **Fixed here** — replaced with semantic tokens and `cfg-card` |
| APITokens description text used `text-blue-700 dark:text-blue-200` (Tailwind literals) | **Fixed here** — replaced with `text-content-secondary` |
| No copy button feedback anywhere in the app — user had no confirmation copy succeeded | **Fixed here** — `useCopyToClipboard` composable + `label-swap` transition; applied to APITokens, KeyModal, TreeNode, NeighborDetailsModal |
| `modal-input-readonly` was showing a focus ring (browser native outline) | **Fixed here** — added `focus:outline-none focus:ring-0` to the global class |
| Change Password modal unreachable from within the app once default password is changed | **Issue raised** — #55 |
| No in-app password change feature (only shown on first login with default credentials) | **Issue raised** — #55 |

---

## Coverage

Before this PR: 36 native form fields (`<input>`, `<select>`, `<textarea>`) across 12 files used the pre-standards inline class pattern. Approximately 103 fields were already on the standard class system — roughly 74% coverage.

After this PR: every native form field in the codebase uses the standard class system — **100% coverage**. The only remaining `bg-white dark:bg-white/5` strings in the codebase are on `<div>` container elements (panel backgrounds in `AdvertSettings.vue` and `Sidebar.vue`), which are intentional and a separate concern.

---

## What was NOT changed

- `ImportRepeaterContactsModal` compact number inputs beyond the background fix — tracked in issue #53 for structural review

---

> **Note:** The test plan below is intended to be posted as a separate comment on the PR after it is created — not included in the PR description body.

## Test plan

### color-scheme fix (dark mode — the original reported issue)
- [X] Open the Statistics time-range select (Dashboard → Statistics) in dark mode on Edge or Chrome — option list renders dark, not bright white
- [X] Open the Spreading Factor select (Setup wizard → custom radio step) in dark mode — option list renders dark
- [X] Open a Policy Engine rule condition select (Configuration → Policy Engine) in dark mode — option list renders dark
- [X] Autofill a password field (Configuration → Room Servers → add/edit a room server → Admin Password field) in dark mode — autofill background is dark, not white/yellow

### Light mode surface consistency (the broader fix)
The primary visual change in this PR is in light mode — inputs that were pure white (`bg-white`) are now soft grey (`bg-background-mute`). Check each of the following in light mode and confirm fields have a consistent grey surface, not pure white.

> **Note for reviewer:** tick items off as you go — this file is the live test record.
- [X] RoomServers password fields — Admin Password and Guest Password (Configuration → Room Servers → add/edit a room server)
- [X] DeleteConfirmModal — search input (Configuration → Regions/Keys → Edit → delete a region that has child keys; the search field only appears when the deleted node has children that need to be rehomed)
- [X] LocationPicker — lat/lon coordinate fields (monospace, not editable)
- [X] ImportRepeaterContactsModal — hours and limit number fields
- [X] Terminal — search input
- [X] Statistics — time-range select
- [X] Companions — name, callsign, notes fields in both add and edit flows
- [ ] Setup wizard — node name (step 1), USB serial/custom path (step 4), TCP hostname/port/auth token (step 4), custom radio fields (step 5), admin/confirm password (step 6)
- [X] RoomServers — chat message textarea
- [X] APITokens — generated token display (monospace, not editable)
- [X] KeyModal — key name input in both add and edit modes

### modal-input-readonly behaviour
- [X] Clicking a readonly field (LocationPicker coords, APITokens token, KeyModal transport key) selects all content
- [X] Cursor is `default`, not text-cursor
- [X] No focus ring appears
- [X] Content is not editable via keyboard
- [X] Light and dark mode surface matches `modal-input`

### Functional regression — items where logic was touched
- [X] LocationPicker: lat/lon populate correctly after map click and show 6 decimal places; GPS "Use Current Location" also rounds correctly
- [X] APITokens: copy button works; "Token Created Successfully" modal — warning text readable (amber), curl command legible, description and `X-API-Key` snippet readable in light mode

### KeyModal (merged Add + Edit)
- [X] Key name input shows `bg-background-mute` surface in light mode
- [X] Transport key displays in `modal-input-readonly` (monospace, no focus ring)
- [X] Parent path context shown above form in both add and edit modes
- [X] Add and edit flows open and close correctly (smoke test — not testing logic)

### Copy button feedback (CopyLabel)
Copy buttons appear in four places — check each in both light and dark mode:
- [X] **APITokens** (Configuration → API Tokens → Create token) — click Copy button; label crossfades to "Copied!", icon changes to checkmark, button shifts from teal to green; reverts after 2 seconds; button width stays constant throughout
- [X] **KeyModal transport key** (Configuration → Regions/Keys → Edit → edit a region with a transport key) — click Copy beside the transport key field; label crossfades to "Copied!"; button width stays constant
- [X] **TreeNode transport key** (Configuration → Regions/Keys → Edit → expand a region row to see transport key) — click "Copy Key" button; label crossfades to "Copied!"; button width stays constant
- [X] **NeighborDetailsModal** — the copy button only appears in the Distance card when the repeater has no location configured (it shows in place of the distance value). If repeater location is set, distance shows instead and the button is hidden — skip if distance is showing

### General
- [X] `npm run test:unit` — 101 tests across 16 files, all pass
- [X] No new Tailwind colour literals
- [X] No new raw hex values
- [X] No `:global()` in any scoped CSS
