# Upload / send-gcode retry UX on a weak Moonraker link

## Problem

G-code upload and "send to printer" cross a flaky Wi-Fi hop (K1 Max, often ~2 Mbps).
Timeouts and connection resets currently surface as a generic "Moonraker upload
failed" toast. The file the operator already picked is dropped, so they cannot
retry without choosing it again. Pause, resume, cancel, and emergency stop must
stay single-shot: a lost response may mean the printer already accepted the
command.

PR #11 may raise the upload curl timeout separately. This change does not depend
on that and does not change `DEFAULT_TIMEOUT_SECONDS`.

## Behavior

- One attempt per click. No automatic second POST for upload, send, start,
  pause, resume, cancel, or emergency stop.
- A failed upload or send keeps the payload and shows a banner with **Retry**.
  Retry repeats that same attempt (including whether start was requested).
- The banner distinguishes:
  - **timeout** — operation timed out after the connection was up (curl 28,
    HTTP 408/504, client timeout)
  - **unreachable** — connect failure, connection reset, empty reply, HTTP 502/503
  - **other** — the printer answered with a non-link error (HTTP status kept)
- When the failed attempt included "start print", the message tells the operator
  to check the printer before retrying so they do not start a second job.
- Raw curl text stays in the server log only. It is not returned to the browser.

## Touch points

- `lib/Service/MoonrakerTransferFailure.php` — pure classifier
- `PrinterController::upload` — classified 502 body (`failure`, `retryable`)
- `PrinterController` pause/cancel/emergency-stop bodies unchanged
- `src/utils/gcode-transfer-error.js` — same classes for client-side timeouts
- Print store `gcodeTransfer` + `retryLastGcodeTransfer`
- Print tab banner and Slice handoff banner

## Out of scope

- Raising the upload timeout (PR #11)
- `make ship` / deploy
- Auto-retry of any control-plane action
