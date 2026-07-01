# Changelog

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
