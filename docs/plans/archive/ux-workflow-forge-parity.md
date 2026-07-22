# nc-print: workflow UX parity with 3DPrintForge

## Context

The user likes the 3DPrintForge workflow/UI and asked what to improve. A
side-by-side audit of forge (`/media/4TB/Planning/slicers/3dprintforge/public`)
and nc-print (`src/`) found the current app is already close on the core flow:
a 3-step **Prepare → Slice → Print** workflow with gating, a 3-column Prepare
studio, numeric tab shortcuts (1/2/3), Ctrl+O import, Ctrl+Enter slice, and a
one-click Slice-&-Send. The real gaps vs. forge are all on **discoverability and
the Print tab**:

1. **Print tab is a ~20-panel wall** (`PrintTab.vue`, 707 lines) — every panel is
   always expanded, fixed order, long scroll, no collapse/search/pinning, and no
   always-visible print status. This is the #1 friction.
2. **No command palette** — forge's signature Ctrl+K fuzzy "jump to anything".
3. **No full-screen drag-drop** — forge lets you drop a model anywhere.

The user picked (via AskUserQuestion): Print tab = **collapsible + pinning +
sticky status bar**; **build the Ctrl+K palette**; and add **full-screen
drag-drop upload**. Density toggle, sub-tabs, shortcut-help overlay, and extra
monitor shortcuts were NOT selected (deferred).

Existing building blocks we reuse (verified in-tree):
- `NcPrintCollapsible.vue` + `utils/collapsible.js` already do per-`id`
  localStorage open/closed persistence (used on the Prepare tab). The Print
  panels get wrapped in the same component — no new persistence code.
- `store.setModel(file, source)` ingests a model; `setActiveTab(tab)` switches
  steps. The drop overlay and palette call these.
- Print controls (`pausePrint/resumePrint/cancelPrint`) currently live inline in
  `PrintTab.vue` calling `moonraker-api` with `this.printerId`. We promote them
  to store actions so the sticky bar + palette can trigger them without
  duplicating the printerId/busy logic.

Ship as **three independent minor bumps**, each built → tested → `make ship` →
committed → pushed, so each is reviewable and revertible on its own:
- **v1.38.0** — Print tab: collapsible + pinning + sticky status bar.
- **v1.39.0** — Command palette (Ctrl+K).
- **v1.40.0** — Full-screen drag-drop upload.

Per repo convention: cover new store/util logic with vitest store/service specs
(happy-dom); no component-mount suites.

---

## Feature 1 (v1.38.0) — Print tab: collapsible + pinning + sticky status

Goal: kill the long-scroll wall; make the active print always visible; let power
users pin their favourite panels to the top.

### 1a. Sticky print-status bar
- New `PrintStatusBar.vue` rendered at the top of `PrintTab.vue`'s main column
  with `position: sticky; top: 0`. Shows, only while a print is active/paused:
  filename, a slim progress bar + %, elapsed/ETA, and Pause/Resume + Cancel
  buttons. Idle → the bar collapses to a one-line "Idle / last print" summary (or
  hides). Reuses the data already in `printStore.printerState`.
- Promote print control to the store: `printPause()`, `printResume()`,
  `printCancel()` actions wrapping the moonraker-api calls with the active
  `printerId` + a shared `printControlBusy` flag. `PrintTab.vue`'s existing
  buttons and the new status bar both call these (single source of truth).

### 1b. Collapsible panels + remembered state
- Wrap each Print panel in `NcPrintCollapsible` with a stable `id`
  (`print-<panel>`), so open/closed persists per user via the existing util.
  Sensible defaults: Print-control/Temperature/Camera open; Manual motion,
  Console, Power, Sensors, Bed mesh, Timelapse, Queue, History default closed.
- Group panels under lightweight zone headers mirroring forge's IA:
  **Operate** (control, tuning, temperature, manual motion, console, power),
  **Analyze** (temperature graph, bed mesh, sensors, filament, history),
  **Media/Queue** (camera, timelapse, webcams, queue). Zones are visual headers,
  not new routes.

### 1c. Pinning
- A small 📌 button in each collapsible header. Pinned panels render in a
  "Pinned" zone at the very top (above Operate), in pin order.
- Persistence: `utils/panel-prefs.js` — `loadPinned()/savePinned(ids)` over a
  single localStorage key `nc_print_pinned_panels` (JSON array of panel ids).
  Pure + framework-free (mirrors `collapsible.js`) so it's unit-testable.
- `PrintTab.vue` computes the render list: `[...pinned, ...unpinnedByZone]`. A
  panel appears once (pinned OR in its zone), never twice.

### Tests (v1.38.0)
- vitest `panel-prefs.spec.js`: load default [], save/reload round-trip, ignore
  corrupt JSON, pin/unpin ordering, cap (e.g. max 8 pinned).
- vitest store spec: `printPause/printResume/printCancel` call the right
  moonraker-api fn with the active printerId and toggle `printControlBusy`.

---

## Feature 2 (v1.39.0) — Command palette (Ctrl+K)

Goal: fuzzy "jump to anything" — the forge power-user feature.

### 2a. Fuzzy matcher (pure util)
- `utils/fuzzy.js` — `fuzzyScore(query, text)` (substring + subsequence scoring,
  case-insensitive), `fuzzyFilter(query, items, keyFn)` returning sorted matches.
  Ported in spirit from forge's `command-palette.js` matcher. Pure → unit-tested.

### 2b. Command registry
- `utils/commands.js` — `buildCommands(store)` returns a flat list of
  `{ id, title, group, hint, run() }` covering:
  - **Navigation**: Go to Prepare / Slice / Print (respect existing gating).
  - **Panels**: open + expand each Print panel (scroll-to + expand its
    collapsible); reuses the panel ids from Feature 1.
  - **Printers**: switch active printer (one command per configured printer).
  - **Actions**: Import model (Ctrl+O path), Slice, Slice & Send, Pause/Resume,
    Cancel print, Home all, Emergency stop — each guarded (only runnable when
    valid; disabled/greyed otherwise).
  Groups mirror forge: Navigation / Panels / Printers / Actions.

### 2c. Palette component
- `CommandPalette.vue` — a centered overlay modal: search input, grouped
  results, arrow-key navigation, Enter to run, Esc to close, click-out to close.
  Opened by Ctrl/Cmd+K (added to `App.vue onGlobalKeydown`, skipped when typing
  in input/textarea/select). Fully keyboard-driven + `role="dialog"` a11y.
- Wire into `App.vue` (mounted once at the shell level, like HelpDrawer).

### Tests (v1.39.0)
- vitest `fuzzy.spec.js`: ranking (exact > prefix > subsequence), case-insensitive,
  empty query returns all, no-match returns [].
- vitest `commands.spec.js`: `buildCommands` includes nav/action commands;
  guarded actions expose the right enabled/disabled state given store state;
  `run()` calls the expected store action (with a mocked store).

---

## Feature 3 (v1.40.0) — Full-screen drag-drop upload

Goal: drop a model/gcode anywhere → big overlay → it loads into Prepare.

### 3a. Drop overlay
- `DropZoneOverlay.vue` — a fixed full-screen overlay shown only while an OS file
  drag is over the window. Centered icon + "Drop to load" + accepted types
  (.stl .3mf .obj .gcode). Listens on `window` for `dragenter/dragover/dragleave/
  drop`; distinguishes real OS file drags (`dataTransfer.types` includes
  `Files`) from internal element drags (so dragging UI bits never triggers it).
- On drop: take the first accepted file; models → `store.setModel(file, 'drop')`
  + `setActiveTab(PREPARE)`; `.gcode` → route to the Print tab's upload path (or,
  minimally, surface a toast "Drop g-code on the Print tab" for v1 and wire the
  gcode path only if trivial). Best-effort; unsupported types → a clear toast.
- Mounted once in `App.vue`. Pure file-type gating logic extracted to
  `utils/drop-accept.js` (`isAcceptedModel(name)`, `classifyDrop(name)`) for
  unit-testing.

### Tests (v1.40.0)
- vitest `drop-accept.spec.js`: model vs gcode vs unsupported classification;
  case-insensitive extensions; `.gcode.gz` handled; empty/no-extension rejected.

---

## Out of scope (deferred — offer later)
- Compact density toggle, sub-tab split of the Print tab, `?` shortcut-help
  overlay, extra monitor shortcuts (P / [ ]), theme override. (Not selected.)
- Right-click context menus on printers (forge has them; revisit after fleet
  multi-printer UX matures).

## Verification (each feature)
- `npm run build` clean; full suites green (adapter / vitest / phpunit) each bump.
- `make ship` gate green (the two Moonraker gates G03/G06 are known-failing while
  the printer's Moonraker URL is unset — not a regression).
- Manual: load the app; Print tab panels collapse + remember state + pin/unpin;
  sticky status bar tracks an active print and Pause/Cancel work; Ctrl+K opens,
  fuzzy-filters, and each command runs; drag a file over the window → overlay →
  model loads into Prepare.
- Commit each with the `env -i` recipe + Claude trailer as the literal last line;
  push origin main; verify remote trailer.
