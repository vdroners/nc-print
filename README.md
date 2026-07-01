# NC Print

Nextcloud app for **prepare → slice → print** workflows using forge-slicer REST and Moonraker/Klipper.

## Defaults

| Service | Default URL |
|---------|-------------|
| forge-slicer | `http://127.0.0.1:8766` |
| Moonraker | `http://10.0.0.210:7125` |

## Quick start

```bash
make build
make deploy   # requires running cloud_app container
make gate-preflight
```

See [docs/INSTALL.md](docs/INSTALL.md) and [docs/VERIFY.md](docs/VERIFY.md).
