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


def test_slim_profile_drops_settings():
    # The list projection keeps id/name/vendor/kind/default and DROPS the heavy
    # `settings` object (the ~5MB-list bloat that tripped the client timeout).
    from main import slim_profile
    full = {"id": "Generic PLA @System", "name": "Generic PLA @System",
            "vendor": "OrcaFilamentLibrary", "kind": "filament", "is_default": False,
            "settings": {"layer_height": "0.2", "a": "b", "big": "x" * 5000}}
    slim = slim_profile(full)
    assert slim == {"id": "Generic PLA @System", "name": "Generic PLA @System",
                    "vendor": "OrcaFilamentLibrary", "kind": "filament",
                    "is_default": False}
    assert "settings" not in slim


def test_find_profile_settings_by_name_and_kind():
    from main import find_profile_settings
    profiles = [
        {"name": "A", "kind": "filament", "settings": {"x": "1"}},
        {"name": "A", "kind": "process", "settings": {"y": "2"}},
    ]
    assert find_profile_settings(profiles, "A", "filament") == {"x": "1"}
    assert find_profile_settings(profiles, "A", "process") == {"y": "2"}
    assert find_profile_settings(profiles, "A") == {"x": "1"}  # first match, kind optional
    assert find_profile_settings(profiles, "missing") is None


def test_sliceable_profiles_drops_unresolvable_printers():
    # The engine lists a built-in "Default Printer" with no on-disk machine
    # preset; slicing it raises "unknown printer preset". _sliceable_profiles
    # must drop such printers from the LIST while leaving process/filament alone.
    import main

    class FakeIndex:
        def path_for(self, kind, name):
            # Only real Creality machines resolve; "Default Printer" does not.
            if kind == "machine" and name and name.startswith("Creality"):
                return f"/data/machine/{name}.json"
            return None

    orig = main._index
    main._index = lambda: FakeIndex()
    try:
        profiles = [
            {"name": "Default Printer", "kind": "printer"},
            {"name": "Creality K1 Max (0.4 nozzle)", "kind": "printer"},
            {"name": "Generic PLA", "kind": "filament"},
            {"name": "0.20mm Standard", "kind": "process"},
        ]
        out = main._sliceable_profiles(profiles)
        names = [(p["name"], p["kind"]) for p in out]
        assert ("Default Printer", "printer") not in names
        assert ("Creality K1 Max (0.4 nozzle)", "printer") in names
        # non-printer kinds always pass through (repaired at slice time)
        assert ("Generic PLA", "filament") in names
        assert ("0.20mm Standard", "process") in names
    finally:
        main._index = orig


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
G1 X0 Y0 Z0.2 E0 F1800
G1 X10 Y0 E1
G1 X10 Y10 E2
;TYPE:Sparse infill
G1 X5 Y5 E3 F7200
G0 X0 Y0 F9000
;LAYER_CHANGE
;Z:0.4
;HEIGHT:0.2
;TYPE:Outer wall
G1 X0 Y0 Z0.4 E4 F1800
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
    # one speed per SEGMENT (per 6 position floats) for color-by-speed
    ows = l0["segments"]["outer_wall"]["speeds"]
    assert len(ows) * 6 == len(ow)
    # F1800 mm/min → 30 mm/s (sticky across the following moves)
    assert ows[0] == 30.0
    # speed range excludes travel; outer-wall 30, sparse-infill 120 mm/s
    assert tp["meta"]["speed_min"] == 30.0
    assert tp["meta"]["speed_max"] == 120.0
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
            # Every build item is placed at IDENTITY: the multi-object slice path
            # bakes each part's world placement into its STL vertices and slices
            # with arrange=0, so the engine must NOT re-lay-out via item transforms.
            assert model.count('transform="1 0 0 0 1 0 0 0 1 0 0 0"') == 3


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


def _fake_index(by_name, cache):
    """A PresetIndex with its filesystem scan replaced by in-memory data.
    by_name: {kind: {name: path}}; cache: {path: parsed-json}.
    """
    from presets import PresetIndex
    idx = PresetIndex.__new__(PresetIndex)  # skip __init__ (no fs scan)
    idx._by_name = by_name
    idx._cache = cache
    return idx


def test_resolve_triple_happy_path():
    from presets import resolve_triple
    idx = _fake_index(
        by_name={
            "machine": {"P1 0.4": "/m/p1.json"},
            "process": {"0.2 Std @P1": "/pr/std.json"},
            "filament": {"PLA @P1": "/f/pla.json"},
        },
        cache={
            "/pr/std.json": {"compatible_printers": ["P1 0.4"]},
            "/f/pla.json": {"compatible_printers": ["P1 0.4"]},
        },
    )
    m, p, fs, warn = resolve_triple(idx, "P1 0.4", "0.2 Std @P1", ["PLA @P1"])
    assert m == "/m/p1.json"
    assert p == "/pr/std.json"
    assert fs == ["/f/pla.json"]
    assert warn == []


def test_resolve_triple_repairs_incompatible_process_and_filament():
    from presets import resolve_triple
    idx = _fake_index(
        by_name={
            "machine": {"P1 0.4": "/m/p1.json"},
            "process": {"good @P1": "/pr/good.json", "bad @P2": "/pr/bad.json"},
            "filament": {"good f @P1": "/f/good.json", "bad f @P2": "/f/bad.json"},
        },
        cache={
            "/pr/good.json": {"compatible_printers": ["P1 0.4"]},
            "/pr/bad.json": {"compatible_printers": ["P2 0.4"]},
            "/f/good.json": {"compatible_printers": ["P1 0.4"]},
            "/f/bad.json": {"compatible_printers": ["P2 0.4"]},
        },
    )
    m, p, fs, warn = resolve_triple(idx, "P1 0.4", "bad @P2", ["bad f @P2"])
    # incompatible selections are swapped for compatible ones
    assert p == "/pr/good.json"
    assert fs == ["/f/good.json"]
    assert any("not compatible" in w for w in warn)


def test_resolve_triple_unknown_printer_raises():
    from presets import resolve_triple
    idx = _fake_index({"machine": {}, "process": {}, "filament": {}}, {})
    raised = False
    try:
        resolve_triple(idx, "No Such Printer", "", [])
    except ValueError as e:
        raised = "unknown printer" in str(e)
    assert raised


def test_resolve_triple_supplies_filament_when_none_given():
    from presets import resolve_triple
    idx = _fake_index(
        by_name={
            "machine": {"P1 0.4": "/m/p1.json"},
            "process": {"std @P1": "/pr/std.json"},
            "filament": {"PLA @P1": "/f/pla.json"},
        },
        cache={
            "/pr/std.json": {"compatible_printers": ["P1 0.4"]},
            "/f/pla.json": {"compatible_printers": ["P1 0.4"]},
        },
    )
    m, p, fs, warn = resolve_triple(idx, "P1 0.4", "std @P1", [])
    assert fs == ["/f/pla.json"]
    assert any("no usable filament" in w for w in warn)


def test_calibration_generators_all_emit_valid_gcode():
    from calibration_gcode import list_gcode_calibrations, generate
    ids = [c["id"] for c in list_gcode_calibrations()]
    assert set(ids) == {
        "temp-tower", "retract-tower", "flow-test", "pressure-advance",
        "pressure-advance-pattern", "first-layer", "single-line",
        "tolerance", "input-shaping",
    }
    for cid in ids:
        r = generate(cid)
        assert r["gcode"], f"{cid} produced no gcode"
        assert f"; CALIBRATION:{r['type']}" in r["gcode"], f"{cid} missing header"
        assert "CALIBRATION_END" in r["gcode"], f"{cid} missing end marker"
        assert isinstance(r["filament_g"], (int, float))
        assert r["expected_minutes"] >= 1


def test_temp_tower_steps_are_monotonic():
    from calibration_gcode import generate
    import re
    r = generate("temp-tower", {"hotendStart": 200, "hotendEnd": 230, "blocks": 4})
    # Block M104 commands after the prelude preheat should ascend to hotendEnd.
    temps = [int(m) for m in re.findall(r"M104 S(\d+)", r["gcode"])]
    assert temps[-1] == 0 or 230 in temps  # POSTLUDE sets M104 S0; blocks hit 230
    block_temps = [t for t in temps if t > 0]
    assert block_temps == sorted(block_temps)
    assert 230 in block_temps


def test_calibration_generate_validates():
    from calibration_gcode import generate
    raised = False
    try:
        generate("temp-tower", {"hotendStart": 250, "hotendEnd": 200})  # low >= high
    except ValueError:
        raised = True
    assert raised
    raised2 = False
    try:
        generate("no-such-type")
    except ValueError:
        raised2 = True
    assert raised2


def test_tolerance_and_input_shaping_generators():
    from calibration_gcode import generate
    tol = generate("tolerance", {"clearanceStart": 0.0, "clearanceEnd": 0.4, "blocks": 5})
    assert "; CALIBRATION:tolerance" in tol["gcode"]
    assert "CALIBRATION_END" in tol["gcode"]
    assert tol["filament_g"] > 0 and tol["expected_minutes"] >= 1
    ish = generate("input-shaping", {"speedStart": 50, "speedEnd": 150, "firmware": "klipper"})
    assert "; CALIBRATION:input-shaping" in ish["gcode"]
    assert "SET_VELOCITY_LIMIT" in ish["gcode"]  # klipper limits ramp
    ish_m = generate("input-shaping", {"firmware": "marlin"})
    assert "M201" in ish_m["gcode"] and "M203" in ish_m["gcode"]
    # range validation still bites
    raised = False
    try:
        generate("tolerance", {"clearanceStart": 0.5, "clearanceEnd": 0.1})
    except ValueError:
        raised = True
    assert raised


def test_filament_materials_catalog():
    from filament_materials import get_all_materials, get_material_by_id, get_materials_by_category
    mats = get_all_materials()
    assert len(mats) == 15
    ids = {m["id"] for m in mats}
    assert {"pla", "petg", "abs", "tpu", "pa", "pc"} <= ids
    # Every entry has the fields the UI depends on.
    for m in mats:
        for key in ("nozzle_temp", "bed_temp", "properties", "drying", "category"):
            assert key in m, f"{m['id']} missing {key}"
        assert m["nozzle_temp"]["min"] <= m["nozzle_temp"]["recommended"] <= m["nozzle_temp"]["max"]
    pla = get_material_by_id("PLA".lower())
    assert pla["nozzle_temp"]["recommended"] == 210
    assert pla["bed_temp"]["recommended"] == 55
    comps = get_materials_by_category("composite")
    assert len(comps) == 5 and all(m["category"] == "composite" for m in comps)


def test_filament_material_name_lookup():
    from filament_materials import get_material_by_name, get_material_by_id
    assert get_material_by_name("Nylon")["id"] == "pa"
    assert get_material_by_name("PA-CF")["id"] == "pa-cf"
    # Compound / branded names fall back to a substring match.
    assert get_material_by_name("Bambu PLA Basic")["id"] == "pla"
    assert get_material_by_name("") is None
    assert get_material_by_id("no-such-id") is None


def test_flush_volume_is_asymmetric_and_clamped():
    from color_order import flush_volume_mm3, MIN_FLUSH_VOL, MAX_FLUSH_VOL
    # Switching to a lighter color costs more purge than going darker.
    to_light = flush_volume_mm3("#000000", "#FFFFFF")
    to_dark = flush_volume_mm3("#FFFFFF", "#000000")
    assert to_light > to_dark
    # Every result is within the clamp band.
    for a, b in [("#000000", "#FFFFFF"), ("#FF0000", "#00FF00"), ("#123456", "#654321")]:
        v = flush_volume_mm3(a, b)
        assert MIN_FLUSH_VOL <= v <= MAX_FLUSH_VOL
    # Same color / bad hex fall back to the minimum.
    assert flush_volume_mm3("#808080", "#808080") == MIN_FLUSH_VOL
    assert flush_volume_mm3("nope", "#000000") == MIN_FLUSH_VOL


def test_optimize_color_order_reduces_purge():
    from color_order import optimize_color_order, cycle_cost, build_matrix
    # A deliberately bad load order (alternating light/dark) has slack to save.
    colors = ["#FFFFFF", "#000000", "#EEEEEE", "#111111"]
    r = optimize_color_order(colors)
    assert r["method"] == "brute-force"
    assert r["optimizedFlushMm3"] <= r["baselineFlushMm3"]
    assert r["savedMm3"] > 0 and r["savedG"] > 0
    # The reported optimum is truly the min cycle cost over the fixed-0 tours.
    m = build_matrix(colors)
    assert cycle_cost(r["order"], m) == min(
        cycle_cost([0, *p], m)
        for p in __import__("itertools").permutations(range(1, len(colors)))
    )


def test_optimize_color_order_trivial_cases():
    from color_order import optimize_color_order
    assert optimize_color_order([])["order"] == []
    one = optimize_color_order(["#FF0000"])
    assert one["order"] == [0] and one["method"] == "trivial"
    two = optimize_color_order(["#FF0000", "#00FF00"])
    assert set(two["order"]) == {0, 1} and two["savedMm3"] >= 0


def test_optimize_large_set_uses_heuristic():
    from color_order import optimize_color_order
    # 10 colors > BRUTE_LIMIT(8) -> nearest-neighbour + 2-opt path.
    colors = [f"#{i * 25 % 256:02X}0000" for i in range(10)]
    r = optimize_color_order(colors)
    assert r["method"] == "nn+2opt"
    assert len(r["order"]) == 10 and set(r["order"]) == set(range(10))


def test_basic_color_name_nearest_match():
    from color_order import basic_color_name
    assert basic_color_name("#FE0102") == "Red"
    assert basic_color_name("#808080") == "Gray"
    assert basic_color_name("#FFFFFF") == "White"
    # Bad input returns None; a color far from every palette entry also None.
    assert basic_color_name("xyz") is None
    assert basic_color_name("") is None


def test_overrides_new_quality_keys_map_to_engine_keys():
    from overrides import split_overrides
    process, filament, unknown = split_overrides({
        "infill_pattern": "gyroid",
        "top_surface_pattern": "monotonic",
        "bottom_surface_pattern": "concentric",
        "infill_speed": 120,
        "solid_infill_speed": 90,
        "support_top_gap": 0.2,
        "support_interface_layers": 2,
        "support_interface_spacing": 0.2,
        "first_layer_height": 0.25,
    })
    assert process["sparse_infill_pattern"] == "gyroid"
    assert process["top_surface_pattern"] == "monotonic"
    assert process["bottom_surface_pattern"] == "concentric"
    assert process["sparse_infill_speed"] == "120"
    assert process["internal_solid_infill_speed"] == "90"
    assert process["support_top_z_distance"] == "0.2"
    assert process["support_interface_top_layers"] == "2"
    assert process["support_interface_spacing"] == "0.2"
    assert process["initial_layer_print_height"] == "0.25"
    assert filament == {}
    assert unknown == []


def test_multiobject_3mf_writes_per_object_settings():
    import tempfile as tf
    import zipfile
    from mesh3mf import stls_to_multiobject_3mf
    cube = _binary_cube()
    out = tf.mktemp(suffix=".3mf")
    try:
        stls_to_multiobject_3mf(
            [cube, cube], out,
            object_overrides=[{"perimeters": 1}, {"perimeters": 6, "infill_density": 80}])
        z = zipfile.ZipFile(out)
        assert "Metadata/model_settings.config" in z.namelist()
        cfg = z.read("Metadata/model_settings.config").decode()
        # object 1 -> wall_loops=1; object 2 -> wall_loops=6 + sparse_infill_density=80%
        assert '<object id="1">' in cfg
        assert 'key="wall_loops" value="1"' in cfg
        assert '<object id="2">' in cfg
        assert 'key="wall_loops" value="6"' in cfg
        assert 'key="sparse_infill_density" value="80%"' in cfg
    finally:
        if os.path.exists(out):
            os.unlink(out)


def test_multiobject_3mf_omits_config_when_no_overrides():
    import tempfile as tf
    import zipfile
    from mesh3mf import stls_to_multiobject_3mf
    cube = _binary_cube()
    out = tf.mktemp(suffix=".3mf")
    try:
        # No object_overrides at all -> no model_settings.config part.
        stls_to_multiobject_3mf([cube, cube], out)
        assert "Metadata/model_settings.config" not in zipfile.ZipFile(out).namelist()
        # Empty dicts / unknown keys -> still no config (nothing valid to write).
        stls_to_multiobject_3mf([cube, cube], out, object_overrides=[{}, {"nonsense_key": 1}])
        assert "Metadata/model_settings.config" not in zipfile.ZipFile(out).namelist()
    finally:
        if os.path.exists(out):
            os.unlink(out)


def test_map_process_override_reuses_engine_keys():
    from overrides import map_process_override
    assert map_process_override("perimeters", 3) == ("wall_loops", "3")
    assert map_process_override("infill_density", 0.55) == ("sparse_infill_density", "55%")
    # filament-scoped or unknown keys are not per-object process settings.
    assert map_process_override("nozzle_temperature", 210) is None
    assert map_process_override("bogus", 1) is None
    assert map_process_override("perimeters", "") is None


def test_overrides_wipe_prime_tower_keys():
    from overrides import split_overrides
    process, filament, unknown = split_overrides({
        "enable_prime_tower": True,
        "prime_tower_width": 60,
        "prime_tower_brim_width": 3,
        "prime_volume": 45,
        "wipe_tower_rotation": 90,
        "wipe_tower_extra_spacing": 150,  # percentage -> "150%"
    })
    assert process["enable_prime_tower"] == "1"
    assert process["prime_tower_width"] == "60"
    assert process["prime_tower_brim_width"] == "3"
    assert process["prime_volume"] == "45"
    assert process["wipe_tower_rotation_angle"] == "90"
    assert process["wipe_tower_extra_spacing"] == "150%"
    assert filament == {} and unknown == []


def test_overrides_quality_and_ironing_support_keys():
    from overrides import split_overrides
    process, filament, unknown = split_overrides({
        # quality tier
        "overhang_speed_1": 0, "overhang_speed_4": 10,
        "top_shell_layers": 5, "bottom_shell_layers": 4,
        "bridge_speed": 40, "bridge_flow": 0.9, "bridge_no_support": True,
        "elephant_foot": 0.2, "infill_wall_overlap": 25,
        # ironing + support detail tier
        "ironing_flow": 12, "ironing_spacing": 0.12, "ironing_speed": 25,
        "support_interface_bottom_layers": 2, "support_base_pattern": "rectilinear",
        "tree_support_branch_angle": 40, "draft_shield": "enabled",
    })
    assert process["overhang_1_4_speed"] == "0"
    assert process["overhang_4_4_speed"] == "10"
    assert process["top_shell_layers"] == "5"
    assert process["bottom_shell_layers"] == "4"
    assert process["bridge_speed"] == "40"
    assert process["bridge_flow"] == "0.9"            # ratio, not percent
    assert process["bridge_no_support"] == "1"
    assert process["elefant_foot_compensation"] == "0.2"
    assert process["infill_wall_overlap"] == "25%"    # percent
    assert process["ironing_flow"] == "12%"           # percent
    assert process["ironing_spacing"] == "0.12"
    assert process["ironing_speed"] == "25"
    assert process["support_interface_bottom_layers"] == "2"
    assert process["support_base_pattern"] == "rectilinear"
    assert process["tree_support_branch_angle"] == "40"
    assert process["draft_shield"] == "enabled"
    assert filament == {} and unknown == []


def test_overrides_omit_empty_new_keys():
    from overrides import split_overrides
    process, _f, _u = split_overrides({
        "infill_pattern": "",
        "infill_speed": None,
        "layer_height": 0.2,
    })
    # Empty/None new keys are dropped; only the real value survives.
    assert "sparse_infill_pattern" not in process
    assert "sparse_infill_speed" not in process
    assert process["layer_height"] == "0.2"


def test_bed_type_maps_to_curr_bed_type():
    from overrides import split_overrides
    process, filament, unknown = split_overrides({"bed_type": "Textured PEI Plate"})
    assert process["curr_bed_type"] == "Textured PEI Plate"
    assert filament == {} and unknown == []


def test_bed_type_rejects_unknown_value():
    from overrides import split_overrides
    # An unrecognised plate name is dropped (engine keeps its default).
    process, _f, _u = split_overrides({"bed_type": "Glass"})
    assert "curr_bed_type" not in process


def test_bed_type_omitted_when_empty():
    from overrides import split_overrides
    process, _f, _u = split_overrides({"bed_type": ""})
    assert "curr_bed_type" not in process


def test_breakdown_separates_adhesion_bucket():
    import tempfile as tf
    from gcode_stats import compute_breakdown
    # Use large E deltas so every bucket rounds to a non-zero gram figure.
    gcode = (
        "M83\n"
        ";TYPE:Skirt\nG1 X0 Y0 E200\n"
        ";TYPE:Brim\nG1 X1 Y0 E200\n"
        ";TYPE:Outer wall\nG1 X2 Y0 E500\n"
        ";TYPE:Support\nG1 X3 Y0 E300\n"
        "; filament_diameter = 1.75\n; filament_density = 1.24\n"
    )
    with tf.NamedTemporaryFile("w", suffix=".gcode", delete=False) as f:
        f.write(gcode)
        path = f.name
    try:
        b = compute_breakdown(path)
    finally:
        os.unlink(path)
    assert b["model_filament_g"] > 0
    assert b["support_filament_g"] > 0
    assert b["adhesion_filament_g"] > 0  # skirt + brim bucketed here
    total = b["model_filament_g"] + b["support_filament_g"] + b["adhesion_filament_g"]
    assert abs(b["total_filament_g"] - total) < 0.01


def test_gcode_linter_flags_and_passes():
    from gcode_linter import lint_gcode
    # A bad file: move before homing + over-temp set.
    bad = "G1 X0 Y0\nM104 S400\nG1 X1 E5\n"
    codes = {i["code"] for i in lint_gcode(bad)["issues"]}
    assert "no-homing" in codes
    assert "hotend-too-hot" in codes
    # Cold extrusion: extrude while the hotend is set to 0 (below 150°C min).
    cold = "G28\nM104 S0\nM83\nG1 X1 E5\n"
    cold_codes = {i["code"] for i in lint_gcode(cold)["issues"]}
    assert "cold-extrusion" in cold_codes
    # A clean file: no issues.
    good = "G28\nM104 S210\nM109 S210\nM83\nG1 X0 Y0 Z0.2 F3000\nG1 X10 E1 F1200\n"
    r = lint_gcode(good)
    assert r["issues"] == []
    assert r["stats"]["commands"] == 6


def test_gcode_linter_firmware_flavour():
    from gcode_linter import lint_gcode
    codes = {i["code"] for i in lint_gcode("G28\nBED_MESH_CALIBRATE\n", firmware="marlin")["issues"]}
    assert "klipper-cmd-in-marlin" in codes
    # auto firmware does not flag flavour mismatches
    codes2 = {i["code"] for i in lint_gcode("G28\nBED_MESH_CALIBRATE\n", firmware="auto")["issues"]}
    assert "klipper-cmd-in-marlin" not in codes2


def test_gcode_reference_lookup_and_search():
    from gcode_reference import get_reference, search_reference, list_reference
    assert len(list_reference()) >= 80
    m104 = get_reference("m104")  # case-insensitive
    assert m104 and m104["category"] == "temperature"
    assert get_reference("NOPE") is None
    temps = search_reference(category="temperature")
    assert temps and all(e["category"] == "temperature" for e in temps)
    klipper = search_reference(firmware="klipper")
    assert any(e["code"] == "BED_MESH_CALIBRATE" for e in klipper)


def test_printer_presets_lookup():
    from printer_presets import find_printer_preset, list_all_presets, list_all_capabilities
    assert len(list_all_presets()) == 18
    h2d = find_printer_preset("bambu", "H2D")  # case/space-insensitive
    assert h2d and h2d["nozzle_count"] == 2
    assert find_printer_preset("nobody", "nothing") is None
    caps = list_all_capabilities()
    assert isinstance(caps, list) and "dual_extruder" in caps


def test_mesh_printability_overhang_and_orientation():
    from mesh_analyze import analyze_stl
    # A 20mm cube: exactly one of six faces points straight down -> 1/6 overhang.
    V = [(0, 0, 0), (20, 0, 0), (20, 20, 0), (0, 20, 0),
         (0, 0, 20), (20, 0, 20), (20, 20, 20), (0, 20, 20)]
    F = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
         (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    buf = b"\0" * 80 + struct.pack("<I", len(F))
    for a, b, c in F:
        buf += struct.pack("<3f", 0, 0, 0)
        for v in (V[a], V[b], V[c]):
            buf += struct.pack("<3f", *v)
        buf += struct.pack("<H", 0)
    r = analyze_stl(buf)
    p = r["printability"]
    assert abs(p["overhang_fraction"] - (1 / 6)) < 0.02
    assert p["bridges"]["count"] >= 1  # the top face
    # orientation suggestions present + sorted ascending by overhang
    sug = p["orientation_suggestions"]
    assert len(sug) == 7
    assert sug[0]["overhang_fraction"] <= sug[-1]["overhang_fraction"]


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
