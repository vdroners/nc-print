# Operator

1. Open **NC 3D Print** from the app menu.
2. **Prepare** — import or pick a model from Files; choose printer, filament, and process profiles; preview STL on the bed (3MF/OBJ slice without mesh preview).
3. **Slice** — optionally expand **Customize (advanced)** overrides; use **Slice and send to printer** or **Slice only**; review the result panel and preview PNG.
4. **Print** — monitor job filename and progress; pause/resume/cancel; upload existing G-code (local or Files) with optional auto-start; watch the live camera when configured.

Deep link: open `/apps/nc_print/?fileId=<node_id>` to load a Files model automatically.

Service health: a banner appears when the slicer or Moonraker is offline. See `docs/TROUBLESHOOTING.md`.

Feature parity vs Forge Slicer Studio: `docs/FEATURE_PORT.md`.
