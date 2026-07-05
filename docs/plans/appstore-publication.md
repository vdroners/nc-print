# NC 3D Print — App Store publication readiness

Plan for publishing `nc_print` to the [Nextcloud App Store](https://apps.nextcloud.com) and as signed GitHub release tarballs. Target: vanilla Nextcloud (no 19 Labs / NC-GCS dependency).

## Store guardrails

- AGPL-3.0-or-later (`LICENSE` present)
- Public `OCP\` API only (no `\OC\` in runtime controllers)
- No "Nextcloud" in app name
- Degrade gracefully without Moonraker/slicer; clean up on uninstall
- Declare `<php>`, `<database>`, `<lib>` in `info.xml`
- EN + DE `l10n/` and store screenshots

## P0 — Blocks publication

| ID | Finding | Location | Remediation |
|----|---------|----------|-------------|
| P0-1 | Default allowed group `19 Labs` locks out non-admin users | `lib/Service/ConfigService.php:34`, `AdminSettings.php:44-47` | Empty default → admins-only until configured |
| P0-2 | Lab Moonraker/camera defaults `10.0.0.210` | `ConfigService.php:31-33` | Empty defaults + first-run setup UI |
| P0-3 | Store copy overpromises bundled slicer | `appinfo/info.xml:7-9` | Clarify separate `nc-print-slicer` container |
| P0-4 | Private `\OC::$server->getUserFolder()` | `FilesController.php:45,80`, `GcodeSaveController.php:56` | `OCP\Files\IRootFolder` DI |
| P0-5 | Non-admin LAN port-scan via discovery | `PrinterDiscoveryController.php:38-52`, `PrinterDiscoveryService.php:35-57` | Admin-only discovery |
| P0-6 | Hardcoded `10.0.0.84` Docker fallback | `InternalUrlResolver.php:52` | Pass-through or env-only |

## P1 — Store compliance

| ID | Finding | Location | Remediation |
|----|---------|----------|-------------|
| P1-1 | No `l10n/en.json` / `de.json` | — | Add translations |
| P1-2 | No App Store screenshots | `docs/screenshots/` | PNGs + `<screenshot>` URLs |
| P1-3 | `MoonrakerProxyController` ignores `printer_id` | `MoonrakerProxyController.php:210` | `resolveMoonrakerUrl($printerId)` |
| P1-4 | `console_enabled` CLI-only | `AdminController.php`, `admin_settings.php` | Admin checkbox |
| P1-5 | Activity `parse(string $language)` incompatible | `Activity/Provider.php:31` | Untyped `$language` + `UnknownActivityException` |
| P1-6 | Browser WS mixed-content on HTTPS NC | `moonraker-ws.js:27-44` | Poll fallback + no internal URL leak |
| P1-7 | Camera URL scheme-only SSRF check | `CameraController.php:90-97` | Link-local/metadata blocklist |
| P1-8 | No `make appstore` / release CI | `Makefile`, `.github/workflows/` | Release automation |

## P2 — Polish

- Rename user-facing "forge-slicer" strings
- SPDX headers, third-party attribution (Orca, Moonraker)
- Uninstall cleanup of `oc_appconfig` blobs
- Design/a11y pass

## Verification

1. `npm run build && npm test` exit 0
2. `composer test` / phpunit exit 0
3. Fresh install on vanilla NC: app opens, no white-screen without backends
4. `occ integrity:check-app nc_print` on signed tarball
5. Activity provider ERROR absent from `nextcloud.log`
6. Enable → disable → uninstall leaves no orphan config

## References

- [Release Automation](https://docs.nextcloud.com/server/stable/developer_manual/app_publishing_maintenance/release_automation.html)
- [App store rules](https://docs.nextcloud.com/server/27/developer_manual/app_publishing_maintenance/publishing.html)
