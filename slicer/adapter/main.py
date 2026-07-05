"""nc-print-slicer adapter.

The adapter is the ONLY surface nc-print's PHP backend talks to; the engine
binds 127.0.0.1 and is never exposed.

Two integration modes coexist:

  * PASS-THROUGH (profiles, health, single-profile, printers) — proxied to the
    engine's built-in REST server, which loads the full PresetBundle correctly.

  * CLI-EXEC (slice) — the engine's built-in REST `/api/slice` is broken in this
    build AND the binary cannot load STL, so the adapter converts the uploaded
    STL to a bare 3MF (mesh3mf), resolves a compatible machine/process/filament
    triple from the on-disk preset tree (presets), execs the CLI
    (`--slice --load-settings --load-filaments --export-3mf`), and streams a
    synthesized SSE progress feed. The raw `plate_1.gcode` the CLI writes to the
    output dir is stored per job and served by GET /api/jobs/{id}/gcode.

The HTTP contract is kept byte-identical to what nc-print already expects
(src/services/slicer-api.js): POST /api/slice/stream (SSE progress/done/error),
GET /api/jobs/{id}/gcode (HEAD + Range), GET /api/profiles, etc.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from email.parser import BytesParser
from email.policy import HTTP

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from calibration import (
    generate_temp_tower_3mf,
    list_calibrations,
    shipped_model_path,
)
from calibration_gcode import generate as calib_generate
from calibration_gcode import list_gcode_calibrations
from filament_materials import (
    get_all_materials,
    get_material_by_id,
    get_materials_by_category,
)
from color_order import optimize_color_order, basic_color_name
from gcode_linter import lint_gcode
from gcode_postprocess import inject_pauses
from gcode_reference import get_reference, list_reference, search_reference
from gcode_stats import compute_breakdown
from gcode_toolpath import parse_toolpath
from mesh3mf import stl_bytes_to_3mf, stls_to_multiobject_3mf
from mesh_analyze import analyze_stl
from overrides import apply_overrides
from presets import PresetIndex, resolve_triple
from printer_presets import (
    find_printer_preset,
    list_all_capabilities,
    list_all_presets,
    list_printer_presets_for_vendor,
)

ENGINE_BASE = os.environ.get("ENGINE_BASE", "http://127.0.0.1:8765").rstrip("/")
ENGINE_BIN = os.environ.get("ORCA_BIN", "/opt/orca/3dprintforge-slicer")
JOB_ROOT = os.environ.get("SLICE_JOB_ROOT", "/tmp/slice")
SLICE_TIMEOUT_S = int(os.environ.get("SLICE_TIMEOUT_S", "600"))
# Hardening knobs.
MAX_CONCURRENT_SLICES = int(os.environ.get("MAX_CONCURRENT_SLICES", "2"))
JOB_MAX_AGE_S = int(os.environ.get("JOB_MAX_AGE_S", "3600"))
GC_INTERVAL_S = int(os.environ.get("GC_INTERVAL_S", "300"))

_QUICK_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0)

app = FastAPI(title="nc-print-slicer", version="2")

# Bound the number of engine processes running at once so a burst of uploads
# can't exhaust CPU/RAM. Excess requests fail fast with 503 rather than piling up.
_slice_slots = asyncio.Semaphore(MAX_CONCURRENT_SLICES)

# job_id -> running engine subprocess.Popen, so job_cancel can terminate it
# instead of leaving it to run to completion (holding a slice slot).
_PROCS: dict[str, "subprocess.Popen"] = {}


def _kill_proc(proc: "subprocess.Popen") -> None:
    """Terminate an engine process, escalating to kill after a short grace."""
    try:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception:  # noqa: BLE001 - best-effort cleanup
        pass

_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length", "host",
}

# Preset index is built once at startup (the on-disk tree is immutable per image
# except for the mounted user volume, which is small).
_INDEX: PresetIndex | None = None
# job_id -> {gcode: path, meta: {...}, created: monotonic_seconds}
_JOBS: dict[str, dict] = {}


def _index() -> PresetIndex:
    global _INDEX
    if _INDEX is None:
        _INDEX = PresetIndex()
    return _INDEX


def _clean_headers(raw) -> dict[str, str]:
    return {k: v for k, v in raw.items() if k.lower() not in _HOP_BY_HOP}


async def _gc_loop() -> None:
    """Periodically evict completed jobs older than JOB_MAX_AGE_S.

    Without this, _JOBS grows unbounded and /tmp/slice/<job> dirs accumulate
    (each slice is hundreds of KB of gcode + presets) until the tmpfs fills.
    """
    while True:
        await asyncio.sleep(GC_INTERVAL_S)
        now = time.monotonic()
        for job_id, meta in list(_JOBS.items()):
            if now - meta.get("created", now) > JOB_MAX_AGE_S:
                _JOBS.pop(job_id, None)
                shutil.rmtree(os.path.join(JOB_ROOT, job_id), ignore_errors=True)
        # Also sweep orphaned dirs (e.g. failed slices never recorded in _JOBS).
        wall = time.time()
        try:
            for name in os.listdir(JOB_ROOT):
                d = os.path.join(JOB_ROOT, name)
                if name in _JOBS or not os.path.isdir(d):
                    continue
                try:
                    if wall - os.path.getmtime(d) > JOB_MAX_AGE_S:
                        shutil.rmtree(d, ignore_errors=True)
                except OSError:
                    pass
        except OSError:
            pass


@app.on_event("startup")
async def _startup() -> None:
    os.makedirs(JOB_ROOT, exist_ok=True)
    _index()  # warm the preset index
    asyncio.create_task(_gc_loop())


@app.get("/api/health")
async def health() -> JSONResponse:
    """Adapter health + engine bundle counts + on-disk preset counts."""
    engine_ok = False
    engine_version = None
    bundle = {"printers": 0, "filaments": 0, "processes": 0}
    async with httpx.AsyncClient(timeout=_QUICK_TIMEOUT) as client:
        try:
            hr = await client.get(f"{ENGINE_BASE}/api/health")
            engine_ok = hr.status_code == 200
            try:
                engine_version = (hr.json() or {}).get("version")
            except Exception:  # noqa: BLE001
                engine_version = None
        except Exception:  # noqa: BLE001
            engine_ok = False
        if engine_ok:
            for kind, key in (("printer", "printers"), ("filament", "filaments"),
                              ("process", "processes")):
                try:
                    pr = await client.get(f"{ENGINE_BASE}/api/profiles",
                                          params={"kind": kind})
                    if pr.status_code == 200:
                        bundle[key] = len((pr.json() or {}).get("profiles") or [])
                except Exception:  # noqa: BLE001
                    pass

    disk = _index().counts()
    ok = engine_ok and bundle["printers"] > 0
    return JSONResponse(
        {
            "ok": ok,
            "service": "nc-print-slicer",
            "slice_mode": "cli-exec",
            "engine": {"reachable": engine_ok, "version": engine_version},
            "bundle": bundle,
            "presets_on_disk": disk,
            "jobs": {"active": MAX_CONCURRENT_SLICES - _slice_slots._value
                     if hasattr(_slice_slots, "_value") else None,
                     "cached": len(_JOBS),
                     "max_concurrent": MAX_CONCURRENT_SLICES},
        },
        status_code=200 if ok else 503,
    )


# ── Slice (CLI-exec) ──────────────────────────────────────────────────────

def _parse_multipart(content_type: str, body: bytes) -> dict:
    """Extract the slice multipart fields (model bytes + ids) without extra deps."""
    hdr = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode()
    msg = BytesParser(policy=HTTP).parsebytes(hdr + body)
    fields: dict = {"model": None, "models": [], "arrange": False,
                    "printer_id": "", "process_id": "",
                    "filament_ids": [], "overrides": {}, "pauses": [],
                    "object_overrides": []}
    for part in msg.iter_parts():
        cd = part.get("Content-Disposition", "")
        name = None
        for token in cd.split(";"):
            token = token.strip()
            if token.startswith("name="):
                name = token[5:].strip('"')
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        if name == "model":
            # First model kept as `model` for single-object back-compat; all
            # models (incl. repeated `model`/`model[]` parts) collected in list.
            if fields["model"] is None:
                fields["model"] = payload
            fields["models"].append(payload)
        elif name in ("model[]", "models"):
            fields["models"].append(payload)
            if fields["model"] is None:
                fields["model"] = payload
        elif name == "arrange":
            fields["arrange"] = payload.decode(errors="replace").strip() in ("1", "true", "True", "on")
        elif name == "filament_ids":
            try:
                fields["filament_ids"] = json.loads(payload.decode() or "[]")
            except Exception:  # noqa: BLE001
                fields["filament_ids"] = []
        elif name == "overrides":
            try:
                fields["overrides"] = json.loads(payload.decode() or "{}")
            except Exception:  # noqa: BLE001
                fields["overrides"] = {}
        elif name == "pauses":
            try:
                v = json.loads(payload.decode() or "[]")
                fields["pauses"] = v if isinstance(v, list) else []
            except Exception:  # noqa: BLE001
                fields["pauses"] = []
        elif name == "object_overrides":
            # Per-object process overrides, aligned to the models list:
            # [{key:value,...}, ...]. Non-list / bad JSON -> ignored.
            try:
                v = json.loads(payload.decode() or "[]")
                fields["object_overrides"] = v if isinstance(v, list) else []
            except Exception:  # noqa: BLE001
                fields["object_overrides"] = []
        else:
            fields[name] = payload.decode(errors="replace").strip()
    return fields


def _sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


async def _run_slice(job_id: str, job_dir: str, model_3mf: str,
                     machine: str, process: str, filaments: list[str],
                     overrides: dict | None = None, arrange: bool = False,
                     pauses: list | None = None):
    """Async generator yielding SSE bytes while the CLI slices."""
    # Apply the UI's slice overrides by merging them into process/filament
    # preset copies (the CLI has no per-key override flags). Without this, every
    # slice would silently use the raw profile defaults.
    applied: list[str] = []
    if overrides:
        process, filaments, applied = apply_overrides(
            overrides, process, filaments, job_dir)
    for line in applied:
        yield _sse("progress", {"stage": "settings", "pct": 35,
                                "message": line, "job_id": job_id})

    load_settings = f"{machine};{process}"
    # NOTE: no --export-3mf. Adding it makes the CLI attempt a
    # boost::filesystem::create_directories that fails ("Invalid argument") and
    # aborts before the gcode is renamed from plate_1.gcode.tmp. --slice 0 with
    # --outputdir writes plate_1.gcode directly, which is all we need.
    cmd = [ENGINE_BIN, "--slice", "0"]
    if arrange:
        # Position (and, for multiple objects, spread) models on the plate.
        cmd += ["--arrange", "1", "--ensure-on-bed"]
    cmd += [
        "--load-settings", load_settings,
        "--load-filaments", ";".join(filaments),
        "--outputdir", job_dir,
        model_3mf,
    ]
    env = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":99"))

    yield _sse("progress", {"stage": "slicing", "pct": 40, "job_id": job_id})

    # Launch the engine as a tracked subprocess so job_cancel can terminate it
    # (cwd MUST be the writable job dir — the engine calls create_directories on
    # a path relative to cwd, which fails on the read-only rootfs).
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, env=env, cwd=job_dir)
    _PROCS[job_id] = proc

    started = time.monotonic()
    pct = 40
    try:
        while proc.poll() is None:
            await asyncio.sleep(2.0)
            if time.monotonic() - started > SLICE_TIMEOUT_S:
                _kill_proc(proc)
                yield _sse("error", {"message": "Slice timed out",
                                     "code": "ERR_SLICE_TIMEOUT", "job_id": job_id})
                return
            pct = min(90, pct + 3)
            yield _sse("progress", {"stage": "slicing", "pct": pct, "job_id": job_id})
    finally:
        _PROCS.pop(job_id, None)

    if getattr(proc, "_ncprint_cancelled", False):
        yield _sse("error", {"message": "Slice cancelled",
                             "code": "ERR_CANCELLED", "job_id": job_id})
        return

    stdout, stderr = "", ""
    try:
        stdout, stderr = proc.communicate(timeout=5)
    except Exception:  # noqa: BLE001
        pass

    # The CLI writes plate_1.gcode to outputdir even when the final .gcode.3mf
    # packaging step fails (-13). Success = a non-empty gcode file exists.
    gcode = os.path.join(job_dir, "plate_1.gcode")
    if not os.path.exists(gcode):
        cand = [f for f in os.listdir(job_dir) if f.endswith(".gcode")]
        gcode = os.path.join(job_dir, cand[0]) if cand else ""

    if gcode and os.path.exists(gcode) and os.path.getsize(gcode) > 0:
        # Post-process: inject pause / filament-change commands at requested
        # heights (the engine has no preset key for this).
        pauses_applied = 0
        if pauses:
            try:
                pauses_applied = inject_pauses(gcode, pauses)
            except Exception as exc:  # noqa: BLE001
                print(f"[slice {job_id}] pause injection failed: {exc}", flush=True)
        meta = _read_gcode_meta(gcode)
        # Per-feature filament (model vs support) + support-time share, which the
        # gcode footer doesn't provide — feeds the app's cost/material breakdown.
        breakdown = compute_breakdown(gcode)
        est_s = meta.get("estimated_time_s")
        support_time_s = None
        if breakdown.get("support_time_frac") and est_s:
            support_time_s = int(round(est_s * breakdown["support_time_frac"]))
        _JOBS[job_id] = {"gcode": gcode, "meta": meta, "created": time.monotonic()}
        yield _sse("done", {
            "ok": True,
            "job_id": job_id,
            "gcode_size": os.path.getsize(gcode),
            "estimated_time_s": est_s,
            "filament_used_g": meta.get("filament_used_g"),
            "model_filament_g": breakdown.get("model_filament_g"),
            "support_filament_g": breakdown.get("support_filament_g"),
            "support_time_s": support_time_s,
            "pauses_applied": pauses_applied,
        })
        return

    # Failure. Log the engine detail server-side; return a generic reason plus
    # the engine's own result.json error_string (safe, user-facing) if present.
    detail = (stderr or stdout or "").strip()
    if detail:
        print(f"[slice {job_id}] engine failed: {detail[-500:]}", flush=True)
    message = "Slicing failed"
    rj = os.path.join(job_dir, "result.json")
    if os.path.exists(rj):
        try:
            with open(rj) as fh:
                es = json.load(fh).get("error_string")
            if es:
                message = str(es)
        except Exception:  # noqa: BLE001
            pass
    yield _sse("error", {"message": message, "code": "ERR_SLICE_FAILED",
                         "job_id": job_id})


def _parse_duration(text: str) -> int | None:
    """'16m 29s' / '1h 2m 3s' / '0.49s' → seconds."""
    total = 0.0
    found = False
    num = ""
    for ch in text:
        if ch.isdigit() or ch == ".":
            num += ch
        elif ch in "hms" and num:
            val = float(num)
            total += val * {"h": 3600, "m": 60, "s": 1}[ch]
            num = ""
            found = True
    return int(round(total)) if found else None


def _read_gcode_meta(path: str) -> dict:
    """Pull estimated time (s) + filament grams from the gcode footer comments."""
    meta: dict = {}
    grams = None
    cm3 = None
    try:
        # The estimate/filament summary sits in a large config block near the
        # end but can be ~20-40KB before EOF; read a generous tail.
        with open(path, "rb") as fh:
            fh.seek(max(0, os.path.getsize(path) - 131072))
            tail = fh.read().decode("ascii", "ignore")
    except Exception:  # noqa: BLE001
        return meta
    for line in tail.splitlines():
        low = line.lower()
        if "estimated printing time" in low and "first layer" not in low:
            meta["estimated_time_s"] = _parse_duration(line.split("=", 1)[-1])
        elif "filament used [g]" in low:
            try:
                grams = float(line.split("=", 1)[-1].strip())
            except Exception:  # noqa: BLE001
                pass
        elif "filament used [cm3]" in low:
            try:
                cm3 = float(line.split("=", 1)[-1].strip())
            except Exception:  # noqa: BLE001
                pass
    # Prefer grams; fall back to cm3 × typical PLA density (1.24) when the
    # preset's filament density was 0 (grams reported as 0).
    if grams and grams > 0:
        meta["filament_used_g"] = [round(grams, 2)]
    elif cm3:
        meta["filament_used_g"] = [round(cm3 * 1.24, 2)]
    return meta


@app.post("/api/slice/stream")
@app.post("/api/slice")
async def slice_stream(request: Request) -> Response:
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type.lower():
        return JSONResponse({"error": "bad_request",
                             "message": "expected multipart/form-data"}, 400)

    fields = _parse_multipart(content_type, body)
    if not fields["model"]:
        return JSONResponse({"error": "no_model", "message": "model part missing"}, 400)

    # Concurrency guard: acquire a slice slot without waiting. If none is free,
    # fail fast with 503 rather than letting engine processes pile up and
    # exhaust CPU/RAM. The slot is released in _full_stream's finally.
    try:
        await asyncio.wait_for(_slice_slots.acquire(), timeout=0.01)
    except asyncio.TimeoutError:
        return JSONResponse(
            {"error": "too_many_jobs",
             "message": f"slicer busy (max {MAX_CONCURRENT_SLICES} concurrent). Retry shortly."},
            503)

    job_id = uuid.uuid4().hex[:16]
    job_dir = os.path.join(JOB_ROOT, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # Errors before the stream starts are returned as an SSE error stream so the
    # frontend's reader handles them uniformly.
    async def _error_stream(message: str, code: str):
        yield _sse("error", {"message": message, "code": code, "job_id": job_id})

    # 1. STL → 3MF (engine can't load STL). Multiple models → one multi-object
    # 3MF, arranged on the plate by the engine.
    model_3mf = os.path.join(job_dir, "model.3mf")
    models = fields["models"] or [fields["model"]]
    multi = len(models) > 1
    do_arrange = multi or fields["arrange"]
    try:
        if multi:
            stls_to_multiobject_3mf(
                models, model_3mf,
                object_overrides=fields.get("object_overrides") or None)
        else:
            stl_bytes_to_3mf(models[0], model_3mf)
    except Exception as exc:  # noqa: BLE001
        _slice_slots.release()
        # "too large" carries an actionable, safe hint; anything else is scrubbed
        # to a generic message (details logged server-side, not sent to browser).
        if "too large" in str(exc):
            return StreamingResponse(_error_stream(str(exc), "ERR_MESH_TOO_LARGE"),
                                     media_type="text/event-stream")
        print(f"[slice] model conversion failed: {exc}", flush=True)
        return StreamingResponse(_error_stream(
            "Could not read the model — export a clean STL/3MF and retry.",
            "ERR_MODEL_CONVERT"), media_type="text/event-stream")

    # 2. Resolve a compatible preset triple. resolve_triple's ValueErrors are
    # user-actionable ("no process compatible with <printer>"), so pass them
    # through; unexpected errors are scrubbed.
    try:
        machine, process, filaments, warnings = resolve_triple(
            _index(), fields["printer_id"], fields["process_id"],
            fields["filament_ids"])
    except ValueError as exc:
        _slice_slots.release()
        return StreamingResponse(_error_stream(str(exc), "ERR_PRESET_RESOLVE"),
                                 media_type="text/event-stream")
    except Exception as exc:  # noqa: BLE001
        _slice_slots.release()
        print(f"[slice] preset resolve failed: {exc}", flush=True)
        return StreamingResponse(_error_stream(
            "Invalid printer/filament/process selection.", "ERR_PRESET_RESOLVE"),
            media_type="text/event-stream")

    async def _full_stream():
        try:
            yield _sse("progress", {"stage": "preparing", "pct": 10, "job_id": job_id})
            for w in warnings:
                yield _sse("progress", {"stage": "warning", "pct": 12,
                                        "message": w, "job_id": job_id})
            yield _sse("progress", {"stage": "loading_model", "pct": 25,
                                    "job_id": job_id})
            async for chunk in _run_slice(job_id, job_dir, model_3mf,
                                          machine, process, filaments,
                                          fields.get("overrides"),
                                          arrange=do_arrange,
                                          pauses=fields.get("pauses")):
                yield chunk
        finally:
            _slice_slots.release()

    return StreamingResponse(
        _full_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate",
                 "X-Accel-Buffering": "no"},
    )


@app.api_route("/api/jobs/{job_id}/gcode", methods=["GET", "HEAD"])
async def job_gcode(job_id: str, request: Request) -> Response:
    job = _JOBS.get(job_id)
    if not job or not os.path.exists(job["gcode"]):
        return JSONResponse({"error": "not_found", "message": "gcode not available"}, 404)
    path = job["gcode"]
    size = os.path.getsize(path)
    if request.method == "HEAD":
        return Response(status_code=200, headers={
            "Content-Length": str(size), "Accept-Ranges": "bytes",
            "Content-Type": "text/plain; charset=utf-8"})
    # Honour a simple Range (slicer-api.js probes bytes=0-0).
    rng = request.headers.get("range")
    with open(path, "rb") as fh:
        if rng and rng.startswith("bytes="):
            try:
                start_s, end_s = rng[6:].split("-", 1)
                start = int(start_s or 0)
                end = int(end_s) if end_s else size - 1
                end = min(end, size - 1)
                fh.seek(start)
                data = fh.read(end - start + 1)
                return Response(data, status_code=206, headers={
                    "Content-Range": f"bytes {start}-{end}/{size}",
                    "Accept-Ranges": "bytes",
                    "Content-Type": "text/plain; charset=utf-8"})
            except Exception:  # noqa: BLE001
                fh.seek(0)
        data = fh.read()
    return Response(data, media_type="text/plain")


@app.get("/api/calibration/list")
async def calibration_list() -> JSONResponse:
    """Catalog of calibration prints: engine-sliced (shipped models + temp tower)
    plus the procedural G-code generators (retract/flow/PA/first-layer/etc.)."""
    return JSONResponse({
        "calibrations": list_calibrations(),
        "generators": list_gcode_calibrations(),
    })


@app.post("/api/calibration/generate")
async def calibration_generate(request: Request) -> JSONResponse:
    """Generate a calibration print's G-code directly (no slice engine).

    Body: {type, params}. Writes the gcode to a job dir and returns metadata +
    the job_id so the frontend downloads it via GET /api/jobs/{id}/gcode and can
    Save-to-Files / Send-to-printer through the usual flow.
    """
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    ctype = str(payload.get("type", ""))
    params = payload.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    try:
        result = calib_generate(ctype, params)
    except ValueError as exc:
        return JSONResponse({"error": "bad_calibration", "message": str(exc)}, 400)
    except Exception as exc:  # noqa: BLE001
        print(f"[calibration generate {ctype}] failed: {exc}", flush=True)
        return JSONResponse({"error": "generate_failed",
                             "message": "Could not generate calibration"}, 500)

    job_id = uuid.uuid4().hex[:16]
    job_dir = os.path.join(JOB_ROOT, job_id)
    os.makedirs(job_dir, exist_ok=True)
    gcode_path = os.path.join(job_dir, "plate_1.gcode")
    with open(gcode_path, "w", encoding="ascii", errors="ignore") as fh:
        fh.write(result["gcode"])
    _JOBS[job_id] = {"gcode": gcode_path, "meta": {}, "created": time.monotonic()}
    return JSONResponse({
        "ok": True,
        "job_id": job_id,
        "name": result["name"],
        "description": result["description"],
        "type": result["type"],
        "expected_minutes": result.get("expected_minutes"),
        "filament_g": result.get("filament_g"),
        "gcode_size": os.path.getsize(gcode_path),
    })


@app.get("/api/materials")
async def materials_list(request: Request) -> JSONResponse:
    """Filament material reference database (15 common materials).

    Optional ?category= filters to one of: standard, engineering, composite,
    flexible, specialty, support. Data-only — no slicing.
    """
    category = request.query_params.get("category")
    materials = get_materials_by_category(category) if category else get_all_materials()
    return JSONResponse({"materials": materials, "count": len(materials)})


@app.get("/api/materials/{material_id}")
async def material_detail(material_id: str) -> JSONResponse:
    """A single material's full reference entry, or 404 if unknown."""
    m = get_material_by_id(material_id)
    if not m:
        return JSONResponse({"error": "not_found",
                             "message": f"unknown material '{material_id}'"}, 404)
    return JSONResponse(m)


@app.post("/api/color-order")
async def color_order(request: Request) -> JSONResponse:
    """Recommend the filament color load order that minimises total purge.

    Body: {colors: ["#RRGGBB", ...], density?: g/cm3}. Returns the optimised
    cyclic order + orderedColors (with basic names) + purge saved vs
    load-as-listed. Pure math — no slicing, no side effects.
    """
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    colors = payload.get("colors")
    if not isinstance(colors, list):
        return JSONResponse({"error": "bad_request",
                             "message": "colors must be an array of #RRGGBB strings"}, 400)
    colors = [str(c) for c in colors]
    if len(colors) > 32:
        return JSONResponse({"error": "too_many_colors",
                             "message": "at most 32 colors"}, 400)
    density = payload.get("density")
    try:
        density = float(density) if density is not None else 1.24
    except (TypeError, ValueError):
        density = 1.24
    result = optimize_color_order(colors, density)
    result["names"] = [basic_color_name(c) for c in result["orderedColors"]]
    return JSONResponse(result)


@app.post("/api/gcode/lint")
async def gcode_lint(request: Request) -> JSONResponse:
    """Static-analysis lint of g-code. Body: {job_id} to lint a sliced job's
    gcode, or {text} for raw source; optional {firmware}. Returns
    {issues, stats}."""
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    firmware = str(payload.get("firmware", "auto"))
    text = payload.get("text")
    if not text:
        job_id = str(payload.get("job_id", ""))
        job = _JOBS.get(job_id)
        if not job or not os.path.exists(job["gcode"]):
            return JSONResponse({"error": "not_found",
                                 "message": "no gcode for that job_id"}, 404)
        try:
            with open(job["gcode"], encoding="ascii", errors="ignore") as fh:
                text = fh.read()
        except Exception:  # noqa: BLE001
            return JSONResponse({"error": "read_failed",
                                 "message": "could not read gcode"}, 500)
    if not isinstance(text, str) or not text.strip():
        return JSONResponse({"error": "bad_request",
                             "message": "provide job_id or non-empty text"}, 400)
    return JSONResponse(lint_gcode(text, firmware))


@app.get("/api/gcode/reference")
async def gcode_reference(request: Request) -> JSONResponse:
    """G-code reference. ?code=M104 → one entry; ?q=/&category=/&firmware= →
    filtered list; no params → the whole table."""
    code = request.query_params.get("code")
    if code:
        entry = get_reference(code)
        if not entry:
            return JSONResponse({"error": "not_found", "message": f"unknown code {code}"}, 404)
        return JSONResponse(entry)
    q = request.query_params.get("q", "")
    category = request.query_params.get("category", "")
    firmware = request.query_params.get("firmware", "")
    if q or category or firmware:
        return JSONResponse({"reference": search_reference(q, category, firmware)})
    return JSONResponse({"reference": list_reference()})


@app.get("/api/printer-presets")
async def printer_presets(request: Request) -> JSONResponse:
    """Static printer model presets. ?vendor=&model= → one; ?vendor= → vendor
    list; none → all + the capability vocabulary."""
    vendor = request.query_params.get("vendor", "")
    model = request.query_params.get("model", "")
    if vendor and model:
        p = find_printer_preset(vendor, model)
        if not p:
            return JSONResponse({"error": "not_found",
                                 "message": f"no preset for {vendor} {model}"}, 404)
        return JSONResponse(p)
    if vendor:
        return JSONResponse({"presets": list_printer_presets_for_vendor(vendor)})
    return JSONResponse({"presets": list_all_presets(),
                         "capabilities": list_all_capabilities()})


@app.post("/api/calibration/{calib_id}/slice")
async def calibration_slice(calib_id: str, request: Request) -> Response:
    """Slice a calibration model by id against the chosen printer.

    Body (JSON, all optional except printer_id): {printer_id, process_id,
    filament_ids, overrides, params}. Reuses the normal slice pipeline.
    """
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    printer_id = payload.get("printer_id", "")
    if not printer_id:
        return JSONResponse({"error": "no_printer",
                             "message": "printer_id required"}, 400)
    # calib_id is used to build file paths — constrain it before any use.
    if not re.fullmatch(r"[A-Za-z0-9_]+", calib_id or ""):
        return JSONResponse({"error": "bad_calibration",
                             "message": "invalid calibration id"}, 400)

    try:
        await asyncio.wait_for(_slice_slots.acquire(), timeout=0.01)
    except asyncio.TimeoutError:
        return JSONResponse({"error": "too_many_jobs",
                             "message": "slicer busy"}, 503)

    job_id = uuid.uuid4().hex[:16]
    job_dir = os.path.join(JOB_ROOT, job_id)
    os.makedirs(job_dir, exist_ok=True)
    model_3mf = os.path.join(job_dir, "calib.3mf")
    tower_meta = None

    # Resolve the model: a shipped 3MF (copied in) or a generated tower.
    shipped = shipped_model_path(calib_id)
    try:
        if shipped:
            shutil.copyfile(shipped, model_3mf)
        elif calib_id == "temp_tower":
            p = payload.get("params") or {}
            tower_meta = generate_temp_tower_3mf(
                model_3mf,
                temp_start=int(p.get("temp_start", 220)),
                temp_end=int(p.get("temp_end", 190)),
                step=int(p.get("step", 5)))
        else:
            _slice_slots.release()
            return JSONResponse({"error": "unknown_calibration",
                                 "message": "unknown calibration"}, 404)
    except FileNotFoundError:
        # Shipped model listed but missing (race / trimmed image).
        _slice_slots.release()
        return JSONResponse({"error": "calibration_unavailable",
                             "message": "Calibration model unavailable"}, 404)
    except Exception as exc:  # noqa: BLE001
        _slice_slots.release()
        print(f"[calibration {calib_id}] model prep failed: {exc}", flush=True)
        return JSONResponse({"error": "model_prep_failed",
                             "message": "Could not prepare the calibration model"}, 500)

    try:
        machine, process, filaments, warnings = resolve_triple(
            _index(), printer_id, payload.get("process_id", ""),
            payload.get("filament_ids", []))
    except ValueError as exc:
        _slice_slots.release()
        return JSONResponse({"error": "preset_resolve", "message": str(exc)}, 400)

    async def _stream():
        try:
            yield _sse("progress", {"stage": "calibration", "pct": 10,
                                    "job_id": job_id, "calibration": calib_id})
            if tower_meta:
                yield _sse("progress", {"stage": "tower", "pct": 15,
                                        "message": f"{len(tower_meta['steps'])} steps",
                                        "job_id": job_id})
            async for chunk in _run_slice(job_id, job_dir, model_3mf,
                                          machine, process, filaments,
                                          payload.get("overrides")):
                yield chunk
        finally:
            _slice_slots.release()

    return StreamingResponse(_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/mesh/analyze")
async def mesh_analyze(request: Request) -> JSONResponse:
    """Mesh health report for an uploaded STL (raw octet-stream or multipart).

    Lets the UI warn about non-watertight / degenerate meshes before slicing.
    """
    body = await request.body()
    if not body:
        return JSONResponse({"error": "no_model", "message": "empty body"}, 400)
    content_type = request.headers.get("content-type", "").lower()
    stl = body
    if "multipart/form-data" in content_type:
        parsed = _parse_multipart(request.headers.get("content-type", ""), body)
        if not parsed["model"]:
            return JSONResponse({"error": "no_model", "message": "model part missing"}, 400)
        stl = parsed["model"]
    try:
        report = await asyncio.get_event_loop().run_in_executor(None, analyze_stl, stl)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": "analyze_failed", "message": str(exc)}, 500)
    return JSONResponse(report)


@app.get("/api/jobs/{job_id}/toolpath")
async def job_toolpath(job_id: str) -> Response:
    """3D toolpath geometry parsed from the job's gcode (feature-typed layers).

    Parsed lazily on first request and cached on the job so repeated scrubbing
    doesn't re-parse. Returns the contract src/services/toolpath-3d.js expects.
    """
    job = _JOBS.get(job_id)
    if not job or not os.path.exists(job["gcode"]):
        return JSONResponse({"error": "not_found", "message": "gcode not available"}, 404)
    if "toolpath" not in job:
        try:
            job["toolpath"] = await asyncio.get_event_loop().run_in_executor(
                None, parse_toolpath, job["gcode"])
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"error": "parse_failed", "message": str(exc)}, 500)
    return JSONResponse(job["toolpath"])


@app.post("/api/jobs/{job_id}/cancel")
async def job_cancel(job_id: str) -> JSONResponse:
    """Cancel a job: terminate its running engine process (freeing the slice
    slot via the stream's finally), then clean up. Terminating first avoids the
    race of rmtree'ing a directory the engine is still writing to."""
    proc = _PROCS.get(job_id)
    killed = False
    if proc is not None and proc.poll() is None:
        proc._ncprint_cancelled = True  # signal the stream loop
        await asyncio.get_event_loop().run_in_executor(None, _kill_proc, proc)
        killed = True
    _JOBS.pop(job_id, None)
    # Only remove the dir once no live process is writing to it.
    if job_id not in _PROCS or (proc is not None and proc.poll() is not None):
        shutil.rmtree(os.path.join(JOB_ROOT, job_id), ignore_errors=True)
    return JSONResponse({"ok": True, "killed": killed})


# ── Pass-through (profiles, printers, version, single profile, …) ─────────

@app.api_route("/api/{path:path}",
               methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
async def catch_all(path: str, request: Request) -> Response:
    url = f"{ENGINE_BASE}/api/{path}"
    body = await request.body()
    async with httpx.AsyncClient(timeout=_QUICK_TIMEOUT) as client:
        try:
            upstream = await client.request(
                request.method, url,
                headers=_clean_headers(request.headers),
                params=request.query_params,
                content=body if body else None)
        except httpx.ConnectError:
            return JSONResponse({"error": "engine_unreachable",
                                 "message": "nc-print slicer engine unreachable"}, 502)
        except httpx.HTTPError as exc:
            return JSONResponse({"error": "engine_error", "message": str(exc)}, 502)
    return Response(content=upstream.content, status_code=upstream.status_code,
                    headers=_clean_headers(upstream.headers),
                    media_type=upstream.headers.get("content-type"))
