"""G-code linter — rule-based static analysis for 3D printer G-code.

Faithful Python port of the 3dprintforge `src/server/gcode-linter.js`. Each rule
is a pure function over the pre-parsed lines, returning issues shaped like lint
diagnostics: {severity: 'error'|'warning'|'info', code, message, line}.

  error   — print would almost certainly fail or damage hardware
  warning — quality / safety risk; printer might recover
  info    — style / efficiency hint

firmware ('marlin'|'klipper'|'reprap'|'snapmaker'|'auto') gates firmware-specific
command checks. Pure logic — no slicing, no side effects.
"""
from __future__ import annotations

import re

FIRMWARE_FLAVOURS = {"marlin", "klipper", "reprap", "snapmaker", "auto"}

# Rough sanity bounds. Per-printer limits should override.
MAX_HOTEND_TEMP = 320
MAX_BED_TEMP = 130
MAX_CHAMBER_TEMP = 80
MIN_HOTEND_FOR_EXTRUSION = 150

_COMMENT_RX = re.compile(r";.*$")
_CLASSIC_HEAD_RX = re.compile(r"^([A-Z])(-?\d+(?:\.\d+)?)")
_MACRO_HEAD_RX = re.compile(r"^([A-Z][A-Z0-9_]*)")
_TOKEN_RX = re.compile(r"([A-Z])(-?\d+(?:\.\d+)?)")
_MACRO_TOKEN_RX = re.compile(r'([A-Z][A-Z0-9_]*)\s*=\s*("[^"]*"|\S+)')
# Scan cap so a pathological file can't hang the request.
_MAX_LINES = 2_000_000


def parse_gcode_line(raw_line: str):
    """Parse one g-code line into {cmd, tokens, raw} or None for blank/comment."""
    text = _COMMENT_RX.sub("", raw_line).strip()
    if not text:
        return None
    classic = _CLASSIC_HEAD_RX.match(text)
    if classic:
        cmd = classic.group(1) + classic.group(2)
        tokens = {}
        for m in _TOKEN_RX.finditer(text, classic.end()):
            try:
                tokens[m.group(1)] = float(m.group(2))
            except ValueError:
                pass
        return {"cmd": cmd, "tokens": tokens, "raw": raw_line}
    macro = _MACRO_HEAD_RX.match(text)
    if macro and re.match(r"^[A-Z_]+", macro.group(1)):
        tokens = {}
        tail = text[macro.end():]
        for m in _MACRO_TOKEN_RX.finditer(tail):
            tokens[m.group(1)] = m.group(2).strip('"')
        return {"cmd": macro.group(1).upper(), "tokens": tokens, "raw": raw_line}
    return None


# ── Rule catalogue (each: (parsed_lines, ctx) -> list[issue]) ──────────────

def _rule_homing_before_move(parsed, ctx):
    issues = []
    for p in parsed:
        pp = p["parsed"]
        if pp and pp["cmd"] == "G28":
            ctx["homed"] = True
        if not ctx["homed"] and pp and re.match(r"^G[01]$", pp["cmd"]):
            issues.append({"severity": "error", "code": "no-homing",
                           "message": "First G0/G1 move executed without prior G28 (homing). "
                                      "Risk of crashing the toolhead.", "line": p["lineNo"]})
            break
    return issues


def _rule_hotend_temp_bounds(parsed, ctx):
    issues = []
    for p in parsed:
        pp = p["parsed"]
        if not pp or pp["cmd"] not in ("M104", "M109"):
            continue
        s = pp["tokens"].get("S")
        if s is None:
            continue
        if s > MAX_HOTEND_TEMP:
            issues.append({"severity": "error", "code": "hotend-too-hot",
                           "message": f"Hotend target {s:g}°C exceeds the safe ceiling of {MAX_HOTEND_TEMP}°C.",
                           "line": p["lineNo"]})
        elif s < 0:
            issues.append({"severity": "error", "code": "hotend-negative",
                           "message": f"Negative hotend temperature {s:g}°C is invalid.",
                           "line": p["lineNo"]})
    return issues


def _rule_bed_temp_bounds(parsed, ctx):
    issues = []
    for p in parsed:
        pp = p["parsed"]
        if not pp or pp["cmd"] not in ("M140", "M190"):
            continue
        s = pp["tokens"].get("S")
        if s is not None and s > MAX_BED_TEMP:
            issues.append({"severity": "error", "code": "bed-too-hot",
                           "message": f"Bed target {s:g}°C exceeds {MAX_BED_TEMP}°C — sensor may melt.",
                           "line": p["lineNo"]})
    return issues


def _rule_chamber_temp_bounds(parsed, ctx):
    issues = []
    for p in parsed:
        pp = p["parsed"]
        if not pp or pp["cmd"] not in ("M141", "M191"):
            continue
        s = pp["tokens"].get("S")
        if s is not None and s > MAX_CHAMBER_TEMP:
            issues.append({"severity": "warning", "code": "chamber-too-hot",
                           "message": f"Chamber target {s:g}°C is above {MAX_CHAMBER_TEMP}°C — "
                                      "verify printer supports it.", "line": p["lineNo"]})
    return issues


def _rule_extrude_without_heat(parsed, ctx):
    issues = []
    for p in parsed:
        pp = p["parsed"]
        if not pp:
            continue
        c = pp["cmd"]
        if c in ("M104", "M109"):
            s = pp["tokens"].get("S")
            if s is not None:
                ctx["lastHotend"] = s
        if c in ("G0", "G1") and pp["tokens"].get("E", 0) and pp["tokens"]["E"] > 0:
            if ctx["lastHotend"] < MIN_HOTEND_FOR_EXTRUSION:
                issues.append({"severity": "error", "code": "cold-extrusion",
                               "message": f"Extrusion at line {p['lineNo']} but hotend last set to "
                                          f"{ctx['lastHotend']:g}°C (minimum {MIN_HOTEND_FOR_EXTRUSION}°C).",
                               "line": p["lineNo"]})
                break
    return issues


def _rule_extruder_mode_missing(parsed, ctx):
    issues = []
    mode_set = False
    for p in parsed:
        pp = p["parsed"]
        if not pp:
            continue
        if pp["cmd"] in ("M82", "M83"):
            mode_set = True
            continue
        if pp["cmd"] in ("G0", "G1") and pp["tokens"].get("E") is not None and not mode_set:
            issues.append({"severity": "warning", "code": "no-extruder-mode",
                           "message": "First extrusion happens before M82 (absolute) or M83 (relative). "
                                      "Behaviour depends on printer default.", "line": p["lineNo"]})
            break
    return issues


def _rule_z_hop_excessive(parsed, ctx):
    issues = []
    last_z = None
    for p in parsed:
        pp = p["parsed"]
        if not pp or pp["cmd"] not in ("G0", "G1"):
            continue
        z = pp["tokens"].get("Z")
        if z is None:
            continue
        if last_z is not None and z - last_z > 5:
            issues.append({"severity": "warning", "code": "excessive-z-hop",
                           "message": f"Z jumped {z - last_z:.2f}mm in one move ({last_z:g}→{z:g}). "
                                      "Most slicers Z-hop ≤ 1mm.", "line": p["lineNo"]})
        last_z = z
    return issues


def _rule_retract_frequency(parsed, ctx):
    issues = []
    window = []
    retracts = 0
    for p in parsed:
        pp = p["parsed"]
        if not pp:
            continue
        if pp["cmd"] in ("G0", "G1") and pp["tokens"].get("E") is not None and pp["tokens"]["E"] < 0:
            window.append(p["lineNo"])
            retracts += 1
            while window and p["lineNo"] - window[0] > 200:
                window.pop(0)
            if len(window) > 100:
                issues.append({"severity": "info", "code": "high-retract-density",
                               "message": f"Many retracts in a small window ({len(window)} in 200 lines). "
                                          "Consider increasing minimum travel for retraction in slicer.",
                               "line": p["lineNo"]})
                break
    if retracts == 0 and len(parsed) > 1000:
        issues.append({"severity": "info", "code": "no-retraction",
                       "message": "No retractions detected in a long file. "
                                  "May produce stringing on travel moves.", "line": 1})
    return issues


def _rule_multi_tool_swap(parsed, ctx):
    issues = []
    n = len(parsed)
    for i in range(n):
        pp = parsed[i]["parsed"]
        if not pp:
            continue
        m = re.match(r"^T([0-9])$", pp["cmd"])
        if not m:
            continue
        ctx.setdefault("usedTools", set()).add(m.group(1))
        has_temp = False
        for j in range(max(0, i - 10), min(n, i + 10)):
            q = parsed[j]["parsed"]
            if not q:
                continue
            if q["cmd"] in ("M104", "M109") and q["tokens"].get("T") is not None \
                    and str(int(q["tokens"]["T"])) == m.group(1):
                has_temp = True
                break
        if not has_temp:
            issues.append({"severity": "info", "code": "tool-swap-without-temp",
                           "message": f"Tool change to T{m.group(1)} at line {parsed[i]['lineNo']} has no "
                                      f"nearby M104/M109 T{m.group(1)} — verify slicer pre-heats before swap.",
                           "line": parsed[i]["lineNo"]})
    return issues


_KLIPPER_ONLY = re.compile(r"^(SET_|BED_MESH_|TEMPERATURE_WAIT|RESPOND|SAVE_VARIABLE|GET_POSITION|FORCE_MOVE)", re.I)
_MARLIN_ONLY = re.compile(r"^M(108|125|486|600|701|702|710)$")


def _rule_firmware_flavour_sanity(parsed, ctx):
    issues = []
    if ctx["firmware"] == "auto":
        return issues
    for p in parsed:
        pp = p["parsed"]
        if not pp:
            continue
        if ctx["firmware"] == "marlin" and _KLIPPER_ONLY.match(pp["cmd"]):
            issues.append({"severity": "warning", "code": "klipper-cmd-in-marlin",
                           "message": f"{pp['cmd']} is a Klipper extension. Marlin will reject it.",
                           "line": p["lineNo"]})
        if ctx["firmware"] == "klipper" and _MARLIN_ONLY.match(pp["cmd"]) and pp["cmd"] != "M600":
            issues.append({"severity": "info", "code": "marlin-cmd-in-klipper",
                           "message": f"{pp['cmd']} is a Marlin command without a Klipper equivalent. "
                                      "Verify your klipper config implements it.", "line": p["lineNo"]})
    return issues


_RULES = [
    _rule_homing_before_move,
    _rule_hotend_temp_bounds,
    _rule_bed_temp_bounds,
    _rule_chamber_temp_bounds,
    _rule_extrude_without_heat,
    _rule_extruder_mode_missing,
    _rule_z_hop_excessive,
    _rule_retract_frequency,
    _rule_multi_tool_swap,
    _rule_firmware_flavour_sanity,
]

_SEV_WEIGHT = {"error": 0, "warning": 1, "info": 2}
_LAYER_RX = re.compile(r";\s*(LAYER|layer)\s*[:=]\s*\d+")


def lint_gcode(text: str, firmware: str = "auto") -> dict:
    """Lint g-code source. Returns {issues, stats:{lines,commands,layers,tools}}."""
    fw = firmware if firmware in FIRMWARE_FLAVOURS else "auto"
    ctx = {"firmware": fw, "homed": False, "lastHotend": 0, "usedTools": set()}

    lines = text.split("\n")
    if len(lines) > _MAX_LINES:
        lines = lines[:_MAX_LINES]
    parsed = [{"lineNo": i + 1, "parsed": parse_gcode_line(line.rstrip("\r"))}
              for i, line in enumerate(lines)]

    issues = []
    for rule in _RULES:
        try:
            issues.extend(rule(parsed, ctx) or [])
        except Exception as exc:  # noqa: BLE001
            issues.append({"severity": "info", "code": "rule-crashed",
                           "message": f"Internal lint rule '{rule.__name__}' threw: {exc}", "line": 0})

    issues.sort(key=lambda it: (it["line"], _SEV_WEIGHT.get(it["severity"], 3)))

    cmd_count = sum(1 for p in parsed if p["parsed"])
    layer_count = sum(1 for line in lines if _LAYER_RX.search(line))
    return {
        "issues": issues,
        "stats": {
            "lines": len(lines),
            "commands": cmd_count,
            "layers": layer_count,
            "tools": [f"T{n}" for n in sorted(ctx["usedTools"])],
        },
    }
