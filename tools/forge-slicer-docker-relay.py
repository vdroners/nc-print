#!/usr/bin/env python3
"""DEPRECATED — legacy TCP relay for external forge-slicer on :8766.

Current ops use the owned sidecar (`nc-print-slicer:8080` on `nc-print-net`).
Keep this helper only if an operator still points Admin `slicer_internal_url`
at a host-bound forge-slicer that Docker cannot reach on :8766 (InternalUrlResolver
rewrites 8766 → LAN :8082). Prefer `make slicer-up` instead.
"""
from __future__ import annotations

import os
import select
import socket
import threading

LISTEN_HOST = os.environ.get("NC_PRINT_RELAY_BIND", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("NC_PRINT_RELAY_PORT", "8082"))
TARGET_HOST = os.environ.get("NC_PRINT_RELAY_TARGET_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("NC_PRINT_RELAY_TARGET_PORT", "8766"))


def pump(a: socket.socket, b: socket.socket) -> None:
    while True:
        readable, _, _ = select.select([a, b], [], [], 120)
        if not readable:
            return
        for s in readable:
            data = s.recv(65536)
            if not data:
                return
            (b if s is a else a).sendall(data)


def handle(client: socket.socket) -> None:
    try:
        upstream = socket.create_connection((TARGET_HOST, TARGET_PORT), 5)
        pump(client, upstream)
    except OSError:
        try:
            client.sendall(b"HTTP/1.0 502 Bad Gateway\r\n\r\n")
        except OSError:
            pass
    finally:
        client.close()


def main() -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((LISTEN_HOST, LISTEN_PORT))
    server.listen(128)
    while True:
        conn, _ = server.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
