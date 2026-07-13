# nc-print — slicer GUI alignment with mainstream slicers

Gap analysis of nc-print's slicer GUI vs OrcaSlicer / Cura / PrusaSlicer / Bambu
Studio, and the alignment roadmap. Grounded in a full read of the current UX and
the OrcaSlicer-fork engine resources.

Legend: **TS** = table-stakes (in ~all four slicers) · **NH** = nice-to-have /
differentiator · effort **S/M/L** · **⭐ = build now (v1.57–1.60)**.

## Settings / parameter editing
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 1 | **Modified-value highlight + per-field reset-to-default** | none — flat panel, no baseline diff shown | TS | M | ⭐ v1.57 |
| 2 | **Quality preset selector** (Draft/Standard/Fine) | none — only the process dropdown | TS | S | ⭐ v1.57 |
| 3 | Unsaved-changes indicator on override panel / presets | none (auto-persist) | TS | S | report |
| 4 | Search box over the ~55 advanced settings | none | NH | M | report |
| 5 | Simple / Advanced / Expert mode toggle + full settings tree | one collapsed "advanced" panel | TS | L | report (large refactor) |
| 6 | Per-object settings on the MAIN model | only in ArrangePlate (5 fields) | TS | L | report |

## Preview / g-code
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 7 | **Color-by speed** (+ scaffold flow/layer-time) | feature-color only; `gcode_toolpath.py` parses F but discards it | TS | L | ⭐ v1.60 |
| 8 | **In-layer sequential "moves" slider** | single layer slider only | TS | M | ⭐ v1.60 |
| 9 | Layer range (min..max) not just max | max only | NH | S | report |
| 10 | Travel / seam / retraction toggles as first-class | travel in feature legend only | NH | S | report |

## Workflow / estimate
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 11 | **Persistent time/filament/cost estimate on Prepare** | shows only AFTER slicing on the Slice tab | TS | M | ⭐ v1.59 |
| 12 | **One-click Slice from Prepare** (no tab hop) | Slice is a separate tab (Ctrl+Enter helps) | TS | S | ⭐ v1.59 |
| 13 | Pre-slice rough estimate before any slice | none | NH | S | report (folds into 11) |
| 14 | `.3mf` project save/load round-trip (models+settings+layout) | none | TS | L | report |
| 15 | Slice-warnings surface (empty layers, thin walls, out-of-bed) w/ jump-to | minimal | TS | M | report |

## Viewport / plate
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 16 | **Persistent camera view widget** (Top/Front/Right/Iso/Fit) | presets exist but buried inside the 'view' tool | TS | S | ⭐ v1.58 |
| 17 | **Scene-tree right-click context menu** (select/dup/delete/center/rename) | list buttons only, no menu | TS | S | ⭐ v1.58 |
| 18 | Out-of-bed detection in Z + per-object out-of-bed tint | XY-only "Fits bed" badge (`isOnBed` checks Z but unused) | NH | M | report |
| 19 | Multi-select in the scene tree (batch move/delete) | single-select | NH | M | report |
| 20 | Exclusion / disallowed zones on the bed | none | NH | M | report |

## Filament / material (differentiator tier — not this round)
- AMS/MMU slot-mapping UI, per-triangle color painting, flush/purge-volume matrix.
  nc-print has multi-tool filament pickers + pause-at-height + color-order, but no
  AMS mapping or flush matrix. Engine ships `resources/flush/flush_data_*` as a
  ready reference. **report / next tier.**

## Calibration (differentiator tier — not this round)
- Built-in calibration generators: temp tower, flow, retraction, pressure/linear
  advance, tolerance, max-flow, input-shaping, first-layer. nc-print has a basic
  `calibration.py` (temp tower + flow). Orca `resources/calib/*.drc` is a ready
  reference set to port. **report / next tier.**

---

## Build-now subset (7 across all 4 areas)
1 + 2 (Settings, v1.57) · 16 + 17 (Viewport, v1.58) · 11 + 12 (Workflow, v1.59) ·
7 + 8 (Preview, v1.60). Details, files, and reuse in
`docs/plans/` + the session plan; only v1.60 (color-by-speed) touches the slicer
sidecar (`gcode_toolpath.py`) and needs `make slicer-up`.

## Deferred next tier (highest-value remaining after the build subset)
Simple/Advanced/Expert + searchable settings tree (5,4,3); per-object main-model
settings (6); `.3mf` project round-trip (14); slice-warnings surface (15);
Z/out-of-bed + multi-select + exclusion zones (18,19,20); AMS/flush multi-material
UI; calibration-generator suite. These signal maturity but are larger or
lower-frequency than the build-now seven.
