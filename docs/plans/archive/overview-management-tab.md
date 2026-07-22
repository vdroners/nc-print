# nc-print v1.55.0 — Overview management tab + 3DPrintForge pillars

## Why
Split management/persistent concerns off the Prepare/Slice/Print workflow so
Prepare stays focused on the current print, and grow nc-print into "more than a
slicer" by adapting selected 3DPrintForge features natively (Vue/PHP/Nextcloud DB).
Plus Prepare-tab UX fixes surfaced from live use.

## What changed
1. **Clear button** — confirm dialog + actually clears the 3D viewport (viewport
   `clearModelMesh` exposed + called on `queueLoad(null)`) + resets the slice job
   (`defaultSliceJob()` factory used by state/reset/clearModel).
2. **Remember last-active tab** — `setActiveTab` persists to prefs; `restorePrefs`
   restores it, gated (Overview/Prepare always; Slice needs prepareComplete; Print
   needs a reachable printer; else Prepare).
3. **Overview tab** — new `TABS.OVERVIEW`, a gear button in `AppChromeBar` (NOT a
   workflow step — banner stays 3), App.vue render + hotkey 4, `OverviewTab.vue`
   with collapsible sections. Relocations: Materials/Calibration off Slice,
   durable History off Print (into Overview); cameras dual-hosted; the in-flow
   TargetPrinterPicker stays on Prepare.
4. **Prepare layout polish** — thinner chrome (less blank space), Open recent moved
   into the Import section, narrower right panel.
5. **Model colour + opacity** — viewport `setModelColor`/`setModelOpacity`, controls
   in the View tool, persisted view prefs.
6. **Mesh repair** — centroid-fan for large holes, non-manifold edge split,
   `analyzeMesh` reports `nonManifoldCount`, watertight requires closed+manifold,
   clearer fixed/remaining reporting.

## New backend pillars (adapted from 3DPrintForge, native NC)
- **Achievements** (`AchievementService` + `AchievementController`,
  `/api/achievements`) — per-user milestones derived from print history; no table.
- **Filament inventory** (`oc_ncprint_spools` migration + `Spool`/`SpoolMapper` +
  `FilamentInventoryService`/`FilamentInventoryController`, `/api/filament` CRUD) —
  standalone spool library. NOTE: route prefix is `filament_inventory#*` so
  Nextcloud resolves the `FilamentInventoryController` class.
- **Analytics** (`PrintHistoryService::analytics` + `history#analytics`,
  `/api/history/analytics`, `analyticsRows` mapper) — totals + weekly series +
  per-material/per-printer rollups + est. cost.
- **Maintenance/wear** (`oc_ncprint_maintenance` migration + entity/mapper +
  `MaintenanceService`/`MaintenanceController`, `/api/maintenance`) — component
  lifetimes + replacement log + percent-used from tracked print-hours.
Frontend panels: AchievementsPanel, FilamentInventoryPanel, AnalyticsPanel,
MaintenancePanel, all mounted in OverviewTab.

## Verify
- vitest (overview-tab source-regex, store tab-persist/clear/viewPref, mesh repair)
  + phpunit (OverviewPillarsTest) green; `make ship RESTART=1` runs migrations +
  all G-gates. Live: gear→Overview shows 7 sections; all 4 pillar endpoints 200;
  filament CRUD works; Clear confirms + empties viewport; colour/opacity persist.
