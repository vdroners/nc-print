# Changelog

## [1.3.1] - 2026-06-30

### Fixed

- **3D viewport:** queue pending model load after WebGL init; explicit 360px canvas height; `setSize(..., true)`; WebGL error banner; distinct STL error vs 3MF/OBJ loaded states
- **Workflow completion:** PrepareChecklist (model, profiles, slicer); Slice gated on `prepareComplete`; slice buttons require profiles; Print step gated until slice/G-code/print active
- **Silent failures:** STL preview errors toast + inline message; profile retry on Prepare

### Added

- Sticky **Next to Slice →** footer on Prepare; **Monitor on Print →** after slice; Print tab idle guided empty state
- Workflow banner step sub-labels; contextual Help tab from active workflow step; Services tab in Help (slicer status card moved off Prepare)
- Consolidated import cluster (toolbar + From Files); shared `pickFileFromNextcloud` composable; `ProfileSummaryChip` on Slice
- Automated gates G17–G19; VERIFY NS12.10–NS12.18 manual rows

## [1.3.0] - 2026-06-30

### Added

- Centered **Prepare · Slice · Print** workflow banner (NC-GCS `gcs-step-banner` pattern); removed duplicate tab bar and legacy stepper
- Pinned chrome + scrollable tab panel (`.nc-print-tab-scroll`) — long Slice/Prepare panels scroll correctly
- Files app **Open in NC 3D Print** action for STL/3MF/OBJ/G-code (`nc_print-files-action.mjs`)
- G-code deep link: `?fileId=&tab=print` loads file on Print tab
- **Slicer status card** on Prepare (forge-slicer version, engine, profiles path, latency)
- Multi-tool **filament breakdown** on slice result when forge-slicer returns per-tool grams
- Help drawer **Calibration** tab with OrcaSlicer wiki links
- API gates G16 (files-action bundle on disk)

### Fixed

- `FilesController::resolve` JSON body parsing and missing JSON response
- G-code fetch via `allow_gcode` on `/api/files/fetch` and `/resolve`

## [1.2.0] - 2026-06-30

### Added

- Workflow stepper with completion checkmarks (Prepare / Slice / Print)
- `localStorage` persistence for profile selection and collapsed overrides panel
- Lazy-loaded Prepare / Slice / Print tab chunks + Three.js chunk
- G-code layer preview scrubber on Slice tab
- Tab `aria-controls` / `tabpanel` wiring; responsive viewport/camera layout
- Auto-orient info toast on Prepare toolbar
- Profile vendor suffix in dropdown labels
- `docs/FEATURE_PORT.md` parity tracker

## [1.1.0] - 2026-06-30

### Added

- Three.js ModelViewport with build volume bed, STL mesh, orbit controls
- ProfilePicker on Prepare; override pre-fill from profile `settings_json`
- Node-based FilePicker + `POST /api/files/fetch` for Nextcloud models
- `?fileId=` deep link auto-load from page bootstrap
- ViewportToolbar (import, center on bed, clear, drop on viewport)
- Server slice cancel via `POST /api/slicer/jobs/:id/cancel`
- Print tab G-code upload (local + From Files)
- Moonraker state: `print_duration`, `total_duration`, filename
- Enhanced Help drawer with Workflow tab

## [1.0.1] - 2026-06-30

### Added

- ServiceHealthBanner + `/api/status` polling
- Toast notifications (lazy `@nextcloud/dialogs`)
- SliceResultPanel (layers, time, filament, G-code size, backend label)
- JobSummaryStrip; NC 3D Print branding
- Camera frame polling (Prepare PiP + Print tab)
- Print tab filename and Klipper status message
- Slice actions: Slice only / Slice and send (no checkbox)
- FilePickerClosed handling; static viewport perf fix
- `modelFileNode.js`, `status-api.js`, `toast.js`

### Fixed

- `config-api.js` dead routes replaced with unified `fetchAppStatus()`

## [1.0.0] - 2026-06-30

### Added

- NC Print standalone Nextcloud app (prepare, slice, print tabs)
- forge-slicer proxy with octet-stream → multipart slice streaming
- Moonraker printer API (state, pause/resume/cancel, upload+print)
- Admin settings for internal service URLs and group access
