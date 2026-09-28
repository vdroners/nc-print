# Import Alfred's Forge integration into nc-print (2026-09-28)

**Status:** DONE
**Parent plan:** `openclaw-skylight/docs/plans/repo-split-2026-09.md`

## What

Move the host-side Forge glue for Alfred (the OpenClaw agent) out of
`openclaw-skylight` into `integrations/alfred/`: print monitor cron,
`@alfred forge` fast path + dispatch, gates, Forge API client and Talk matcher,
the `forge-print` skill, and the `forge-webhook-relay` compose file + setup
scripts.

## Why

`openclaw-skylight` is scoped to Skylight household operations. Forge belongs
with the print app it watches.

## How

- Files copied verbatim, then: relay compose mounts `openclaw-alfred/scripts`
  (the relay only execs `talk-post.sh` / `nc-notify.sh`) and gets a stable
  compose project name `forge-relay`; `setup-forge-webhook-relay-docker.sh`
  resolves its own dir through the `~/.openclaw/scripts` symlink; port check in
  `forge-gates.sh` no longer races SIGPIPE under `pipefail`.
- `integrations/alfred/install-to-openclaw.sh` links scripts into
  `~/.openclaw/scripts` using `openclaw-install-lib.sh` from openclaw-alfred.
- Not part of the Nextcloud app: `make deploy` never copied it, and
  `make appstore` now excludes `integrations/`.

## Verification

- `find ~/.openclaw -xtype l` empty after install.
- `forge-webhook-relay` healthy under project `forge-relay`; `/health` 200 on
  127.0.0.1:8790 and from the CPM network.
- `alfred-cron-forge-print-monitor` run: `FORGE_MONITOR_OK online=ok`.
- Talk router imports `forge_talk_match` from `integrations/alfred/scripts/lib`.
