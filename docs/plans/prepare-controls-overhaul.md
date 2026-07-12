# nc-print Prepare controls overhaul (v1.54.0)

## Why

Live-use feedback on the Prepare tab:

1. **Undo/redo look broken** — user sliced, hit Undo, nothing happened. Undo/redo
   is transform-only by design (a slice isn't on the stack), but the generic
   "Undo / Redo / Reset" buttons imply they undo *anything*.
2. **Workflow bar clips behind the floating menus on scroll** — the sticky chrome
   is `z-index:3`; the immersive side cards + tool rail are `z-index:6`, so they
   cover the sticky bar as the body scrolls.
3. **Auto-orient** is a lone toolbar button (single strategy). Should live in the
   **Orient** rail group with a choice of modes.
4. **Import STL/3MF/OBJ · From Files · Clear** float centered over the viewport —
   should move into a collapsible **Import** section in the left panel.
5. **Undo/Redo/Reset** and **Center / rotate XYZ / Lay flat / Scale to fit** float
   centered over the viewport — should become docked corner boxes (history box
   top-right; a keypad-style orient box).

## Decisions (confirmed with user)

- Auto-orient = **3 modes**: Default (balanced) · Minimize supports (least
  overhang) · Minimize footprint (flattest/most stable on bed).
- **Undo also clears the slice**: after a slice, pressing Undo clears the slice
  result (back to the un-sliced model) *before* it starts unwinding transforms.
- Layout: Import cluster → left collapsible; Undo/Redo/Reset → top-right viewport
  corner box; Center/rotate/lay-flat/scale → keypad-style viewport corner box.
  Viewport center stays clean.

## Changes

### A. Fix workflow-bar clipping (CSS only)
- Raise `.nc-print-chrome` above the immersive overlays. The overlays are z-6;
  bump chrome to `z-index: 20` (still below modals at 9999). Verify the sticky
  bar stays on top while scrolling Prepare + Slice.

### B. Undo clears slice + clearer scoping
- Store: `undoTransform(viewport)` — if `sliceJob.status === 'done' || 'error'`
  and there's a slice result, `resetSliceJob()` and return (one Undo = clear
  slice). Otherwise proceed with the transform undo as today. `meshCanUndo`
  getter also true when a slice result exists so the button is enabled.
- Relabel the buttons: tooltip "Undo (move/rotate/scale, or clear last slice)".

### C. Auto-orient modes (Orient rail group)
- `mesh-analyze.js` `autoOrient(positions, indices, {mode})`: `mode` ∈
  `'default'|'supports'|'footprint'`. `supports` = current min-overhang.
  `footprint` = min bbox-Z (flattest, most bed contact) among the 6 axis
  rotations (tie-break lower overhang). `default` = min of a blended score
  (overhang + normalized height). Returns `{positions, matrix, label, overhangPct}`.
- `ModelViewport.autoOrientMesh(mode)` passes the mode through; toast names it.
- Rail: add an **`autoorient`** tool to the **Orient** group; its ToolPanel body
  shows 3 buttons (Default / Minimize supports / Minimize footprint) → emit
  `auto-orient` with the mode. PrepareTab.onAutoOrient(mode) forwards it.
- Remove the standalone Auto-orient button from ViewportToolbar.

### D. Relocate viewport controls
- **Import cluster → left panel**: new collapsible `NcPrintCollapsible` "Import
  model" section in PrepareTab `#left` with Import STL/3MF/OBJ (hidden file
  input), From Files, Clear. Remove from the floating toolbar/center.
- **History box (top-right of viewport)**: small `ViewportHistoryBox.vue` (Undo /
  Redo / Reset) docked `position:absolute; top; right` inside the viewport wrap.
- **Orient keypad (viewport corner)**: `ViewportOrientPad.vue` — keypad layout:
  Center-on-bed (center), ↻X ↻Y ↻Z, Lay flat, Scale to fit. Docked corner box.
- ViewportToolbar shrinks to just the info line (+ auto-apply toggle / Apply),
  or is removed and the info line moves into a small viewport chip. Keep
  auto-apply + Apply reachable.

## Verification
- `npm run build` clean; full vitest/adapter/phpunit + G00–G50 gates green.
- vitest: `autoOrient` mode param (supports/footprint/default) picks distinct
  orientations on a tall asymmetric test mesh; store `undoTransform` clears a
  done slice on first press then unwinds transforms; source-regex for the new
  boxes + import-in-left-panel + chrome z-index.
- LIVE on cloud-vdroners: workflow bar stays above overlays while scrolling
  Prepare + Slice; import from left panel loads a model; history box undo/redo
  works and Undo clears a slice; orient keypad rotates/centers; auto-orient 3
  modes each change orientation.

## Version
Minor bump → **v1.54.0** (new feature + behavior change). Plan checked in with
the implementation commit.
