# nc-print → self-contained professional slicer

## Context

nc-print historically did **not** slice — it proxied every slice request to a
*separate* external service, forge-slicer (a Node REST server at
`host.docker.internal:8766`), via `SlicerProxyController`. That service in turn
shelled out to the real engine.

The goal is for nc-print to be a **professional, self-contained slicer**: it
should slice on its own and no longer depend on the external forge-slicer
service, while advancing four dimensions — slice quality + trustworthy 3D
toolpath preview, prep power (supports / auto-arrange / calibration),
printer/fleet ops, and polish/robustness.

The professional engine already exists as a real ~145 MB native OrcaSlicer-fork
CLI (`3DPrintForge Slicer`) with a ~237 MB `resources/` profile tree.
Reimplementing OrcaSlicer in JS/WASM to professional quality is not realistic, so
**"self-contained" means nc-print ships and owns its own slicer sidecar
container** that embeds this engine.

Key verified facts that shape the design:

- The engine has a **built-in headless REST server**: `/api/health`,
  `/api/version`, `/api/profiles[?kind=]`, `/api/profiles/{id}`, `/api/printers`,
  `POST /api/slice`, `POST /api/slice/stream` (SSE), `GET /api/jobs`,
  `GET /api/jobs/{id}/gcode`. `POST /api/preview` returns 501.
- It runs headless via **`--rest-only --rest-port <p>`** (dash form; the
  underscore form is rejected per its `REST_README.md`).
- ABI: requires **GLIBC_2.38** → base image must be **Ubuntu 24.04**.
- Toolkit is **GTK3 + webkit2gtk + Wayland** → headless needs **Xvfb + Mesa
  software GL**, not `QT_QPA_PLATFORM=offscreen`.
- nc-print's proxy is contract-agnostic (forwards `api/*`), so the cutover from
  external forge to the owned sidecar is a **config-default change, not a proxy
  rewrite**.

Large, multi-phase change; each phase is its own version bump + CHANGELOG entry +
`make gate-preflight`.

## Architecture (target)

```
Browser (Vue) → nc_print PHP controllers → nc-print-slicer sidecar (OWNED)
                  ├─ SlicerProxyController ──────┐  Ubuntu 24.04 container:
                  ├─ MoonrakerProxyController     ├─ Xvfb + Mesa llvmpipe
                  └─ PrinterController            ├─ OrcaSlicer-fork CLI (--rest-only)
                                                  └─ FastAPI adapter on :8080
```

`cloud_app` and `nc-print-slicer` share a Docker network (`nc-print-net`); PHP
reaches the sidecar by container DNS (`http://nc-print-slicer:8080`), which
sidesteps the `InternalUrlResolver` `:8766`/`host.docker.internal` rewrite hacks.

## Phase 1 — v1.12.0 (this release): own the engine, cut over the slice path

Zero UX regression, **no frontend change**. Contract kept byte-identical to
`src/services/slicer-api.js` and verified end-to-end (STL → 227 KB gcode).

**Engine reality discovered during Phase 1** (drove the adapter design): this
OrcaSlicer-fork build's built-in REST `/api/slice` is broken, and the binary
**cannot load STL at all** (`-6`; reproduces on the reference forge and the host
binary — a property of the engine, not the container). It loads **3MF** fine. So
the adapter is NOT a thin REST proxy for slicing; it does CLI-exec:

- **Sidecar** under `slicer/`: `Dockerfile` (Ubuntu 24.04 + GTK/webkit runtime +
  Xvfb + Mesa; bakes engine + resources + `LICENSE.txt` + a data_dir seed that
  enables the full vendor PresetBundle → 87/214/294) and `adapter/`:
  - `mesh3mf.py` — converts the uploaded STL to a bare geometry 3MF (weld verts,
    drop degenerate tris) the engine accepts.
  - `presets.py` — indexes the on-disk preset tree by name (frontend IDs are
    bundle preset names) and resolves a **compatible** machine/process/filament
    triple, auto-repairing incompatible selections (avoids the engine's `-17`).
  - `main.py` — `/api/slice/stream`: STL→3MF → resolve presets → exec
    `--slice 0 --load-settings "<machine>;<process>" --load-filaments <f>
    --outputdir <job> model.3mf` (cwd = job dir; NO `--export-3mf`, which crashes
    the CLI) → synthesized SSE (`progress`/`warning`/`done`/`error`) → serve the
    produced `plate_1.gcode` from `/api/jobs/{id}/gcode` (HEAD + Range).
    Profiles/health/version stay engine pass-through.
- **`docker-compose.slicer.yml`**: `nc-print-net`, internal-only (no host port),
  hardened (`read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs scratch,
  mem/pid caps), writable volume for operator presets.
- **`Makefile`**: `slicer-fetch` (stage git-ignored engine), `slicer-build`,
  `slicer-up` (+ attach `cloud_app` to `nc-print-net`), `slicer-down`; wire
  `slicer-up` into `deploy`, guarded.
- **Backend**: `ConfigService::DEFAULT_SLICER_INTERNAL_URL` →
  `http://nc-print-slicer:8080` (keep `slicer_internal_url` override for external
  forge). `InternalUrlResolver` passes the container-DNS default through
  unchanged (regression tests added). Proxy unreachable message reworded.

**Acceptance:** slice → gcode → send identical to today; external-forge fallback
still works via app config; PHPUnit + vitest + build green.

## Later phases (planned)

- **v1.13.0 — 3D toolpath preview.** Sidecar `GET /api/jobs/:id/toolpath` parses
  gcode `;TYPE:`/`;Z:` markers into feature-typed layer buffers; new
  `src/services/toolpath-3d.js` + `viewport.js showToolpath()` render it in the
  existing Three.js viewport with a layer slider + feature legend. Closes the
  `/api/preview 501` gap with something better than a thumbnail.
- **v1.14.0 — Supports + mesh analyze/repair** (CLI-native overrides + sidecar
  `POST /api/mesh/analyze`, `--repair`).
- **v1.15.0 — Auto-arrange / nesting** (`POST /api/arrange`, multi-object plate
  UI).
- **v1.16.0 — Calibration suite** from the shipped `resources/calib/` models.
- **v1.17.0 — Per-object settings + big-mesh polish.**

## Risks

- **Licensing (AGPL).** Engine is AGPL; nc-print is AGPL-3.0-or-later →
  compatible. Bake `LICENSE.txt`; keep the binary out of git (fetch at build);
  offer engine source separately when distributing the image.
- **Image size** ~1.2–1.5 GB. Prune `resources/` only after verifying
  `--rest-only` PresetBundle load does not need the pruned subdirs.
- **Headless GL.** Xvfb + Mesa llvmpipe. CLI-exec-per-request is the fallback if
  `--rest-only` proves flaky headless.
- **Container security** (runs a C++ parser on user meshes): internal-only,
  cap-dropped, read-only rootfs, tmpfs scratch, mem/pid caps, per-job timeouts.
- **Profile-id compatibility.** Same binary+resources as forge used;
  `/api/health` reports bundle counts and the container HEALTHCHECK fails if the
  bundle is empty.

## Verification

- Per phase: `make gate-preflight` (phpunit + vitest + build +
  `tools/print-api-gates.php`); version bump; CHANGELOG; `make deploy`.
- Phase 1 e2e: `make slicer-up` → `curl http://nc-print-slicer:8080/api/health`
  from inside `nc-print-net` shows engine version + non-zero profile counts →
  load a model → slice → gcode downloads and matches a reference slice → Save to
  Files + Slice & Send still work → external-forge fallback via the app override.
