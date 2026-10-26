#!/usr/bin/env python3
"""
Forge webhook relay — receives 3DPrintForge DB webhook POSTs and posts to Talk.

Listens on FORGE_WEBHOOK_BIND:FORGE_WEBHOOK_PORT (default 127.0.0.1:8790).
Public URL via CPM: https://alfred-vdroners.ddns.net/forge-webhook
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Lock

OPENCLAW_DIR = Path(os.environ.get("OPENCLAW_DIR", os.path.expanduser("~/.openclaw")))
BIND = os.environ.get("FORGE_WEBHOOK_BIND", "127.0.0.1")
PORT = int(os.environ.get("FORGE_WEBHOOK_PORT", "8790"))
SECRET = os.environ.get("FORGE_WEBHOOK_SECRET", "")
SECRET_FILE = os.environ.get("FORGE_WEBHOOK_SECRET_FILE", str(OPENCLAW_DIR / ".env.d" / "forge-webhook.secret"))
TALK_ROOM = os.environ.get("FORGE_ALERT_TALK_ROOM", os.environ.get("SKYLIGHT_OPS_TALK_ROOM", ""))
DASHBOARD = os.environ.get("FORGE_DASHBOARD_URL", "https://forge-vdroners.ddns.net")
DEDUPE_SECONDS = float(os.environ.get("FORGE_ALERT_MIN_INTERVAL_M", "15")) * 60
RATE_LIMIT_PER_MIN = int(os.environ.get("FORGE_WEBHOOK_RATE_LIMIT", "10"))
QUIET_HOURS = os.environ.get("NC_PRINT_QUIET_HOURS") or os.environ.get("FORGE_QUIET_HOURS", "23:00-07:00")
QUIET_CRITICAL = os.environ.get("FORGE_QUIET_CRITICAL_OVERRIDE", "1") == "1"
NATIVE_NOTIFY = os.environ.get("FORGE_NATIVE_NOTIFY", "0") == "1"
LOG_FILE = OPENCLAW_DIR / "logs" / "forge-webhook-relay.log"
STATE_FILE = OPENCLAW_DIR / "state" / "forge-webhook-dedupe.json"

CRITICAL_EVENTS = frozenset({"print_failed", "printer_error", "protection_alert", "printer_offline"})
# Digests are timer-owned. Drop progress webhooks entirely. Quiet hours only
# suppress low-value bed_cooled — start/finish/fail/guard still post.
QUIET_SUPPRESS = frozenset({"bed_cooled"})
PROGRESS_DROP = frozenset({"print_progress"})

_dedupe: dict[str, float] = {}
_dedupe_lock = Lock()
_rate: list[float] = []
_rate_lock = Lock()


def _log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def _load_secret() -> str:
    global SECRET
    if SECRET:
        return SECRET
    path = Path(os.path.expanduser(SECRET_FILE))
    if path.is_file():
        SECRET = path.read_text(encoding="utf-8").strip()
    return SECRET


def _verify_hmac(body: bytes, header: str | None, secret: str) -> bool:
    if not secret:
        return False
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    got = header[7:]
    return hmac.compare_digest(expected, got)


def _in_quiet_hours() -> bool:
    if not QUIET_HOURS or "-" not in QUIET_HOURS:
        return False
    start_s, end_s = QUIET_HOURS.split("-", 1)
    try:
        sh, sm = [int(x) for x in start_s.strip().split(":")]
        eh, em = [int(x) for x in end_s.strip().split(":")]
    except (ValueError, IndexError):
        return False
    now = datetime.now()
    cur = now.hour * 60 + now.minute
    start = sh * 60 + sm
    end = eh * 60 + em
    if start <= end:
        return start <= cur < end
    return cur >= start or cur < end


def _dedupe_key(payload: dict) -> str:
    event = str(payload.get("event") or "")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    pid = str(data.get("printer_id") or data.get("printer_name") or "")
    fn = str(data.get("filename") or data.get("file") or "")
    title = str(payload.get("title") or "")
    return f"{event}|{pid}|{fn}|{title}"


def _should_dedupe(key: str) -> bool:
    now = time.time()
    with _dedupe_lock:
        last = _dedupe.get(key, 0)
        if now - last < DEDUPE_SECONDS:
            return True
        _dedupe[key] = now
        stale = [k for k, t in _dedupe.items() if now - t > DEDUPE_SECONDS * 4]
        for k in stale:
            del _dedupe[k]
    return False


def _rate_ok() -> bool:
    now = time.time()
    with _rate_lock:
        _rate[:] = [t for t in _rate if now - t < 60]
        if len(_rate) >= RATE_LIMIT_PER_MIN:
            return False
        _rate.append(now)
    return True


def _human_duration(seconds: object) -> str:
    try:
        total = int(round(float(seconds)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return ""
    if total <= 0:
        return ""
    hours, rem = divmod(total, 3600)
    mins = rem // 60
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    if mins:
        return f"{mins}m"
    return f"{total}s"


def _format_message(payload: dict) -> str:
    event = str(payload.get("event") or "")
    title = str(payload.get("title") or event or "Print event")
    message = str(payload.get("message") or "").strip()
    source = str(payload.get("source") or "").lower()
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    prefix = "[nc_print]" if source == "nc_print" else "[forge]"
    dash = os.environ.get(
        "NC_PRINT_DASHBOARD_URL",
        os.environ.get("FORGE_DASHBOARD_URL", DASHBOARD),
    )
    if source == "nc_print":
        dash = os.environ.get(
            "NC_PRINT_DASHBOARD_URL",
            "https://cloud-vdroners.ddns.net/apps/nc_print/",
        )
    head = f"{prefix} HIGH {title}" if event == "protection_alert" else f"{prefix} {title}"
    lines = [head]
    bits: list[str] = []
    filename = str(data.get("filename") or "").strip()
    if filename and filename not in message:
        bits.append(filename)
    if message:
        bits.append(message)
    progress = data.get("progress")
    if progress is not None and str(progress).strip() != "":
        try:
            pct = float(progress)
            if pct <= 1.0:
                pct *= 100.0
            bits.append(f"{int(round(pct))}%")
        except (TypeError, ValueError):
            pass
    duration = _human_duration(data.get("duration_s"))
    if duration:
        bits.append(duration)
    if bits:
        # De-dupe when message is already the filename.
        seen: list[str] = []
        for bit in bits:
            if bit not in seen:
                seen.append(bit)
        lines.append(" · ".join(seen))
    lines.append(dash)
    return "\n".join(lines)


def _talk_post(msg: str) -> bool:
    script = OPENCLAW_DIR / "scripts" / "talk-post.sh"
    if not script.is_file():
        _log(f"talk-post missing: {script}")
        return False
    room = TALK_ROOM
    if not room:
        _log("FORGE_ALERT_TALK_ROOM not set")
        return False
    env = os.environ.copy()
    env.setdefault("NC_HTTP_RETRIES", "4")
    try:
        r = subprocess.run(
            ["bash", str(script), msg, room],
            capture_output=True,
            text=True,
            timeout=90,
            env=env,
            check=False,
        )
        if r.returncode != 0:
            _log(f"talk-post failed rc={r.returncode} err={r.stderr[:200]}")
            return False
        return True
    except subprocess.TimeoutExpired:
        _log("talk-post timeout")
        return False


def _native_notify(msg: str, event: str) -> None:
    if not NATIVE_NOTIFY or event not in CRITICAL_EVENTS:
        return
    script = OPENCLAW_DIR / "scripts" / "nc-notify.sh"
    if not script.is_file():
        return
    try:
        subprocess.run(
            ["bash", str(script), "forge_alert", msg[:500], DASHBOARD],
            capture_output=True,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired:
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = "ForgeWebhookRelay/1.0"

    def log_message(self, fmt: str, *args) -> None:
        _log(f"{self.address_string()} {fmt % args}")

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") in ("/health", "/forge-webhook/health", "/"):
            secret_ok = bool(_load_secret())
            self._json(
                200,
                {
                    "status": "ok",
                    "service": "forge-webhook-relay",
                    "secret_configured": secret_ok,
                    "talk_room": TALK_ROOM or None,
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/")
        if path not in ("/forge-webhook", ""):
            self._json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 65536:
            self._json(400, {"error": "invalid body"})
            return
        body = self.rfile.read(length)
        secret = _load_secret()
        sig = self.headers.get("X-Webhook-Signature") or self.headers.get("X-Hub-Signature-256")
        if not _verify_hmac(body, sig, secret):
            _log("rejected unsigned/invalid webhook")
            self._json(401, {"error": "invalid signature"})
            return

        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        if not isinstance(payload, dict):
            self._json(400, {"error": "invalid payload"})
            return

        event = str(payload.get("event") or "unknown")
        if event in PROGRESS_DROP:
            _log(f"ignored progress event={event}")
            self._json(200, {"status": "ignored", "reason": "progress_not_digest"})
            return

        # Guard / fail / offline stay loud through quiet hours and are not digests.
        if event in CRITICAL_EVENTS:
            pass
        elif _in_quiet_hours() and event in QUIET_SUPPRESS and not (QUIET_CRITICAL and event in CRITICAL_EVENTS):
            _log(f"suppressed quiet hours event={event}")
            self._json(200, {"status": "suppressed", "reason": "quiet_hours"})
            return

        key = _dedupe_key(payload)
        if _should_dedupe(key):
            _log(f"deduped event={event}")
            self._json(200, {"status": "deduped"})
            return

        if not _rate_ok():
            _log(f"rate limited event={event}")
            self._json(429, {"error": "rate limited"})
            return

        msg = _format_message(payload)
        if not _talk_post(msg):
            self._json(502, {"error": "talk post failed"})
            return
        _native_notify(msg, event)
        _log(f"posted event={event}")
        self._json(200, {"status": "ok", "event": event})


def main() -> None:
    _load_secret()
    if not TALK_ROOM:
        _log("WARN: FORGE_ALERT_TALK_ROOM / SKYLIGHT_OPS_TALK_ROOM not set")
    server = HTTPServer((BIND, PORT), Handler)
    _log(f"listening on {BIND}:{PORT} talk_room={TALK_ROOM or 'unset'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
