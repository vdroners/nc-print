#!/usr/bin/env python3
"""NC 3D Print / Moonraker client for Alfred shell-direct scripts.

Primary backend for the Forge→NC Print port (Wave 1). Talks Moonraker-direct
for printer state and reaches nc-print-slicer for health (container DNS via
docker inspect, or NC_PRINT_SLICER_URL). Forge Studio is optional fallback
only when NC_PRINT_USE_FORGE_FALLBACK=1.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlencode


def _env(name: str, *aliases: str, default: str = "") -> str:
    for key in (name, *aliases):
        val = os.environ.get(key)
        if val is not None and str(val).strip() != "":
            return str(val).strip()
    return default


def moonraker_url() -> str:
    return _env(
        "NC_PRINT_MOONRAKER_URL",
        "FORGE_MOONRAKER_URL",
        default="http://10.0.0.210:7125",
    ).rstrip("/")


def printer_id() -> str:
    return _env("NC_PRINT_PRINTER_ID", "FORGE_PRINTER_ID", default="k1-max")


def printer_name() -> str:
    return _env(
        "NC_PRINT_PRINTER_NAME",
        "FORGE_PRINTER_NAME",
        default="K1Max-Printy-Baby",
    )


def dashboard_url() -> str:
    return _env(
        "NC_PRINT_DASHBOARD_URL",
        "FORGE_DASHBOARD_URL",
        default="https://cloud-vdroners.ddns.net/apps/nc_print/",
    )


def use_forge_fallback() -> bool:
    return _env("NC_PRINT_USE_FORGE_FALLBACK", "FORGE_FALLBACK", default="0") in (
        "1",
        "true",
        "yes",
    )


def _http_json(url: str, timeout: int = 10) -> tuple[int, Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as e:
        code = e.code
        raw = e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}

    if not raw.strip():
        return code, {}
    try:
        return code, json.loads(raw)
    except json.JSONDecodeError:
        return code, {"raw": raw}


def _moonraker_get(path: str, timeout: int = 10) -> tuple[int, Any]:
    base = moonraker_url()
    if not path.startswith("/"):
        path = "/" + path
    return _http_json(base + path, timeout=timeout)


def resolve_slicer_base() -> str:
    explicit = _env("NC_PRINT_SLICER_URL", default="")
    if explicit:
        return explicit.rstrip("/")
    # Discover container IP on nc-print-net (no host port published).
    try:
        out = subprocess.check_output(
            [
                "docker",
                "inspect",
                "-f",
                "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
                "nc-print-slicer",
            ],
            timeout=5,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out:
            return f"http://{out}:8080"
    except Exception:  # noqa: BLE001
        pass
    return "http://172.18.0.2:8080"


def get_moonraker_info() -> tuple[int, Any]:
    return _moonraker_get("/server/info")


def get_printer_objects() -> tuple[int, Any]:
    q = urlencode(
        {
            "print_stats": "",
            "display_status": "",
            "virtual_sdcard": "",
            "extruder": "",
            "heater_bed": "",
            "webhooks": "",
        }
    )
    # Moonraker accepts objects as repeated query keys; use path form that works:
    path = (
        "/printer/objects/query"
        "?print_stats&display_status&virtual_sdcard&extruder&heater_bed&webhooks"
    )
    return _moonraker_get(path)


def get_job_queue() -> tuple[int, Any]:
    return _moonraker_get("/server/job_queue/status")


def slicer_health() -> tuple[int, Any]:
    base = resolve_slicer_base()
    return _http_json(f"{base}/api/health", timeout=5)


def normalize_print_state(objects_payload: dict) -> dict[str, Any]:
    """Map Moonraker objects/query → Alfred status dict."""
    out: dict[str, Any] = {
        "online": False,
        "status": "unknown",
        "filename": "",
        "progress": None,
        "bed_temp": None,
        "nozzle_temp": None,
        "bed_target": None,
        "nozzle_target": None,
    }
    if not isinstance(objects_payload, dict):
        return out

    result = objects_payload.get("result") or objects_payload
    status = result.get("status") if isinstance(result, dict) else None
    if not isinstance(status, dict):
        # Already flattened
        status = objects_payload if "print_stats" in objects_payload else {}

    ps = status.get("print_stats") or {}
    ds = status.get("display_status") or {}
    vs = status.get("virtual_sdcard") or {}
    ex = status.get("extruder") or {}
    bed = status.get("heater_bed") or {}
    wh = status.get("webhooks") or {}

    state = str(ps.get("state") or "unknown").lower()
    # Map Moonraker → Forge-ish vocabulary Alfred monitor already understands.
    mapping = {
        "standby": "standby",
        "printing": "printing",
        "paused": "paused",
        "complete": "complete",
        "cancelled": "cancelled",
        "error": "error",
    }
    out["status"] = mapping.get(state, state)
    out["filename"] = str(ps.get("filename") or "")
    prog = ds.get("progress")
    if prog is None:
        prog = vs.get("progress")
    if prog is not None:
        try:
            p = float(prog)
            out["progress"] = p * 100.0 if p <= 1.0 else p
        except (TypeError, ValueError):
            pass

    if bed.get("temperature") is not None:
        out["bed_temp"] = round(float(bed["temperature"]), 1)
    if bed.get("target") is not None:
        out["bed_target"] = round(float(bed["target"]), 1)
    if ex.get("temperature") is not None:
        out["nozzle_temp"] = round(float(ex["temperature"]), 1)
    if ex.get("target") is not None:
        out["nozzle_target"] = round(float(ex["target"]), 1)

    # online if webhooks state is ready or we got print_stats at all
    wh_state = str(wh.get("state") or "").lower()
    out["online"] = wh_state in ("ready", "startup", "") or bool(ps)
    if wh_state == "shutdown" or wh_state == "error":
        out["online"] = False
    return out


def get_printers() -> tuple[int, Any]:
    """Synthetic single-printer list matching Forge shape for monitor/dispatch."""
    code, info = get_moonraker_info()
    online = "online" if code == 200 else "offline"
    if code == 0:
        online = "nc_down"
    pid = printer_id()
    return 200 if code in (200, 0) else code, [
        {
            "id": pid,
            "name": printer_name(),
            "state": online,
            "status": online,
            "moonraker_url": moonraker_url(),
        }
    ]


def get_printer_state(pid: str | None = None) -> tuple[int, Any]:
    code, raw = get_printer_objects()
    st = normalize_print_state(raw if isinstance(raw, dict) else {})
    # Wrap like Forge /state for normalize_print_state in forge_api shim.
    payload = {
        "printer_id": pid or printer_id(),
        "print": {
            "state": st.get("status"),
            "status": st.get("status"),
            "filename": st.get("filename"),
            "progress": st.get("progress"),
            "bed_temp": st.get("bed_temp"),
            "nozzle_temp": st.get("nozzle_temp"),
        },
        "online": st.get("online"),
        "raw": st,
    }
    return code, payload


def get_telemetry(pid: str | None = None) -> tuple[int, Any]:
    return get_printer_state(pid)


def get_slicer_status() -> tuple[int, Any]:
    code, health = slicer_health()
    ok = isinstance(health, dict) and health.get("ok") is True
    return code, {
        "ok": ok,
        "probe": {"ok": ok, "source": "nc-print-slicer"},
        "health": health,
    }


def get_moonraker_queue(pid: str | None = None) -> tuple[int, Any]:
    code, data = get_job_queue()
    if code != 200:
        return code, data
    # Normalize to {queue: [...]}
    result = data.get("result") if isinstance(data, dict) else None
    queued = []
    if isinstance(result, dict):
        queued = result.get("queued_jobs") or result.get("queue") or []
    return code, {"queue": queued, "raw": data}


def slicer_health_direct() -> tuple[int, Any]:
    return slicer_health()


def summarize_status() -> str:
    pid = printer_id()
    name = printer_name()
    code_p, printers = get_printers()
    online = "offline"
    if code_p == 200 and isinstance(printers, list):
        for p in printers:
            if str(p.get("id")) == pid:
                name = str(p.get("name") or name)
                online = str(p.get("state") or "offline").lower()
                break

    code_s, state_raw = get_printer_state(pid)
    st = (state_raw or {}).get("raw") if isinstance(state_raw, dict) else {}
    if not st and isinstance(state_raw, dict):
        print_block = state_raw.get("print") or {}
        st = {
            "status": print_block.get("state"),
            "filename": print_block.get("filename"),
            "progress": print_block.get("progress"),
            "bed_temp": print_block.get("bed_temp"),
            "nozzle_temp": print_block.get("nozzle_temp"),
            "online": online == "online",
        }

    status = st.get("status") or online
    lines = [f"[nc_print] {name} — {online if status == 'unknown' else status}"]
    if st.get("filename"):
        prog = st.get("progress")
        prog_s = f" ({int(prog)}%)" if prog is not None else ""
        lines[0] = f"[nc_print] {name} — {status}{prog_s}"
        lines.append(f"File: {st['filename']}")
    if st.get("bed_temp") is not None or st.get("nozzle_temp") is not None:
        bed = st.get("bed_temp", "?")
        nozzle = st.get("nozzle_temp", "?")
        lines.append(f"Bed {bed}°C / Nozzle {nozzle}°C")
    if code_s == 0:
        lines.append("(Moonraker unreachable)")
    lines.append(dashboard_url())
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    cmd = (sys.argv[1] if len(sys.argv) > 1 else "status").strip().lower()
    if cmd == "status":
        print(summarize_status())
    elif cmd == "printers":
        print(json.dumps(get_printers()[1], indent=2))
    elif cmd == "state":
        print(json.dumps(get_printer_state()[1], indent=2))
    elif cmd == "slicer":
        print(json.dumps(get_slicer_status()[1], indent=2))
    elif cmd == "queue":
        print(json.dumps(get_moonraker_queue()[1], indent=2))
    else:
        print(f"unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)
