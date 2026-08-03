# Continuity pass (2026-08) — nc-print

Part of the targeted NC-apps continuity pass across 17 custom Nextcloud apps.

## Changes
- Redrew `img/app.svg` as a single-ink 24×24 `currentColor` 3D-printer silhouette (nav + Settings section icon).
- Removed `Application::boot()` global `addStyle('nc-print-theme')`; theme now loads from PageController, AdminSettings, and the dashboard widget only.
- Re-scoped `css/nc-print-theme.css` tokens from `:root` to `#nc-print-root` / `#nc-print-admin-settings` / `.nc-print-dash`.
- Mapped banner/badge danger/warning colors to Nextcloud `--color-error` / `--color-warning` / `--color-success` tokens.

## Verify
- Files page does not load `nc-print-theme.css`.
- Print SPA + admin still styled; light/dark banners legible.
- App nav icon monochrome in light and dark themes.
