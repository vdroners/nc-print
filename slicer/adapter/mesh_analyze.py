"""Server-side mesh health analysis for uploaded STL models.

Runs before/independently of slicing so the UI can warn about non-watertight or
degenerate meshes (a common cause of failed or ugly slices) without shipping a
mesh library. Reuses the STL parser from mesh3mf.
"""
from __future__ import annotations

from mesh3mf import _dedup, _is_ascii_stl, _parse_ascii_stl, _parse_binary_stl


def _parse(stl: bytes):
    if _is_ascii_stl(stl):
        verts, tris = _parse_ascii_stl(stl)
    else:
        verts, tris = _parse_binary_stl(stl)
    return _dedup(verts, tris)


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

    return {
        "ok": True,
        "vertices": len(verts),
        "triangles": len(tris),
        "open_edges": open_edges,
        "non_manifold_edges": non_manifold,
        "watertight": watertight,
        "bbox": bbox,
        "warnings": warnings,
    }
