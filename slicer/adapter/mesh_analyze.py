"""Server-side mesh health analysis for uploaded STL models.

Runs before/independently of slicing so the UI can warn about non-watertight or
degenerate meshes (a common cause of failed or ugly slices) without shipping a
mesh library. Reuses the STL parser from mesh3mf.
"""
from __future__ import annotations

import math

from mesh3mf import _dedup, _is_ascii_stl, _parse_ascii_stl, _parse_binary_stl

# Printability thresholds (ported from 3dprintforge stl-analyzer.js).
_OVERHANG_THRESHOLD_DEG = 45.0
_BRIDGE_MIN_AREA = 25.0      # mm² — ignore tiny top shells
_BRIDGE_FLAT_THRESHOLD = 0.85  # |nz| > 0.85 ≈ within ~32° of horizontal
_BRIDGE_MIN_HEIGHT = 1.0     # mm above the bed


def _parse(stl: bytes):
    if _is_ascii_stl(stl):
        verts, tris = _parse_ascii_stl(stl)
    else:
        verts, tris = _parse_binary_stl(stl)
    return _dedup(verts, tris)


def _face_normal_area_centroid(verts, tri):
    """Return (nx, ny, nz [unit], area, cz) for a triangle (vertex-index triple)."""
    ax, ay, az = verts[tri[0]]
    bx, by, bz = verts[tri[1]]
    cx, cy, cz = verts[tri[2]]
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    mag = math.sqrt(nx * nx + ny * ny + nz * nz)
    area = mag / 2.0
    if mag > 0:
        nx, ny, nz = nx / mag, ny / mag, nz / mag
    centroid_z = (az + bz + cz) / 3.0
    return nx, ny, nz, area, centroid_z


def _printability(verts, tris, min_z):
    """Overhang fraction, bridge candidates, and best-orientation suggestion —
    area-weighted, computed from face normals (ported from stl-analyzer.js)."""
    # Precompute per-face normal/area once.
    faces = [_face_normal_area_centroid(verts, t) for t in tris]

    cos_thresh = math.cos(math.radians(90 - _OVERHANG_THRESHOLD_DEG))
    overhang_area = 0.0
    total_area = 0.0
    bridge_count = 0
    bridge_area = 0.0
    for nx, ny, nz, area, cz in faces:
        total_area += area
        if -nz > cos_thresh:
            overhang_area += area
        # Bridge: near-horizontal upward face sitting above the bed.
        if nz > _BRIDGE_FLAT_THRESHOLD and area >= _BRIDGE_MIN_AREA and cz >= min_z + _BRIDGE_MIN_HEIGHT:
            bridge_count += 1
            bridge_area += area

    overhang_fraction = overhang_area / total_area if total_area > 0 else 0.0

    # Orientation suggestions — rotate the normals only (cheap; positions don't
    # affect the area-weighted overhang ratio) across 7 axis-aligned flips.
    orientations = [
        ("as-loaded", (0.0, 0.0)),
        ("flip 180° about X", (math.pi, 0.0)),
        ("flip 180° about Y", (0.0, math.pi)),
        ("rotate 90° about X", (math.pi / 2, 0.0)),
        ("rotate -90° about X", (-math.pi / 2, 0.0)),
        ("rotate 90° about Y", (0.0, math.pi / 2)),
        ("rotate -90° about Y", (0.0, -math.pi / 2)),
    ]
    suggestions = []
    for name, (rx, ry) in orientations:
        sx, cx = math.sin(rx), math.cos(rx)
        sy, cy = math.sin(ry), math.cos(ry)
        oa = 0.0
        ta = 0.0
        for nx, ny, nz, area, _cz in faces:
            ta += area
            # rotate about X then Y (normal only)
            ny1 = ny * cx - nz * sx
            nz1 = ny * sx + nz * cx
            nz2 = -nx * sy + nz1 * cy
            if -nz2 > cos_thresh:
                oa += area
        suggestions.append({
            "orientation": name,
            "overhang_fraction": round(oa / ta, 4) if ta > 0 else 0.0,
        })
    suggestions.sort(key=lambda s: s["overhang_fraction"])

    return {
        "overhang_fraction": round(overhang_fraction, 4),
        "overhang_threshold_deg": _OVERHANG_THRESHOLD_DEG,
        "bridges": {"count": bridge_count, "area_mm2": round(bridge_area, 1)},
        "orientation_suggestions": suggestions,
    }


def analyze_stl(stl: bytes) -> dict:
    """Return a mesh health report for STL bytes.

    Counts open edges (used by exactly one triangle → holes) and non-manifold
    edges (used by >2 triangles). A closed, manifold mesh (watertight) slices
    cleanly; open/non-manifold meshes often need repair.
    """
    verts, tris = _parse(stl)
    if len(verts) < 3 or len(tris) < 1:
        return {"ok": False, "error": "mesh has no usable geometry",
                "vertices": len(verts), "triangles": len(tris)}

    edge_count: dict[tuple[int, int], int] = {}
    for a, b, c in tris:
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            edge_count[key] = edge_count.get(key, 0) + 1

    open_edges = sum(1 for n in edge_count.values() if n == 1)
    non_manifold = sum(1 for n in edge_count.values() if n > 2)
    watertight = open_edges == 0 and non_manifold == 0

    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    bbox = {
        "min": [min(xs), min(ys), min(zs)],
        "max": [max(xs), max(ys), max(zs)],
        "size": [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
    }

    warnings = []
    if open_edges:
        warnings.append(f"{open_edges} open edge(s) — model is not closed")
    if non_manifold:
        warnings.append(f"{non_manifold} non-manifold edge(s) — geometry overlaps")

    printability = _printability(verts, tris, bbox["min"][2])
    pct = round(printability["overhang_fraction"] * 100)
    if pct >= 20:
        warnings.append(f"{pct}% of the surface overhangs >45° — supports likely needed")
    # Suggest a better orientation if a flip meaningfully cuts overhang.
    best = printability["orientation_suggestions"][0]
    if best["orientation"] != "as-loaded" and best["overhang_fraction"] + 0.05 < printability["overhang_fraction"]:
        warnings.append(
            f"Tip: {best['orientation']} would cut overhang to "
            f"{round(best['overhang_fraction'] * 100)}%")

    return {
        "ok": True,
        "vertices": len(verts),
        "triangles": len(tris),
        "open_edges": open_edges,
        "non_manifold_edges": non_manifold,
        "watertight": watertight,
        "bbox": bbox,
        "printability": printability,
        "warnings": warnings,
    }
