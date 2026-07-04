"""Post-slice G-code injection for pause-at-height / filament-change.

The engine has no CLI/preset key for "pause at Z" or "change filament at Z" (its
custom-gcode-at-layer lives inside a 3MF project, not a preset override), so we
inject the command into the produced plate_1.gcode after slicing.

Each requested pause is placed at the start of the first layer whose `;Z:` height
is >= the target height. `filament_change` emits M600 (Marlin/Klipper filament
change with park/purge), `pause` emits M601 (Klipper) or M0 fallback — configurable
per entry via the `command` field.
"""
from __future__ import annotations

_MAX_PAUSES = 50


def _normalize(pauses) -> list[dict]:
    """Validate + sort the requested pauses. Each: {height: float, type|command}."""
    out = []
    for p in (pauses or []):
        if not isinstance(p, dict):
            continue
        try:
            height = float(p.get("height"))
        except (TypeError, ValueError):
            continue
        if height <= 0:
            continue
        ptype = str(p.get("type", "filament_change")).lower()
        # Allow an explicit gcode command override, else map the type.
        cmd = p.get("command")
        if not cmd:
            cmd = "M600" if ptype == "filament_change" else "M601"
        cmd = str(cmd).strip()
        # Only allow a safe single pause/change token (no arbitrary injection).
        if cmd.upper() not in ("M600", "M601", "M0", "M25"):
            continue
        out.append({"height": height, "command": cmd.upper(), "type": ptype})
        if len(out) >= _MAX_PAUSES:
            break
    out.sort(key=lambda x: x["height"])
    return out


def inject_pauses(gcode_path: str, pauses) -> int:
    """Rewrite gcode_path in place, inserting each pause at the first layer whose
    ;Z: >= its target height. Returns the number of pauses actually inserted.
    """
    entries = _normalize(pauses)
    if not entries:
        return 0

    with open(gcode_path, encoding="ascii", errors="ignore") as fh:
        lines = fh.readlines()

    out_lines: list[str] = []
    pending = list(entries)  # ascending by height
    inserted = 0

    for line in lines:
        stripped = line.strip()
        # Layer markers look like ";Z:0.40".
        if stripped.startswith(";Z:"):
            try:
                z = float(stripped[3:])
            except ValueError:
                z = None
            if z is not None:
                # Insert (before this layer's moves) every pending pause the
                # layer has now reached.
                while pending and z >= pending[0]["height"]:
                    p = pending.pop(0)
                    out_lines.append(
                        f"; nc-print {p['type']} at Z={p['height']:.2f}\n")
                    out_lines.append(p["command"] + "\n")
                    inserted += 1
        out_lines.append(line)

    if inserted:
        with open(gcode_path, "w", encoding="ascii", errors="ignore") as fh:
            fh.writelines(out_lines)
    return inserted
