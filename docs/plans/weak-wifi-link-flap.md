# Weak-Wi-Fi link-flap banner

**Status:** in review (do not merge, do not `make ship` in the implementing session)
**Repo:** `vdroners/nc-print` · app id `nc_print`
**Base:** `main` (independent of open PR #11)
**Browser verify URL (after a later `make ship`):** `https://cloud-vdroners.ddns.net/apps/nc_print/`

## Goal

When Moonraker connectivity flaps — repeated brief Offline / reconnecting spells — show a non-blocking amber banner:

> Printer Wi‑Fi weak — status may flap

Operators should read Offline as the Wi-Fi hop (the lab K1 Max at `10.0.0.210` sits around −73 dBm / ~2 Mbps; the camera and stock UI can still answer while Moonraker drops), not as a dead printer.

## Why not PR #11

PR #11 (branch `cursor/moonraker-weak-wifi-1a49`) hardens Moonraker timeouts and adds last-seen / “Link lost”. This change branches from `main` and does not wait on that API. Flap detection uses the transitions the print store already applies: `printerState.connected` from `_applyPrinterState` (WebSocket and successful polls) and from the `refreshPrinterState` failure path. It pairs with #11; it does not require it.

## Detection

Pure tracker: `src/utils/link-flap.js`. The store keeps a plain snapshot on `linkFlap` and leaves the tracker instance off Pinia state.

| Rule | Value | Meaning |
|---|---|---|
| Brief drop | online → offline, recovered or still open for **≤ 30s** | Counts immediately so the banner can show on the Offline the operator is looking at |
| Outage | same drop still down **> 30s** | Retracted. A dead link is not a flap |
| Repeated | **≥ 2** brief drops inside **120s** | One blip stays quiet. Repeated `offline` samples while already down count as one drop |
| Auto-clear | **60s** continuously online | Flap log is dropped and the banner hides |
| Age out | drops older than 120s | Banner hides even if the printer never stays up for 60s |
| Printer change | `_resetPrinterState` | Tracker resets. Switching targets does not inherit history |

`lastSuccessAgeMs` is the age of the last connected sample. The detail line is `{n} brief drops · last status {age}`.

## Banner UX

`LinkFlapBanner.vue` mounts in `AppChromeBar` (all tabs). It is in normal document flow: `role="status"`, `aria-live="polite"`, no modal, no control disabling.

- **Dismiss** hides the current episode for this page session (not `localStorage`). Further drops in that same episode stay hidden.
- A **new episode** (the link left the flapping state — stable minute, aged-out window, or printer change — and then flaps again) shows the banner again.
- **Auto-clear** also hides it, with no dismiss required.

## Out of scope

- No RSSI probe, no Moonraker timeout changes, no PHP route.
- No `make ship` / container restart in the implementing session.
