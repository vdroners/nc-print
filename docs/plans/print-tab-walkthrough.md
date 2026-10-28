# Print tab walkthrough fixes (1.69.0)

Status: implemented on `cursor/print-tab-walkthrough-af66`. Do not ship from this
branch. Browser check only after a later ship on
`https://cloud-vdroners.ddns.net/apps/nc_print/`.

## Problem

A read-only pass of cloud NC Print 1.68.0 while a job was printing showed a
fake time overrun, a broken gcode thumbnail, a noisy timelapse 400, and several
Print-tab layout and wording issues (B1–B11).

Moonraker `print_stats.total_duration` is elapsed wall clock, not a slicer
estimate. The UI subtracted `print_duration` from it and also treated a missing
session slicer time as zero, so the card read "Estimated 0 min · Actual ~3 min
(+3 min)" and "~0 min remaining" at 0.3% while the filename carried `10h12m12s`.

## Behavior

- Never render a "+overrun" when the estimate is zero or missing. Say
  "Estimate unavailable", or use Moonraker file `estimated_time`, then the
  matching slicer result, then a duration token in the gcode filename.
- Remaining time uses that estimate minus elapsed print time. It is omitted
  when no estimate exists.
- A thumbnail that 412s (or otherwise fails to decode) becomes a quiet empty
  frame. No broken-image glyph.
- `server/files/list?root=timelapse` 400/404 is an empty list. The request is
  accepted so the client does not log it as a failed call.
- Progress source says "Updating live" while connected. The word "Polling" is
  gone.
- Printing status stays on the header chip and the sticky job line (filename,
  percent, Pause/Resume/Cancel). The connection line drops a healthy
  "· printing", the control card drops its status badge, and the workflow step
  drops "Printing N%" so Link lost / last-seen can stand out.
- Sticky filename keeps a native `title` and can shrink so the ellipsis is the
  hover target. The monitor column clips horizontal overflow.
- "Change printer" replaces "Change in Overview", at a larger size and primary
  text color.
- Operate cards stretch to the same height at ≥1600. The temperature plot is
  taller and Nozzle/Bed labels use primary text.
- Fan percent sits beside the slider.
- Workflow step text and the app footer use a text color one step above muted.

## Files

| File | Change |
|------|--------|
| `src/utils/print-estimate.js` | Estimate resolution and honest labels |
| `src/store/print.js` | Remaining + estimate getters; metadata fetch |
| `src/components/PrintTab.vue` | Labels, badge removal, card stretch |
| `src/components/PrintStatusBar.vue` | Filename tooltip + shrink |
| `src/components/PrintWorkflowBanner.vue` | Hide an empty step subtitle |
| `src/utils/print-honesty.js` | No "Printing N%" on the stepper |
| `src/components/GcodeThumbnail.vue` | Placeholder on image error |
| `src/components/TimelapsePanel.vue` | Missing root is empty |
| `src/services/moonraker-api.js` | Optional accepted error statuses |
| `src/utils/timelapse.js` | 400/404 helper |
| `src/components/PrinterConnectionStatus.vue` | Clearer change-printer link |
| `src/components/InPrintTuningPanel.vue` | Fan percent beside the slider |
| `src/components/TemperatureControl.vue` | Taller plot, stronger labels |
| `src/components/TemperatureSparkline.vue` | Taller default canvas |
| `src/components/WorkspaceRail.vue` | No horizontal scroll in the monitor |
| `css/style.scss` | Stepper text one step up |
| `css/nc-print-theme.css` | Raised text token + footer |
