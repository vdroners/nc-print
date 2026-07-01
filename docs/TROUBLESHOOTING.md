# Troubleshooting

| Symptom | Check |
|---------|--------|
| 403 on app | User not in allowed group (see Admin) |
| Slicer unreachable | `curl http://127.0.0.1:8766/api/health` from Nextcloud host |
| Moonraker offline | `curl http://10.0.0.210:7125/server/info` |
| Slice stream ends early | forge-slicer logs; verify multipart fields in admin proxy logs |
| Red health banner | `curl -s https://<cloud>/apps/nc_print/api/status` — check `slicer_ok` / `moonraker_ok` |

## Browser console (NC core — not nc_print bugs)

These messages appear on Nextcloud 33 and are **expected**; they are not regressions from NC 3D Print:

- `viewer: Some mimes were ignored` — STL/3MF not in server preview providers when browsing Files.
- `viewer: Could not register handler … already registered` — known viewer SPA double-init.
- `@nextcloud/vue: text or ariaLabel` on UserMenu / MainMenu — NC core header components.
- `search.js: unified search plugin-filters from talk` — informational startup log.
- `NotificationsApp.vue: permissions granted` — normal.

NC Print v1.0.1+ fixes app-owned noise: canceling the Files picker no longer logs `FilePicker: No nodes selected`, and the Prepare viewport no longer runs a continuous rAF redraw loop.

