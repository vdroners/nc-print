# Creality K1 Max profile import — inventory & recommendation

Source: `docs/3D Printing/profiles-backup/2026-07-07/` (packaged from Creality
Print 7.0, user 6218703138). Read-only inventory — nothing imported yet.

## TL;DR
- The user's real printer is a **Creality K1 Max (0.4 nozzle)**, enclosed, single
  extruder. The engine **already ships that machine profile** (bed 300×300×300;
  the live scanned bed 308×308×315 is now used after the v1.50.1 fix). **No
  machine import needed** — just make sure the imported filament/process presets
  are marked compatible with it.
- **BLOCKER for a naive copy:** every filament/process preset here is
  **delta-only** — it stores just the changes from a Creality base preset via
  `inherits`. **All 8 referenced base presets are MISSING** from the nc-print
  engine (it ships OrcaSlicer bases like `Generic ABS`, not Creality's
  `@Creality K1 Max 0.4 nozzle` bases). Copying the files as-is would produce
  presets that reference non-existent parents → broken/empty settings.
- **Recommended path:** *rebase* — for each preset, flatten the values we have and
  re-point `inherits` at an engine base that exists (closest `Generic <material>`
  + the shipped K1 Max machine), or inline the values. Ship the ones that map
  cleanly; report the rest.

## Filament presets (8 in `filament/`)
| file | material | vendor | nozzle°C | bed°C | inherits (parent) |
|---|---|---|---|---|---|
| ASA-GF @…K1 Max(1) | ASA-CF | Siraya Tech | 280 | 90 | Generic ASA @Creality K1 Max 0.4 |
| ASA @…K1 Max(1) | ASA | Polymaker | 280 | 90 | Generic ASA @Creality K1 Max 0.4 |
| CR-PA Carbon @…K1 Max | PA-CF | — | 270 | 60 | CR-PLA Carbon @Creality K1 Max 0.4 |
| Galaxy Polymaker Polylite ABS @**K1C** | ABS | Polymaker | 265 | 85 | Generic ABS @Creality **K1C** 0.4 |
| LW_PLA @…K1 Max - Copy(1) | LW_PLA | PolyMaker | 240 | — | Generic PLA @Creality K1 Max 0.4 |
| PETG @…K1 Max | PETG | Polymaker | 260 | 80 | Generic **ASA** @Creality K1 Max 0.4 (⚠ wrong parent) |
| PolyMaker PETG @…K1 Max | PETG | PolyMaker | — | — | Generic PETG @Creality K1 Max 0.4 |
| Polylite ASA @…K1 Max | ASA | Polymaker | 270 | 90 | Generic ASA @Creality K1 Max 0.4 |

Plus `default-filament/` (3): CR-PETG temp-up, CR-PLA-Mid Carbon (PolyM),
LW-PLA — also delta-only.

## Process presets (6 in `process/`)
All inherit `0.20mm Standard @Creality K1 Max 0.4 nozzle` (or the **K1C** variant
for the ABS one) — a base that is **missing** from the engine.
- 0.20mm Standard … - ASA / - LW_PLA / - PA12_CF / - PA6_CF / - PETG CF
- ABS Polymaker 0.20mm @Creality **K1C** 0.4 SPEED  (⚠ K1C, not K1 Max)

## Referenced base presets vs engine (all MISSING)
```
MISS 0.20mm Standard @Creality K1 Max 0.4 nozzle     (process base)
MISS 0.20mm Standard @Creality K1C 0.4 nozzle        (process base, K1C)
MISS CR-PETG @Creality K1 Max 0.4 nozzle             (filament base)
MISS CR-PLA Carbon @Creality K1 Max 0.4 nozzle       (filament base)
MISS Generic ABS @Creality K1C 0.4 nozzle            (filament base, K1C)
MISS Generic ASA @Creality K1 Max 0.4 nozzle         (filament base)
MISS Generic PETG @Creality K1 Max 0.4 nozzle        (filament base)
MISS Generic PLA @Creality K1 Max 0.4 nozzle         (filament base)
```
Engine DOES have: `Creality K1 Max (0.4 nozzle)` machine ✅, and bare
`Generic ABS/PLA/PETG/ASA` filament bases (no `@Creality` suffix). It has **zero**
K1 Max *process* bases.

## Import risks
1. **Delta-only + missing parents (main issue).** Must rebase/flatten, not copy.
2. **K1C mix-ins.** 2 files (Galaxy ABS filament, ABS SPEED process) target the
   smaller **K1C**, not the K1 Max — either retarget to K1 Max or skip.
3. **Wrong parent.** `PETG @…K1 Max` inherits a *Generic ASA* base (likely a
   Creality-Print copy artifact) — its non-overridden values would be ASA's. Use
   the PETG values it does set + a PETG/Generic base.
4. **Duplicates.** `(1)` / `- Copy(1)` suffixes from the generator's de-dup.
5. **CF/GF abrasives** (ASA-GF, PA-CF, PA6/PA12-CF) imply a hardened nozzle —
   worth a hardened-nozzle machine note, but not required to slice.

## Recommendation (Phase 3)
- **Filaments:** import the ones with real values (ASA, ASA-GF, PETG, PA-CF,
  Polylite ASA, LW-PLA, CR-PETG) as **flattened** presets inheriting the engine's
  bare `Generic <material>` base, `compatible_printers = ["Creality K1 Max (0.4
  nozzle)"]`. Skip/flag the K1C ABS and value-less duplicates.
- **Process:** the deltas are meaningful (speeds/accel), but their K1 Max base is
  missing. Rebase onto the engine's default K1 Max process (confirm one exists at
  import time; if none, inherit the closest generic 0.2mm and inline the deltas).
- **Machine:** none needed; optionally add a `… hardened nozzle` alias for the CF
  materials.
- Write results to `/data/3DPrintForgeSlicer/user/{filament,process}/` (writable
  volume), idempotently, and **report per-file** applied/skipped so nothing fails
  silently. Verify each appears via `fetchProfiles` and a test slice on 10.0.0.210.

**Awaiting sign-off before Phase 3 writes anything.**
