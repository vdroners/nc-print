# Limitations

- Single active slice job per forge-slicer instance (upstream constraint).
- Upload size capped at 50 MB through the slicer proxy; 50 MB for printer upload endpoint.
- Live telemetry uses the Moonraker WebSocket (via a short-lived ws-ticket) with automatic fallback to `/api/printer/state` polling when the socket is unavailable.
- Part B monitoring panels (temperature graph, bed mesh, queue, filament, history, timelapse) feature-detect from Moonraker `/server/info` components and hide when the corresponding plugin is absent.
- The G-code console *send* input is disabled by default and requires an explicit admin opt-in (`console_enabled`); the response log is read-only and always available.
- No NC-GCS dependency; fleet registry integration is manual today.
