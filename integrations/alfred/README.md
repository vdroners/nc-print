# Alfred forge integration

Host-side glue that lets Alfred (the OpenClaw agent) watch and answer for the
K1 Max through 3DPrintForge. This is **not** part of the Nextcloud app: it is
excluded from `make deploy` and the appstore tarball.

Moved here from `openclaw-skylight` on 2026-09-28
(plan: `openclaw-skylight/docs/plans/repo-split-2026-09.md`).

| Path | Contents |
|---|---|
| `scripts/forge-*.sh` | Print monitor cron, `@alfred forge` fast path + dispatch, gates, secrets bootstrap, webhook config |
| `scripts/setup-*.sh` | Relay container, CPM route, ddclient hostname |
| `scripts/lib/` | `forge_api.py` (Forge REST client), `forge_talk_match.py` (Talk router matcher) |
| `skills/forge-print/` | OpenClaw skill |
| `docker-compose.forge-relay.yml` | `forge-webhook-relay` container (CPM network, :8790) |
| `docs/` | Setup guide, relay templates, original integration plan |
| `env.example` | `FORGE_*` keys for `~/.openclaw/.env` |

## Install

Requires `openclaw-alfred` installed first; this installer sources its
`openclaw-install-lib.sh` from `~/.openclaw/scripts`.

```bash
bash /media/4TB/nc-print/integrations/alfred/install-to-openclaw.sh --force
docker compose -f /media/4TB/nc-print/integrations/alfred/docker-compose.forge-relay.yml up -d
curl -sf http://127.0.0.1:8790/health
```

Full setup (secrets, CPM route, Forge webhook, cron): [docs/FORGE-INTEGRATION.md](docs/FORGE-INTEGRATION.md).
