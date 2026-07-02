# Verify — NC Print v1.9.0

Signed off: **2026-06-30** (UTC) — lab server 10.0.0.84, `cloud_app` + forge-slicer + K1 Moonraker.

**v1.9.0:** UX cohesion (WS1–WS9) + Mainsail/Fluidd-class monitoring foundation
(Part B, WS10–WS16). New static gates **G28–G45**; new Vitest specs
**G38a–G44a** run inside G18/G19. Deploy-freshness gates **G34/G35** and the
Part B proxy/console regression **G45** run in `print-api-gates.php`. Browser
smoke **NS12.19–NS12.52** below are **NOT RUN** (manual, per-workstream).
Version floor gate **G27** now requires `>= 1.9.0`.

**v1.3.3:** SSE smoke validation (`print-smoke-slice.sh`), G18/G19 run vitest in gates, ASCII STL metadata guard, G-code preview 5 MB cap. **NS12 still NOT RUN** (manual viewport + E2E).

**v1.3.1:** Viewport load fix, PrepareChecklist, workflow gates, sticky CTAs, Help Services tab, G17–G19. Re-run **NS12.15–NS12.18** (viewport + E2E workflow).

**v1.3:** Centered workflow banner, scroll fix, Files app handler, slicer status card, multi-tool filament breakdown, Orca calibration links in Help.

**v1.2 UX overhaul:** Three.js viewport, profiles on Prepare, Files fetch API, G-code upload, health banner, toasts.

## Quick commands

```bash
make deploy
make gate-preflight
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
bash tools/print-smoke-slice.sh
curl -sf http://127.0.0.1:8766/api/health
curl -sf http://10.0.0.210:7125/server/info
```

`make deploy` copies `appinfo`, `css`, `img`, `js`, `lib`, `templates`, and `tools/` into `cloud_app`.

From Docker, slicer health uses `InternalUrlResolver` → `http://10.0.0.84:8082` (TCP relay to forge-slicer on host). See `docs/ADMIN.md` and `tools/forge-slicer-docker-relay.py`.

## Gate results (NS0–NS12)

| Gate | Description | Result | Timestamp (UTC) | Evidence |
|------|-------------|--------|-----------------|----------|
| **NS0** | Platform preflight | **PASS** | 2026-07-01T01:15Z | NS0.1–NS0.8 all PASS |
| NS0.1 | forge-slicer systemd active | **PASS** | 2026-07-01T01:15Z | `systemctl --user is-active forge-slicer` → active |
| NS0.2 | Slicer health | **PASS** | 2026-07-01T01:15Z | Host `127.0.0.1:8766/api/health` → ok; container G04 PASS via relay :8082 |
| NS0.3 | Moonraker | **PASS** | 2026-07-01T01:15Z | `10.0.0.210:7125/server/info` → klippy ready |
| NS0.4 | App deployed | **PASS** | 2026-07-01T01:15Z | `make deploy` → `cloud_app:/var/www/html/custom_apps/nc_print` |
| NS0.5 | App enabled | **PASS** | 2026-07-01T01:15Z | `occ app:list` → nc_print 1.0.0 enabled |
| NS0.6 | forge-slicer on boot | **PASS** | 2026-07-01T01:15Z | `systemctl --user is-enabled forge-slicer` → enabled |
| NS0.7 | Admin URLs set | **PASS** | 2026-07-01T01:15Z | G02/G03 PASS; ConfigService defaults + resolver |
| NS0.8 | K1 profiles | **PASS** | 2026-07-01T01:15Z | G05: `Creality K1` in `/api/profiles` |
| **NS1** | Auth + groups | **NOT RUN** | — | Manual HTTPS session tests (NS1.1–NS1.7) |
| **NS2** | Slicer engine (18) | **PARTIAL** | 2026-07-01T01:15Z | G04–G05, G10, G11 slicer_ok=1; full NS2.1–18 UI suite not run |
| **NS3** | NC Files (9) | **NOT RUN** | — | NS3.1–NS3.9 manual |
| **NS4** | Moonraker upload | **PARTIAL** | 2026-06-30T17:55Z | **Operator release:** NS4.1–NS4.2 **PASS** |
| NS4.1 | Upload succeeds | **PASS** | 2026-06-30T17:55Z | Direct Moonraker 201 + PrinterController 200 |
| NS4.2 | File in gcodes | **PASS** | 2026-06-30T17:55Z | `server/files/list?root=gcodes` lists uploaded files |
| NS4.3–NS4.7 | Start print, queue, etc. | **NOT RUN** | — | |
| **NS5** | Print control | **PARTIAL** | 2026-07-01T01:15Z | G07 printer state connected=1; pause/resume UI not exercised |
| **NS6** | Cloud HTTPS E2E | **NOT RUN** | — | Requires logged-in session on cloud-vdroners.ddns.net |
| **NS7** | Build + unit tests | **PASS** | 2026-07-01T01:15Z | See NS7.x |
| NS7.1 | `make build` | **PASS** | 2026-07-01T01:15Z | Webpack exit 0 |
| NS7.2 | PHPUnit | **PASS** | 2026-07-01T01:15Z | 10/10 via `make run-phpunit` (Docker php:8.2-cli) |
| NS7.3 | `npm run test` | **PASS** | 2026-07-01T01:15Z | Vitest (see v1.3.3 gate run) |
| NS7.4 | `make gate-preflight` | **PASS** | 2026-07-01T01:15Z | preflight + phpunit + vitest + build exit 0 |
| NS7.5 | CI green | **PENDING** | — | Push commit; verify GitHub Actions |
| **NS8** | Security | **PARTIAL** | 2026-07-01T01:15Z | G08/G13 allowlist regression PASS; full NS8.1–8.8 manual |
| **NS9** | Documentation | **PARTIAL** | 2026-07-01T01:15Z | All required docs present; NS9.12 screenshots placeholder only |
| **NS10** | Repository + packaging | **PASS** | 2026-07-01T01:15Z | See NS10.x |
| NS10.1 | Repo path | **PASS** | 2026-07-01T01:15Z | `/media/4TB/nc-print` |
| NS10.2 | GitHub private | **PASS** | 2026-07-01T01:15Z | `gh repo view` → PRIVATE |
| NS10.3 | Remote origin | **PASS** | 2026-07-01T01:15Z | `github.com/vdroners/nc-print` |
| NS10.4 | AGPL LICENSE | **PASS** | 2026-07-01T01:15Z | Root `LICENSE` (AGPL-3.0) |
| NS10.5 | CI workflow | **PASS** | 2026-07-01T01:15Z | `.github/workflows/ci.yml` |
| **NS11** | Deploy + prod readiness | **PASS** | 2026-07-01T01:15Z | Deploy + gates |
| NS11.1 | `make deploy` | **PASS** | 2026-07-01T01:15Z | |
| NS11.2 | `print-preflight.sh` | **PASS** | 2026-07-01T01:15Z | |
| NS11.3 | `print-api-gates.php` | **PASS** | 2026-07-01T01:15Z | G00–G15 all PASS |
| **NS12** | UX + visual acceptance | **NOT RUN** | — | v1.3.3: still blocked at Nextcloud login in automated browser; NS12.1–12.9 manual |
| NS12.10 | Scroll + pinned workflow banner | **NOT RUN** | — | Slice tab with overrides expanded: banner stays visible; bottom buttons reachable via tab scroll |
| NS12.11 | Files app Open action | **NOT RUN** | — | Right-click STL/G-code → Open in NC 3D Print; G-code opens Print tab |
| NS12.12 | Sticky Prepare CTA | **NOT RUN** | — | "Next to Slice" visible without scrolling past viewport |
| NS12.13 | Slice → Print handoff | **NOT RUN** | — | After slice complete, "Monitor on Print →" opens Print tab |
| NS12.14 | Print idle empty | **NOT RUN** | — | Idle printer shows guided panel with Go to Slice / Prepare |
| NS12.15 | STL viewport renders | **NOT RUN** | — | Import STL; bed grid + mesh visible; orbit + bbox overlay |
| NS12.16 | Prepare checklist | **NOT RUN** | — | Missing profile shows ✗; CTA disabled with title tooltip |
| NS12.17 | End-to-end workflow | **NOT RUN** | — | STL → profiles → Slice only or send → Print progress |
| NS12.18 | 3MF/OBJ path | **NOT RUN** | — | 3MF loads with info banner; slice succeeds without mesh |
| NS12.19 | Single body scroll | **NOT RUN** | — | WS1: no nested scrollbars; page scrolls as one; 1200/900 reflow |
| NS12.20 | Single camera view | **NOT RUN** | — | WS1: only one live camera (no PiP / PrePrint preview duplication) |
| NS12.21 | Collapsible Prepare groups | **NOT RUN** | — | WS2: `NcPrintCollapsible` sections expand/collapse; state persists |
| NS12.22 | Grouped viewport toolbar | **NOT RUN** | — | WS2: toolbar buttons grouped; no overflow at 1280 |
| NS12.23 | Unified chrome bar | **NOT RUN** | — | WS3: `AppChromeBar` renders; tabs + actions aligned |
| NS12.24 | Health banner auto-hide | **NOT RUN** | — | WS3: healthy services hide banner; notification bell present |
| NS12.25 | Compact job history on Print | **NOT RUN** | — | WS4: recent jobs shown compactly in the Print rail |
| NS12.26 | Completion filament stats | **NOT RUN** | — | WS4: completion banner shows filament grams (incl. support) |
| NS12.27 | Fullscreen camera | **NOT RUN** | — | WS4: Expand opens overlay; Esc closes |
| NS12.28 | Slice handoff card | **NOT RUN** | — | WS5: SliceHandoffCard shows summary + "Monitor on Print" |
| NS12.29 | Slice empty states | **NOT RUN** | — | WS5: no-model + slicer-disabled states render with CTAs |
| NS12.30 | Bed legend | **NOT RUN** | — | WS6: viewport bed legend overlay visible |
| NS12.31 | Applied badge | **NOT RUN** | — | WS6: mesh "Applied" badge shows after auto-apply |
| NS12.32 | Preview-skipped block | **NOT RUN** | — | WS6: slicing blocked when preview skipped + no slice blob |
| NS12.33 | Idle-safe Print monitor | **NOT RUN** | — | WS8: Print tab reachable while idle-but-connected |
| NS12.34 | Reopen recent | **NOT RUN** | — | WS8: reopen recent project/model from chrome |
| NS12.35 | Replay slice | **NOT RUN** | — | WS8: replay last slice from chrome |
| NS12.36 | Content max-width/centering | **NOT RUN** | — | WS9: content centered; max-width applied at wide viewport |
| NS12.37 | Sticky-rail chrome offset | **NOT RUN** | — | WS9: sticky rail sits below chrome (`--nc-print-chrome-h`) |
| NS12.38 | No clipping / untruncated | **NOT RUN** | — | WS9: no overflow clips; subtitles not truncated |
| NS12.39 | Temperature graph | **NOT RUN** | — | WS10: live multi-series graph; presets apply targets |
| NS12.40 | PID tune | **NOT RUN** | — | WS10: PID calibrate buttons trigger guarded action |
| NS12.41 | G-code console log | **NOT RUN** | — | WS11: `notify_gcode_response` lines stream into console |
| NS12.42 | Console send (gated) | **NOT RUN** | — | WS11: input hidden unless `console_enabled`; send validated |
| NS12.43 | Bed mesh heatmap | **NOT RUN** | — | WS12: mesh heatmap renders with range legend |
| NS12.44 | Bed mesh calibrate | **NOT RUN** | — | WS12: Calibrate disabled while printing; runs when idle |
| NS12.45 | Print/job queue | **NOT RUN** | — | WS13: queue lists jobs; reorder/remove |
| NS12.46 | Exclude object | **NOT RUN** | — | WS13: exclude-object mid-print for active objects |
| NS12.47 | Filament sensors + spool | **NOT RUN** | — | WS14: runout sensors + Spoolman active spool shown |
| NS12.48 | Filament load/unload/purge + cost | **NOT RUN** | — | WS14: guarded actions; last-slice cost estimate |
| NS12.49 | Moonraker history/stats | **NOT RUN** | — | WS15: totals + recent list render |
| NS12.50 | Embedded thumbnails | **NOT RUN** | — | WS15: G-code thumbnail shows for current file |
| NS12.51 | Timelapse list + playback | **NOT RUN** | — | WS16: rendered videos list; in-app playback |
| NS12.52 | Timelapse feature-gated | **NOT RUN** | — | WS16: panel hidden when plugin absent |

## CLI API gates (deployed)

Run **2026-07-01T01:15Z** inside `cloud_app`:

```
G00 PASS nc_print installed
G01 PASS version=1.9.0
G02 PASS slicer_url set
G03 PASS moonraker_url set
G04 PASS health ok
G05 PASS Creality K1 profile present
G06 PASS klippy reachable
G07 PASS status=200 connected=1
G08 PASS allowlist regression
G09 PASS printer#upload registered
G10 PASS slice/stream -> api/slice
G11 PASS slicer_ok=1 moonraker_ok=1
G12 PASS proxy bases set
G13 PASS slicer api/ prefix gate
G14 PASS http=401 fallback=ApiController
G15 PASS admin_can_use=1 ws_ticket=yes
G16 PASS nc_print-files-action.mjs
G17 PASS viewport.js + three chunk
G18 PASS vitest exit 0 (viewport-stl + suite)
G19 PASS vitest exit 0 (prepare-workflow + suite)
G20 PASS temperature/emergency-stop/gcode-action routes
G21 PASS clamped M104/M140 nozzle/bed temps
G22 PASS emergency_stop via moonrakerPost (no gcode passthrough)
G23 PASS M220/M221/M106/SET_GCODE_OFFSET guarded
G24 PASS gcode action allowlist
G25 PASS printer_id on print actions
G26 PASS motion blocked while printing
G27 PASS version=1.9.0
G34 PASS sticky chrome CSS deployed
G35 PASS fresh: css/js deploy freshness
G45 PASS proxy allowlist + console-off regression OK
```

**Part B (WS10–WS16) static/Vitest gates** run inside G18/G19 and PHPUnit:

```
G38a PASS temp-graph.spec.js (temperature store parse + presets)
G39a PASS console.spec.js (console log + gated send)
G40a PASS bed-mesh.spec.js (mesh parse + heat color)
G41a PASS queue.spec.js (job queue + exclude-object)
G42a PASS filament.spec.js (mass/cost + runout + spool parse)
G43a PASS history.spec.js (history totals/list + thumbnails)
G44a PASS timelapse.spec.js (video list parse + feature gate)
```

**Live-printer HTTP probes (G38b/G40b/G41b/G43b/G44b)** skip-with-note when the
lab printer lacks the plugin (temperature_store / job_queue / history / files
metadata / timelapse).

## Preflight static

`tools/print-preflight.sh` → **OK preflight static checks**

## Git release

| Item | Status |
|------|--------|
| Remote | `origin` → `git@github.com:vdroners/nc-print.git` |
| Branch | `main` |
| Tag | `v1.0.0` (re-tag when NS1–NS6 + NS12 all PASS on cloud HTTPS) |

**v1.0 engineering tag criterion:** NS0–NS12 all **PASS** on cloud HTTPS — **not yet met** (NS1, NS3, NS6, NS12 require operator login / manual sign-off). **Operator release criterion (NS4.1+NS4.2): PASS.**
