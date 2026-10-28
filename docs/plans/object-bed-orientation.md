# Object bed orientation (1.71.0)

Status: implemented on `cursor/object-bed-orientation-268f`. Do not ship from
this branch. Do not merge until Sarge reviews. Browser check only after a later
ship on `https://cloud-vdroners.ddns.net/apps/nc_print/`.

## Problem

While a multi-object job is printing, Media & queue → Queue & objects lists
only the gcode-derived exclude names, for example
`REAR_CONE_V4_-_REAR_CONE_1_.STEP_A_ID_0_COPY_0`. Cancel object is a text
button on that row. There is no top-down view of the bed, so the operator
cannot tell which physical part the name refers to.

## Data

`QueuePanel` already queries Moonraker `printer/objects/query?exclude_object`.
Klipper's `exclude_object` objects carry `name`, optional `center` `[x, y]`,
and optional `polygon` `[[x, y], …]` when the slicer emitted
`EXCLUDE_OBJECT_DEFINE` with `POLYGON`. This app does not keep a second gcode
bounding-box table for the running job, so the bed uses that payload only.

- Polygon present: draw the footprint.
- Center only: draw a labeled marker on the configured bed.
- Neither: leave it off the plate and say so. The name list still cancels it.

Bed size is the print store's build volume (live scan, then the selected
profile's `printable_area`). K1 Max profiles are 300×300. If a part sits
outside that rectangle the view grows so it stays visible; the plate outline
stays the configured size. Machine origin is front-left, Y toward the back.
The SVG flips Y so the front of the bed is the bottom edge.

## Behavior

- The plate sits beside the existing object list (above it when the card is
  narrow).
- Each part gets a stable A/B/… badge on the plate and on the row. Long shared
  prefixes collapse, so the cone names above read A and B. The full name stays
  on the row and on the tooltip.
- Printing, waiting, and excluded use different fills. Excluded parts are
  hatched. Excluded wins over "printing" if both are set.
- Hover or click on the plate highlights the matching row, and the reverse.
  Click does not cancel.
- Cancel object is unchanged: the list button, confirm dialog, then
  `EXCLUDE_OBJECT`. The bed is read-only.
- While connected and a job or its objects are showing, the panel re-reads
  `exclude_object` every 3s so the printing part can move. It does not write
  to the printer except through the existing Cancel action.

## Files

| File | Change |
|------|--------|
| `src/utils/queue.js` | Parse polygon, center string, and name map |
| `src/utils/exclude-bed.js` | Short labels and top-down layout |
| `src/components/ExcludeObjectBed.vue` | Bed SVG |
| `src/components/QueuePanel.vue` | Plate next to the list, shared highlight |
| `src/__tests__/exclude-bed.spec.js` | Labels, Y-flip, states |
| `src/__tests__/queue.spec.js` | Polygon parse |
