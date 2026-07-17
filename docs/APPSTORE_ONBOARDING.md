# Nextcloud App Store onboarding (operator manual steps)

These steps require account access and cannot be fully automated in CI. Complete them **before** the first public App Store submission.

## 1. Public GitHub repositories

- Confirm `https://github.com/vdroners/nc-print` and `https://github.com/vdroners/nc-wireguard` are **public**.
- Run `./scripts/secret-history-scan.sh` in each repo and scrub any leaked secrets **before** going public.

## 2. Register app IDs on the App Store developer portal

1. Sign in at [https://apps.nextcloud.com/developer](https://apps.nextcloud.com/developer) (GitHub OAuth).
2. Register app IDs **`nc_print`** and **`nc_wireguard`** if not already claimed.
3. Create an **API token** (`APPSTORE_TOKEN`) for release automation.

## 3. Code signing certificate

Per the [Release Automation guide](https://docs.nextcloud.com/server/stable/developer_manual/app_publishing_maintenance/release_automation.html):

1. Generate a private key and CSR for each app.
2. Submit the CSR via the developer portal; download the signed certificate.
3. Store as GitHub **environment** secrets on a protected `release` environment:
   - `APP_PRIVATE_KEY` — PEM private key (full text)
   - `APP_PUBLIC_CRT` — signed certificate (full text)
   - `APPSTORE_TOKEN` — App Store API token

## 4. GitHub release workflow

1. Bump version in `appinfo/info.xml`, `package.json`, and `CHANGELOG.md`.
2. Tag and publish a GitHub Release. The **tag must equal** the version in
   `appinfo/info.xml` with **no `v` prefix** (e.g. tag `1.60.11` for version
   `1.60.11`). The release workflow refuses a mismatch so the App Store
   download URL stays aligned with `nc_print-<version>.tar.gz`.
3. The `.github/workflows/release.yml` workflow builds, signs, uploads
   `nc_print-<version>.tar.gz`, and pushes to the App Store.

Local dry-run:

```bash
make appstore
# With a local Nextcloud install:
export NC_OCC=/path/to/occ
export APP_PRIVATE_KEY=/path/to/app.key
export APP_PUBLIC_CRT=/path/to/app.crt
make appstore-sign
```

## 5. Store listing copy (EN + DE)

Prepare long descriptions for both languages covering:

- What the app does and required external services (Moonraker + optional nc-print-slicer sidecar).
- AGPL licence and privacy (no telemetry beyond configured printer/slicer URLs).
- Screenshot URLs must be absolute HTTPS (`raw.githubusercontent.com/.../docs/screenshots/*.png`).

## 6. nc-print-slicer sidecar (nc_print only)

The ~380 MB Orca engine is **not** bundled in the app tarball. Publish the sidecar as a container image, e.g.:

```bash
docker build -t ghcr.io/vdroners/nc-print-slicer:1.32.1 slicer/
docker push ghcr.io/vdroners/nc-print-slicer:1.32.1
```

Reference `docker-compose.slicer.yml` in the store listing and `docs/INSTALL.md`.

## 7. Post-release verification

```bash
occ integrity:check-app nc_print   # or nc_wireguard
occ app:disable nc_print && occ app:enable nc_print
# After uninstall: confirm no orphan oc_appconfig / nc_wg_* tables
```
