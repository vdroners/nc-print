# NC Print v1.9.0 — UX cohesion, trust, and Mainsail/Fluidd-class monitoring

Checked-in, human-readable version of the Cursor plan
`nc_print_v1.9_ux_6919ae06`. Source of truth for the v1.9.0 release scope.

## Why

Two goals in one release:

1. **UX cohesion + trust (WS1–WS9):** make the Prepare → Slice → Print
   workflow feel like one coherent app — single scroll, unified breakpoints,
   one live camera, unified top chrome, denser Prepare, a real Slice→Print
   handoff, WYSIWYG trust (bed legend, Applied badge, no "blind" slicing),
   free navigation to the Print monitor, and spacing/clipping cleanup.
2. **Mainsail/Fluidd-class monitoring foundation (Part B, WS10–WS16):** add
   the printer-management surfaces operators expect, done **safely** —
   read-only through the Moonraker proxy allowlist, writes through guarded
   `PrinterController` actions, and the G-code console admin-gated + off by
   default.

## What changes

### Part A — UX cohesion (WS1–WS9)

- **WS1** Single body scroll; unified 1200/900 breakpoints; camera
  consolidated to one live view (removed PiP + PrePrint preview duplication).
- **WS2** `NcPrintCollapsible` + grouped `ViewportToolbar` to reduce Prepare
  density.
- **WS3** `AppChromeBar` unified top chrome; healthy health-banner auto-hide;
  notification bell.
- **WS4** Compact job history on Print; completion filament stats; fullscreen
  camera (Esc to close).
- **WS5** `SliceHandoffCard` unifies the slice summary + "Monitor on Print"
  CTA; richer empty states.
- **WS6** Bed legend; mesh "Applied" badge; block slicing when the viewport
  preview was skipped and there is no slice blob (no blind slicing).
- **WS8** Always-navigable, idle-safe Print monitor; reopen recent
  project/model and replay-slice from the chrome.
- **WS9** Content max-width/centering; sticky-rail chrome offset via
  `--nc-print-chrome-h`; remove overflow clips; untruncate subtitles; spacing
  tokens.

### Part B — Monitoring foundation (WS10–WS16)

- Proxy allowlist extended with **read-only** Part B prefixes only
  (`server/temperature_store`, `server/history/`, `server/job_queue/`,
  `machine/timelapse/`, `server/timelapse`, `machine/device_power/`,
  `server/spoolman/`). Raw `printer/gcode/script` passthrough stays blocked.
- Guarded write actions in `PrinterController` (bed mesh calibrate, filament
  load/unload/purge, set heater temp, PID calibrate, exclude object) with
  parameter validation and idle/motion guards.
- `console_enabled` admin toggle (default **off**); `printer#consoleCommand`
  returns 403 until enabled; even then, length/charset validation + motion
  guard.
- Feature detection from `/server/info` components surfaced on `/api/status`
  as `moonraker_features`; panels self-hide when the plugin is absent.

Workstreams: **WS10** temperature graph + presets + PID tune; **WS11** G-code
console; **WS12** bed mesh heatmap + calibrate; **WS13** print/job queue +
exclude-object; **WS14** filament management (Spoolman + runout + cost);
**WS15** Moonraker history/stats + embedded thumbnails; **WS16**
moonraker-timelapse integration.

## Verification

- **G18/G19** Vitest suite exit 0, including new specs `temp-graph`,
  `console`, `bed-mesh`, `queue`, `filament`, `history`, `timelapse`
  (G38a–G44a).
- **G27** version floor `>= 1.9.0`.
- **G34** deployed `css/style.css` carries sticky chrome.
- **G35** CSS/JS deploy-freshness check.
- **G45** proxy allowlist + console-off regression (PHPUnit + PHP gate).
- Pure helpers extracted to `src/utils/workflow-gates.js` (breakpoints,
  `sliceBlockReason`, preview-block) so the store and tests share one source
  of truth.
- Browser smoke **NS12.19–NS12.52** (manual, per-workstream) tracked in
  `docs/VERIFY.md`.

## Ship steps

1. Version bump → **1.9.0** (`appinfo/info.xml`, `package.json`,
   `package-lock.json`, CHANGELOG).
2. `npm run test` → `npm run build`.
3. `make deploy` → `make gate-preflight` → `print-api-gates.php` (G00–G45).
4. Scoped git commit with Claude trailer; **ask before push**.
