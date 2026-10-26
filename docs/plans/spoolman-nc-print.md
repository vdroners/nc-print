# Spoolman ↔ NC Print (deferred)

**Lab probe (2026-10-25):** Spoolman is **not** listening on `:7912` (or common lab URLs). Forge Spoolman hooks remain unused.

## Follow-up when enabled

1. Confirm Spoolman URL + Moonraker `[spoolman]` section on K1 Max.
2. Wire NC Filament inventory sync or read-through via existing Moonraker `server/spoolman/` proxy allowlist (already present).
3. Optional notify on spool low — reuse OutboundWebhookService.

**Gap G** closed as deferred — no feature code in the Forge port waves.
