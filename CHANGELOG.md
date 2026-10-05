# Changelog

## [1.61.1] - 2026-10-05

### Fixed
- The notifier threw `\InvalidArgumentException` for notifications that are
  not ours, which Nextcloud 30+ logs as deprecated on every notification
  poll (about 640 warnings every 10 minutes on 35). It now throws
  `UnknownNotificationException` when that class exists.

### Changed
- Supports Nextcloud 35 (`max-version="35"`); verified on 35.0.1.

## [1.61.0] - 2026-08-06

First-print UX program (waves A–D): fewer gates in the way of a first slice,
guided cold-start, safer send, and faster operator model manipulation.

### Added

- One-click "Ready to print" on the viewport orient pad: auto-orient
  (balanced) → center XY → drop to bed in one action, undoable.
- Arrow-key nudge on Prepare: arrows move X/Y 1 mm (Shift = 10 mm,
  Alt = 0.1 mm), PageUp/PageDown move Z; Ctrl/Cmd+D duplicates the selected
  object.
- Snap preset chips in the Move (0.1 / 1 / 5 / 10 mm) and Rotate
  (1° / 5° / 15° / 45°) tool panels driving the gizmo snap.
- Bed exclusion zones: new "Bed zones" tool draws keep-out rectangles on the
  plate (persisted per-browser); overlapping objects are flagged and Slice
  warns before sending.
- Travel / Seams / Retractions quick toggles on the 3D toolpath preview,
  available in both Feature and Speed color modes.
- Admin settings: discovery subnet (CIDR) field for the LAN printer scan.
- Cold-start setup cards: "No printer connected yet" state in the target
  printer picker (Scan + Admin CTAs) and a "First-print setup" card when the
  slicer is offline or no profiles are loaded.

### Changed

- Prepare completion no longer requires a Moonraker target printer — the
  send-to printer only gates sending/starting, not slicing (checklist rows are
  now advisory).
- Dual-printer language disambiguated: "Slicer printer profile (how it
  slices)" vs "Send-to printer (Moonraker)".
- Successful "Slice now" auto-advances to the Slice tab.
- PrePrint modal offers "Upload only" alongside "Slice, send & start" — an
  offline printer blocks starting but no longer blocks uploading G-code.
- A pending viewport transform is auto-applied at slice time instead of
  blocking the slice behind a manual Apply click.
- Print-tab gate tightened: `moonraker_enabled` alone is no longer enough, a
  configured or selected target printer is required.

### Fixed

- Admin G-code console checkbox no longer pretends to save (it is `occ`-only);
  disabled with an explanatory hint.

## [1.60.14] - 2026-08-03

### Fixed
- App icon redrawn as single-ink `currentColor` silhouette for Nextcloud nav/Settings tinting
- Stopped global `boot()` injection of `nc-print-theme` (theme now loads only on app/admin/dashboard pages)
- Scoped theme tokens to print app roots instead of bare `:root`
- Mapped banner/badge danger/warning colors to Nextcloud `--color-error` / `--color-warning` tokens


## [1.60.13] - 2026-08-03

### Fixed

- Drop PHP `max-version` so the app enables on Nextcloud 34 (PHP 8.5).

## [1.60.12] - 2026-08-03

App Store readiness: CSRF hardening, uninstall cleanup, packaging excludes,
public docs polish, and GHCR slicer workflow stub.

### Security

- Strip `#[NoCSRFRequired]` from all state-changing controller methods (POST/
  PUT/PATCH/DELETE); keep it only on the HTML page GET and selected read-only
  GETs. Frontend raw `fetch` mutators now send `requesttoken`.
- `#[PasswordConfirmationRequired]` on `AdminController::saveSettings`; admin
  UI confirms password via `OC.PasswordConfirmation` before save.
- `#[UserRateLimit]` on printer discovery scans and Moonraker/slicer proxies.

### Changed

- Uninstall drops `ncprint_prints` / `ncprint_spools` / `ncprint_maintenance`
  tables (plus existing appconfig wipe).
- `make appstore` excludes `.github`, `tools`, `scripts`, `src`, entire
  `slicer/`, and docs mesh fixtures (sign still copies `file_from_env.php`).
- Nested `info.xml` `<documentation>` + longer privacy-aware description.
- Neutralize lab host/path examples in README / ADMIN / INSTALL; fix allowed-
  groups docs (empty = admins-only).
- `.github/workflows/docker-slicer.yml` for `ghcr.io/vdroners/nc-print-slicer`
  (engine from tree or release asset); AGPL corresponding-source notes in
  THIRD_PARTY / APPSTORE_ONBOARDING.

## [1.60.11] - 2026-07-17

Hygiene + security truth from the full-audit cleanup. Packaging/docs/CI
hygiene (no behaviour change for P0–P3) plus bounded Moonraker/Admin/session
hardening.

### Security

- **Moonraker proxy is path + method allowlisted.** GET/HEAD keep the existing
  monitoring prefixes; POST is limited to `server/job_queue/` and
  `machine/device_power/` (UI queue + power). PUT/PATCH/DELETE are denied.
  File upload / print start|pause|cancel stay on `PrinterController`.
- **`console_enabled` is occ-only again.** Admin `saveSettings` no longer
  accepts that key (matches SECURITY.md / docs).
- **Session `camera_url` is UrlSafety-checked** at register time (same rules as
  Moonraker URL).
- **SECURITY.md** rewritten to the real model (admin URLs, session discovery
  SSRF posture, proxy method allowlist, slicer prefix allowlist).

### Changed — hygiene

- gitignore + `make appstore` exclude `docs/3D Printing/`, `*.map`, gate stamp.
- Docs truth: VERIFY, FEATURE_PORT, README/INSTALL NC 28–34, screenshots names,
  plans archive + slicer-gui-alignment refresh through 1.60.9.
- Smoke script no longer defaults to `:8766`; release.yml asset/tag naming;
  CI runs `make slicer-test`; forge relay marked deprecated.

### Tests

- ProxyAllowlistTest: method allowlist + session camera UrlSafety source gates.
- AdminControllerTest: saveSettings does not write `KEY_CONSOLE_ENABLED`.
- G45/G49 assert GET/POST method allowlist constants.

## [1.60.10] - 2026-07-16

Two field-of-view fixes reported from live use. Frontend-only.

### Fixed

- **"Printer unreachable" no longer eats the viewport.** The service-health
  recovery card lives in the top chrome (every tab), so when the printer was off
  the full three-step card + Retry pushed the whole view down. It now collapses to
  a compact one-line chip (⚠ + summary + inline Retry) that expands to the full
  recovery steps on click. A healthy lab still shows nothing. Multiple faults
  summarise as "First fault + N more".
- **Model-view tool panel no longer clips off the bottom.** The floating tool
  panel was absolutely positioned with no height cap, so a tall tool's controls
  (arrange, scale, rotate…) ran off the bottom of the viewport with no way to
  reach them. It now caps at the viewport height (`max-height: calc(100% - 16px)`)
  and scrolls its contents.

### Tests

- vitest `viewport-ui-fixes.spec.js`: tool panel caps height + scrolls;
  ServiceHealthBanner renders a chip that expands to the full stack, keeps an
  inline Retry, only shows on a real fault, and summarises 3+ faults. Existing
  chrome-bar contracts still green. Full suite green (499).

## [1.60.9] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 9 (final): AMS flush matrix. Adapter
+ frontend (needs a sidecar rebuild). Multi-material only.

### Added — AMS flush matrix (multi-tool filament picker)

- **Flush matrix** — for a printer profile with more than one extruder, the
  multi-tool filament picker now shows an AMS flush matrix: set each slot's
  colour and compute the purge needed to change from every colour to every other
  (in mm³ or grams), rendered as a green→red heatmap so expensive transitions are
  obvious at a glance. Uses the OrcaSlicer HSV flush model already in the sidecar
  (`color_order.build_matrix`) via a thin new `POST /api/flush/matrix` endpoint —
  no new purge math. The whole panel is gated behind `extruderCount > 1`, so a
  single-extruder printer (e.g. the K1 Max) never sees it — zero regression. If an
  older sidecar lacks the endpoint, the panel shows a rebuild hint instead of
  erroring.

This completes the deferred slicer-GUI alignment tier (parts 1–9, 1.60.1–1.60.9).

### Changed — internal

- Adapter: `POST /api/flush/matrix` returns `{ colors, names, matrix, grams }`
  over `build_matrix` + `flush_grams` (allowlisted as `api/flush`).
- Frontend: `fetchFlushMatrix` in `color-order-api.js`; new `FlushMatrixPanel.vue`
  folded into `MultiToolFilamentPicker`.

### Tests

- adapter `test_adapter.py`: `build_matrix` is NxN with a zero diagonal +
  positive off-diagonals; grams tracks volume.
- vitest `color-order-api.spec.js`: `fetchFlushMatrix` posts to `/flush/matrix`;
  `flush-matrix.spec.js`: adapter endpoint over `build_matrix` + allowlist, panel
  gated behind `extruderCount > 1` with 404 degrade, picker hosts it. Full vitest
  suite green (496); adapter green (61); phpunit green (107).

## [1.60.8] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 8: `.3mf` project save/load
round-trip. Adapter + PHP + frontend (needs a sidecar rebuild + php-fpm
restart for the new route).

### Added — projects

- **Save project (.3mf)** — a "Save project" button on Prepare packs the whole
  scene — every object's geometry (baked transforms), the profile selection,
  global + per-object overrides, the settings mode, pauses, and object names —
  into a standard `.3mf` saved beside the model in Files as
  `<model-stem>.nc.3mf`. The geometry is written by the same tested server-side
  3MF writer; nc-print's own state rides along in an embedded
  `Metadata/nc_print_project.json`.
- **Re-open a project** — importing an `.nc.3mf` (or any 3MF nc-print saved)
  loads the geometry and then rehydrates the selection, overrides, settings mode,
  and per-object settings from the embedded metadata. A third-party 3MF simply
  lacks that entry and imports geometry-only, exactly as before (graceful
  degrade).

### Changed — internal

- Adapter: `stls_to_multiobject_3mf` gained an optional `project_meta` (writes the
  JSON entry); new `POST /api/project/pack` multipart endpoint packs models +
  metadata into a `.3mf` and returns the bytes (allowlisted as `api/project/`).
- PHP: `FileFetchService` factored a shared `writeSibling` out of the gcode-sibling
  write; new `writeProjectSibling` + `GcodeSaveController::saveProject` +
  `files#saveProject` route (delegated from `FilesController`).
- Frontend: `project-api.js` (`packProject` + `saveProjectToFiles`),
  `mesh-convert.readProjectMeta`, store `buildProjectMeta`/`hydrateFromProjectMeta`/
  `saveProject`, and ModelViewport hydration on 3MF import.

### Tests

- adapter `test_adapter.py`: `stls_to_multiobject_3mf` embeds
  `nc_print_project.json` when given `project_meta` and omits it otherwise.
- phpunit `GcodeSaveControllerTest`: `saveProject` forbidden without access,
  requires project bytes, rejects bad base64, requires a model reference.
- vitest `project-roundtrip.spec.js`: adapter pack + metadata, PHP write +
  route, FE pack/save/read + graceful degrade, store build/hydrate/save wiring.
  Full vitest suite green (490); adapter suite green (60); phpunit green (107).

## [1.60.7] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 7: the slice-warnings surface.
Frontend-only (the adapter already emits warnings).

### Added — slice warnings (Slice tab)

- **Warnings panel** — a single panel on the Slice tab consolidates the problems
  that were previously scattered or silent: objects that exceed the build volume,
  a non-watertight mesh (open edges) or steep overhangs from the mesh-health
  analysis, and non-fatal warnings the slicer emits during a slice (e.g. profile
  auto-repairs). Out-of-bed rows are errors (red); the rest are advisories
  (amber). The panel self-hides when everything is clean.
- **Jump to object** — a warning tied to a specific object (out-of-bed) is
  clickable and selects that object, so you can go straight to fixing it.

### Changed — internal

- `defaultSliceJob` seeds a `warnings: []` array; the slice SSE handler now routes
  `stage:'warning'` progress events into it (deduped) instead of overwriting the
  progress stage. New `sliceWarnings` getter merges out-of-bed, mesh-health, and
  slice-time signals into one `{ id, severity, message, hint, objectId? }` shape.

### Tests

- vitest `build-volume.spec.js`: `sliceWarnings` empty by default; surfaces
  out-of-bed with a jump objectId, non-watertight mesh, and deduped adapter
  warnings; `resetSliceJob` clears them.
- vitest `slice-warnings.spec.js` (new): store collects `stage:'warning'` events +
  exposes the consolidated getter; SliceWarningsPanel renders it + jumps to the
  object + self-hides; SliceTab hosts the panel. Full suite green (486).

## [1.60.6] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 6: per-object settings. Frontend-only
(the multi-object slice backend was already wired).

### Added — per-object settings (Prepare)

- **Per-object overrides** — with more than one object on the plate, selecting an
  object reveals a "Per-object" panel where you can override process settings
  (layer height, walls, infill, speeds, supports, …) for THAT object only. Empty
  fields inherit the global setting; a "Clear N" button resets the object back to
  inheriting everything. Reuses the settings-tree mode + search and the shared
  OverrideField control. Temperature/fan/retraction are filament-wide and stay
  global (hidden from the per-object panel).

At slice time each object's overrides are mapped to engine keys (the same mapping
the global overrides use) and sent index-aligned to the object list, so the
slicer writes them into the per-object `Metadata/model_settings.config` of the
multi-object 3MF. The single-object slice path is unchanged.

### Changed — internal

- `_defaultObject` seeds an empty `overrides` map; snapshot/restore (plate switch)
  and the viewport→store scene sync deep-copy it so objects never alias each
  other's settings. The multi-object slice call now passes `objectOverrides`
  (previously omitted), built as `buildSliceOverrides(cleanOverrides(obj.overrides))`
  per object. `cleanOverrides` moved into `slicer-utils.js` (shared) alongside
  `OverrideField`'s new optional `model` binding for per-object editing.

### Tests

- vitest `scene-objects.spec.js`: `_defaultObject` seeds an independent overrides
  map; `addObject` can carry initial overrides.
- vitest `slicer-utils.spec.js`: `cleanOverrides` drops empty/inherit values +
  unchecked support.
- vitest `settings-tree.spec.js`: OverrideField per-object `model` binding;
  PerObjectSettingsPanel binds to the selected object + hides filament-scoped keys
  + only shows for a multi-object scene; store maps per-object overrides through
  buildSliceOverrides index-aligned.
- adapter `test_adapter.py` (existing): per-object keys land under the right
  `<object id>` in the 3MF. Full vitest suite green (477); adapter suite green.

## [1.60.5] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 5: the settings tree. Frontend-only
(no sidecar rebuild).

### Added — settings panel (Prepare)

- **Simple / Advanced / Expert modes** — the advanced settings panel now has a
  three-way detail toggle, matching OrcaSlicer/PrusaSlicer. Simple shows the
  everyday fields; Advanced adds per-feature speeds, shells, support detail;
  Expert reveals everything (overhang speeds, prime tower, bridge, ironing, tree
  support, …). The choice is remembered per user. Simple stays the default, so
  the panel isn't more crowded than before unless you ask for it.
- **Settings search** — a search box filters every field by name (or its group)
  across whatever mode is active, so you can jump straight to "retraction" or
  "ironing" without hunting.
- **Unsaved-vs-preset indicator** — once you load or save a named preset, a dot
  next to its name shows green when your settings match the preset and amber
  ("unsaved changes") once you've edited away from it.

### Changed — internal

- Every override field now carries `level` (basic/advanced/expert) + `group`
  metadata in `OVERRIDE_FIELD_DEFS`. `ProfileQuickEdit.vue` was rewritten from
  ~15 hand-maintained sections into a data-driven list that renders a new
  `OverrideField.vue` per field — the modified-highlight + ⟲ reset chrome that was
  copy-pasted ~55 times now lives in one place. No engine keys or slice behaviour
  changed; the modified/reset logic is untouched.

### Tests

- vitest `slicer-utils.spec.js`: every def has a level+group; `levelVisible` is
  cumulative (expert ⊇ advanced ⊇ basic); `groupsForMode` grows Simple→Expert to
  the full set, preserves group order, drops empty groups; `matchesSearch` by
  label/key/group.
- vitest `build-volume.spec.js`: `settingsMode` defaults to basic + persists +
  rejects junk; `presetDirty` false→true across an edit and resets on load.
- vitest `settings-tree.spec.js` (new): ProfileQuickEdit is data-driven via
  `groupsForMode`/`OverrideField`, has the mode toggle + search, keeps the
  prime-tower group multi-material-gated; OverrideField owns the modified/reset
  chrome; PrepareOverrides shows the unsaved dot. Full suite green (468).

## [1.60.4] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 4: seam + retraction in the g-code
preview. Adapter + frontend (needs a sidecar rebuild).

### Added — g-code preview (Slice tab)

- **Seam markers** — the toolpath parser now recognises the `;SEAM` comment
  slicers emit and drops a marker dot at each layer's seam start. Seams render as
  hot-pink points and are shown by default, so you can see where the nozzle
  starts each perimeter (and judge seam placement) — matching the seam overlay in
  OrcaSlicer/PrusaSlicer.
- **Retraction markers** — pure extruder reversals (negative E with no XYZ move,
  previously discarded) are now captured as cyan marker dots, hidden by default
  (toggle them on from the legend). Handy for spotting retraction-heavy regions.

Both are degenerate two-vertex "dot" segments rendered as `THREE.Points`, so the
positions-are-a-multiple-of-6 contract and the one-speed-per-segment parallel
array are preserved. They're excluded from the color-by-speed range (they're
markers, not extrusion samples). An older sidecar simply omits the keys and the
legend degrades gracefully — same posture as the color-by-speed rollout.

### Tests

- adapter `test_adapter.py`: `seam`/`retraction` are declared feature types; a
  fixture with a `;SEAM` comment + an E-reversal yields degenerate dots at the
  right coordinates, keeps positions%6==0 + one-speed-per-segment, and does not
  skew the extrusion speed range.
- vitest `toolpath-3d.spec.js`: distinct colours + labels for seam/retraction;
  `preview-alignment.spec.js`: adapter detection source + viewport renders them
  as Points with the correct default-hidden set. Full suite green (455).

## [1.60.3] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 3: multi-select in the scene list.
Frontend-only (no sidecar rebuild).

### Added — scene object list (Prepare)

- **Multi-select** — Ctrl/Cmd-click toggles objects in and out of a selection,
  Shift-click selects a contiguous range, and a plain click still single-selects
  (which drives the transform gizmo). Selected rows are highlighted; the matching
  meshes are tinted in the 3D view (the gizmo anchor bright, other members dim).
  A "Delete N" button appears in the list header when more than one object is
  selected.
- **Batch delete** — removes every selected object at once, but never the last
  one standing (the scene always keeps at least one object). The viewport remains
  the source of truth: each mesh is removed there and the store scene re-syncs,
  which also prunes the selection.
- **Off-bed marker in the list** — rows for objects that exceed the build volume
  now show a red left edge, mirroring the v1.60.2 viewport tint.

The transform gizmo still attaches to a single object only (multi-object
move/rotate/scale is intentionally out of scope for this round).

### Tests

- vitest `scene-objects.spec.js`: single-select syncs `selectedObjectIds` as
  `[id]`; ctrl-toggle add/remove moves the anchor; shift-range selects the
  inclusive span; `removeObjects` never deletes the last object; `removeObject`
  prunes the multi-selection.
- vitest `viewport-multiobject.spec.js`: viewport exposes `setMultiSelection`
  without wiring the gizmo to a group; `applyHighlight` precedence is
  out-of-bed > anchor > multi > flat; ModelViewport mirrors the selection + prunes
  on sync. Full suite green (452).

## [1.60.2] - 2026-07-15

Slicer-GUI alignment — deferred tier, part 2: preview + viewport polish.
Frontend-only (no sidecar rebuild).

### Added — g-code preview (Slice tab)

- **Layer band (Top + Bottom sliders)** — the toolpath viewer now has a second
  "Bottom" slider beside the existing "Top" one, so you can isolate a slab of
  layers (e.g. inspect layers 40–60) instead of only capping the top. When the
  bottom is at 0 it behaves exactly as before (single cap + the in-layer "Moves"
  scrubber, which is hidden while a band is active). Backed by a new
  `viewport.setToolpathLayerRangeMinMax(min, max)` that draws one contiguous
  range; the original single-cap `setToolpathLayerRange` is untouched.

### Added — viewport (Prepare)

- **Out-of-bed warning (now includes height)** — objects that exceed the build
  volume on ANY axis, including Z height, are tinted red in the 3D view.
  Selection (green) still takes precedence. The "Bed" badge on the Ready-to-slice
  card now reports how many objects are off the bed (e.g. "2 objects off bed"),
  and the overall fits-bed check finally accounts for build height — a model that
  fits the footprint but is too tall is now correctly flagged. The tint + flag
  refresh on load and after every move/scale.

### Tests

- vitest `build-volume.spec.js`: `fitsBed` includes Z (fits when footprint AND
  height fit; fails on height-only overflow; tolerates a 2D bbox).
- vitest `preview-alignment.spec.js`: viewport exposes the min–max band method
  (and retains the single-cap one), Toolpath3D wires the bottom slider, viewport
  tints out-of-bed objects with the Z-max clause. Full suite green (444).

## [1.60.1] - 2026-07-13

Slicer-GUI alignment — deferred tier, part 1: calibration suite (verify + two
new generators). Adapter-only (needs a sidecar rebuild); the Overview →
Calibration panel is data-driven and picks the new tests up automatically.

### Added — calibration generators

- **Tolerance / fit test** — a strip of stepped-clearance square holes sized for
  a peg. Print it, drop your peg (or part) in, and read off the tightest cell it
  fits — that clearance is the fit your printer actually holds, for press/slip/
  free fits on functional parts.
- **Input shaping / ringing tower** — a wall printed with speed and acceleration
  ramping up its height (Klipper `SET_VELOCITY_LIMIT` / Marlin `M201`/`M203`).
  Ghosting past the sharp corner reveals resonance; re-run with the input shaper
  enabled to confirm the tuning. Visual ringing tower, not an ADXL sweep.

Both emit the standard `; CALIBRATION:<type>` header + `CALIBRATION_END` marker
so the print tracker recognises them, and expose their tunable params in the
existing Calibration panel form. The seven prior generators (temp tower,
retraction, flow, pressure-advance tower + line pattern, first-layer, max-flow
speed) are unchanged.

### Tests

- adapter `test_adapter.py`: catalog now lists nine generators; new
  `test_tolerance_and_input_shaping_generators` smoke-tests both (header + end
  marker + positive filament/time, Klipper vs Marlin limit commands, range
  validation). Full adapter suite green (58).

## [1.60.0] - 2026-07-13

Slicer-GUI alignment — Preview (4th/final of the multi-part round). Adapter +
frontend (needs a sidecar rebuild).

### Added — g-code preview (Slice tab)

- **Color-by-speed** — a "Color by: Feature | Speed" toggle on the toolpath
  viewer. Speed mode recolors every extrusion by print speed across a
  blue→cyan→yellow→red ramp with a min–max mm/s legend, matching OrcaSlicer/
  PrusaSlicer/Bambu. The sidecar (`gcode_toolpath.py`) now captures the sticky
  feedrate and emits a per-segment `speeds[]` array + a `speed_min/max` range;
  `viewport.showToolpath` gains a `colorMode` and builds a per-vertex color buffer
  in speed mode (feature mode is unchanged and stays the default). If an older
  sidecar returns no speeds, the toggle disables and it falls back to feature
  color — so a frontend deploy can't break against an un-rebuilt adapter.
- **In-layer "moves" slider** — a second scrubber that reveals extrusion segments
  one at a time within the current top layer (viewport `setToolpathMoveRange`,
  extending the layer draw-range), like the sequential slider in desktop slicers.

### Tests

- adapter `test_adapter.py`: per-segment `speeds` (len×6 == positions), F→mm/s
  conversion, `speed_min/max` range excluding travel.
- vitest: `colorForSpeed` ramp (blue↔red ends, clamp, zero-span), `fetchToolpath`
  carries speeds + range (and omits range on an old build); `preview-alignment`
  source-regex for the color-by control, move slider, viewport colorMode, adapter
  speeds. Full suite green (437).

## [1.59.0] - 2026-07-12

Slicer-GUI alignment — Workflow (3rd of the multi-part round).

### Added — Prepare tab

- **Persistent print estimate** on the Slice-input card: print time / filament /
  est. cost from the last completed slice, or a rough pre-slice time band
  (`estimatePrintTimeBand`) when nothing's been sliced yet — so the estimate no
  longer hides behind the Slice tab, matching every desktop slicer's always-on
  readout.
- **One-click "Slice now"** on Prepare — runs the EXISTING store slice action
  (single-sourced SSE/progress/ETA; not a re-implementation), with a live
  Cancel (%) while slicing. No forced tab hop.

### Tests

- vitest `workflow-alignment`: SliceSummaryCard surfaces the estimate
  (lastCompletedSliceStats + estimatePrintTimeBand + formatPrintTime) and the
  Slice-now button reuses `sliceOnly` + AbortController + cancel/disabled gating.
  Full suite green (429).

## [1.58.0] - 2026-07-12

Slicer-GUI alignment — Viewport (2nd of the multi-part round).

### Added — Prepare viewport

- **Persistent camera view-cube** — an always-visible corner cluster
  (Iso / Top / Front / Right / Fit), the standard slicer nav affordance. The
  camera presets already existed end-to-end but were buried inside the transient
  "View & section" tool; now they're one click away any time. New
  `ViewportCameraCube.vue` → `@camera` → existing `onCamera` →
  `viewport.setCameraPreset`.
- **Scene-tree right-click context menu** — right-click any object in the Objects
  list for Select / Duplicate / Center on bed / Rename… / Delete, matching every
  desktop slicer's object-list. Reuses the existing duplicate/delete emits +
  store `renameObject`; delete guards the last object.

### Tests

- vitest `viewport-alignment`: camera-cube presets + `@camera` wiring + immersive
  docking; scene-list context menu actions + rename/guard; PrepareTab `@center`
  handler. Full suite green (427).

## [1.57.0] - 2026-07-12

Settings-UX alignment with mainstream slicers (1st of a multi-part GUI-alignment
round; see docs/plans/slicer-gui-alignment.md for the full ~15-item gap report).

### Added — Prepare override panel

- **Quality preset row** — a one-click Draft / Standard / Fine selector above the
  overrides (sets layer height 0.28 / 0.20 / 0.12), the way Cura/OrcaSlicer lead
  with a quality pick before any advanced settings.
- **Modified-value highlight + reset-to-default** — any override that differs from
  the selected profile is highlighted (accent label + border) with a per-field ⟲
  reset button; a "Reset all to profile" action and a "modified" dot on the
  Override-settings toggle. Covers ALL ~55 fields (basic + advanced), keyed to the
  engine settings via a new `mergedToOverrideFormFull` (source of truth:
  `overrides.py _MAP`), so the highlight reflects the real profile baseline.

### Changed

- `slicer-utils.js`: `OVERRIDE_FIELD_DEFS` now carries each field's `engineKey` +
  `type`; new `mergedToOverrideFormFull`, `isOverrideModified`, `QUALITY_TIERS`
  (the existing `mergedToOverrideForm` is untouched — kept the basic mapping +
  its tests green). Store: `overrideDefaults` getter + `resetOverrideField`,
  `resetAllOverrides`, `setQualityTier` actions (reuse `applyProfileDefaults`).

### Tests

- vitest: `mergedToOverrideFormFull` (advanced keys + pct/bool/str normalize),
  `isOverrideModified` (empty=not-modified, diff=modified), `QUALITY_TIERS`; store
  reset/quality actions revert to the profile baseline. Full suite green (423).

## [1.56.0] - 2026-07-12

Prepare-tab tool expansion — CSG mesh tools, multiple build plates, and a
continuity pass. (Support/seam painting + variable layer height deferred — they
need per-triangle/per-layer 3MF encoding proven on the engine first.)

### Added — new Prepare tools

- **Drill** — pick a face and bore a cylindrical hole (diameter / depth / through)
  via CSG subtraction along the face normal.
- **Hollow** — shell a solid model to a wall thickness (with a too-thin guard) to
  save filament, with an optional drain hole.
- **Emboss / deboss** — type text, click a face, and add it raised (CSG union) or
  recessed (CSG subtract) at a chosen size/depth. Bundled font (helvetiker).
- **Measure** — click two surface points for a distance readout; live bounding-box
  dimensions shown.
- **Arrange all** — lay every object on the plate out without overlap (client-side
  shelf packer), complementing the slice-time engine arrange.
- **Multiple build plates** — a plate-tab strip above the viewport; each plate is
  an independent scene (its own model/objects/slice), switch between them and slice
  each separately (lightweight switcher; per-plate scene snapshot).

### Changed

- New CSG capability: `three-bvh-csg` + `three-mesh-bvh` (pinned to the line
  compatible with three 0.170) + `src/services/mesh-boolean.js`
  (subtract/union/intersect/makeCylinder), used by drill/emboss/hollow.
- Tool rail regrouped by kind: Modify now holds cut/drill/hollow/emboss; a
  View/utility group holds view/measure/arrange. A unified canvas pick-mode
  dispatcher drives all face-based tools (place-on-face/drill/emboss/measure).
- Continuity: the new baked ops mark the mesh dirty + auto-apply through the same
  `applyMeshSnapshot` path as the existing plane-cut, so they flow into slicing
  consistently.

### Tests

- vitest: mesh-boolean (subtract opens a hole, union, cylinder), mesh-hollow
  (two-shell + too-thin guard), mesh-arrange (no overlap + overflow), mesh-emboss
  (text mesh + empty guard), plate store (add/switch/remove independent scenes),
  expanded rail/panel palette assertions. Full suite green (419).

## [1.55.0] - 2026-07-12

New **Overview** management console + Prepare-tab polish + four 3DPrintForge-
inspired management pillars. nc-print becomes "more than a slicer."

### Added — Overview tab (management console)

- A new **Overview** tab (gear button in the chrome bar, hotkey 4) that holds
  everything that isn't the current print project. It is NOT a linear workflow
  step — the Prepare · Slice · Print banner is unchanged. Reached any time; the
  app now **remembers your last-active tab** across navigation (per user), falling
  back to Prepare when a gated tab (Slice/Print) isn't reachable.
- **Printer fleet** — the printer picker/discovery as a management view.
- **Filament inventory** (new, standalone) — a spool library in Nextcloud's own
  DB: brand / material / colour / weight remaining / cost / location, with
  remaining-% bars, low-stock badges, add/edit/delete, and a totals summary. New
  `oc_ncprint_spools` table + `/api/filament` CRUD.
- **History & analytics** (new dashboard) — totals (prints, success rate,
  filament kg, print-hours, est. cost), a weekly prints trend, per-material and
  per-printer breakdowns, over the existing print history. New
  `/api/history/analytics`.
- **Maintenance / wear** (new) — component-lifetime tracking (brass/hardened
  nozzle, PTFE, belts, plate, lubrication) with percent-used bars + "replace by"
  status from tracked print-hours, and a replacement log. New
  `oc_ncprint_maintenance` table + `/api/maintenance`.
- **Achievements** (new, per Nextcloud user) — 15+ milestones derived from your
  print history (first print, N prints, kg filament, materials/printers explored,
  print-hours, success-rate), with earned/in-progress grid + XP. Computed on the
  fly (no per-print storage). New `/api/achievements`.
- **Materials & calibration** and **Cameras** sections (relocated here; cameras
  stay on Print too).

### Changed — Prepare tab

- **Clear** now asks for confirmation AND actually clears the 3D viewport (the
  rendered mesh was left behind) and discards any stale slice result.
- **Model appearance**: the View tool gains a colour picker + opacity slider for
  the model mesh; the choice is remembered across sessions.
- Layout polish: the top chrome bar is thinner (less blank space, sits higher);
  **Open recent** moved into the Import section; the right "Ready to slice" panel
  is narrower to free viewport width.
- **Relocations**: Materials/Calibration moved off Slice, durable History moved
  off Print — both now live in Overview. Per-job panels (Arrange, Pause, Colour
  order) and live panels (queue, tuning, temps, recent-jobs strip) stay put.

### Improved — mesh repair

- The Repair tool now closes larger holes (centroid-fan for big loops), splits
  non-manifold edges (shared by >2 triangles) so they stop being rejected, and
  reports precisely what was fixed vs what remains (open edges / non-manifold /
  overhang). `analyzeMesh` now also reports `nonManifoldCount` and only calls a
  mesh watertight when it is both closed and manifold.

### Tests

- vitest 407 green (new overview-tab source-regex; store: tab-persistence,
  clearModel-resets-slice, viewPref persistence; mesh repair: centroid-fan large
  holes, non-manifold split, nonManifoldCount).
- phpunit 103 green (new OverviewPillarsTest: achievements derivation, filament
  validation/rollup, maintenance percent-used).

## [1.54.0] - 2026-07-12

Prepare-tab controls overhaul — relocate the floating buttons into docked boxes,
fix the workflow bar clipping, make Undo slice-aware, and give Auto-orient modes.

### Fixed

- **Workflow bar clipped behind the floating menus on scroll.** The sticky chrome
  was `z-index:3` but the immersive side cards + tool rail are `z-index:6`, so
  they covered it while scrolling. Chrome is now `z-index:20` (still below modals).
- **Undo looked broken after slicing.** Undo/redo was transform-only, so pressing
  Undo after a slice did nothing. Undo is now slice-aware: the first press clears
  the last slice result (back to the un-sliced model), then subsequent presses
  unwind move/rotate/scale. New `hasSliceResult` / `canUndoAny` store getters gate
  the button so it's never enabled-but-inert.

### Changed — Prepare tab layout

- **Import STL/3MF/OBJ · From Files · Clear** moved off the viewport center into a
  collapsible **Import model** section in the left panel.
- **Undo / Redo / Reset** are now a small **History box** docked in the top-right
  of the viewport (`ViewportHistoryBox`).
- **Center · rotate X/Y/Z · Lay flat · Scale to fit** are now a keypad-style
  **Orient pad** docked in the bottom-right of the viewport (`ViewportOrientPad`).
- The old floating `ViewportToolbar` shrank to just the model-info line +
  auto-apply/Apply, docked as a small top-center chip.
- **Auto-orient** moved into the **Orient** rail group with three modes: Default
  (balanced), Minimize supports (least overhang), Minimize footprint (flattest /
  most bed contact). `autoOrient(positions, indices, {mode})` scores the six
  axis-aligned rotations per mode.
- Below 1200px everything falls back to the static column flow (unchanged).

### Tests

- vitest: `autoOrient` mode param (default/supports/footprint) + footprint lays a
  tall box flat; store `undoTransform` clears a done slice first then unwinds,
  `canUndoAny` true when a slice exists; immersive-layout source-regex for chrome
  z-index > 6, import-in-left-panel, docked history/orient boxes, 3-mode
  auto-orient panel. Full suite green (392).

Plan: `docs/plans/prepare-controls-overhaul.md`.

## [1.53.1] - 2026-07-12

Fix slicing failing with "unknown printer preset: 'Default Printer'" → "could not
read the model" — the UI could select a non-sliceable printer.

### Fixed

- The engine's profile list includes a built-in **"Default Printer"** placeholder
  that has no machine preset on disk, so the slice path (which resolves presets
  from the on-disk tree) raised "unknown printer preset" and the whole slice
  aborted with "could not read the model". If the picker defaulted to it (or a
  stale selection named it), slicing was broken end-to-end and no toolpath ever
  rendered.
- **Adapter** (`/api/profiles`): the slim list now drops printer profiles that
  have no on-disk machine preset (`_sliceable_profiles` cross-references the
  `PresetIndex`), so the picker only ever offers printers that will actually
  slice. Process/filament profiles still pass through (they're
  compatibility-repaired against the chosen printer at slice time).
- **Store**: `_validateProfileSelection()` (run after `restorePrefs` in
  `loadProfiles`) re-picks a real default for any saved printer/filament/process
  id that is no longer in the loaded lists — so a stale "Default Printer" in
  localStorage self-heals instead of failing the next slice.

Verified: slicing the same model through the adapter with a real preset
(`Creality K1 Max (0.4 nozzle)`) completes end-to-end (done, 695 KB g-code,
22.9 g filament) where "Default Printer" failed identically for every model.

### Tests

- adapter: `_sliceable_profiles` drops the unresolvable printer, keeps real ones
  + all process/filament.
- vitest: `_validateProfileSelection` re-picks a real printer/filament when the
  saved one is gone; leaves a valid selection untouched. Full suite green.

## [1.53.0] - 2026-07-11

Full-bleed "immersive" Slice preview — the sliced toolpath fills the background,
mirroring the immersive Prepare tab.

### Changed — Slice tab

- The Slice tab now uses the same immersive studio layout as Prepare: the 3D
  g-code toolpath viewer (`Toolpath3D`) fills the whole studio area as an
  orbitable background, with the layer slider + feature-color legend floating as
  a blurred bottom bar. Before slicing (or while slicing) the center shows a
  contextual empty state.
- Workflow + slice actions (checklist, Slice card + actions, handoff, settings
  hint, arrange/pause/color/calibration/material) float on the **left**; slice
  results (review, `SliceResultTabs`, job history) float on the **right** — both
  independently-scrollable blurred overlay cards. Replaces the old
  `WorkspaceRail` two-column split with the buried Toolpath3D tab.
- `Toolpath3D` gained a reversible `mode` prop (`panel` | `immersive`); immersive
  fills its parent (`inset:0`) and floats the controls as a bottom bar.
- Below 1200px both fall back to a static column flow (overlays are unusable on
  narrow screens) — same breakpoint as Prepare.

### Tests

- vitest `immersive-layout`: SliceTab reuses the immersive layout with Toolpath3D
  as the center background and left/right floating cards; Toolpath3D exposes the
  immersive mode with a floating bottom control bar + narrow-screen fallback.
  Full suite green (381).

## [1.52.2] - 2026-07-11

Fix the blank camera view — resolve a fetchable snapshot URL, auto-discovering
one from the printer when none is configured.

### Fixed

- The camera view was blank because no camera URL was configured and nothing
  auto-discovered one. `ConfigService::resolveCameraUrl*` now falls back to the
  printer's Moonraker `/server/webcams/list` when no per-printer/global
  `camera_url` is set, preferring each webcam's `snapshot_url` (a single JPEG —
  what the `/api/camera/frame.jpeg` proxy expects) over its MJPEG `stream_url`.
  The discovered URL is cached in app config (`moonraker_camera_url_discovered`)
  so Moonraker isn't queried on every frame, and it stays server-side proxied —
  the browser never sees the raw LAN address.

### Tests

- phpunit `ConfigServiceRoutingTest`: configured value wins over discovery;
  auto-discovers + caches the snapshot URL when unset; uses the cache on the next
  call (no re-fetch); returns empty (clean degrade) when no webcam and no config.
  Added OCP `Http\Client` stubs (`IClientService`/`IClient`/`IResponse`).

## [1.52.1] - 2026-07-11

Fix "Slicer offline / timed out" — slim the profiles payload.

### Fixed

- Loading profiles could time out ("timed out after 5002ms with 0 bytes") even
  though the sidecar was healthy. Cause: the profile list had grown to ~4.9 MB
  (609 presets × the full resolved `settings` inlined per row — bloated by the
  Creality + OrcaFilamentLibrary imports), which the browser couldn't download
  inside its request timeout over the network.
- The adapter's `/api/profiles` now returns a **slim list** (id / name / vendor /
  kind / is_default; ~50 KB) and exposes the full per-profile `settings` on demand
  via a new `/api/profile-settings?kind=&name=` endpoint. The store hydrates the
  full settings only for the **selected** printer/filament/process
  (`hydrateSelectedSettings`, called on load + profile change) — everything that
  reads `.settings_json` (override defaults, bed volume) keeps working.
  `fetchProfiles` also gets an explicit 30 s timeout as a belt-and-braces guard.

### Tests

- adapter: `slim_profile` drops `settings`; `find_profile_settings` by name/kind.
- vitest: `fetchProfiles`/`fetchProfileSettings` params + timeout; store
  `hydrateSelectedSettings` stamps the selected trio, is idempotent, best-effort.
  Full suite green (379).

## [1.52.0] - 2026-07-11

Full-bleed "immersive" Prepare layout — the 3D viewport fills the background with
the panels floating over it (Creality/OrcaSlicer feel).

### Changed — Prepare tab

- The 3D viewport now spans the whole studio area as the background; the
  profiles/mesh panels (left) and checklist/summary (right) float over it as
  independently-scrollable, blurred overlay cards. The import toolbar floats
  top-center; the tool rail + tool panel offset inboard so they clear the side
  cards. Implemented as a reversible `mode="immersive"` prop on
  `PrepareStudioLayout` (default `studio` keeps the old 3-column grid).
- Below 1200px the immersive layout collapses back to the stacked-column flow
  (floating overlays are unusable on narrow screens). Overlay cards use
  `overscroll-behavior: contain` so wheel-scrolling inside a card doesn't chain
  into the page. The viewport canvas follows via its existing ResizeObserver —
  no viewport.js change.

### Tests

- vitest `immersive-layout.spec` (mode prop, viewport fill, floating scroll-
  contained cards, <1200 fallback, rail/panel offset). Full suite green (372).

## [1.51.0] - 2026-07-11

Import the operator's Creality K1 Max filament/process library into the engine,
and make operator presets on the persistent volume actually load.

### Added

- **`import_creality_profiles.py`** (adapter): rebases Creality Print delta-only
  presets onto engine bases and writes them to the persistent operator volume.
  Creality presets only store the *delta* from a Creality base that this engine
  doesn't ship, so each is flattened + re-pointed at an engine base that exists
  (`Generic <material>` for filament; `0.20mm Standard @Creality K1Max (0.4
  nozzle)` for process), marked `compatible_printers = ["Creality K1 Max (0.4
  nozzle)"]`, and stamped `type`/`instantiation`/`from`. Idempotent, with a
  per-file imported/skipped report. From the user's library: **9 filament + 5
  process imported**; 3 skipped (2 target a different printer — K1C — and 1 is an
  empty delta).

### Fixed

- **Operator presets on the mounted volume were never loaded.** The engine's
  data_dir is tmpfs re-seeded from the baked image every boot, and the entrypoint
  only `mkdir`'d `user/` — it never copied the persistent `/data/user-profiles`
  volume in. It now lays `/data/user-profiles/{filament,process,machine}/*.json`
  into the engine's `user/default/…` on every boot, so operator/imported presets
  survive restarts and appear in the profile dropdowns.

### Notes

- The K1 Max **machine** profile already ships in the engine (bed 300×300×300;
  live scan 308×308×315 after v1.50.1) — no machine import needed.
- Models/ and Gcode/ from the packaged folder are reference only, not imported.
  Inventory + rationale: docs/plans/creality-import-inventory.md.

## [1.50.1] - 2026-07-11

Fix wrong build volume on the Prepare tab (reported: K1 Max shown as 220×220).

### Fixed

- The Prepare bed + "model may exceed build volume" check used the wrong bed
  size. The `buildVolume` getter looked for a `buildVolume` array on
  `settings_json` — a key/shape that never exists — so it always fell back to
  220×220×220, even for a Creality K1 Max whose real bed is 300×300×300 (scanned
  ≈306×306×305). It now resolves in order: the **connected printer's live scanned
  bed** (Moonraker `toolhead` axis extent, already in `printerCapabilities`) →
  the selected **profile's bed** parsed from `settings.printable_area` +
  `printable_height` → the 220 default. A legacy explicit `buildVolume` array is
  still honoured. New pure `utils/bed-shape.js` (`parsePrintableArea`) does the
  polygon parse. Fixes the false "exceeds build volume" warning and makes
  Scale-to-fit / Center-on-bed use the real bed.

### Tests

- vitest `bed-shape.spec` (square/non-square/float/origin-offset/garbage) and
  `build-volume.spec` (scanned > profile > default resolution order). Full suite
  green (367).

## [1.50.0] - 2026-07-11

Multiple build plates (Group 3, final) — arrange and slice several plates in one
session, one g-code per plate.

### Added — multi-plate

- **Plate tabs** in Arrange plate: add/remove plates, switch between them, and
  move a model to another plate. Each plate keeps its own model list (with the
  existing per-object overrides); plate 1 also carries the current prepared
  model.
- **Slice N plates**: slices each plate as its own job sequentially (respecting
  the engine's concurrency cap) and accumulates one downloadable g-code per plate
  (`sliceJob.plates[]`, named `<model>-plateN.gcode`). Multi-model plates still
  auto-arrange within that plate; single-model plates skip arrange. A failed
  g-code download marks that plate's error without aborting the batch.

### Notes

- This is the pragmatic multi-plate path: N independent slice jobs → N g-code
  files (sent to the printer per plate), which matches the app's "one job = one
  g-code" model. A true single multi-plate 3MF project (one file, N plates) needs
  the engine's `--export-3mf`, which crashes in this fork build — deferred and
  documented.

### Tests

- vitest `plate-batch.spec`: batch reset, per-plate accumulation + gcode download,
  distinct plate filenames, per-plate download-error isolation, finish marks
  done. Full suite green (355).

## [1.49.0] - 2026-07-11

Import filament settings from an OrcaSlicer / Bambu preset (Group 3).

### Added

- **Import filament .json** button in Override settings (Prepare). Load an
  OrcaSlicer/Bambu filament preset and its recognised values (nozzle temp, bed
  temp, fan max speed, retraction length/speed) populate the override form;
  unmapped keys are ignored and reported in the toast. Parsed **entirely in the
  browser** — no upload, no new adapter endpoint, no proxy-allowlist change, so
  no added server attack surface. Input is size-capped (256 KB), JSON-validated,
  must be an object, and only whitelisted keys are applied (Orca array-valued
  fields take index 0).

### Tests

- vitest `filament-import.spec`: array + scalar values, first-bed-temp-wins,
  ignored-keys reporting, no-recognised-keys warning, invalid-JSON / non-object /
  oversize rejection, non-numeric ignored. Full suite green (350).

## [1.48.0] - 2026-07-11

Build-plate selector + read-only nozzle diameter (Group 3, Prepare settings).

### Added — build plate

- A **Build plate** dropdown in the profile picker sets the plate type per job
  (Cool / Engineering / High Temp / Textured PEI / Textured Cool / Smooth PEI
  Plate, or Profile default). It flows through the override pipeline as
  `curr_bed_type` (process-scoped), which selects the matching filament per-plate
  temperature + adhesion behavior. The adapter whitelists the enum values and
  drops anything unrecognised (engine keeps its default), so a bad value can
  never corrupt the preset.

### Changed — nozzle diameter (read-only, by design)

- Nozzle diameter is shown read-only in the printer spec chip (e.g. "0.4 mm
  nozzle") rather than offered as a free per-job override. Changing only the
  diameter without the co-varying line widths / volumetric limits / pressure
  advance would produce physically wrong g-code, so nozzle changes go through the
  printer profile. Documented in `docs/LIMITATIONS.md`.

### Tests

- adapter: `bed_type` → `curr_bed_type`, unknown value rejected, empty omitted.
- vitest: `buildSliceOverrides` maps `bedType`; `mergedToOverrideForm` seeds it
  from `curr_bed_type` / `default_bed_type`. Full suite green (341).

## [1.47.0] - 2026-07-11

Multi-object 3MFs load as independent objects (Phase 3e) — completes the
multi-object editor rework.

### Added

- A multi-object 3MF now loads as **one movable object per build item** instead
  of a single merged mesh, so each part is independently selectable /
  transformable / cuttable and slices with the multi-object baked path (3d). New
  `parse3mfMeshes()` emits one mesh per printable build item (honoring
  `selectedIds` + the printable flag); the viewport loads each as its own object.
  3MFs without build items still load as a single merged mesh (fallback).

### Tests

- vitest `mesh-convert.spec`: `parse3mfMeshes` returns one mesh per item, carries
  each item's build transform, honors `selectedIds`, and falls back to one mesh.
  Full suite green (339).

### Multi-object editor rework — complete (3a–3e)

Load multiple objects (STL drops or a multi-item 3MF), click to select, move /
rotate / scale / duplicate / delete each independently, cut one into two movable
halves, and slice them all with the placed layout preserved.

## [1.46.0] - 2026-07-11

Multi-object slicing (Phase 3d) — a multi-part scene now slices with each part
kept exactly where you placed it. This makes the multi-object editor (3a–3c)
actually printable.

### Added — multi-object slice

- **Apply for slicing** now bakes every scene object (its world transform into
  the STL vertices) into per-object STL files (`sceneSliceFiles`) when the scene
  has more than one object. The slice path branches: >1 object → `sliceStreamMulti`
  with **arrange:false** so the engine keeps the placed layout; single object →
  the existing path, unchanged.

### Fixed — adapter (nc-print-slicer)

- The slicer adapter no longer **forces** plate arrangement for any multi-model
  request. `do_arrange` now honors the client `arrange` flag, so a baked-in-place
  multi-object slice (`arrange=0`) preserves the user's layout, while the
  arrange-plate flow (`arrange=1`) still auto-lays-out. Multi-object 3MFs are
  written with identity build-item transforms (placement lives in the baked
  vertices).

### Tests

- adapter: `test_multiobject_3mf_has_all_objects` now also asserts every build
  item is at identity (layout comes from baked vertices, not engine arrange).
- vitest `slice-multi.spec`: arrange=0 vs arrange=1 flag, one model part per
  object. Full suite green (335); adapter suite runs against the rebuilt sidecar.

## [1.45.0] - 2026-07-11

Plane cut into two independent parts (Phase 3c) — the long-standing gap where a
cut discarded one half and left the kept half unmovable.

### Changed — cut

- The plane-cut **keeps BOTH halves by default**, each as its own selectable,
  movable object. After a cut you can drag, rotate, scale, or delete either part
  independently and slice them together. The Keep control now offers **Both
  parts** (default) / Bottom only / Top only (the single-half behavior is
  preserved for when you really do want to discard a side).
- Implemented via `cutMeshBothHalves` (both sides clipped + capped in one pass)
  and a new viewport `addObjectFromMesh`; `ModelViewport.cutMesh` removes the
  source object and adds the two halves, then re-selects one. Empty-side cuts
  (plane grazing/outside the model) fall back with a clear message.

### Tests

- vitest `prepare-tools.spec` gains `cutMeshBothHalves` coverage (both halves on
  correct sides, together cover the original extent, valid indexed meshes,
  empty-side → null). Full suite green (332).

## [1.44.0] - 2026-07-11

Multi-object editor — selection + object list (Phase 3b). You can now load more
than one object, click a part to select it, and move/duplicate/delete each
independently.

### Added — viewport multi-object

- The 3D viewport holds N objects instead of one. `modelMesh` is now a live
  ALIAS to the selected object, so every existing single-object path (gizmo,
  clip, section, transform, export-selected) operates on the selection unchanged.
- **Click a part to select it** (raycast pick). The selected object gets a subtle
  emissive highlight and the gizmo attaches to it; clicking empty space in a
  multi-object scene deselects. Selection is two-way with the object list — the
  store is the single source of truth.
- **Object list** (`SceneObjectList.vue`) in the Model & profiles panel: lists
  every object; row-click selects, with per-row **duplicate** and **delete**
  (delete disabled when only one remains).
- Duplicate clones the selected geometry to a new, staggered, selected object;
  newly-added objects auto-stagger so they don't spawn inside an existing one.
- Gizmo lifecycle hardened: all attach/detach routes through one
  `selectObjectById`, and `removeObjectById` detaches before disposing — no stale
  attach to a freed mesh. Ids stay in lockstep because the viewport owns object
  identity and the store mirrors it (`_syncSceneFromViewport`).

### Notes

- Slicing still uses the single/merged path; per-object baked multi-slice lands
  in 3d (next). Cut still keeps one half — cut-into-two-parts is 3c.

### Tests

- vitest `viewport-multiobject.spec` (handle API present; gizmo detach-before-
  dispose + single-attach-path invariants; store↔viewport sync). Full suite
  green (328).

## [1.43.0] - 2026-07-11

Multi-object editor — foundation (Phase 3a of the Prepare rework). No visible
change yet; this lands the data model the viewport selection UI (3b) and
cut-into-two-parts (3c) build on.

### Added — scene model (internal)

- Store gains a `objects[]` scene array + `selectedObjectId`, each object
  carrying its own `{ id, name, sourceKind, position, rotation, scale, bbox,
  triangleCount, visible }`. `meshState` stays the reactive single-object
  transform and continues to drive all existing reads; for now the selected
  object mirrors it (single object = one entry), so nothing changes on screen.
- Scene actions: `addObject` / `removeObject` / `duplicateObject` / `selectObject`
  / `clearSelection` / `renameObject` / `setObjectTransform` / `clearScene`, plus
  getters `selectedObject` and `isMultiObject`. Loading a model seeds one
  selected object; clearing empties the scene.

### Tests

- vitest `scene-objects.spec` (seed-on-load, add/select/remove/duplicate,
  transform mirroring, multi-object flag, clear). Full suite green (323).

## [1.42.0] - 2026-07-11

Prepare-tab editor: undo/redo + ~10 more transform tools (Creality/Orca-style).

### Added — undo/redo

- **Undo / redo for model transforms.** A bounded (50-step) snapshot stack of
  the move/rotate/scale/mirror/cut/lay-flat/auto-orient state. Toolbar **↶ Undo /
  ↷ Redo** buttons (enabled state reactive) plus **Ctrl+Z** / **Ctrl+Shift+Z**
  (only on the Prepare tab). Pure `utils/undo-stack.js`; the store records on
  every committed transform (deduped) and re-applies snapshots through the
  viewport. History resets when a new model loads.

### Added — transform tools

Reusing the existing tool-panel/viewport primitives (no new geometry engine):

- **Rotate:** +45° X/Y/Z, Flip 180° X/Y, and **Snap 90°** (snaps each axis to the
  nearest right angle so a hand-rotated part lands square).
- **Scale:** **×2 / ÷2** quick factors, **Max fit** (largest uniform scale that
  fills the bed — new `scaleToMaxFitBed`, grow-capable unlike shrink-only
  `scaleToFitBed`), and an **mm ↔ in** unit toggle on the "to size" field
  (converts to mm for the engine).
- **Move:** **Center XY** (centres on the plate keeping current height) alongside
  the existing Center + drop.
- **Toolbar:** a **Reset** (all transforms) button next to undo/redo.

### Tests

- vitest `undo-stack.spec` (push/undo/redo, dedupe, redo-tail truncation, bound
  eviction, snapshot cloning) and extended `mesh-analyze.spec` for
  `scaleToMaxFitBed` (grows small models, shrinks large, safe on bad input).
  Full suite green (315).

### Notes

- Duplicate / delete / arrange-multiple and per-part selection are intentionally
  deferred to the multi-object editor rework (next group), where they become
  meaningful.

## [1.41.1] - 2026-07-11

Print-tab sticky status-bar fixes (reported from live use).

### Fixed

- **Status bar no longer clips the workflow bar.** `PrintStatusBar` was
  `position: sticky; top: 0; z-index: 20`, so on scroll it overlapped the
  chrome/workflow bar (`top: 0; z-index: 3`). It now sticks BELOW the chrome
  using `top: var(--nc-print-chrome-h)` and `z-index: 2` — the same pattern as
  `WorkspaceRail`.
- **Trimmed redundant status-bar info.** The sticky bar duplicated the
  Print-control card (filename / % / ETA / a second progress bar). It now drops
  its own full-width progress bar (the control card owns that) and only shows the
  ETA once the control card has scrolled off-screen (via an IntersectionObserver
  on the card). While the card is visible the bar is a slim filename + % +
  pause/cancel line; the controls stay available at all times.

### Tests

- vitest `spacing.spec` asserts the status bar sticks below the chrome
  (`top: var(--nc-print-chrome-h)`, z-index < 3) and no longer renders the
  redundant progress bar. Full suite green (304).

## [1.41.0] - 2026-07-10

Fold the remaining data-dependent Print panels into the collapsible/pinnable
zones — the Print tab is now uniform (follow-up to 1.38.0's restructure).

### Changed — Print tab

- **Filament, Sensors, Timelapse, Queue & objects, and Cameras** are now
  collapsible + pinnable panels inside the zones (Operate / Analyze / **Media &
  queue**), like every other panel — previously they rendered plainly below the
  zones because their visibility depends on fetched, panel-internal data the
  parent couldn't cheaply mirror.
- New `panelVisibility` mixin: each of these panels defines a `panelVisible`
  computed (its own "do I have content?" gate) and emits `visible` on mount + on
  every change. `PrintTab` tracks it and hides the wrapper header until the panel
  reports content — so there's never an empty collapsed header.
- `PrintPanel` keeps its slot **mounted** while hidden (CSS `display:none` via a
  `--hidden` modifier) so a self-reporting panel can keep fetching to report;
  zone containers use `v-show` (not `v-if`) for the same reason. The zone label +
  container collapse entirely once nothing in them is visible.
- Removed each panel's now-redundant outer card + title (the `PrintPanel` wrapper
  provides them); Timelapse's Refresh button moved into a small body toolbar.

### Tests

- vitest `panel-visibility.spec` (mixin default + immediate emit + boolean
  coercion). Full suite green (302).

## [1.40.0] - 2026-07-10

Full-screen drag-drop upload (3DPrintForge parity). Completes the workflow-UX
pass. (Plan: docs/plans/ux-workflow-forge-parity.md — feature 3 of 3.)

### Added

- **Drag-drop overlay** (`DropZoneOverlay.vue`): drag a file anywhere over the
  window and a full-screen "Drop to load" target appears. Drop a model
  (.stl/.3mf/.obj) → it loads into the Prepare tab; drop g-code (.gcode/.gcode.gz)
  → it's queued for the Print tab's upload flow. Unsupported types get a clear
  toast. Only OS file drags trigger it (checks `dataTransfer.types` for "Files"),
  so dragging UI elements never shows the overlay; a dragenter/dragleave depth
  counter avoids flicker over child elements.
- `utils/drop-accept.js` — pure `isAcceptedModel` / `isGcode` / `classifyDrop`
  classification (case-insensitive, `.gcode.gz` aware), unit-tested.
- Store `queuePrintUpload(blob, filename)` action to hand a dropped g-code blob
  to the existing Print-tab upload consumer.

### Tests

- vitest `drop-accept.spec` (model/gcode/unsupported classification, empty +
  no-extension rejection, no false substring matches). Full suite green (299).

## [1.39.0] - 2026-07-10

Command palette (Ctrl/Cmd+K) — the 3DPrintForge "jump to anything" power-user
feature. (Plan: docs/plans/ux-workflow-forge-parity.md — feature 2 of 3.)

### Added

- **Command palette** (`CommandPalette.vue`): press **Ctrl/Cmd+K** anywhere for a
  centered, fuzzy-searchable overlay. Fully keyboard-driven — type to filter,
  ↑/↓ to move, Enter to run, Esc / click-out to close. Commands are grouped:
  - **Navigation**: Go to Prepare / Slice / Print (respecting workflow gating).
  - **Actions**: Import model, Slice, Slice & send, Pause / Resume / Cancel —
    each enabled only when valid (disabled entries stay visible with a reason).
  - **Panels**: jump to + expand any Print panel (in-print tuning, temperature,
    manual motion, console, power, temperature graph, bed mesh).
  - **Printers**: switch the monitored printer (one entry per configured
    printer; the current one is disabled).
- `utils/fuzzy.js` — a small, pure fuzzy matcher (exact > prefix > substring >
  subsequence ranking, case-insensitive) and `fuzzyFilter`.
- `utils/commands.js` — `buildCommands(store, cb)` builds the command list from
  live store state; pure and unit-testable.
- Panels expand-on-request via a lightweight `nc-print-focus-panel` window event
  so "Open <panel>" works whether the Print tab is already mounted or not.

### Tests

- vitest `fuzzy.spec` (ranking, case-insensitivity, no-match) and `commands.spec`
  (nav/action/panel/printer commands, enable/disable gating, run() dispatch).
  Full suite green (294).

## [1.38.0] - 2026-07-10

Print-tab workflow overhaul toward the 3DPrintForge feel: the ~20-panel wall is
now collapsible, pinnable, zoned, and topped by an always-visible status bar.
(Plan: docs/plans/ux-workflow-forge-parity.md — feature 1 of 3.)

### Added — Print tab

- **Sticky print-status bar** (`PrintStatusBar.vue`): while a print is
  active/paused it stays pinned to the top of the Print tab with the filename,
  live progress bar + %, ETA, and Pause/Resume + Cancel — no more scrolling up to
  see or control the running job. Hidden when idle.
- **Collapsible + pinnable panels** (`PrintPanel.vue`): the monitoring panels are
  grouped into forge-style zones (**Operate**, **Analyze**) with per-user
  remembered open/closed state (localStorage, same mechanism as the Prepare
  tab). A 📌 button pins a panel to a **Pinned** zone at the very top; pin order
  and membership persist (`utils/panel-prefs.js`, capped at 8).
- Panels with a cheap store-derived visibility rule are wrapped (in-print tuning,
  temperature, manual motion, console, power, temperature graph, bed mesh);
  data-dependent panels that already self-hide when empty (filament, sensors,
  timelapse, queue, webcams) render plainly below the zones.

### Changed

- Pause/Resume/Cancel are now shared store actions (`printPause` / `printResume`
  / `printCancel`) with one `printControlBusy` flag and re-entrancy guard, so the
  Print-control card and the new status bar (and the upcoming command palette)
  drive a single source of truth. Removed the duplicated inline control logic
  from `PrintTab.vue`.

### Tests

- vitest `panel-prefs.spec` (pin load/save/toggle/cap/corrupt-JSON) and
  `print-control.spec` (correct api + printer id, busy toggle, re-entrancy guard,
  failure toast). Full suite green (275).

## [1.37.0] - 2026-07-10

Durable print history + quality metrics + heuristic consumable-wear estimates.
This adds the app's **first database table** (previously all state lived in
app-config); history is unbounded over time and the metrics/wear roll-ups want
real SQL aggregation.

### Added — print history (new DB layer)

- **Schema/migration** `Version000001Date20260710120000` creates
  `oc_ncprint_prints` (one row per terminated print, per user), indexed by
  uid / printer / result / ended_at. Timestamps are unix-second bigints for
  portability (sqlite/mysql/pgsql). The table is dropped automatically on app
  uninstall by the framework.
- **Db layer**: `PrintRecord` entity + `PrintRecordMapper` (QBMapper) with
  ownership-scoped find/list/count/delete and SQL-pushed aggregation helpers
  (per-printer/material sums, result counts, duration/eta pairs, wear totals).
- **Capture**: `PrintEventController` now records a durable row on every
  terminal transition (complete / error / cancel) — reusing the existing
  print-lifecycle hook. Cancel is history-only (no "failed" bell/activity). The
  frontend threads the slice context (printer, material, nozzle, slicer
  estimate, filament grams, layer height) through the transition POST. All
  capture is best-effort and never blocks the UI.
- **`PrintHistoryService`**: quality metrics (success rate, median duration,
  ETA accuracy = actual/slicer mean+stdev with a 0.3–3.0 sanity band, filament
  + print-hour totals, per-printer/material breakdown) and consumable-wear
  estimates (cumulative hours, total + abrasive filament grams, a heuristic
  nozzle-wear % against a documented 250 g brass threshold, and advisory
  service hints). **Wear figures are labelled estimates, not measurements.**
- **`HistoryController`** + routes: `GET /api/history`, `/api/history/metrics`,
  `/api/history/wear`, `DELETE /api/history/{id}`, `DELETE /api/history`. All
  rows are uid-scoped server-side (IDOR-safe).
- **Frontend**: `history-api.js` (8 s timeouts), print-store history slice
  (list/metrics/wear/delete/clear actions), and `PrintHistoryPanel.vue` in the
  Print monitor — a collapsible metrics summary + wear bars + a filterable,
  deletable history table. This is distinct from the existing `HistoryPanel`,
  which mirrors the printer's own Moonraker job history.

### Tests

- phpunit `PrintHistoryServiceTest`: record validation/normalization,
  mapper-failure swallow, metrics aggregation (success rate, ETA sanity band,
  median, totals), wear nozzle-% clamp + service-hint thresholds.
- vitest: `history-api.spec` (endpoints, filter mapping, timeouts),
  `history-store.spec` (fetch/mutation actions + failure swallow), and
  `events.spec` extended for the enriched transition payload.

## [1.36.0] - 2026-07-10

Slice-tuning parity: 18 more OrcaSlicer process overrides exposed end-to-end.

### Added — slice overrides

Ported and verified 18 additional OrcaSlicer-fork process keys so the Profile
Quick-Edit can tune surface quality and support detail without hand-editing
presets. Each key was confirmed to exist with a real default in the shipped
engine presets before wiring; all are process-scoped.

- **Quality tier**: four overhang-band slowdown speeds
  (`overhang_1_4_speed`…`overhang_4_4_speed`), top/bottom shell layer counts,
  bridge speed / bridge flow ratio / "no support needed for bridges", elephant-
  foot compensation (engine spelling `elefant_foot_compensation`), and
  infill/wall overlap (percent).
- **Ironing & support detail tier**: ironing flow (percent) / spacing / speed,
  support interface bottom layers, support base pattern (default / rectilinear /
  hollow), tree-support branch angle, and draft shield (disabled / enabled /
  limited / all-brim).

Wired the full path: `overrides.py` `_MAP`, the store override state,
`buildSliceOverrides()` + `OVERRIDE_FIELD_DEFS`, and three new grouped sections
in `ProfileQuickEdit.vue` (Quality; Overhang speed slowdown; Ironing & support
detail). Unknown/empty values are omitted, matching existing behavior.

### Tests

- Adapter: `test_overrides_quality_and_ironing_support_keys` asserts all 18 map
  to the correct engine keys/formats (percent vs ratio vs int, bool→"1", enum
  passthrough) with empty filament/unknown; `test_overrides_omit_empty_new_keys`
  covers omission of blank values.
- Frontend: `slicer-utils.spec` gains coverage for the 18 form fields and their
  empty-omission.

## [1.35.0] - 2026-07-10

Performance tidy + robustness polish for the v1.34 analysis/reference features.

### Changed — performance

- **Defer JSZip off the startup path**: the Pinia store no longer imports
  `mesh-convert.js` (JSZip) or `mesh-analyze-api.js` at module load — the four
  call sites now use dynamic `import()`, so JSZip loads only when a 3MF is handled
  / printability is fetched. `webpack.config.js` re-enables `splitChunks` for
  **async chunks only** (`chunks: 'async'`) — NOT `'all'`, which was verified in a
  browser to break the app (Nextcloud injects only the named entry, so an
  `'all'`-split initial vendor chunk is never loaded and the SPA shell mounts with
  no tabs). Net: `nc_print-main.js` ~3.53 MB → ~3.43 MB; JSZip is no longer parsed
  at load. Modest, safe — not a dramatic cut (the app must stay self-contained per
  entry).

### Fixed — robustness / a11y

- **Request timeouts**: all `analysis-api.js` calls (lint / reference / search /
  preset) now pass an explicit 8 s timeout so a hung slicer proxy can't block the
  UI indefinitely.
- **No silent failures**: `fetchServerPrintability`, `printerPreset`, and
  `gcodeReference` catch blocks now leave a `console.debug` breadcrumb.
- **G-code reference lookup** (Console): `aria-label` + `maxlength` on the input;
  the "not found" message shows the upper-cased code (lookup is case-insensitive).
- **Preset chip** (ProfilePicker): a subtle "Loading model specs…" state while the
  lookup is in flight; decorative emoji (📐 / 💡) marked `aria-hidden`.
- **Mesh-analyze endpoint** (`/api/mesh/analyze`): a byte-size guard returns a
  clean 400 for oversize blobs (defense-in-depth atop the 50 MB proxy cap), and
  unexpected failures are scrubbed to a generic message (raw exception text no
  longer reaches the browser). Reference/preset 404s no longer echo user input.

### Tests

- Frontend: `analysis-api.spec` asserts every call passes a `timeout`; printability
  store spec updated for the dynamic import. (250 vitest.)

## [1.34.0] - 2026-07-10

Surface three analysis/reference features whose backends shipped in 1.32.0 but
had no UI — they're now wired into the app.

### Added

- **G-code reference lookup** in the Console: a "Look up a command" box that
  resolves any M/G-code (e.g. `M104`) to its description, parameters, example,
  and firmware notes via `GET /api/gcode/reference`. Available to everyone (no
  console-send permission needed).
- **Printer model specs chip** in the Prepare profile picker: when the selected
  slicer printer matches a known model, shows build volume · nozzle count ·
  heated-chamber (via `GET /api/printer-presets`). Distinct from the live
  Moonraker capability chip on the Print tab (this is the offline/slicer-side
  reference; announced-but-unshipped models are flagged).
- **STL printability** in the Mesh-health panel: a **Bridges** count and a
  best-orientation **tip** ("rotate 90° about X → overhang 12%"), fetched from
  the server analyzer (`fetchServerPrintability` → `/api/mesh/analyze`
  `printability`) alongside the existing analysis. Best-effort; hidden when
  unavailable.

### Tests

- Frontend (+4 → 249): new `printability.spec` — `fetchServerPrintability`
  merges/returns printability, no-ops without a slice model, swallows failures,
  and `setMeshHealth` triggers the fetch. (`analysis-api.spec` already covers the
  reference/preset clients.)

## [1.33.4] - 2026-07-05

### Fixed

- LAN scan no longer probes only `.local` hostnames when Admin Moonraker URL is unset — uses `discovery_subnet` appconfig / `NC_PRINT_DISCOVERY_SUBNET` / `NC_PRINT_HOST_LAN` to sweep the lab subnet (e.g. `10.0.0.0/24`).
- **Connect by IP** on Prepare target picker — enter `10.0.0.210` (or full Moonraker URL) without a full-subnet scan.

## [1.33.3] - 2026-07-05

### Fixed

- Health banner no longer shows "Printer not configured" when a session target exists, the printer is live, or status lists session printers.
- Status API probes Moonraker whenever a routable target URL exists (session/admin), not only when Admin URL is saved.
- Scan auto-selects when exactly one printer is found; session printers from status sync into the target picker on load.
- Recovery card copy points operators to Prepare → Scan → Use instead of Admin-only setup.

## [1.33.2] - 2026-07-05

### Fixed

- Ghost `printer_id=default` no longer synthesized client-side when Admin has no Moonraker URL — stale localStorage default id cleared instead of polling a non-existent printer.
- Session target printers re-register on page load from cached `targetPrinter` prefs so `/api/printer/state` routes correctly after reload.
- State poll skips when no target selected; HTTP 400 `unknown_printer` clears stale selection with an actionable message.

## [1.33.1] - 2026-07-05

### Fixed

- False "Slicer not configured" when nc-print-slicer sidecar is deployed but Admin slicer URL is blank (default sidecar URL counts as configured).
- False "Printer not configured" when a target printer is selected via scan/session register; status probe uses session/admin printer URLs.
- Health banner hides setup/offline cards when the selected target printer is connected.

## [1.33.0] - 2026-07-05

### Added

- **Target printer on Prepare** — shared `TargetPrinterPicker` with scan, connection chip, and capability label; distinct from slicer printer profile.
- **Session printer registry** — `POST /api/printers/register-session` so discovered printers route to the correct Moonraker host server-side.
- **Slice handoff actions** — send G-code / send-and-start from `SliceHandoffCard` after slice-only; target summary with link back to Prepare.

### Fixed

- Save-gcode fatal (`FilesController` now passes `IRootFolder` to `GcodeSaveController`).
- Unknown `printer_id` returns HTTP 400 instead of silently hitting the default Moonraker URL.
- Workflow gates: `previewBlocked` respects `model.sliceFile`; slice buttons honor `sliceBlockReason`; `prepareComplete` requires target printer.
- Temperature control toasts only on successful commands; reconnecting vs offline labels; deep-link G-code upload keeps pending until upload succeeds.
- Discovery ACL relaxed to `canUseApp()`; printer dedupe via `moonraker_host`; mesh transform prefs restored on same model reload.

## [1.32.1] - 2026-07-04

### App Store publication readiness

- Neutralized lab defaults (empty Moonraker/camera URLs, admins-only until groups configured).
- Replaced private `\OC::$server->getUserFolder()` with `OCP\Files\IRootFolder`.
- Admin-only printer discovery; client-safe bootstrap (no internal URLs leaked).
- Activity provider `parse()` signature fix; Moonraker proxy respects `printer_id`.
- HTTPS mixed-content: browser WS only with explicit `wss://`; HTTP poll fallback.
- Camera/proxy SSRF hardening via link-local/metadata blocklist.
- l10n (`en`/`de`), store metadata, screenshots, uninstall appconfig cleanup.
- Release automation: `make appstore`, GitHub Actions release workflow, operator onboarding doc.

## [1.32.0] - 2026-07-04

Forge port round 4 — four self-contained analysis/reference modules ported from
3dprintforge (verified pure-logic/data, no external deps).

### Added

- **G-code linter** (`slicer/adapter/gcode_linter.py`, faithful port of
  `gcode-linter.js`): 13 static-analysis rules on sliced g-code (no-homing, hotend/
  bed/chamber over-temp, cold-extrusion, missing extruder mode, excessive Z-hop,
  retract density / none, tool-swap-without-temp, Marlin↔Klipper flavour
  mismatch). New `POST /api/gcode/lint` ({job_id} or {text}, optional firmware) →
  `{issues,stats}`. **UI**: a "G-code checks" section in `SliceResultPanel` that
  lints automatically on slice-done and shows error/warning/info counts +
  a collapsible issue list before Send-to-printer (non-blocking).
- **STL printability** (`mesh_analyze.py`): overhang fraction (area-weighted,
  >45°), bridge-candidate count/area, and best-orientation suggestion (7
  axis-aligned flips ranked by overhang) — returned from `/api/mesh/analyze` as a
  new `printability` block + overhang/orientation `warnings`. (Backend + endpoint;
  the live viewport panel keeps its own browser-side overhang calc.)
- **G-code reference** (`gcode_reference.py` + `gcode_reference_data.json`, 85
  M/G-code entries): `GET /api/gcode/reference` (`?code=` / `?q=` / `?category=` /
  `?firmware=`). Backend + client (`analysis-api.js`).
- **Printer model presets** (`printer_presets.py` + `printer_model_presets.json`,
  18 models): static build-volume / nozzle-count / capabilities lookup via
  `GET /api/printer-presets` (`?vendor=&model=`). Reference DB (live Moonraker
  detection stays authoritative for connected printers). Backend + client.
- Proxy allowlist: added `api/gcode` + `api/printer-presets`.

### Tests

- Adapter (+5 → 50): linter flags/passes + firmware flavour; reference
  lookup/search; presets lookup (18, H2D, unknown, capability union); mesh
  printability (cube overhang ≈1/6, bridges, orientation ranking).
- Frontend (+5 → 232): new `analysis-api.spec` — lint payload (job_id/text),
  reference lookup + 404→null, search query string, preset 404→null.

## [1.31.0] - 2026-07-04

**Per-object slice settings** — different overrides per model on a multi-object
plate, via OrcaSlicer's `Metadata/model_settings.config` (which the shipped
engine reads). Verified end-to-end: a 2-object plate with object A at 1 wall and
object B at 6 walls slices each independently (54 inner-wall sections — exactly
between the all-1 → 1 and all-6 → 107 references).

### Added

- `mesh3mf.stls_to_multiobject_3mf(object_overrides=…)` writes
  `Metadata/model_settings.config` with per-`<object>` `<metadata key value>`,
  mapping frontend override keys to engine process keys via the new
  `overrides.map_process_override` (shared with the global override path).
- Adapter slice endpoint accepts an `object_overrides` multipart field (array
  aligned to the models list); threaded into the 3MF author. Bad/empty entries
  are ignored.
- `sliceStreamMulti({ objectOverrides })` sends the field only when at least one
  object has settings.
- **UI**: `ArrangePlate` gains a per-object "⚙ per-object" toggle on each added
  model with a compact editor (walls, layer height, infill %, infill pattern,
  supports) — these override the global slice settings for that model only. The
  prepared model uses the global settings (index 0).

### Tests

- Adapter (+3 → 45): `model_settings.config` authored with the right per-object
  metadata; omitted when no/empty/unknown overrides; `map_process_override`
  reuses engine keys and rejects filament-scoped/unknown/empty.
- Frontend (+3 → 227): new `slice-multi.spec` — `sliceStreamMulti` sends
  `object_overrides` only when an object has settings, omits it otherwise.

## [1.30.0] - 2026-07-04

**Update-trigger** — the update banner is now actionable for admins: trigger a
Moonraker `update_manager` update (Klipper / Moonraker / client / system / all)
from the app. Because it restarts printer services it is heavily guarded.

### Added

- New `UpdateController` + `POST /api/update/trigger` (`{target}`). Guards:
  **admin-only** (via new `AccessService::isAdmin()`, beyond normal group
  access), **idle-only** (queries `print_stats`; refuses while printing or if
  state can't be confirmed — fail closed), **fixed target allowlist**
  (klipper/moonraker/client/system/full), and it POSTs only to
  `machine/update/<target>` — never a generic passthrough (the Moonraker proxy
  stays read-only).
- **UI**: `UpdateControlPanel` (admin-only render; hidden for non-admins and when
  no update is available) with per-component "Update" buttons + "Update all",
  each behind an explicit confirm and disabled while printing. `moonraker-api`
  `triggerUpdate(target)`.

### Tests

- PHP (+5 → 75): `UpdateControllerTest` — admin guard, idle guard (fail-closed +
  busy states + 409), exact target allowlist + bad-target 400, only-posts-to
  machine/update, and the generic proxy never opened an update write.
- Frontend (+1): `triggerUpdate` posts the target to the guarded route.

## [1.29.0] - 2026-07-04

**Prime / wipe tower** for multi-material prints — the purge tower that catches
filament wasted at each colour change. Engine keys already existed; this wires
them through as overrides with a UI shown only for multi-material plates.

### Added

- New process overrides (`overrides.py` `_MAP` + store + `buildSliceOverrides` +
  `OVERRIDE_FIELD_DEFS`): `enable_prime_tower`, `prime_tower_width`,
  `prime_tower_brim_width`, `prime_volume`, `wipe_tower_rotation`
  (→ wipe_tower_rotation_angle), `wipe_tower_extra_spacing` (percentage).
- **UI**: a "Prime / wipe tower" group in `ProfileQuickEdit`, shown only when
  more than one filament is selected (a tower is meaningless single-material).

### Tests

- Adapter (+1 → 42): tower keys map to the engine keys with correct
  bool/num/pct formatting.
- Frontend (+2 → 223): `buildSliceOverrides` maps the tower fields and omits the
  empty ones.

## [1.28.0] - 2026-07-04

Developer-workflow hardening — removes the friction/footguns that kept requiring
manual intervention (stale deployed files, opcache-stale routes, hand-edited
version bumps across five files). No runtime app behaviour change.

### Changed / Added

- **Makefile**: `make bump-patch` / `make bump-minor` edit all version files
  (info.xml, package.json, package-lock ×2, README badge) and insert a dated
  CHANGELOG stub in one step. New `make ship` = build + slicer-up + deploy +
  gate-preflight.
- **`make deploy`** now removes the target subdirs in the container before
  copying (so files deleted from source no longer linger — we shipped a stale
  controller once), `chown`s to www-data, and flushes the CLI opcache; pass
  `RESTART=1` to bounce php-fpm when a route/class was added (fixes the
  stale-routes 404 that previously needed a manual `docker restart`).
- **Gate**: new G46–G50 assert the routes/allowlist added since G45 are present
  in the DEPLOYED files (discovery/capabilities, eta, print-transition, monitor
  read prefixes, guarded filament_extrude) — which also catches the
  opcache-stale-routes class of bug.
- **vitest**: defaults every spec to the `happy-dom` environment (was a
  hand-maintained per-file glob list that silently ran forgotten specs under
  node); node-only specs opt out with a `@vitest-environment node` docblock.
- **CLAUDE.md**: added a project workflow doc (bump/build/ship/verify/commit
  rules, the opcache-RESTART caveat, and the "test the engine binary, not preset
  grep" note).

## [1.27.0] - 2026-07-04

Prepare/Slice **quality controls** and Monitor-tab **expansion** — a review of
all three tabs against pro slicers (OrcaSlicer/Prusa/Bambu) and Mainsail/Fluidd.
All new slice keys were verified present in the shipped engine presets; all new
Moonraker endpoints verified against the live printer.

### Added — Slice / Prepare

- **Infill & surface patterns**: `infill_pattern` (→ sparse_infill_pattern:
  grid/gyroid/honeycomb/cubic/…), `top_surface_pattern`,
  `bottom_surface_pattern`.
- **Per-feature speeds**: `infill_speed` (→ sparse_infill_speed) and
  `solid_infill_speed` (→ internal_solid_infill_speed).
- **Support interface tuning**: `support_top_gap` (→ support_top_z_distance),
  `support_interface_layers` (→ support_interface_top_layers),
  `support_interface_spacing`; plus a `first_layer_height`
  (→ initial_layer_print_height) override.
  All wired through `overrides.py` `_MAP` + the store + `buildSliceOverrides` +
  new fields in `ProfileQuickEdit` (Infill & surface patterns / Per-feature
  speeds groups + support-interface + first-layer inputs).
- **Per-feature weight/cost breakdown** on the slice result: `gcode_stats.py`
  now buckets brim/skirt as `adhesion_filament_g` (separate from support), and
  `SliceResultPanel` shows model / support / brim-skirt grams (with per-row cost
  when a filament price is set).

### Added — Monitor

- **Power devices** (`PowerDevicePanel`): list + on/off toggle via the
  already-allowlisted `machine/device_power/`; feature-gated on `power`; blocked
  while printing.
- **Cameras** (`WebcamListPanel`): lists Moonraker webcams (allowlisted
  `server/webcams`); shown when >1 exists. Live view still uses the
  admin-configured camera proxy (no user-supplied stream URL, by design).
- **Manual extrude/retract**: new guarded `filament_extrude` action
  (`PrinterController`, idle-only, `M83`/`G1 E±mm`/`M82`, distance clamped ±50 mm,
  feed 60–600 mm/min) + ±0.1/1/10 mm buttons in `FilamentPanel`.
- **Sensor readouts** (`SensorPanel`): extra temperature sensors + filament
  switch/motion state from `printer.objects` (already allowlisted); auto-hides
  when none exist.
- **Update & announcement banners** (`UpdateStatusBanner` /
  `AnnouncementsBanner`): update-available status (allowlisted
  `machine/update/status`, status only — no trigger) and Moonraker service
  announcements (`server/announcements/`); feature-gated on `update_manager` /
  `announcements`.

### Tests

- Adapter (+3 → 41): new override keys map to engine keys; empty new keys
  omitted; gcode breakdown separates the adhesion bucket.
- PHP (+5 → 70): `filament_extrude` script build + distance/feed clamp + bad
  input + idle-only gating; monitor read prefixes on the allowlist; monitor
  feature-detection present.
- Frontend (+6 → 221): `buildSliceOverrides` maps/omits the new pattern/speed/
  support/first-layer keys; new `moonraker-api.spec` (filamentExtrude,
  power/webcam proxy calls).

## [1.26.0] - 2026-07-04

**Native Nextcloud integration.** Print lifecycle now shows up where Nextcloud
users expect it: the notification bell, the Activity stream, and a Dashboard
widget.

### Added

- **Notifications** (`INotifier`): print complete/failed publish to the Nextcloud
  notification bell. New `lib/Notification/Notifier.php`, registered via
  `registerNotifierService`.
- **Activity stream** (`IProvider` + `ISetting`): `print_started` /
  `print_completed` / `print_failed` events (filename, printer, duration) render
  in the Activity app with a per-user toggle. New `lib/Activity/Provider.php` +
  `lib/Activity/Setting.php`, declared in `info.xml`'s `<activity>` block.
- **Dashboard widget** (`IWidget`): a "3D printer status" tile showing the active
  printer's state, progress bar, ETA and temps, with a deep link into the app.
  New `lib/Dashboard/PrinterStatusWidget.php` (registered via
  `registerDashboardWidget`) + a self-contained `dashboard` frontend entry
  (`src/dashboard.js` + `DashboardWidget.vue`, polling `/api/printer/state`).
- **Transition bridge**: new group-gated `POST /api/events/print-transition`
  (`PrintEventController`) publishes the notification + activity for the current user.
  The store calls it where it already detects the printing→complete /
  printing→error edge (`_maybeNotifyPrintTransition`); browser notifications stay
  as a complement. New `src/services/events-api.js`.

### Tests

- PHP: new `PrintEventControllerTest` (2) — human-duration formatting +
  bad-input rejection. (63 → 65 phpunit.)
- Frontend: new `events.spec` (4) — events-api payload; store publishes on
  complete/error, not on non-terminal transitions. (211 → 215 vitest.)

## [1.25.0] - 2026-07-04

**Live printer capability detection.** Selecting a printer now queries
Klipper/Moonraker for its real hardware profile so the picker can show it at a
glance (and future features can adapt to it).

### Added

- **Capability endpoint**: `GET /api/printer/capabilities?printer_id=`
  (group-gated) queries Moonraker `printer.objects` (toolhead + configfile) and
  `machine.system_info` and normalizes them into
  `{build_volume{x,y,z}, extruders, has_enclosure?, model?, os?}`. Build volume
  comes from `toolhead.axis_maximum − axis_minimum`; extruder count from the
  `extruder`/`extruderN` config sections; enclosure from a chamber sensor;
  model/OS from `system_info`. Read-only via the existing guarded Moonraker
  helper (new GET variant for the GET-only `machine/system_info`). The
  normalizer (`PrinterController::normalizeCapabilities`) is pure + unit-tested.
- **UI**: `MultiPrinterPicker` shows a capability chip for the active printer
  (e.g. "308×308×315 · 1 extruder · enclosed"); the store caches capabilities
  per printer id (`fetchPrinterCapabilities`, `activePrinterCapabilityLabel`) and
  fetches on selection/mount. Failures cache null to avoid re-query storms.
- `printers-api.js`: `fetchCapabilities(printerId)`.

### Tests

- PHP: new `PrinterCapabilitiesTest` (5) — build volume from axis span (real K1
  numbers), extruder count from config sections, enclosure heuristic, model/OS
  from system_info, empty-input handling. (58 → 63 phpunit.)
- Frontend: `printers.spec` grows — `fetchCapabilities` get/null; store cache
  (no re-fetch, null-on-failure) and label formatting. (205 → 211 vitest.)

## [1.24.0] - 2026-07-04

**Automatic printer discovery in the app + recently-used printers.** The
target-printer picker can now scan the LAN for Moonraker printers and floats the
printers you actually use to the top.

### Added

- **In-app discovery**: new group-gated `POST /api/printers/discover`
  (`PrinterDiscoveryController`) runs the same Moonraker `/server/info` /24 sweep
  as the admin page, but is available to any allowed user. The candidate-building
  + probe logic was extracted into a shared `PrinterDiscoveryService`
  (`AdminController` now delegates to it; `buildDiscoveryCandidates` kept as a
  thin back-compat wrapper).
- **Recently-used printers**: the store tracks a per-browser MRU
  (`nc_print_recent_printers_v1`, cap 5, most-recent-first, deduped), recorded on
  every printer switch (`recordPrinterUsage`, wired into `onPrinterTargetChange`).
- **Grouped picker**: `MultiPrinterPicker` now shows **Recent** / **Configured** /
  **Found on network** (`printerPickerGroups` getter), a "Scan for printers"
  button (`discoverPrinters` action), and a one-click **Use** for found printers
  (`addDiscoveredPrinter` — session-only; saving permanently stays an admin
  action, with a hint pointing there). Found printers are deduped against
  configured ones by Moonraker URL.
- New `src/services/printers-api.js` (`discoverPrinters`).

### Tests

- PHP: new `PrinterDiscoveryServiceTest` (6) — explicit hosts win; /24 sweep from
  configured IP; explicit subnet prefix; non-IP host → .local fallbacks only;
  candidate cap; empty-hosts probe returns empty. (52 → 58 phpunit.)
- Frontend: new `printers.spec` (9) — discover api payloads; recent MRU
  (order/dedupe/cap/persist); `printerPickerGroups` split + dedupe; discover
  action populate/error; `addDiscoveredPrinter` add+select+drop+recent.
  (196 → 205 vitest.)

## [1.23.0] - 2026-07-03

**Smart ETA** — learns each printer's slicer-vs-actual time delta and shows a
corrected prediction on the slice result. Ported (algorithm) from the
3dprintforge ETA predictor; storage is app-config (no schema).

### Added

- **EtaLearningService** (`lib/Service/EtaLearningService.php`): EWMA
  (actual/slicer) multiplier per `(printerId, material, nozzleDiameter)` bucket,
  α=0.25, stored as an app-config JSON blob. `predict()` returns an adjusted
  estimate + multiplier + samples + confidence (saturates at 10 samples);
  `recordCompletion()` updates the EWMA, clamping ratios to the 0.3–3.0 sanity
  band (paused prints / tracking bugs are skipped). Unknown buckets and
  missing-printer contexts echo the slicer estimate unchanged.
- **EtaController** + routes: `POST /api/eta/predict`, `POST /api/eta/record`,
  `GET /api/eta/stats` — all access-gated like the rest of the app.
- **Frontend**: `eta-api.js` (predict/record); the print store predicts on
  slice-done (only surfaces a correction once the bucket has learned ≥1 print)
  and records on print completion (slicer estimate vs actual duration). The
  slice result panel shows a "Predicted (learned)" row with the corrected time
  and a "±X% vs slicer · N prints · Y% confidence" note.

### Tests

- PHP: new `EtaLearningServiceTest` (8) — unknown bucket / no-printer echo the
  estimate; first record seeds multiplier=ratio; EWMA converges toward a
  persistently-long ratio; confidence grows with samples and saturates;
  out-of-band and non-positive/missing inputs are rejected; buckets are keyed by
  material + nozzle. Added a minimal `OCP\IConfig` test stub. (44 → 52 phpunit.)
- Frontend: new `eta.spec` (7) — eta-api predict/record payloads; store
  predict/record wiring (surfaces only when samples>0, no-ops without estimates,
  posts minutes). (189 → 196 vitest.)

## [1.22.0] - 2026-07-03

Multi-color **purge / color-order optimizer** — recommend the filament load
order that minimises total purge, using OrcaSlicer's flush model. Ported from
the 3dprintforge flush-calc / color-order / color-names modules.

### Added

- **Flush model + optimizer** (sidecar `color_order.py`): a faithful port of
  OrcaSlicer's RGB flush volume (`flush_volume_mm3` — HSV distance + luminance
  asymmetry, so switching to a lighter color costs more purge), an asymmetric-TSP
  `optimize_color_order` (brute-force for ≤8 colors, nearest-neighbour + 2-opt
  above), `mm3_to_grams`, and `basic_color_name` (nearest palette match). Pure
  math — no slicing.
- **Adapter endpoint**: `POST /api/color-order` (`{colors, density?}`) → optimised
  cyclic order + orderedColors + basic names + grams saved vs load-as-listed.
  Added `api/color-order` to the slicer proxy allowlist.
- **UI**: new `ColorOrderPanel` on the Slice tab (near the pause/filament-change
  planner) — add/remove color rows with a swatch + hex input, an "Optimize order"
  button, and a result showing the recommended load sequence with color names and
  the purge saved.

### Tests

- Adapter: flush asymmetry (dark→light > light→dark) + clamp band + same-color/
  bad-hex minimum; optimizer reduces purge and matches the true min cycle cost;
  trivial N=0/1/2 cases; large-set heuristic path (10 colors → nn+2opt); color
  naming nearest match. (+5 adapter → 38.)
- Frontend: new `color-order-api.spec` — posts colors (and density) and returns
  the optimised result. (+2 vitest → 189.)

## [1.21.0] - 2026-07-03

Filament **material reference database** — a built-in catalog of 15 common
materials with a browsable info panel and one-click temperature defaults, ported
from the 3dprintforge material reference.

### Added

- **Material database** (sidecar `filament_materials.py`): 15 materials
  (PLA, PLA-CF, PETG, PETG-CF, ABS, ASA, TPU, PA/Nylon, PA-CF, PA-GF, PC, PVA,
  PVB, HIPS, PET-CF) with recommended/min/max nozzle, bed and chamber temps,
  print speed, retraction, fan, drying, per-plate compatibility, an 8-axis
  property profile, and tips/warnings. Includes id / name (fuzzy) / category
  lookups. Data-only — no slicing.
- **Adapter endpoints**: `GET /api/materials` (optional `?category=` filter) and
  `GET /api/materials/{id}`. Added `api/materials` to the slicer proxy allowlist.
- **UI**: new `MaterialInfoPanel` on the Slice tab — category chips, a material
  card grid, and a detail view (temps, drying, enclosure/hardened-nozzle flags,
  property bars, tips, warnings) with a **Use these temps** button that seeds the
  slice nozzle/bed overrides (new `applyMaterialTemps` store action; expands the
  override section so the change is visible).

### Tests

- Adapter: material count (15), required fields per entry, nozzle temp ordering,
  a known entry's temps, category filter, and name lookup (Nylon→pa, PA-CF, a
  branded compound name, empty/unknown). (+2 adapter → 33.)
- Frontend: new `materials.spec` — `materials-api` list/category/by-id calls and
  the `applyMaterialTemps` store action (seeds overrides + expands section;
  no-op for temp-less input). (+5 vitest → 187.)

## [1.20.0] - 2026-07-03

Calibration **generator suite** — seven procedural tuning prints that emit
G-code directly (no slice engine), ported from the 3dprintforge calibration
generators. Complements the existing 3MF-slice calibration path.

### Added

- **Procedural calibration generators** (sidecar `calibration_gcode.py`): temp
  tower, retraction tower, flow test, pressure-advance tower, pressure-advance
  pattern, first-layer test, and single-line (max-flow) test. Each returns
  `{name, description, gcode, expected_minutes, filament_g, type}` with a
  `; CALIBRATION:<type>` header and `CALIBRATION_END` marker. Output is
  deterministic (no wall-clock timestamp) for reproducible G-code.
- **Adapter endpoints**: `GET /api/calibration/list` now also returns a
  `generators` array (kind `gcode` catalog with per-type params); new
  `POST /api/calibration/generate` (`{type, params}`) writes the generated
  G-code to a job dir and returns the job id, downloadable via the existing
  `GET /api/jobs/{id}/gcode`. No engine exec.
- **UI**: `CalibrationPanel` gains a "Generator prints" section — a card grid of
  the seven generators with per-generator param forms and a **Generate G-code**
  button. The result flows into the standard slice-result path, so
  Save-to-Files and Send-to-printer work as with a sliced job.

### Tests

- Adapter: all seven generators emit non-empty G-code with the calibration
  header/end markers and sane `filament_g`; temp-tower steps ascend to the
  requested end temperature; param validation (low ≥ high) and unknown-type both
  raise. (+3 adapter tests → 31.)
- Frontend: new `calibration-api.spec` covers `fetchCalibrations`,
  `fetchGenerators` (incl. missing-key tolerance), and `generateCalibration`
  posting `{type, params}`.

## [1.19.1] - 2026-07-03

Test-coverage backfill for high-risk untested paths, plus docs housekeeping. No
runtime behaviour change.

### Tests

- **SlicerProxyController** — new `SlicerProxyControllerTest`: upstream-path
  mapping (`slice/stream` → `api/slice/stream`, api/ prefixing), the tightened
  endpoint allowlist (accepts the used endpoints, rejects `api/admin/*` etc.),
  and query-string sanitization (strips `_route`/`_url`, RFC3986 re-encode).
- **AdminController** — new `AdminControllerTest` for the printer-discovery
  candidate derivation (explicit hosts win; /24 sweep from configured IP or an
  admin subnet; `.local` fallbacks for non-IP hosts; 260 cap). The pure logic was
  extracted into a static `buildDiscoveryCandidates()` for testability (no
  behaviour change).
- **Sidecar presets resolver** — new `resolve_triple` tests: happy path,
  compatibility repair (incompatible process/filament swapped for a compatible
  one), unknown-printer error, and auto-supplied filament when none given.
- Totals: 44 phpunit, 28 adapter, 178 vitest.

### Docs

- Marked the three superseded plan docs (external forge-slicer era) with
  obsolete/completed banners pointing at the current architecture, rather than
  deleting them (the changelog history links to them).
- `.gitignore` now excludes local `docs/*.stl` / `docs/*.3mf` dev fixtures.

## [1.19.0] - 2026-07-03

Surface-quality slice overrides.

### Added

- **Ironing, fuzzy skin, seam position, and adaptive layer height** — a new
  "Surface quality" section in the quick-edit override panel. All four are real
  engine process keys (verified in the shipped OrcaSlicer-fork presets), applied
  through the existing override plumbing (`buildSliceOverrides` →
  `SlicerProxyController`/multipart → sidecar `overrides.py` merges them into a
  copy of the process preset). Ironing (off/top/topmost/all-solid), fuzzy skin
  (off/outer/all walls), seam (aligned/nearest/back/random), adaptive layers
  (on/off). Empty selections fall through to the profile default.

### Tests

- Frontend: `buildSliceOverrides` maps the four keys and omits empty ones.
  Adapter: `split_overrides` routes them to process scope with correct values
  (178 vitest, 24 adapter, 34 phpunit).

## [1.18.1] - 2026-07-03

Printer-safety and telemetry-robustness fixes from a targeted audit of the
Moonraker control path and WebSocket lifecycle.

### Fixed

- **Non-numeric temperature could command the wrong setpoint (safety).**
  `setTemperature` checked only that nozzle/bed weren't empty, then cast to
  float. A non-numeric value cast to `0.0` (→ `M104 S0`, unintended heater
  shutdown) and, worse, an overflow like `1e999` cast to `INF` which clamps to
  the **maximum** (→ `M104 S300`, unintended full nozzle heat). It now rejects
  non-numeric nozzle/bed values with a 400 before any G-code is built, matching
  the `is_numeric` validation the other tuning actions already use.
  (`lib/Controller/PrinterController.php`)
- **Print monitor showed stale live data after a WebSocket drop.** On `onclose`
  the client scheduled a reconnect but emitted no state, so during the reconnect
  window the UI kept showing the last-known temps/progress as if still
  connected. It now emits a `reconnecting` (offline) state on drop — normalized
  the same way as the HTTP-poll failure path. (`src/services/moonraker-ws.js`)

### Tests

- Added: temperature clamp danger cases (`abc`→0, `1e999`→max) and a guard-
  presence assertion for `setTemperature` (34 phpunit). Vitest 176 unchanged.

### Audit notes (verified safe, no change)

- Moonraker write path is otherwise sound: motion-while-printing guard covers all
  motion actions, temperature/speed/flow/fan/babystep/jog bounds are safe, the
  console command + exclude-object inputs are charset/length guarded, there is no
  raw `printer/gcode/script` passthrough, and multi-printer routing threads
  `printer_id` correctly (URLs come from admin config, never user input).
- Telemetry teardown is clean: every timer / listener / RAF / WebSocket has a
  matching clear in a teardown path; reconnect fetches a fresh ws-ticket; the
  HTTP-poll failure path already clears stale telemetry.

## [1.18.0] - 2026-07-03

Two pro-slicer features: model-vs-support material breakdown, and
pause / filament-change at a Z height.

### Added

- **Model vs support filament + cost breakdown.** The engine's gcode footer only
  reports total filament (often 0 g when the preset has no density), so the
  slice-result panel's model/support/cost rows never populated. New sidecar
  `gcode_stats.py` computes per-feature filament (integrating E-delta ×
  filament cross-section, classifying `;TYPE:Support*` moves) and a support-time
  share; the slice `done` payload now carries `model_filament_g`,
  `support_filament_g`, and `support_time_s`. Density/diameter are read from the
  gcode footer with a PLA-density fallback so grams/cost are non-zero even for
  density-less presets. The existing SliceResultPanel UI + `estimateFilamentCost`
  now light up with no frontend change.
- **Pause / filament-change at height.** New **PausePlanner** panel (Slice tab)
  lets you add pause (M601) or filament-change (M600) points at chosen Z heights
  — for multi-colour prints, embedding hardware, or inspection. New sidecar
  `gcode_postprocess.py` injects the command at the start of the first layer
  whose `;Z:` ≥ the target height (safe command allowlist: M600/M601/M0/M25).
  Plumbed through: store `pauses` state + add/remove/clear actions →
  `sliceStream` query param → `SlicerProxyController`/`MultipartBuilder` multipart
  `pauses` field → adapter post-process. The `done` payload reports
  `pauses_applied`.

### Tests

- Adapter: model/support breakdown split, pause injection placement + unsafe-
  command rejection (22 adapter tests). Frontend: pause store actions (add sorts
  by height / rejects invalid, remove, clear) — 176 vitest. 32 phpunit.

## [1.17.1] - 2026-07-03

Audit fixes: correctness bugs, a cancel/resource-leak DoS vector, and sidecar
hardening. No behaviour change for a normal successful slice.

### Fixed

- **Post-slice filament stats always showed null model/support grams.** The
  `lastCompletedSliceStats` getter read `sliceJob.modelFilamentG` /
  `supportFilamentG`, but those live under `sliceJob.materialStats.*` (set by
  `_applyMaterialStats`). PrintCompletionBanner / FilamentPanel now show the real
  breakdown. (`src/store/print.js`; a masking test that set the field in the
  wrong place was corrected.)
- **Cancelling a slice did not stop the engine.** `_run_slice` ran the CLI via
  `subprocess.run` in a thread with no handle, so `POST /api/jobs/{id}/cancel`
  only deleted the job dir while the engine ran to completion — holding a
  concurrency slot (a DoS vector) and racing the `rmtree`. The engine now runs as
  a tracked `Popen`; cancel terminates it (SIGTERM → SIGKILL grace), frees the
  slot, and cleans up only after the process is gone. A manual `SLICE_TIMEOUT_S`
  now actually kills an over-running slice. (`slicer/adapter/main.py`)
- **BedMeshPanel leaked a timer.** The post-calibrate `setTimeout(load, 8000)`
  was untracked — it could fire on an unmounted component or double-load on rapid
  re-calibrate. Now tracked and cleared on re-calibrate and `beforeDestroy`.
- **ArrangePlate ignored multi-extruder filament selection** — it sent only
  `selection.filamentId`; now prefers `selection.filamentIds` when present.

### Security / robustness

- **Slicer proxy path allowlist tightened** from a blanket `api/*` to an explicit
  endpoint prefix allowlist (`api/health|version|profiles|printers|slice|jobs/|
  mesh/|calibration`). Unrelated engine routes (e.g. `api/admin/*`) are now 403.
  (`lib/Controller/SlicerProxyController.php`; G13 gate + `ProxyAllowlistTest`
  updated.)
- **Sidecar no longer leaks internals to the browser.** Model-conversion,
  preset-resolution, and calibration failures now return generic user messages
  (details logged server-side); the actionable "mesh too large" hint is kept.
  `calib_id` is validated (`^[A-Za-z0-9_]+$`) before any path use; a missing
  shipped calibration model returns 404, not 500.
- **Toolpath parse is bounded** by `MAX_TOOLPATH_MOVES` (default 2M, env-
  overridable) so a pathological gcode can't exhaust adapter memory; the response
  meta reports `moves` + `truncated`.

### Cleanup

- Removed dead `_sliceAbort` state and the permanently-false, unused
  `featureFlags` (`batchSlice`/`forgePreview`); the one `forgePreview` check in
  SliceTab was simplified with no behaviour change. Slice errors now also reset
  `pct`/`stage` so a retry doesn't flash stale progress.

### Tests

- Adapter: process-kill, toolpath move-cap (truncate + not-truncate),
  `calib_id` validation (16→20 adapter tests). Frontend: new `slice-stats.spec.js`
  for the getter fix (174 vitest). PHP: tightened slicer allowlist accept/reject
  (32 phpunit).

## [1.17.0] - 2026-07-03

Bug fixes from live testing, plus printer autodetect.

### Fixed

- **3MF files that wrap their mesh in a component failed to import**
  ("3MF contains no triangle mesh"). Real Orca/Bambu exports (e.g. tbar.3MF)
  put a component-wrapper object in `<build>` that references the actual mesh
  object in the same document via `<component objectid="…">` with no `path`.
  The parser now resolves same-document component references (recursively, with
  transforms and cycle protection) in both `parse3mfMesh` and `walkModel`
  (`src/services/mesh-convert.js`).
- **Mesh "Repair" appeared to do nothing on non-watertight STLs.** It was
  welding hundreds of thousands of duplicate vertices but leaving a few genuine
  boundary holes, so the panel still said "needs repair." `autoRepair` now also
  **fills small boundary holes** (chains boundary edges into loops and caps them
  with triangle fans), and the toast reports exactly what changed (welded /
  filled / removed) and whether the mesh is now watertight. The AS150U test
  model now repairs to fully watertight.
- **Workflow-bar step content clipped out of its container.** Steps were
  fixed-width and long subtitles (filenames, profile chips) overflowed the box.
  Steps now shrink to share the row and subtitles truncate within their own step
  (`css/style.scss`).

### Added

- **Printer autodetect.** A **Discover printers** button in admin settings scans
  the LAN (the /24 around the configured Moonraker host, or an explicit
  host/subnet) for Moonraker `/server/info` responders and lets you add them to
  the multi-printer config in one click. New admin-only, server-side
  `POST /api/admin/discover-printers` (`AdminController::discoverPrinters`,
  parallel cURL probe with short timeouts).

### Changed

- **Bed-mesh heatmap is much finer.** It now prefers Klipper's interpolated
  `mesh_matrix` over the coarse `probed_matrix`, and bilinearly upsamples the
  grid (~24 cells/axis) so the map reads as a smooth surface instead of a few
  big blocks. Colours are still normalized to the true probed min/max
  (`src/utils/bed-mesh.js` `interpolateMatrix`).

### Tests

- New: 3MF component-wrapper regression (+ real tbar.3MF fixture), autoRepair
  hole-fill → watertight, bed-mesh `interpolateMatrix` + `mesh_matrix`
  preference. Full suite green: 171 vitest, 31 phpunit, 16 adapter.

## [1.16.1] - 2026-07-03

Production-readiness: documentation refresh + a small security hardening.

### Changed

- **Docs rewritten for the self-contained architecture** (v1.16.x): `README.md`,
  `docs/ARCHITECTURE.md`, `docs/INSTALL.md`, `docs/ADMIN.md`,
  `docs/LIMITATIONS.md`, `docs/TROUBLESHOOTING.md` now describe the owned
  `nc-print-slicer` sidecar (setup via `make slicer-fetch`/`slicer-up`, tuning
  knobs, hardening), the full feature set (3D toolpath preview, supports,
  multi-object arrange, calibration), and the current security model. The stale
  "forge-slicer at :8766" references are gone.

### Security

- **G-code console can no longer be enabled from the admin UI.** The toggle was
  removed from Settings → NC 3D Print; the (dangerous) raw-command input is now
  enabled deliberately via `occ config:app:set nc_print console_enabled --value=1`
  only. The default remains OFF, and all existing server-side guards
  (length/charset validation, motion-refused-while-printing, no raw
  `printer/gcode/script` passthrough) are unchanged.

## [1.16.0] - 2026-07-03

Phase 5 (final roadmap phase): **calibration suite**. One-click calibration
prints sliced for the selected printer.

### Added

- **Calibration endpoints** — `GET /api/calibration/list` (catalog) and
  `POST /api/calibration/{id}/slice` (`slicer/adapter/calibration.py`). Two
  sources: shipped `resources/calib/` models verified to slice against an
  arbitrary printer (the flow-rate models), and a **parametric temperature
  tower** generated on the fly as a stepped 3MF with configurable
  start/end/step temperatures. Calibration reuses the normal slice pipeline
  (preset resolution, overrides, gcode retrieval). Verified end-to-end: temp
  tower → 523 KB gcode; shipped flow model → 771 KB gcode.
- **`src/services/calibration-api.js`** (`fetchCalibrations`,
  `sliceCalibration`) and **`CalibrationPanel.vue`** (in the Slice tab) — pick a
  calibration, set the tower temperature range, one-click slice. Results flow
  into the normal slice result panel + 3D preview + Send-to-printer.

### Notes

- Some shipped calibration models (temperature/retraction/input-shaping) are
  Draco `.drc` assets meant for the GUI's calibration menu and embed
  printer-specific presets; those are handled by the self-generated tower rather
  than raw slicing, so the suite works on any configured printer.

### Tests

- Adapter: `test_calibration_list_includes_temp_tower`,
  `test_temp_tower_generation` (16 adapter tests total).

## [1.15.0] - 2026-07-03

Phase 4: **multi-object plates with auto-arrange**. Slice several models together
on one plate — the engine positions them so they don't overlap.

### Added

- **Multi-object slicing.** `POST /api/slice/stream` now accepts multiple `model`
  parts plus an `arrange` flag. Multiple models are packed into a single
  multi-object 3MF (`stls_to_multiobject_3mf` in `slicer/adapter/mesh3mf.py`) and
  sliced with the engine's `--arrange 1 --ensure-on-bed`, producing one gcode
  for the whole plate. Verified: 3 cubes uploaded at the origin arrange to a
  31.6 mm spread (vs 15 mm each). Single-model slices are unchanged.
- **`sliceStreamMulti()`** in `src/services/slicer-api.js` — sends a real
  multipart body (repeated `model` parts) so the proxy passes it straight to the
  sidecar. The SSE reader was extracted into a shared `readSliceSse()` used by
  both the single- and multi-model paths.
- **`ArrangePlate.vue`** (in the Slice tab) — add extra models from Nextcloud
  Files, see them listed, and “Slice N models arranged” in one click. Results
  flow into the normal slice result panel + 3D preview + Send-to-printer via the
  new `applyArrangedSliceResult()` store action.

### Tests

- Adapter: `test_multiobject_3mf_has_all_objects`, `test_multiobject_3mf_rejects_empty`
  (14 adapter tests total).

## [1.14.0] - 2026-07-03

Phase 3: supports now work end-to-end, plus server-side mesh health.

### Fixed

- **Support type `snug`/`grid` were sent as invalid `support_type` values.** The
  UI offers Normal/Tree/Snug/Grid, but in OrcaSlicer only Normal/Tree are
  `support_type` values — Snug/Grid are `support_style`. The override mapping now
  routes `snug`/`grid` to `support_type=normal(auto)` + the matching
  `support_style`, so those options actually take effect instead of erroring.
  (Supports themselves already reach the engine as of v1.12.1's override fix;
  the existing enable/type/threshold/brim/raft/skirt UI in `ProfileQuickEdit.vue`
  needs no change.)

### Added

- **Server-side mesh analysis** — new `slicer/adapter/mesh_analyze.py` +
  `POST /api/mesh/analyze` return a mesh health report (triangles, open edges,
  non-manifold edges, watertight, bbox, warnings) from the authoritative STL
  parser the slicer feeds. Complements the existing browser-side check for large
  meshes / exact-geometry confirmation. Frontend client:
  `src/services/mesh-analyze-api.js`.

### Tests

- Adapter: `test_mesh_analyze_watertight_cube`, `test_mesh_analyze_open_mesh`,
  `test_support_type_snug_maps_to_style` (12 adapter tests total).

## [1.13.0] - 2026-07-03

Phase 2 of the professional-slicer roadmap: **real 3D toolpath preview**. After a
slice you can inspect the actual printed paths in the 3D viewport — per-feature
colours, a layer-range slider, and toggleable travel moves — instead of only a
flat thumbnail. Closes the long-standing `/api/preview 501` gap with something
better.

### Added

- **Sidecar `GET /api/jobs/{id}/toolpath`** (`slicer/adapter/gcode_toolpath.py`).
  Parses the sliced gcode's `;LAYER_CHANGE`/`;Z:`/`;HEIGHT:`/`;TYPE:` markers
  into feature-typed, layer-indexed 3D segment buffers (flat
  `[x0,y0,z0,x1,y1,z1,…]` per feature per layer). Parsed server-side and cached
  on the job, so the browser never touches multi-MB gcode. Extrusion vs. travel
  is distinguished from the E axis; G92/M82/M83 extruder modes handled.
- **`src/services/toolpath-3d.js`** — fetches the contract, converts each
  feature's segments to `Float32Array`, and provides the Orca-like colour map +
  labels + `presentFeatures()`.
- **`viewport.js showToolpath()/setToolpathLayerRange()/
  setToolpathFeatureVisible()/disposeToolpath()`** — renders one
  `THREE.LineSegments` per feature type in the existing Z-up scene, hides the
  prepared mesh while previewing, frames the camera, and drives the layer slider
  via cheap per-feature draw ranges (no geometry rebuilds).
- **`Toolpath3D.vue`** — self-contained preview: its own viewport, a layer
  slider (`N / total`), and a feature legend with clickable colour chips (travel
  off by default). Added as a **“3D preview” tab** in `SliceResultTabs.vue`,
  mounted only when the tab is active.

### Tests

- Adapter: `test_toolpath_parser_layers_and_features` (layer/feature/bbox
  parsing). Frontend: `src/__tests__/toolpath-3d.spec.js` (Float32Array
  conversion, small-segment drop, error handling, `presentFeatures`).

## [1.12.1] - 2026-07-03

Critical slice-correctness fix plus sidecar hardening.

### Fixed

- **Slice overrides were silently ignored.** The adapter parsed the UI's
  `overrides` field (layer height, infill, perimeters, temps, supports…) but
  never passed it to the engine, so every slice used the raw profile defaults —
  changing any setting in the UI had no effect on the output. The adapter now
  applies overrides by merging them into copies of the process/filament presets
  (the OrcaSlicer CLI has no per-key override flags). New `slicer/adapter/
  overrides.py` maps the frontend's generic keys to the engine's preset keys
  (e.g. `infill_density` → `sparse_infill_density`, `perimeters` → `wall_loops`,
  `bed_temperature` → `hot_plate_temp`) and splits them into process-scoped vs
  filament-scoped merges. Verified end-to-end: sending
  `{layer_height:0.28, infill_density:0.42, nozzle_temperature:215, perimeters:4}`
  produces gcode whose config footer reports exactly those values. A `settings`
  SSE progress event now reports what was applied (and lists any ignored keys).

### Added (hardening)

- **Concurrency guard.** At most `MAX_CONCURRENT_SLICES` (default 2) engine
  processes run at once; excess slice requests fail fast with 503 instead of
  piling up and exhausting CPU/RAM.
- **Job garbage collection.** A background loop evicts completed jobs and their
  `/tmp/slice/<id>` dirs after `JOB_MAX_AGE_S` (default 1 h) and sweeps orphaned
  dirs from failed slices, so the tmpfs and the in-memory job map stay bounded.
- **Mesh size limit.** Uploads over `MAX_MESH_TRIANGLES` (default 2 M) are
  rejected up front (`ERR_MESH_TOO_LARGE`) — checked cheaply from the binary-STL
  header before allocating — so a photogrammetry-scale mesh can't OOM the
  container.
- **Health `jobs` section** reports active/cached/max-concurrent slice counts.
- Adapter unit tests expanded to 8 (override mapping/scoping, percent forms,
  preset merge, mesh-size guard).

## [1.12.0] - 2026-07-02

nc-print becomes a **self-contained slicer**. It now ships and owns its own
slicing engine as a companion container instead of depending on the external
forge-slicer service. This is Phase 1 of the professional-slicer roadmap
(`docs/plans/nc-print-self-contained-slicer.md`): stand up the owned engine and
cut the slice path over to it with zero UX change. Later phases add real 3D
toolpath preview, supports, auto-arrange, and calibration.

### Added

- **`nc-print-slicer` sidecar (`slicer/`).** An Ubuntu 24.04 image that bakes the
  3DPrintForge Slicer (OrcaSlicer fork) CLI + its `resources/` profile tree and
  runs the engine's built-in headless REST server (`--rest-only`) behind a
  FastAPI adapter on `:8080`. Runs headless via Xvfb + Mesa software GL (the
  engine links GTK/webkit, not Qt). New files: `slicer/Dockerfile`,
  `slicer/adapter/{main.py,mesh3mf.py,presets.py,entrypoint.sh,healthcheck.py,
  smoke_test.py,test_adapter.py,requirements.txt}`, `slicer/README.md`.
- **CLI-exec slice path.** This engine build's built-in REST `/api/slice` is
  broken and its binary cannot load STL at all (verified — reproduces on the
  reference forge too), so the adapter slices via the CLI: it converts the
  uploaded STL to a bare geometry 3MF (`mesh3mf.py`, since the engine loads 3MF
  fine), resolves a **compatible** machine/process/filament triple from the
  on-disk preset tree and auto-repairs incompatible selections (`presets.py`),
  execs `--slice 0 --load-settings --load-filaments --outputdir <job>` under
  Xvfb, streams synthesized SSE progress, and serves the produced
  `plate_1.gcode`. Profiles/health/version stay as engine pass-through.
- **Compatibility auto-repair.** When the requested process/filament isn't
  compatible with the chosen printer, the adapter swaps in a compatible preset
  and reports it via an SSE `warning` progress event (avoids the engine's opaque
  `-17` "not compatible" failure).
- **Slice metadata.** The `done` event carries `gcode_size`, `estimated_time_s`,
  and `filament_used_g` parsed from the gcode footer (cm³×density fallback when
  the preset reports 0 g).
- **`docker-compose.slicer.yml`.** Runs the sidecar on a shared `nc-print-net`
  network, hardened: no host port published (internal-only), `cap_drop: ALL`,
  `no-new-privileges`, read-only rootfs with tmpfs scratch, mem/pid caps, and a
  writable volume for operator presets.
- **Makefile targets** `slicer-fetch` (stage the git-ignored engine binary +
  resources), `slicer-build`, `slicer-up` (also attaches `cloud_app` to
  `nc-print-net`), `slicer-down`. `make deploy` now also ensures the sidecar is
  running, guarded so a missing engine/compose never breaks the app deploy.
- **Health enrichment.** The adapter's `/api/health` reports engine reachability
  and PresetBundle counts, so "engine up but no profiles" reads as degraded.

### Changed

- **`ConfigService::DEFAULT_SLICER_INTERNAL_URL`** now points at the owned
  sidecar (`http://nc-print-slicer:8080`) instead of the external
  `host.docker.internal:8766`. Addressing it by container DNS bypasses the
  legacy `host.docker.internal` / `:8766` URL-rewrite hacks in
  `InternalUrlResolver`. The `slicer_internal_url` admin override is unchanged,
  so operators can still point at an external forge-slicer for backward compat.
- Slicer-proxy unreachable message reworded ("Slicing engine unreachable") now
  that the engine is owned rather than an external service.

### Notes

- The `SlicerProxyController` contract is unchanged — the frontend slice → gcode
  → send flow is byte-identical to v1.11.0. No frontend changes in this release.
  Verified end-to-end: a cube STL uploaded through the adapter's
  `/api/slice/stream` slices to 227 KB of valid G-code with live SSE progress.
- The ~380 MB engine binary + resources are **not** committed to git; they are
  staged at build time by `make slicer-fetch`. AGPL: engine `LICENSE.txt` is
  baked into the image; corresponding source is offered separately.

## [1.11.0] - 2026-07-02

Prepare tab grows a Creality/Orca-style tool palette: interactive 3D gizmos
plus an extensive grouped tool listing instead of a thin toolbar.

### Added

- **Interactive transform gizmos.** Three.js `TransformControls` drive
  translate / rotate / scale directly in the 3D viewport. Dragging a handle
  gates OrbitControls, snaps (1 mm / 15° / 5%), and syncs into the slice mesh
  via the existing auto-apply path.
- **Tool rail + contextual panel.** A vertical grouped rail
  (`PrepareToolRail`) overlays the studio viewport — Transform (Move / Rotate /
  Scale), Orient (Place on face / Mirror), Modify (Plane cut), View. Selecting a
  tool opens a floating contextual panel (`PrepareToolPanel`) with the relevant
  controls.
- **Move** — translate gizmo + numeric X/Y/Z position, Drop to bed, Center, and
  an off-bed warning.
- **Rotate** — rotate gizmo + numeric per-axis degrees, +90° X/Y/Z, Lay flat,
  Auto-orient, and Reset rotation.
- **Scale** — scale gizmo + uniform %, per-axis %, To-size (mm) with lock-aspect,
  Scale to fit bed, and Reset scale.
- **Place on face** — click any facet and that face rotates flat onto the plate
  (raycast pick + geometry bake).
- **Mirror X/Y/Z** — reflects the mesh and flips triangle winding so normals
  stay outward (baked).
- **Plane cut** — axis + live plane preview + keep top/bottom + optional
  cross-section cap (baked). New `src/services/mesh-cut.js`.
- **View aids (non-destructive)** — camera presets (Top / Front / Right / Iso /
  Fit), wireframe toggle, and a renderer-level section clip plane.

### Changed

- Retired the standalone "Precise transform" collapsible; its scale/rotate
  numeric controls now live inside the Move / Rotate / Scale tool panels.
- `mesh-analyze.js` gains `applyScaleVector` (per-axis scale) and `mirrorMesh`
  (axis reflection + winding fix).

## [1.10.4] - 2026-07-02

Prepare-tab declutter from continued live UX review — the empty chamber now sits
directly under the workflow banner instead of below the fold.

### Changed

- **Prepare tab is viewport-first.** Removed the `PrepareEmptyState` block (hero,
  "Import an STL, 3MF, or OBJ…" lead, and the `1 / 2 / 3` step list that just
  duplicated the top Prepare/Slice/Print stepper). With no model loaded the
  centre column is now a single slim import row (`Import STL/3MF/OBJ` +
  `From Files`) above the 3D chamber, so the empty bed is visible immediately.
- **`ViewportToolbar` is context-aware.** The view/orient/apply groups (Center on
  bed, rotate, Lay flat, Scale to fit, Auto-orient, Auto-apply) and the "No model
  loaded" info line no longer render while empty — they appear once a model is
  loaded. `From Files` moved into the toolbar and the duplicate `From Files`
  button was removed, collapsing three import affordances down to two.

### Fixed

- **Workflow phase boxes no longer look clipped/crowded.** Step subtitles are now
  a single ellipsized line (full text stays in the hover tooltip) and the stepper
  pill uses `align-items: stretch`, so the active step no longer balloons to two
  lines and burst the bar on wide layouts.

## [1.10.3] - 2026-07-02

Follow-up UI polish from a second live audit.

### Fixed

- **Temperature sparklines rendered an invisible empty state.** The
  "collecting data" baseline set the canvas `strokeStyle` to a CSS
  `color-mix(var(--…))` string, which Canvas 2D cannot parse — it silently fell
  back to black and vanished on the dark surface. It now uses a concrete muted
  colour, a dashed baseline, and a "Collecting…" label so the pre-data state
  reads as intentional.

### Changed

- **Slice tab no longer repeats the full 8-row readiness checklist.**
  `PrepareChecklist` gains a `blocking-only` mode (used on Slice, where
  `SliceHandoffCard` already shows the "N/N ready" summary): it lists only the
  rows still blocking and collapses to a single "All checks passed" line when
  everything is green, cutting the triple-redundant readiness display.

## [1.10.2] - 2026-07-01

Critical production fixes uncovered during a live UI audit of the deployed app,
plus a checklist honesty improvement. The app was shipping with a broken
workflow tab bar and a whole layer of styling missing.

### Fixed

- **Workflow tab bar no longer crashes the render.** `PrintWorkflowBanner`
  referenced the `TABS` constant directly in its template (`TABS.SLICE`), which
  resolves against the component instance in Vue 2 and threw
  `TypeError: Cannot read properties of undefined (reading 'SLICE')`, silently
  collapsing the Prepare/Slice/Print stepper to an empty node. The lookup now
  goes through a `stepTitle()` method.
- **App stylesheet was never enqueued.** Only `nc-print-theme.css` (design
  tokens + app-shell base) was loaded; the compiled `css/style.css` (built from
  `style.scss`, holding every `nc-print-*` component/layout rule — workflow
  stepper, viewport toolbar, status chips, checklist, etc.) was not. It is now
  enqueued on the app page in `PageController`, restoring the intended layout.
- **Checklist trust (WYSIWYG).** The "Slice-ready mesh", "Mesh preview
  available", and "Mesh watertight" rows rendered a misleading green ✓ when no
  model was loaded. They now show a neutral pending state (`–`) until a model
  exists, so the checklist never claims a check passed that was never run.

### Added

- `src/constants/tabs.js` — dependency-free leaf module exporting `TABS`, imported
  by both the store and the components (breaks a webpack module-init order hazard
  where `TABS` could resolve to `undefined` in the production bundle). The store
  re-exports it for backward compatibility.
- Production-safe global Vue error handler (`src/main.js`) that logs component
  render errors with a stable prefix and retains the most recent few on
  `window.__ncPrintErrors` for support/diagnostics instead of silently rendering
  an empty subtree.

## [1.9.0] - 2026-07-01

UX cohesion, trust/WYSIWYG, and a Mainsail/Fluidd-class monitoring foundation
(Part B). All new printer-control surfaces go through guarded, allowlisted
backend actions — never a raw G-code passthrough.

### Added — UX cohesion (WS1–WS9)

- Single body scroll with unified 1200/900 breakpoints; camera consolidated to a
  single live view (removed the redundant PiP + PrePrint preview) (WS1)
- `AppChromeBar` unified top chrome; healthy service-health banner auto-hides;
  notification bell (WS3)
- `NcPrintCollapsible` + grouped `ViewportToolbar` to reduce Prepare density (WS2)
- `SliceHandoffCard` unifies the slice summary and adds a "Monitor on Print" CTA;
  richer empty states on Slice (WS5)
- Compact job history on the Print monitor, completion filament stats, and a
  fullscreen camera overlay (Esc to close) (WS4)
- Bed legend + "Applied" badge; blocking gate when the viewport preview was
  skipped so slicing is never "blind" (WS6)
- Always-navigable Print monitor (idle-safe) plus reopen recent project/model and
  replay-slice from the chrome (WS8)
- Content max-width/centering, sticky-rail chrome offset via `--nc-print-chrome-h`,
  removed overflow clipping, spacing-token cleanup (WS9)

### Added — Mainsail/Fluidd-class monitoring (Part B, WS10–WS16)

- Live multi-series temperature graph with presets + PID tune (WS10)
- Read-only G-code console log with allowlisted send, gated behind an admin
  `console_enabled` toggle (default off) (WS11)
- Bed mesh heatmap + calibrate action (idle-only) (WS12)
- Print/job queue + mid-print exclude-object (WS13)
- Filament management: Spoolman spool + runout sensors, load/unload/purge, and
  last-slice cost estimate (WS14)
- Moonraker history/statistics + embedded G-code thumbnails (WS15)
- moonraker-timelapse integration: rendered-video list, in-app playback, download
  (feature-detected; hidden when the plugin is absent) (WS16)

### Security

- Moonraker proxy allowlist extended with read-only Part B prefixes only; raw
  `printer/gcode/script` passthrough stays blocked
- All write actions (bed mesh calibrate, filament, heater/PID, exclude-object) go
  through guarded `PrinterController` actions with parameter validation and
  idle/motion guards
- G-code console send disabled by default and admin-gated (`console_enabled`),
  exposed as an explicit opt-in toggle in **Settings → NC 3D Print**

### Gates

- G27 version floor bumped to `>= 1.9.0`
- G34 (deployed sticky-chrome CSS), G35 (CSS/JS deploy freshness), G45 (proxy
  allowlist + console-off regression); new Vitest specs G38a–G44a; PHPUnit
  console/proxy guards

## [1.8.1] - 2026-07-01

Theme cohesion + presentation refresh aligned with NC-GCS visual language.

### Changed — UI polish

- Glass cards (`backdrop-filter`, shadow), inset sub-panels, accent-left banners
- Two-tier section headers (panel title + uppercase micro-labels)
- KPI stat tiles on Print monitor (elapsed, progress, layer, nozzle, bed)
- Shared `.nc-print-badge` and `.nc-print-dot` status indicators
- Pill toggle switches for auto-apply mesh and start-after-upload
- Input focus glow; refined button hover/variants (`--small`, `--icon`, `--ghost`)
- `NcPrintIcon` inline-SVG component (12 glyphs) on section headers and key actions

## [1.8.0] - 2026-07-01

UI/UX remediation: wire flagship Prepare studio, auto-apply WYSIWYG mesh, printer control surface, slice recovery, and expanded gates (G20–G27).

### Fixed — Core workflow (P0)

- **Auto-apply mesh ON by default** with Applied badge, opt-out toggle, and manual Apply when disabled
- **3-column Prepare studio** (`PrepareStudioLayout`): profiles left, viewport center, checklist + slice summary right
- **Clickable checklist** routes to import, mesh apply, profiles, mesh health
- **Multi-printer** pause/resume/cancel pass `printer_id`
- **Help drawer** Print tab opens Limitations panel (was blank)

### Fixed — Slice & Print (P1)

- Retry slice, G-code tab empty state, Restore settings label in job history
- Cancel confirmation, offline banner, target temps/heating, ETA, camera retry + proxy URL
- Removed redundant `JobSummaryStrip`; expanded settings diff and support type/threshold UI
- Toolpath scrubber travel-line color, ResizeObserver, loading state

### Added — Printer interface (P1.5)

- Temperature control + preheat presets + live sparkline
- In-print tuning (speed/flow/fan/babystep), manual motion (idle), emergency stop
- Print completion banner + guarded browser notifications
- Precise numeric scale/rotate panel; filament cost estimate on slice result

### Added — Backend

- `POST /api/printer/temperature`, `/emergency-stop`, `/gcode-action` with server-side clamping
- Camera proxy resolves per `printer_id`

### Gates

- API gates **G20–G27** (control routes, clamps, camera proxy, motion-while-printing, version ≥ 1.8.0)

## [1.7.0] - 2026-07-01

Roadmap release v1.4→v1.7: Prepare studio, WYSIWYG mesh, prep toolbox, slice confidence, Files-native G-code, toolpath scrubber, multi-printer ops, polish, and upstream stubs. See [`docs/plans/nc-print-ux-roadmap.md`](docs/plans/nc-print-ux-roadmap.md).

### Added — Prepare studio (Sprint A)

- **3-column Prepare layout** (`PrepareStudioLayout.vue`): profiles left, viewport center, checklist + CTA right (≥1200px)
- **Slice summary card** with filename, bbox, fits-bed, dirty badge
- **Clickable checklist** rows focus the matching fix control
- **First-run empty state** with import / From Files / 3-step diagram
- **Profile search** and last-used pin in `ProfilePicker`
- **Merged workflow banner** (job strip folded into status row)

### Added — WYSIWYG mesh (Sprint B)

- **`meshState`** in Pinia: position, rotation, scale, `sliceBlob`, dirty flag, auto-apply
- **Apply to slice** exports viewport transform to STL before slice
- **Session prefs** restore profiles + transform per `fileId`

### Added — Prep toolbox (Sprint C)

- **Lay flat / scale-to-fit / auto-orient** (6 axis-aligned rotations)
- **OBJ** preview and slice (OBJ→STL client-side)
- **Mesh analyze & repair** (`MeshHealthPanel`, browser fallback — forge `/api/mesh/*` 404)
- **Support + adhesion overrides** (enable, type, threshold, brim, raft, skirt)
- **Multi-object 3MF picker** (`ThreeMfObjectPicker.vue`)
- **Recent models strip** (last 5 paths)

### Added — Slice confidence (Sprint D)

- **Settings diff review** before slice (`SliceReviewPanel.vue`)
- **Tabbed results** Summary / Toolpath / G-code / Settings (`SliceResultTabs.vue`)
- **Pre-print modal** before Slice & Send (`PrePrintModal.vue`)
- **PNG lightbox** (`PreviewLightbox.vue`)
- **Support material stats** on slice result panel

### Added — Files & history (Sprint E)

- **Save G-code to Files** — `POST /api/files/save-gcode` sibling WebDAV write
- **Job history** panel (local 20 rows + optional forge job enrich)

### Added — Toolpath & workspace (Sprint F)

- **G-code layer scrubber** (`ToolpathScrubber.vue`, `gcode-toolpath.js`)
- **Workspace rail** on Prepare / Slice / Print tabs
- **Preview API probe** documented; 501 → defer to Sprint J

### Added — Lab ops (Sprint G)

- **Multi-printer picker** (admin JSON config)
- **Local named presets** (forge `POST /api/profiles` still 404)
- **Moonraker WebSocket** client for live progress
- **Estimate vs actual** on Print tab

### Added — Polish & advanced prep (Sprints H–I)

- **Keyboard shortcuts**, SSE stage copy, **error recovery cards**
- **Draggable camera PiP**, admin onboarding hints, a11y pass
- **Profile quick-edit** (15+ params), **multi-tool filament slots**
- **Tablet 1024px** responsive collapse

### Added — Upstream stubs (Sprint J)

- Feature flags for batch slice and forge 3D preview (disabled until upstream ships)
- [`docs/plans/sprint-j-upstream.md`](docs/plans/sprint-j-upstream.md)

### Documentation

- [`docs/plans/forge-slicer-api-audit.md`](docs/plans/forge-slicer-api-audit.md) (Sprint 0)
- Updated [`docs/FEATURE_PORT.md`](docs/FEATURE_PORT.md) coverage ~95%

## [1.3.5] - 2026-06-30

### Fixed

- **Viewport bed orientation:** Z-up camera so the build plate lies flat on the floor (was appearing as a vertical wall with default Y-up Three.js)
- **3MF import/slice:** Orca/Creality project 3MFs are flattened client-side to STL for forge-slicer (linked object files no longer fail as "empty")
- **3MF preview:** mesh extracted in-browser and shown on the bed like STL

### Added

- **Prepare tab:** override settings panel (layer, line width, perimeters, infill, speeds, temps) moved from Slice tab
- **Viewport toolbar:** rotate 90° on X/Y/Z axes; model dimensions in the info line
- **Prepare checklist:** slice-ready mesh row for 3MF conversion status

## [1.3.4] - 2026-06-30

### Fixed

- **Slice SSE root cause:** proxy now forwards `slice/stream` to forge-slicer `api/slice/stream` (was incorrectly mapped to `api/slice`, which returns buffered JSON with no `event: done`)
- **JSON fallback:** client accepts buffered `application/json` slice responses when SSE is unavailable
- **G-code recovery:** ranged GET fallback when HEAD is unsupported on the gcode proxy path

## [1.3.3] - 2026-06-30
