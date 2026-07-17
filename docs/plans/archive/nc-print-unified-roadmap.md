# NC Print unified roadmap (v1.2.1 → v1.3)

Checked-in summary of `.cursor/plans/orcaslicer_port_audit_3209af2e.plan.md`.

## v1.2.1 (shipped in v1.3.0 tag)

- Centered `PrintWorkflowBanner` (removed duplicate tab bar + `WorkflowStepper`)
- Pinned chrome + `.nc-print-tab-scroll` scroll container
- Verify: NS12.10 manual gate in `docs/VERIFY.md`

## v1.3.0 (this release)

- Files app **Open in NC 3D Print** (`LoadFilesActions` + `files-action.mjs`)
- Slicer status card (version / upstream / config_dir from `/api/health`)
- Multi-tool filament breakdown on slice result
- Help drawer Orca calibration wiki links
- G-code deep link `?fileId=&tab=print`

## v1.4+ (backlog)

- G-code toolpath viewer, pre-print modal, save G-code to Files
- Moonraker WS client for live progress
- Save Quality preset — blocked until forge-slicer exposes `POST /api/profiles`

## Verification

After `make deploy`:

```bash
make gate-preflight
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
```

Manual: NS3 (Files integration), NS12.10–12.11 (scroll + Files action).
