# nc-print: port four self-contained features from 3dprintforge

## Why

nc-print is a mature self-contained Nextcloud slicer. We mined the original
**3dprintforge** project (`/media/4TB/3dprintforge`, planning mirror at
`/media/4TB/Planning/slicers/3dprintforge/`) for portable capability nc-print
lacks. Three parallel exploration passes inventoried forge (~130 server modules),
diffed against nc-print's current surface, and scored portability. Four
**pure-algorithm, printer-agnostic** modules stand out as genuine gaps that
complement existing features. We port all four, full depth (backend + UI +
tests). They are unrelated, so each ships as its own version bump
(independently deployable/verifiable) rather than one commit.

Forge modules are ES6 JS; nc-print's slice logic lives in the Python sidecar
(`slicer/adapter/`). Ports go to the sidecar where they touch slicing/gcode, with
thin PHP proxying handled by the generic `SlicerProxyController` allowlist —
except **ETA learning**, which needs persistent per-printer history and fits
better as a small PHP service + app-config store.

## Phase 1 — v1.20.0: Calibration generator suite  ✅ (this commit)

Port forge's seven procedural generators (temp tower, retract tower, flow test,
pressure-advance tower, PA pattern, first-layer, single-line). These **emit
G-code directly** (no slice engine) — a new, simpler path than the current
3MF-slice calibration.

- `slicer/adapter/calibration_gcode.py`: the seven `generate_*` functions +
  header/prelude/postlude helpers, returning
  `{name, description, gcode, expected_minutes, filament_g, type}`. Output is
  deterministic (no wall-clock timestamp) for reproducible G-code.
- `main.py`: `GET /api/calibration/list` now also returns a `generators` array
  (kind `gcode`); new `POST /api/calibration/generate` writes the G-code to a job
  dir, returned via the existing `GET /api/jobs/{id}/gcode`. No engine exec.
- `CalibrationPanel.vue`: a "Generator prints" section — card grid + per-generator
  param forms + Generate button; result flows into the standard slice-result path
  (Save-to-Files / Send-to-printer).
- Tests: adapter (all seven emit valid marked G-code; temp-tower monotonic;
  param + unknown-type validation); frontend (`calibration-api.spec`).

## Phase 2 — v1.21.0: Filament material database + info panel

Port the 15-material reference; surface as a materials info/recommend panel and
smarter one-click temp defaults.
- `slicer/adapter/filament_materials.py` (data + lookups); `GET /api/materials`,
  `GET /api/materials/{id}`; `materials-api.js` + `MaterialInfoPanel.vue` with a
  "use these temps" action that writes the existing override store.

## Phase 3 — v1.22.0: Multi-color flush + color-order optimizer

Port the OrcaSlicer-faithful flush model + asymmetric color ordering.
- `slicer/adapter/color_order.py` (flush-calc + color-order + color-names);
  `POST /api/color-order`; `color-order-api.js` + `ColorOrderPanel.vue` (Slice
  tab) showing recommended load order + purge saved vs listed order.

## Phase 4 — v1.23.0: ETA learning (slicer-vs-actual)

Port EWMA-based per-printer/material ETA correction. Needs persistence and is
print-monitor-side, so implement in PHP.
- `lib/Service/EtaLearningService.php` (EWMA buckets in app-config, α≈0.25, ratio
  clamp 0.3–3.0); `POST /api/eta/predict`, `POST /api/eta/record`; predicted-vs-
  slicer surfaced in `SliceResultPanel`, record on print completion.

## Out of scope (verified low-portability / not needed)

native-slicer (nc-print uses the real CLI engine), all printer-protocol clients
(MQTT/Moonraker/Prusa/etc.), Bambu-cloud, CRM/ecommerce, AI/LLM model-forge,
camera failure-detection, Spoolman deep-sync.

## Per-phase workflow

implement + tests → `make slicer-test` / `npm run test` / `make run-phpunit` →
version bump (info.xml + package.json + package-lock ×2 + README badge) +
CHANGELOG → `npm run build` → `make slicer-up` (if adapter changed) →
`make deploy` → `make gate-preflight` → commit (env -i, Claude trailer) → push.
