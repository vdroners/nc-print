# NC Print UI — 4K density & continuity audit

**Date:** 2026-10-26 · App **1.65.0** (single implementation wave)

## Status

**Single wave / implementing → shipping as 1.65.0.** Waves A–D from the original
audit are merged into one release (Comfortable / Ultrawide density, content
budget media steps through 3200px, Print hero rail, Prepare/Slice token offsets,
Overview 2-col). Plan companion:
`~/.cursor/plans/nc_print_4k_density_f659f838.plan.md` (do not treat that file as
editable source of truth after ship — this audit tracks status).

## Verdict (pre-ship)

The biggest waste on a wide / 4K display was intentional: content hard-capped at
**1680px** and centered. Print then stretched sparse controls across that capped
column. 1.65.0 replaces the hard cap with `--nc-print-content-max` and an
operator density preference.

## Defaults (locked)

| Knob | Value |
|------|-------|
| Content budget | `1680` below 1920; `min(2400, 92vw)` ≥1920; `min(2880, 94vw)` ≥2560; `min(3200, 96vw)` ≥3200 |
| Density | **Comfortable** (force 1680) \| **Ultrawide** (media steps). Default **Ultrawide**. `localStorage` `nc_print_density` |
| Print ≥1600 | WorkspaceRail `1.4fr \| minmax(420px, 0.9fr)`; tuning/temp 2-col, ~720px cap |
| Out | Nextcloud chrome redesign, WebRTC/multi-cam, Spoolman, Alfred, third “Dense” mode |

## Continuity checklist (post-1.65)

| Flow | Status |
|------|--------|
| Prepare → Slice immersive | OK — side tokens shared |
| Slice → Print | Improved — wider content + camera hero rail |
| Print while printing | Improved — dense 2-col controls; Analyze stays collapsed |
| Overview ↔ workflow | OK — 2-col collapsibles ≥1600; no accordion reorder |
| Comfortable toggle | OK — chrome + Ctrl+K |

## Verify

- Browser / CDP at 1920 / 2560 + Comfortable toggle; 1200 reflow; Print live job.
- `npm run test` — spacing, immersive, density-pref, overview grid asserts.
- `make ship` after `make bump-minor`.
