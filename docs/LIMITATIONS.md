# Limitations

- **Single active slice job per engine process.** Concurrency is bounded by
  `MAX_CONCURRENT_SLICES` (default 2); beyond that, slice requests get a 503.
- **Upload size** is capped at 50 MB through the slicer proxy (and the printer
  upload endpoint), and meshes over `MAX_MESH_TRIANGLES` (default 2 M) are
  rejected before slicing.
- **The engine cannot load STL directly** — the adapter converts uploaded STL to
  a bare 3MF first (transparent to the user). This is a property of this engine
  build.
- **Slice overrides** are applied by merging into copies of the process/filament
  presets (the CLI has no per-key override flags). Keys outside the mapped set
  are reported as ignored in the `settings` SSE event rather than silently
  applied.
- **Calibration:** the shipped Draco (`.drc`) calibration assets
  (temperature/retraction/input-shaping) embed printer-specific presets meant for
  the desktop GUI menu and are not sliced raw; the temperature case is covered by
  a self-generated parametric tower, alongside the shipped flow-rate models.
- **Not full Orca:** seam/support region painting, modifier meshes, and a
  multi-plate arrange/nesting *editor* are out of scope (auto-arrange is
  supported); advanced tuning still belongs in desktop Orca.
- **Nozzle diameter is not a per-job override.** It's shown read-only (from the
  printer profile) because it must co-vary with line widths, max volumetric
  speed, and pressure advance — changing only the diameter would produce
  physically wrong g-code. To print with a different nozzle, select a printer
  profile configured for that nozzle. **Build plate** (`curr_bed_type`) IS
  overridable per-job (Cool / Engineering / High Temp / Textured PEI / Textured
  Cool / Smooth PEI Plate); unrecognised values fall back to the profile default.
- **Moonraker:** live telemetry uses the WebSocket (via a short-lived ws-ticket)
  with automatic fallback to `/api/printer/state` polling. Part B panels
  feature-detect from `/server/info` and hide when the plugin is absent.
- No NC-GCS dependency; fleet registry integration is manual today.
