#!/usr/bin/env python3
"""Alfred print API — NC Print / Moonraker first (Forge optional fallback).

Wave 1 of docs/plans/forge-port.md. Prefer nc_print_api; set
NC_PRINT_USE_FORGE_FALLBACK=1 to keep hitting Forge Studio :3040.
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Any

import nc_print_api as nc


def _use_nc() -> bool:
    # Default ON — Forge fallback only when explicitly enabled.
    flag = (os.environ.get("NC_PRINT_BACKEND") or "1").strip().lower()
    if flag in ("0", "false", "no", "forge"):
        return False
    if nc.use_forge_fallback() and flag in ("auto",):
        return True
    return flag not in ("0", "false", "no", "forge")


def _api_url(path: str) -> str:
    base = (os.environ.get("FORGE_API_URL") or "https://127.0.0.1:3040").rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return base + path


def _headers() -> dict[str, str]:
    key = (os.environ.get("FORGE_API_KEY") or "").strip()
    hdrs = {"Accept": "application/json"}
    if key:
        hdrs["Authorization"] = f"Bearer {key}"
    return hdrs


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    host = os.environ.get("FORGE_API_URL", "")
    if "127.0.0.1" in host or "localhost" in host:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def forge_request(method: str, path: str, body: dict | None = None, timeout: int = 20) -> tuple[int, Any]:
    """Legacy Forge REST. Used only when NC backend is off or fallback is forced."""
    url = _api_url(path)
    data = None
    hdrs = _headers()
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as e:
        code = e.code
        raw = e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}

    if not raw.strip():
        return code, {}
    try:
        return code, json.loads(raw)
    except json.JSONDecodeError:
        return code, {"raw": raw}


def printer_id() -> str:
    return nc.printer_id()


def get_printers() -> tuple[int, Any]:
    if _use_nc():
        code, data = nc.get_printers()
        if code == 200 or not nc.use_forge_fallback():
            return code, data
    return forge_request("GET", "/api/printers")


def get_printer_state(pid: str | None = None) -> tuple[int, Any]:
    if _use_nc():
        code, data = nc.get_printer_state(pid)
        if code == 200 or not nc.use_forge_fallback():
            return code, data
    pid = pid or printer_id()
    return forge_request("GET", f"/api/printers/{pid}/state")


def get_telemetry(pid: str | None = None) -> tuple[int, Any]:
    if _use_nc():
        return nc.get_telemetry(pid)
    pid = pid or printer_id()
    return forge_request("GET", f"/api/telemetry?printer_id={pid}")


def get_slicer_status() -> tuple[int, Any]:
    if _use_nc():
        code, data = nc.get_slicer_status()
        if (isinstance(data, dict) and data.get("ok")) or not nc.use_forge_fallback():
            return code, data
    return forge_request("GET", "/api/slicer/forge/status?force=1")


def get_moonraker_queue(pid: str | None = None) -> tuple[int, Any]:
    if _use_nc():
        code, data = nc.get_moonraker_queue(pid)
        if code == 200 or not nc.use_forge_fallback():
            return code, data
    pid = pid or printer_id()
    return forge_request("GET", f"/api/printers/{pid}/moonraker/queue")


def slicer_health_direct() -> tuple[int, Any]:
    if _use_nc():
        code, data = nc.slicer_health_direct()
        if (isinstance(data, dict) and data.get("ok")) or not nc.use_forge_fallback():
            return code, data
    url = "http://127.0.0.1:8766/api/health"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.getcode(), json.loads(resp.read().decode())
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


def normalize_print_state(state_payload: dict) -> dict[str, Any]:
    """Extract useful fields from /state response (NC-wrapped or Forge)."""
    out: dict[str, Any] = {
        "online": False,
        "status": "unknown",
        "filename": "",
        "progress": None,
        "bed_temp": None,
        "nozzle_temp": None,
    }
    if not isinstance(state_payload, dict):
        return out

    if isinstance(state_payload.get("raw"), dict):
        raw = state_payload["raw"]
        for k in out:
            if k in raw:
                out[k] = raw[k]
        if state_payload.get("printer_id"):
            out["online"] = bool(raw.get("online", True))
        return out

    print_block = state_payload.get("print") or {}
    if isinstance(print_block, dict):
        out["status"] = str(print_block.get("state") or print_block.get("status") or "unknown").lower()
        out["filename"] = str(print_block.get("filename") or print_block.get("file") or "")
        prog = print_block.get("progress") or print_block.get("print_progress")
        if prog is not None:
            try:
                out["progress"] = float(prog)
            except (TypeError, ValueError):
                pass
        bed = print_block.get("bed_temp") or print_block.get("bed_temperature")
        nozzle = print_block.get("nozzle_temp") or print_block.get("extruder_temp")
        if bed is not None:
            out["bed_temp"] = bed
        if nozzle is not None:
            out["nozzle_temp"] = nozzle

    if state_payload.get("printer_id"):
        out["online"] = True
    return out


def summarize_status() -> str:
    if _use_nc():
        return nc.summarize_status()
    # Legacy Forge formatting
    pid = printer_id()
    code_p, printers = get_printers()
    online = "offline"
    name = pid
    if code_p == 200 and isinstance(printers, list):
        for p in printers:
            if str(p.get("id")) == pid:
                name = str(p.get("name") or pid)
                online = str(p.get("state") or p.get("status") or "offline").lower()
                break

    code_s, state_raw = get_printer_state(pid)
    st = normalize_print_state(state_raw if isinstance(state_raw, dict) else {})
    if code_s == 200 and state_raw:
        st["online"] = online == "online"

    lines = [f"[forge] {name} — {online}"]
    if st.get("filename"):
        prog = st.get("progress")
        prog_s = f" ({int(prog)}%)" if prog is not None else ""
        lines[0] = f"[forge] {name} — {st.get('status', online)}{prog_s}"
        lines.append(f"File: {st['filename']}")
    if st.get("bed_temp") is not None or st.get("nozzle_temp") is not None:
        bed = st.get("bed_temp", "?")
        nozzle = st.get("nozzle_temp", "?")
        lines.append(f"Bed {bed}°C / Nozzle {nozzle}°C")
    dash = os.environ.get("FORGE_DASHBOARD_URL", "https://forge-vdroners.ddns.net")
    lines.append(dash)
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
    else:
        print(f"unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)
