# nc-print v1.32.0: forge port round 4 — g-code linter, STL printability, g-code reference, printer presets

## Why / scope

A follow-up survey of 3dprintforge (`/media/4TB/3dprintforge/src/server/`) for
remaining portable, additive modules not already ported or rejected. Four
verified self-contained candidates, all shipping in one combined version bump
(v1.32.0) per the user's choice:

1. **G-code linter** (`gcode-linter.js`, 382 lines, zero deps) — 13 static-analysis
   rules on sliced g-code.
2. **STL printability** (`stl-analyzer.js` overhang/bridge/orientation logic,
   zero deps) — adds a printability layer to the existing mesh-health panel.
3. **G-code reference** (`gcode-reference.js`, 85 entries, zero deps) — searchable
   M/G-code help.
4. **Printer model presets** (`printer-presets.js` + `data/printer-model-presets.json`,
   18 models) — static build-volume/nozzle/capabilities lookup.

All are pure logic/data; the port targets the Python sidecar (where slicing/mesh
already live) with thin PHP proxying via the existing SlicerProxyController
allowlist, except the reference/presets which are static data (can live in the
sidecar and be served through the same proxy).

## Part A — G-code linter (biggest value)

Port `gcode-linter.js` → `slicer/adapter/gcode_linter.py`: faithful port of
`parse_gcode_line` + the 10 rule functions + `lint_gcode(text, firmware)` →
`{issues:[{severity,code,message,line}], stats:{lines,commands,layers,tools}}`.
Rules: no-homing, hotend/bed/chamber temp bounds, cold-extrusion, no-extruder-mode,
excessive-z-hop, retract frequency (high-density / none), multi-tool-swap-without-temp,
firmware-flavour sanity. Severity error/warning/info.

- `main.py`: `POST /api/gcode/lint` ({job_id} or raw text; firmware optional) →
  lints the job's gcode (reuse the job store) and returns the report. Cap the
  scan (e.g. first ~2M lines) so a huge file can't hang.
- Proxy allowlist: `api/gcode` (new prefix) or fold under an existing one.
- Frontend: `gcode-lint-api.js` + a "Checks" section in `SliceResultPanel` — run
  the linter automatically on slice-done, show error/warning/info counts + a
  collapsible list; a red error count warns before Send-to-printer (non-blocking).
- Tests: adapter (each rule fires on a crafted snippet; clean gcode → no issues;
  stats correct) + frontend (api parse; panel renders counts).

## Part B — STL printability

nc-print's `mesh_analyze.py` already returns vertices/triangles/open_edges/
non_manifold/watertight/bbox. Add the forge printability layer computed from the
already-parsed triangles:
- overhang fraction (area-weighted, >45° default), bridge-candidate count/area,
  and orientation suggestions (7 axis-aligned flips, rank by overhang fraction).
- Extend `analyze_stl()` output with `overhang_fraction`, `bridges`,
  `orientation_suggestions` (best flip + its fraction). Keep back-compat (additive
  keys only).
- Frontend: extend `MeshHealthPanel` — show overhang %, bridge count, and a
  "💡 Rotate X 90° → overhang 4%" hint when a flip beats as-loaded by a margin.
- Tests: adapter (a known overhang cube-with-lip → nonzero fraction; a flat plate
  → ~0; orientation ranking picks the better flip) + frontend (renders the hint).

## Part C — G-code reference

Port `gcode-reference.js` REFERENCE array (85 entries: code, category, desc,
params, firmware notes) → `slicer/adapter/gcode_reference.py` with
`list_reference()`, `get_reference(code)`, `search_reference(query/category)`.
- `main.py`: `GET /api/gcode/reference` (list) and `?code=` / `?q=` (lookup/search).
- Frontend: a lookup affordance in `GcodeConsole` — type/hover a command → show
  its meaning + params (read-only; complements the console log).
- Tests: adapter (count; exact lookup G1/M104; search by category; unknown → none)
  + frontend (api parse; console lookup renders).

## Part D — Printer model presets

Copy `data/printer-model-presets.json` (18 presets + placeholders) into the
sidecar; port `printer-presets.js` lookups → `slicer/adapter/printer_presets.py`
(`find_printer_preset(vendor, model)`, `list_presets_for_vendor`,
`list_all_capabilities`).
- `main.py`: `GET /api/printer-presets` (list) + `?vendor=&model=` (lookup).
- Frontend: surface in the Prepare profile picker / printer info as static model
  facts (build volume, nozzle count, capabilities) when a matching model is
  selected — clearly distinct from the LIVE Moonraker capability chip (which wins
  for connected printers; this is the offline/slicer-side reference).
- Proxy allowlist: `api/printer-presets`.
- Tests: adapter (count=18; find bambu/H2D; unknown → None; capability union) +
  frontend (api parse).

## Not porting (confirmed out of scope this round)
Everything deps-heavy or stateful: preflight-checks/quality-metrics/currency
(DB-backed), mesh-repair (overlaps client repair + heavy), format-converter
(depends on lib3mf/mesh-builder), wear-prediction/print-guard (DB + mqtt),
gcode-time-estimator (we already get time from the engine), plus all the
already-rejected clients/cloud/AI modules.

## Workflow
One combined v1.32.0 via `make bump-minor` + `make ship` (adapter changes →
sidecar rebuilds automatically; new routes → ship RESTART=1). Full suites +
gate G00–G50 green; verify the linter + printability e2e against a real slice on
the live stack. Commit (env -i, Claude trailer) + push.

## Verification
- Linter: slice a model → Checks panel shows stats + any issues; a hand-crafted
  bad gcode (cold extrusion) flags an error via `/api/gcode/lint`.
- Printability: an overhang model reports a nonzero overhang fraction + a better
  orientation; a flat plate reports ~0.
- Reference: `/api/gcode/reference?code=M104` returns the description.
- Presets: `/api/printer-presets?vendor=bambu&model=H2D` returns the H2D record.
