# FEATURE_PORT.md — Forge Slicer Studio vs NC Print

> **Historical tracker.** This document records early Forge Studio / forge-slicer
> parity work through ~v1.7. For the **live** gap list against mainstream
> slicers (Orca / Prusa / Bambu / Cura), use
> [`docs/plans/slicer-gui-alignment.md`](plans/slicer-gui-alignment.md)
> (refreshed through the 1.57–1.60.9 alignment round).

Tracks UI and API parity against Forge [`slicer-studio.js`](/media/4TB/3dprintforge/src/public/js/components/slicer-studio.js) and the former forge-slicer REST API. The app now owns `nc-print-slicer` (Orca-fork sidecar); several “upstream 404/501” rows below are obsolete.

**Legend:** Done · v1.x = shipped · Deferred = backlog / upstream blocked

## Roadmap backlog → sprint map (C1–C6)

| Backlog ID | Theme | Sprint | Status |
|------------|-------|--------|--------|
| C1 | Split workspace right rail | F (v1.5.2) | Done — `WorkspaceRail.vue` |
| C2 | Pre-print modal before Slice & Send | D (v1.5.0) | Done — `PrePrintModal.vue` |
| C3 | PNG preview lightbox | D (v1.5.0) | Done — `PreviewLightbox.vue` |
| C4 | Save quality preset to forge | J (v1.7.x) | Deferred for **external** forge `POST /api/profiles` — **local named presets shipped** (v1.6+) |
| C5 | Estimate vs actual on Print | G (v1.6.0) | Done |
| C6 | Interactive toolpath preview | F → later | Done — 2D scrubber (v1.7) + **3D toolpath** on owned sidecar (`GET /api/jobs/{id}/toolpath`, `Toolpath3D`, color-by-speed in v1.60) |

## v1.7.0 shipped (2026-07-01)

| Sprint | Highlights |
|--------|------------|
| 0 | forge-slicer API audit, proxy map, checked-in roadmap |
| A | 3-column Prepare studio, slice summary, checklist actions, empty state, profile search |
| B | meshState WYSIWYG, Apply/auto-apply, session restore |
| C | Lay flat, scale, OBJ, mesh analyze/repair, auto-orient, supports, 3MF picker, recent models |
| D | Slice review diff, tabbed results, pre-print modal, lightbox, support stats |
| E | Save G-code to Files, job history |
| F | G-code layer scrubber, workspace rail |
| G | Multi-printer, local presets, Moonraker WS, estimate vs actual |
| H | Shortcuts, SSE copy, error cards, camera PiP, a11y |
| I | Profile quick-edit, multi-tool filament, tablet 1024px |
| J | Upstream stubs (batch slice, forge preview flags off) |

## v1.3.1 shipped (2026-06-30)

| Item | Component |
|------|-----------|
| Viewport load queue + WebGL errors | ModelViewport v1.3.1 |
| PrepareChecklist | PrepareChecklist.vue |
| Files Open in NC 3D Print | files-action.mjs v1.3.0 |
| Slicer status (Help → Services) | SlicerStatusCard |
| Multi-tool filament breakdown | SliceResultPanel v1.3.0 |
| Workflow banner + scroll fix | PrintWorkflowBanner v1.3.0 |

## Prepare tab

| # | Feature | NC Print | Phase |
|---|---------|----------|-------|
| P1 | Slicer health banner | ServiceHealthBanner | v1.0.1 |
| P2–P4 | Profile selects on Prepare | ProfilePicker + search | v1.7 |
| P5 | Override grid + pre-fill | PrepareOverrides + ProfileQuickEdit | v1.7 |
| P6 | Save quality preset | Local named presets | v1.6 (forge POST deferred) |
| P7–P8 | Import / file input | ViewportToolbar | v1.1 |
| P9 | Center on bed | Three.js recenter | v1.1 |
| P10 | Auto-orient | MeshHealthPanel + toolbar | v1.7 |
| P11 | Model info line | ViewportToolbar | v1.1 |
| P12–P14 | Three.js viewport + STL/OBJ/3MF | ModelViewport + meshState | v1.7 |
| P15 | 3MF multi-object picker | ThreeMfObjectPicker | v1.7 |
| P16–P18 | Viewport empty/drop/highlight | PrepareEmptyState + ModelViewport | v1.7 |
| P19 | 50 MB guard + toast | validateModelFile | v1.0.1 |
| P20 | OrbitControls + view presets | three/viewport.js | v1.7 |
| P21 | ResizeObserver | ModelViewport | v1.0.1 |
| P22 | is_default profiles | pickDefaultProfileId | v1.1 |
| P23 | Vendor in dropdown | ProfilePicker | v1.2 |
| P24 | Clear model | ViewportToolbar | v1.1 |
| P25 | Camera PiP (draggable) | CameraPip | v1.7 |
| — | 3-column studio layout | PrepareStudioLayout | v1.7 |
| — | Slice summary + dirty badge | SliceSummaryCard | v1.7 |
| — | Mesh analyze/repair | MeshHealthPanel | v1.7 |
| — | Support/adhesion overrides | PrepareOverrides | v1.7 |
| — | Recent models strip | RecentModelsStrip | v1.7 |
| — | Workspace rail | WorkspaceRail | v1.7 |

## Slice tab

| # | Feature | NC Print |
|---|---------|----------|
| S1–S4 | Slice + progress + layers | Done |
| S2 | Server cancel job | cancelSliceJob v1.1 |
| S5–S11 | SliceResultPanel + support stats | v1.7 |
| S12 | Preview PNG + lightbox | v1.7 |
| S13–S16 | Send section | Print tab + slice and send |
| S17 | Slice and send + pre-print modal | v1.7 |
| S18 | Backend label | SliceResultPanel |
| S19 | Merged settings + review diff | SliceReviewPanel v1.7 |
| S20 | Tabbed results | SliceResultTabs v1.7 |
| S21 | Go to Prepare CTA | v1.0.1 |
| — | G-code layer scrubber | ToolpathScrubber v1.7 |
| — | Save G-code to Files | GcodeSaveController v1.7 |
| — | Job history | JobHistoryPanel v1.7 |

## Print tab

| # | Feature | NC Print |
|---|---------|----------|
| R1–R3 | State + progress + controls | Done + Moonraker WS v1.7 |
| R4–R5 | Filename + message | v1.0.1 |
| R6 | Elapsed duration | v1.1 |
| R7–R8 | Temps + camera refresh | v1.0.1 |
| R9 | Camera error placeholder | v1.0.1 |
| R10 | G-code upload | PrintTab v1.1 |
| R11 | Upload toast | v1.0.1 |
| R12 | Auto-switch Print | Done |
| — | Multi-printer picker | MultiPrinterPicker v1.7 |
| — | Estimate vs actual | PrintTab v1.7 |
| — | Workspace rail | WorkspaceRail v1.7 |

## Global

| # | Feature | NC Print |
|---|---------|----------|
| G1 | NC 3D Print branding | v1.0.1 |
| G2 | /api/status banner | v1.0.1 |
| G3 | Toasts | v1.0.1 |
| G4 | Job summary in workflow banner | v1.7 |
| G5 | Help workflow tab | v1.1 |
| G6 | fileId deep link | v1.1 |
| G7 | Node FilePicker + fetch API | v1.1 |
| G8 | Disable slice when offline | v1.0.1 |
| G9 | Wizard stepper | v1.2 |
| G10 | Files save G-code sibling | v1.7 |
| — | Keyboard shortcuts | App.vue v1.7 |
| — | Error recovery cards | ErrorRecoveryCard v1.7 |
| — | Multi-tool filament slots | MultiToolFilamentPicker v1.7 |

## Slicer API (via proxy) — owned `nc-print-slicer`

| API | UI | Status |
|-----|-----|--------|
| GET /api/health | Status banner | v1.0.1 |
| GET /api/profiles | ProfilePicker | Done |
| POST /api/profiles | Save preset to **external** forge | Still N/A — **local named presets** v1.6+ |
| POST /api/slice/stream (SSE) | sliceStream | Done (CLI-exec adapter) |
| GET jobs/gcode | Slice tab | Done |
| POST jobs/:id/cancel | cancelSliceJob | v1.1 |
| GET /api/jobs/{id}/toolpath | Toolpath3D | **Shipped** on owned sidecar (not forge `/api/preview`) |
| POST /api/mesh/analyze | MeshHealthPanel | **Shipped** on owned sidecar |
| POST /api/project/pack | Save project (.3mf) | **Shipped** v1.60.8 |
| POST /api/flush/matrix | AMS flush matrix | **Shipped** v1.60.9 |

Historical forge-slicer audit (obsolete): [`docs/plans/archive/forge-slicer-api-audit.md`](plans/archive/forge-slicer-api-audit.md) after the plans archive lands.

## Coverage summary

~38% at v1.0 → **~85%** at v1.2 → **~95%** operator-facing parity at v1.7; slicer-GUI alignment round (1.57–1.60.9) closed most remaining table-stakes gaps.

**Still deferred / out of scope:** external forge `POST /api/profiles`, seam/fuzzy region painting, modifier meshes, phone-first UX. Live backlog: [`plans/slicer-gui-alignment.md`](plans/slicer-gui-alignment.md).
