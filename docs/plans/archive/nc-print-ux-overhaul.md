# NC Print UX & Workflow Overhaul

Checked-in plan for the Prepare → Slice → Print UX overhaul (v1.0.1 → v1.2).

## Goal

Bring NC Print from an engineering MVP (~38% Forge Slicer Studio parity) to an operator-ready workflow: service health visibility, toasts, real Three.js viewport, profiles on Prepare, Files integration, and polish (wizard, persistence, a11y).

## Phases

### v1.0.1 — Quick wins

- `ServiceHealthBanner` + `/api/status` polling
- Toast service (lazy `@nextcloud/dialogs`)
- `SliceResultPanel` (layers, time, filament, G-code size)
- Simplified slice actions (Slice only / Slice and send)
- Print tab: filename, Klipper message, camera refresh
- `JobSummaryStrip` lite, branding → NC 3D Print
- FilePicker cancel handling, static ModelViewport (no rAF thrash)
- `modelFileNode.js` helpers, TROUBLESHOOTING NC-core console section

### v1.1 — Core workflow

- Three.js `ModelViewport` (lazy chunk), bed from `buildVolume`, STL load
- `ProfilePicker` on Prepare, override pre-fill from `settings_json`
- Node FilePicker + `POST /api/files/fetch` (DAV / file_id deep link)
- `ViewportToolbar` (import, center, clear, drop on viewport)
- Server slice cancel (`POST /api/slicer/jobs/:id/cancel`)
- Print tab G-code upload (local + Files)
- Enhanced job strip, Help drawer workflow tab

### v1.2 — Polish

- Wizard stepper with completion checkmarks
- `localStorage` profile / UI prefs
- Lazy-loaded Slice/Print tabs, G-code layer preview
- Tab a11y (`aria-controls`, responsive layout)
- `docs/FEATURE_PORT.md` parity tracker

## Verification

- `make test && make build && make deploy`
- Manual: health banner when slicer stopped, STL viewport, Files picker, G-code upload
- See `docs/VERIFY.md` NS2/NS3/NS4/NS12 rows

## Reference

- Forge: `/media/4TB/3dprintforge/src/public/js/components/slicer-studio.js`
- Planning mirrors: `/media/4TB/Planning/slicers/`
