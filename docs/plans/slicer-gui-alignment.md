# nc-print — slicer GUI alignment with mainstream slicers

Gap analysis of nc-print's slicer GUI vs OrcaSlicer / Cura / PrusaSlicer / Bambu
Studio, and the alignment roadmap. Grounded in a full read of the current UX and
the OrcaSlicer-fork engine resources.

Legend: **TS** = table-stakes (in ~all four slicers) · **NH** = nice-to-have /
differentiator · effort **S/M/L**.

**Status refresh:** 2026-07-17 against shipped **1.57.0–1.60.9** (plus field
fixes in 1.60.10). The original ⭐ “build now” subset and the deferred tier
parts 1–9 are **shipped**.

## Settings / parameter editing
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 1 | Modified-value highlight + per-field reset-to-default | `OverrideField` chrome | TS | M | **Shipped** v1.57 |
| 2 | Quality preset selector (Draft/Standard/Fine) | process + named presets | TS | S | **Shipped** v1.57 |
| 3 | Unsaved-changes indicator on override panel / presets | amber/green dirty dot | TS | S | **Shipped** v1.60.5 |
| 4 | Search box over advanced settings | settings search | NH | M | **Shipped** v1.60.5 |
| 5 | Simple / Advanced / Expert mode + settings tree | three-way `settingsMode` | TS | L | **Shipped** v1.60.5 |
| 6 | Per-object settings on the MAIN model | Per-object panel (multi-object) | TS | L | **Shipped** v1.60.6 |

## Preview / g-code
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 7 | Color-by speed (+ scaffold flow/layer-time) | Feature \| Speed toggle | TS | L | **Shipped** v1.60 |
| 8 | In-layer sequential "moves" slider | move scrubber | TS | M | **Shipped** v1.60 |
| 9 | Layer range (min..max) not just max | max only | NH | S | **Open** |
| 10 | Travel / seam / retraction toggles as first-class | travel in feature legend | NH | S | **Open** |

## Workflow / estimate
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 11 | Persistent time/filament/cost estimate on Prepare | SliceSummaryCard | TS | M | **Shipped** v1.59 |
| 12 | One-click Slice from Prepare (no tab hop) | Slice now button | TS | S | **Shipped** v1.59 |
| 13 | Pre-slice rough estimate before any slice | `estimatePrintTimeBand` | NH | S | **Shipped** (with 11) |
| 14 | `.3mf` project save/load round-trip | Save project / hydrate | TS | L | **Shipped** v1.60.8 |
| 15 | Slice-warnings surface w/ jump-to | SliceWarningsPanel | TS | M | **Shipped** v1.60.7 |

## Viewport / plate
| # | Gap | nc-print today | TS/NH | Effort | Status |
|---|-----|----------------|-------|--------|--------|
| 16 | Persistent camera view widget | ViewportCameraCube | TS | S | **Shipped** v1.58 |
| 17 | Scene-tree right-click context menu | Objects list menu | TS | S | **Shipped** v1.58 |
| 18 | Out-of-bed detection in Z + per-object tint | XY fits-bed + warnings; Z tint incomplete | NH | M | **Open** |
| 19 | Multi-select in the scene tree | single-select | NH | M | **Open** |
| 20 | Exclusion / disallowed zones on the bed | none | NH | M | **Open** |

## Filament / material
- AMS flush matrix: **Shipped** v1.60.9 (`FlushMatrixPanel`, `POST /api/flush/matrix`).
- Per-triangle color painting / full AMS slot UX beyond flush matrix: still out of scope.

## Calibration
- Basic generators (temp tower + flow + procedural suite): shipped earlier.
- Deeper Orca `resources/calib/*.drc` port: still open / lower priority.

---

## Remaining open gaps (highest value)

1. Layer range min..max (9)
2. First-class travel / seam / retraction toggles (10)
3. Z out-of-bed tint + multi-select + exclusion zones (18–20)
4. Deeper calibration-generator suite
5. Paint / modifiers (explicitly out of scope unless engine story changes)

## Shipped rounds (reference)

- v1.57 settings · v1.58 viewport · v1.59 workflow · v1.60 preview
- v1.60.5 settings tree · v1.60.6 per-object · v1.60.7 warnings · v1.60.8 project · v1.60.9 AMS flush
