# Verify — NC Print v1.2.0

Signed off: **2026-06-30** (UTC) — lab server 10.0.0.84, `cloud_app` + forge-slicer + K1 Moonraker.

**v1.2 UX overhaul:** Three.js viewport, profiles on Prepare, Files fetch API, G-code upload, wizard stepper, health banner, toasts. Re-run NS3/NS4/NS12 in browser after deploy.

## Quick commands

```bash
make deploy
make gate-preflight
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
bash tools/print-smoke-slice.sh
curl -sf http://127.0.0.1:8766/api/health
curl -sf http://10.0.0.210:7125/server/info
```

`make deploy` copies `appinfo`, `css`, `img`, `js`, `lib`, `templates`, and `tools/` into `cloud_app`.

From Docker, slicer health uses `InternalUrlResolver` → `http://10.0.0.84:8082` (TCP relay to forge-slicer on host). See `docs/ADMIN.md` and `tools/forge-slicer-docker-relay.py`.

## Gate results (NS0–NS12)

| Gate | Description | Result | Timestamp (UTC) | Evidence |
|------|-------------|--------|-----------------|----------|
| **NS0** | Platform preflight | **PASS** | 2026-07-01T01:15Z | NS0.1–NS0.8 all PASS |
| NS0.1 | forge-slicer systemd active | **PASS** | 2026-07-01T01:15Z | `systemctl --user is-active forge-slicer` → active |
| NS0.2 | Slicer health | **PASS** | 2026-07-01T01:15Z | Host `127.0.0.1:8766/api/health` → ok; container G04 PASS via relay :8082 |
| NS0.3 | Moonraker | **PASS** | 2026-07-01T01:15Z | `10.0.0.210:7125/server/info` → klippy ready |
| NS0.4 | App deployed | **PASS** | 2026-07-01T01:15Z | `make deploy` → `cloud_app:/var/www/html/custom_apps/nc_print` |
| NS0.5 | App enabled | **PASS** | 2026-07-01T01:15Z | `occ app:list` → nc_print 1.0.0 enabled |
| NS0.6 | forge-slicer on boot | **PASS** | 2026-07-01T01:15Z | `systemctl --user is-enabled forge-slicer` → enabled |
| NS0.7 | Admin URLs set | **PASS** | 2026-07-01T01:15Z | G02/G03 PASS; ConfigService defaults + resolver |
| NS0.8 | K1 profiles | **PASS** | 2026-07-01T01:15Z | G05: `Creality K1` in `/api/profiles` |
| **NS1** | Auth + groups | **NOT RUN** | — | Manual HTTPS session tests (NS1.1–NS1.7) |
| **NS2** | Slicer engine (18) | **PARTIAL** | 2026-07-01T01:15Z | G04–G05, G10, G11 slicer_ok=1; full NS2.1–18 UI suite not run |
| **NS3** | NC Files (9) | **NOT RUN** | — | NS3.1–NS3.9 manual |
| **NS4** | Moonraker upload | **PARTIAL** | 2026-06-30T17:55Z | **Operator release:** NS4.1–NS4.2 **PASS** |
| NS4.1 | Upload succeeds | **PASS** | 2026-06-30T17:55Z | Direct Moonraker 201 + PrinterController 200 |
| NS4.2 | File in gcodes | **PASS** | 2026-06-30T17:55Z | `server/files/list?root=gcodes` lists uploaded files |
| NS4.3–NS4.7 | Start print, queue, etc. | **NOT RUN** | — | |
| **NS5** | Print control | **PARTIAL** | 2026-07-01T01:15Z | G07 printer state connected=1; pause/resume UI not exercised |
| **NS6** | Cloud HTTPS E2E | **NOT RUN** | — | Requires logged-in session on cloud-vdroners.ddns.net |
| **NS7** | Build + unit tests | **PASS** | 2026-07-01T01:15Z | See NS7.x |
| NS7.1 | `make build` | **PASS** | 2026-07-01T01:15Z | Webpack exit 0 |
| NS7.2 | PHPUnit | **PASS** | 2026-07-01T01:15Z | 10/10 via `make run-phpunit` (Docker php:8.2-cli) |
| NS7.3 | `npm run test` | **PASS** | 2026-07-01T01:15Z | Vitest 9/9 |
| NS7.4 | `make gate-preflight` | **PASS** | 2026-07-01T01:15Z | preflight + phpunit + vitest + build exit 0 |
| NS7.5 | CI green | **PENDING** | — | Push commit; verify GitHub Actions |
| **NS8** | Security | **PARTIAL** | 2026-07-01T01:15Z | G08/G13 allowlist regression PASS; full NS8.1–8.8 manual |
| **NS9** | Documentation | **PARTIAL** | 2026-07-01T01:15Z | All required docs present; NS9.12 screenshots placeholder only |
| **NS10** | Repository + packaging | **PASS** | 2026-07-01T01:15Z | See NS10.x |
| NS10.1 | Repo path | **PASS** | 2026-07-01T01:15Z | `/media/4TB/nc-print` |
| NS10.2 | GitHub private | **PASS** | 2026-07-01T01:15Z | `gh repo view` → PRIVATE |
| NS10.3 | Remote origin | **PASS** | 2026-07-01T01:15Z | `github.com/vdroners/nc-print` |
| NS10.4 | AGPL LICENSE | **PASS** | 2026-07-01T01:15Z | Root `LICENSE` (AGPL-3.0) |
| NS10.5 | CI workflow | **PASS** | 2026-07-01T01:15Z | `.github/workflows/ci.yml` |
| **NS11** | Deploy + prod readiness | **PASS** | 2026-07-01T01:15Z | Deploy + gates |
| NS11.1 | `make deploy` | **PASS** | 2026-07-01T01:15Z | |
| NS11.2 | `print-preflight.sh` | **PASS** | 2026-07-01T01:15Z | |
| NS11.3 | `print-api-gates.php` | **PASS** | 2026-07-01T01:15Z | G00–G15 all PASS |
| **NS12** | UX + visual acceptance | **NOT RUN** | — | Blocked at Nextcloud login in automated browser; NS12.1–12.9 manual |

## CLI API gates (deployed)

Run **2026-07-01T01:15Z** inside `cloud_app`:

```
G00 PASS nc_print installed
G01 PASS version=1.0.0
G02 PASS slicer_url set
G03 PASS moonraker_url set
G04 PASS health ok
G05 PASS Creality K1 profile present
G06 PASS klippy reachable
G07 PASS status=200 connected=1
G08 PASS allowlist regression
G09 PASS printer#upload registered
G10 PASS slice/stream -> api/slice
G11 PASS slicer_ok=1 moonraker_ok=1
G12 PASS proxy bases set
G13 PASS slicer api/ prefix gate
G14 PASS http=401 fallback=ApiController
G15 PASS admin_can_use=1 ws_ticket=yes
```

## Preflight static

`tools/print-preflight.sh` → **OK preflight static checks**

## Git release

| Item | Status |
|------|--------|
| Remote | `origin` → `git@github.com:vdroners/nc-print.git` |
| Branch | `main` |
| Tag | `v1.0.0` (re-tag when NS1–NS6 + NS12 all PASS on cloud HTTPS) |

**v1.0 engineering tag criterion:** NS0–NS12 all **PASS** on cloud HTTPS — **not yet met** (NS1, NS3, NS6, NS12 require operator login / manual sign-off). **Operator release criterion (NS4.1+NS4.2): PASS.**
