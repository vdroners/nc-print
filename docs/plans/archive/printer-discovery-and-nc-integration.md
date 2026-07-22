# nc-print: automatic printer discovery, recent printers, deeper Nextcloud integration

## Why / scope

Three related threads, all requested together:

1. **Automatic printer discovery in the app** — surface found Moonraker printers
   directly in the printer picker (today discovery is admin-only), via an
   on-demand "Scan for printers" button.
2. **Recently-used printers** — float the printers you actually use to the top of
   the picker (parallel to the existing `recentModels` MRU for files).
3. **Deeper Nextcloud integration** — make the app feel native: route print
   complete/failed to the **Notification bell**, log print events to the
   **Activity stream**, and add a **Dashboard widget** for at-a-glance status.

Plus a small, high-value **forge port**: capability detection so a discovered/
added printer auto-populates model/nozzle/bed info. We query Klipper/Moonraker
**live** (`machine.system_info`, `printer.objects`) rather than porting forge's
static model DB (its preset JSON isn't present in this checkout; live query is
more accurate for the Klipper/Moonraker stack anyway).

Decisions (confirmed with the user):
- NC integration depth: **Notifications + Activity + Dashboard** (all three).
- Printer storage: **extend the existing `multi_printers` app-config JSON**; per
  user "recent" lives in localStorage. No DB table/migration.
- Discovery trigger: **on-demand button** (no background/auto LAN scans).

Ships as **3 sequential, independently-deployable version bumps** (v1.24.0 →
v1.26.0), each: implement + tests → build → deploy → `make gate-preflight` →
commit (env -i, Claude trailer) → push. Consistent with the prior 4-phase port.

## Grounding (verified)

- Discovery already exists and works: `AdminController::discoverPrinters` +
  `buildDiscoveryCandidates` + `probeMoonraker` (Moonraker `/server/info` sweep,
  /24, capped 260) — currently wired ONLY to `src/admin-settings.js`.
- Printer picker in-app: `MultiPrinterPicker.vue` (target printer, bound to
  `selectedPrinterId`, shown when `configuredPrinters.length > 1`). Source =
  `configuredPrinters` getter ← `config.multi_printers` (ConfigService JSON).
- MRU precedent: `recentModels` getter + `nc_print_recent_models_v1` localStorage
  (LRU cap 5). No printer MRU yet. `onPrinterTargetChange()` is the switch hook.
- NC framework status: `AdminSettings`/`AdminSection` (ISettings) done; Files
  action done; `Application::register` currently registers only the Files-scripts
  listener. Absent: Notifications, Activity, Dashboard, Search, capabilities.
- Access gating: `AccessService::canUseApp()` (IUserSession + IGroupManager).
- Forge capability matrix: `printer-capabilities.js` (real, portable). Forge
  `printer-presets.js` depends on a `data/printer-model-presets.json` that is NOT
  in this checkout → dropped; use live Moonraker capability query instead.

## Phase 1 — v1.24.0: In-app discovery + recently-used printers

Goal: the target-printer picker shows **Recent**, **Configured**, and (on demand)
**Found on network** groups; found printers can be added to the session.

Backend:
- New `PrinterDiscoveryController` (or add to an existing non-admin controller)
  `POST /api/printers/discover` — access-gated (`canUseApp`, NOT admin-only).
  Reuses `AdminController::buildDiscoveryCandidates` + a shared probe. Extract the
  candidate/probe logic into a small `PrinterDiscoveryService` so both the admin
  path and the new user path share one implementation (no duplication). Returns
  the same fields as today: `{host, moonraker_url, klippy_state,
  moonraker_version, hostname}`.
- Route added; no proxy-allowlist change (this is an app route, not a sidecar
  proxy path).

Frontend:
- `src/services/printers-api.js` — `discoverPrinters()` (POST) → found list.
- Store (`print.js`):
  - `recentPrinters` state + `nc_print_recent_printers_v1` localStorage (LRU cap
    5, `{id, name, at}`), loaded in `loadPrefs`/persisted on switch.
  - `recordPrinterUsage(id)` called from `onPrinterTargetChange()`.
  - `discoveredPrinters` state + `discoverPrinters()` action (calls api, dedupes
    against `configuredPrinters` by moonraker_url/host).
  - `addDiscoveredPrinter(found)` — appends a session printer to
    `configuredPrinters` (in-memory; persists the id into recent). Persisting to
    admin config stays an admin action — in-app "add" makes it selectable now and
    remembers it via recent; a hint links admins to Settings to save permanently.
  - getter `printerPickerGroups` → `{ recent[], configured[], discovered[] }`.
- `MultiPrinterPicker.vue` — grouped `<optgroup>`s (Recent / Configured / Found),
  a "Scan for printers" button with progress + found-count, and an inline "Add"
  affordance for found printers. Always render the picker if there's >1 option OR
  discovery is available (not only when configured>1).

Tests:
- PHP: `PrinterDiscoveryServiceTest` (candidate building shared logic parity with
  the admin path; dedupe/cap) — reuse the existing `buildDiscoveryCandidates`
  coverage shape.
- Frontend: `printers-api.spec` (discover POST shape); store spec — recent LRU
  (cap 5, most-recent-first, de-dupe), `recordPrinterUsage`, discovered dedupe,
  `printerPickerGroups`.

## Phase 2 — v1.25.0: Live printer capability detection (forge-informed)

Goal: adding/selecting a printer auto-fetches its real capabilities so the UI can
show bed size / extruder count / model and pre-fill sensibly.

Backend:
- Extend the discovery/printer path: `GET /api/printers/capabilities?printer_id=`
  (or fold into discover result) — queries Moonraker
  `machine.system_info` + `printer.objects/query` for `toolhead` (axis_maximum =
  bed/build volume), extruder count, and `configfile` mcu/model where available.
  Read-only Moonraker calls through the existing guarded PrinterController-style
  helper (NOT raw passthrough). Normalize into
  `{model?, build_volume?{x,y,z}, extruders?, has_enclosure?, firmware?}`.
- Adapt (not verbatim-port) the shape/labels from forge
  `printer-capabilities.js` for the normalized fields + a tiny capability-flag
  vocabulary; the values come from the live query, not a static DB.

Frontend:
- `printers-api.js` — `fetchCapabilities(printerId)`.
- Show a compact capability chip row in `MultiPrinterPicker` / printer detail
  ("300×300×250 · 1 extruder · enclosed") when known; cache per printer id.

Tests:
- PHP: capability normalizer unit test (axis_maximum → build volume; extruder
  count from `printer.objects`; missing fields tolerated).
- Frontend: `fetchCapabilities` parse + chip rendering.

## Phase 3 — v1.26.0: Native Nextcloud integration (Notifications + Activity + Dashboard)

Goal: print lifecycle shows up where Nextcloud users expect it.

- **Notifications** (`INotificationManager`):
  - `lib/Notification/Notifier.php` (INotifier) + register in `Application`.
  - Fire on print complete/failed. The state transition is detected client-side
    today (`_maybeNotifyPrintTransition`); add a tiny
    `POST /api/printer/notify-transition` (access-gated) that the store calls on
    the complete/error transition, which publishes the NC notification to the
    current user. (Keeps the transition-detection where it already is; server
    just publishes.) Browser notification stays as-is (complementary).
- **Activity** (`IActivityManager` + `IProvider`/`ISetting`):
  - `lib/Activity/Provider.php` + `lib/Activity/Setting.php`, registered in
    `Application`. Publish `print_started` / `print_completed` / `print_failed`
    (+ filename, duration, grams where known) from the same notify-transition
    endpoint and from send-to-printer. Rich, translatable subject strings.
- **Dashboard** (`IDashboardWidget` / `IAPIWidget`):
  - `lib/Dashboard/PrinterStatusWidget.php` + a small Vue entry
    (`src/dashboard.js` + `DashboardWidget.vue`) registered via the widget's
    `load()`. Shows active printer state (name, progress %, ETA, last result) and
    a deep link into the app. Data via the existing `/api/printer/state` +
    `/api/eta` — no new heavy endpoint. Quick pause/cancel deferred if it
    complicates CSRF; link-through first.
- `info.xml`: declare the dashboard/activity/notifications where required; add any
  new webpack entry (`dashboard`) to `webpack.config.js`.

Tests:
- PHP: Notifier `prepare()` (subject/message formatting, wrong-app guard);
  Activity Provider `parse()` (known subjects, unknown-subject throws);
  Dashboard widget metadata (id/title/order) + `getItems` shape with a mocked
  state source. Add OCP stubs as needed (mirror the `IConfig` stub precedent).
- Frontend: notify-transition is called once per complete/error transition (store
  spec); dashboard widget mount smoke test.

## Out of scope (this round)

Search provider, occ commands, capabilities API (client-discovery), Files
sidebar panel, printer DB table/migration, background auto-scan, SSDP/mDNS/Bambu
discovery (needs a Node sidecar; this stack is Moonraker/Klipper), forge
printer-manager connection pooling, material-recommender. Noted for later.

## Per-phase workflow (repo convention)

implement + tests → `make run-phpunit` / `npm run test` / `make slicer-test`
(if adapter touched — none expected here) → version bump (info.xml +
package.json + package-lock ×2 + README badge) + CHANGELOG + README feature line
→ `npm run build` → `make deploy` → `make gate-preflight` → commit (env -i,
Claude co-developed-by trailer as last line, no cursor) → push origin main.

## Verification

- Discovery: `POST /api/printers/discover` returns found Moonrakers to a
  non-admin (group-gated) user; picker shows Recent/Configured/Found; switching a
  printer moves it to Recent (persists across reload).
- Capabilities: adding a live Moonraker shows real build volume + extruder count.
- Notifications: completing a print rings the NC bell for the user.
- Activity: the print shows in the Activity stream with filename + duration.
- Dashboard: the widget shows current printer status and deep-links in.
- Every phase: full gate G00–G45 green; deployed version matches; e2e on the live
  stack where it touches Moonraker.
