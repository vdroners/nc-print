> **OBSOLETE (historical).** These "upstream-blocked" items assumed the external
> forge-slicer relay at `:8766`. nc-print now owns its engine (v1.12.0+), and the
> features here have since shipped a different way: 3D toolpath preview (v1.13.0,
> client-side), calibration (v1.16.0), multi-object arrange (v1.15.0), and
> surface-quality overrides (v1.19.0). Local named presets remain the approach for
> saved profiles. See [`docs/plans/nc-print-self-contained-slicer.md`](nc-print-self-contained-slicer.md).

# Sprint J — upstream-blocked items

NC Print v1.7.x work that depends on forge-slicer API endpoints not yet available on the lab relay (`:8766`).

## Blocked endpoints

| Endpoint | Status | NC Print feature waiting |
|----------|--------|--------------------------|
| `POST /api/profiles` | **501 / not implemented** | Save Quality preset to forge DB from PrepareOverrides |
| `POST /api/preview` | **501 / not implemented** | Server-side 3D toolpath preview (replace or augment 2D `ToolpathScrubber`) |
| Batch slice API | **not shipped** | Per-object 3MF batch queue (`featureFlags.batchSlice`) |
| Documented fuzzy/seam override keys | **pending audit** | Extended ProfileQuickEdit scalars |

## Feature flags (store)

Until upstream ships, the Pinia store exposes:

- `featureFlags.batchSlice` — default `false`; enable when forge batch slice or N-job queue lands.
- `featureFlags.forgePreview` — default `false`; enable when `POST /api/preview` returns 200.

## Unblock checklist

1. Re-run [`docs/plans/forge-slicer-api-audit.md`](forge-slicer-api-audit.md) against the deployed forge-slicer image.
2. Confirm `POST /api/profiles` accepts Orca-style profile JSON and returns persisted ids.
3. Confirm `POST /api/preview` accepts job id + layer and returns PNG or mesh JSON.
4. Wire PrepareOverrides **Save preset → forge** (today: localStorage only via `savedPresets`).
5. Toggle `featureFlags.forgePreview` and route Slice rail to server preview when available.

## Local fallbacks (shipped in Sprint F–I)

| Upstream gap | Current fallback |
|--------------|------------------|
| Server preview | Canvas 2D `ToolpathScrubber.vue` from G-code parse |
| Profile save | `localStorage` named presets in PrepareOverrides |
| Multi-printer | Admin `multi_printers` JSON + `MultiPrinterPicker.vue` |
| Live progress | `moonraker-ws.js` with HTTP poll fallback |
