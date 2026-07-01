# Security

- Moonraker and slicer URLs are **admin-configured only**; user paths cannot retarget upstream hosts.
- Moonraker proxy uses a strict path allowlist (`server/info`, `server/files/`, `printer/objects/`, `printer/print/`).
- Slicer proxy only forwards `api/*` paths; traversal segments are blocked via `PathSanitizer`.
- `serve-viewer` is not part of this app; camera frames are proxied through Nextcloud when enabled.
