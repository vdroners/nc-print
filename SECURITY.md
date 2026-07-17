# Security

NC 3D Print is designed so browsers cannot push arbitrary G-code at a printer,
and so the slicing engine (which parses untrusted meshes) stays sandboxed.

## Access

- App use is gated to Nextcloud **admins** or members of the configured
  `allowed_groups` (empty ⇒ admins only).
- Disruptive Moonraker updates (`UpdateController`) are **admin-only**, idle-only,
  and target-allowlisted.

## Upstream URLs

- **Primary:** Admin Settings configure slicer + Moonraker (+ optional multi-printer
  JSON). Those values are the durable source of truth.
- **Session / discovery:** allowed users may **register a Moonraker URL for the
  browser session** after LAN discovery (`SessionPrinterController`). This is
  intentional for “Found on network → use now.” Hosts are filtered by
  `UrlSafety` (blocks loopback, link-local, cloud metadata; allows RFC1918 /
  normal DNS). `camera_url` is also UrlSafety-checked at register time.
- Path/query strings on proxies cannot retarget hosts (`http://` in query is
  rejected).

## Moonraker proxy (path + method allowlist)

- **GET/HEAD:** monitoring prefixes only (`server/info`, `server/files/`,
  `printer/objects/`, `printer/print/` status, temperature store, history,
  job queue list, timelapse, device_power list, spoolman, webcams, update
  status, announcements).
- **POST:** only `server/job_queue/` and `machine/device_power/` (UI queue +
  power toggles).
- **PUT / PATCH / DELETE:** denied on the proxy.
- Raw `printer/gcode/script` is **never** on the allowlist. Guarded writes
  (temps, tuning, e-stop, filament, bed mesh, …) go through
  `PrinterController` with clamps and idle/motion guards.
- G-code console send is **off by default** and can only be enabled via `occ`
  (`console_enabled`) — not via the Admin settings API.

## Slicer proxy

- Explicit **prefix** allowlist (`api/health`, `api/slice`, `api/jobs/`,
  `api/mesh/`, `api/project/`, `api/flush`, …) — not blanket `api/*`.
- Traversal segments blocked via `PathSanitizer`; upload bodies capped (50 MB).
- Sidecar is internal-only on `nc-print-net` (no published host port),
  `cap_drop: ALL`, read-only rootfs + tmpfs scratch.

## Legacy external engine

If Admin points `slicer_internal_url` at a host-bound forge-slicer on `:8766`,
`InternalUrlResolver` may rewrite to LAN `:8082` for Docker reachability.
Prefer the owned `http://nc-print-slicer:8080` sidecar (`make slicer-up`).
