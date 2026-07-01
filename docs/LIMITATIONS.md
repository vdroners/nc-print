# Limitations

- Single active slice job per forge-slicer instance (upstream constraint).
- Upload size capped at 50 MB through the slicer proxy; 50 MB for printer upload endpoint.
- Moonraker WebSocket is not exposed; polling uses `/api/printer/state`.
- No NC-GCS dependency; fleet registry integration is manual today.
