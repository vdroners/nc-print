# NC Print v1.3.1 — viewport + workflow blockers

Shipped from the UX/QoL + blocker fix plan (2026-06-30).

## Problem

Operators reported: **3D model not visible after upload** and **unable to complete Prepare → Slice → Print**.

## Root causes addressed

1. ModelViewport loaded files before WebGL viewport was ready (silent no-op).
2. Canvas sizing could collapse in Nextcloud flex layout.
3. STL failures showed the same overlay as 3MF/OBJ “no preview”.
4. Workflow banner allowed Slice without profiles; no checklist explaining disabled CTAs.

## Changes

- `ModelViewport.vue` — pending file queue, error states, 360px height
- `PrepareChecklist.vue` — five-row readiness checklist
- `PrintWorkflowBanner.vue` — stricter gates + sub-labels
- `PrepareTab` / `SliceTab` / `PrintTab` — handoffs, idle empty, profile gates
- Help **Services** tab holds `SlicerStatusCard` (removed from Prepare scroll path)
- Gates G17–G19, VERIFY NS12.10–NS12.18

## Verification

```bash
make gate-preflight
make deploy
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
```

Manual: NS12.15 (STL mesh visible), NS12.16 (checklist), NS12.17 (E2E workflow), NS12.18 (3MF slice path).

## v1.4 deferral

Split workspace, pre-print modal, save G-code to Files — see [`nc-print-v14-backlog.md`](nc-print-v14-backlog.md).
