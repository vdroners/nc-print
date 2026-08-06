# First-print UX program — Forge 1.1.25 + NC Print operator waves (2026-08)

Two products share the lab printer path: Forge Studio (`:3040`, fleet UI) and
NC Print (Nextcloud prepare → slice → print). This plan covers the Forge
v1.1.25 upgrade and four NC Print UX waves aimed at getting an operator from
"import STL" to "printing" with less friction.

## Part 0 — Forge Studio v1.1.25 (done first)

- Backed up `config.json` / `data` / `.env` / compose to
  `backups/forge-pre-1.1.25-20260806.tar.gz`; lab Moonraker/K1 patches saved as
  `backups/lab-moonraker-20260806.patch`.
- `src/` moved from `83c165d` (1.1.24 + dirty tree) to branch `lab-1.1.25` on
  tag `v1.1.25`; the four lab patches (moonraker-client, api-routes,
  controls-panel, printer-file-browser) re-applied cleanly via stash pop.
- Rebuilt `3dprintforge:local`, verified: container healthy, login 200,
  `k1-max` online, `/shop` 200. CRM margin endpoints return 403
  "Active e-commerce license required" — expected license gating.
- Upstream removed the Forge REST slicer integration in 1.1.25 (commit
  `0b3ceed5`); Slicer Studio is native-only now. Host `forge-slicer.service`
  (`:8766`) remains only for the deprecated NC Print relay. NC Print's owned
  `nc-print-slicer` sidecar is unaffected.
- Pins recorded in `/media/4TB/3dprintforge/docs/VERSIONS.md`.

## Part 1 — NC Print waves

### Wave A — gates + language

- `isPrepareComplete` / `firstPrepareBlocker` / checklist progress no longer
  require a Moonraker target printer: slicing is local, the target is only
  needed to send/start. The "Send-to printer" checklist rows become advisory.
- Rename the dual "printer" concepts everywhere they collide:
  "Slicer printer profile (how it slices)" vs "Send-to printer (Moonraker)".
- After a successful "Slice now" on Prepare, auto-navigate to the Slice tab.

### Wave B — cold-start

- `TargetPrinterPicker` gets a real empty state when no printer is configured:
  Scan / Connect by IP / "ask an admin" CTAs instead of an empty dropdown.
- First-print setup card on Prepare when the slicer is offline or no profiles
  are loaded, with retry + Admin pointers.
- Expose `discovery_subnet` in the Admin settings form (backend already
  persists it via `AdminController::saveSettings`).
- Tighten the Print-tab gate: reachable = connected OR a target is actually
  selected/configured — not merely `moonraker_enabled`.

### Wave C — send polish

- PrePrintModal: two actions — "Upload only" (allowed while the printer is
  offline-tolerant) and "Slice, send & start" (hard-blocked until the printer
  is reachable). The resolve carries the chosen mode.
- Slice auto-applies a dirty viewport transform (with toast) instead of
  blocking on "Apply viewport transform before slicing".
- Admin "G-code console" checkbox is occ-only — render it disabled with an
  explanatory note instead of a silently non-saving control.

### Wave D — operator model manipulation

1. One-click "Ready to print" (auto-orient → center XY → drop to bed) with an
   undo snapshot and a summary toast.
2. Arrow-key nudge while Move is active: 1 mm (Shift = 10 mm, Alt = 0.1 mm) on
   X/Y, PageUp/PageDown for Z; ignored while typing in inputs.
3. Snap preset chips in Move/Rotate panels (0.1/1/5/10 mm; 1/5/15/45°).
4. Ctrl+D duplicates the selected object (undo captured).
5. Bed exclusion zones v1: rectangles defined in a Prepare panel, rendered on
   the bed, intersecting objects flagged, Slice warns. Viewport + pre-slice
   gate only — no engine support needed.
6. Travel / seam preview toggles on the Slice toolpath legend surfaced as
   first-class controls.

## Verify

- Forge: G2 auth + health, k1-max online, `/shop` 200 (done above).
- NC Print: `prepareComplete` true without a target; send/start still gated;
  Admin subnet persists and Scan uses it; Ready-to-print undoes cleanly; arrow
  nudge moves the mesh; exclusion zone warns on slice; travel toggle hides
  travel moves; `make ship RESTART=1` gates green; version bumped to 1.61.0
  with CHANGELOG entries on both sides.
