"""Parametric Model Forge v1 — high-use generators → STL/3MF for Prepare.

Forge port Wave 5. Pure-Python box meshes (no lib3mf WASM). Output is ASCII STL
bytes; callers may wrap with mesh3mf.stl_bytes_to_3mf for .3mf download.
"""

from __future__ import annotations

import io
import struct
from typing import Callable


def _num(v, lo, hi, default):
    try:
        x = float(v)
    except (TypeError, ValueError):
        x = default
    return max(lo, min(hi, x))


def _stl_from_tris(tris: list[tuple], name: str = "model") -> bytes:
    """tris: list of ((x,y,z),(x,y,z),(x,y,z))"""
    buf = io.StringIO()
    buf.write(f"solid {name}\n")
    for a, b, c in tris:
        # normal via cross product
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        norm = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
        nx, ny, nz = nx / norm, ny / norm, nz / norm
        buf.write(f"  facet normal {nx:.6f} {ny:.6f} {nz:.6f}\n")
        buf.write("    outer loop\n")
        for p in (a, b, c):
            buf.write(f"      vertex {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
        buf.write("    endloop\n  endfacet\n")
    buf.write(f"endsolid {name}\n")
    return buf.getvalue().encode("ascii")


def _box(x0, y0, z0, sx, sy, sz) -> list:
    x1, y1, z1 = x0 + sx, y0 + sy, z0 + sz
    v = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [
        (0, 1, 2), (0, 2, 3),  # bottom
        (4, 6, 5), (4, 7, 6),  # top
        (0, 5, 1), (0, 4, 5),  # front
        (3, 2, 6), (3, 6, 7),  # back
        (0, 3, 7), (0, 7, 4),  # left
        (1, 5, 6), (1, 6, 2),  # right
    ]
    return [(v[a], v[b], v[c]) for a, b, c in faces]


def gen_cable_clip(opts: dict) -> tuple[bytes, str]:
    cd = _num(opts.get("cableDiameter"), 1, 30, 6)
    length = _num(opts.get("clipLength"), 4, 40, 10)
    wall = _num(opts.get("wallThickness"), 1, 4, 1.8)
    base_extra = _num(opts.get("baseExtra"), 2, 20, 6)
    outer_w = cd + wall * 2 + base_extra * 2
    tris = []
    tris += _box(0, 0, 0, outer_w, length, wall)  # base
    tris += _box(base_extra, 0, wall, wall, length, cd)  # left
    tris += _box(base_extra + wall + cd, 0, wall, wall, length, cd)  # right
    tris += _box(base_extra, 0, wall + cd, wall * 2 + cd, length, wall)  # top
    return _stl_from_tris(tris, "cable_clip"), f"cable_clip_{int(cd)}mm.stl"


def gen_wall_bracket(opts: dict) -> tuple[bytes, str]:
    w = _num(opts.get("width"), 10, 120, 40)
    d = _num(opts.get("depth"), 10, 80, 30)
    t = _num(opts.get("thickness"), 2, 12, 4)
    h = _num(opts.get("height"), 10, 100, 40)
    tris = _box(0, 0, 0, w, t, h)  # back plate
    tris += _box(0, 0, 0, w, d, t)  # shelf
    return _stl_from_tris(tris, "wall_bracket"), f"wall_bracket_{int(w)}x{int(d)}.stl"


def gen_hook(opts: dict) -> tuple[bytes, str]:
    w = _num(opts.get("width"), 8, 40, 16)
    reach = _num(opts.get("reach"), 10, 60, 25)
    t = _num(opts.get("thickness"), 2, 10, 4)
    back_h = _num(opts.get("backHeight"), 20, 80, 40)
    tris = _box(0, 0, 0, w, t, back_h)
    tris += _box(0, 0, 0, w, reach, t)
    tris += _box(0, reach - t, 0, w, t, t * 2)  # lip
    return _stl_from_tris(tris, "hook"), f"hook_{int(reach)}mm.stl"


def gen_text_plate(opts: dict) -> tuple[bytes, str]:
    # Simple blank nameplate (text engraving needs font mesh — v1 is blank plate)
    w = _num(opts.get("width"), 20, 200, 80)
    h = _num(opts.get("height"), 10, 80, 30)
    t = _num(opts.get("thickness"), 1, 8, 2.4)
    tris = _box(0, 0, 0, w, h, t)
    return _stl_from_tris(tris, "text_plate"), f"plate_{int(w)}x{int(h)}.stl"


def gen_lidded_box(opts: dict) -> tuple[bytes, str]:
    w = _num(opts.get("width"), 20, 200, 60)
    d = _num(opts.get("depth"), 20, 200, 40)
    h = _num(opts.get("height"), 10, 150, 30)
    wall = _num(opts.get("wall"), 1.2, 6, 2)
    tris = []
    tris += _box(0, 0, 0, w, d, wall)  # floor
    tris += _box(0, 0, 0, wall, d, h)
    tris += _box(w - wall, 0, 0, wall, d, h)
    tris += _box(0, 0, 0, w, wall, h)
    tris += _box(0, d - wall, 0, w, wall, h)
    return _stl_from_tris(tris, "lidded_box"), f"box_{int(w)}x{int(d)}x{int(h)}.stl"


def gen_phone_stand(opts: dict) -> tuple[bytes, str]:
    w = _num(opts.get("width"), 40, 120, 70)
    base_d = _num(opts.get("baseDepth"), 40, 120, 70)
    t = _num(opts.get("thickness"), 2, 8, 3.5)
    slot = _num(opts.get("slot"), 6, 20, 12)
    tris = _box(0, 0, 0, w, base_d, t)
    tris += _box(0, base_d * 0.35, t, w, t, 40)
    tris += _box(0, base_d * 0.35 - slot, t + 8, w, slot + t, t)
    return _stl_from_tris(tris, "phone_stand"), f"phone_stand_{int(w)}.stl"


def gen_spool_adapter(opts: dict) -> tuple[bytes, str]:
    # Simplified tube + flange rings approximated as boxes/rings via stacked boxes
    id_ = _num(opts.get("innerDia"), 20, 80, 52)
    od = _num(opts.get("outerDia"), id_ + 4, 100, 60)
    h = _num(opts.get("height"), 10, 100, 60)
    wall = max(1.5, (od - id_) / 2)
    # Approximate as square tube for v1 (round needs more tris)
    s = od
    hole = id_
    tris = []
    tris += _box(0, 0, 0, s, s, wall)  # bottom flange
    tris += _box(0, 0, h - wall, s, s, wall)
    # walls of tube (outer box minus hole approximated by 4 walls)
    inset = (s - hole) / 2
    tris += _box(0, 0, 0, s, inset, h)
    tris += _box(0, s - inset, 0, s, inset, h)
    tris += _box(0, 0, 0, inset, s, h)
    tris += _box(s - inset, 0, 0, inset, s, h)
    return _stl_from_tris(tris, "spool_adapter"), f"spool_adapter_{int(id_)}.stl"


def gen_keychain(opts: dict) -> tuple[bytes, str]:
    w = _num(opts.get("width"), 20, 80, 40)
    h = _num(opts.get("height"), 10, 40, 20)
    t = _num(opts.get("thickness"), 1.5, 6, 3)
    hole = _num(opts.get("hole"), 2, 8, 4)
    tris = _box(0, 0, 0, w, h, t)
    # hole approximated by not cutting — add ring tab
    tris += _box(w - 2, h / 2 - hole / 2 - 1, 0, 8, hole + 2, t)
    return _stl_from_tris(tris, "keychain"), f"keychain_{int(w)}.stl"


def gen_gridfinity_bin(opts: dict) -> tuple[bytes, str]:
    units_x = int(_num(opts.get("unitsX"), 1, 6, 1))
    units_y = int(_num(opts.get("unitsY"), 1, 6, 1))
    height = _num(opts.get("height"), 7, 100, 21)
    # Gridfinity unit ≈ 42mm
    w, d = units_x * 42, units_y * 42
    wall = 1.5
    tris = _box(0, 0, 0, w, d, 1.2)
    tris += _box(0, 0, 0, wall, d, height)
    tris += _box(w - wall, 0, 0, wall, d, height)
    tris += _box(0, 0, 0, w, wall, height)
    tris += _box(0, d - wall, 0, w, wall, height)
    return _stl_from_tris(tris, "gridfinity_bin"), f"gf_bin_{units_x}x{units_y}_{int(height)}.stl"


def gen_battery_holder(opts: dict) -> tuple[bytes, str]:
    cells = int(_num(opts.get("cells"), 1, 8, 2))
    cell_d = _num(opts.get("cellDia"), 10, 25, 18.5)  # 18650≈18.5
    wall = _num(opts.get("wall"), 1.2, 4, 1.6)
    length = _num(opts.get("length"), 40, 80, 67)
    pitch = cell_d + wall
    w = cells * pitch + wall
    tris = _box(0, 0, 0, w, length, wall)
    for i in range(cells + 1):
        tris += _box(i * pitch, 0, wall, wall, length, cell_d * 0.55)
    tris += _box(0, 0, wall, w, wall, cell_d * 0.55)
    tris += _box(0, length - wall, wall, w, wall, cell_d * 0.55)
    return _stl_from_tris(tris, "battery_holder"), f"battery_holder_{cells}s.stl"


GENERATORS: dict[str, Callable[[dict], tuple[bytes, str]]] = {
    "cable-clip": gen_cable_clip,
    "wall-bracket": gen_wall_bracket,
    "hook": gen_hook,
    "text-plate": gen_text_plate,
    "lidded-box": gen_lidded_box,
    "phone-stand": gen_phone_stand,
    "spool-adapter": gen_spool_adapter,
    "keychain": gen_keychain,
    "gridfinity-bin": gen_gridfinity_bin,
    "battery-holder": gen_battery_holder,
}


def list_generators() -> list[dict]:
    return [
        {"id": k, "name": k.replace("-", " ").title()}
        for k in sorted(GENERATORS)
    ]


def generate(gen_id: str, opts: dict | None = None) -> tuple[bytes, str]:
    fn = GENERATORS.get(gen_id)
    if not fn:
        raise KeyError(gen_id)
    return fn(opts or {})
