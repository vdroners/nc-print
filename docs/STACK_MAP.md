# NC Print + 3DPrintForge — stack map

Operator / agent orientation for the lab at `10.0.0.84`. Last verified **2026-08-06**.

## What to build

| Role | Path |
|------|------|
| **Nextcloud app (primary)** | `/media/4TB/nc-print` — app id `nc_print`, product name **NC 3D Print** |
| Deploy target | `cloud_app:/var/www/html/custom_apps/nc_print/` |
| Owned slicer sidecar | `/media/4TB/nc-print/slicer/` + `docker-compose.slicer.yml` |
| Engine source of truth | `/media/4TB/3dprintforge/slicer/3dprintforge-slicer/` (`ENGINE_SRC`) |
| Forge Studio (parallel UI) | `/media/4TB/3dprintforge` |
| Shared STL/3MF library | `/media/4TB/3dprints` |

## Runtime topology

```
Browser ──▶ Nextcloud :8080 (cloud_app / nc_print)
               │
               ├─ SlicerProxy ──nc-print-net──▶ nc-print-slicer:8080
               │                                   └─ /opt/orca/3dprintforge-slicer
               └─ MoonrakerProxy ──▶ printer (e.g. 10.0.0.210:7125)

Browser ──▶ Forge Studio :3040 (3dprintforge, host network)
               └─ FORGE_SLICER_URL ──▶ host forge-slicer :8766
                    (same binary tree under /media/4TB/3dprintforge/slicer/)
```

NC Print does **not** need Forge Studio or host `:8766` for in-browser slice.
Forge Studio does **not** use `nc-print-slicer`.

## Day-to-day commands

```bash
# NC Print — from /media/4TB/nc-print
make build
make ship              # build + slicer-up + deploy + gates
make ship RESTART=1    # when adding PHP routes/classes
make slicer-fetch      # refresh engine from ENGINE_SRC
make deploy            # frontend + copy into cloud_app

# Forge Studio — from /media/4TB/3dprintforge
docker compose build && docker compose up -d
systemctl --user status forge-slicer
curl -sf http://127.0.0.1:8766/api/health
```

## Health checks

```bash
docker exec cloud_app grep '<version>' /var/www/html/custom_apps/nc_print/appinfo/info.xml
docker exec cloud_app curl -sS http://nc-print-slicer:8080/api/health
curl -skI https://127.0.0.1:3040/login.html
curl -sf http://127.0.0.1:8766/api/health
docker ps --filter name=nc-print-slicer --filter name=3dprintforge --filter name=cloud_app
```

## Docs

- Workflow: [`CLAUDE.md`](../CLAUDE.md)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Admin / slicer URL: [`ADMIN.md`](ADMIN.md)
- Forge update: `/media/4TB/3dprintforge/docs/UPDATE.md`
- Forge pins: `/media/4TB/3dprintforge/docs/VERSIONS.md`
