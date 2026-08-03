# NC 3D Print — App Store publication readiness

Plan for publishing `nc_print` to the [Nextcloud App Store](https://apps.nextcloud.com) and as signed GitHub release tarballs. Target: vanilla Nextcloud (no site-specific Nextcloud dependency).

> **Status note (2026-08):** Several original P0/P1 items below are **stale** — empty Moonraker/camera/allowed-groups defaults, `IRootFolder` DI, nested `info.xml` documentation, CSRF on mutators, uninstall table DROP, `make appstore` excludes, and release CI have landed in-tree. Treat unchecked historical rows as an audit trail; verify against current `main` before filing store blockers.

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
| P0-1 | Default allowed group locked non-admins | `ConfigService` | **Done** — empty default → admins-only until configured |
| P0-2 | Lab Moonraker/camera defaults | `ConfigService` | **Done** — empty defaults |
| P0-3 | Store copy overpromises bundled slicer | `info.xml` | **Done** — clarify separate `nc-print-slicer` container |
| P0-4 | Private `\OC::$server->getUserFolder()` | Files/Gcode controllers | **Done** — `OCP\Files\IRootFolder` DI |
| P0-5 | Non-admin LAN port-scan via discovery | Discovery controller | Review rate-limit + access gate (group-gated + `UserRateLimit`) |
| P0-6 | Hardcoded Docker fallback host | `InternalUrlResolver` | Pass-through or env-only |

## P1 — Store compliance

| ID | Finding | Location | Remediation |
|----|---------|----------|-------------|
| P1-1 | No `l10n/en.json` / `de.json` | — | Add translations |
| P1-2 | No App Store screenshots | `docs/screenshots/` | PNGs + `<screenshot>` URLs (placeholders registered) |
| P1-3 | `MoonrakerProxyController` ignores `printer_id` | proxy | `resolveMoonrakerUrl($printerId)` |
| P1-4 | `console_enabled` CLI-only | Admin | Admin checkbox |
| P1-5 | Activity `parse(string $language)` incompatible | `Activity/Provider.php` | Untyped `$language` + `UnknownActivityException` |
| P1-6 | Browser WS mixed-content on HTTPS NC | `moonraker-ws.js` | Poll fallback + no internal URL leak |
| P1-7 | Camera URL scheme-only SSRF check | `CameraController` | Link-local/metadata blocklist |
| P1-8 | No `make appstore` / release CI | Makefile / workflows | **Done** — release automation + tightened excludes |

## P2 — Polish

- Rename user-facing "forge-slicer" strings
- SPDX headers, third-party attribution (Orca, Moonraker)
- Uninstall cleanup of `oc_appconfig` blobs + `ncprint_*` tables (**done**)
- Design/a11y pass

## Verification

1. `npm run build && npm test` exit 0
2. `composer test` / phpunit exit 0
3. Fresh install on vanilla NC: app opens, no white-screen without backends
4. `occ integrity:check-app nc_print` on signed tarball
5. Activity provider ERROR absent from `nextcloud.log`
6. Enable → disable → uninstall leaves no orphan config / tables

## References

- [Release Automation](https://docs.nextcloud.com/server/stable/developer_manual/app_publishing_maintenance/release_automation.html)
- [App store rules](https://docs.nextcloud.com/server/27/developer_manual/app_publishing_maintenance/publishing.html)
