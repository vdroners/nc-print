# nc-print-slicer (owned slicing engine sidecar)

This directory builds `nc-print-slicer`, the self-contained slicing engine that
nc-print owns and controls. It bakes the **3DPrintForge Slicer** (an OrcaSlicer
fork) CLI plus its `resources/` profile tree into an Ubuntu 24.04 image and runs
the binary's built-in headless REST server behind a thin FastAPI reverse-proxy
on `:8080`.

nc-print's PHP backend (`SlicerProxyController`) talks to this container by DNS
name (`http://nc-print-slicer:8080`) over the shared `nc-print-net` Docker
network, so nc-print no longer depends on the external forge-slicer Node service.

## Layout

```
slicer/
  Dockerfile                 Ubuntu 24.04 + GTK/webkit runtime + Xvfb + engine
  adapter/
    main.py                  FastAPI reverse-proxy (SSE, gcode range, health)
    entrypoint.sh            Xvfb → engine (--rest-only) → adapter
    healthcheck.py           container HEALTHCHECK (engine up + bundle non-empty)
    requirements.txt         fastapi / uvicorn / httpx
  3dprintforge-slicer/       ENGINE (git-ignored, staged by `make slicer-fetch`)
    3dprintforge-slicer      the ~145 MB native ELF binary
    resources/               ~237 MB vendor profiles / calib models / fonts
    LICENSE.txt              AGPL text (baked into the image for compliance)
```

## Build & run

The engine binary and its resources are **not** committed to git (~380 MB).
Stage them first, then bring the sidecar up:

```bash
cd /media/4TB/nc-print
make slicer-fetch    # copies engine + resources into slicer/3dprintforge-slicer/
make slicer-up       # builds the image, starts it, attaches cloud_app to the net
```

`ENGINE_SRC` overrides where the engine is staged from (default:
`/media/4TB/3dprintforge/slicer/3dprintforge-slicer`).

## Why this shape

- **Ubuntu 24.04** — the engine binary requires `GLIBC_2.38`; 22.04 (glibc 2.35)
  cannot load it.
- **Xvfb + Mesa llvmpipe** — the engine links GTK3 + webkit2gtk + Wayland (not
  Qt), so it needs a virtual X display and software GL, not
  `QT_QPA_PLATFORM=offscreen`.
- **`--rest-only --rest-port` (dash form)** — the engine's own REST server;
  `--rest_port` (underscore) is rejected per its `REST_README.md`.

## Licensing (AGPL)

3DPrintForge Slicer is a fork of OrcaSlicer (AGPL-3.0). nc-print is also
AGPL-3.0-or-later, so the licenses are compatible. `LICENSE.txt` is baked into
the image. If you distribute the built image, you must also offer the
corresponding source of the engine fork. The engine binary is deliberately kept
out of this git repository for that reason.
