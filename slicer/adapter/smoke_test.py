#!/usr/bin/env python3
"""End-to-end smoke test for the nc-print-slicer adapter.

Uploads a generated 20mm cube STL to /api/slice/stream (the exact contract
nc-print's frontend uses), intentionally sending incompatible Default presets to
exercise the adapter's compatibility repair, then downloads the resulting gcode.

Run inside the container:  python3 /opt/adapter/smoke_test.py
Exit 0 on success (gcode produced), 1 on failure.
"""
import json
import struct
import sys
import urllib.request
import uuid

BASE = "http://127.0.0.1:8080"


def _profiles(kind):
    u = f"{BASE}/api/profiles?kind={kind}"
    return json.loads(urllib.request.urlopen(u, timeout=10).read()).get("profiles", [])


def _cube_stl(size=20.0):
    v = [(0, 0, 0), (size, 0, 0), (size, size, 0), (0, size, 0),
         (0, 0, size), (size, 0, size), (size, size, size), (0, size, size)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
             (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]

    def norm(a, b, c):
        ux, uy, uz = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        vx, vy, vz = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        return (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)

    buf = b"\0" * 80 + struct.pack("<I", len(faces))
    for a, b, c in faces:
        buf += struct.pack("<3f", *norm(v[a], v[b], v[c]))
        for i in (a, b, c):
            buf += struct.pack("<3f", *v[i])
        buf += struct.pack("<H", 0)
    return buf


def main():
    printers = _profiles("printer")
    pr = next((p for p in printers
               if p.get("name") == "Creality Ender-3 V3 0.4 nozzle"), None)
    pr = pr or (printers[1] if len(printers) > 1 else printers[0])
    printer_id = pr.get("id") or pr.get("name")
    print(f"upload: {printer_id} | (bad) Default Setting | (bad) Default Filament")

    model = _cube_stl()
    bnd = "----x" + uuid.uuid4().hex

    def part(n, val):
        return (f"--{bnd}\r\nContent-Disposition: form-data; "
                f'name="{n}"\r\n\r\n{val}\r\n').encode()

    body = (f"--{bnd}\r\nContent-Disposition: form-data; "
            'name="model"; filename="cube.stl"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n").encode() + model + b"\r\n"
    body += part("printer_id", printer_id)
    body += part("process_id", "Default Setting")
    body += part("filament_ids", json.dumps(["Default Filament"]))
    body += f"--{bnd}--\r\n".encode()

    req = urllib.request.Request(
        f"{BASE}/api/slice/stream", data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={bnd}",
                 "Accept": "text/event-stream"})

    job_id = None
    done = None
    ev = None
    with urllib.request.urlopen(req, timeout=300) as r:
        print("HTTP", r.status, r.headers.get("Content-Type"))
        for raw in r:
            line = raw.decode(errors="replace").strip()
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                try:
                    d = json.loads(line[5:].strip())
                except Exception:  # noqa: BLE001
                    continue
                if d.get("job_id"):
                    job_id = d["job_id"]
                if ev == "progress":
                    msg = f" - {d.get('message')}" if d.get("message") else ""
                    print(f"  [{d.get('stage')}] {d.get('pct')}%{msg}")
                elif ev == "done":
                    done = d
                    print("  DONE:", json.dumps(d))
                elif ev == "error":
                    print("  ERROR:", json.dumps(d))

    if not (job_id and done):
        print("FAIL: no gcode produced")
        return 1

    gu = f"{BASE}/api/jobs/{job_id}/gcode"
    with urllib.request.urlopen(urllib.request.Request(gu, method="HEAD"), timeout=10) as h:
        print("gcode HEAD:", h.status, "len", h.headers.get("Content-Length"))
    with urllib.request.urlopen(gu, timeout=30) as h:
        data = h.read()
    head = data[:80].decode("ascii", "ignore").replace("\n", " | ")
    print(f"gcode GET: {len(data)} bytes; head: {head}")
    ok = len(data) > 1000 and b"G1" in data
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
