#!/usr/bin/env python3
"""Rebase + import Creality Print filament/process presets into the engine.

The presets exported from Creality Print are DELTA-ONLY: each stores just the
changes from a Creality base preset via `inherits`, and those Creality bases are
NOT shipped in the nc-print-slicer engine (it ships OrcaSlicer bases). Copying
them verbatim would leave `inherits` dangling → empty/broken settings.

So we REBASE: keep every value the file explicitly sets, drop Creality-cloud
bookkeeping (base_id / sync_info / setting_id), re-point `inherits` at an engine
base that DOES exist (a bare `Generic <material>` for filament; the shipped
`0.20mm Standard @Creality K1Max (0.4 nozzle)` for process), and mark them
compatible with the shipped K1 Max machine so they're selectable.

Idempotent (rewrites the same target files), and reports per file
(imported / skipped + reason). Writes to the writable user preset root.

Usage (inside the nc-print-slicer container):
    python3 import_creality_profiles.py --src <dir> [--dry-run]
`<dir>` is the profiles-backup folder holding filament/ + process/.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

# Persistent, operator-owned preset volume (mounted; survives restarts). The
# engine's data_dir (/data/3DPrintForgeSlicer) is tmpfs re-seeded from the baked
# image every boot, so writing THERE is lost. The entrypoint copies this volume
# into the data_dir's user/default/{filament,process} on boot, where the engine
# loads user presets (no vendor manifest needed for user/default).
IMPORT_ROOT = "/data/user-profiles"
K1MAX_MACHINE = "Creality K1 Max (0.4 nozzle)"
PROCESS_BASE = "0.20mm Standard @Creality K1Max (0.4 nozzle)"

# Filament material → engine Generic base name (all exist in the engine).
GENERIC_BASE = {
    "PLA": "Generic PLA",
    "LW_PLA": "Generic PLA",
    "PETG": "Generic PETG",
    "ABS": "Generic ABS",
    "ASA": "Generic ASA",
    "ASA-CF": "Generic ASA",
    "ASA-GF": "Generic ASA",
    "PA": "Generic PA",
    "PA-CF": "Generic PA-CF",
    "PA6-CF": "Generic PA-CF",
    "PA12-CF": "Generic PA-CF",
}

# Creality-cloud / local bookkeeping keys that must not carry into a rebase.
DROP_KEYS = {"base_id", "sync_info", "setting_id", "user_id", "updated_time",
             "is_custom_defined", "from"}


def _scalar(v):
    if isinstance(v, list):
        return v[0] if v else ""
    return v if v is not None else ""


def _engine_names(kind: str) -> set[str]:
    """All preset `name`s of a kind currently visible to the engine."""
    names: set[str] = set()
    roots = ["/data/3DPrintForgeSlicer/user", "/data/3DPrintForgeSlicer/system", "/opt/orca/resources/profiles"]
    for root in roots:
        for p in glob.glob(f"{root}/**/{kind}/*.json", recursive=True):
            try:
                n = json.load(open(p)).get("name")
            except Exception:
                continue
            if n:
                names.add(n)
    return names


def _norm_mat(s: str) -> str:
    """Separator/case-insensitive material key (LW-PLA→LWPLA, PA6_CF→PA6CF)."""
    return str(s).upper().replace("-", "").replace("_", "").replace(" ", "")


# Generic base keyed by NORMALISED material token (see _norm_mat).
_GENERIC_BASE_NORM = {_norm_mat(k): v for k, v in GENERIC_BASE.items()}


def _infer_material(data: dict, filename: str) -> str:
    """Return a NORMALISED material token that keys into _GENERIC_BASE_NORM."""
    ftype = _scalar(data.get("filament_type"))
    if ftype:
        return _norm_mat(ftype)
    norm = _norm_mat(data.get("inherits", "") + " " + filename)
    # Order matters: check compound/CF before the bare polymer.
    for key in ("ASA-GF", "ASA-CF", "PA12-CF", "PA6-CF", "PA-CF", "LW_PLA",
                "PETG", "ABS", "ASA", "PLA", "PA"):
        if _norm_mat(key) in norm:
            return _norm_mat(key)
    return ""


def _is_k1c(data: dict, filename: str) -> bool:
    hay = (data.get("inherits", "") + " " + filename + " " + str(data.get("name", ""))).upper()
    return "K1C" in hay and "K1 MAX" not in hay and "K1MAX" not in hay


def rebase_filament(data: dict, filename: str) -> tuple[dict | None, str]:
    mat = _infer_material(data, filename)
    base = _GENERIC_BASE_NORM.get(mat)
    if not base:
        return None, f"unknown material ({mat or '?'})"
    # Must set at least one real print value to be worth importing.
    real = any(_scalar(data.get(k)) for k in
               ("nozzle_temperature", "hot_plate_temp", "fan_max_speed",
                "filament_retraction_length"))
    if not real:
        return None, "no print values set (empty delta)"
    out = {k: v for k, v in data.items() if k not in DROP_KEYS}
    out["inherits"] = base
    out["compatible_printers"] = [K1MAX_MACHINE]
    # Keys the engine's preset registry requires to instantiate + serve it.
    out["type"] = "filament"
    out["instantiation"] = "true"
    out["from"] = "User"
    # name/filament_settings_id kept as-is (unique display name)
    return out, base


def rebase_process(data: dict, filename: str, base_exists: bool) -> tuple[dict | None, str]:
    if not base_exists:
        return None, f"engine base missing: {PROCESS_BASE!r}"
    out = {k: v for k, v in data.items() if k not in DROP_KEYS}
    out["inherits"] = PROCESS_BASE
    out["compatible_printers"] = [K1MAX_MACHINE]
    out["type"] = "process"
    out["instantiation"] = "true"
    out["from"] = "User"
    return out, PROCESS_BASE


def write_preset(kind: str, data: dict, dry: bool) -> str:
    # Written into the persistent volume as {filament,process}/<name>.json; the
    # entrypoint lays these into the engine's user/default on boot. User presets
    # need no vendor manifest — the engine loads user/default/*/ directly.
    folder = os.path.join(IMPORT_ROOT, kind)
    name = data.get("name") or "imported"
    dest = os.path.join(folder, f"{name}.json")
    if not dry:
        os.makedirs(folder, exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=4)
    return dest


def run(src: str, dry: bool) -> dict:
    report = {"filament": [], "process": [], "skipped": []}
    fil_names = _engine_names("filament")
    proc_names = _engine_names("process")
    process_base_ok = PROCESS_BASE in proc_names

    for f in sorted(glob.glob(os.path.join(src, "filament", "*.json"))
                    + glob.glob(os.path.join(src, "default-filament", "*.json"))):
        base = os.path.basename(f)
        try:
            data = json.load(open(f))
        except Exception as exc:  # noqa: BLE001
            report["skipped"].append((base, f"unreadable: {exc}"))
            continue
        if _is_k1c(data, base):
            report["skipped"].append((base, "targets K1C, not K1 Max"))
            continue
        out, why = rebase_filament(data, base)
        if not out:
            report["skipped"].append((base, why))
            continue
        if out["inherits"] not in fil_names:
            report["skipped"].append((base, f"engine base missing: {out['inherits']!r}"))
            continue
        dest = write_preset("filament", out, dry)
        report["filament"].append((out["name"], f"inherits {out['inherits']}", dest))

    for f in sorted(glob.glob(os.path.join(src, "process", "*.json"))):
        base = os.path.basename(f)
        try:
            data = json.load(open(f))
        except Exception as exc:  # noqa: BLE001
            report["skipped"].append((base, f"unreadable: {exc}"))
            continue
        if _is_k1c(data, base):
            report["skipped"].append((base, "targets K1C, not K1 Max"))
            continue
        out, why = rebase_process(data, base, process_base_ok)
        if not out:
            report["skipped"].append((base, why))
            continue
        dest = write_preset("process", out, dry)
        report["process"].append((out["name"], f"inherits {out['inherits']}", dest))

    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="profiles-backup dir (holds filament/ process/)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not os.path.isdir(args.src):
        print(f"src not found: {args.src}", file=sys.stderr)
        return 2
    rep = run(args.src, args.dry_run)
    tag = "[dry-run] " if args.dry_run else ""
    print(f"{tag}Imported {len(rep['filament'])} filament, {len(rep['process'])} process; "
          f"skipped {len(rep['skipped'])}.")
    for name, note, _dest in rep["filament"]:
        print(f"  FIL  {name}  ({note})")
    for name, note, _dest in rep["process"]:
        print(f"  PROC {name}  ({note})")
    for base, why in rep["skipped"]:
        print(f"  SKIP {base}  — {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
