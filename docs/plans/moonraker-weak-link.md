# Moonraker weak-link timeouts and last-seen Offline

Lab K1 Max (`10.0.0.210`) on a far Wi-Fi hop: Moonraker `:7125` flaps
while `:80` and the camera still answer. One recovering `/printer/info`
took ~3.1s. `moonraker_internal_url` is already correct.

## What changed

- Named budgets in `lib/Service/MoonrakerHttp.php`.
- Short probes (health, print guard, webcam list) raised above the
  measured 3s recovery, with one retry on transient connect failure.
- State / proxy GET connect raised; their 60s total was already long
  enough and stays. Uploads go to 180s. Pause, cancel, ESTOP, gcode,
  and print start do not retry.
- Discovery per-host probe raised (parallel scan wall-clock ~8s).
- Print UI keeps the last good snapshot and shows Link lost + last-seen
  age. Estimated progress only when a printing job already had a
  reliable rate; otherwise last known percent. Live again on the next
  good answer.

## Not in this change

- Camera stale/freeze indicator.
- A flap-count banner (last-seen age is the hook).
- Upload/send retry UX. Uploads are not auto-retried.
- Footer rename: `App.vue` already says `nc-print-slicer` (1.64.0).

Do not `make ship` from the agent session. Sarge reviews before merge.
Browser check only after a later ship, on
`https://cloud-vdroners.ddns.net/apps/nc_print/`.
