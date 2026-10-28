# GUI hunt round 3 (1.72.0)

Status: implemented on `cursor/gui-hunt-round3-ui-polish-d48d`. Do not ship.
Do not merge. Merge after #18 (1.71.0) or rebase onto main after #18 lands.
Do not contact the live printer from this branch.

## Problem

Live 1.70.0 on a running job:

1. First paint says Printer offline / Cannot reach Moonraker, with an empty
   Operate column and a disabled E-STOP, then corrects itself when Moonraker
   answers.
2. Job queue header says PAUSED while the queue is empty and a job is printing.
3. Open “Queue & objects” (and the other Print-tab panel headers that share
   PrintPanel) turn into a pale-green half-width bar with faint text.
4. The object “printing” badge disappears when the uppercase name truncates.
5. “Start print after upload” is on during an active print.
6. Print Guard progress (~15%) does not match the Print tab (~33%).
7. History status pills are dark-on-dark and show raw Moonraker strings
   (`in_progress`, `klippy_shutdown`).

## Behavior

- Before the first successful Moonraker sample, and after a single missed
  probe with no sample, the chip and connection line say Checking… and the
  Print tab uses an info banner. The red Offline banner waits for a second
  miss. A previous good sample still uses the 1.68 Link lost / last-seen
  card. That snapshot is kept in sessionStorage per printer (30 minutes) so
  a reload during a job can show the last known print while checking.
  E-STOP stays clickable during Checking (it still confirms). Confirmed
  offline and link-lost keep it disabled.
- The job-queue label says “(paused)” only when Moonraker’s queue is paused
  and it actually holds jobs. An empty queue is “Job queue”.
- Print-tab panel headers keep a transparent background and theme text on
  hover, focus, active, and open — the same treatment as NcPrintCollapsible
  in 1.70.0. The header stretches with the row.
- Object rows ellipsize the name and keep the printing badge and Cancel
  button. Cancel’s title and aria-label include a short object name.
- “Start print after upload” turns off and disables while the machine is
  printing or paused, and while a checking reload still has an active
  last-seen job. Uploads in that state do not pass start.
- Print Guard’s displayed progress and state follow the live printer poll
  (virtual_sdcard, same as the Print tab) whenever that poll is connected.
  The guard snapshot itself now prefers virtual_sdcard over display_status,
  and the guard query asks for virtual_sdcard.
- History rows use human labels and theme-token badge colors (readable on
  the dark surface).
- Overview Cameras no longer says the Print tab is showing a stream. It
  says Print stays on No stream until a frame loads.

## Files

| File | Change |
|---|---|
| `src/utils/printer-contact.js` | Checking vs offline, E-STOP gate, last-contact session snapshot |
| `src/store/print.js` | Initial checking state, soften one miss, persist last contact |
| `src/utils/print-honesty.js` | Checking subtitle; block auto-start during an active job |
| `src/components/PrintTab.vue` | Checking banner; auto-start off while a job is active |
| `src/components/EmergencyStopButton.vue` | Enabled while checking |
| `src/components/PrintPanel.vue` | Open/focus header contrast |
| `src/utils/queue.js` / `QueuePanel.vue` | Queue label, badge/Cancel layout, cancel aria |
| `src/components/PrintGuardPanel.vue` | Live progress |
| `lib/Service/PrintGuardService.php` | virtual_sdcard progress |
| `lib/Controller/PrintGuardController.php` | Query virtual_sdcard |
| `src/utils/history.js` / `HistoryPanel.vue` | Labels and contrast |
| `src/components/WebcamListPanel.vue` | Do not claim a Print stream |
| `css/style.scss` | Checking chip |
