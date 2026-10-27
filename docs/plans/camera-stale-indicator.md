# Camera stale / freeze indicator

Status: implemented on `cursor/camera-stale-indicator-84bf`. Independent of PR #11
(weak-Wi-Fi timeouts + last-seen). `main` has no camera last-seen hook, so this
stays inside the snapshot poller.

## Problem

`useCameraFrame` cache-busts the proxied snapshot (`?action=snapshot` via
`/api/camera/frame.jpeg`) about every 2s by assigning a new `<img>` src. When
Wi-Fi or Moonraker hangs that request, the browser keeps the previous JPEG and
does not fire `@error`. The Print camera (and the pre-print preview) still look
live. A fast failure today replaces the picture with "No stream", which is
honest only when nothing has ever painted.

## Behavior

- Probe each tick with a detached `Image`. Abort the previous probe so hung
  requests do not stack on the printer host.
- Point the visible image at a URL only after that probe decodes
  (`naturalWidth` / `naturalHeight` > 0).
- Remember `cameraLastFrameAt`. A 1s tick marks the frame stale when its age
  reaches three poll intervals or 8s, whichever is longer.
- While stale, keep the last frame and show **Camera stale** plus the age
  (`8s`, `1m 30s`) on the Print panel, fullscreen, and pre-print preview.
- A red inset on the panel repeats the warning. Expand still works; fullscreen
  carries the same badge.
- No decoded frame yet: unchanged "No stream" / camera error. Do not call that
  stale.
- Do not compare pixels. A still bed is live when snapshots keep arriving.
  A byte-identical JPEG that still returns HTTP 200 on schedule is out of scope.

## Files

| File | Change |
|------|--------|
| `src/composables/useCameraFrame.js` | Probe, last-frame clock, stale computed label |
| `src/components/CameraStaleBadge.vue` | Shared label |
| `src/components/PrintTab.vue` | Badge on the monitor camera and fullscreen |
| `src/components/PrePrintModal.vue` | Badge on the bed preview |
| `css/style.scss` | Badge + stale frame outline |
| `src/__tests__/camera-stale.spec.js` | Helpers, mixin, template wiring |

## Verify

- `npx vitest run src/__tests__/camera-stale.spec.js src/__tests__/print-honesty.spec.js src/__tests__/print-monitor.spec.js`
- Do not `make ship` in this change. After a later ship, browser-check only on
  `https://cloud-vdroners.ddns.net/apps/nc_print/`.
