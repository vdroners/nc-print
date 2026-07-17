# Verify — NC Print

Canonical verification for the current release (**1.60.x**). Lab host:
`10.0.0.84`, Nextcloud container `cloud_app`, owned sidecar `nc-print-slicer`.

> Historical note: an earlier NS0–NS12 sign-off (2026-06-30) covered the
> external forge-slicer era (`:8766` / relay `:8082`). That matrix is obsolete;
> do not treat it as the live gate contract.

## Quick commands

```bash
make deploy                 # or: make ship / make ship RESTART=1
make gate-preflight         # preflight + phpunit + adapter + vitest + build + G00–G50
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
docker exec cloud_app curl -sf http://nc-print-slicer:8080/api/health
docker exec nc-print-slicer python3 /opt/adapter/smoke_test.py
# Moonraker (use the Admin-configured URL; lab default example):
curl -sf http://10.0.0.210:7125/server/info
```

Optional browser/proxy slice smoke (requires a session cookie for proxy mode):

```bash
# From inside cloud_app, or with NC_PRINT_SLICER_URL set explicitly:
NC_PRINT_SLICER_URL=http://nc-print-slicer:8080 bash tools/print-smoke-slice.sh
```

Ops settings and sidecar tuning: [ADMIN.md](ADMIN.md). Architecture:
[ARCHITECTURE.md](ARCHITECTURE.md).

## What `make gate-preflight` covers

| Step | What |
|------|------|
| `tools/print-preflight.sh` | Static PHP lint + viewport bundle presence |
| `make run-phpunit` | PHP unit tests |
| `make slicer-test` | Adapter pure-logic tests (`slicer/adapter/test_adapter.py`) |
| `npm run test` | Vitest frontend suite |
| `npm run build` | sass + webpack production |
| `tools/print-api-gates.php` | Deployed API/allowlist gates **G00–G50** (skipped if `cloud_app` is down) |

Version floor gate **G27** requires `>= 1.9.0` (historical floor; current app is far above).

## Manual / operator acceptance (not automated)

These still need a logged-in Nextcloud session when signing a release:

- Auth + allowed groups (403 for outsiders)
- Files “Open in NC 3D Print” for STL / 3MF / G-code
- Prepare → Slice → Print end-to-end on a real Moonraker printer
- Viewport / toolpath / project save-load smoke

## Git release checklist

| Item | Expectation |
|------|-------------|
| Remote | `origin` → `git@github.com:vdroners/nc-print.git` |
| Branch | `main` |
| Version sync | `appinfo/info.xml` = `package.json` = README badge = CHANGELOG top entry |
| Tag | Must equal the version string from `info.xml` (**no `v` prefix**), e.g. `1.60.11` |
| Tarball | `nc_print-<version>.tar.gz` from `make appstore` |
