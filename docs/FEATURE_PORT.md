# FEATURE_PORT.md — Forge Slicer Studio vs NC Print

Tracks UI and API parity against Forge [`slicer-studio.js`](/media/4TB/3dprintforge/src/public/js/components/slicer-studio.js) and forge-slicer REST API.

**Legend:** Done · v1.0.1 / v1.1 / v1.2 = shipped in that release · Deferred = not planned in v1.2

## Prepare tab (25 elements)

| # | Feature | NC Print v1.2 | Phase |
|---|---------|---------------|-------|
| P1 | Slicer health banner | ServiceHealthBanner | v1.0.1 |
| P2–P4 | Profile selects on Prepare | ProfilePicker | v1.1 |
| P5 | Override grid + pre-fill | Collapsible overrides + merge | v1.1 |
| P6 | Save quality preset | Deferred | — |
| P7–P8 | Import / file input | ViewportToolbar | v1.1 |
| P9 | Center on bed | Three.js recenter | v1.1 |
| P10 | Auto-orient info toast | ViewportToolbar | v1.2 |
| P11 | Model info line | ViewportToolbar | v1.1 |
| P12–P14 | Three.js viewport + STL | ModelViewport | v1.1 |
| P15 | 3MF/OBJ preview | Slice-only toast | v1.1 |
| P16–P18 | Viewport empty/drop/highlight | ModelViewport | v1.1 |
| P19 | 50 MB guard + toast | validateModelFile | v1.0.1 |
| P20 | OrbitControls | three/viewport.js | v1.1 |
| P21 | ResizeObserver (no rAF thrash) | Three.js + static fallback removed | v1.0.1 |
| P22 | is_default profiles | pickDefaultProfileId | v1.1 |
| P23 | Vendor in dropdown | ProfilePicker | v1.2 |
| P24 | Clear model | ViewportToolbar | v1.1 |
| P25 | Camera PiP | CameraPip | Done |

## Slice tab (21 elements)

| # | Feature | NC Print v1.2 |
|---|---------|---------------|
| S1–S4 | Slice + progress + layers | Done |
| S2 | Server cancel job | cancelSliceJob v1.1 |
| S5–S11 | SliceResultPanel | v1.0.1 |
| S12 | Preview PNG | Done |
| S13–S16 | Send section | Print tab + slice and send v1.1 |
| S17 | Slice and send | Done |
| S18 | Backend label | SliceResultPanel v1.0.1 |
| S19 | Merged settings | v1.1 |
| S20 | Read-only profile summary | SliceTab v1.1 |
| S21 | Go to Prepare CTA | v1.0.1 |

## Print tab (12 elements)

| # | Feature | NC Print v1.2 |
|---|---------|---------------|
| R1–R3 | State + progress + controls | Done + printerControls v1.0.1 |
| R4–R5 | Filename + message | v1.0.1 |
| R6 | Elapsed duration | v1.1 |
| R7–R8 | Temps + camera refresh | v1.0.1 |
| R9 | Camera error placeholder | v1.0.1 |
| R10 | G-code upload | PrintTab v1.1 |
| R11 | Upload toast | v1.0.1 |
| R12 | Auto-switch Print | Done |

## Global (10 elements)

| # | Feature | NC Print v1.2 |
|---|---------|---------------|
| G1 | NC 3D Print branding | v1.0.1 |
| G2 | /api/status banner | v1.0.1 |
| G3 | Toasts | v1.0.1 |
| G4 | Job summary strip | v1.0.1 lite → v1.1 full |
| G5 | Help workflow tab | v1.1 |
| G6 | fileId deep link | v1.1 |
| G7 | Node FilePicker + fetch API | v1.1 |
| G8 | Disable slice when offline | v1.0.1 |
| G9 | Wizard stepper | v1.2 |
| G10 | Files app integration | Deferred |

## forge-slicer API (via proxy)

| API | UI | Status |
|-----|-----|--------|
| GET /api/health | Status banner | v1.0.1 |
| GET /api/profiles | ProfilePicker | Done |
| POST /api/slice (SSE) | sliceStream | Done |
| GET jobs/gcode, preview.png | Slice tab | Done |
| POST jobs/:id/cancel | cancelSliceJob | v1.1 |
| POST /api/preview | — | Deferred v1.2+ |
| GET /api/jobs | — | Deferred v1.2+ |

## Coverage summary (v1.2)

~38% at v1.0 → **~85%** operator-facing parity at v1.2 (deferred: multi-printer picker, save preset, Files app handler, full 3MF preview).
