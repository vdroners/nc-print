"""Per-feature filament + time breakdown from sliced G-code.

The engine's gcode footer only reports total filament (and often 0 g when the
filament preset has no density), so it can't feed the app's model-vs-support cost
UI. This computes model vs support filament (grams) and a rough support-time
share by a single pass over the gcode, classifying each extruding move by its
`;TYPE:` section and integrating extruded volume (E-delta × filament cross-section).

Kept separate from gcode_toolpath.py (which builds 3D geometry) so a normal slice
pays only this cheap numeric pass, not the full toolpath build.
"""
from __future__ import annotations

import math
import re

_MOVE_RE = re.compile(r"([XYZEF])(-?\d*\.?\d+(?:[eE][+-]?\d+)?)")
# Feature labels the engine emits for support (kept lowercase for matching).
# Raft is bed adhesion, but historically bucketed with support here; keep it in
# support so support_filament_g stays comparable, and track brim/skirt as a
# separate "adhesion" bucket.
_SUPPORT_TYPES = {
    "support", "support interface", "support material",
    "support material interface", "raft", "raft interface",
}
# Bed-adhesion features (not part of the model or its supports).
_ADHESION_TYPES = {
    "brim", "skirt", "skirt/brim",
}
_DEFAULT_DIAMETER_MM = 1.75
# Fallback density (g/cm3) when the preset reports 0 — matches _read_gcode_meta.
_FALLBACK_DENSITY = 1.24


def _footer_floats(tail: str) -> tuple[float, float]:
    """(diameter_mm, density_g_cm3) from the gcode footer, with fallbacks."""
    diameter = _DEFAULT_DIAMETER_MM
    density = 0.0
    for line in tail.splitlines():
        low = line.lower()
        if "filament_diameter" in low:
            m = re.search(r"[:=]\s*([\d.]+)", line)
            if m:
                try:
                    diameter = float(m.group(1)) or _DEFAULT_DIAMETER_MM
                except ValueError:
                    pass
        elif "filament_density" in low:
            m = re.search(r"[:=]\s*([\d.]+)", line)
            if m:
                try:
                    density = float(m.group(1))
                except ValueError:
                    pass
    if density <= 0:
        density = _FALLBACK_DENSITY
    return diameter, density


def compute_breakdown(path: str) -> dict:
    """Return {model_filament_g, support_filament_g, support_time_frac,
    total_filament_g} computed from the gcode. Values are best-effort estimates.
    """
    # Read a tail for density/diameter (footer sits near EOF).
    try:
        import os
        with open(path, "rb") as fh:
            fh.seek(max(0, os.path.getsize(path) - 131072))
            tail = fh.read().decode("ascii", "ignore")
    except Exception:  # noqa: BLE001
        return {}
    diameter, density = _footer_floats(tail)
    area_mm2 = math.pi * (diameter / 2.0) ** 2  # filament cross-section

    e = 0.0
    absolute_e = True
    bucket = "model"      # "model" | "support" | "adhesion"
    model_mm = 0.0        # extruded filament length on model features
    support_mm = 0.0      # extruded filament length on support features
    adhesion_mm = 0.0     # extruded filament on brim/skirt
    # Time share: count moves (with feedrate integration would be heavier); a
    # move-count ratio is a reasonable proxy for support-time fraction.
    model_moves = 0
    support_moves = 0

    try:
        with open(path, encoding="ascii", errors="ignore") as fh:
            for raw in fh:
                line = raw.lstrip()
                if not line:
                    continue
                c = line[0]
                if c == ";":
                    low = line.lower()
                    if low.startswith(";type:"):
                        feat = low[6:].strip()
                        if feat in _SUPPORT_TYPES:
                            bucket = "support"
                        elif feat in _ADHESION_TYPES:
                            bucket = "adhesion"
                        else:
                            bucket = "model"
                    continue
                head = line[:3].upper()
                if head[:2] in ("G0", "G1"):
                    ne = e
                    has_e = False
                    for axis, val in _MOVE_RE.findall(line):
                        if axis in ("e", "E"):
                            try:
                                ne = float(val)
                                has_e = True
                            except ValueError:
                                pass
                    if has_e:
                        delta = (ne - e) if absolute_e else ne
                        if delta > 0:  # extrusion, not retraction
                            if bucket == "support":
                                support_mm += delta
                                support_moves += 1
                            elif bucket == "adhesion":
                                adhesion_mm += delta
                            else:
                                model_mm += delta
                                model_moves += 1
                        e = ne
                elif head.startswith("G92"):
                    for axis, val in _MOVE_RE.findall(line):
                        if axis in ("e", "E"):
                            try:
                                e = float(val)
                            except ValueError:
                                pass
                elif line[:3].upper() == "M83":
                    absolute_e = False
                elif line[:3].upper() == "M82":
                    absolute_e = True
    except Exception:  # noqa: BLE001
        return {}

    def to_grams(length_mm: float) -> float:
        # volume mm3 = length * area; grams = cm3 * density
        return (length_mm * area_mm2 / 1000.0) * density

    model_g = round(to_grams(model_mm), 2)
    support_g = round(to_grams(support_mm), 2)
    adhesion_g = round(to_grams(adhesion_mm), 2)
    total_moves = model_moves + support_moves
    out = {
        "model_filament_g": model_g,
        "support_filament_g": support_g,
        "adhesion_filament_g": adhesion_g,
        "total_filament_g": round(model_g + support_g + adhesion_g, 2),
    }
    if total_moves > 0 and support_moves > 0:
        out["support_time_frac"] = round(support_moves / total_moves, 4)
    return out
