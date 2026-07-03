#!/usr/bin/env python3
"""Container HEALTHCHECK: adapter is up and the engine bundle is non-empty.

Exits 0 only when /api/health reports ok AND at least one printer profile
loaded — an empty PresetBundle means the engine started but cannot slice, which
should surface as unhealthy rather than silently accepting jobs that 404.
"""
import json
import os
import sys
import urllib.request

PORT = os.environ.get("ADAPTER_PORT", "8080")
URL = f"http://127.0.0.1:{PORT}/api/health"

try:
    with urllib.request.urlopen(URL, timeout=4) as resp:
        if resp.status != 200:
            print(f"health status {resp.status}", file=sys.stderr)
            sys.exit(1)
        body = json.loads(resp.read().decode("utf-8"))
except Exception as exc:  # noqa: BLE001 - healthcheck must never raise
    print(f"health unreachable: {exc}", file=sys.stderr)
    sys.exit(1)

if not body.get("ok"):
    print("health not ok", file=sys.stderr)
    sys.exit(1)

counts = body.get("bundle") or {}
if counts.get("printers", 0) < 1:
    # Engine up but bundle empty — degraded, report unhealthy so the operator
    # notices the profiles never injected.
    print(f"empty preset bundle: {counts}", file=sys.stderr)
    sys.exit(1)

sys.exit(0)
