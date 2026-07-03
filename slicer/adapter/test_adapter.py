"""Unit tests for the adapter's pure-logic modules (no engine/container needed).

Run: python3 -m pytest slicer/adapter/test_adapter.py   (or plain: python3 test_adapter.py)
Covers STL→3MF conversion and the gcode-footer metadata parser. The preset
resolver needs the on-disk preset tree, so it is exercised by the container
smoke test rather than here.
"""
import os
import struct
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(__file__))

from mesh3mf import stl_bytes_to_3mf  # noqa: E402


def _binary_cube(size=20.0) -> bytes:
    v = [(0, 0, 0), (size, 0, 0), (size, size, 0), (0, size, 0),
         (0, 0, size), (size, 0, size), (size, size, size), (0, size, size)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
             (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    buf = b"\0" * 80 + struct.pack("<I", len(faces))
    for a, b, c in faces:
        buf += struct.pack("<3f", 0, 0, 0)
        for i in (a, b, c):
            buf += struct.pack("<3f", *v[i])
        buf += struct.pack("<H", 0)
    return buf


_ASCII_TRIANGLE = b"""solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 10 0 0
  vertex 0 10 0
 endloop
endfacet
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 0 10 0
  vertex 0 0 10
 endloop
endfacet
endsolid t
"""


def test_binary_stl_to_3mf_welds_vertices():
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "m.3mf")
        nv, nt = stl_bytes_to_3mf(_binary_cube(), out)
        # A cube welds to 8 shared vertices / 12 triangles.
        assert nv == 8, nv
        assert nt == 12, nt
        assert zipfile.is_zipfile(out)
        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            assert "3D/3dmodel.model" in names
            assert "[Content_Types].xml" in names
            model = z.read("3D/3dmodel.model").decode()
            assert "<vertices>" in model and "<triangle " in model


def test_ascii_stl_parsed():
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "m.3mf")
        # Two triangles → after weld: 4 unique verts, 2 tris (too small to slice,
        # but conversion itself must not raise until the size guard).
        try:
            stl_bytes_to_3mf(_ASCII_TRIANGLE, out)
        except ValueError as e:
            assert "too small" in str(e)


def test_degenerate_mesh_rejected():
    tiny = b"solid t\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 0 0 0\n  vertex 0 0 0\n endloop\nendfacet\nendsolid t\n"
    with tempfile.TemporaryDirectory() as d:
        raised = False
        try:
            stl_bytes_to_3mf(tiny, os.path.join(d, "m.3mf"))
        except ValueError:
            raised = True
        assert raised


def test_duration_parser():
    from main import _parse_duration
    assert _parse_duration("16m 29s") == 989
    assert _parse_duration("1h 2m 3s") == 3723
    assert _parse_duration("0.49s") == 0
    assert _parse_duration("no numbers") is None


def test_override_mapping_scopes_and_keys():
    from overrides import split_overrides
    proc, fil, unknown = split_overrides({
        "layer_height": 0.3,
        "infill_density": 0.55,       # 0-1 -> "55%"
        "perimeters": 3,
        "nozzle_temperature": 215,    # filament-scoped
        "bed_temperature": 60,        # filament-scoped, remapped key
        "enable_support": True,
        "support_type": "tree",
        "bogus_key": 1,
    })
    # process-scoped, mapped to engine keys
    assert proc["layer_height"] == "0.3"
    assert proc["sparse_infill_density"] == "55%"
    assert proc["wall_loops"] == "3"
    assert proc["enable_support"] == "1"
    assert proc["support_type"] == "tree(auto)"
    # filament-scoped
    assert fil["nozzle_temperature"] == "215"
    assert fil["hot_plate_temp"] == "60"
    # unknown keys reported, not silently applied
    assert "bogus_key" in unknown


def test_override_percent_forms():
    from overrides import split_overrides
    # already-percent value (55) and fractional (0.55) both -> "55%"
    p1, _, _ = split_overrides({"infill_density": 55})
    p2, _, _ = split_overrides({"infill_density": 0.55})
    assert p1["sparse_infill_density"] == "55%"
    assert p2["sparse_infill_density"] == "55%"


def test_merge_preset_writes_copy():
    import json
    from overrides import merge_preset
    with tempfile.TemporaryDirectory() as d:
        base = os.path.join(d, "base.json")
        json.dump({"type": "process", "name": "Base", "inherits": "parent",
                   "layer_height": "0.24"}, open(base, "w"))
        out = os.path.join(d, "merged.json")
        result = merge_preset(base, {"layer_height": "0.3"}, out)
        assert result == out
        merged = json.load(open(out))
        assert merged["layer_height"] == "0.3"       # overwritten
        assert merged["name"] == "Base"              # preserved
        assert merged["inherits"] == "parent"        # preserved
        # empty patch returns the base path unchanged
        assert merge_preset(base, {}, out) == base


def test_mesh_too_large_rejected():
    import struct
    from mesh3mf import stl_bytes_to_3mf, MAX_TRIANGLES
    # Binary STL header claiming more than the cap → rejected on the cheap path.
    fake = b"\0" * 80 + struct.pack("<I", MAX_TRIANGLES + 1)
    with tempfile.TemporaryDirectory() as d:
        raised = False
        try:
            stl_bytes_to_3mf(fake, os.path.join(d, "m.3mf"))
        except ValueError as e:
            raised = "too large" in str(e)
        assert raised


if __name__ == "__main__":
    import traceback
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except Exception:  # noqa: BLE001
                failures += 1
                print(f"FAIL {name}")
                traceback.print_exc()
    sys.exit(1 if failures else 0)
