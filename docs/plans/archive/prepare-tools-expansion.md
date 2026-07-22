# Prepare tools expansion (Creality-style)

Status: v1.11.0 (original palette, below) → **v1.56.0 adds the deferred tools
(see "v1.56.0 expansion" at the bottom).**

---

## v1.56.0 expansion (2026-07-12)

Picks up the tools the v1.11.0 plan explicitly deferred, plus a continuity pass.
Build straight through, ship one v1.56.0. Rail grouped by kind: Transform
(move/rotate/scale) · Orient (auto-orient/lay-on-face/mirror) · Modify
(cut/drill/hollow/emboss) · View/utility (view & section, measure, arrange all).
Multiple build plates render as tabs above the viewport.

**Deferred still** (need per-triangle/per-layer 3MF encoding proven on the
OrcaSlicer-fork engine first): support painting, seam painting, variable layer
height.

### Infrastructure
- Add `three-bvh-csg` + `three-mesh-bvh`. New `src/services/mesh-boolean.js`:
  `subtract/union/intersect({positions,indices}, {positions,indices})`. Cap tri
  count for perf; used by drill, emboss, hollow drain hole.

### New tools
1. **Multiple build plates** — store `plates[]` (per-plate object set + selection)
   + `activePlateId`; plate-tab strip above the viewport; Slice slices the active
   plate. Reuses the multi-object scene + per-plate sceneSliceFiles.
2. **Arrange all** — Prepare-side grid/bin-pack of the active plate's objects
   within bed bounds (viewport `arrangeObjects()`), a utility action.
3. **Measure** — click two surface points → distance; live bbox-dims HUD.
4. **Drill** — pick face+normal → cylinder → CSG subtract (diameter/depth/through).
5. **Hollowing (robust)** — inner offset shell at a wall thickness (SDF/offset with
   self-intersection guard) + optional drain hole (CSG).
6. **Emboss/deboss** — text → mesh (one bundled font) on a picked face, raised
   (union) or recessed (subtract) at a depth.

### Continuity pass
Review move/rotate/scale/auto-orient/lay-on-face/mirror/cut: gizmo↔panel sync,
undo coverage, apply-to-slice, multi-object correctness; fix gaps.

### Tests + ship
vitest: mesh-boolean (subtract removes volume/opens a hole), arrange (no overlap,
within bed), plates store (add/switch/remove per-plate objects), emboss text mesh,
source-regex for new rail tools/panels. `make ship`; live-verify each tool on the
K1 Max; commit v1.56.0.

---

## v1.11.0 (original palette)

Status: implemented in v1.11.0

## Goal

Turn the Prepare tab's thin toolbar into a full tool palette modeled on
Creality Print / Orca: interactive 3D gizmos (move / rotate / scale) plus
an extensive, grouped tool listing the user picks from. Scope is a broad
**client-side** geometry / orientation pass with interactive gizmos.

Explicitly deferred: multi-object plate / auto-arrange, support enforcers &
seam painting, resin hollow / drain holes.

## Tool palette

Grouped like Creality's left rail; each tool opens a contextual panel that
floats over the viewport next to the rail.

- **Transform**
  - Move — translate gizmo + numeric X/Y/Z position + Drop to bed + off-bed
    warning.
  - Rotate — rotate gizmo + per-axis degrees + 90° snap buttons + Lay flat +
    Auto-orient + Reset rotation.
  - Scale — scale gizmo + uniform % + per-axis factors + To-size (mm) with
    lock-aspect + Scale to fit + Reset scale.
- **Orient**
  - Place on face — click a facet, that face rotates flat onto the plate
    (raycast pick + bake).
  - Mirror X / Y / Z — negate one axis and flip triangle winding so normals
    stay outward (baked).
- **Modify**
  - Plane cut — axis + offset (live plane preview) + keep top/bottom +
    optional cap (baked).
- **View (non-destructive)**
  - Camera presets: Top / Front / Right / Iso / Fit.
  - Wireframe toggle.
  - Section clip plane (renderer-level clipping; never baked into geometry).

Retained: Analyze / Repair (Mesh health panel), Apply / Auto-apply, Reset
transform, Center on bed.

## Architecture

- The viewport is a single `modelMesh` in a Z-up Three.js scene
  (`src/three/viewport.js`). `OrbitControls` was already present.
- **Two transform modes:**
  - *Scene-graph* — edits `position/rotation/scale`; baked on export via
    `matrixWorld` in `exportTransformedMesh`. Used by gizmos, numeric
    move/rotate/scale, reset.
  - *Vertex bake* — `getMeshSnapshot()` (world-space positions) →
    `mesh-analyze.js` / `mesh-cut.js` → `applyMeshSnapshot()` →
    `setMeshData()`. Used by lay-flat, auto-orient, place-on-face, mirror,
    cut, repair. Baked ops are permanent (Reset transform / Reload original
    to recover).
- Gizmo uses Three.js `TransformControls` (r0.170 API: `control.getHelper()`
  added to scene). `dragging-changed` gates `OrbitControls`; `objectChange`
  is debounced into `setMeshTransform` + dirty + auto-apply, matching the
  existing `_scheduleTransformSync` path.
- Slicing consumes `meshState.sliceBlob` (client STL) once clean; edits mark
  dirty and (default) auto-apply.

## Data / interaction flow

```
PrepareToolRail --tool-change--> PrepareTab --setGizmoMode / op--> ModelViewport
  ModelViewport --> TransformControls --objectChange--> _scheduleTransformSync
    --> print.js meshState --autoApply--> sliceBlob (STL)
  ModelViewport --raycast pick face / bake--> getMeshSnapshot
    --> mesh-analyze / mesh-cut --> applyMeshSnapshot
PrepareToolPanel --numeric edits / actions--> PrepareTab
```

## Components

- `PrepareToolRail.vue` — vertical grouped icon rail overlaid on the left of
  the studio viewport; emits `tool-change`.
- `PrepareToolPanel.vue` — floating contextual panel rendering the active
  tool's controls; numeric inputs stay in sync with the gizmo via
  `getTransform()` / `getWorldBounds()`.
- The old standalone "Precise transform" collapsible is retired; its numeric
  scale/rotate controls now live in the Move / Rotate / Scale panels.

## New / changed math

- `mesh-analyze.js`: `applyScaleVector(positions, [sx,sy,sz])`,
  `mirrorMesh(positions, indices, axis)` (negate axis + reverse winding).
- `mesh-cut.js` (new): `cutMeshByPlane(positions, indices, { axis, position01,
  keep, cap })` — Sutherland–Hodgman half-space clip per triangle, keep one
  side (single-mesh constraint), optional centroid-fan cap of the cross
  section. (earcut was evaluated but not adopted: robust capping needs
  contour-loop extraction; the centroid-fan cap is correct for convex
  sections and best-effort for concave, which matches the deferred scope.)

## Verification

- Vitest units for `applyScaleVector`, `mirrorMesh` (winding + bbox),
  `cutMeshByPlane` (kept-side triangle counts + cap), and place-on-face
  rotation math; plus a light rail/panel presence gate. All existing gates
  (spacing G37a etc.) stay green.
- `npm run build`; `make deploy` (`occ upgrade`); live check at
  `?tab=prepare` (gizmos drag, place-on-face, mirror, cut, camera/wireframe/
  section) with a screenshot.
- PHP API gates.

## Risks & mitigations

- Non-uniform / mirror scale can invert normals in the exported STL —
  mirror is baked into geometry with a winding flip, not a negative
  scene-graph scale.
- Plane-cap triangulation is best-effort on concave sections (centroid-fan).
- Gizmo vs OrbitControls input conflicts — gated via `dragging-changed`.
- Baked ops are permanent — Reset transform (scene-graph) + Reload original
  (re-fetch file) recover.
