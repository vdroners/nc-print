"""Procedural calibration G-code generators (ported from 3dprintforge
src/server/calibration-generator.js).

Nine tuning prints that emit Marlin/Klipper-compatible G-code directly — no
slice engine needed. Each generator is a pure function over numeric params and
returns {name, description, gcode, expected_minutes, filament_g, type}. All emit
a `; CALIBRATION:<type>` header so the print tracker can recognise calibration
runs.

This complements the engine-sliced calibration in calibration.py (temp tower via
3MF + shipped flow models): these are lighter (string-built, no engine exec) and
cover retraction, flow, pressure-advance (tower + line pattern), first-layer,
max-flow speed, tolerance/fit, and input-shaping/ringing tests.
"""
from __future__ import annotations

import json
import math

# 1.75mm filament cross-section constant: π · 0.875²
_FIL_XSEC_DENOM = math.pi * 0.875 * 0.875
_PLA_DENSITY = 1.24


def _header(ctype: str, params: dict) -> str:
    # No wall-clock timestamp: keep gcode reproducible for the same params.
    return (
        f"; CALIBRATION:{ctype}\n"
        "; Generator: nc-print (ported from 3DPrintForge)\n"
        f"; Params: {json.dumps(params, sort_keys=True)}\n"
    )


def _prelude(bed_temp, hotend_temp) -> str:
    return (
        "M82 ; absolute extrusion\n"
        "G21 ; mm\n"
        "G90 ; absolute positioning\n"
        f"M140 S{bed_temp}\n"
        f"M104 S{hotend_temp}\n"
        "G28 ; home all\n"
        f"M190 S{bed_temp} ; wait bed\n"
        f"M109 S{hotend_temp} ; wait hotend\n"
        "G92 E0\n"
        "G1 X10 Y10 Z0.3 F3000\n"
        "G1 X100 Y10 Z0.3 E10 F1000 ; purge line\n"
        "G92 E0\n"
    )


_POSTLUDE = (
    "G91 ; relative\n"
    "G1 E-2 F2400 ; retract\n"
    "G1 Z10 F600\n"
    "G90\n"
    "G1 X0 Y200 F3000 ; park\n"
    "M104 S0\n"
    "M140 S0\n"
    "M84 ; motors off\n"
    "; CALIBRATION_END\n"
)


def _layer_header(layer: int, z: float) -> str:
    return f"; LAYER:{layer}\nG1 Z{z:.3f} F1200\nG92 E0\n"


def _validate_range(low, high, name, lo_min, hi_max) -> None:
    if not (math.isfinite(low) and math.isfinite(high)) or low >= high:
        raise ValueError(f"{name}: invalid low/high ({low}/{high})")
    if low < lo_min:
        raise ValueError(f"{name}: low {low} < min {lo_min}")
    if high > hi_max:
        raise ValueError(f"{name}: high {high} > max {hi_max}")


def _xsec(line_width, layer_height) -> float:
    return (line_width * layer_height) / _FIL_XSEC_DENOM


def _merge(defaults: dict, params: dict | None) -> dict:
    p = dict(defaults)
    if params:
        for k, v in params.items():
            if k in p and v is not None:
                p[k] = v
    return p


# ── Generators ──────────────────────────────────────────────────────────

def generate_temp_tower(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendStart": 200, "hotendEnd": 230,
        "blocks": 8, "blockHeight": 5, "layerHeight": 0.2, "lineWidth": 0.45,
        "size": 30, "feed": 1500, "retract": 1.5,
    }, params)
    _validate_range(p["hotendStart"], p["hotendEnd"], "hotendTemp", 150, 320)
    if p["blocks"] < 2 or p["blocks"] > 12:
        raise ValueError("blocks 2..12")
    cx, cy = 100, 100
    half = p["size"] / 2
    lpb = max(1, round(p["blockHeight"] / p["layerHeight"]))
    step = (p["hotendEnd"] - p["hotendStart"]) / (p["blocks"] - 1)
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    perim_e = (2 * (p["size"] + p["size"])) * xsec

    g = _header("temp-tower", p) + _prelude(p["bedTemp"], p["hotendStart"])
    z = 0.0
    layer = 0
    for b in range(p["blocks"]):
        temp = round(p["hotendStart"] + b * step)
        g += f"; ===== BLOCK {b + 1}/{p['blocks']} @ {temp}C =====\n"
        g += f"M104 S{temp}\n"
        if b > 0:
            g += f"M109 S{temp} ; wait for new temp\n"
        for _ in range(lpb):
            z += p["layerHeight"]
            g += _layer_header(layer, z)
            layer += 1
            g += f"G1 X{cx - half} Y{cy - half} F{p['feed'] * 2}\n"
            g += f"G1 X{cx + half} E{perim_e / 4} F{p['feed']}\n"
            g += f"G1 Y{cy + half} E{perim_e / 2}\n"
            g += f"G1 X{cx - half} E{3 * perim_e / 4}\n"
            g += f"G1 Y{cy - half} E{perim_e}\n"
            g += "G92 E0\n"
            g += f"G1 E-{p['retract']} F1800\n"
    g += _POSTLUDE
    return {
        "name": f"Temp Tower {p['hotendStart']}-{p['hotendEnd']}C",
        "description": f"{p['blocks']} blocks, {p['blockHeight']}mm each, hotend stepped {step:.1f}C per block",
        "gcode": g,
        "expected_minutes": max(1, round(lpb * p["blocks"] * (4 * p["size"]) / p["feed"] * 1.2)),
        "filament_g": round(perim_e * p["blocks"] * lpb * _PLA_DENSITY, 1),
        "type": "temp-tower",
    }


def generate_retract_tower(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "retractStart": 0.5, "retractEnd": 5,
        "blocks": 6, "blockHeight": 5, "layerHeight": 0.2, "lineWidth": 0.45,
        "size": 30, "feed": 1500, "gapDistance": 60,
    }, params)
    _validate_range(p["retractStart"], p["retractEnd"], "retract", 0, 10)
    if p["blocks"] < 2 or p["blocks"] > 12:
        raise ValueError("blocks 2..12")
    cx1 = 90
    cx2 = cx1 + p["gapDistance"]
    cy = 100
    half = p["size"] / 2
    lpb = max(1, round(p["blockHeight"] / p["layerHeight"]))
    step = (p["retractEnd"] - p["retractStart"]) / (p["blocks"] - 1)
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    perim_e = (2 * (p["size"] + p["size"])) * xsec

    g = _header("retract-tower", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    z = 0.0
    layer = 0
    for b in range(p["blocks"]):
        r = round(p["retractStart"] + b * step, 2)
        g += f"; ===== BLOCK {b + 1}/{p['blocks']} retract={r}mm =====\n"
        for _ in range(lpb):
            z += p["layerHeight"]
            g += _layer_header(layer, z)
            layer += 1
            for cx in (cx1, cx2):
                g += f"G1 E-{r} F1800\n"
                g += f"G1 X{cx - half} Y{cy - half} F4500\n"
                g += f"G1 E{r} F1800\n"
                g += "G92 E0\n"
                g += f"G1 X{cx + half} E{perim_e / 4} F{p['feed']}\n"
                g += f"G1 Y{cy + half} E{perim_e / 2}\n"
                g += f"G1 X{cx - half} E{3 * perim_e / 4}\n"
                g += f"G1 Y{cy - half} E{perim_e}\n"
                g += "G92 E0\n"
    g += _POSTLUDE
    return {
        "name": f"Retract Tower {p['retractStart']}-{p['retractEnd']}mm",
        "description": f"{p['blocks']} blocks, {step:.2f}mm retract per block",
        "gcode": g,
        "expected_minutes": max(1, round(lpb * p["blocks"] * (8 * p["size"] + 2 * p["gapDistance"]) / p["feed"] * 1.2)),
        "filament_g": round(perim_e * 2 * p["blocks"] * lpb * _PLA_DENSITY, 1),
        "type": "retract-tower",
    }


def generate_flow_test(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "flowStart": 90, "flowEnd": 110,
        "blocks": 5, "blockHeight": 8, "layerHeight": 0.2, "lineWidth": 0.45,
        "size": 25, "feed": 1200,
    }, params)
    _validate_range(p["flowStart"], p["flowEnd"], "flow%", 50, 150)
    cx, cy = 100, 100
    half = p["size"] / 2
    lpb = max(1, round(p["blockHeight"] / p["layerHeight"]))
    step = (p["flowEnd"] - p["flowStart"]) / (p["blocks"] - 1)
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    perim_e = (2 * (p["size"] + p["size"])) * xsec

    g = _header("flow-test", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    z = 0.0
    layer = 0
    for b in range(p["blocks"]):
        flow = round(p["flowStart"] + b * step)
        g += f"; ===== BLOCK {b + 1}/{p['blocks']} flow={flow}% =====\n"
        g += f"M221 S{flow}\n"
        for _ in range(lpb):
            z += p["layerHeight"]
            g += _layer_header(layer, z)
            layer += 1
            g += f"G1 X{cx - half} Y{cy - half} F4500\n"
            g += f"G1 X{cx + half} E{perim_e / 4} F{p['feed']}\n"
            g += f"G1 Y{cy + half} E{perim_e / 2}\n"
            g += f"G1 X{cx - half} E{3 * perim_e / 4}\n"
            g += f"G1 Y{cy - half} E{perim_e}\n"
            g += "G92 E0\n"
    g += "M221 S100 ; reset flow\n"
    g += _POSTLUDE
    return {
        "name": f"Flow Test {p['flowStart']}-{p['flowEnd']}%",
        "description": f"{p['blocks']} blocks at {step:.1f}% increments — measure wall thickness, pick block where wall = {p['lineWidth']}mm",
        "gcode": g,
        "expected_minutes": max(1, round(lpb * p["blocks"] * (4 * p["size"]) / p["feed"] * 1.2)),
        "filament_g": round(perim_e * p["blocks"] * lpb * _PLA_DENSITY * (p["flowEnd"] / 100), 1),
        "type": "flow-test",
    }


def generate_pressure_advance_tower(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "paStart": 0, "paEnd": 0.1, "paStep": 0.005,
        "height": 50, "layerHeight": 0.2, "lineWidth": 0.45, "size": 60,
        "feed": 1500, "firmware": "klipper",
    }, params)
    if p["paStart"] < 0 or p["paEnd"] > 2 or p["paEnd"] <= p["paStart"]:
        raise ValueError("PA range: start >= 0, end <= 2, end > start")
    if p["firmware"] not in ("klipper", "marlin"):
        raise ValueError("firmware: klipper|marlin")
    cx, cy = 100, 100
    half = p["size"] / 2
    layers = round(p["height"] / p["layerHeight"])
    xsec = _xsec(p["lineWidth"], p["layerHeight"])

    g = _header("pressure-advance", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    if p["firmware"] == "klipper":
        g += "; Klipper TUNING_TOWER ramps pressure_advance during this print.\n"
        g += (f"TUNING_TOWER COMMAND=SET_PRESSURE_ADVANCE PARAMETER=ADVANCE "
              f"START={p['paStart']} STEP_DELTA={p['paStep']} STEP_HEIGHT={p['layerHeight']}\n")
    else:
        g += "; Marlin Linear Advance K-tower\n"
    z = 0.0
    for l in range(layers):
        z += p["layerHeight"]
        g += _layer_header(l, z)
        if p["firmware"] == "marlin":
            k = round(p["paStart"] + l * p["paStep"], 4)
            g += f"M900 K{k} ; set linear advance\n"
        y_off = half if l % 2 == 0 else -half
        g += f"G1 X{cx - half} Y{cy - y_off} F4500\n"
        g += f"G1 X{cx + half} E{(2 * p['size']) * xsec} F{p['feed']}\n"
        g += "G92 E0\n"
    if p["firmware"] == "klipper":
        g += "RESTORE_GCODE_STATE NAME=tuning_tower\n"
    g += _POSTLUDE
    return {
        "name": f"Pressure Advance Tower ({p['firmware']})",
        "description": f"Ramp {p['paStart']} -> {p['paEnd']} in {p['paStep']} steps over {p['height']}mm. Measure where corner artifacts disappear.",
        "gcode": g,
        "expected_minutes": max(1, round(layers * (2 * p["size"]) / p["feed"] * 1.2)),
        "filament_g": round(layers * (2 * p["size"]) * xsec * _PLA_DENSITY, 1),
        "type": "pressure-advance",
    }


def generate_pressure_advance_pattern(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "paStart": 0, "paEnd": 0.08, "paStep": 0.005,
        "firmware": "klipper", "layerHeight": 0.2, "lineWidth": 0.45,
        "slowFeed": 1200, "fastFeed": 6000, "lineSpacing": 4, "segmentLength": 20,
    }, params)
    if p["paStart"] < 0 or p["paEnd"] > 2 or p["paEnd"] <= p["paStart"]:
        raise ValueError("PA range: start >= 0, end <= 2, end > start")
    if p["firmware"] not in ("klipper", "marlin"):
        raise ValueError("firmware: klipper|marlin")
    if not p["paStep"] > 0:
        raise ValueError("paStep must be > 0")
    if not p["fastFeed"] > p["slowFeed"]:
        raise ValueError("fastFeed must exceed slowFeed")
    steps = int((p["paEnd"] - p["paStart"]) / p["paStep"] + 1e-9) + 1
    if steps > 100:
        raise ValueError("Too many PA rows (>100); increase paStep or narrow the range")
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    seg = p["segmentLength"]
    line_len = seg * 3
    cx, cy = 100, 100
    x1 = cx - line_len / 2
    x2, x3, x4 = x1 + seg, x1 + 2 * seg, x1 + 3 * seg
    start_y = cy - ((steps - 1) * p["lineSpacing"]) / 2
    retract = 0.6

    def set_pa(pa):
        return (f"SET_PRESSURE_ADVANCE ADVANCE={pa:.4f}\n" if p["firmware"] == "klipper"
                else f"M900 K{pa:.4f}\n")

    g = _header("pressure-advance-pattern", p)
    g += "; PA pattern (line method) — based on Sineos' Marlin PA tool, rewritten by\n"
    g += "; Andrew Ellis (ellis3dp.com Print Tuning Guide), GPL-3.0.\n"
    g += _prelude(p["bedTemp"], p["hotendTemp"])
    g += f"G1 Z{p['layerHeight']:.3f} F1200\n"
    g += "G92 E0\n"
    e = 0.0
    pa_values = []
    for i in range(steps):
        pa = round(p["paStart"] + i * p["paStep"], 4)
        pa_values.append(pa)
        y = start_y + i * p["lineSpacing"]
        g += f"; --- row {i}: PA={pa} ---\n"
        g += set_pa(pa)
        g += f"G1 X{x1:.2f} Y{y:.2f} F4500\n"
        if i > 0:
            e += retract
            g += f"G1 E{e:.4f} F1800\n"
        e += seg * xsec
        g += f"G1 X{x2:.2f} E{e:.4f} F{p['slowFeed']}\n"
        e += seg * xsec
        g += f"G1 X{x3:.2f} E{e:.4f} F{p['fastFeed']}\n"
        e += seg * xsec
        g += f"G1 X{x4:.2f} E{e:.4f} F{p['slowFeed']}\n"
        e -= retract
        g += f"G1 E{e:.4f} F1800\n"
    g += "SET_PRESSURE_ADVANCE ADVANCE=0\n" if p["firmware"] == "klipper" else "M900 K0\n"
    g += _POSTLUDE
    total_len = steps * line_len
    pa_last = round(p["paStart"] + (steps - 1) * p["paStep"], 4)
    return {
        "name": f"Pressure Advance Pattern ({p['firmware']})",
        "description": f"Line method: {steps} rows, PA {p['paStart']} -> {pa_last} in {p['paStep']} steps (front to back). Pick the cleanest row; its PA = paStart + rowIndex x paStep.",
        "gcode": g,
        "expected_minutes": max(1, round(steps * line_len / ((p["slowFeed"] + p["fastFeed"]) / 2) + steps * 0.05)),
        "filament_g": round(total_len * xsec * _PLA_DENSITY, 1),
        "type": "pressure-advance-pattern",
        "pa_values": pa_values,
    }


def generate_first_layer_test(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "pattern": "snake",
        "layerHeight": 0.2, "lineWidth": 0.45, "width": 200, "height": 200, "feed": 1500,
    }, params)
    if p["pattern"] not in ("snake", "square", "concentric"):
        raise ValueError("pattern: snake|square|concentric")
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    g = _header("first-layer", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    g += _layer_header(0, p["layerHeight"])

    if p["pattern"] == "snake":
        rows = int(p["height"] / (p["lineWidth"] * 1.05))
        x0 = (250 - p["width"]) / 2
        y0 = (250 - p["height"]) / 2
        total_e = 0.0
        for r in range(rows):
            y = y0 + r * p["lineWidth"] * 1.05
            xs = x0 if r % 2 == 0 else x0 + p["width"]
            xe = x0 + p["width"] if r % 2 == 0 else x0
            total_e += p["width"] * xsec
            g += f"G1 X{xs:.2f} Y{y:.2f} F4500\n"
            g += f"G1 X{xe:.2f} E{total_e:.4f} F{p['feed']}\n"
    elif p["pattern"] == "square":
        cx, cy = 125, 125
        half = min(p["width"], p["height"]) / 2
        g += f"G1 X{cx - half} Y{cy - half} F4500\n"
        e = 0.0
        e += 2 * half * xsec
        g += f"G1 X{cx + half} E{e:.4f} F{p['feed']}\n"
        e += 2 * half * xsec
        g += f"G1 Y{cy + half} E{e:.4f}\n"
        e += 2 * half * xsec
        g += f"G1 X{cx - half} E{e:.4f}\n"
        e += 2 * half * xsec
        g += f"G1 Y{cy - half} E{e:.4f}\n"
    else:
        cx, cy = 125, 125
        ring_count = int(min(p["width"], p["height"]) / (2 * p["lineWidth"] * 1.05))
        e = 0.0
        for i in range(1, ring_count + 1):
            r = i * p["lineWidth"] * 1.05
            segments = max(36, round(2 * math.pi * r / 2))
            for s in range(segments + 1):
                a = (s / segments) * 2 * math.pi
                x = cx + r * math.cos(a)
                y = cy + r * math.sin(a)
                if s == 0:
                    g += f"G1 X{x:.2f} Y{y:.2f} F4500\n"
                else:
                    e += (2 * math.pi * r / segments) * xsec
                    g += f"G1 X{x:.2f} Y{y:.2f} E{e:.4f} F{p['feed']}\n"
    g += _POSTLUDE
    return {
        "name": f"First Layer {p['pattern']}",
        "description": f"{p['pattern']} pattern at Z={p['layerHeight']}mm covering {p['width']}x{p['height']}mm",
        "gcode": g,
        "expected_minutes": max(1, round((p["width"] * p["height"]) / (p["feed"] * 60) * 60 * 0.7)),
        "filament_g": round((p["width"] * p["height"]) / (p["lineWidth"] * 1.05) * xsec * _PLA_DENSITY, 1),
        "type": "first-layer",
    }


def generate_single_line_test(params=None) -> dict:
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "speedStart": 30, "speedEnd": 200,
        "lines": 8, "lineWidth": 0.45, "layerHeight": 0.2, "length": 80,
    }, params)
    _validate_range(p["speedStart"], p["speedEnd"], "speed", 5, 500)
    if p["lines"] < 2 or p["lines"] > 20:
        raise ValueError("lines 2..20")
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    step = (p["speedEnd"] - p["speedStart"]) / (p["lines"] - 1)
    g = _header("single-line", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    g += f"G1 Z{p['layerHeight']:.3f} F1200\n"
    for i in range(p["lines"]):
        speed = round(p["speedStart"] + i * step)
        y = 50 + i * 10
        g += f"; LINE {i + 1} speed={speed}mm/s\n"
        g += "G92 E0\n"
        g += f"G1 X20 Y{y} F4500\n"
        g += f"G1 X{20 + p['length']} Y{y} E{p['length'] * xsec:.4f} F{speed * 60}\n"
        g += "G1 E-1 F1800\n"
    g += _POSTLUDE
    return {
        "name": f"Single-Line Speed Test {p['speedStart']}-{p['speedEnd']}mm/s",
        "description": f"{p['lines']} lines, {step:.0f}mm/s steps. Find the line where extrusion stays consistent.",
        "gcode": g,
        "expected_minutes": max(1, round(p["lines"] * p["length"] / 60)),
        "filament_g": round(p["lines"] * p["length"] * xsec * _PLA_DENSITY, 1),
        "type": "single-line",
    }


def generate_tolerance_test(params=None) -> dict:
    """Fit/clearance test: a strip of square holes at stepped nominal-to-actual
    clearances. Print, then check which hole a fixed peg (or your own part) drops
    into cleanly — that clearance is the fit your printer holds. Handy for press,
    slip, and free fits on functional parts.
    """
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "clearanceStart": 0.0, "clearanceEnd": 0.5,
        "blocks": 6, "pegSize": 10, "wall": 3, "height": 6,
        "layerHeight": 0.2, "lineWidth": 0.45, "feed": 1500, "gap": 4,
    }, params)
    _validate_range(p["clearanceStart"], p["clearanceEnd"], "clearance", 0, 2)
    if p["blocks"] < 2 or p["blocks"] > 12:
        raise ValueError("blocks 2..12")
    if p["pegSize"] < 3 or p["pegSize"] > 40:
        raise ValueError("pegSize 3..40")
    step = (p["clearanceEnd"] - p["clearanceStart"]) / (p["blocks"] - 1)
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    layers = max(1, round(p["height"] / p["layerHeight"]))
    # Each cell is a hollow square: outer = peg + 2*wall + clearance, inner = peg + clearance.
    outer = p["pegSize"] + 2 * p["wall"] + p["clearanceEnd"]
    pitch = outer + p["gap"]
    total_w = pitch * p["blocks"]
    x0 = 125 - total_w / 2
    cy = 100

    g = _header("tolerance", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    z = 0.0
    e_total = 0.0
    for layer in range(layers):
        z += p["layerHeight"]
        g += _layer_header(layer, z)
        for b in range(p["blocks"]):
            clearance = round(p["clearanceStart"] + b * step, 3)
            hole = p["pegSize"] + clearance
            outer_b = hole + 2 * p["wall"]
            ox = x0 + b * pitch
            # outer square
            ohx, ohy = ox + outer_b, cy + outer_b
            perim_o = 4 * outer_b * xsec
            g += f"G1 X{ox:.2f} Y{cy:.2f} F4500\n"
            g += f"G1 X{ohx:.2f} Y{cy:.2f} E{e_total + perim_o / 4:.4f} F{p['feed']}\n"
            g += f"G1 X{ohx:.2f} Y{ohy:.2f} E{e_total + perim_o / 2:.4f}\n"
            g += f"G1 X{ox:.2f} Y{ohy:.2f} E{e_total + 3 * perim_o / 4:.4f}\n"
            g += f"G1 X{ox:.2f} Y{cy:.2f} E{e_total + perim_o:.4f}\n"
            e_total += perim_o
            # inner square (the hole wall)
            ix, iy = ox + p["wall"], cy + p["wall"]
            ihx, ihy = ix + hole, iy + hole
            perim_i = 4 * hole * xsec
            g += f"G1 X{ix:.2f} Y{iy:.2f} F4500\n"
            g += f"G1 X{ihx:.2f} Y{iy:.2f} E{e_total + perim_i / 4:.4f} F{p['feed']}\n"
            g += f"G1 X{ihx:.2f} Y{ihy:.2f} E{e_total + perim_i / 2:.4f}\n"
            g += f"G1 X{ix:.2f} Y{ihy:.2f} E{e_total + 3 * perim_i / 4:.4f}\n"
            g += f"G1 X{ix:.2f} Y{iy:.2f} E{e_total + perim_i:.4f}\n"
            e_total += perim_i
    g += _POSTLUDE
    return {
        "name": f"Tolerance Test {p['clearanceStart']}-{p['clearanceEnd']}mm",
        "description": (
            f"{p['blocks']} square holes for a {p['pegSize']}mm peg, clearance stepped "
            f"{step:.3f}mm each. The tightest cell your peg drops into = your printer's fit clearance."
        ),
        "gcode": g,
        "expected_minutes": max(1, round(layers * p["blocks"] * (8 * outer) / p["feed"] * 1.2)),
        "filament_g": round(e_total * _PLA_DENSITY, 1),
        "type": "tolerance",
    }


def generate_input_shaping_test(params=None) -> dict:
    """Ringing / input-shaping test: a thin vertical wall printed at increasing
    speed up its height. On firmware that supports it (Klipper SET_VELOCITY_LIMIT
    or Marlin) the ghosting past sharp corners reveals resonance; use it to sanity
    -check input-shaper tuning. This is a visual ringing tower, NOT an ADXL sweep.
    """
    p = _merge({
        "bedTemp": 60, "hotendTemp": 215, "speedStart": 50, "speedEnd": 200,
        "accelStart": 1000, "accelEnd": 8000, "size": 60, "notchDepth": 5,
        "height": 40, "layerHeight": 0.2, "lineWidth": 0.45, "firmware": "klipper",
    }, params)
    _validate_range(p["speedStart"], p["speedEnd"], "speed", 10, 500)
    _validate_range(p["accelStart"], p["accelEnd"], "accel", 100, 30000)
    if p["firmware"] not in ("klipper", "marlin"):
        raise ValueError("firmware: klipper|marlin")
    cx, cy = 100, 100
    half = p["size"] / 2
    layers = max(2, round(p["height"] / p["layerHeight"]))
    xsec = _xsec(p["lineWidth"], p["layerHeight"])
    sp_step = (p["speedEnd"] - p["speedStart"]) / (layers - 1)
    ac_step = (p["accelEnd"] - p["accelStart"]) / (layers - 1)
    # An L-shaped wall with a sharp corner + a notch spike to provoke ringing.
    perim_e = (2 * p["size"] + p["notchDepth"]) * xsec

    g = _header("input-shaping", p) + _prelude(p["bedTemp"], p["hotendTemp"])
    g += "; Ringing tower: speed + accel ramp up with height. Ghosting past the\n"
    g += "; sharp corner shows resonance; compare with input-shaper enabled.\n"
    z = 0.0
    for layer in range(layers):
        z += p["layerHeight"]
        speed = round(p["speedStart"] + layer * sp_step)
        accel = round(p["accelStart"] + layer * ac_step)
        g += _layer_header(layer, z)
        if p["firmware"] == "klipper":
            g += f"SET_VELOCITY_LIMIT VELOCITY={speed} ACCEL={accel}\n"
        else:
            g += f"M203 X{speed} Y{speed}\nM201 X{accel} Y{accel}\n"
        f = speed * 60
        # L-wall with a notch spike at the corner
        g += f"G1 X{cx - half:.2f} Y{cy - half:.2f} F4500\n"
        e = perim_e / 4
        g += f"G1 X{cx + half:.2f} Y{cy - half:.2f} E{e:.4f} F{f}\n"
        # notch spike inward then back — forces a fast direction reversal
        e += (p["notchDepth"] / 2) * xsec
        g += f"G1 X{cx + half:.2f} Y{cy - half + p['notchDepth']:.2f} E{e:.4f}\n"
        e += (2 * half - p["notchDepth"]) * xsec + (p["notchDepth"] / 2) * xsec
        g += f"G1 X{cx + half:.2f} Y{cy + half:.2f} E{e:.4f}\n"
        e += (2 * half) * xsec
        g += f"G1 X{cx - half:.2f} Y{cy + half:.2f} E{e:.4f}\n"
        g += "G92 E0\n"
    if p["firmware"] == "klipper":
        g += "SET_VELOCITY_LIMIT VELOCITY=100 ACCEL=3000 ; restore defaults\n"
    g += _POSTLUDE
    return {
        "name": f"Input Shaping Tower ({p['firmware']})",
        "description": (
            f"Speed {p['speedStart']}->{p['speedEnd']}mm/s, accel {p['accelStart']}->{p['accelEnd']} "
            f"ramped over {p['height']}mm. Inspect ghosting past the corner; re-run with input-shaper on."
        ),
        "gcode": g,
        "expected_minutes": max(1, round(layers * (2 * p["size"]) / ((p["speedStart"] + p["speedEnd"]) / 2 * 60) * 1.3)),
        "filament_g": round(perim_e * layers * _PLA_DENSITY, 1),
        "type": "input-shaping",
    }


# ── Dispatch + catalog ──────────────────────────────────────────────────

_GENERATORS = {
    "temp-tower": generate_temp_tower,
    "retract-tower": generate_retract_tower,
    "flow-test": generate_flow_test,
    "pressure-advance": generate_pressure_advance_tower,
    "pressure-advance-pattern": generate_pressure_advance_pattern,
    "first-layer": generate_first_layer_test,
    "single-line": generate_single_line_test,
    "tolerance": generate_tolerance_test,
    "input-shaping": generate_input_shaping_test,
}

# UI catalog: id, label, help + the tunable params each accepts (for form gen).
CATALOG = [
    {"id": "temp-tower", "name": "Temperature tower", "kind": "gcode",
     "help": "Stacked blocks each at a stepped hotend temp — pick the cleanest.",
     "params": {"hotendStart": 200, "hotendEnd": 230, "blocks": 8, "bedTemp": 60}},
    {"id": "retract-tower", "name": "Retraction tower", "kind": "gcode",
     "help": "Two squares with travel between; find the retraction with no stringing.",
     "params": {"retractStart": 0.5, "retractEnd": 5, "blocks": 6, "hotendTemp": 215, "bedTemp": 60}},
    {"id": "flow-test", "name": "Flow rate test", "kind": "gcode",
     "help": "Stepped flow % — measure wall thickness, pick where wall = line width.",
     "params": {"flowStart": 90, "flowEnd": 110, "blocks": 5, "hotendTemp": 215, "bedTemp": 60}},
    {"id": "pressure-advance", "name": "Pressure advance tower", "kind": "gcode",
     "help": "Klipper TUNING_TOWER / Marlin K ramp — where corner artifacts vanish.",
     "params": {"paStart": 0, "paEnd": 0.1, "paStep": 0.005, "firmware": "klipper", "hotendTemp": 215, "bedTemp": 60}},
    {"id": "pressure-advance-pattern", "name": "Pressure advance pattern", "kind": "gcode",
     "help": "Line method (Ellis): slow/fast/slow rows; pick the cleanest transitions.",
     "params": {"paStart": 0, "paEnd": 0.08, "paStep": 0.005, "firmware": "klipper", "hotendTemp": 215, "bedTemp": 60}},
    {"id": "first-layer", "name": "First layer test", "kind": "gcode",
     "help": "Single-layer patch to dial bed level / Z-offset.",
     "params": {"pattern": "snake", "width": 200, "height": 200, "hotendTemp": 215, "bedTemp": 60}},
    {"id": "single-line", "name": "Max-flow speed test", "kind": "gcode",
     "help": "Single lines at stepped speeds — find max consistent volumetric flow.",
     "params": {"speedStart": 30, "speedEnd": 200, "lines": 8, "hotendTemp": 215, "bedTemp": 60}},
    {"id": "tolerance", "name": "Tolerance / fit test", "kind": "gcode",
     "help": "Stepped-clearance holes for a peg — find the fit your printer holds.",
     "params": {"clearanceStart": 0.0, "clearanceEnd": 0.5, "blocks": 6, "pegSize": 10, "hotendTemp": 215, "bedTemp": 60}},
    {"id": "input-shaping", "name": "Input shaping / ringing tower", "kind": "gcode",
     "help": "Speed+accel ramp up a wall — ghosting past the corner shows resonance.",
     "params": {"speedStart": 50, "speedEnd": 200, "accelStart": 1000, "accelEnd": 8000, "firmware": "klipper", "hotendTemp": 215, "bedTemp": 60}},
]


def list_gcode_calibrations() -> list[dict]:
    return [dict(c) for c in CATALOG]


def generate(ctype: str, params=None) -> dict:
    fn = _GENERATORS.get(ctype)
    if not fn:
        raise ValueError(f"unknown calibration type: {ctype}")
    return fn(params)
