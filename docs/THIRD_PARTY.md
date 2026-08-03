# Third-party components and attribution

## Slicing engine (sidecar, not in app tarball)

- **OrcaSlicer / Orca lineage** — AGPL-3.0. Shipped separately as the `nc-print-slicer` container image (see `.github/workflows/docker-slicer.yml` and `ghcr.io/vdroners/nc-print-slicer`). See `slicer/README.md` and the engine `LICENSE.txt` when staged via `make slicer-fetch`.
- **AGPL corresponding source:** anyone who receives or runs the `nc-print-slicer` image is entitled to the complete corresponding source of the Orca-lineage engine and adapter. Prefer the GitHub release assets / `ENGINE_SRC` staging path documented in `docs/INSTALL.md` and `docs/APPSTORE_ONBOARDING.md`; do not redistribute the binary-only image without offering source.

## Printer integration

- **Moonraker / Klipper** — upstream projects; NC 3D Print communicates via Moonraker HTTP/WebSocket APIs. No affiliation implied.

## Nextcloud

- Built with `@nextcloud/vue` and Nextcloud public PHP APIs (`OCP\`).
