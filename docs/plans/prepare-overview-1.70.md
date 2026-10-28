# Prepare / Overview pass (1.70.0)

Status: implemented on `cursor/prepare-overview-polish-8f03`. Do not ship from
this branch. Do not merge until Sarge reviews. Browser check only after a later
ship on `https://cloud-vdroners.ddns.net/apps/nc_print/`.

## Problem

A live pass of cloud NC Print 1.69.0 (`986dca2`) on Prepare, Overview, and a
running Print job showed unreadable library names, a silent jump into Overview,
a Print step that looks finished while a job is running, and several controls
that read as ready when they are not. A second pass found the camera Expand
Close under the Nextcloud header, a blank Cameras section, a mid-print time
line that looks like an early finish, and temperature fields that show PLA
defaults during a hotter job.

## Behavior

- Parts Library rows set theme foreground text so filenames stay readable on
  dark rows. Nextcloud’s button color no longer wins.
- Library and Model Forge still deep-link to those Overview sections. Arriving
  that way shows **Back to Prepare**. The Overview chrome button does not.
- The Print step shows a check only when the job is complete. Printing or
  paused is in progress (step number, accent ring), not done.
- “Send-to printer online” stays a green check only when the target is
  connected and idle. Printing or paused is an advisory warning. It does not
  block slicing.
- Empty Prepare keeps one primary Import in the left panel. The bed says
  “Choose a file” and uses the same picker. Open recent shows “No recent
  projects yet” when the list is empty.
- The Ctrl+K selected row uses a dark tint and theme text, including when the
  first command is disabled.
- Camera Expand starts below the Nextcloud header (`--header-height`, 50px)
  and uses a z-index above the header and contacts menu. Close is in that
  lower band. Escape still closes it.
- Overview Cameras explains an empty or single-camera list. Print still hides
  the card unless Moonraker reports more than one camera. Collapsible headers
  keep a transparent dark-theme background when focused or open.
- While a job is printing, the time line is “Estimated … · Elapsed …” with no
  delta. After complete, the completion card shows Actual and the signed
  delta. Filename, metadata, and slicer estimate resolution from 1.69.0 is
  unchanged.
- Nozzle and bed target inputs follow the live Moonraker targets until the
  operator types. They start blank. Placeholders are not 210/60. At wide
  widths the “Live readouts” label spans the grid so Nozzle and Bed sit on
  one row.
- Density button text is Ultrawide or Comfortable. The import control says
  Parts Library. The library footer does not show the host filesystem path.

## Files

| File | Change |
|------|--------|
| `src/components/PartsLibraryPanel.vue` | Row text color; drop host path |
| `src/utils/overview-nav.js` | `fromPrepare` return token |
| `src/components/OverviewTab.vue` | Back to Prepare; Cameras empty host |
| `src/components/PrepareTab.vue` | fromPrepare; Parts Library label |
| `src/utils/commands.js` | Palette deep-links set fromPrepare |
| `src/components/PrintWorkflowBanner.vue` | Check only when complete |
| `src/utils/print-honesty.js` | `printWorkflowMark` |
| `css/style.scss` | In-progress step ring |
| `src/store/print.js` | Busy send-to advisory |
| `src/components/ModelViewport.vue` | Secondary Choose a file |
| `src/components/ReopenMenu.vue` | Visible empty reason |
| `src/components/CommandPalette.vue` | Selected-row contrast |
| `src/components/AppChromeBar.vue` | Density label matches aria |
| `src/components/PrintTab.vue` | Camera dialog offset + z-index; Elapsed line |
| `src/components/WebcamListPanel.vue` | Empty state |
| `src/components/NcPrintCollapsible.vue` | Header not pale-green on focus |
| `src/utils/print-estimate.js` | Elapsed vs complete delta |
| `src/components/PrintCompletionBanner.vue` | Delta after complete |
| `src/utils/temperature.js` | `followLiveTarget` |
| `src/components/TemperatureControl.vue` | Live targets; readout grid |
