# Install

NC 3D Print is a Nextcloud app plus a companion `nc-print-slicer` Docker sidecar
that runs the slicing engine. Both must be present for slicing; the app alone
still provides Prepare and Moonraker monitoring.

## Prerequisites

- A running Nextcloud (28–33) in Docker — this repo deploys into a container
  named `cloud_app` by default (override with `CONTAINER=...`).
- Docker + `docker compose` on the host, for the sidecar.
- Node.js 18+ (frontend build only).
- The slicing engine (3DPrintForge Slicer / OrcaSlicer fork) available locally to
  stage from — default `/media/4TB/3dprintforge/slicer/3dprintforge-slicer`, plus
  its data-dir seed at `~/.config/3DPrintForgeSlicer` (enables the full vendor
  profile bundle). Override the engine source with `ENGINE_SRC=...`.

## 1. Stand up the slicing engine sidecar

```bash
make slicer-fetch     # stage the engine binary + resources + data-dir seed into slicer/
make slicer-up        # build + run nc-print-slicer, attach cloud_app to nc-print-net
```

The engine (~380 MB) is **not** stored in git; `make slicer-fetch` copies it in
before the image build. `make slicer-up` also runs
`docker network connect nc-print-net cloud_app` so PHP can reach the sidecar by
DNS. Verify:

```bash
docker exec cloud_app curl -s http://nc-print-slicer:8080/api/health
# → {"ok":true,...,"bundle":{"printers":87,...}}
```

## 2. Deploy the Nextcloud app

```bash
make deploy           # frontend build → docker cp into cloud_app → occ upgrade
docker exec -u www-data cloud_app php /var/www/html/occ app:enable nc_print
```

`make deploy` also ensures the sidecar is running (guarded so a missing
engine/compose never breaks the app deploy).

## 3. Configure

In **Settings → NC 3D Print** (admin), confirm/set:

- **Slicer internal URL** — leave as the default `http://nc-print-slicer:8080`
  (the owned sidecar). Only change it to target an external engine.
- **Moonraker internal URL** — your Klipper/Moonraker API.
- **Camera URL**, **allowed groups**, and any **multi-printer** JSON.

See [ADMIN.md](ADMIN.md) for all settings and sidecar tuning.

## 4. Verify

```bash
make gate-preflight   # preflight + phpunit + vitest + build + API gates
docker exec nc-print-slicer python3 /opt/adapter/smoke_test.py   # STL → gcode e2e
```

See [VERIFY.md](VERIFY.md) for the acceptance matrix.
