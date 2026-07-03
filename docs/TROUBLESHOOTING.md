# Troubleshooting

| Symptom | Check |
|---------|--------|
| 403 on app | User not in allowed group (see Admin) |
| Slicer unreachable | `docker exec cloud_app curl -s http://nc-print-slicer:8080/api/health` — is the sidecar up and on `nc-print-net`? (`make slicer-up`) |
| Slicer up but `bundle.printers: 0` | Data-dir seed missing — re-run `make slicer-fetch` then `make slicer-up` (needs `~/.config/3DPrintForgeSlicer`) |
| Slice fails "Loading of a model file failed" | The engine can't load STL directly; the adapter converts STL→3MF — confirm you're on v1.12.0+ and the sidecar was rebuilt |
| Slice ignores my settings | Fixed in v1.12.1 — rebuild the sidecar (`make slicer-up`); the `settings` SSE event reports what was applied |
| "slicer busy" (503) | `MAX_CONCURRENT_SLICES` reached — retry, or raise the limit (see Admin) |
| Mesh too large | Over `MAX_MESH_TRIANGLES` — decimate the model, or raise the limit |
| Moonraker offline | `curl http://10.0.0.210:7125/server/info` |
| Red health banner | `curl -s https://<cloud>/apps/nc_print/api/status` — check `slicer_ok` / `moonraker_ok` |
| Sidecar container details | `docker logs nc-print-slicer`; engine log at `/tmp/engine.log`, Xvfb at `/tmp/xvfb.log` inside the container |

## Browser console (NC core — not nc_print bugs)

These messages appear on Nextcloud 33 and are **expected**; they are not regressions from NC 3D Print:

- `viewer: Some mimes were ignored` — STL/3MF not in server preview providers when browsing Files.
- `viewer: Could not register handler … already registered` — known viewer SPA double-init.
- `@nextcloud/vue: text or ariaLabel` on UserMenu / MainMenu — NC core header components.
- `search.js: unified search plugin-filters from talk` — informational startup log.
- `NotificationsApp.vue: permissions granted` — normal.

NC Print v1.0.1+ fixes app-owned noise: canceling the Files picker no longer logs `FilePicker: No nodes selected`, and the Prepare viewport no longer runs a continuous rAF redraw loop.

