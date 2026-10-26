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
- `@alfred print queue` — Moonraker queue
- `@alfred print slicer` — nc-print-slicer health
- `@alfred print help`
- Aliases still matched: `@alfred forge …`, `@alfred k1 …`, `@alfred nc-print …`

## Policy

- **Read-only in v1:** do not start, pause, or cancel prints without explicit operator confirmation in Talk.
- For slice-and-print workflows, describe steps and link to the NC Print dashboard; propose actions only.
- Print alerts arrive via `[nc_print]` prefixed messages (webhook relay + monitor cron).

## Alerts

NC outbound webhooks + `forge-print-monitor.sh` (NC backend) post to `NC_PRINT_ALERT_TALK_ROOM` / `FORGE_ALERT_TALK_ROOM`. Critical failures may also use native NC notify when `FORGE_NATIVE_NOTIFY=1`.
