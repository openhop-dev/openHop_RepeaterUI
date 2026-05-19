# z-index Layering

All fixed, absolute, and modal elements use a standardised z-index scale with **50-unit gaps** between layers. The gap gives room to insert a new tier without reshuffling everything.

## Scale

| Layer | Value | Elements |
|---|---|---|
| Page chrome | `z-[100]` | TopBar inline dropdowns and popovers (absolute-positioned, local stacking context only) |
| Fixed UI | `z-[150]` | `ConnectionSnackbar` — toast notification |
| Map overlays | `z-[200]` | `NetworkMap` map-control button and map legend |
| Mobile nav / popovers | `z-[250]` | `MobileSidebar` backdrop overlay; `TopBar` System Status notification panel |
| Primary modals | `z-[300]` | All standard full-screen modals: `TreeNode` confirm dialog, `TopBar` modal, `PingResultModal`, `UpdateModal`, `Companions` create/edit, `RoomServers` create/edit/messages |
| Secondary modals | `z-[350]` | Modals opened *from within* a primary modal: `RoomServers` Sessions dialog, `ImportRepeaterContactsModal` |
| Pickers | `z-[400]` | `LocationPicker` — can be opened from any modal tier, always sits on top of them |
| Context menus | `z-[450]` | `NeighborMenu` right-click context menu |
| System overlays | `z-[500]` | `BootstrapModal` (initial load overlay), `Setup` "Restarting…" overlay — must cover every other element unconditionally |

## Rules

1. **New modals go at `z-[300]`** unless they open from inside an existing modal, in which case use `z-[350]`.
2. **Every fixed/modal element must use `<Teleport to="body">`** so that ancestor `backdrop-filter` or `transform` styles cannot create a new stacking context that traps the element below unrelated siblings.
3. **Page-chrome dropdowns** (`z-[100]`) are exempt from Teleport — they are `position: absolute` within their parent and only need to clear adjacent page content, not fixed overlays. **Exception:** if the parent component uses `backdrop-filter` or `transform` (which creates a new stacking context), an absolutely-positioned child is trapped within that context regardless of z-index. In that case, use `<Teleport to="body">` and a higher tier. The `TopBar` System Status panel is the canonical example: `glass-card` applies `backdrop-filter: blur(50px)`, so the panel is teleported to `body` at `z-[250]` rather than sitting at `z-[100]` inside TopBar.
4. **Do not use ad-hoc values** (e.g. `z-[9999]`, `z-[99999]`). If a new tier is genuinely needed, add it here first and document why.

## CSS utilities

The `modal-backdrop`, `modal-backdrop-heavy`, and `modal-card` utility classes in `src/assets/main.css` bake in the correct z-index automatically:

```html
<!-- primary modal -->
<div class="modal-backdrop" @click.self="close">
  <div class="modal-card max-w-lg">…</div>
</div>
```

Field labels inside modal forms use `modal-field-label` (also defined in `main.css`). Do not write raw Tailwind label classes in modal templates — use this class so padding and type scale stay consistent across all modals:

```html
<label class="modal-field-label">Name *</label>
```

## Background

Before this scale was introduced every modal used `z-[99999]` (or nearby magic numbers), which made it impossible to layer modals on top of each other reliably and led to bugs such as the Sessions dialog appearing behind the Room Messages modal. The scale was consolidated in May 2026.
