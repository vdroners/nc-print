"""G-code reference — searchable M/G-code help.

Data ported verbatim from 3dprintforge `src/server/gcode-reference.js` (its
REFERENCE array, exported to gcode_reference_data.json). Each entry:
{code, category, desc, params:{}, example, firmwares:[]}. Pure lookup — no I/O
beyond loading the shipped JSON once.
"""
from __future__ import annotations

import json
import os

_DATA_PATH = os.path.join(os.path.dirname(__file__), "gcode_reference_data.json")

CATEGORIES = ["movement", "temperature", "fan", "extruder", "setup", "tool", "control"]
FIRMWARES = ["Marlin", "Klipper", "RepRap", "Bambu"]

_REFERENCE: list[dict] = []
_BY_CODE: dict[str, dict] = {}


def _load() -> None:
    global _REFERENCE, _BY_CODE
    if _REFERENCE:
        return
    try:
        with open(_DATA_PATH, encoding="utf-8") as fh:
            _REFERENCE = json.load(fh)
    except Exception:  # noqa: BLE001
        _REFERENCE = []
    _BY_CODE = {e["code"].upper(): e for e in _REFERENCE if e.get("code")}


def list_reference() -> list[dict]:
    _load()
    return list(_REFERENCE)


def get_reference(code: str) -> dict | None:
    """Look up a single command by code (case-insensitive), e.g. 'M104'."""
    if not code:
        return None
    _load()
    return _BY_CODE.get(code.upper())


def search_reference(query: str = "", category: str = "", firmware: str = "") -> list[dict]:
    """Filter the reference by free-text (code/desc), category, and/or firmware."""
    _load()
    q = (query or "").strip().lower()
    cat = (category or "").strip().lower()
    fw = (firmware or "").strip().lower()
    out = []
    for e in _REFERENCE:
        if cat and str(e.get("category", "")).lower() != cat:
            continue
        if fw and fw not in [f.lower() for f in e.get("firmwares", [])]:
            continue
        if q and q not in str(e.get("code", "")).lower() and q not in str(e.get("desc", "")).lower():
            continue
        out.append(e)
    return out


def list_categories() -> list[str]:
    return list(CATEGORIES)


def list_firmwares() -> list[str]:
    return list(FIRMWARES)
