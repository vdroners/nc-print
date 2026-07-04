# NC 3D Print

**Version 1.18.0** · Nextcloud 28–33 · PHP 8.1+ · License AGPL-3.0-or-later

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
- **Calibration suite** — one-click flow-rate models and a parametric
  temperature tower
- Save G-code beside the model in Nextcloud Files

**Print monitor (Moonraker)**
- Live telemetry with camera, multi-series temperature graph + PID tuning
- Bed-mesh heatmap + calibrate (idle-only), print/job queue, mid-print
  exclude-object
- Filament management (Spoolman + runout sensors, load/unload/purge)
- Moonraker history/statistics with embedded thumbnails, timelapse playback
- Read-only G-code console log with an optional admin-gated command input

All Part B monitoring panels feature-detect from Moonraker `/server/info` and
hide when the corresponding plugin is absent.

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
