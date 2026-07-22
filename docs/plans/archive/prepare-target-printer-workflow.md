# Prepare target printer workflow + continuity fixes

## Problem

NC 3D Print uses two printer concepts with confusing labels:

- **Slicer printer profile** (`selection.printerId`) — Orca preset for slice settings and viewport bed size.
- **Physical target printer** (`selectedPrinterId`) — Moonraker/Klipper machine for send/monitor.

Only the slicer profile was visible on Prepare; scan/detect lived on Print. Session-discovered printers were client-only and routed to the wrong server URL.

## Solution (v1.33.0)

1. **Target printer picker on Prepare** — shared `TargetPrinterPicker` with scan, connection chip, capabilities.
2. **Clear labels** — "Slicer printer profile" vs "Target printer".
3. **Gates aligned** — `prepareComplete` requires target; slice buttons honor `sliceBlockReason`; preview block respects `model.sliceFile`.
4. **Server routing** — `POST /api/printers/register-session`; unknown `printer_id` returns 400; session printers merged in `ConfigService`.
5. **Bundled fixes** — save-gcode fatal, temp toasts, keyboard nav gates, handoff UX, polish items from subagent audit.

## Verification

- Prepare: target picker + checklist; Continue to Slice blocked without target.
- Scan + Use: register-session → upload/state hit correct host.
- Unknown printer_id → HTTP 400, not silent default fallback.
- `make test` + `make gate-preflight`.
