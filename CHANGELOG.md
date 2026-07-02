# Changelog

## [1.9.0] - 2026-07-01

UX cohesion, trust/WYSIWYG, and a Mainsail/Fluidd-class monitoring foundation
(Part B). All new printer-control surfaces go through guarded, allowlisted
backend actions — never a raw G-code passthrough.

### Added — UX cohesion (WS1–WS9)

- Single body scroll with unified 1200/900 breakpoints; camera consolidated to a
  single live view (removed the redundant PiP + PrePrint preview) (WS1)
- `AppChromeBar` unified top chrome; healthy service-health banner auto-hides;
  notification bell (WS3)
- `NcPrintCollapsible` + grouped `ViewportToolbar` to reduce Prepare density (WS2)
- `SliceHandoffCard` unifies the slice summary and adds a "Monitor on Print" CTA;
  richer empty states on Slice (WS5)
- Compact job history on the Print monitor, completion filament stats, and a
  fullscreen camera overlay (Esc to close) (WS4)
- Bed legend + "Applied" badge; blocking gate when the viewport preview was
  skipped so slicing is never "blind" (WS6)
- Always-navigable Print monitor (idle-safe) plus reopen recent project/model and
  replay-slice from the chrome (WS8)
- Content max-width/centering, sticky-rail chrome offset via `--nc-print-chrome-h`,
  removed overflow clipping, spacing-token cleanup (WS9)

### Added — Mainsail/Fluidd-class monitoring (Part B, WS10–WS16)

- Live multi-series temperature graph with presets + PID tune (WS10)
- Read-only G-code console log with allowlisted send, gated behind an admin
  `console_enabled` toggle (default off) (WS11)
- Bed mesh heatmap + calibrate action (idle-only) (WS12)
- Print/job queue + mid-print exclude-object (WS13)
- Filament management: Spoolman spool + runout sensors, load/unload/purge, and
  last-slice cost estimate (WS14)
- Moonraker history/statistics + embedded G-code thumbnails (WS15)
- moonraker-timelapse integration: rendered-video list, in-app playback, download
  (feature-detected; hidden when the plugin is absent) (WS16)

### Security

- Moonraker proxy allowlist extended with read-only Part B prefixes only; raw
  `printer/gcode/script` passthrough stays blocked
- All write actions (bed mesh calibrate, filament, heater/PID, exclude-object) go
  through guarded `PrinterController` actions with parameter validation and
  idle/motion guards
- G-code console send disabled by default and admin-gated (`console_enabled`)

### Gates

- G27 version floor bumped to `>= 1.9.0`
- G34 (deployed sticky-chrome CSS), G35 (CSS/JS deploy freshness), G45 (proxy
  allowlist + console-off regression); new Vitest specs G38a–G44a; PHPUnit
  console/proxy guards

## [1.8.1] - 2026-07-01

Theme cohesion + presentation refresh aligned with NC-GCS visual language.

### Changed — UI polish

- Glass cards (`backdrop-filter`, shadow), inset sub-panels, accent-left banners
- Two-tier section headers (panel title + uppercase micro-labels)
- KPI stat tiles on Print monitor (elapsed, progress, layer, nozzle, bed)
- Shared `.nc-print-badge` and `.nc-print-dot` status indicators
- Pill toggle switches for auto-apply mesh and start-after-upload
- Input focus glow; refined button hover/variants (`--small`, `--icon`, `--ghost`)
- `NcPrintIcon` inline-SVG component (12 glyphs) on section headers and key actions

## [1.8.0] - 2026-07-01

UI/UX remediation: wire flagship Prepare studio, auto-apply WYSIWYG mesh, printer control surface, slice recovery, and expanded gates (G20–G27).

### Fixed — Core workflow (P0)

- **Auto-apply mesh ON by default** with Applied badge, opt-out toggle, and manual Apply when disabled
- **3-column Prepare studio** (`PrepareStudioLayout`): profiles left, viewport center, checklist + slice summary right
- **Clickable checklist** routes to import, mesh apply, profiles, mesh health
- **Multi-printer** pause/resume/cancel pass `printer_id`
- **Help drawer** Print tab opens Limitations panel (was blank)

### Fixed — Slice & Print (P1)

- Retry slice, G-code tab empty state, Restore settings label in job history
- Cancel confirmation, offline banner, target temps/heating, ETA, camera retry + proxy URL
- Removed redundant `JobSummaryStrip`; expanded settings diff and support type/threshold UI
- Toolpath scrubber travel-line color, ResizeObserver, loading state

### Added — Printer interface (P1.5)

- Temperature control + preheat presets + live sparkline
- In-print tuning (speed/flow/fan/babystep), manual motion (idle), emergency stop
- Print completion banner + guarded browser notifications
- Precise numeric scale/rotate panel; filament cost estimate on slice result

### Added — Backend

- `POST /api/printer/temperature`, `/emergency-stop`, `/gcode-action` with server-side clamping
- Camera proxy resolves per `printer_id`

### Gates

- API gates **G20–G27** (control routes, clamps, camera proxy, motion-while-printing, version ≥ 1.8.0)

## [1.7.0] - 2026-07-01

Roadmap release v1.4→v1.7: Prepare studio, WYSIWYG mesh, prep toolbox, slice confidence, Files-native G-code, toolpath scrubber, multi-printer ops, polish, and upstream stubs. See [`docs/plans/nc-print-ux-roadmap.md`](docs/plans/nc-print-ux-roadmap.md).

### Added — Prepare studio (Sprint A)

- **3-column Prepare layout** (`PrepareStudioLayout.vue`): profiles left, viewport center, checklist + CTA right (≥1200px)
- **Slice summary card** with filename, bbox, fits-bed, dirty badge
- **Clickable checklist** rows focus the matching fix control
- **First-run empty state** with import / From Files / 3-step diagram
- **Profile search** and last-used pin in `ProfilePicker`
- **Merged workflow banner** (job strip folded into status row)

### Added — WYSIWYG mesh (Sprint B)

- **`meshState`** in Pinia: position, rotation, scale, `sliceBlob`, dirty flag, auto-apply
- **Apply to slice** exports viewport transform to STL before slice
- **Session prefs** restore profiles + transform per `fileId`

### Added — Prep toolbox (Sprint C)

- **Lay flat / scale-to-fit / auto-orient** (6 axis-aligned rotations)
- **OBJ** preview and slice (OBJ→STL client-side)
- **Mesh analyze & repair** (`MeshHealthPanel`, browser fallback — forge `/api/mesh/*` 404)
- **Support + adhesion overrides** (enable, type, threshold, brim, raft, skirt)
- **Multi-object 3MF picker** (`ThreeMfObjectPicker.vue`)
- **Recent models strip** (last 5 paths)

### Added — Slice confidence (Sprint D)

- **Settings diff review** before slice (`SliceReviewPanel.vue`)
- **Tabbed results** Summary / Toolpath / G-code / Settings (`SliceResultTabs.vue`)
- **Pre-print modal** before Slice & Send (`PrePrintModal.vue`)
- **PNG lightbox** (`PreviewLightbox.vue`)
- **Support material stats** on slice result panel

### Added — Files & history (Sprint E)

- **Save G-code to Files** — `POST /api/files/save-gcode` sibling WebDAV write
- **Job history** panel (local 20 rows + optional forge job enrich)

### Added — Toolpath & workspace (Sprint F)

- **G-code layer scrubber** (`ToolpathScrubber.vue`, `gcode-toolpath.js`)
- **Workspace rail** on Prepare / Slice / Print tabs
- **Preview API probe** documented; 501 → defer to Sprint J

### Added — Lab ops (Sprint G)

- **Multi-printer picker** (admin JSON config)
- **Local named presets** (forge `POST /api/profiles` still 404)
- **Moonraker WebSocket** client for live progress
- **Estimate vs actual** on Print tab

### Added — Polish & advanced prep (Sprints H–I)

- **Keyboard shortcuts**, SSE stage copy, **error recovery cards**
- **Draggable camera PiP**, admin onboarding hints, a11y pass
- **Profile quick-edit** (15+ params), **multi-tool filament slots**
- **Tablet 1024px** responsive collapse

### Added — Upstream stubs (Sprint J)

- Feature flags for batch slice and forge 3D preview (disabled until upstream ships)
- [`docs/plans/sprint-j-upstream.md`](docs/plans/sprint-j-upstream.md)

### Documentation

- [`docs/plans/forge-slicer-api-audit.md`](docs/plans/forge-slicer-api-audit.md) (Sprint 0)
- Updated [`docs/FEATURE_PORT.md`](docs/FEATURE_PORT.md) coverage ~95%

## [1.3.5] - 2026-06-30

### Fixed

- **Viewport bed orientation:** Z-up camera so the build plate lies flat on the floor (was appearing as a vertical wall with default Y-up Three.js)
- **3MF import/slice:** Orca/Creality project 3MFs are flattened client-side to STL for forge-slicer (linked object files no longer fail as "empty")
- **3MF preview:** mesh extracted in-browser and shown on the bed like STL

### Added

- **Prepare tab:** override settings panel (layer, line width, perimeters, infill, speeds, temps) moved from Slice tab
- **Viewport toolbar:** rotate 90° on X/Y/Z axes; model dimensions in the info line
- **Prepare checklist:** slice-ready mesh row for 3MF conversion status

## [1.3.4] - 2026-06-30

### Fixed

- **Slice SSE root cause:** proxy now forwards `slice/stream` to forge-slicer `api/slice/stream` (was incorrectly mapped to `api/slice`, which returns buffered JSON with no `event: done`)
- **JSON fallback:** client accepts buffered `application/json` slice responses when SSE is unavailable
- **G-code recovery:** ranged GET fallback when HEAD is unsupported on the gcode proxy path

## [1.3.3] - 2026-06-30
