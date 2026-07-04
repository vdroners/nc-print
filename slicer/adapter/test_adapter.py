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


def test_override_surface_quality_keys():
    from overrides import split_overrides
    proc, fil, unknown = split_overrides({
        "adaptive_layer_height": True,
        "ironing_type": "top",
        "fuzzy_skin": "external",
        "seam_position": "aligned",
    })
    assert proc["adaptive_layer_height"] == "1"
    assert proc["ironing_type"] == "top"
    assert proc["fuzzy_skin"] == "external"
    assert proc["seam_position"] == "aligned"
    assert fil == {}
    assert unknown == []


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


_SAMPLE_GCODE = """; header
;LAYER_CHANGE
;Z:0.2
;HEIGHT:0.2
;TYPE:Outer wall
G1 X0 Y0 Z0.2 E0
G1 X10 Y0 E1
G1 X10 Y10 E2
;TYPE:Sparse infill
G1 X5 Y5 E3
G0 X0 Y0
;LAYER_CHANGE
;Z:0.4
;HEIGHT:0.2
;TYPE:Outer wall
G1 X0 Y0 Z0.4 E4
G1 X10 Y0 E5
"""


def test_toolpath_parser_layers_and_features():
    import tempfile as tf
    from gcode_toolpath import parse_toolpath
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write(_SAMPLE_GCODE)
        path = f.name
    try:
        tp = parse_toolpath(path)
    finally:
        os.unlink(path)
    assert tp["meta"]["layer_count"] == 2, tp["meta"]
    l0 = tp["layers"][0]
    assert l0["z"] == 0.2
    assert l0["height"] == 0.2
    # outer_wall extruding segments present; a travel (G0) captured separately
    assert "outer_wall" in l0["segments"]
    assert "travel" in l0["segments"]
    # positions are flat [x0,y0,z0,x1,y1,z1,...] — multiple of 6
    ow = l0["segments"]["outer_wall"]["positions"]
    assert len(ow) % 6 == 0 and len(ow) >= 6
    # bbox spans the moves
    assert tp["bbox"]["min"][2] == 0.2
    assert tp["bbox"]["max"][2] == 0.4


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


def test_mesh_analyze_watertight_cube():
    from mesh_analyze import analyze_stl
    rep = analyze_stl(_binary_cube())
    assert rep["ok"] is True
    assert rep["triangles"] == 12
    assert rep["vertices"] == 8
    assert rep["watertight"] is True
    assert rep["open_edges"] == 0
    assert rep["non_manifold_edges"] == 0
    assert rep["bbox"]["size"] == [20.0, 20.0, 20.0]


def test_mesh_analyze_open_mesh():
    from mesh_analyze import analyze_stl
    import struct
    # Two triangles sharing one edge → the other edges are open (used once).
    v = [(0, 0, 0), (10, 0, 0), (0, 10, 0), (10, 10, 0)]
    faces = [(0, 1, 2), (1, 3, 2)]
    buf = b"\0" * 80 + struct.pack("<I", len(faces))
    for a, b, c in faces:
        buf += struct.pack("<3f", 0, 0, 1)
        for i in (a, b, c):
            buf += struct.pack("<3f", *v[i])
        buf += struct.pack("<H", 0)
    rep = analyze_stl(buf)
    assert rep["ok"] is True
    assert rep["watertight"] is False
    assert rep["open_edges"] > 0


def test_calibration_list_includes_temp_tower():
    from calibration import list_calibrations
    items = list_calibrations()
    ids = [c["id"] for c in items]
    assert "temp_tower" in ids
    tower = next(c for c in items if c["id"] == "temp_tower")
    assert tower["kind"] == "parametric"
    assert "params" in tower


def test_temp_tower_generation():
    import zipfile
    from calibration import generate_temp_tower_3mf
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "tower.3mf")
        meta = generate_temp_tower_3mf(out, temp_start=215, temp_end=195, step=5)
        # 215,210,205,200,195 -> 5 steps
        assert len(meta["steps"]) == 5
        assert meta["steps"][0]["temp"] == 215
        assert meta["steps"][-1]["temp"] == 195
        assert meta["height"] == 50.0  # 5 * 10mm
        assert zipfile.is_zipfile(out)
        with zipfile.ZipFile(out) as z:
            model = z.read("3D/3dmodel.model").decode()
            assert "<vertices>" in model and "<triangle " in model


def test_multiobject_3mf_has_all_objects():
    import zipfile
    from mesh3mf import stls_to_multiobject_3mf
    stls = [_binary_cube(), _binary_cube(), _binary_cube()]
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "multi.3mf")
        n, tris = stls_to_multiobject_3mf(stls, out)
        assert n == 3
        assert tris == 36  # 12 tris x 3 cubes
        with zipfile.ZipFile(out) as z:
            model = z.read("3D/3dmodel.model").decode()
            # one <object> per model + one <item> per model
            assert model.count("<object id=") == 3
            assert model.count("<item objectid=") == 3


def test_multiobject_3mf_rejects_empty():
    from mesh3mf import stls_to_multiobject_3mf
    raised = False
    try:
        stls_to_multiobject_3mf([], "/tmp/none.3mf")
    except ValueError:
        raised = True
    assert raised


def test_support_type_snug_maps_to_style():
    from overrides import split_overrides
    proc, _, _ = split_overrides({"support_type": "snug", "enable_support": True})
    assert proc["support_type"] == "normal(auto)"
    assert proc["support_style"] == "snug"
    proc2, _, _ = split_overrides({"support_type": "tree"})
    assert proc2["support_type"] == "tree(auto)"
    assert "support_style" not in proc2


def test_toolpath_move_cap_truncates():
    import tempfile as tf
    import importlib
    import gcode_toolpath as gt
    # Force a tiny cap so a small gcode trips it.
    orig = gt.MAX_TOOLPATH_MOVES
    gt.MAX_TOOLPATH_MOVES = 3
    try:
        lines = [";LAYER_CHANGE", ";Z:0.2", ";TYPE:Outer wall"]
        for i in range(20):
            lines.append(f"G1 X{i} Y{i} Z0.2 E{i + 1}")
        with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
            f.write("\n".join(lines))
            path = f.name
        try:
            tp = gt.parse_toolpath(path)
        finally:
            os.unlink(path)
        assert tp["meta"]["truncated"] is True
        assert tp["meta"]["moves"] <= 4  # cap + at most one over
    finally:
        gt.MAX_TOOLPATH_MOVES = orig


def test_toolpath_not_truncated_when_under_cap():
    import tempfile as tf
    import gcode_toolpath as gt
    lines = [";LAYER_CHANGE", ";Z:0.2", ";TYPE:Outer wall",
             "G1 X0 Y0 Z0.2 E1", "G1 X10 Y0 E2"]
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write("\n".join(lines))
        path = f.name
    try:
        tp = gt.parse_toolpath(path)
    finally:
        os.unlink(path)
    assert tp["meta"]["truncated"] is False


def test_calib_id_validation_regex():
    import re as _re
    ok = _re.fullmatch(r"[A-Za-z0-9_]+", "temp_tower")
    bad1 = _re.fullmatch(r"[A-Za-z0-9_]+", "../etc/passwd")
    bad2 = _re.fullmatch(r"[A-Za-z0-9_]+", "flow-linear")  # hyphen rejected
    assert ok is not None
    assert bad1 is None
    assert bad2 is None


_BREAKDOWN_GCODE = """; filament_diameter = 1.75
; filament_density = 1.24
;LAYER_CHANGE
;Z:0.2
;TYPE:Outer wall
G1 X0 Y0 E0
G1 X10 Y0 E200
;TYPE:Support
G1 X0 Y5 E250
G1 X10 Y5 E300
;LAYER_CHANGE
;Z:0.4
;TYPE:Inner wall
G1 X0 Y0 E500
"""


def test_breakdown_splits_model_vs_support():
    import tempfile as tf
    from gcode_stats import compute_breakdown
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write(_BREAKDOWN_GCODE)
        path = f.name
    try:
        b = compute_breakdown(path)
    finally:
        os.unlink(path)
    # model extrusion (1 + 1 = 2mm) vs support (0.5 + 0.5 = 1mm) → support < model
    assert b["model_filament_g"] > 0
    assert b["support_filament_g"] > 0
    assert b["support_filament_g"] < b["model_filament_g"]
    assert abs(b["total_filament_g"] - (b["model_filament_g"] + b["support_filament_g"])) < 0.01
    assert 0 < b["support_time_frac"] < 1


def test_pause_injection_places_commands_at_heights():
    import tempfile as tf
    from gcode_postprocess import inject_pauses
    gcode = "\n".join([
        ";LAYER_CHANGE", ";Z:0.2", "G1 X0 Y0 E1",
        ";LAYER_CHANGE", ";Z:5.0", "G1 X1 Y1 E2",
        ";LAYER_CHANGE", ";Z:10.0", "G1 X2 Y2 E3",
    ])
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write(gcode)
        path = f.name
    try:
        n = inject_pauses(path, [{"height": 5.0, "type": "filament_change"},
                                 {"height": 9.0, "type": "pause"}])
        out = open(path).read()
    finally:
        os.unlink(path)
    assert n == 2
    assert "M600" in out and "M601" in out
    # M600 must appear before its ;Z:5.0 layer
    assert out.index("M600") < out.index(";Z:5.0")
    # M601 (height 9) lands at the first layer >= 9, i.e. ;Z:10.0
    assert out.index("M601") < out.index(";Z:10.0")


def test_pause_injection_rejects_unsafe_command():
    import tempfile as tf
    from gcode_postprocess import inject_pauses
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write(";LAYER_CHANGE\n;Z:5.0\nG1 X0 Y0 E1\n")
        path = f.name
    try:
        # arbitrary command not in the safe set is dropped
        n = inject_pauses(path, [{"height": 5.0, "command": "M104 S500"}])
    finally:
        os.unlink(path)
    assert n == 0


def test_kill_proc_terminates_running_process():
    import subprocess as sp
    import time as _t
    from main import _kill_proc
    proc = sp.Popen(["sleep", "30"])
    assert proc.poll() is None
    _kill_proc(proc)
    # give it a moment to reap
    for _ in range(30):
        if proc.poll() is not None:
            break
        _t.sleep(0.1)
    assert proc.poll() is not None


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
