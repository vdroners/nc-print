"""STL → bare 3MF conversion.

The 3DPrintForge Slicer engine build in this image CANNOT load STL files
(`return -6, "Loading of a model file failed"` — reproduces on the host binary
too, so it is a property of the engine, not the container). It loads 3MF fine.

nc-print's frontend always uploads STL (it converts even 3MF sources to STL
before slicing), so the adapter converts the uploaded STL into a minimal
geometry-only 3MF the engine accepts. No embedded slicer config is written, so
CLI `--load-settings` presets apply cleanly.
"""
from __future__ import annotations

import os
import struct
import zipfile

_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" '
    'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="model" '
    'ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    "</Types>"
)

_RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Relationships '
    'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
    'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    "</Relationships>"
)


def _is_ascii_stl(data: bytes) -> bool:
    head = data[:256].lstrip()
    if not head.lower().startswith(b"solid"):
        return False
    # A binary STL can also start with "solid"; disambiguate by checking the
    # declared triangle count against the file size.
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + n * 50 == len(data):
            return False
    return b"facet" in data[:2048].lower()


def _parse_ascii_stl(data: bytes) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    verts: list[tuple[float, float, float]] = []
    for line in data.decode("ascii", "ignore").splitlines():
        line = line.strip()
        if line.startswith("vertex"):
            parts = line.split()
            if len(parts) >= 4:
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
    tris = [(i, i + 1, i + 2) for i in range(0, len(verts) - 2, 3)]
    return verts, tris


def _parse_binary_stl(data: bytes) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    n = struct.unpack_from("<I", data, 80)[0]
    verts: list[tuple[float, float, float]] = []
    off = 84
    for _ in range(n):
        off += 12  # skip normal
        for _v in range(3):
            x, y, z = struct.unpack_from("<3f", data, off)
            off += 12
            verts.append((x, y, z))
        off += 2  # attribute byte count
    tris = [(i, i + 1, i + 2) for i in range(0, len(verts) - 2, 3)]
    return verts, tris


def _dedup(
    verts: list[tuple[float, float, float]],
    tris: list[tuple[int, int, int]],
) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    """Weld coincident vertices so the mesh is manifold enough to slice.

    A per-vertex STL yields 3N unique indices; welding to shared vertices avoids
    the engine rejecting the mesh as non-watertight.
    """
    index: dict[tuple[int, int, int], int] = {}
    out_v: list[tuple[float, float, float]] = []
    remap: list[int] = []
    for v in verts:
        # quantize to 1e-4 mm to merge float noise
        key = (round(v[0] * 1e4), round(v[1] * 1e4), round(v[2] * 1e4))
        idx = index.get(key)
        if idx is None:
            idx = len(out_v)
            index[key] = idx
            out_v.append(v)
        remap.append(idx)
    out_t = []
    for a, b, c in tris:
        na, nb, nc = remap[a], remap[b], remap[c]
        if na != nb and nb != nc and na != nc:  # drop degenerate triangles
            out_t.append((na, nb, nc))
    return out_v, out_t


# Upper bound so a photogrammetry-scale mesh can't OOM the container (4 GB
# mem_limit) or wedge the slice queue. ~2M triangles is well beyond any normal
# FDM print; larger meshes should be decimated before upload.
MAX_TRIANGLES = int(os.environ.get("MAX_MESH_TRIANGLES", "2000000"))


def stl_bytes_to_3mf(stl: bytes, out_path: str) -> tuple[int, int]:
    """Write a bare geometry 3MF from STL bytes. Returns (vertex, triangle) count."""
    # Cheap pre-parse triangle count from a binary STL header, so we reject a
    # huge mesh before allocating millions of Python tuples.
    if not _is_ascii_stl(stl) and len(stl) >= 84:
        declared = struct.unpack_from("<I", stl, 80)[0]
        if declared > MAX_TRIANGLES:
            raise ValueError(
                f"mesh too large to slice ({declared} triangles; max "
                f"{MAX_TRIANGLES}). Decimate the model before uploading.")
    if _is_ascii_stl(stl):
        verts, tris = _parse_ascii_stl(stl)
    else:
        verts, tris = _parse_binary_stl(stl)
    if len(tris) > MAX_TRIANGLES:
        raise ValueError(
            f"mesh too large to slice ({len(tris)} triangles; max "
            f"{MAX_TRIANGLES}). Decimate the model before uploading.")
    verts, tris = _dedup(verts, tris)
    if len(verts) < 4 or len(tris) < 4:
        raise ValueError(f"mesh too small to slice ({len(verts)} verts, {len(tris)} tris)")

    vx = "".join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in verts)
    tx = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tris)
    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f'<resources><object id="1" type="model"><mesh>'
        f"<vertices>{vx}</vertices><triangles>{tx}</triangles>"
        "</mesh></object></resources>"
        '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>'
        "</model>"
    )
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _CONTENT_TYPES)
        z.writestr("_rels/.rels", _RELS)
        z.writestr("3D/3dmodel.model", model)
    return len(verts), len(tris)


def _parse_and_check(stl: bytes):
    """Parse + weld an STL, enforcing size bounds. Returns (verts, tris)."""
    if not _is_ascii_stl(stl) and len(stl) >= 84:
        declared = struct.unpack_from("<I", stl, 80)[0]
        if declared > MAX_TRIANGLES:
            raise ValueError(
                f"mesh too large to slice ({declared} triangles; max {MAX_TRIANGLES})")
    verts, tris = (_parse_ascii_stl(stl) if _is_ascii_stl(stl)
                   else _parse_binary_stl(stl))
    if len(tris) > MAX_TRIANGLES:
        raise ValueError(
            f"mesh too large to slice ({len(tris)} triangles; max {MAX_TRIANGLES})")
    verts, tris = _dedup(verts, tris)
    if len(verts) < 4 or len(tris) < 4:
        raise ValueError(f"mesh too small to slice ({len(verts)} verts, {len(tris)} tris)")
    return verts, tris


def _model_settings_config(object_overrides: list[dict] | None, count: int) -> str | None:
    """Build OrcaSlicer's Metadata/model_settings.config for per-object settings.

    `object_overrides[i]` (aligned to the STL list, 1-based object ids) is a dict
    of FRONTEND override keys -> values; each is mapped to the engine process key
    via overrides.map_process_override so per-object and global overrides share
    one mapping. Objects with no (or no valid) overrides are omitted. Returns the
    config XML, or None when nothing to write.
    """
    if not object_overrides:
        return None
    from overrides import map_process_override

    blocks = []
    for idx in range(count):
        ov = object_overrides[idx] if idx < len(object_overrides) else None
        if not isinstance(ov, dict) or not ov:
            continue
        metas = []
        for key, raw in ov.items():
            mapped = map_process_override(key, raw)
            if mapped is None:
                continue
            ek, val = mapped
            metas.append(f'<metadata key="{_xml_attr(ek)}" value="{_xml_attr(val)}"/>')
        if metas:
            blocks.append(f'<object id="{idx + 1}">{"".join(metas)}</object>')
    if not blocks:
        return None
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<config>{"".join(blocks)}</config>')


def _xml_attr(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace('"', "&quot;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def stls_to_multiobject_3mf(
    stls: list[bytes],
    out_path: str,
    object_overrides: list[dict] | None = None,
) -> tuple[int, int]:
    """Write a 3MF containing one <object> per input STL.

    Each object is placed at the origin (identity transform); the engine's
    `--arrange` positions them on the plate. When `object_overrides` is given,
    also writes Metadata/model_settings.config so the engine applies per-object
    process settings. Returns (object_count, total_tris).
    """
    if not stls:
        raise ValueError("no models supplied")
    objects_xml = []
    build_xml = []
    total_tris = 0
    for i, stl in enumerate(stls, start=1):
        verts, tris = _parse_and_check(stl)
        total_tris += len(tris)
        vx = "".join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in verts)
        tx = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tris)
        objects_xml.append(
            f'<object id="{i}" type="model"><mesh>'
            f"<vertices>{vx}</vertices><triangles>{tx}</triangles>"
            "</mesh></object>")
        build_xml.append(f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>')
    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f'<resources>{"".join(objects_xml)}</resources>'
        f'<build>{"".join(build_xml)}</build>'
        "</model>"
    )
    settings_cfg = _model_settings_config(object_overrides, len(stls))
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _CONTENT_TYPES)
        z.writestr("_rels/.rels", _RELS)
        z.writestr("3D/3dmodel.model", model)
        if settings_cfg is not None:
            z.writestr("Metadata/model_settings.config", settings_cfg)
    return len(stls), total_tris
