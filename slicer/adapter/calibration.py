"""Calibration model catalog + parametric model generation.

Two sources of calibration prints:

  * Shipped models — the engine's resources/calib/ tree includes ready-made
    calibration .3mf files. Only some slice cleanly against an arbitrary printer
    (others embed printer-specific presets and conflict), so the catalog lists
    the ones verified to work.

  * Parametric — a temperature tower is generated on the fly as a stepped tower
    3MF (fully under our control, works on any printer). Each step is meant to
    be printed at a different temperature via the slicer's height-based
    temperature changes; we expose the step temperatures so the UI can show them.

The result is a normal sliceable model, so calibration reuses the existing slice
path (preset resolution, overrides, gcode retrieval).
"""
from __future__ import annotations

import os
import zipfile

_CALIB_ROOT = os.environ.get("ORCA_CALIB_DIR", "/opt/orca/resources/calib")

# Shipped models verified to slice against an arbitrary printer profile.
# (Models that embed printer-specific presets and error out are omitted.)
_SHIPPED = [
    {
        "id": "flow_linear",
        "name": "Flow rate (linear)",
        "category": "filament_flow",
        "file": "Orca-LinearFlow.3mf",
        "help": "Print and pick the smoothest square to tune flow / extrusion multiplier.",
    },
    {
        "id": "flow_linear_fine",
        "name": "Flow rate (linear, fine)",
        "category": "filament_flow",
        "file": "Orca-LinearFlow_fine.3mf",
        "help": "Finer flow-rate sweep for a second pass.",
    },
]


def _shipped_path(entry: dict) -> str:
    return os.path.join(_CALIB_ROOT, entry["category"], entry["file"])


def list_calibrations() -> list[dict]:
    """Return the calibration catalog (shipped models present on disk + parametric)."""
    items = []
    for e in _SHIPPED:
        if os.path.exists(_shipped_path(e)):
            items.append({"id": e["id"], "name": e["name"], "kind": "shipped",
                          "help": e["help"]})
    # Parametric temperature tower.
    items.append({
        "id": "temp_tower",
        "name": "Temperature tower",
        "kind": "parametric",
        "help": "Stepped tower — set a per-height temperature range to find the best nozzle temp.",
        "params": {"temp_start": 220, "temp_end": 190, "step": 5},
    })
    return items


def shipped_model_path(calib_id: str) -> str | None:
    for e in _SHIPPED:
        if e["id"] == calib_id:
            p = _shipped_path(e)
            return p if os.path.exists(p) else None
    return None


def _box(ox, oy, oz, sx, sy, sz, vbase):
    """8 verts + 12 tris for an axis-aligned box; returns (verts, tris) with
    triangle indices offset by vbase."""
    v = [
        (ox, oy, oz), (ox + sx, oy, oz), (ox + sx, oy + sy, oz), (ox, oy + sy, oz),
        (ox, oy, oz + sz), (ox + sx, oy, oz + sz), (ox + sx, oy + sy, oz + sz), (ox, oy + sy, oz + sz),
    ]
    f = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
         (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    tris = [(a + vbase, b + vbase, c + vbase) for a, b, c in f]
    return v, tris


def generate_temp_tower_3mf(out_path: str, temp_start=220, temp_end=190, step=5,
                            step_height=10.0, width=20.0) -> dict:
    """Write a stepped temperature-tower 3MF. Returns {steps:[{temp,z0,z1}], height}.

    Each step is a slightly offset box so the layers are visually distinct; the
    operator sets the slicer to change nozzle temperature at each step height.
    """
    temps = []
    t = temp_start
    if step == 0:
        step = 5
    # Descending or ascending sweep depending on start/end.
    direction = -1 if temp_end < temp_start else 1
    while (direction < 0 and t >= temp_end) or (direction > 0 and t <= temp_end):
        temps.append(t)
        t += direction * abs(step)
    if not temps:
        temps = [temp_start]

    verts: list[tuple[float, float, float]] = []
    tris: list[tuple[int, int, int]] = []
    steps_meta = []
    for i, temp in enumerate(temps):
        z0 = i * step_height
        # alternate a small X offset so steps are visually separable
        ox = 2.0 if i % 2 else 0.0
        v, t3 = _box(ox, 0, z0, width, width, step_height, len(verts))
        verts.extend(v)
        tris.extend(t3)
        steps_meta.append({"temp": temp, "z0": round(z0, 2),
                           "z1": round(z0 + step_height, 2)})

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
    ct = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types '
          'xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships '
            'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", model)
    return {"steps": steps_meta, "height": len(temps) * step_height}
