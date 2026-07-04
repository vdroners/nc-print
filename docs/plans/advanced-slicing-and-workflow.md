# nc-print: advanced slicing (per-object, painting, wipe tower, update-trigger) + workflow hardening

## Why / scope

Four deferred features from the v1.27.0 review, plus a workflow review the user
asked for. Feasibility was re-verified **against the actual engine binary**, not
preset grep (an earlier agent got this wrong). Findings:

- The sidecar engine `/opt/orca/3dprintforge-slicer` is a full OrcaSlicer-lineage
  binary. `--help` exposes `--load-filament-ids "1,2,3,1"` (per-object extruder),
  `--load-assemble-list`, `--clone-objects`, `--skip-objects`, and it slices a
  project `.3mf`.
- The shipped `OrcaSliced.3mf` contains `Metadata/model_settings.config` with
  `<object id><metadata key= value=>` + `<part>` — OrcaSlicer's **per-object
  settings** mechanism. `3D/3dmodel.model` uses `p:` production-extension attrs
  (per-triangle `paint_supports` / `paint_seam` / `paint_color`).
- ⟹ Per-object settings and support/seam painting are **3MF-authoring problems,
  not engine blockers** — feasible. Wipe/prime-tower keys already exist in
  shipped presets. Update-trigger is a guarded Moonraker POST.

Because these are unrelated and two of them are large, ship as **four sequential
version bumps** (like the earlier ports), each independently
built→tested→deployed→gated→committed→pushed. The **workflow hardening ships
first (v1.28.0)** so later phases benefit from it.

## Phase 0 — v1.28.0: Workflow hardening (do this first)

From the workflow review. Low-risk, high-leverage; removes footguns we actually
hit (stale deployed files; opcache-stale routes needing a manual restart; manual
5-file version bumps).

Makefile:
- `make bump-patch` / `make bump-minor`: edit `appinfo/info.xml`, `package.json`,
  `package-lock.json` (both version fields), README badge; insert a dated
  `## [x.y.z] - <date>` stub at the top of CHANGELOG. (Date passed in, since the
  agent can't call `date` deterministically — accept `DATE=` arg, default to
  `$(shell date +%F)`.)
- `deploy`: before `docker cp`, remove the target subdirs in the container
  (`rm -rf $(REMOTE)/{appinfo,css,img,js,lib,templates,tools}`) so files deleted
  from source don't linger (we hit a stale `EventController.php`).
- `deploy`: after `occ upgrade`, flush PHP opcache
  (`occ … maintenance:repair --include-expensive` is heavy; instead
  `docker exec -u www-data $(CONTAINER) php -r 'function_exists("opcache_reset") && opcache_reset();'`
  and, since php-fpm workers each hold their own opcache, fall back to
  `docker kill -s USR2` / documented `docker restart` when a route/class was
  added). Simplest robust option: `docker restart $(CONTAINER)` guarded behind a
  `RESTART=1` flag, plus always attempt `opcache_reset`. Document the tradeoff.
- `make ship` = `build slicer-up deploy gate-preflight` in one target.

Gate (`tools/print-api-gates.php`): add smoke gates for the routes added since
G45 so regressions surface — G46 capabilities, G47 printers/discover, G48
eta/stats, G49 events/print-transition (route-registered check via
router:match-style or a 401/400 rather than 404), G50 power/webcam/update
allowlist prefixes present. Keep them tolerant (a 401/400/valid-JSON is PASS; a
404/500 is FAIL) so they assert *wiring*, not live hardware.

vitest: replace the hand-maintained `environmentMatchGlobs` happy-dom list with a
convention — default every `src/__tests__/**` to happy-dom (slightly slower but
eliminates the "forgot to add my spec" footgun), OR switch to
`test.environment: 'happy-dom'` globally and let node-only specs opt out. Verify
the full suite still passes under the chosen default.

CLAUDE.md: add a short `/media/4TB/nc-print/CLAUDE.md` (or extend the root one)
documenting the real workflow incl. the opcache-restart step and
deploy-removes-stale-files, so it's not tribal knowledge.

Tests: a Makefile/gate change is validated by running `make ship` end-to-end and
confirming the new gates pass; bump targets validated by a dry-run diff.

## Phase 1 — v1.29.0: Wipe / prime tower (smallest, engine-ready)

Multi-material purge tower. Keys already in shipped presets; multi-filament
plumbing (MultiToolFilamentPicker, filament_ids, `--load-filaments a;b;c`) exists.

- `overrides.py` `_MAP` (+ store + buildSliceOverrides + UI): `enable_prime_tower`
  (bool), `prime_tower_width` (num), `prime_tower_brim_width` (num),
  `wipe_tower_rotation_angle` (num), `wipe_tower_extra_spacing` (pct/num). Scope:
  process. Gate the UI section so it only shows when >1 filament is selected
  (a tower is meaningless single-material).
- UI: a "Prime tower" group in `ProfileQuickEdit` (or a small `WipeTowerPanel`),
  visible when `selection.filamentIds.length > 1`.
- Tests: adapter (keys map to engine keys; bool/num formatting); frontend
  (buildSliceOverrides includes them; UI shows only for multi-filament).
- Verify e2e: a 2-filament plate with `enable_prime_tower=1` slices and the gcode
  footer/config reflects the tower keys.

## Phase 2 — v1.30.0: Update-trigger (guarded Moonraker write)

Turn the read-only update banner into an actionable, heavily-guarded control.

- `MoonrakerProxyController`: allow POST to specific update paths only —
  `machine/update/klipper`, `machine/update/moonraker`, `machine/update/client`,
  `machine/update/system`, `machine/update/full`. Add an explicit method+path
  guard (POST allowed ONLY for these exact update subpaths; everything else stays
  read-only). Do NOT open a blanket `machine/update/` write.
- Safety rails (all required): **admin-only** (reuse an admin check, not just
  canUseApp — updates restart services); **idle-only** (refuse if a print is
  active — query state first); **explicit confirm** in the UI ("This restarts
  printer services. Continue?"); and a busy/disabled state while running.
- New `UpdateControlPanel` (admin-only render) beside the banner: per-component
  "Update" buttons + "Update all", driven off the status already fetched.
  Progress: subscribe to Moonraker's `notify_update_response` if the WS is
  connected, else just show "updating… (services will restart)".
- Tests: PHP (the update POST allowlist accepts the 5 update subpaths + rejects
  other `machine/update/*` and any non-update write; admin/idle guard present);
  frontend (button posts the right path; hidden for non-admin; blocked when
  printing; confirm dialog gates the call).

## Phase 3 — v1.31.0: Per-object slice settings

Different overrides per object on a multi-object plate, via OrcaSlicer's
`model_settings.config` (confirmed present in the engine's own 3MF).

- `mesh3mf.py`: extend `stls_to_multiobject_3mf` to also write
  `Metadata/model_settings.config` — `<config><object id="N"><metadata
  key=".." value=".."/></object>…</config>` — mapping per-object overrides to the
  same engine process keys as `overrides.py` (reuse the `_MAP` value keys so
  naming stays single-sourced; factor the key-mapping so both global and
  per-object paths share it). Content-Types/rels already handle Metadata parts.
- Adapter slice endpoint: accept an optional `object_overrides` array (index →
  {key:value}) alongside the models; thread it into the 3MF author. Global
  overrides still apply as the process baseline; per-object entries override per
  object.
- Frontend: `ArrangePlate` gains a per-object settings affordance — select an
  object in the plate list, edit a small subset of overrides (layer height, walls,
  infill %, infill pattern, supports on/off, extruder/filament index) that make
  sense per-object; store as `plateObjects[i].overrides`. Send with the slice.
- Tests: adapter (model_settings.config authored with the right per-object
  metadata; a per-object wall_loops differs from the global; malformed indices
  ignored) — and a REAL slice test inside the adapter harness (writable job dir)
  proving a 2-object plate with differing wall_loops produces gcode honoring both
  (the by-hand test crashed only on the read-only-rootfs log write; the adapter
  path has a writable JOB_ROOT). Frontend (per-object override state + payload).

## Phase 4 — v1.32.0: Support & seam painting

Paint regions on the mesh to force/block supports and set seam — encoded as
per-triangle 3MF attributes the engine reads (`paint_supports`, `paint_seam`).

- `ModelViewport` (Three.js): a paint mode with a brush — raycast the mesh, mark
  hit triangles into a per-triangle attribute buffer with a paint value
  (enforce-support / block-support / seam / clear). Overlay colored faces; brush
  size; undo/clear. This is the heaviest UI piece.
- 3MF encoding: `mesh3mf.py` writes the paint as OrcaSlicer per-triangle
  attributes on `<triangle>` elements in `3dmodel.model`
  (`paint_supports="..."`, `paint_seam="..."` — the compact run-length/bitset
  encoding OrcaSlicer uses; verify exact encoding by round-tripping a
  GUI-painted 3MF if one can be produced, else implement the documented format
  and confirm via a real slice showing supports appear/disappear in painted
  regions).
- Adapter: accept a paint payload (per-model triangle→value map, or a
  pre-encoded blob) and thread into the 3MF author.
- Tests: adapter (paint attrs written on the right triangles; empty paint =
  unchanged geometry) + a real slice showing a blocked region has no supports.
  Frontend (paint state capture; encode; clear/undo).
- **Contingency:** if the exact per-triangle encoding can't be confirmed to slice
  correctly (encoding is fiddly and version-specific), ship painting as
  "enforce/block support **volumes**" instead — add a box/region modifier part
  (`subtype="support_enforcer"/"support_blocker"`) in model_settings.config,
  which is a documented, simpler 3MF mechanism, and note the downgrade. Decide
  during implementation from the round-trip test.

## Out of scope
LED/neopixel control, curated macro runner (still deferred), variable-layer-height
painting, negative/modifier volumes beyond support enforcers/blockers, wipe-tower
position drag UI.

## Per-phase workflow
Use the new `make bump-minor` + `make ship` from Phase 0. Each phase: implement +
tests → `make ship` (build+slicer-up+deploy+gate) → verify e2e on the live K1
where relevant → commit (env -i, Claude trailer, no cursor) → push. Sidecar
rebuild happens automatically in `ship` when adapter files changed.

## Verification highlights
- Wipe tower: 2-filament slice reflects tower keys.
- Update-trigger: non-admin can't see it; blocked while printing; POST hits only
  the allowlisted update subpath; confirm dialog required.
- Per-object: 2-object plate, object A walls=1 / object B walls=5 → gcode honors
  both (adapter real-slice test).
- Painting: a blocked region yields no supports there (real slice); or the
  enforcer/blocker-volume fallback does.
- Every phase: full gate incl. the new G46–G50 smoke gates green.
