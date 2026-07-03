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
import shutil
import subprocess
import time
import uuid
from email.parser import BytesParser
from email.policy import HTTP

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from mesh3mf import stl_bytes_to_3mf
from overrides import apply_overrides
from presets import PresetIndex, resolve_triple

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
    fields: dict = {"model": None, "printer_id": "", "process_id": "",
                    "filament_ids": [], "overrides": {}}
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
            fields["model"] = payload
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
        else:
            fields[name] = payload.decode(errors="replace").strip()
    return fields


def _sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


async def _run_slice(job_id: str, job_dir: str, model_3mf: str,
                     machine: str, process: str, filaments: list[str],
                     overrides: dict | None = None):
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
    cmd = [
        ENGINE_BIN, "--slice", "0",
        "--load-settings", load_settings,
        "--load-filaments", ";".join(filaments),
        "--outputdir", job_dir,
        model_3mf,
    ]
    env = dict(os.environ, DISPLAY=os.environ.get("DISPLAY", ":99"))

    yield _sse("progress", {"stage": "slicing", "pct": 40, "job_id": job_id})

    def _blocking_run() -> subprocess.CompletedProcess:
        # cwd MUST be the writable job dir: the engine calls
        # create_directories on a path relative to cwd, which fails ("Invalid
        # argument") when cwd is the read-only rootfs (/opt/adapter under uvicorn).
        return subprocess.run(cmd, capture_output=True, text=True,
                              timeout=SLICE_TIMEOUT_S, env=env, cwd=job_dir)

    # Heartbeat while the (blocking) CLI runs so the SSE stream never looks dead.
    loop = asyncio.get_event_loop()
    task = loop.run_in_executor(None, _blocking_run)
    pct = 40
    while not task.done():
        await asyncio.sleep(2.0)
        pct = min(90, pct + 3)
        yield _sse("progress", {"stage": "slicing", "pct": pct, "job_id": job_id})
    result = await task

    # The CLI writes plate_1.gcode to outputdir even when the final .gcode.3mf
    # packaging step fails (-13). Success = a non-empty gcode file exists.
    gcode = os.path.join(job_dir, "plate_1.gcode")
    if not os.path.exists(gcode):
        cand = [f for f in os.listdir(job_dir) if f.endswith(".gcode")]
        gcode = os.path.join(job_dir, cand[0]) if cand else ""

    if gcode and os.path.exists(gcode) and os.path.getsize(gcode) > 0:
        meta = _read_gcode_meta(gcode)
        _JOBS[job_id] = {"gcode": gcode, "meta": meta, "created": time.monotonic()}
        yield _sse("done", {
            "ok": True,
            "job_id": job_id,
            "gcode_size": os.path.getsize(gcode),
            "estimated_time_s": meta.get("estimated_time_s"),
            "filament_used_g": meta.get("filament_used_g"),
        })
        return

    # Failure — surface the engine's result.json error if present.
    err = (result.stderr or result.stdout or "").strip().splitlines()[-1:] or ["slice failed"]
    rj = os.path.join(job_dir, "result.json")
    if os.path.exists(rj):
        try:
            err = [json.load(open(rj)).get("error_string") or err[0]]
        except Exception:  # noqa: BLE001
            pass
    yield _sse("error", {"message": err[0], "code": "ERR_SLICE_FAILED",
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

    # 1. STL → bare 3MF (engine can't load STL).
    model_3mf = os.path.join(job_dir, "model.3mf")
    try:
        nv, nt = stl_bytes_to_3mf(fields["model"], model_3mf)
    except Exception as exc:  # noqa: BLE001
        _slice_slots.release()
        code = "ERR_MESH_TOO_LARGE" if "too large" in str(exc) else "ERR_MODEL_CONVERT"
        return StreamingResponse(_error_stream(f"model conversion failed: {exc}",
                                 code), media_type="text/event-stream")

    # 2. Resolve a compatible preset triple.
    try:
        machine, process, filaments, warnings = resolve_triple(
            _index(), fields["printer_id"], fields["process_id"],
            fields["filament_ids"])
    except ValueError as exc:
        _slice_slots.release()
        return StreamingResponse(_error_stream(str(exc), "ERR_PRESET_RESOLVE"),
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
                                          fields.get("overrides")):
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


@app.post("/api/jobs/{job_id}/cancel")
async def job_cancel(job_id: str) -> JSONResponse:
    # Single-flight CLI slices are short; best-effort cleanup only.
    job_dir = os.path.join(JOB_ROOT, job_id)
    _JOBS.pop(job_id, None)
    shutil.rmtree(job_dir, ignore_errors=True)
    return JSONResponse({"ok": True})


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
