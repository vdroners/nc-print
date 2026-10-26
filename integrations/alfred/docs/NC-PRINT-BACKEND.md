# Alfred → NC Print backend (Wave 1)

**Plan:** `docs/plans/forge-port.md` Wave 1.

## What changed

| Before | After (default) |
|--------|-----------------|
| `FORGE_API_URL` → Forge Studio `:3040` | Moonraker `NC_PRINT_MOONRAKER_URL` (lab: `10.0.0.210:7125`) |
| Forge slicer `:8766` | `nc-print-slicer` (docker IP / `NC_PRINT_SLICER_URL`) |
| Dashboard forge-vdroners | `https://cloud-vdroners.ddns.net/apps/nc_print/` |
| Talk prefix `[forge]` | `[nc_print]` for status/queue/slicer |

## Env

See `integrations/alfred/env.example`. Dual-read: `NC_PRINT_*` preferred, `FORGE_*` aliases.

Kill Forge fallback after Waves 2–3: keep `NC_PRINT_USE_FORGE_FALLBACK=0` (default).

## Smoke

```bash
source integrations/alfred/scripts/load-forge-env.sh
python3 integrations/alfred/scripts/lib/nc_print_api.py status
python3 integrations/alfred/scripts/lib/nc_print_api.py slicer
FORGE_ENABLED=1 bash integrations/alfred/scripts/forge-dispatch-exec.sh "print status"
```

## Forge teardown

**Not in this wave.** Forge Studio / `:3040` / forge-slicer remain until `chore/retire-forge`.
