# NC 3D Print

**Version 1.9.0** · Nextcloud 28–33 · License AGPL-3.0-or-later

A standalone Nextcloud app for the full **prepare → slice → print** workflow.
It pairs a headless [Orca / forge-slicer](https://github.com/) REST backend with
[Moonraker](https://moonraker.readthedocs.io/)/Klipper for a Mainsail/Fluidd-class
monitoring and control experience — without leaving your Nextcloud.

No NC-GCS dependency is required.

## Features

**Prepare**
- Three.js model viewport (STL / OBJ / 3MF) with bed grid, bounding-box overlay,
  and a WYSIWYG mesh transform that is applied before slicing (no "blind" slices)
- Profile pickers (printer / filament / process) with a collapsible, low-density
  studio layout

**Slice**
- Headless Orca slicing over the forge-slicer REST proxy (SSE progress stream)
- Slice handoff card: filament/time summary and a one-click "Monitor on Print"

**Print monitor (Moonraker)**
- Live telemetry over the Moonraker WebSocket with automatic polling fallback
- Live camera with fullscreen view
- Live multi-series **temperature graph** + presets + PID tuning
- **Bed mesh** heatmap + calibrate (idle-only)
- Print/**job queue** and mid-print **exclude-object**
- **Filament** management: Spoolman spool + runout sensors, load/unload/purge,
  and last-slice cost estimate
- Moonraker **history/statistics** + embedded G-code thumbnails
- moonraker-**timelapse**: rendered-video list, in-app playback, and download
- Read-only **G-code console** log, with an optional admin-gated command input

All Part B monitoring panels feature-detect from Moonraker `/server/info`
components and hide automatically when the corresponding plugin is absent.

## Requirements

| Component | Requirement |
|-----------|-------------|
| Nextcloud | 28 – 33 |
| PHP | 8.1+ (matches your Nextcloud) |
| forge-slicer | Reachable REST endpoint (default `http://127.0.0.1:8766`) |
| Moonraker | Reachable API (default `http://10.0.0.210:7125`) |
| Node.js | 18+ (build only) |

## Quick start

```bash
make build          # sass + webpack production build
make deploy         # copies into the running cloud_app container + occ upgrade
make gate-preflight # lint/static + phpunit + vitest + build
```

See [docs/INSTALL.md](docs/INSTALL.md) for a from-scratch install and
[docs/VERIFY.md](docs/VERIFY.md) for the full gate/acceptance matrix.

## Configuration

Configure in **Settings → NC 3D Print** (admin):

| Setting | Purpose |
|---------|---------|
| Slicer internal URL | forge-slicer REST endpoint |
| Moonraker internal URL | Klipper/Moonraker API |
| Camera snapshot URL | live camera |
| Printer display name | UI label |
| Allowed groups | comma-separated Nextcloud groups gate |
| Multi-printer config | JSON array for multiple printers |
| Slicer / Moonraker enabled | independent feature toggles |
| **G-code console send** | **advanced, off by default** — see Security |

Docker (`cloud_app`) networking notes and the forge-slicer relay are documented
in [docs/ADMIN.md](docs/ADMIN.md).

## Security model

NC 3D Print is designed so that **no browser can push arbitrary G-code at your
printer**:

- The Moonraker proxy is a strict **read-only allowlist** (`server/info`,
  `server/files/`, `printer/objects/`, `printer/print/`, and the Part B read
  prefixes). Raw `printer/gcode/script` passthrough is **blocked**.
- Every write (temperature, tuning, bed-mesh calibrate, filament load/unload/
  purge, exclude-object, PID) goes through guarded `PrinterController` actions
  with parameter validation, an action allowlist, and idle/motion guards
  (motion is refused while a print is active).
- The **G-code console** command input is **disabled by default**. It requires an
  explicit admin opt-in (`console_enabled`); even then, commands are length- and
  charset-validated and motion is refused during a print. The response log is
  read-only.
- App access is gated to the configured Nextcloud groups.

## Architecture

- **Frontend:** Vue 2.7 + Pinia, Three.js viewport, webpack build.
- **Backend:** Nextcloud PHP app (`OCA\NcPrint`) — `ApiController` (status /
  feature detection), `MoonrakerProxyController` (read-only allowlist),
  `PrinterController` (guarded writes + console), `AdminController` / settings.
- **Services:** forge-slicer REST (slicing), Moonraker (control + telemetry).

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development & testing

```bash
npm ci
npm run dev     # webpack watch
npm run test    # vitest (unit)
make run-phpunit # PHPUnit in a php:8.2-cli container
```

CI/acceptance gates (G00–G45) are enforced by
[`tools/print-api-gates.php`](tools/print-api-gates.php); results are tracked in
[docs/VERIFY.md](docs/VERIFY.md). Changelog: [CHANGELOG.md](CHANGELOG.md).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/INSTALL.md](docs/INSTALL.md) | Install & enable |
| [docs/ADMIN.md](docs/ADMIN.md) | Admin config, Docker networking, console toggle |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Component overview |
| [docs/VERIFY.md](docs/VERIFY.md) | Gate & acceptance matrix |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Known limitations |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.en.html).
