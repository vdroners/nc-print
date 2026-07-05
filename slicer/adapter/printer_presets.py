"""Printer model preset lookup.

Static (vendor, model) -> descriptor (build volume, nozzle count, capabilities)
so the UI can show model facts offline / slicer-side. Data + lookup logic ported
from 3dprintforge `src/server/printer-presets.js` +
`data/printer-model-presets.json`. This is a REFERENCE DB — the live Moonraker
capability detection is authoritative for connected printers; this covers the
offline / profile-picker case. Pure lookup.
"""
from __future__ import annotations

import json
import os
import re

_DATA_PATH = os.path.join(os.path.dirname(__file__), "printer_model_presets.json")

_PRESETS: list[dict] = []
_PLACEHOLDERS: list[dict] = []


def _norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def _load() -> None:
    global _PRESETS, _PLACEHOLDERS
    if _PRESETS or _PLACEHOLDERS:
        return
    try:
        with open(_DATA_PATH, encoding="utf-8") as fh:
            raw = json.load(fh)
        _PRESETS = raw.get("presets", []) or []
        _PLACEHOLDERS = raw.get("placeholder_models", []) or []
    except Exception:  # noqa: BLE001
        _PRESETS = []
        _PLACEHOLDERS = []


def find_printer_preset(vendor: str, model: str) -> dict | None:
    """Look up a preset by vendor + model (case/whitespace-insensitive).
    Placeholder (not-yet-shipped) models are returned with _placeholder=True."""
    _load()
    v = _norm(vendor)
    m = _norm(model)
    if not v or not m:
        return None
    for p in _PRESETS:
        if _norm(p.get("vendor")) == v and _norm(p.get("model")) == m:
            return p
    for p in _PLACEHOLDERS:
        if _norm(p.get("vendor")) == v and _norm(p.get("model")) == m:
            return {**p, "_placeholder": True}
    return None


def list_printer_presets_for_vendor(vendor: str) -> list[dict]:
    _load()
    v = _norm(vendor)
    return [p for p in _PRESETS if _norm(p.get("vendor")) == v]


def list_all_presets() -> list[dict]:
    _load()
    return list(_PRESETS)


def list_all_capabilities() -> list[str]:
    """Every capability flag across the preset DB (for a filter UI)."""
    _load()
    caps: set[str] = set()
    for p in _PRESETS:
        for c in p.get("capabilities", []) or []:
            caps.add(c)
    return sorted(caps)
