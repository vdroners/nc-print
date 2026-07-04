# NC 3D Print

**Version 1.30.0** · Nextcloud 28–33 · PHP 8.1+ · License AGPL-3.0-or-later

A standalone Nextcloud app for the full **prepare → slice → print** workflow. It
**ships and owns its own headless slicing engine** (an OrcaSlicer fork, run as
the `nc-print-slicer` sidecar container) and pairs it with
[Moonraker](https://moonraker.readthedocs.io/)/Klipper for a Mainsail/Fluidd-class
monitoring and control experience — without leaving your Nextcloud, and with **no
external slicer service** and no NC-GCS dependency.

## What it does

**Prepare**
- Three.js model viewport (STL / OBJ / 3MF) with a Z-up bed grid and
  bounding-box overlay
- Interactive transform gizmos (move / rotate / scale) plus lay-flat,
  auto-orient, place-on-face, mirror, and plane-cut tools — the mesh you see is
  the mesh that slices (WYSIWYG, no "blind" slices)
- Printer / filament / process profile pickers with quick-edit override settings
- Mesh health check (triangles, open edges, watertight)

**Slice** (self-contained — no external slicer)
- Real headless slicing in the owned `nc-print-slicer` sidecar, streamed to the
  browser over SSE with live progress
- Override settings (layer height, line width, perimeters, infill, speeds,
  temps, retraction, supports, brim/raft/skirt) that **actually take effect**
- **3D toolpath preview** — inspect the printed paths after slicing with
  per-feature colours, a layer slider, and toggleable travel moves
- **Multi-object plates** — add several models and auto-arrange them on one plate
- **Smart ETA (learned)** — after each print the app learns this printer's
  slicer-vs-actual delta (an EWMA multiplier per printer/material/nozzle) and
  shows a corrected "predicted" time alongside the slicer estimate on the slice
  result, with a confidence figure
- **Calibration suite** — one-click flow-rate models, a parametric temperature
  tower, plus seven procedural **generator prints** (temp/retract/flow/
  pressure-advance towers, a PA pattern, first-layer patch, and single-line
  max-flow test) that emit tuning G-code directly with no slice needed
- **Pause / filament change at height** — insert M600 (filament change) or M601
  (pause) at chosen Z heights, for multi-colour prints, embedding hardware, or
  inspection
- **Multi-colour purge optimizer** — enter the plate's filament colours and get
  the load order that minimises total purge, using OrcaSlicer's flush model
  (asymmetric — switching to a lighter colour wastes more); shows grams saved vs
  loading as listed
- **Material breakdown + cost** — model vs support filament (g) and estimated
  cost, computed per feature from the sliced G-code
- **Filament material reference** — a built-in database of 15 common materials
  (PLA/PETG/ABS/ASA/TPU/PA/PC/composites/supports) with recommended nozzle/bed/
  chamber temps, drying, plate compatibility, properties, tips and warnings; a
  "use these temps" action seeds the slice overrides
- **Surface-quality overrides** — ironing, fuzzy skin, seam position, and
  adaptive layer height, applied on top of the process profile
- **Infill & surface patterns** — pick the infill pattern (gyroid, honeycomb,
  cubic, concentric, …) and the top/bottom solid-surface pattern
- **Per-feature speeds** — separate infill and solid-infill speed overrides
- **Support interface tuning** — top gap, interface layers and spacing for
  supports that peel off cleanly; plus a first-layer-height override
- **Per-feature weight/cost breakdown** — model vs support vs brim/skirt grams
  (and cost when a filament price is set) on the slice result
- **Prime / wipe tower** — multi-material purge tower (width, brim, prime volume,
  rotation, extra spacing); the controls appear only when >1 filament is selected
- Save G-code beside the model in Nextcloud Files

**Print monitor (Moonraker)**
- **Automatic printer discovery + recents** — a "Scan for printers" button in the
  target-printer picker finds Moonraker printers on the LAN; the picker groups
  them as **Recent** (the printers you actually use, floated to the top),
  **Configured**, and **Found on network** (one-click add for the session)
- **Live capability detection** — selecting a printer queries Klipper/Moonraker
  for its real build volume, extruder count, model and OS, shown as a chip
  (e.g. "308×308×315 · 1 extruder")
- Live telemetry with camera, multi-series temperature graph + PID tuning
- Bed-mesh heatmap + calibrate (idle-only), print/job queue, mid-print
  exclude-object
- Filament management (Spoolman + runout sensors, load/unload/purge, plus
  manual extrude/retract in ±0.1/1/10 mm steps, idle-only)
- **Power devices** — turn a Moonraker-managed smart plug / PSU relay on/off
  (blocked while printing); shown when the `[power]` component is present
- **Sensor readouts** — chamber/other temperature sensors and filament
  switch/motion sensor state, shown when such sensors exist
- **Cameras** — lists the printer's configured webcams when more than one exists
- **Update & announcement banners** — a firmware/component update-available
  notice and Moonraker service announcements; **admins** can trigger an update
  (Klipper/Moonraker/client/system/all) from the app — heavily guarded
  (admin-only, refused while printing, explicit confirm, restarts services)
- Moonraker history/statistics with embedded thumbnails, timelapse playback
- Read-only G-code console log with an optional admin-gated command input

All Part B monitoring panels feature-detect from Moonraker `/server/info` and
hide when the corresponding plugin is absent.

**Native Nextcloud integration**
- **Notifications** — print complete/failed ring the Nextcloud notification bell
- **Activity stream** — print started/completed/failed events (with filename,
  printer and duration) appear in the Activity app
- **Dashboard widget** — "3D printer status" tile shows the active printer's
  state, progress, ETA and temps at a glance, with a deep link into the app

## Architecture

```
Browser (Vue 2 + Pinia + Three.js)
   │  same-origin
   ▼
Nextcloud app  (OCA\NcPrint, PHP)
   ├─ SlicerProxyController   ──▶ nc-print-slicer sidecar  :8080   (OWNED)
   ├─ MoonrakerProxyController──▶ Moonraker / Klipper  (read-only allowlist)
   └─ PrinterController        ──▶ Moonraker  (guarded writes)
                                        │
      nc-print-slicer (Ubuntu 24.04 container on nc-print-net):
        Xvfb + Mesa software GL → OrcaSlicer-fork CLI (headless)
        FastAPI adapter :8080 — slice (SSE), profiles, toolpath,
        mesh-analyze, arrange, calibration
```

The Nextcloud container and the sidecar share the `nc-print-net` Docker network;
PHP reaches the engine by container DNS (`http://nc-print-slicer:8080`). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

| Component | Requirement |
|-----------|-------------|
| Nextcloud | 28 – 33 |
| PHP | 8.1+ (matches your Nextcloud) |
| Docker | for the `nc-print-slicer` sidecar (Ubuntu 24.04 base — the engine needs glibc ≥ 2.38) |
| Slicing engine | 3DPrintForge Slicer (OrcaSlicer fork) — staged at build time, **not** committed to git |
| Moonraker | Reachable Klipper API (default `http://10.0.0.210:7125`) |
| Node.js | 18+ (frontend build only) |

## Quick start

```bash
# 1. Stage the engine binary + resources into slicer/ (kept out of git)
make slicer-fetch            # from /media/4TB/3dprintforge by default; override ENGINE_SRC

# 2. Build + run the owned slicing engine sidecar, join cloud_app to its network
make slicer-up

# 3. Build the frontend and deploy the app into the running cloud_app container
make deploy                  # sass + webpack, docker cp, occ upgrade (also ensures the sidecar is up)

# 4. Enable + verify
docker exec -u www-data cloud_app php /var/www/html/occ app:enable nc_print
make gate-preflight          # preflight + phpunit + vitest + build + API gates
```

See [docs/INSTALL.md](docs/INSTALL.md) for a from-scratch install and
[docs/VERIFY.md](docs/VERIFY.md) for the gate/acceptance matrix.

## Configuration

Configure in **Settings → NC 3D Print** (admin):

| Setting | Purpose |
|---------|---------|
| Slicer internal URL | Owned sidecar (default `http://nc-print-slicer:8080`); can point at an external engine for back-compat |
| Moonraker internal URL | Klipper/Moonraker API |
| Camera snapshot URL | Live camera for PiP / Print monitor |
| Printer display name | UI label |
| Allowed groups | Comma-separated Nextcloud groups gate |
| Multi-printer config | JSON array for multiple printers (with a **Discover printers** button that scans the LAN for Moonraker instances) |
| Slicer / Moonraker enabled | Independent feature toggles |

The **G-code console send** input is off by default and, for safety, is **not**
exposed in the admin UI — it is enabled deliberately via `occ` only (see
Security). Docker networking, the sidecar, and its tuning knobs are documented in
[docs/ADMIN.md](docs/ADMIN.md).

## Security model

NC 3D Print is designed so that **no browser can push arbitrary G-code at your
printer**, and the slicing engine — which parses untrusted uploaded meshes — runs
sandboxed:

- The Moonraker proxy is a strict **read-only allowlist**; raw
  `printer/gcode/script` passthrough is **blocked**. Every write (temperature,
  tuning, bed-mesh calibrate, filament load/unload/purge, exclude-object, PID)
  goes through guarded `PrinterController` actions with parameter validation and
  idle/motion guards (motion refused while printing).
- The **G-code console** command input is **disabled by default** and can only be
  enabled via `occ` (`console_enabled`), not the admin UI; commands are
  length/charset validated and motion is refused during a print. The response log
  is read-only.
- The **slicing sidecar** is internal-only (no host port published; reachable
  only from `cloud_app` on `nc-print-net`), runs with `cap_drop: ALL`,
  `no-new-privileges`, a read-only root filesystem + tmpfs scratch, and
  memory/PID caps. Uploads over `MAX_MESH_TRIANGLES` are rejected, slices are
  concurrency-limited, and job scratch is garbage-collected.
- Slicer/Moonraker URLs are **admin-configured only** — user paths cannot
  retarget upstream hosts. App access is gated to the configured Nextcloud groups.

More detail in [SECURITY.md](SECURITY.md).

## Development & testing

```bash
npm ci
npm run dev            # webpack watch
npm run test           # vitest (frontend unit tests)
make run-phpunit       # PHPUnit (host PHP, or php:8.2-cli container)
make slicer-test       # sidecar adapter unit tests (STL→3MF, overrides, toolpath, calibration)
make gate-preflight    # full gate: preflight + phpunit + vitest + build + API gates

# sidecar end-to-end smoke test (STL → gcode through the adapter)
docker exec nc-print-slicer python3 /opt/adapter/smoke_test.py
```

CI/acceptance gates are enforced by
[`tools/print-api-gates.php`](tools/print-api-gates.php). Changelog:
[CHANGELOG.md](CHANGELOG.md).

## Licensing note (AGPL)

The slicing engine is a fork of OrcaSlicer (AGPL-3.0); this app is
AGPL-3.0-or-later, so the licences are compatible. The engine binary + resources
(~380 MB) are **staged at build time** and kept out of this repository; the
image bakes the engine's `LICENSE.txt`. If you distribute the built image you
must also offer the corresponding source of the engine fork.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/INSTALL.md](docs/INSTALL.md) | Install, sidecar setup & enable |
| [docs/ADMIN.md](docs/ADMIN.md) | Admin config, Docker networking, sidecar tuning, console toggle |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Component & sidecar overview |
| [docs/VERIFY.md](docs/VERIFY.md) | Gate & acceptance matrix |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Known limitations |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |
| [slicer/README.md](slicer/README.md) | The owned slicing engine sidecar |

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.en.html).
