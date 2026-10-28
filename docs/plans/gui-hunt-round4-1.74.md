# GUI hunt round 4 leftovers (1.74.0)

Status: implemented on `cursor/gui-hunt-round4-leftovers-eeae`. Do not ship.
Do not merge. Do not contact the live printer from this branch.

## Problem

Live 1.73.0 during an active job (shots in the round-4 hunt):

1. Print → Temperature “Nozzle (5 min)” / “Bed (5 min)” stay empty while the
   live readouts show 278° / 65° and the job says Updating live. A small
   orange tick is the only mark.
2. Ctrl+K shows a horizontal scrollbar and a vertical one. The last visible
   row (Cancel print) is cut off. Hints such as Toggle density are clipped.
3. Queue & objects rows read `REAR_CONE…` / `R…`, so parts A and B cannot be
   told apart. The bed already labels them A/B (1.71.0). The printing badge
   and Cancel object must stay visible.

## Behavior

- The 5-minute charts poll Moonraker `server/temperature_store` (already
  allowlisted) and plot the last five minutes. A steady heater is a line
  across the plot, centered, not a tick on the bottom edge. If that read
  fails, the current nozzle and bed temperatures are sampled on the same
  timer even when the number does not change. The canvas waits until it has
  a real width, then redraws on resize, so a hidden panel does not stretch
  a 0-width bitmap into a tick.
- The command palette wraps titles and hints inside the dialog, hides
  horizontal overflow, and scrolls only the list on the vertical axis when
  the list is taller than the dialog. The search row and footer stay put,
  so the last row can scroll fully into view.
- Each object row shows the same short label as the bed (A, B, lid). The
  full gcode name is the tooltip. The printing badge and Cancel object stay
  on the row.

## Files

| File | Change |
|---|---|
| `src/utils/temperature.js` | Store tail → samples, steady append, sparkline geometry |
| `src/components/TemperatureControl.vue` | Poll temperature_store into the 5-minute charts |
| `src/components/TemperatureSparkline.vue` | Centered line, resize redraw |
| `src/components/CommandPalette.vue` | No horizontal scroll; vertical list scroll |
| `src/utils/exclude-bed.js` / `QueuePanel.vue` | Row label is the short A/B name |
