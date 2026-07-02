# Admin

Configure in **Settings → NC 3D Print**:

- **Slicer internal URL** — forge-slicer REST (default `http://host.docker.internal:8766`; from `cloud_app`, localhost/127.0.0.1 is rewritten to the Docker bridge gateway when `host.docker.internal` is unavailable. Bind forge-slicer on `0.0.0.0:8766` on the host, or set `NC_PRINT_HOST_GATEWAY` in the container.)
- **Moonraker internal URL** — Klipper API (default `http://10.0.0.210:7125`)
- **Camera URL** — snapshot endpoint for PiP
- **Allowed groups** — comma-separated Nextcloud groups (default `19 Labs`)
- Feature toggles to disable slicer or Moonraker independently

## G-code console (`console_enabled`) — off by default

The Print monitor can expose a Mainsail/Fluidd-style G-code console (WS11). For
safety it is **disabled by default**: the read-only response log always renders,
but the command **input is hidden** and the backend `printer#consoleCommand`
endpoint returns **403** until an admin explicitly opts in.

Enable it only for trusted operators. Either toggle **"G-code console send
(advanced)"** in **Settings → NC 3D Print**, or use `occ`:

```bash
# inside cloud_app
occ config:app:set nc_print console_enabled --value=1   # enable
occ config:app:set nc_print console_enabled --value=0   # disable (default)
```

Even when enabled, sends are still guarded server-side: commands are length- and
charset-validated, motion commands are refused while a print is active, and
there is **no raw `printer/gcode/script` passthrough** — every write flows
through allowlisted `PrinterController` actions. All other Part B panels
(temperature graph, bed mesh, queue, filament, history, timelapse) are
read-only through the Moonraker proxy allowlist and need no toggle; they
feature-detect from `/server/info` components and hide when the corresponding
Moonraker plugin is absent.


## Docker (`cloud_app`)

Host firewall blocks container → host `:8766`. Run `forge-slicer-docker-relay.service` (TCP `:8082` → `127.0.0.1:8766`). Inside the container, `ConfigService` rewrites slicer URLs to `http://<NC_PRINT_HOST_LAN or 10.0.0.84>:8082`. Override with `NC_PRINT_HOST_LAN`, `NC_PRINT_DOCKER_SLICER_PORT`, or app config `slicer_internal_url` (`http://10.0.0.84:8082`).
