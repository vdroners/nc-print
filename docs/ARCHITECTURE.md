# Architecture

NC 3D Print is a Nextcloud app that **owns its slicing engine** as a companion
container, instead of depending on an external slicer service.

```
Browser (Vue 2 + Pinia + Three.js)
   │  same-origin HTTPS
   ▼
Nextcloud app  (OCA\NcPrint, PHP controllers)
   ├─ SlicerProxyController    ──▶ nc-print-slicer  :8080   (OWNED sidecar)
   ├─ MoonrakerProxyController ──▶ Moonraker/Klipper        (read-only allowlist)
   ├─ PrinterController        ──▶ Moonraker                (guarded writes)
   ├─ CameraController         ──▶ camera snapshot          (server-side fetch)
   └─ FilesController / GcodeSaveController ──▶ Nextcloud Files (WebDAV)
```

## The owned slicing engine (`nc-print-slicer`)

An Ubuntu 24.04 container (Ubuntu 24.04 because the engine binary requires
glibc ≥ 2.38) that bakes the 3DPrintForge Slicer (OrcaSlicer fork) CLI + its
`resources/` profile tree and a data-dir seed that enables the full vendor
PresetBundle. It runs headless via **Xvfb + Mesa software GL** (the engine links
GTK/webkit, not Qt) and exposes a thin **FastAPI adapter** on `:8080`.

`cloud_app` and the sidecar share the `nc-print-net` Docker network; PHP reaches
the adapter by container DNS (`http://nc-print-slicer:8080`), which bypasses the
legacy `host.docker.internal` / `:8766` URL rewrites.

### Why the adapter execs the CLI

This engine build's built-in REST `/api/slice` is broken and its binary **cannot
load STL** (verified — reproduces on the reference engine and the host binary; it
loads 3MF fine). So the adapter:

1. converts the uploaded STL to a bare geometry 3MF (`mesh3mf.py`),
2. resolves a **compatible** machine/process/filament triple from the on-disk
   preset tree and auto-repairs incompatible selections (`presets.py`),
3. merges the UI's override settings into copies of the process/filament presets
   (the CLI has no per-key override flags — `overrides.py`),
4. execs the CLI (`--slice 0 --load-settings … --load-filaments … --outputdir …`,
   cwd = writable job dir, no `--export-3mf` which crashes it),
5. streams synthesized SSE progress and serves the produced `plate_1.gcode`.

Profiles / health / version are proxied straight through to the engine's REST
server, which loads the full PresetBundle correctly.

### Adapter modules (`slicer/adapter/`)

| Module | Responsibility |
|--------|----------------|
| `main.py` | FastAPI app: slice (SSE), gcode (HEAD+Range), toolpath, mesh-analyze, calibration, health, profile pass-through; job store + GC + concurrency guard |
| `mesh3mf.py` | STL → bare 3MF (single + multi-object for arrange); mesh-size guard |
| `presets.py` | Index on-disk presets by name; resolve + repair a compatible triple |
| `overrides.py` | Map frontend override keys → engine preset keys; merge into preset copies |
| `gcode_toolpath.py` | Parse gcode `;TYPE:`/`;Z:` markers → feature-typed 3D segment buffers |
| `mesh_analyze.py` | Mesh health report (open/non-manifold edges, watertight, bbox) |
| `calibration.py` | Calibration catalog + parametric temperature-tower generation |
| `entrypoint.sh` | Xvfb → engine `--rest-only` → adapter; seeds the writable data_dir |
| `healthcheck.py` | Container HEALTHCHECK (engine up + PresetBundle non-empty) |
| `smoke_test.py` | End-to-end STL → gcode check |

### Sidecar HTTP surface (behind the slicer proxy)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Adapter + engine health, bundle counts, job stats |
| `GET /api/profiles[?kind=]`, `GET /api/profiles/{id}`, `GET /api/printers` | Profile catalog (engine pass-through) |
| `POST /api/slice/stream` | Slice one or many models (multipart; `arrange` flag); SSE progress + `done` |
| `GET /api/jobs/{id}/gcode` | Download gcode (HEAD + Range) |
| `GET /api/jobs/{id}/toolpath` | 3D toolpath geometry (feature-typed layers) |
| `POST /api/mesh/analyze` | Mesh health report for an uploaded STL |
| `GET /api/calibration/list`, `POST /api/calibration/{id}/slice` | Calibration suite |

## Frontend

Vue 2.7 + Pinia (`src/store/print.js` is the hub) + a lazy-loaded Three.js
viewport (`src/three/viewport.js`). Services in `src/services/` wrap each backend
surface (`slicer-api.js`, `moonraker-api.js`/`moonraker-ws.js`, `toolpath-3d.js`,
`mesh-analyze-api.js`, `calibration-api.js`, `files-api.js`). The build is webpack
(`make build`); the app is three entry bundles (main, admin, files-action).

## Data flow (slice)

Browser exports the transformed mesh → uploads model bytes to
`/apps/nc_print/api/slicer/slice/stream` → PHP converts a single octet-stream
upload to multipart (or passes multipart through for multi-object) → adapter
converts/resolves/overrides/execs the engine → SSE progress back to the browser →
`done` carries `job_id`, `gcode_size`, `estimated_time_s`, `filament_used_g` →
browser downloads gcode, optionally saves to Files or sends to Moonraker.
