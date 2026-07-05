# K1 Max "unknown error" (Klipper key61)

Generic **"unknown error"** popups on the Creality K1 Max LCD and in the native
Creality app at print start. Klipper is healthy; the message is not a hardware
fault.

## Symptom

- Popup appears just before or as a print starts (after calibration / chamber prep).
- Cleared manually on the LCD each time; print may still proceed.
- Same class of error can appear in the Creality mobile app.

## Root cause

Klipper error code **`key61` = "Unknown command"**. Moonraker's console store
(`/server/gcode_store`) shows lines like:

```json
{"code":"key61","msg":"Unknown command:T0"}
{"code":"key61","msg":"Unknown command:BOX_ENABLE_CFS_PRINT"}
```

| Command | Why it fails on a stock K1 Max |
|---------|----------------------------------|
| `T0` | Tool-select G-code from Creality/Orca machine start scripts; single-extruder K1 Max has no `T0` handler. |
| `BOX_ENABLE_CFS_PRINT` | Creality Filament System (CFS) enable macro; undefined when no CFS is installed. |

These commands are **not** emitted by nc_print (no matches in this repo). They
come from the slicer's built-in Creality-K1 start G-code and the native Creality
app's CFS flow. Fixing them on the printer covers nc_print, Orca, and the native
app.

### Live evidence (Moonraker)

```bash
curl -s http://PRINTER:7125/printer/info          # state should be "ready"
curl -s "http://PRINTER:7125/server/gcode_store?count=20"
curl -s http://PRINTER:7125/server/files/config/gcode_macro.cfg | grep -E 'T0|BOX_ENABLE'
```

Replace `PRINTER` with your Moonraker host (lab K1 Max: `10.0.0.210`).

## Fix — no-op macros on the printer

`printer.cfg` already includes `[include gcode_macro.cfg]`. Append these macros
(if they are not already present):

```ini
# --- nc_print compatibility: silence stray "Unknown command" (key61) popups ---
[gcode_macro T0]
description: No-op tool select (single-extruder K1 Max)
gcode:
    # intentionally empty

[gcode_macro BOX_ENABLE_CFS_PRINT]
description: No-op CFS enable (no Creality Filament System installed)
gcode:
    # intentionally empty
```

Then run **`FIRMWARE_RESTART`** so Klipper reloads the config.

### Option A — Moonraker file API (no SSH)

**Important:** pass `root=config` as a **form field**, not only in the query
string. Default upload root is `gcodes`; wrong root uploads a useless copy there.

```bash
PRINTER=10.0.0.210   # your Moonraker host

# Download current config
curl -sf "http://${PRINTER}:7125/server/files/config/gcode_macro.cfg" \
  -o /tmp/gcode_macro.cfg

# Append the macro block above (edit /tmp/gcode_macro.cfg), then upload:
curl -sf -X POST "http://${PRINTER}:7125/server/files/upload" \
  -F "root=config" \
  -F "file=@/tmp/gcode_macro.cfg;filename=gcode_macro.cfg"

# Reload Klipper
curl -sf -X POST \
  "http://${PRINTER}:7125/printer/gcode/script?script=FIRMWARE_RESTART"
```

Wait until `curl -s http://${PRINTER}:7125/printer/info` reports `"state":"ready"`.

### Option B — SSH

Edit `/usr/data/printer_data/config/gcode_macro.cfg` on the printer, append the
block, then restart Klipper (Mainsail/Fluidd **Firmware Restart** or
`FIRMWARE_RESTART` in the console).

## Verify

| Check | Command | Pass |
|-------|---------|------|
| Klipper ready | `curl -s http://PRINTER:7125/printer/info` | `"state":"ready"` |
| T0 silent | `POST …/printer/gcode/script?script=T0` | No key61 in response |
| CFS silent | `POST …/printer/gcode/script?script=BOX_ENABLE_CFS_PRINT` | No key61 in response |
| Next print | Start any job | No new `Unknown command:T0` / `BOX_ENABLE_CFS_PRINT` in gcode store |

```bash
curl -sf -X POST "http://${PRINTER}:7125/printer/gcode/script?script=T0"
curl -sf -X POST "http://${PRINTER}:7125/printer/gcode/script?script=BOX_ENABLE_CFS_PRINT"
curl -s "http://${PRINTER}:7125/server/gcode_store?count=10"
```

### Applied on lab printer (2026-07-05)

- Host: `K1Max-Printy-Baby` @ `10.0.0.210:7125`
- Macros appended to `gcode_macro.cfg` (config root, size 26410 bytes)
- Console `T0` and `BOX_ENABLE_CFS_PRINT` return `ok` with no key61

### Other CFS commands (optional)

Print start G-code may also call macros such as `BOX_SET_PRE_LOADING`,
`BOX_ENABLE_AUTO_REFILL`, or `FILAMENT_RACK_MODIFY`. Without a CFS installed,
those can still produce key61 popups. Add similar empty `[gcode_macro …]` stubs
only if you see them in `/server/gcode_store`.

## Appendix — unrelated nc_print Activity log error

**Not** the LCD popup. Nextcloud `nextcloud.log` could show:

```text
Declaration of OCA\NcPrint\Activity\Provider::parse(string $language, ...)
must be compatible with OCP\Activity\IProvider::parse($language, ...)
```

Fixed in **nc_print v1.32.1**: `lib/Activity/Provider.php` uses an untyped
`$language` parameter and throws `UnknownActivityException` for foreign events.
No further action if you are on v1.32.1 or later.
