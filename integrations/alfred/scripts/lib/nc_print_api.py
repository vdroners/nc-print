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
from datetime import datetime
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
    # print_stats carries info.current_layer / total_layer on K1; virtual_sdcard
    # carries layer / layer_count on some Klipper builds. Both are one query.
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
        "layer": None,
        "layer_count": None,
        "print_duration": None,
        "eta_s": None,
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
    # virtual_sdcard is file progress. Creality's display_status.progress can
    # sit at a stale fraction (seen 0.27 while the file was 96% done).
    prog = vs.get("progress")
    if prog is None:
        prog = ds.get("progress")
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

    info = ps.get("info") if isinstance(ps.get("info"), dict) else {}
    layer = vs.get("layer")
    if layer is None:
        layer = info.get("current_layer")
    layer_count = vs.get("layer_count")
    if layer_count is None:
        layer_count = info.get("total_layer")
    if layer is not None:
        try:
            out["layer"] = int(layer)
        except (TypeError, ValueError):
            pass
    if layer_count is not None:
        try:
            out["layer_count"] = int(layer_count)
        except (TypeError, ValueError):
            pass

    duration = ps.get("print_duration")
    if duration is None:
        duration = info.get("print_duration")
    if duration is not None:
        try:
            out["print_duration"] = float(duration)
        except (TypeError, ValueError):
            pass
    prog = out.get("progress")
    dur = out.get("print_duration")
    if prog is not None and dur is not None:
        try:
            frac = float(prog) / 100.0
            if 0.01 < frac < 0.995:
                out["eta_s"] = float(dur) * (1.0 - frac) / frac
        except (TypeError, ValueError):
            pass

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


def in_quiet_hours(spec: str | None = None, now: datetime | None = None) -> bool:
    """True during NC_PRINT_QUIET_HOURS (default 23:00-07:00, wraps midnight)."""
    if spec is None:
        spec = _env("NC_PRINT_QUIET_HOURS", "FORGE_QUIET_HOURS", default="23:00-07:00")
    if not spec or "-" not in spec:
        return False
    start_s, end_s = spec.split("-", 1)
    try:
        sh, sm = [int(x) for x in start_s.strip().split(":")]
        eh, em = [int(x) for x in end_s.strip().split(":")]
    except (ValueError, IndexError):
        return False
    clock = now or datetime.now()
    cur = clock.hour * 60 + clock.minute
    start = sh * 60 + sm
    end = eh * 60 + em
    if start <= end:
        return start <= cur < end
    return cur >= start or cur < end


def hourly_progress_enabled() -> bool:
    flag = _env("NC_PRINT_HOURLY_PROGRESS", "FORGE_HOURLY_PROGRESS", default="1").lower()
    return flag not in ("0", "false", "no", "off")


def hourly_interval_s() -> int:
    raw = _env("NC_PRINT_HOURLY_INTERVAL_S", "FORGE_HOURLY_INTERVAL_S", default="3600")
    try:
        return max(60, int(raw))
    except ValueError:
        return 3600


def milestone_percents() -> list[int]:
    """Empty NC_PRINT_MILESTONES disables milestones. Default 25,50,75."""
    if "NC_PRINT_MILESTONES" in os.environ:
        raw = os.environ.get("NC_PRINT_MILESTONES") or ""
    elif "FORGE_MILESTONES" in os.environ:
        raw = os.environ.get("FORGE_MILESTONES") or ""
    else:
        raw = "25,50,75"
    if str(raw).strip() == "":
        return []
    found: list[int] = []
    for part in str(raw).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            n = int(float(part))
        except ValueError:
            continue
        if 1 <= n <= 99:
            found.append(n)
    return sorted(set(found))


def _short_filename(name: str, limit: int = 28) -> str:
    name = (name or "").strip()
    if not name or len(name) <= limit:
        return name
    if "." in name:
        base, ext = name.rsplit(".", 1)
        room = limit - len(ext) - 2
        if room >= 4:
            return base[:room] + "…." + ext
    return name[: limit - 1] + "…"


def _fmt_temp_pair(actual: Any, target: Any) -> str | None:
    if actual is None and target is None:
        return None

    def _n(value: Any) -> str:
        if value is None:
            return "?"
        try:
            return str(int(round(float(value))))
        except (TypeError, ValueError):
            return "?"

    return f"{_n(actual)}/{_n(target)}"


def _fmt_eta(eta_s: Any) -> str | None:
    if eta_s is None:
        return None
    try:
        seconds = int(round(float(eta_s)))
    except (TypeError, ValueError):
        return None
    if seconds < 30:
        return None
    minutes = max(1, (seconds + 30) // 60)
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"~{hours}h {mins}m left"
    if hours:
        return f"~{hours}h left"
    return f"~{mins}m left"


def format_progress_line(
    st: dict,
    *,
    kind: str = "hourly",
    milestone: int | None = None,
    dashboard: str = "",
) -> str:
    """One Talk digest line. kind is hourly or milestone."""
    pct = None
    if st.get("progress") is not None:
        try:
            pct = int(round(float(st["progress"])))
        except (TypeError, ValueError):
            pct = None
    if kind == "milestone" and milestone is not None:
        head = f"Milestone {int(milestone)}%"
    elif pct is not None:
        head = f"Printing {pct}%"
    else:
        head = "Printing"
    parts = [head]
    filename = _short_filename(str(st.get("filename") or ""))
    if filename:
        parts.append(filename)
    layer = st.get("layer")
    layer_count = st.get("layer_count")
    if layer is not None or layer_count is not None:
        left = "?" if layer is None else str(int(layer))
        right = "?" if layer_count is None else str(int(layer_count))
        parts.append(f"L{left}/{right}")
    temps: list[str] = []
    nozzle = _fmt_temp_pair(st.get("nozzle_temp"), st.get("nozzle_target"))
    bed = _fmt_temp_pair(st.get("bed_temp"), st.get("bed_target"))
    if nozzle:
        temps.append(f"N{nozzle}")
    if bed:
        temps.append(f"B{bed}")
    if temps:
        parts.append(" ".join(temps))
    eta = _fmt_eta(st.get("eta_s"))
    if eta:
        parts.append(eta)
    if dashboard:
        parts.append(dashboard)
    return "[nc_print] " + " · ".join(parts)


_JOB_RESET_STATES = {"complete", "cancelled", "standby", "error", "failed", "idle", "", "unknown"}


def decide_digest(
    *,
    status: str,
    filename: str,
    st: dict,
    prev: dict | None,
    now: int,
    quiet: bool,
    hourly_enabled: bool,
    interval_s: int,
    milestones: list[int],
    post_allowed: bool = True,
    dashboard: str = "",
) -> dict[str, Any]:
    """Hourly + one milestone per tick. Quiet hours and edge alerts do not stamp."""
    prev = prev or {}
    prev_status = str(prev.get("status") or "")
    prev_file = str(prev.get("filename") or "")
    filename = filename or ""
    new_job = status == "printing" and (
        filename != prev_file or prev_status in _JOB_RESET_STATES
    )
    if new_job:
        sent: list[int] = []
        last_hourly = 0
    else:
        sent = []
        for item in prev.get("milestones_sent") or []:
            try:
                sent.append(int(item))
            except (TypeError, ValueError):
                continue
        try:
            last_hourly = int(prev.get("last_hourly_at") or 0)
        except (TypeError, ValueError):
            last_hourly = 0

    result: dict[str, Any] = {
        "post": False,
        "line": "",
        "milestones_sent": sent,
        "last_hourly_at": last_hourly,
    }
    if status != "printing":
        return result

    crossed: list[int] = []
    pct = None
    if st.get("progress") is not None:
        try:
            pct = float(st["progress"])
        except (TypeError, ValueError):
            pct = None
    prev_pct = None
    if prev.get("progress") is not None:
        try:
            prev_pct = float(prev["progress"])
        except (TypeError, ValueError):
            prev_pct = None
    if pct is not None and milestones:
        for mark in milestones:
            if pct >= mark and mark not in sent and (prev_pct is None or prev_pct < mark):
                crossed.append(mark)
    # A large jump (monitor started late, or display progress was wrong) must
    # not announce a stale 25/50% line. Mark those milestones seen and let the
    # hourly line carry the real percent.
    announce: int | None = None
    if crossed:
        top = crossed[-1]
        if pct is not None and (pct - top) > 10:
            # Already well past the mark. Remember it so we do not announce later.
            sent = sent + crossed
        else:
            announce = top
    hourly_due = bool(hourly_enabled) and (now - last_hourly) >= int(interval_s)
    result["milestones_sent"] = sent
    if announce is None and not hourly_due:
        return result
    if quiet or not post_allowed:
        return result
    if announce is not None:
        result["line"] = format_progress_line(
            st, kind="milestone", milestone=announce, dashboard=dashboard
        )
        result["milestones_sent"] = sent + crossed
        result["last_hourly_at"] = now
    else:
        result["line"] = format_progress_line(st, kind="hourly", dashboard=dashboard)
        result["last_hourly_at"] = now
    result["post"] = True
    return result


def digest_selftest() -> str:
    """Offline sample of the hourly line plus milestone-over-hourly preference."""
    st = {
        "progress": 94,
        "filename": "Door_handle_long_name_example.gcode",
        "layer": 1207,
        "layer_count": 1361,
        "nozzle_temp": 278.4,
        "nozzle_target": 275,
        "bed_temp": 65.2,
        "bed_target": 65,
        "eta_s": 3 * 3600,
    }
    dash = "https://cloud-vdroners.ddns.net/apps/nc_print/"
    line = format_progress_line(st, kind="hourly", dashboard=dash)
    if "Printing 94%" not in line or "L1207/1361" not in line:
        raise SystemExit("digest line missing progress/layer")
    if "N278/275" not in line or "B65/65" not in line or "~3h left" not in line:
        raise SystemExit(f"digest line missing temps/eta: {line}")
    both = decide_digest(
        status="printing",
        filename="door.gcode",
        st={"progress": 50, "filename": "door.gcode"},
        prev={"status": "printing", "filename": "door.gcode", "milestones_sent": [25], "last_hourly_at": 0},
        now=10_000,
        quiet=False,
        hourly_enabled=True,
        interval_s=3600,
        milestones=[25, 50, 75],
        dashboard=dash,
    )
    if not both["post"] or "Milestone 50%" not in both["line"]:
        raise SystemExit(f"milestone should win over hourly: {both}")
    if 50 not in both["milestones_sent"] or both["last_hourly_at"] != 10_000:
        raise SystemExit(f"milestone did not stamp hourly slot: {both}")
    quiet = decide_digest(
        status="printing",
        filename="door.gcode",
        st={"progress": 50, "filename": "door.gcode"},
        prev={"status": "printing", "filename": "door.gcode", "milestones_sent": [], "last_hourly_at": 0},
        now=10_000,
        quiet=True,
        hourly_enabled=True,
        interval_s=3600,
        milestones=[25, 50, 75],
        dashboard=dash,
    )
    if quiet["post"] or quiet["milestones_sent"]:
        raise SystemExit(f"quiet hours must not stamp digests: {quiet}")
    jump = decide_digest(
        status="printing",
        filename="door.gcode",
        st={"progress": 96, "filename": "door.gcode"},
        prev={
            "status": "printing",
            "filename": "door.gcode",
            "progress": 27,
            "milestones_sent": [25],
            "last_hourly_at": 0,
        },
        now=10_000,
        quiet=False,
        hourly_enabled=True,
        interval_s=3600,
        milestones=[25, 50, 75],
        dashboard=dash,
    )
    if "Milestone" in jump["line"] or "Printing 96%" not in jump["line"]:
        raise SystemExit(f"late jump must post the real percent, not a stale milestone: {jump}")
    if sorted(jump["milestones_sent"]) != [25, 50, 75]:
        raise SystemExit(f"late jump must mark passed milestones: {jump}")
    print(line)
    print("NC_PRINT_DIGEST_SELFTEST_OK")
    return line


def _current_print() -> dict[str, Any]:
    _code, raw = get_printer_state()
    st = (raw or {}).get("raw") if isinstance(raw, dict) else {}
    return st if isinstance(st, dict) else {}


def summarize_eta() -> str:
    st = _current_print()
    name = printer_name()
    status = st.get("status") or "unknown"
    if status != "printing":
        return f"[nc_print] {name} — {status} (no ETA while not printing)\n{dashboard_url()}"
    prog = st.get("progress")
    pct = f"{int(round(float(prog)))}%" if prog is not None else "?"
    eta = _fmt_eta(st.get("eta_s")) or "ETA unknown"
    layer = ""
    if st.get("layer") is not None or st.get("layer_count") is not None:
        left = st.get("layer") if st.get("layer") is not None else "?"
        right = st.get("layer_count") if st.get("layer_count") is not None else "?"
        layer = f" · L{left}/{right}"
    filename = st.get("filename") or ""
    file_bit = f" · {filename}" if filename else ""
    return f"[nc_print] {name} — {pct}{file_bit}{layer} · {eta}\n{dashboard_url()}"


def summarize_temps() -> str:
    st = _current_print()
    name = printer_name()
    nozzle = _fmt_temp_pair(st.get("nozzle_temp"), st.get("nozzle_target")) or "?/?"
    bed = _fmt_temp_pair(st.get("bed_temp"), st.get("bed_target")) or "?/?"
    return f"[nc_print] {name} — nozzle {nozzle}°C · bed {bed}°C\n{dashboard_url()}"


def summarize_job() -> str:
    st = _current_print()
    name = printer_name()
    status = st.get("status") or "unknown"
    filename = st.get("filename") or "(no file)"
    prog = st.get("progress")
    pct = f"{int(round(float(prog)))}%" if prog is not None else "?"
    elapsed = ""
    if st.get("print_duration") is not None:
        try:
            seconds = int(round(float(st["print_duration"])))
            hours, rem = divmod(seconds, 3600)
            mins = rem // 60
            elapsed = f" · elapsed {hours}h {mins}m" if hours else f" · elapsed {mins}m"
        except (TypeError, ValueError):
            elapsed = ""
    return (
        f"[nc_print] {name} — {status} {pct}\n"
        f"File: {filename}{elapsed}\n"
        f"{dashboard_url()}"
    )


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
    elif cmd == "eta":
        print(summarize_eta())
    elif cmd == "temps":
        print(summarize_temps())
    elif cmd == "job":
        print(summarize_job())
    elif cmd == "digest-selftest":
        digest_selftest()
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
