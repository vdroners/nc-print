> **OBSOLETE (historical).** This audited the *external* forge-slicer relay at
> `:8766`, which nc-print no longer uses. As of v1.12.0 the app owns its slicing
> engine (the `nc-print-slicer` sidecar). See
> [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) and
> [`docs/plans/nc-print-self-contained-slicer.md`](nc-print-self-contained-slicer.md).
> Kept only for the changelog history that links here.

# forge-slicer API audit (Sprint 0)

**Host:** `http://127.0.0.1:8766` (lab forge-slicer)  
**Date:** 2026-07-01  
**Upstream:** 3DPrintForge Slicer 1.1.23 / forge-slicer 1.10.2-skynett.1

## Results

| Endpoint | Method | HTTP | Notes |
|----------|--------|------|-------|
| `/api/health` | GET | 200 | ok, version, upstream label |
| `/api/profiles` | GET | 200 | printer/filament/process list |
| `/api/profiles` | POST | 404 | **Not available** — use local presets (Sprint G/I) |
| `/api/jobs` | GET | 200 | job list with gcode metadata |
| `/api/jobs` | POST | 404 | no create via POST |
| `/api/preview` | POST | 501 | `preview not implemented` — Sprint J |
| `/api/mesh/analyze` | POST | 404 | **Not on forge-slicer** — client fallback (Sprint C) |
| `/api/mesh/repair` | POST | 404 | **Not on forge-slicer** — client fallback (Sprint C) |
| `/api/slice/stream` | POST | 200 | SSE slice (proxied by NC Print) |

## NC Print proxy

All paths under `api/*` are forwarded via [`SlicerProxyController`](../../lib/Controller/SlicerProxyController.php) (`/api/slicer/{path}` → `{slicerBase}/api/{path}`).

Special case: browser `slice/stream` → upstream `api/slice/stream`.

## Mitigations

| Gap | Sprint | Approach |
|-----|--------|----------|
| mesh analyze/repair | C | Port Forge `mesh-repair.js` / `stl-analyzer.js` logic to browser |
| preview 3D | J | Wait for upstream or use G-code layer scrubber (Sprint F) |
| POST profiles | J | Local named presets in user prefs until upstream ships |

## Verification command

```bash
BASE=http://127.0.0.1:8766
curl -sS "$BASE/api/health"
curl -sS "$BASE/api/jobs" | head -c 200
curl -sS -X POST "$BASE/api/preview" -H 'Content-Type: application/json' -d '{}'
```
