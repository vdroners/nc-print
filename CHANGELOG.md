# Changelog

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
