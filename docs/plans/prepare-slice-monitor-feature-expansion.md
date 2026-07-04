# nc-print v1.27.0: Prepare/Slice quality controls + Monitor expansion

## Why / scope

Review of the Prepare, Slice and Monitor tabs against professional slicers
(OrcaSlicer/PrusaSlicer/Bambu) and Mainsail/Fluidd surfaced concrete, feasible
gaps. All engine keys below were **verified present in the shipped OrcaSlicer-fork
process presets**; all Moonraker endpoints were verified against the live K1
(`/server/info` components: job_queue, history, announcements, webcam,
update_manager). The user chose to ship everything selected as **one version
bump (v1.27.0)**. (Curated macro runner was NOT selected — out of scope.)

## Part A — Slice/Prepare quality controls (engine-verified keys)

Extend `slicer/adapter/overrides.py` `_MAP`, the store `overrides` object, and
the override UI (`ProfileQuickEdit.vue` / `PrepareOverrides.vue`). Overrides merge
into the process/filament preset JSON exactly like the existing 19 keys — no
engine/CLI change.

New override keys (frontend key → engine key, scope, type):
1. **Infill + surface patterns**
   - `infill_pattern` → `sparse_infill_pattern` (process, str; enum:
     grid/gyroid/honeycomb/cubic/concentric/rectilinear/…)
   - `top_surface_pattern` → `top_surface_pattern` (process, str;
     monotonic/concentric/rectilinear/…)
   - `bottom_surface_pattern` → `bottom_surface_pattern` (process, str)
2. **Per-feature speeds**
   - `infill_speed` → `sparse_infill_speed` (process, num)
   - `solid_infill_speed` → `internal_solid_infill_speed` (process, num)
3. **Support interface tuning**
   - `support_top_gap` → `support_top_z_distance` (process, num)
   - `support_interface_layers` → `support_interface_top_layers` (process, num)
   - `support_interface_spacing` → `support_interface_spacing` (process, num)
4. **First-layer height**
   - `first_layer_height` → `initial_layer_print_height` (process, num)

Enum value lists come from the engine preset schema; the frontend offers a
curated subset with a "profile default" (empty) option so an unset override keeps
the profile value. Validation: `overrides.py` already coerces num/str; add the
new keys to the num/str handling. Only send non-empty overrides (existing
behaviour in `buildSliceOverrides`).

### Per-feature cost/weight breakdown (Slice result)
`slicer/adapter/gcode_stats.py` already computes per-feature grams (model vs
support). Surface a breakdown row-set in `SliceResultPanel.vue` (model / support /
brim+raft/skirt / other) with grams and, when a filament price is set, cost.
Reuse the existing `materialStats` payload; extend the stats emitter only if a
category is missing. No new endpoint.

Tests (Part A):
- adapter: `overrides.py` maps each new key to the right engine key/scope/type;
  enum passthrough; empty/omitted keys don't appear in the merged preset.
- frontend: store carries the new override keys; `buildSliceOverrides` includes
  them only when set; SliceResultPanel renders the per-feature breakdown.

## Part B — Monitor tab additions (Moonraker verified)

### B1. Power devices + webcam picker
- **Power**: `machine/device_power/` is already allowlisted and `power` is
  already feature-detected. Add a `PowerDevicePanel.vue` (shown when
  `features.power`): GET `/machine/device_power/devices` (+ `/status`), render a
  toggle per device, POST `/machine/device_power/device?device=..&action=on|off`
  through the read/allowlisted proxy. Confirm the exact allowlist prefix covers
  the `devices`/`status`/`device` subpaths.
- **Webcams**: add `server/webcams` to `MoonrakerProxyController` allowlist +
  feature-detect `webcam` in `ApiController`. New `WebcamPicker` (shown when the
  list has >1 entry): GET `/server/webcams/list`, radio-select, swap the camera
  stream URL used by the existing camera view. Single-webcam setups are
  unaffected (picker hidden).

### B2. Extrude/retract + sensor readouts
- **Extrude/retract**: add a guarded `filament_extrude` action to
  `PrinterController::ALLOWED_GCODE_ACTIONS` + `buildGcodeScriptForAction`
  (idle-only; `M83` + `G1 E±<mm> F<feed>`; clamp |mm| ≤ 50, feed fixed/clamped).
  Buttons (±0.1/1/10 mm) in `FilamentPanel.vue`. Reuses the existing gcodeAction
  gate + idle guard.
- **Sensors**: a `SensorPanel.vue` reading `printer.objects/query` for
  `temperature_sensor <name>` (chamber etc.) and
  `filament_switch_sensor`/`filament_motion_sensor` states — parsed from the
  already-allowlisted `printer/objects/`. Feature-detected at runtime (only shows
  sensors that exist).

### B3. Update + announcements banner
- Allowlist `machine/update_manager/status` (or `machine/update/status`) and
  `server/announcements/` in `MoonrakerProxyController`; feature-detect
  `update_manager` and `announcements` in `ApiController`.
- `UpdateStatusBanner.vue` — polls update status on connect; shows "N updates
  available (klipper, moonraker, …)" (read-only; no update-trigger button in
  this round — status only). `AnnouncementsBanner.vue` — lists active Moonraker
  announcements. Both dismissible, hidden when absent.

Tests (Part B):
- PHP: `MoonrakerProxyController` allowlist accepts the new read prefixes and
  still rejects out-of-scope paths (extend `ProxyAllowlistTest`);
  `PrinterController` builds the `filament_extrude` script with clamping +
  idle-only gating (extend the clamping/action tests); `ApiController` feature
  map includes `webcam`/`update_manager`/`announcements`.
- frontend: power-panel toggle posts the right action; webcam picker swaps the
  stream URL; extrude/retract posts clamped mm; banners render from mocked
  status; all panels hide when the feature is absent.

## Out of scope (this round)
Curated macro runner (not selected), LED/neopixel control, per-object slice
settings, support/seam painting, wipe-tower config UI, job-queue reorder
persistence, live gcode-position 3D overlay, firmware update *trigger* (status
only). Noted for later.

## Workflow
Single version bump v1.27.0 (info.xml + package.json + package-lock ×2 + README
badge) + CHANGELOG + README feature lines. `make slicer-up` (adapter changed:
overrides.py/gcode_stats.py) + `make deploy`. Full suites (adapter/vitest/
phpunit) + `make gate-preflight` green. Verify e2e against the live K1 where it
touches Moonraker (power absent → panel hidden; webcam/update/announcements
present). Commit (env -i, Claude trailer, no cursor) + push. Restart cloud_app
after deploy to flush PHP opcache so new routes/allowlist take effect.

## Verification
- Slice: set infill=gyroid + support interface gap → sliced g-code reflects it;
  per-feature breakdown sums to the total filament grams.
- Monitor: webcam picker lists the K1 cam; update banner shows the K1's pending
  updates; announcements render; extrude/retract refused while printing; power
  panel hidden on the K1 (no power plugin) but the endpoint path is allowlisted.
- Gate G00–G45 green; deployed version 1.27.0.
