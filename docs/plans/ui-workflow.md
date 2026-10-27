# Operator UI workflow — trust the machine, cold start, start-job paths (2026-10-26)

**Status:** SHIPPED in 1.64.0 (PRs #7–#10 + #6; lab `make ship` same cut)
**Repo:** `vdroners/nc-print` · app id `nc_print` · UI title **NC 3D Print**
**Tree this plan was written against:** `1.63.0` (`appinfo/info.xml`, `package.json`). The Oct 26 2026 lab capture footer read **v1.63.1**; the symbols below are in this tree and match that capture.
**Browser verify URL (implementers, after `make ship`):** `https://cloud-vdroners.ddns.net/apps/nc_print/`
**Reviewer / merge owner:** Sarge. **Do not merge yourself.**

Evidence for the current UX is the Oct 26 live capture (empty Prepare while the printer was offline, Print during Door PA-CF ~89%, Overview with the fleet accordion open). Those images are not in the repo and must not be committed — there is no `docs/screenshots` convention.

Related, already shipped, do not re-open: `docs/plans/forge-port.md` (parts library, Model Forge v1, Print Guard lite now live under Overview), `docs/plans/first-print-ux-2026-08.md` (advisory send-to rows, Wave A).

---

## Goal

Three small Vue PRs, in order, so an operator can trust what the screen says:

1. **Print** shows a live job only while Moonraker’s machine state is `printing` or `paused`.
2. **Prepare** on an empty bed asks for a model, and does not paint advisory checks as hard failures.
3. **Parts Library** and **Model Forge** are reachable from Prepare and from Ctrl+K, not only by opening Overview and scrolling.

No slicer-engine, Spoolman, or Forge-teardown work.

---

## Operator pain

**Empty Prepare is a wall of checks.** The Oct 26 empty-bed screen leads with a yellow build-volume cage, a right-hand “Ready to slice” list (model, mesh, preview, watertight, slicer offline, send-to online), and a full Scan / IP / printer `<select>` in the left rail — while the only thing the operator can do next is import a model. The Prepare step subtitle is the long `Import a model · {printer} · {filament} · {process} → {target} ({state})` string, truncated in the chrome to “Import a model · Creality…”.

**Print looks live on leftover Moonraker state.** Klipper keeps `print_stats.filename` (and progress) after a job stops. The Print step subtitle, the sticky status strip, and the Print control card all treat that filename as “a job is on the machine.” Pause / Resume / Cancel render even when the machine is not `printing` or `paused` (they are merely `:disabled`). The Oct 26 *live* capture (state really `printing`, Door PA-CF ~89%) shows the same chrome twice: a sticky Pause + Cancel strip and a Print control card with Pause + Resume + Cancel. The camera card is a blank dark 16:9 with an Expand button and no “No stream” label. E-STOP sits below Send G-code and scrolls away.

**Library and Model Forge are buried.** The chrome gear is the Overview toggle (`aria-label` “Overview — printers, materials, history & more”). It is not a settings menu. Overview then stacks Printer fleet, Filament inventory, History & analytics, Maintenance, Materials & calibration, Achievements, **Parts library**, **Model Forge**, Print Guard, Cameras. Library and Forge are the 7th and 8th collapsed accordions. Ctrl+K cannot jump to them.

---

## What is already true (do not redo)

- `printerControls` in `src/store/print.js` is already honest: `isActive` / `canPause` / `canResume` / `canCancel` are `printing` and `paused` only. The bug is the **chrome** ORing `printerState.filename` on top of that.
- `prepareChecklist` already flags `target`, `target_online`, and `watertight` with `advisory: true`. `firstPrepareBlocker` / `isPrepareComplete` / `prepareChecklistProgress` in `src/utils/workflow-gates.js` already ignore the Moonraker target. The bug is `PrepareChecklist.vue`, which never reads `advisory`.
- Header status chip already exists: `App.vue` `#banner-extra` renders `printerStatusLabel` (Printing / Paused / Error / Ready / Offline / Reconnecting) via `printerStatusClass`. It does **not** include the printer name.
- `targetConnectionLabel` already returns `{name} · {status}` (the “3D Printer · offline” / “3D Printer · printing” line under the picker).
- Parts Library and Model Forge already open a file into Prepare (`PartsLibraryPanel.openEntry`, `ModelForgePanel.generate` → `setModel` + `TABS.PREPARE`). This plan only changes **how you reach** those panels.
- Print completion already has its own card: `PrintCompletionBanner` shows when `printerControls.isComplete`. Do not stack a second “last job” card on `complete`.
- Hotkey `4` in `App.vue` already opens Overview. The command palette does not.

---

## Out of scope

- Spoolman / filament-inventory behavior (`docs/plans/spoolman-nc-print.md`).
- A camera redesign (WebRTC, multi-cam layout, timelapse). PR A only makes an empty frame say **No stream**.
- Rewriting the Overview accordion. Achievements, calibration, bed mesh, fleet, history, Print Guard, and cameras stay there. PR C adds **entry points** to Library and Model Forge; it does not reorder or restyle the rest.
- Slicer engine, adapter, presets, `ENGINE_SRC`.
- Forge teardown (`chore/retire-forge` in `docs/plans/forge-port.md`).
- Renaming the footer. See the note at the bottom — not blocking, not in A/B/C.

---

## Ship rules (every implementation PR)

Vue / store / CSS only. No new PHP route or class, so **no** `RESTART=1`.

```bash
make bump-patch   # A and B — honesty fixes
make bump-minor   # C — new Prepare + palette entry points
# fill the CHANGELOG stub and a README feature line by hand
make ship         # build + slicer-up + deploy + gate-preflight
```

| Changed | build | slicer-up | RESTART=1 | bump |
|---------|-------|-----------|-----------|------|
| A, B (`src/`, `css/`) | yes | no | no | patch |
| C (same, new navigation) | yes | no | no | minor |
| This plan file only | no | no | no | no |

**Browser:** operator’s logged-in tab on `https://cloud-vdroners.ddns.net/apps/nc_print/`. Reload after deploy. Not `10.0.0.84:8080`, not localhost. Do not type credentials. Do not cancel a running job to prove Pause/Cancel; prove the **idle / error / standby** path on a printer that is not printing, and prove the live path by reading the screen during a job someone else started.

**Sarge merges** each implementation PR. Do not merge it yourself.

Suggested branches (from up-to-date `main`, after this plan is on `main`):

| PR | Branch |
|----|--------|
| A | `fix/ui-print-honesty` |
| B | `fix/ui-prepare-cold-start` |
| C | `feat/ui-library-forge-entry` |

---

## PR A — Trust the machine (Print honesty)

**Branch:** `fix/ui-print-honesty` · **bump:** patch

### Problem

Live Pause / Resume / Cancel and the “job in progress” chrome follow **filename**, not machine state.

`PrintTab.showPrintControl` (`src/components/PrintTab.vue`):

- true when `connected && (printerControls.isActive || printerState.filename) && !isComplete`
- `isComplete` is only `state === 'complete'`
- so a **connected** `error`, `standby`, or `cancelled` printer that still has `print_stats.filename` mounts the Print control card, including the three buttons

`PrintStatusBar.visible` uses the same predicate. Its own comment says “Idle → renders nothing”; the computed property does not. While that bar is visible it always renders Pause (or Resume) and Cancel.

The buttons’ `:disabled` flags do use `canPause` / `canResume` / `canCancel`, which are already state-gated. Disabled-but-present still reads as a live job. The Oct 26 printing capture shows both strips at once (sticky Pause+Cancel, card Pause+Resume+Cancel) during a real print — dedupe that too.

`workflowStepSubtitle` for `TABS.PRINT` (`src/store/print.js`) returns `printerState.filename` **before** it looks at `connected` or `state`. A leftover filename becomes the Print step subtitle (raw gcode name). The header chip can say Offline / Ready / Error at the same time. Desired subtitle is the machine state: **Idle**, **Error**, or **Printing N%** (and **Paused N%**).

Filename survives on purpose in the normalizers — do not “fix” this by deleting it:

- `normalizeMoonrakerStatus` (`src/services/moonraker-ws.js`) sets `filename: printStats.filename ?? null` for every state, including `error`. `lastError` is hard-coded `''` here; Klipper’s text is `display_status.message` → `printerState.message`.
- `PrinterController::normalizeState` (`lib/Controller/PrinterController.php`) does the same: `'filename' => $printStats['filename'] ?? null`, `'message' => display_status.message`.
- `mapPrinterState` / `_applyPrinterState` replace state by shallow merge. The websocket reconnect payload is only `{connected:false, state:'reconnecting', lastError}` and **keeps** the previous filename. The HTTP poll-failure path does set `filename: null`. Both are correct to leave alone; the UI must not treat filename as liveness.
- `printStepEnabled` also ORs `printerState.filename`, which can mark the Print step available with no live job. Tab reachability is already `printMonitorReachable || printStepEnabled`. Drop filename from that “job in progress” OR. Keep slice-done and `pendingPrintUpload`.

`PANEL_ZONES` in `PrintTab.vue`: Temperature is `open: true` and `when: () => true`. Manual motion is `open: false` and hidden while `isActive`. Bed mesh is `open: false` whenever connected. `PrintPanel` persists open state under `print-${id}` via `loadCollapsibleState`. On a non-printing machine, Temperature starts expanded (and a saved `print-temperature=1` keeps it expanded). Collapse Temperature, Manual motion, and Bed mesh by default when `!printerControls.isActive`.

Camera: `useCameraFrame` sets `cameraFrameUrl` whenever a webcam URL exists and only flips `cameraError` on `<img @error>`. The placeholder (`cameraPlaceholderText`) renders only in the `v-else`. There is no string “No stream” anywhere in `src/`. The Oct 26 print capture shows the Camera card with **Expand** (so `cameraFrameUrl && !cameraError`) and a blank dark 16:9 — that is `.nc-print-camera-panel` (`css/style.scss`, elevated background, `aspect-ratio: 16/9`) with an image that never paints a frame. Empty must say **No stream**. Do not redesign the stream.

E-STOP (`EmergencyStopButton`) is in the main column after Send G-code. The camera lives in the `WorkspaceRail` slot, which is sticky only above 1200px (`WorkspaceRail.vue`; below that the rail is `position: static` and `order: -1`). Progress, last-job summary, camera, and E-STOP need to stay on screen together.

### Behavior

- **Live controls** (`v-if`, not merely disabled) only when `printerControls.isActive` (`printing` | `paused`). One set of Pause / Resume / Cancel, on the sticky cluster. Remove the duplicate row from the Print control card. Command-palette pause/resume/cancel already use `canPause` / `canResume` / `canCancel` — leave those gates.
- **Active job:** sticky cluster shows progress (name, N%, ETA if the detail card is off screen — today’s status-bar split is fine to keep) + camera + E-STOP, plus the single control row. The lower card can keep the stat grid (elapsed, layer, nozzle, bed) and the progress bar. It does not repeat Pause/Cancel.
- **Not active, but a prior filename is still in state** (`error`, `standby`, `cancelled` / `canceled`, and any other non-active connected state): one **Last job** card — filename, progress percent, where it stopped (layer `layer/layerCount` when present, duration when present), and the message. Prefer `printerState.message` (Klipper display message). Show `lastError` when the failure is transport (offline / poll), not instead of `message`. No Pause / Resume / Cancel in the DOM.
- **`complete`:** keep `PrintCompletionBanner` only. Do not also show Last job or the live control card (`showPrintControl` already excludes `isComplete`).
- **Connected, no filename, not active:** keep today’s “No active print” guide (`showIdleGuide`).
- **Print step subtitle** (`workflowStepSubtitle` for `TABS.PRINT`), machine state first, never the raw gcode name:
  - `printing` → `Printing N%` (use the same percent rounding as `PrintTab.progressPercentLabel`)
  - `paused` → `Paused N%`
  - `error` → `Error`
  - connected `standby` / `complete` / `cancelled` / `ready` / anything else non-active → `Idle`
  - `!connected` → `Offline`, or `Reconnecting` when state is `reconnecting`
- **Sticky monitor cluster** on the Print tab, always: progress **or** the last-job one-liner, the camera, and E-STOP. Honor the ≤1200px rail reflow so the cluster does not scroll away on a short window.
- **Empty camera** (no URL, `@error`, or a URL that never paints a frame): the panel text is **No stream**. Keep Expand / fullscreen for a frame that actually loaded. A configured-but-dead URL may still mention that the stream failed; the words “No stream” have to be visible. No new player.
- **Temperature, Manual motion, Bed mesh** default collapsed when `!isActive`. An old `localStorage` `print-temperature=1` must not force Temperature open on an idle machine. While `isActive`, In-print tuning stays the panel that opens (it already does: `open: true`, `when: isActive`).

Do not clear `filename` inside `normalizeMoonrakerStatus` or `PrinterController::normalizeState`. Completion notifications and the Last job card need it. Do not change `printerControls`.

### Acceptance

- [ ] Printer `state` `error` or `standby` or `cancelled`, `connected`, `filename` set, `progress` 0.4: no Pause, Resume, or Cancel buttons in the document. One Last job card shows the name, ~40%, layer if the state has it, and `message`.
- [ ] Same printer with `filename` `""` / null and state `standby`: “No active print” guide, no Last job card, no control buttons.
- [ ] `state === 'printing'`: exactly one Pause and one Cancel. Resume is not a second live pair. Subtitle is `Printing N%`, not the gcode filename. Header chip still says Printing.
- [ ] `state === 'paused'`: exactly one Resume and one Cancel. Subtitle `Paused N%`.
- [ ] `state === 'complete'`: Print complete banner only; subtitle `Idle` (the banner carries the filename).
- [ ] `connected === false` with a stale filename still in the store: subtitle `Offline` or `Reconnecting`, not the gcode name.
- [ ] Camera region shows the text “No stream” when the frame is empty. A painting snapshot still shows the image and Expand.
- [ ] E-STOP, the progress or last-job line, and the camera are visible without scrolling the Print tab on a desktop-height window and at the ≤1200px rail breakpoint.
- [ ] With `!isActive`, Temperature, Manual motion, and Bed mesh render collapsed on a fresh profile (and Temperature stays collapsed even if `print-temperature` was saved open).
- [ ] `npm run test` (vitest) covers the subtitle helper and the show/hide predicate. `make ship` green. Browser check on the lab URL without cancelling a live job.

### Files

| File | Change |
|------|--------|
| `src/components/PrintTab.vue` | Gate `showPrintControl` on `isActive` only. Last job card. Drop the duplicate button row. Camera “No stream”. Collapse the three panels when idle. Move E-STOP into the sticky cluster. |
| `src/components/PrintStatusBar.vue` | Same liveness gate. This is the one control row (or fold it into the cluster and delete the second). |
| `src/components/PrintCompletionBanner.vue` | Leave as the `complete` card. Confirm it does not also mount when you add Last job. |
| `src/store/print.js` | `workflowStepSubtitle` Print branch. Remove `filename` from `printStepEnabled`. Do not strip filename in `_applyPrinterState`. |
| `src/composables/useCameraFrame.js` | Only if detecting a non-painting frame belongs next to `@error`. |
| `css/style.scss` | Only if the placeholder must fill the 16:9 so “No stream” is readable on the dark panel. |
| `src/services/moonraker-ws.js` | No behavior change. Do not drop `filename` on `error`. |
| `lib/Controller/PrinterController.php` | No behavior change. |

### Tests

- New vitest for the Print subtitle matrix (filename + `error` / `standby` / `printing` / `paused` / offline). Prefer extracting the subtitle branch if the store getter is painful to mount; do not fork the rules.
- Source or component assertion that Pause/Cancel are behind `isActive`, not `filename`.
- Existing `src/__tests__/commands.spec.js` pause/resume tests should stay green (they already use `printerControls`).
- `src/__tests__/spacing.spec.js` pins status-bar CSS (sticky `top`, no second progress bar). Update only if the cluster replaces that bar.

---

## PR B — Cold start (Prepare)

**Branch:** `fix/ui-prepare-cold-start` · **bump:** patch · **depends on:** A merged is nice, not required (different files).

### Problem

An empty Prepare tab tells the operator ten things are wrong. The real next action is import.

**Checklist vs advisory.** `prepareChecklist` (`src/store/print.js`) sets `advisory: true` on `target`, `target_online`, and `watertight`. `PrepareChecklist.rowClass` never reads it:

```text
pending → row--pending (muted dash)
else ok → row--ok
else    → row--missing (danger ✗, --nc-gcs-danger-soft)
```

`target_online` has no `pending` flag. A selected printer that is offline is `advisory && !ok` and paints as a red missing row. The Oct 26 capture shows that row red (“Printer unreachable — check network or selection”) under an otherwise ready profile block. After a model is analyzed as not watertight, `watertight` does the same (`pending` is only `!model.file`).

Mesh / preview / watertight **are** `pending: !model.file` in this tree, so an empty bed should already be a muted dash rather than a red ✗. They are still on the “Ready to slice” list, and the live capture reads them as failures next to the real ones. Hide those three until a model is loaded. Do not treat `pending` as the fix.

Real blockers stay red: model missing, slicer offline, missing printer/filament/process profiles, preview blocked or 3MF extract failed **after** a model exists. `isPrepareComplete` is unchanged: still no Moonraker requirement (`workflow-gates.js`).

**Subtitle.** Prepare branch of `workflowStepSubtitle` builds `{model || 'Import a model'} · {printer} · {filament} · {process} → {target} ({state})` whenever all three profiles exist. Replace with the model name, or **No model** when `!model.name`. Profiles stay in the left-rail Profile picker. Printer status stays on the header chip / the one-line connection label from this PR.

**Empty bed.** `ModelViewport.showEmptyDrop` is copy only: “Drop or import a model file” / “STL · 3MF · OBJ”. The primary Import button already lives in the left rail (`PrepareTab.vue`, “Import STL/3MF/OBJ”, plus From Files and Open recent). Add that same primary Import action on the empty bed. Keep native drop (`ModelViewport.onDrop`).

**Volume cage.** `drawBed` in `src/three/viewport.js` adds:

- a yellow (`0xfacc15`) `EdgesGeometry` of the full `BoxGeometry(bx, by, bz)`, centered at `(bx/2, by/2, bz/2)` — all twelve edges, including the top rectangle and the four verticals
- a `GridHelper(Math.max(bx, by), …)` then moved to the plate center — a **square** of the longer side, so a non-square plate overhangs
- no clipping planes on either helper (clipping in this file is only the model section tool)

The Oct 26 empty bed shows those yellow edges running outside the dark plate. Clip or rebuild both so their XY extent stays inside the plate rectangle `[0, bx] × [0, by]`. Do not redesign the viewport, the gizmo, or the camera presets.

**Two connection UIs.** Full Scan + `<select>` + Connect by IP (`TargetPrinterPicker`, `showScan` / `showManualConnect` default true) is mounted in:

- `PrepareTab.vue` — left-rail card “Send-to printer”, `variant="prepare"`
- `PrintTab.vue` — `<MultiPrinterPicker />`, which is `TargetPrinterPicker variant="print"`
- `OverviewTab.vue` — Printer fleet accordion (keep this one)
- `PrePrintModal.vue` — `variant="modal"` and `:show-scan="false"` (keep; it is the send confirmation, not a second fleet console)

`src/__tests__/overview-tab.spec.js` currently **locks the duplication in** (“Print keeps MultiPrinterPicker”, “Prepare keeps its in-flow TargetPrinterPicker”). Update those assertions in this PR.

Prepare and Print should show the printer **name** plus a failure-named status. The header chip is status-only (`printerStatusLabel`). `targetConnectionLabel` is already `{name} · offline|printing|…`. When offline or in error, include `printerState.message` or `lastError` when set, so the line says which failure (unreachable, reconnecting, the Moonraker message) and not a bare red checklist ✗. Changing the target stays on Overview (fleet picker) and in the pre-print modal.

### Behavior

- Empty Prepare (`!hasModel`): checklist does not list mesh, preview, or watertight. Model-loaded is the primary missing row. Slicer-offline and missing profiles still show as real failures when they are actually failing.
- `advisory && !ok` uses amber/neutral (`--nc-gcs-warning` / `--color-warning`, or the existing muted pending treatment). Not `row--missing`. Applies to send-to selected, send-to online, and watertight. `rowMark` should not be a danger ✗ for those.
- `blockingOnly` (Slice tab) keeps hiding rows that are ok; advisory failures stay advisory there too, not red blockers. Do not let an advisory row fail `prepareChecklistProgress` (it already excludes them — keep that test green).
- Prepare step subtitle: model filename, or `No model`.
- Empty-bed overlay: primary Import button wired to the existing file input / `triggerImport`, drop target unchanged, left-rail Import unchanged.
- `drawBed`: grid and yellow volume edges do not extend past the plate in XY.
- Prepare and Print no longer render Scan / Connect by IP / the fleet `<select>`. They show name + status as above. Overview fleet picker unchanged. Pre-print modal picker unchanged.

### Acceptance

- [ ] No model, profiles selected, printer selected but offline, slicer down: the visible failures are model and slicer (and any missing profile). Mesh, preview, and watertight are absent. Send-to online is amber or neutral, with its hint, not a red ✗.
- [ ] Model loaded, mesh analyzed, not watertight: watertight row is visible and amber/neutral, and Slice is not blocked by it (`isPrepareComplete` / `sliceBlockReason` unchanged).
- [ ] Prepare subtitle with a loaded `bracket.stl` is `bracket.stl`. With no model it is `No model`. It does not contain `·` profile names or `→`.
- [ ] Empty bed shows a primary Import control that opens the same picker as “Import STL/3MF/OBJ”. Dropping an STL still loads it.
- [ ] Plate grid and yellow edges stay inside the plate for a square volume and for a non-square one (grid size is `max(bx, by)` today — the non-square case is the overhang).
- [ ] Prepare and Print have no “Scan for printers” and no “Connect by IP”. Overview fleet still has both. Pre-print modal still changes the target without a scan button.
- [ ] Prepare/Print show the printer name and, when offline, a named failure (not only the word Offline on the chip).
- [ ] `overview-tab.spec.js` updated. `prepare-workflow.spec.js` advisory-progress test still passes. `make ship` green. Browser: empty Prepare and a loaded model on the lab URL.

### Files

| File | Change |
|------|--------|
| `src/components/PrepareChecklist.vue` | Honor `advisory`. Hide mesh / preview / watertight when `pending` because no model (or filter them in `displayItems`). |
| `src/store/print.js` | Prepare `workflowStepSubtitle` only. Checklist row flags already exist. |
| `src/components/ModelViewport.vue` | Empty-bed Import button. Emit or call the existing import path. |
| `src/components/PrepareTab.vue` | Wire the bed button to `triggerImport`. Remove the Send-to printer card’s full picker; show name + status. |
| `src/components/PrintTab.vue` | Remove `<MultiPrinterPicker />`. Show the same name + status line. |
| `src/components/MultiPrinterPicker.vue` | Delete only if nothing else imports it. Overview uses `TargetPrinterPicker` directly. |
| `src/three/viewport.js` | `drawBed` clip / rebuild. |
| `src/components/OverviewTab.vue` | No structural change. Fleet picker stays. |
| `src/components/PrePrintModal.vue` | No change beyond not regressing `variant="modal"`. |
| `src/__tests__/overview-tab.spec.js` | Stop requiring the Prepare/Print pickers. |
| `src/__tests__/immersive-layout.spec.js` | Keeps asserting the left-rail Import label; extend it if the bed button is a source-level contract. |

---

## PR C — Start-job paths

**Branch:** `feat/ui-library-forge-entry` · **bump:** minor · **depends on:** B is independent; do not wait on A.

### Problem

Starting a job from an existing part means: gear → Overview → scroll past six accordions → Parts library or Model Forge. Both panels already exist and already drop a model onto Prepare.

The gear is `AppChromeBar.onOverviewClick`: a cog (`NcPrintIcon name="cog"`) that toggles `TABS.OVERVIEW` vs Prepare. `aria-label` / `title` are “Overview — printers, materials, history & more”. There is no visible text and no separate settings menu that contains Library. `PrintWorkflowBanner` is still exactly three steps (Prepare, Slice, Print). Overview is not a fourth step (`overview-tab.spec.js` asserts the banner does not mention `OVERVIEW`). Keep it that way.

`buildCommands` (`src/utils/commands.js`) navigation is only `nav-prepare`, `nav-slice`, `nav-print`. No Library, Model Forge, or Overview. `PALETTE_PANELS` only jumps to Print-tab panels. `App.vue` hotkey `4` opens Overview but the palette cannot.

`NcPrintCollapsible` persists under `nc_print_collapsible_${id}` and exposes `expand()`. Overview ids are `overview-library` and `overview-modelforge` (`OverviewTab.vue`). `saveCollapsibleState` + `setActiveTab(TABS.OVERVIEW)` is enough to deep-link, as long as the collapsible reads storage on mount (it does, in `data()`). If the operator is already on Overview, also call `expand()` on the live instance or the section stays shut — a small event (the Print tab already has `nc-print-focus-panel`) is the right shape. Do not fork `PartsLibraryPanel` or `ModelForgePanel`.

### Behavior

- Prepare’s import section gains a visible control labeled **Library** that opens Parts Library, and a way to open **Model Forge** from that same cluster (second labeled button is fine). Both are on Prepare, not only behind the gear.
- Activating either switches to Overview and expands `overview-library` or `overview-modelforge`. The other Overview sections stay as they are (default closed, fleet default open).
- Achievements, calibration, bed mesh, fleet, history, Print Guard, cameras: no new Prepare buttons.
- Ctrl+K (`buildCommands`) gains, under Navigation:
  - Open Parts Library
  - Open Model Forge
  - Go to Overview
- Each runs the same deep-link as the Prepare buttons. Disabled-state rules are unnecessary; these are always enabled.
- Optional, same PR if it stays a one-line label: give the cog a visible “Overview” label (or change the `title` so it does not read as Settings). Do not add a settings dropdown. Skip if it crowds the workflow steps.

### Acceptance

- [ ] From Prepare, with no Overview visit this session, Library opens Overview with Parts library expanded. Model Forge does the same for its section. Import on the left rail still works.
- [ ] Achievements, Materials & calibration, Printer fleet, and History are not linked from Prepare.
- [ ] Ctrl+K lists Library, Model Forge, and Overview; choosing each lands on the same place as the buttons. Existing Go to Prepare / Slice / Print commands still work (`commands.spec.js`).
- [ ] Workflow banner still has three steps. Gear still toggles Overview.
- [ ] Opening a library STL still calls `setModel` and returns to Prepare (existing panel behavior, do not break it).
- [ ] `make ship` green. Browser: Prepare → Library → open a part → model on the bed, on the lab URL.

### Files

| File | Change |
|------|--------|
| `src/components/PrepareTab.vue` | Library + Model Forge controls in the import section. |
| `src/utils/commands.js` | Three navigation commands. |
| `src/components/CommandPalette.vue` | Only if the new commands need a callback the palette does not pass today. Prefer store + `saveCollapsibleState` so `buildCommands` stays pure. |
| `src/components/OverviewTab.vue` | Listen for an expand event (or equivalent) so an already-mounted section opens. Do not reorder accordions. |
| `src/components/NcPrintCollapsible.vue` | Use existing `expand()`. Change it only if a mounted section cannot be opened from outside. |
| `src/utils/collapsible.js` | Reuse `saveCollapsibleState`. |
| `src/components/AppChromeBar.vue` | Optional visible Overview label. |
| `src/App.vue` | Palette callbacks only if required. Hotkey `4` stays. |
| `src/__tests__/commands.spec.js` | Assert the three new ids and that they `setActiveTab(TABS.OVERVIEW)` (and persist the collapsible id). |
| `src/__tests__/overview-tab.spec.js` | Banner still has three steps. |

---

## Suggested order

A → B → C. A is the safety issue (a paused-looking Cancel on a machine that is not printing). B is the daily empty-bed friction. C is discovery. They touch different components except B removing `MultiPrinterPicker` from `PrintTab.vue`, which A also edits — land A first, then B, so the Print tab is not a conflict.

---

## Footer (not in A/B/C)

`App.vue` footer says `NC 3D Print v{{ version }} · Moonraker + nc-print-slicer` (renamed in 1.64.0). No further footer change.

---

## This plan PR

- Adds `docs/plans/ui-workflow.md` only. No version bump, no `make ship`, no source edits.
- **Sarge merges.** Do not merge this PR in the session that opens it.
- After it is on `main`, implementation starts at PR A (`fix/ui-print-honesty`). Do not start A, B, or C inside the plan PR.
