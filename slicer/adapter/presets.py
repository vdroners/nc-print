"""Preset resolution for the CLI slice path.

The engine's built-in REST `/api/slice` is broken in this build, so the adapter
slices via the CLI (`--slice --load-settings --load-filaments --export-3mf`).
The CLI loads presets from on-disk JSON files (which carry `type`/`inherits`/
`from` — the loadable format), NOT the merged JSON that `/api/profiles/{id}`
returns. This module indexes the on-disk preset tree by preset `name` so the
frontend-supplied printer_id / process_id / filament_ids (which ARE the bundle
preset names) resolve to files, and it enforces machine↔process↔filament
compatibility (the CLI returns -17 otherwise).
"""
from __future__ import annotations

import json
import os
from glob import glob

# On-disk preset roots, searched in order. The seeded system/user dirs win over
# the baked vendor tree when a name collides (operator customisations).
_PRESET_ROOTS = [
    "/data/3DPrintForgeSlicer/user",
    "/data/3DPrintForgeSlicer/system",
    "/opt/orca/resources/profiles",
]

_KIND_DIRS = {"machine": "machine", "process": "process", "filament": "filament"}
# Map the frontend/API "kind" to the on-disk directory name.
_API_TO_DISK = {"printer": "machine", "process": "process", "filament": "filament"}


class PresetIndex:
    """Name → file-path index for machine/process/filament presets."""

    def __init__(self) -> None:
        # kind -> {name: path}
        self._by_name: dict[str, dict[str, str]] = {
            "machine": {}, "process": {}, "filament": {}
        }
        # name -> parsed json (lazy cache)
        self._cache: dict[str, dict] = {}
        self._build()

    def _build(self) -> None:
        for root in _PRESET_ROOTS:
            if not os.path.isdir(root):
                continue
            for kind, subdir in _KIND_DIRS.items():
                for path in glob(f"{root}/**/{subdir}/*.json", recursive=True):
                    base = os.path.basename(path).lower()
                    if "common" in base:  # inheritance parents, not instantiable
                        continue
                    try:
                        with open(path, encoding="utf-8") as fh:
                            name = json.load(fh).get("name")
                    except Exception:  # noqa: BLE001
                        name = None
                    if name and name not in self._by_name[kind]:
                        self._by_name[kind][name] = path

    def counts(self) -> dict[str, int]:
        return {k: len(v) for k, v in self._by_name.items()}

    def path_for(self, kind: str, name: str) -> str | None:
        return self._by_name.get(kind, {}).get(name)

    def _load(self, kind: str, name: str) -> dict:
        path = self.path_for(kind, name)
        if not path:
            return {}
        if path in self._cache:
            return self._cache[path]
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:  # noqa: BLE001
            data = {}
        self._cache[path] = data
        return data

    def _compatible_printers(self, kind: str, name: str) -> list[str]:
        """compatible_printers list, following one level of inheritance."""
        data = self._load(kind, name)
        cps = data.get("compatible_printers")
        if isinstance(cps, list) and cps:
            return cps
        # Follow inherits once (common parents hold the condition/list).
        parent = data.get("inherits")
        if isinstance(parent, str) and parent:
            pdata = self._load(kind, parent)
            cps = pdata.get("compatible_printers")
            if isinstance(cps, list):
                return cps
        return []

    def is_compatible(self, printer_name: str, kind: str, name: str) -> bool:
        cps = self._compatible_printers(kind, name)
        if not cps:
            # No explicit list — cannot prove incompatible; allow and let the
            # engine's own condition check decide.
            return True
        return printer_name in cps

    def first_compatible(self, printer_name: str, kind: str) -> str | None:
        """A process/filament preset that explicitly lists printer_name."""
        for name in self._by_name.get(kind, {}):
            if printer_name in self._compatible_printers(kind, name):
                return name
        return None


def resolve_triple(
    index: PresetIndex,
    printer_id: str,
    process_id: str,
    filament_ids: list[str],
) -> tuple[str, str, list[str], list[str]]:
    """Resolve frontend IDs to on-disk preset paths, repairing compatibility.

    Returns (machine_path, process_path, [filament_paths], warnings).
    Raises ValueError if the printer preset cannot be resolved at all.
    """
    warnings: list[str] = []

    machine_path = index.path_for("machine", printer_id)
    if not machine_path:
        raise ValueError(f"unknown printer preset: {printer_id!r}")
    printer_name = printer_id

    # Process — fall back to a compatible one if the requested is missing/incompat.
    process_name = process_id
    if not index.path_for("process", process_name) or not index.is_compatible(
        printer_name, "process", process_name
    ):
        alt = index.first_compatible(printer_name, "process")
        if not alt:
            raise ValueError(f"no process preset compatible with {printer_name!r}")
        if process_name:
            warnings.append(
                f"process {process_name!r} not compatible with {printer_name!r}; "
                f"using {alt!r}"
            )
        process_name = alt
    process_path = index.path_for("process", process_name)

    # Filaments — one per extruder; repair each.
    filament_paths: list[str] = []
    for fid in (filament_ids or []):
        name = fid
        if not index.path_for("filament", name) or not index.is_compatible(
            printer_name, "filament", name
        ):
            alt = index.first_compatible(printer_name, "filament")
            if alt:
                if name:
                    warnings.append(
                        f"filament {name!r} not compatible with {printer_name!r}; "
                        f"using {alt!r}"
                    )
                name = alt
        p = index.path_for("filament", name)
        if p:
            filament_paths.append(p)
    if not filament_paths:
        alt = index.first_compatible(printer_name, "filament")
        if not alt:
            raise ValueError(f"no filament preset compatible with {printer_name!r}")
        warnings.append(f"no usable filament supplied; using {alt!r}")
        filament_paths.append(index.path_for("filament", alt))

    return machine_path, process_path, filament_paths, warnings
