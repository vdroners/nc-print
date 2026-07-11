"""Apply per-job slice overrides by merging them into preset copies.

The frontend (src/services/slicer-utils.js buildSliceOverrides) sends a generic
`overrides` JSON — e.g. {"layer_height":0.3,"infill_density":0.55,
"nozzle_temperature":215,"enable_support":true}. The OrcaSlicer-fork CLI has NO
per-key override flags; it only loads preset JSON files via --load-settings /
--load-filaments. So to make overrides take effect we:

  1. Map the frontend keys to the engine's preset keys (which differ, e.g.
     infill_density -> sparse_infill_density, perimeters -> wall_loops).
  2. Split them by scope: process-scoped keys merge into a copy of the base
     PROCESS preset; filament-scoped keys (temps, fan, retraction) merge into a
     copy of the base FILAMENT preset.
  3. Write the merged copies and load them in place of the base presets. Values
     are written as strings, matching the on-disk preset format.

Verified: a merged process copy with layer_height="0.3" / sparse_infill_density=
"55%" produces gcode whose config footer reports exactly those values.
"""
from __future__ import annotations

import json
import os

# Frontend override key -> (engine preset key, scope, kind)
#   scope "process"  -> merged into the process preset
#   scope "filament" -> merged into the filament preset(s)
#   kind: "num" (numeric passthrough), "pct" (0-1 or 0-100 -> "NN%"),
#         "bool" ("1"/"0"), "str" (verbatim), "temp" (int string)
_MAP = {
    # ── process-scoped ──
    "layer_height":       ("layer_height",             "process", "num"),
    "line_width":         ("line_width",               "process", "num"),
    "perimeters":         ("wall_loops",               "process", "num"),
    "infill_density":     ("sparse_infill_density",     "process", "pct"),
    "print_speed":        ("outer_wall_speed",          "process", "num"),
    "first_layer_speed":  ("initial_layer_speed",       "process", "num"),
    "enable_support":     ("enable_support",            "process", "bool"),
    "support_type":       ("support_type",              "process", "str"),
    "support_threshold":  ("support_threshold_angle",   "process", "num"),
    "brim_width":         ("brim_width",                "process", "num"),
    "raft_layers":        ("raft_layers",               "process", "num"),
    "skirt_loops":        ("skirt_loops",               "process", "num"),
    # ── surface quality / detail (process-scoped) ──
    "adaptive_layer_height": ("adaptive_layer_height",  "process", "bool"),
    "ironing_type":       ("ironing_type",              "process", "str"),
    "fuzzy_skin":         ("fuzzy_skin",                "process", "str"),
    "seam_position":      ("seam_position",             "process", "str"),
    # ── infill / surface patterns (process-scoped) ──
    "infill_pattern":     ("sparse_infill_pattern",     "process", "str"),
    "top_surface_pattern": ("top_surface_pattern",      "process", "str"),
    "bottom_surface_pattern": ("bottom_surface_pattern", "process", "str"),
    # ── per-feature speeds (process-scoped) ──
    "infill_speed":       ("sparse_infill_speed",       "process", "num"),
    "solid_infill_speed": ("internal_solid_infill_speed", "process", "num"),
    # ── support interface tuning (process-scoped) ──
    "support_top_gap":    ("support_top_z_distance",    "process", "num"),
    "support_interface_layers": ("support_interface_top_layers", "process", "num"),
    "support_interface_spacing": ("support_interface_spacing", "process", "num"),
    # ── first layer (process-scoped) ──
    "first_layer_height": ("initial_layer_print_height", "process", "num"),
    # ── quality tier (process-scoped) ──
    "overhang_speed_1":   ("overhang_1_4_speed",         "process", "num"),
    "overhang_speed_2":   ("overhang_2_4_speed",         "process", "num"),
    "overhang_speed_3":   ("overhang_3_4_speed",         "process", "num"),
    "overhang_speed_4":   ("overhang_4_4_speed",         "process", "num"),
    "top_shell_layers":   ("top_shell_layers",           "process", "num"),
    "bottom_shell_layers": ("bottom_shell_layers",       "process", "num"),
    "bridge_speed":       ("bridge_speed",               "process", "num"),
    "bridge_flow":        ("bridge_flow",                "process", "num"),
    "bridge_no_support":  ("bridge_no_support",          "process", "bool"),
    "elephant_foot":      ("elefant_foot_compensation",  "process", "num"),
    "infill_wall_overlap": ("infill_wall_overlap",       "process", "pct"),
    # ── ironing + support detail tier (process-scoped) ──
    "ironing_flow":       ("ironing_flow",               "process", "pct"),
    "ironing_spacing":    ("ironing_spacing",            "process", "num"),
    "ironing_speed":      ("ironing_speed",              "process", "num"),
    "support_interface_bottom_layers": ("support_interface_bottom_layers", "process", "num"),
    "support_base_pattern": ("support_base_pattern",     "process", "str"),
    "tree_support_branch_angle": ("tree_support_branch_angle", "process", "num"),
    "draft_shield":       ("draft_shield",               "process", "str"),
    # ── build plate (process-scoped) ──
    # curr_bed_type selects which filament per-plate temp applies + adhesion
    # behaviour. Whitelisted to the enum strings the shipped presets recognise
    # (see _BED_TYPES); unknown values are dropped so the engine keeps its default.
    "bed_type":           ("curr_bed_type",              "process", "str"),
    # ── wipe / prime tower (process-scoped; multi-material purge) ──
    "enable_prime_tower":     ("enable_prime_tower",       "process", "bool"),
    "prime_tower_width":      ("prime_tower_width",        "process", "num"),
    "prime_tower_brim_width": ("prime_tower_brim_width",   "process", "num"),
    "prime_volume":           ("prime_volume",             "process", "num"),
    "wipe_tower_rotation":    ("wipe_tower_rotation_angle", "process", "num"),
    "wipe_tower_extra_spacing": ("wipe_tower_extra_spacing", "process", "pct"),
    # ── filament-scoped ──
    "nozzle_temperature": ("nozzle_temperature",        "filament", "temp"),
    "bed_temperature":    ("hot_plate_temp",            "filament", "temp"),
    "fan_speed":          ("fan_max_speed",             "filament", "num"),
    "retraction_length":  ("retraction_length",         "filament", "num"),
    "retraction_speed":   ("retraction_speed",          "filament", "num"),
}

# support_type from the frontend maps to the engine's support_type enum.
# "snug"/"grid" are OrcaSlicer support *styles*, not types — they map to the
# normal(auto) type plus a support_style patch applied in split_overrides.
_SUPPORT_TYPE = {
    "normal": "normal(auto)",
    "tree": "tree(auto)",
    "snug": "normal(auto)",
    "grid": "normal(auto)",
    "normal(auto)": "normal(auto)",
    "tree(auto)": "tree(auto)",
}
_SUPPORT_STYLE = {
    "snug": "snug",
    "grid": "grid",
}

# curr_bed_type enum values recognised by the shipped OrcaSlicer-fork presets.
# A bed_type override outside this set is dropped (engine keeps its default plate)
# rather than written blindly — an unknown value would silently fall back anyway.
_BED_TYPES = {
    "Cool Plate",
    "Engineering Plate",
    "High Temp Plate",
    "Textured PEI Plate",
    "Textured Cool Plate",
    "Smooth PEI Plate",
}


def _fmt(kind: str, value) -> str | None:
    """Render an override value in the string form the preset JSON expects."""
    if value is None or value == "":
        return None
    try:
        if kind == "num":
            n = float(value)
            return str(int(n)) if n == int(n) else str(n)
        if kind == "temp":
            return str(int(round(float(value))))
        if kind == "pct":
            n = float(value)
            pct = n * 100 if n <= 1 else n
            return f"{int(round(pct))}%"
        if kind == "bool":
            truthy = value in (True, 1, "1", "true", "True")
            return "1" if truthy else "0"
        if kind == "str":
            return str(value)
    except (TypeError, ValueError):
        return None
    return None


def map_process_override(key: str, raw) -> tuple[str, str] | None:
    """Map ONE frontend override key+value to (engine_key, string_value) for a
    PROCESS-scoped key, or None if the key is unknown / not process-scoped / the
    value is empty. Used by the per-object 3MF authoring so per-object settings
    reuse the exact same key mapping + formatting as the global overrides.
    """
    spec = _MAP.get(key)
    if not spec:
        return None
    engine_key, scope, kind = spec
    if scope != "process":
        return None
    val = _fmt(kind, raw)
    if val is None:
        return None
    return engine_key, val


def split_overrides(overrides: dict) -> tuple[dict, dict, list[str]]:
    """Return (process_patch, filament_patch, unknown_keys).

    Each patch maps engine preset key -> string value, ready to merge.
    """
    process_patch: dict[str, str] = {}
    filament_patch: dict[str, str] = {}
    unknown: list[str] = []
    for key, raw in (overrides or {}).items():
        spec = _MAP.get(key)
        if not spec:
            unknown.append(key)
            continue
        engine_key, scope, kind = spec
        if key == "support_type":
            low = str(raw).lower()
            val = _SUPPORT_TYPE.get(low)
            # snug/grid are styles on top of the normal type.
            if low in _SUPPORT_STYLE:
                process_patch["support_style"] = _SUPPORT_STYLE[low]
        elif key == "bed_type":
            # Only pass through recognised enum values; drop anything else.
            val = str(raw).strip()
            if val not in _BED_TYPES:
                val = None
        else:
            val = _fmt(kind, raw)
        if val is None:
            continue
        (process_patch if scope == "process" else filament_patch)[engine_key] = val
    return process_patch, filament_patch, unknown


def merge_preset(base_path: str, patch: dict, out_path: str) -> str:
    """Write a copy of the base preset JSON with `patch` keys overwritten.

    Keeps type/name/inherits/from so the engine still resolves the preset, then
    overwrites the override keys. Returns out_path (or base_path if patch empty).
    """
    if not patch:
        return base_path
    with open(base_path, encoding="utf-8") as fh:
        data = json.load(fh)
    data.update(patch)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    return out_path


def apply_overrides(
    overrides: dict,
    process_path: str,
    filament_paths: list[str],
    job_dir: str,
) -> tuple[str, list[str], list[str]]:
    """Merge overrides into process/filament preset copies in job_dir.

    Returns (process_path, filament_paths, applied_summary). Paths point at the
    merged copies when overrides applied, else the originals.
    """
    process_patch, filament_patch, unknown = split_overrides(overrides)
    summary: list[str] = []

    if process_patch:
        process_path = merge_preset(
            process_path, process_patch, os.path.join(job_dir, "process_override.json"))
        summary.append("process: " + ", ".join(f"{k}={v}" for k, v in process_patch.items()))

    if filament_patch:
        merged = []
        for i, fp in enumerate(filament_paths):
            merged.append(merge_preset(
                fp, filament_patch, os.path.join(job_dir, f"filament_override_{i}.json")))
        filament_paths = merged
        summary.append("filament: " + ", ".join(f"{k}={v}" for k, v in filament_patch.items()))

    if unknown:
        summary.append("ignored unknown: " + ", ".join(unknown))

    return process_path, filament_paths, summary
