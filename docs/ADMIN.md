# Admin

Configure in **Settings → NC 3D Print**:

- **Slicer internal URL** — forge-slicer REST (default `http://host.docker.internal:8766`; from `cloud_app`, localhost/127.0.0.1 is rewritten to the Docker bridge gateway when `host.docker.internal` is unavailable. Bind forge-slicer on `0.0.0.0:8766` on the host, or set `NC_PRINT_HOST_GATEWAY` in the container.)
- **Moonraker internal URL** — Klipper API (default `http://10.0.0.210:7125`)
- **Camera URL** — snapshot endpoint for PiP
- **Allowed groups** — comma-separated Nextcloud groups (default `19 Labs`)
- Feature toggles to disable slicer or Moonraker independently


## Docker (`cloud_app`)

Host firewall blocks container → host `:8766`. Run `forge-slicer-docker-relay.service` (TCP `:8082` → `127.0.0.1:8766`). Inside the container, `ConfigService` rewrites slicer URLs to `http://<NC_PRINT_HOST_LAN or 10.0.0.84>:8082`. Override with `NC_PRINT_HOST_LAN`, `NC_PRINT_DOCKER_SLICER_PORT`, or app config `slicer_internal_url` (`http://10.0.0.84:8082`).
