# NC Print stack map

Operator / agent orientation for the lab at `10.0.0.84`. Last verified **2026-10-26**.

## What to build

| Role | Path |
|------|------|
| **Nextcloud app (primary)** | `/media/4TB/nc-print` — app id `nc_print`, product name **NC 3D Print** |
| Deploy target | `cloud_app:/var/www/html/custom_apps/nc_print/` |
| Owned slicer sidecar | `/media/4TB/nc-print/slicer/` + `docker-compose.slicer.yml` |
| Engine source of truth | `/media/4TB/3dprintforge/slicer/3dprintforge-slicer/` (`ENGINE_SRC`) — **keep-engine** (slim tree retained after Forge UI retirement; do not delete) |
| Shared STL/3MF library | `/media/4TB/3dprints` |

## Retired (2026-10-26, Sarge OK)

| Item | Status |
|------|--------|
| Forge Studio UI `:3040` (`3dprintforge` compose) | **Stopped** — `docker compose down` in `/media/4TB/3dprintforge` |
| Host `forge-slicer` `:8766` + `forge-slicer-docker-relay` | **Stopped + disabled** (user systemd) |
| CPM host `forge-vdroners.ddns.net` → `:3040` | **Disabled** in CPM DB (`proxy_hosts.id=8`) + routes removed from live Caddy |
| Alfred `alfred-cron-forge-print-monitor.timer` | **Stopped + disabled** — replaced by `alfred-cron-nc-print-monitor.timer` |
| `forge-webhook-relay` (`:8790`, alfred-vdroners) | **Kept running** — NC outbound HMAC webhooks still use this relay |
| `/media/4TB/3dprintforge` tree (ENGINE_SRC under `slicer/`) | **Kept on disk** for `make slicer-fetch` / rollback — UI compose not started |
| `/media/4TB/3dprints` | **Untouched** |

## Runtime topology

```
Browser ──▶ Nextcloud :8080 (cloud_app / nc_print)
               │
               ├─ SlicerProxy ──nc-print-net──▶ nc-print-slicer:8080
               │                                   └─ /opt/orca/3dprintforge-slicer
               └─ MoonrakerProxy ──▶ printer (e.g. 10.0.0.210:7125)

Alfred / Talk ──▶ forge-webhook-relay :8790 (CPM alfred-vdroners)
                    └─ consumes NC Print outbound HMAC webhooks
               alfred-cron-nc-print-monitor.timer (15 min)
                    └─ Moonraker hourly + 25/50/75% Talk digests; quiet hours skip digests only
```

NC Print does **not** need Forge Studio or host `:8766` for in-browser slice.
Forge Studio is retired; do not `docker compose up` it without a new Sarge order.

## Day-to-day commands

```bash
# NC Print — from /media/4TB/nc-print
make build
make ship              # build + slicer-up + deploy + gates
make ship RESTART=1    # when adding PHP routes/classes
make slicer-fetch      # refresh engine from ENGINE_SRC (kept under 3dprintforge/slicer/)
make deploy            # frontend + copy into cloud_app

# Retired Forge Studio — DO NOT start unless Sarge orders
# cd /media/4TB/3dprintforge && docker compose up -d
# systemctl --user start forge-slicer
```

## Health checks

```bash
docker exec cloud_app grep '<version>' /var/www/html/custom_apps/nc_print/appinfo/info.xml
docker exec cloud_app curl -sS http://nc-print-slicer:8080/api/health
docker ps --filter name=nc-print-slicer --filter name=cloud_app --filter name=forge-webhook-relay
# Confirm retired listeners are down:
ss -ltnp | grep -E ':3040|:8766' || echo '3040/8766 down OK'
# K1 Max
curl -sf http://10.0.0.210:7125/server/info
curl -sf -o /tmp/cam.jpg 'http://10.0.0.210:8080/?action=snapshot' && file /tmp/cam.jpg
ssh k1-max 'pidof moonraker.py mjpg_streamer cam_app'
```

## K1 Max (`10.0.0.210`) — lab notes

| Item | Value |
|------|-------|
| Hostname | `K1Max-Printy-Baby` |
| Moonraker | `:7125` (required for NC Print) |
| Camera | `:8080` via `cam_app` → `mjpg_streamer` (`input_memfd`) |
| Stock UI | `:80` |
| SSH | `ssh k1-max` (ECDSA; Dropbear) |
| Persistence | `S54moonraker_conf_guard`, `S99z_mjpg_http` on printer |
| NC Print config | `moonraker_internal_url`, camera URL, `discovery_subnet=10.0.0.`, enabled |

## Docs

- Workflow: [`CLAUDE.md`](../CLAUDE.md)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Admin / slicer URL: [`ADMIN.md`](ADMIN.md)
- Forge → NC Print port plan (incl. Wave 8 retirement): [`plans/forge-port.md`](plans/forge-port.md)
- First-print UX plan: [`plans/first-print-ux-2026-08.md`](plans/first-print-ux-2026-08.md)
