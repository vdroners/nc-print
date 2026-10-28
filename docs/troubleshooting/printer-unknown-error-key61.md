# K1 Max "unknown error" (Klipper key61)

Generic **"Unknown error"** on the Creality Print UI and on the Creality K1 Max
LCD. Klipper is healthy. The job can still print. The message is not a hardware
fault and it is not the Wi-Fi send timeout in
[k1-max-wifi-send-timeouts.md](k1-max-wifi-send-timeouts.md).

Klipper error code **`key61` = "Unknown command"**.

## Confirmed 2026-10-28 (lab K1 Max)

Host: `K1Max-Printy-Baby` at `10.0.0.210`. Creality Print showed Unknown error.
Klippy logged `key61`. The print still ran.

| Time (PT) | Klippy | Where it comes from |
|-----------|--------|---------------------|
| ~07:00 | `Unknown command:BOX_ENABLE_CFS_PRINT` | Creality Print injects this at **send**. It is not in the saved gcode. |
| ~07:08 | `Unknown command:T0` | When the job **started**. Machine start G-code contains `T[initial_no_support_extruder]`, which expands to `T0` on this single-extruder printer. |

Live `gcode_macro.cfg` on that printer has neither macro. A note below records
empty no-op macros as added on 2026-07-05. They were lost later, or that write
never stuck. **This document does not put them back.** Copying them onto the
K1 Max is a separate ops step, and only while the printer is idle.

nc_print does not emit either command (no matches in this repo). The printer-side
macros cover Creality Print, Orca-lineage start G-code, and the native Creality
app.

## Symptom

- Popup on the Creality Print UI and/or the printer LCD at send or at job start
  (after calibration / chamber prep).
- Cleared manually on the LCD; the print may still proceed.
- Moonraker `/server/gcode_store` (and Klippy) show `key61`, not a thermal,
  motion, or connectivity fault.

## Root cause

| Command | Why it fails on this K1 Max |
|---------|------------------------------|
| `BOX_ENABLE_CFS_PRINT` | Creality Filament System (CFS) enable macro. Undefined when no CFS is installed. Injected by Creality Print at send; absent from the saved gcode file. |
| `T0` | Tool-select from machine start G-code `T[initial_no_support_extruder]`. A single-extruder K1 Max has no `T0` handler. |

`printer.cfg` includes `[include gcode_macro.cfg]`. Defining both names there as
empty macros makes Klipper accept the lines.

### Read-only checks

```bash
curl -s http://PRINTER:7125/printer/info          # state should be "ready"
curl -s "http://PRINTER:7125/server/gcode_store?count=20"
curl -s http://PRINTER:7125/server/files/config/gcode_macro.cfg | grep -E 'T0|BOX_ENABLE'
```

Replace `PRINTER` with the Moonraker host (lab K1 Max: `10.0.0.210`). `grep`
with no output means the no-op macros are missing.

## Fix — append the no-op macros, then FIRMWARE_RESTART

Do this **only while the printer is idle**. `FIRMWARE_RESTART` drops a running
or paused job. Nothing in CI or `make ship` writes printer config.

Copy-paste fragment (append; do not replace `gcode_macro.cfg`):

[`snippets/k1-max-key61-noop-macros.cfg`](snippets/k1-max-key61-noop-macros.cfg)

```ini
# --- silence stray "Unknown command" (key61) popups (no CFS, single extruder) ---
[gcode_macro T0]
description: No-op tool select (single-extruder K1 Max)
gcode:
    # intentionally empty

[gcode_macro BOX_ENABLE_CFS_PRINT]
description: No-op CFS enable (no Creality Filament System installed)
gcode:
    # intentionally empty
```

Skip the append if both sections are already in the file. A second copy makes
Klipper reject the config.

The lab printer also runs `S54moonraker_conf_guard` (see
[STACK_MAP.md](../STACK_MAP.md)). That script is not proven to have removed
these macros. After Klipper is `ready` again, re-read `gcode_macro.cfg`, and
read it once more after the next reboot, so a later wipe is obvious.

### 1. Confirm idle

```bash
PRINTER=10.0.0.210
curl -s "http://${PRINTER}:7125/printer/objects/query?print_stats"
```

Continue only when `result.status.print_stats.state` is `standby`, `complete`,
`cancelled`, or `error`. Stop if it is `printing` or `paused`.

### 2. Moonraker file API (no SSH)

Pass `root=config` as a **form field**, not only in the query string. The
default upload root is `gcodes`; the wrong root leaves a useless copy there
and does not change the config Klipper loads.

```bash
PRINTER=10.0.0.210

curl -sf "http://${PRINTER}:7125/server/files/config/gcode_macro.cfg" \
  -o /tmp/gcode_macro.cfg

# If T0 and BOX_ENABLE_CFS_PRINT are absent, append
# docs/troubleshooting/snippets/k1-max-key61-noop-macros.cfg
# to /tmp/gcode_macro.cfg, then:

curl -sf -X POST "http://${PRINTER}:7125/server/files/upload" \
  -F "root=config" \
  -F "file=@/tmp/gcode_macro.cfg;filename=gcode_macro.cfg"

curl -sf -X POST \
  "http://${PRINTER}:7125/printer/gcode/script?script=FIRMWARE_RESTART"
```

Wait until `curl -s http://${PRINTER}:7125/printer/info` reports `"state":"ready"`.

### 3. SSH alternative

Edit `/usr/data/printer_data/config/gcode_macro.cfg` on the printer, append the
same block, then **Firmware Restart** from Mainsail/Fluidd or `FIRMWARE_RESTART`
in the console. Same idle rule.

## Optional — Creality Print machine start G-code

On a printer **without** CFS, Creality Print's machine start G-code includes
`T[initial_no_support_extruder]`. After the printer is idle, remove that
`T[…]` token from the profile's machine start G-code so a later job does not
emit `T0`.

That edit does not stop the send-time inject. `BOX_ENABLE_CFS_PRINT` is not in
the saved gcode, so the empty macros are still what silences that popup. Leave
the `T[…]` line in place on a machine that actually has a multi-extruder or CFS
tool map.

## Verify (after the restart, still idle)

| Check | Command | Pass |
|-------|---------|------|
| Klipper ready | `curl -s http://PRINTER:7125/printer/info` | `"state":"ready"` |
| Sections present | `GET …/server/files/config/gcode_macro.cfg` | both `[gcode_macro T0]` and `[gcode_macro BOX_ENABLE_CFS_PRINT]` |
| T0 silent | `POST …/printer/gcode/script?script=T0` | `ok`, no key61 |
| CFS silent | `POST …/printer/gcode/script?script=BOX_ENABLE_CFS_PRINT` | `ok`, no key61 |
| Next print | Start any job | No new `Unknown command:T0` / `BOX_ENABLE_CFS_PRINT` in the gcode store |

```bash
curl -sf -X POST "http://${PRINTER}:7125/printer/gcode/script?script=T0"
curl -sf -X POST "http://${PRINTER}:7125/printer/gcode/script?script=BOX_ENABLE_CFS_PRINT"
curl -s "http://${PRINTER}:7125/server/gcode_store?count=10"
```

Running `T0` or `BOX_ENABLE_CFS_PRINT` **before** the macros exist reproduces
the key61 popup. Use those two calls only as the post-restart check.

## History

### Recorded 2026-07-05 (not on the printer on 2026-10-28)

- Macros were recorded as appended to `gcode_macro.cfg` (config root, size
  26410 bytes) on `K1Max-Printy-Baby` @ `10.0.0.210:7125`.
- Console `T0` and `BOX_ENABLE_CFS_PRINT` were recorded as returning `ok` with
  no key61.
- On 2026-10-28 the live file did not contain either section. Treat 2026-07-05
  as a past attempt, not as current printer state.

### 2026-10-28

- Creality Print Unknown error; Klippy `key61` at ~07:00 PT
  (`BOX_ENABLE_CFS_PRINT`, send inject, not in saved gcode) and ~07:08 PT
  (`T0` from `T[initial_no_support_extruder]` at job start).
- Print completed anyway.
- Macros were **not** re-applied as part of the doc update. Apply them only
  after the printer is idle, using the snippet above.

## Other CFS commands (optional)

Start G-code or the Creality app may also call `BOX_SET_PRE_LOADING`,
`BOX_ENABLE_AUTO_REFILL`, or `FILAMENT_RACK_MODIFY`. Without a CFS, those can
still produce key61. Add a similar empty `[gcode_macro …]` only after you see
that exact name in `/server/gcode_store`. They are not in the snippet.

## Appendix — unrelated nc_print Activity log error

**Not** the LCD or Creality Print popup. Nextcloud `nextcloud.log` could show:

```text
Declaration of OCA\NcPrint\Activity\Provider::parse(string $language, ...)
must be compatible with OCP\Activity\IProvider::parse($language, ...)
```

Fixed in **nc_print v1.32.1**: `lib/Activity/Provider.php` uses an untyped
`$language` parameter and throws `UnknownActivityException` for foreign events.
No further action if you are on v1.32.1 or later.
