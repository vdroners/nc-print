"""Parse sliced G-code into feature-typed, layer-indexed 3D toolpath geometry.

The engine emits OrcaSlicer-style markers:
  ;LAYER_CHANGE  ;Z:<z>  ;HEIGHT:<h>   → layer boundaries
  ;TYPE:<feature>                       → the feature of the following moves
  G0/G1 X.. Y.. Z.. E..                 → motion (E present + increasing = extrude)

Output is the contract the frontend renders in the Three.js viewport: per layer,
per feature type, a flat [x0,y0,z0, x1,y1,z1, ...] position buffer that maps
directly onto a THREE.LineSegments BufferGeometry. Travel moves (no extrusion)
are collected under the "travel" feature so the UI can toggle/dash them.

This runs server-side (in the sidecar) so the browser never parses multi-MB
gcode — it just uploads typed arrays into the GPU.
"""
from __future__ import annotations

import os
import re

# Cap total emitted move-segments so parsing a pathological/huge gcode can't
# exhaust adapter memory. ~2M segments ≈ tens of MB of floats.
MAX_TOOLPATH_MOVES = int(os.environ.get("MAX_TOOLPATH_MOVES", "2000000"))

# Engine ;TYPE: label → canonical feature key used by the frontend colour map.
_FEATURE_MAP = {
    "outer wall": "outer_wall",
    "inner wall": "inner_wall",
    "overhang wall": "overhang_wall",
    "sparse infill": "sparse_infill",
    "internal solid infill": "solid_infill",
    "top surface": "top_surface",
    "bottom surface": "bottom_surface",
    "internal bridge": "bridge",
    "bridge": "bridge",
    "support": "support",
    "support interface": "support_iface",
    "skirt": "skirt_brim",
    "brim": "skirt_brim",
    "prime tower": "prime_tower",
    "ironing": "ironing",
    "gap infill": "gap_infill",
    "custom": "custom",
}

# Order defines the frontend legend order; unknown types fall back to "other".
# `seam` and `retraction` are DEGENERATE point markers (both segment verts at the
# same spot → a dot), not extrusion paths — they still obey the 2-verts/segment
# (positions % 6 == 0) contract. Old sidecars simply omit these keys, so the
# frontend legend/colours degrade gracefully (same posture as color-by-speed).
FEATURE_TYPES = [
    "outer_wall", "inner_wall", "overhang_wall", "sparse_infill", "solid_infill",
    "top_surface", "bottom_surface", "bridge", "support", "support_iface",
    "skirt_brim", "prime_tower", "ironing", "gap_infill", "custom", "other",
    "seam", "retraction", "travel",
]

_MOVE_RE = re.compile(r"([XYZEF])(-?\d*\.?\d+(?:[eE][+-]?\d+)?)")


def _canonical(label: str) -> str:
    return _FEATURE_MAP.get(label.strip().lower(), "other")


def parse_toolpath(path: str, max_layers: int = 100000) -> dict:
    """Parse a gcode file into the 3D toolpath contract.

    Returns {units, bbox, feature_types, layers:[{z,height,segments:{feat:{positions:[...]}}}],
             meta:{layer_count}}.
    """
    layers: list[dict] = []
    cur_layer: dict | None = None
    cur_feature = "other"
    seam_pending = False  # a ;SEAM comment marks the NEXT extruding move's start
    x = y = z = 0.0
    e = 0.0
    feed_mm_s = 0.0  # sticky feedrate (gcode F is mm/min → /60)
    absolute_e = True
    minx = miny = minz = float("inf")
    maxx = maxy = maxz = float("-inf")
    speed_min = float("inf")
    speed_max = float("-inf")
    move_count = 0
    truncated = False

    def _new_layer(zval: float, height: float | None) -> dict:
        return {"z": zval, "height": height, "segments": {}}

    def _push(feat: str, x0, y0, z0, x1, y1, z1, spd) -> None:
        nonlocal minx, miny, minz, maxx, maxy, maxz, move_count, speed_min, speed_max
        if cur_layer is None:
            return
        seg = cur_layer["segments"].setdefault(feat, {"positions": [], "speeds": []})
        seg["positions"].extend((x0, y0, z0, x1, y1, z1))
        # One speed per SEGMENT (per 6 position floats) → the frontend builds a
        # per-vertex colour ramp without altering the positions contract.
        seg["speeds"].append(spd)
        move_count += 1
        # Speed range over EXTRUDING PATHS only. Travel skews the scale; seam +
        # retraction are degenerate dot-markers, not extrusion speed samples.
        if feat not in ("travel", "seam", "retraction") and spd > 0:
            speed_min = min(speed_min, spd)
            speed_max = max(speed_max, spd)
        for vx, vy, vz in ((x0, y0, z0), (x1, y1, z1)):
            minx = min(minx, vx); miny = min(miny, vy); minz = min(minz, vz)
            maxx = max(maxx, vx); maxy = max(maxy, vy); maxz = max(maxz, vz)

    with open(path, encoding="ascii", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            if line[0] == ";":
                low = line.lower()
                if low.startswith(";layer_change"):
                    if len(layers) >= max_layers:
                        break
                    cur_layer = _new_layer(z, None)
                    layers.append(cur_layer)
                elif low.startswith(";z:"):
                    try:
                        z = float(line[3:])
                    except ValueError:
                        pass
                    if cur_layer is not None:
                        cur_layer["z"] = z
                elif low.startswith(";height:"):
                    try:
                        if cur_layer is not None:
                            cur_layer["height"] = float(line[8:])
                    except ValueError:
                        pass
                elif low.startswith(";type:"):
                    cur_feature = _canonical(line[6:])
                elif low.startswith(";seam"):
                    # OrcaSlicer/PrusaSlicer emit a ;SEAM marker at the seam point;
                    # flag the next extruding move so we drop a seam dot at its start.
                    seam_pending = True
                continue

            head = line[:3].upper()
            if head.startswith("G0") or head.startswith("G1"):
                nx, ny, nz, ne = x, y, z, e
                has_e = False
                for axis, val in _MOVE_RE.findall(line):
                    try:
                        v = float(val)
                    except ValueError:
                        continue
                    au = axis.upper()
                    if au == "X":
                        nx = v
                    elif au == "Y":
                        ny = v
                    elif au == "Z":
                        nz = v
                    elif au == "E":
                        ne = v
                        has_e = True
                    elif au == "F":
                        feed_mm_s = v / 60.0  # F is mm/min in gcode
                moved = (nx != x) or (ny != y) or (nz != z)
                delta_e = (ne - e) if absolute_e else ne
                if moved:
                    if cur_layer is None:
                        cur_layer = _new_layer(nz, None)
                        layers.append(cur_layer)
                    extruding = has_e and delta_e > 0
                    feat = cur_feature if extruding else "travel"
                    # Seam marker: a degenerate dot at the extrusion start point.
                    if extruding and seam_pending:
                        _push("seam", x, y, z, x, y, z, round(feed_mm_s, 1))
                    seam_pending = False
                    _push(feat, x, y, z, nx, ny, nz, round(feed_mm_s, 1))
                elif has_e and delta_e < 0:
                    # Pure retraction (E reverses with no XYZ move) → a dot at the
                    # current head position. Kept as a 2-vert degenerate segment.
                    if cur_layer is None:
                        cur_layer = _new_layer(z, None)
                        layers.append(cur_layer)
                    _push("retraction", x, y, z, x, y, z, round(feed_mm_s, 1))
                x, y, z = nx, ny, nz
                if has_e:
                    e = ne
                if move_count >= MAX_TOOLPATH_MOVES:
                    truncated = True
                    break
            elif head.startswith("G92"):
                m = _MOVE_RE.search(line)
                # G92 E0 resets the extruder origin.
                for axis, val in _MOVE_RE.findall(line):
                    if axis.upper() == "E":
                        try:
                            e = float(val)
                        except ValueError:
                            pass
            elif line[:2].upper() == "M8":
                # M82 absolute E / M83 relative E
                if line[:3].upper() == "M83":
                    absolute_e = False
                elif line[:3].upper() == "M82":
                    absolute_e = True

    if not layers:
        return {"units": "mm", "bbox": None, "feature_types": FEATURE_TYPES,
                "layers": [], "meta": {"layer_count": 0}}

    bbox = {
        "min": [minx, miny, minz],
        "max": [maxx, maxy, maxz],
    } if minx != float("inf") else None

    spd_min = 0.0 if speed_min == float("inf") else round(speed_min, 1)
    spd_max = 0.0 if speed_max == float("-inf") else round(speed_max, 1)

    return {
        "units": "mm",
        "bbox": bbox,
        "feature_types": FEATURE_TYPES,
        "layers": layers,
        "meta": {"layer_count": len(layers), "moves": move_count,
                 "truncated": truncated,
                 "speed_min": spd_min, "speed_max": spd_max},
    }
