# Architecture

```
Browser (Vue) → Nextcloud nc_print PHP controllers → internal LAN
                      ├─ SlicerProxyController → forge-slicer :8766
                      ├─ MoonrakerProxyController (allowlisted REST)
                      └─ PrinterController (state + upload + job control)
```

Octet-stream slice uploads from the browser are converted server-side to forge-slicer multipart (`model`, `printer_id`, `filament_ids`, `process_id`, `overrides`).
