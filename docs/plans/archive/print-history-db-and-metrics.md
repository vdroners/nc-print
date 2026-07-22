# nc-print: print-history DB + quality metrics + wear prediction (v1.37.0)

## Context

nc-print currently keeps **no durable print history**. The only persisted
completion data is `EtaLearningService`'s per-printer moving multiplier, stored
as a single app-config JSON blob (deliberately DB-free — see its class docblock:
"storage is a single app-config JSON blob … this keeps the app self-contained
with no schema/migration"). `PrintEventController::notifyTransition()` already
receives every `printing→complete` / `printing→error` / `started` edge from the
frontend (with `filename`, `printer`, `duration_s`) but only republishes it to
the Nextcloud notification bell + Activity stream — nothing is stored.

The user asked to **build a proper print-history DB** and layer quality metrics
and consumable-wear prediction on top. This introduces the app's **first
database table + Db/migration layer** — a deliberate departure from the current
no-schema stance, chosen (confirmed with the user) because history is unbounded
over time and the metrics/wear queries want real SQL aggregation rather than a
capped in-memory ring.

This is a large, stateful, multi-file feature → **Plan First** per CLAUDE.md.
Ship as **v1.37.0** (minor). Because it adds new PHP classes + a migration +
new routes, deploy with `make ship RESTART=1` (php-fpm opcache).

## Goals

1. **Durable history**: every terminated print (complete/error/cancel) is
   recorded to a real DB table, one row per print, per user, per printer.
2. **Quality metrics**: aggregate the history into per-printer/per-material
   figures — success rate, avg/median duration, slicer-vs-actual accuracy,
   estimated filament consumed, failure reasons.
3. **Wear prediction**: derive cumulative consumable usage (print hours, filament
   grams, and a nozzle-wear proxy for abrasive materials) and surface simple
   "time to service" hints. Ported in spirit from 3dprintforge's wear tracker,
   but computed over our own DB rows.
4. Do it without regressing the existing notification/activity path or the
   self-contained-app guarantees (must still install on sqlite/mysql/pgsql).

## Non-goals (deferred)

- Per-layer / per-object metrics (we store one row per print, not per feature).
- Cross-user aggregation / a shared org-wide history (rows are per-UID).
- Editable/annotatable history from the UI beyond delete (v1.38+ if wanted).
- Automatic filament-gram measurement from hardware — we use the slicer's
  estimate captured at slice time (see "Data capture" below).

## Architecture

### 1. Schema + migration (NEW `lib/Db/` + `lib/Migration/`)

Table `oc_ncprint_prints` (Nextcloud prefixes `oc_` automatically; declared name
`ncprint_prints`). One row per terminated print.

| column | type | notes |
|---|---|---|
| `id` | bigint, autoincrement, PK | |
| `uid` | string(64), indexed | owning user |
| `printer_id` | string(128), indexed | Moonraker/session printer id |
| `printer_name` | string(255) | human label at capture time |
| `filename` | string(512) | print job / gcode name |
| `material` | string(64) | e.g. PLA / PETG / PA-CF (from slice ctx) |
| `nozzle_diameter` | float | for bucketing + wear |
| `result` | string(16), indexed | `complete` / `error` / `cancel` |
| `failure_reason` | string(255), nullable | best-effort from monitor |
| `started_at` | bigint | unix seconds |
| `ended_at` | bigint, indexed | unix seconds |
| `duration_s` | integer | actual, from monitor |
| `slicer_duration_s` | integer, nullable | estimate captured at slice |
| `filament_g` | float, nullable | slicer estimate |
| `filament_mm` | float, nullable | slicer estimate |
| `layer_height` | float, nullable | for context |
| `created_at` | bigint | row insert time |

Migration: `lib/Migration/Version001Date20260710XXXXXX.php` implementing
`ISchemaMigration` (`changeSchema`), creating the table + indexes idempotently
(`hasTable` guard). This is the standard NC pattern; it runs on `occ upgrade`
(which `make deploy` already invokes).

`lib/Db/PrintRecord.php` — `Entity` with typed properties + `addType()` for the
int/float columns.
`lib/Db/PrintRecordMapper.php` — `QBMapper`:
- `insertRecord(PrintRecord): PrintRecord`
- `findByUser(uid, limit, offset, filters): PrintRecord[]` (filter by printer/
  material/result/date-range)
- `findById(id, uid)` (ownership-scoped)
- `deleteById(id, uid)` and `deleteAllForUser(uid)` (used by uninstall cleanup)
- aggregation helpers returning arrays (see metrics below) using
  `$qb->func()` (COUNT/AVG/SUM/MAX) with `GROUP BY` — pushed to SQL, not PHP.

Mappers are auto-wired by NC's DI; no explicit registration needed in
`Application::register()`. **Do** extend `UninstallCleanupListener` to drop the
table's user rows on app uninstall (it already exists for config cleanup).

### 2. Capture path (EDIT `PrintEventController` + store + a slice-ctx stash)

The hook already exists. Two gaps to close so a row has enough data:

- **Actual duration + result** already arrive in `notifyTransition` (`duration_s`,
  `transition`). Extend the accepted params to also take `printer_id`,
  `material`, `nozzle_diameter`, `started_at`, `slicer_duration_s`,
  `filament_g`, `filament_mm`, `layer_height`, `failure_reason` (all optional).
  The frontend store already knows most of these from the active slice/print
  context — thread them through the existing `notifyTransition` POST payload.
- On a **terminal** transition (`complete`/`error`; plus a new `cancel`), call a
  new `PrintHistoryService::record(...)` **after** the existing notification/
  activity publish, wrapped in its own try/catch so a DB failure never breaks
  the UI (same best-effort contract the publish path already uses).
- `started` transitions do **not** insert a row (no terminal state yet); they may
  optionally stash `started_at` client-side so the terminal event can compute it.
  Simplest: frontend sends `started_at` on the terminal event. No server session
  state needed.

Reuse `EtaLearningService.recordCompletion()` from the same terminal branch (it
already wants actual-vs-slicer minutes) so ETA learning and history share one
capture point. This also means the slicer estimate is available in the same
payload.

### 3. `lib/Service/PrintHistoryService.php` (NEW)

- `record(uid, array $ctx): ?PrintRecord` — validates/normalizes the payload,
  clamps numeric ranges, maps to a `PrintRecord`, inserts. Returns null on
  invalid input (logged at debug, never throws to the caller).
- `list(uid, filters): array` — paginated history for the UI.
- `metrics(uid, filters): array` — the quality-metrics aggregate (below).
- `wear(uid): array` — the wear/consumable aggregate (below).
- `delete(uid, id)` / `clear(uid)`.

**Quality metrics** (SQL-aggregated, grouped by printer then material):
- `total`, `completed`, `failed`, `cancelled`, `success_rate`.
- `avg_duration_s`, `median_duration_s` (median computed in PHP from a capped
  per-bucket duration pull — DBs disagree on percentile SQL; keep it portable).
- `eta_accuracy`: mean and stdev of `duration_s / slicer_duration_s` over rows
  with both present (mirrors EtaLearning's ratio band; drop ratios outside
  0.3–3.0 as tracking noise).
- `total_filament_g`, `total_print_hours`.
- `top_failure_reasons`: COUNT grouped by `failure_reason` where `result=error`.

**Wear / consumable prediction** (ported concept from 3dprintforge wear tracker):
- Cumulative `print_hours` and `filament_g` per printer (SUM).
- `abrasive_filament_g`: SUM of `filament_g` where `material` matches a small
  abrasive set (CF/GF/glow/wood — configurable const list). Drives a nozzle-wear
  hint: brass nozzles are rated ~ hundreds of grams of abrasive; expose a
  simple `nozzle_wear_pct` = min(100, abrasive_g / THRESHOLD_G * 100) with the
  threshold an admin-config value (default e.g. 250 g, clearly documented as a
  rough heuristic, NOT a hardware guarantee).
- `service_hints`: derived strings ("PTFE-lined hotend: consider inspection
  after N print-hours"), each gated on a documented heuristic threshold. These
  are advisory; the UI must label them as estimates.

All thresholds live as named consts / admin-config with docblocks explaining
they're heuristics — per 19labs guideline #4 (human-maintainable, no magic).

### 4. Routes + controller (EDIT `appinfo/routes.php`, NEW `HistoryController`)

`lib/Controller/HistoryController.php` (`#[NoAdminRequired]`, `AccessService`
gate like the other controllers):
- `GET  api/history` → `list` (query: printer, material, result, from, to,
  limit, offset).
- `GET  api/history/metrics` → `metrics`.
- `GET  api/history/wear` → `wear`.
- `DELETE api/history/{id}` → `delete` (ownership-scoped).
- `DELETE api/history` → `clear`.

All ownership-scoped by `uid` from the session; IDOR-safe (mapper queries filter
by uid, matching the Wave-3 IDOR posture in the sibling nc_gcs app).

### 5. Frontend (NEW `src/services/history-api.js`, store slice, a History panel)

- `src/services/history-api.js` — axios calls with the same `{ timeout: 8000 }`
  convention added in v1.35.0.
- Store: a `history` module slice (or additions to `store/print.js`) with
  `historyList`, `historyMetrics`, `historyWear`, loading flags, and actions
  `fetchHistory/fetchMetrics/fetchWear/deleteHistory/clearHistory`.
- `src/components/HistoryPanel.vue` — a new tab/section under Monitor (or a new
  top-level "History" tab; decide during impl based on tab real estate):
  - a filterable, paginated table of past prints;
  - a metrics summary card (success rate, ETA accuracy, totals);
  - a wear card with the nozzle-wear bar + service hints, each labeled
    "estimate / heuristic".
- Thread the capture payload: extend the existing `notifyTransition` POST in the
  store's `_maybeNotifyPrintTransition` to include `printer_id`, `material`,
  `nozzle_diameter`, `started_at`, `slicer_duration_s`, `filament_g`,
  `filament_mm`, `layer_height`. These come from the active slice result +
  session printer already held in the store.

## Testing (store/service + adapter conventions; NO component-mount suites)

- **phpunit** (in-container, `make run-phpunit`):
  - `PrintHistoryServiceTest`: record → list round-trip; invalid payload returns
    null (no throw); metrics aggregation on a seeded set (success_rate, eta ratio
    band exclusion, filament sums); wear computation incl. abrasive threshold
    clamp at 100%; ownership scoping (user A can't read/delete user B's rows).
  - `PrintRecordMapperTest`: insert/find/delete against the test DB; index
    filters (printer/material/result/date).
  - Migration smoke: table exists after `occ upgrade` (assert via schema).
- **vitest** (happy-dom): `history-api.spec.js` — every call passes a `timeout`;
  URL/param shaping for filters; delete/clear hit the right verbs. Store-slice
  spec for the fetch/mutation actions with a mocked api.
- **Manual/gate**: after `make ship RESTART=1`, POST a synthetic terminal
  transition and confirm a row lands; hit `api/history/metrics` + `/wear`;
  confirm uninstall cleanup drops rows; confirm the app still installs clean on
  sqlite (the dev container).

## Rollout / workflow (CLAUDE.md)

1. `make bump-minor` → 1.37.0; fill CHANGELOG `[1.37.0]`; README version
   badge/matrix.
2. `npm run build`.
3. `make ship RESTART=1` (new PHP classes + migration + routes need opcache
   reset; migration runs via `occ upgrade` inside deploy).
4. Verify gates green (the two Moonraker gates G03/G06 are known-failing while the
   printer's Moonraker URL is unset/offline — not a regression); confirm
   `G01/G27 version=1.37.0`.
5. Commit with the `env -i` sanitized recipe + Claude trailer as the literal last
   line; push origin main; verify remote trailer.

## Risk / mitigations

- **First migration in the app** → keep `changeSchema` fully idempotent
  (`hasTable`/`hasColumn` guards) and test on the sqlite dev DB before shipping.
- **DB failure must never break the UI** → all capture + read paths are
  try/catch best-effort, matching the existing notify/activity contract.
- **Portability** (sqlite/mysql/pgsql) → use only QBMapper/IQueryBuilder, no
  raw SQL; compute median in PHP; avoid vendor-specific functions.
- **Wear numbers are heuristic** → every wear figure is labeled an estimate in
  the UI and its threshold documented as a rough default, never presented as a
  hardware guarantee.
