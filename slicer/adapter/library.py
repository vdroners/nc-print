"""Parts library over /library (host /media/4TB/3dprints). Read-only listing + file fetch."""

from __future__ import annotations

import mimetypes
import os
import re
from pathlib import Path

LIBRARY_ROOT = Path(os.environ.get("NC_PRINT_LIBRARY_ROOT", "/library")).resolve()
ALLOWED_EXT = {".stl", ".3mf", ".obj", ".gcode", ".bgcode", ".png", ".jpg", ".jpeg", ".webp"}
MODEL_EXT = {".stl", ".3mf", ".obj"}


def _safe_rel(rel: str) -> Path | None:
    rel = (rel or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    if rel.startswith("/"):
        return None
    full = (LIBRARY_ROOT / rel).resolve()
    try:
        full.relative_to(LIBRARY_ROOT)
    except ValueError:
        return None
    return full


def list_entries(subdir: str = "", q: str = "", limit: int = 100, offset: int = 0) -> dict:
    root = LIBRARY_ROOT
    base = _safe_rel(subdir) if subdir else root
    if base is None or not base.is_dir():
        return {"ok": False, "error": "not_found", "entries": [], "root": str(LIBRARY_ROOT)}
    qn = (q or "").strip().lower()
    entries = []
    try:
        children = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError as e:
        return {"ok": False, "error": str(e), "entries": []}

    for p in children:
        if p.name.startswith("."):
            continue
        ext = p.suffix.lower()
        if p.is_file() and ext not in ALLOWED_EXT:
            continue
        if qn and qn not in p.name.lower():
            continue
        rel = str(p.relative_to(LIBRARY_ROOT)).replace("\\", "/")
        thumb = None
        if p.is_file() and ext in MODEL_EXT:
            # Convention: thumb_<id>.png next to lib_<id>_*.stl/3mf
            m = re.match(r"lib_(\d+)_", p.name)
            if m:
                cand = LIBRARY_ROOT / f"thumb_{m.group(1)}.png"
                if cand.is_file():
                    thumb = str(cand.relative_to(LIBRARY_ROOT)).replace("\\", "/")
        entries.append({
            "name": p.name,
            "path": rel,
            "dir": p.is_dir(),
            "size": p.stat().st_size if p.is_file() else 0,
            "ext": ext.lstrip(".") if p.is_file() else "",
            "model": p.is_file() and ext in MODEL_EXT,
            "thumb": thumb,
        })

    total = len(entries)
    page = entries[offset: offset + max(1, min(limit, 200))]
    return {
        "ok": True,
        "root": str(LIBRARY_ROOT),
        "subdir": subdir or "",
        "total": total,
        "offset": offset,
        "entries": page,
    }


def read_file(rel: str) -> tuple[bytes | None, str, str]:
    """Return (bytes, filename, mime) or (None, error, '')."""
    full = _safe_rel(rel)
    if full is None or not full.is_file():
        return None, "not_found", ""
    ext = full.suffix.lower()
    if ext not in ALLOWED_EXT:
        return None, "forbidden_ext", ""
    data = full.read_bytes()
    mime = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
    return data, full.name, mime
