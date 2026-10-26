---
name: nc-print
description: NC 3D Print + K1 Max read-only guidance for Alfred Talk
---

# NC Print (NC 3D Print + K1 Max)

## Stack

- **Dashboard:** https://cloud-vdroners.ddns.net/apps/nc_print/
- **Printer:** Creality K1 Max (`k1-max` / Printy Baby) via Moonraker `10.0.0.210:7125`
- **Slicer:** nc-print-slicer (Orca-lineage sidecar)
- **Parts library:** `/media/4TB/3dprints` (NC Print library panel — Wave 4+)

## Talk fast-path (no LLM)

- `@alfred print status` — printer state, file, temps
- `@alfred print eta` — remaining time, percent, layer
- `@alfred print temps` — nozzle and bed actual/target
- `@alfred print job` — filename, percent, elapsed, dashboard link
- `@alfred print queue` — Moonraker queue
- `@alfred print slicer` — nc-print-slicer health
- `@alfred print camera` — points at the dashboard; Talk does not get frames
- `@alfred print help`
- Aliases still matched: `@alfred forge …`, `@alfred k1 …`, `@alfred nc-print …`

## Policy

- **Read-only:** do not start, pause, or cancel prints from Talk.
- For slice-and-print workflows, describe steps and link to the NC Print dashboard; propose actions only.
- Print alerts arrive via `[nc_print]` prefixed messages (webhook relay + monitor cron).

## Alerts

NC outbound webhooks (`print_started` / `finished` / `failed` / `cancelled` / `protection_alert`) post through `forge-webhook-relay` on `:8790`. `print_progress` is ignored so it cannot spam Talk.

`alfred-cron-nc-print-monitor.timer` (15 min) runs `forge-print-monitor.sh` against Moonraker:

- Immediate: offline, fail, cancel, complete, stuck, slicer down
- While printing: hourly line plus 25/50/75% milestones (`NC_PRINT_HOURLY_*`, `NC_PRINT_MILESTONES`)
- Quiet hours (`NC_PRINT_QUIET_HOURS`, default 23:00–07:00) suppress **digests only**

Room: `NC_PRINT_ALERT_TALK_ROOM` / `FORGE_ALERT_TALK_ROOM`. Critical failures may also use native NC notify when `FORGE_NATIVE_NOTIFY=1`.
