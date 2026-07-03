# Admin

Configure in **Settings → NC 3D Print**:

- **Slicer internal URL** — the owned slicing engine sidecar. Default
  `http://nc-print-slicer:8080` (reached by container DNS over `nc-print-net`).
  Change it only to point at an external engine; user paths can never retarget it.
- **Moonraker internal URL** — Klipper API (default `http://10.0.0.210:7125`).
- **Camera URL** — snapshot endpoint for PiP / the Print monitor.
- **Printer display name** — UI label.
- **Allowed groups** — comma-separated Nextcloud groups (default `19 Labs`).
- **Multi-printer config** — optional JSON array of
  `{id, name, moonraker_url, camera_url, default}`.
- Feature toggles to disable the slicer or Moonraker independently.

## The slicing engine sidecar (`nc-print-slicer`)

The engine runs as its own container defined in `docker-compose.slicer.yml`.

```bash
make slicer-fetch     # stage the engine + resources + data-dir seed (kept out of git)
make slicer-build     # build the image
make slicer-up        # run it + attach cloud_app to nc-print-net
make slicer-down      # stop it
```

Health:

```bash
docker exec cloud_app curl -s http://nc-print-slicer:8080/api/health
```

`ok:true` with non-zero `bundle.printers` means the engine loaded its full preset
bundle. `jobs` reports active/cached/max-concurrent slices.

### Tuning knobs (environment, set on the sidecar service)

| Var | Default | Purpose |
|-----|---------|---------|
| `MAX_CONCURRENT_SLICES` | `2` | Simultaneous engine processes; excess requests get 503 |
| `MAX_MESH_TRIANGLES` | `2000000` | Reject larger uploads before they can OOM the container |
| `SLICE_TIMEOUT_S` | `600` | Per-slice hard timeout |
| `JOB_MAX_AGE_S` | `3600` | Completed jobs + `/tmp/slice/<id>` are GC'd after this |
| `GC_INTERVAL_S` | `300` | GC sweep interval |

Container hardening (in `docker-compose.slicer.yml`): internal-only (no host
port), `cap_drop: ALL`, `no-new-privileges`, read-only rootfs + tmpfs scratch,
`mem_limit: 4g`, `pids_limit: 512`. Operator-authored presets persist in the
`nc-print-slicer-user` volume.

## G-code console (`console_enabled`) — off by default

The Print monitor can expose a Mainsail/Fluidd-style G-code console. For safety
it is **disabled by default**: the read-only response log always renders, but the
command **input is hidden** and the backend `printer#consoleCommand` endpoint
returns **403** until an admin explicitly opts in.

Enabling it is intentionally **not** exposed in the admin UI — it must be turned
on deliberately via `occ`, for trusted operators only:

```bash
# inside cloud_app
occ config:app:set nc_print console_enabled --value=1   # enable
occ config:app:set nc_print console_enabled --value=0   # disable (default)
```

Even when enabled, sends are guarded server-side: commands are length- and
charset-validated, motion commands are refused while a print is active, and there
is **no raw `printer/gcode/script` passthrough** — every write flows through
allowlisted `PrinterController` actions. All other Part B panels (temperature
graph, bed mesh, queue, filament, history, timelapse) are read-only through the
Moonraker proxy allowlist and feature-detect from `/server/info`.
