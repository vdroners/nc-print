"""Multi-color flush model + color-order optimizer + color naming.

Faithful Python port of the 3dprintforge modules `flush-calc.js`,
`color-order.js` and `color-names.js` (all pure math, no side effects):

- flush_volume_mm3(from, to): OrcaSlicer's RGB flush model (HSV distance +
  luminance asymmetry — going to a LIGHTER color needs more purge than going
  darker), returning the per-change flush VOLUME in mm3.
- optimize_color_order(colors): asymmetric-TSP over the color set to find the
  cyclic load order that minimises total purge, with savings vs load-as-listed.
- basic_color_name(hex): nearest-neighbour name from a curated palette.
"""

import math

MIN_FLUSH_VOL = 107  # OrcaSlicer default per-filament minimum (mm3)
MAX_FLUSH_VOL = 800  # sane upper clamp for an estimate (mm3)


def _to_radians(deg):
    return deg * math.pi / 180.0


def _get_luminance(r, g, b):
    return r * 0.3 + g * 0.59 + b * 0.11


def _calc_triangle_3rd_edge(a, b, deg_ab):
    return math.sqrt(a * a + b * b - 2 * a * b * math.cos(_to_radians(deg_ab)))


def _rgb_to_hsv(r, g, b):
    """r,g,b in [0,1] -> (h in [0,360), s in [0,1], v in [0,1])."""
    mx = max(r, g, b)
    mn = min(r, g, b)
    d = mx - mn
    h = 0.0
    if d != 0:
        if mx == r:
            h = 60 * (((g - b) / d) % 6)
        elif mx == g:
            h = 60 * ((b - r) / d + 2)
        else:
            h = 60 * ((r - g) / d + 4)
    if h < 0:
        h += 360
    s = 0.0 if mx == 0 else d / mx
    return h, s, mx


def _delta_hs(h1, s1, v1, h2, s2, v2):
    dx = math.cos(_to_radians(h1)) * s1 * v1 - math.cos(_to_radians(h2)) * s2 * v2
    dy = math.sin(_to_radians(h1)) * s1 * v1 - math.sin(_to_radians(h2)) * s2 * v2
    return min(1.2, math.sqrt(dx * dx + dy * dy))


def parse_hex(hex_str):
    """'#RRGGBB' / 'RRGGBB' -> [r,g,b] in 0..255, or None."""
    if not hex_str:
        return None
    s = str(hex_str).lstrip("#")
    if len(s) < 6:
        return None
    try:
        r = int(s[0:2], 16)
        g = int(s[2:4], 16)
        b = int(s[4:6], 16)
    except ValueError:
        return None
    return [r, g, b]


def flush_volume_mm3(from_hex, to_hex):
    """Flush volume (mm3) needed when changing from -> to. Accepts hex strings."""
    frm = parse_hex(from_hex)
    to = parse_hex(to_hex)
    if not frm or not to:
        return MIN_FLUSH_VOL
    sr, sg, sb = (c / 255 for c in frm)
    dr, dg, db = (c / 255 for c in to)

    fh, fs, fv = _rgb_to_hsv(sr, sg, sb)
    th, ts, tv = _rgb_to_hsv(dr, dg, db)
    hs_dist = _delta_hs(fh, fs, fv, th, ts, tv)

    from_lumi = _get_luminance(sr, sg, sb)
    to_lumi = _get_luminance(dr, dg, db)
    if to_lumi >= from_lumi:
        lumi_flush = math.pow(to_lumi - from_lumi, 0.7) * 560
    else:
        lumi_flush = (from_lumi - to_lumi) * 80
        inter_v = 0.67 * tv + 0.33 * fv
        hs_dist = min(inter_v, hs_dist)
    hs_flush = 230 * hs_dist
    vol = _calc_triangle_3rd_edge(hs_flush, lumi_flush, 120)
    vol = max(vol, 60)
    return min(MAX_FLUSH_VOL, max(MIN_FLUSH_VOL, round(vol)))


def mm3_to_grams(mm3, density_gcm3=1.24):
    """mm3 -> grams for a filament density (g/cm3, PLA ~1.24). 1 cm3 = 1000 mm3."""
    return (mm3 / 1000) * density_gcm3


def flush_grams(from_hex, to_hex, density_gcm3=1.24, multiplier=1.0):
    """Estimated purge weight (g) for one from->to change."""
    return mm3_to_grams(flush_volume_mm3(from_hex, to_hex) * multiplier, density_gcm3)


# --- Color-order optimizer (asymmetric TSP over the color set) ---------------

BRUTE_LIMIT = 8


def build_matrix(colors):
    n = len(colors)
    m = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                m[i][j] = flush_volume_mm3(colors[i], colors[j])
    return m


def cycle_cost(order, m):
    """Total flush around the cycle order[0]->...->order[-1]->order[0]."""
    total = 0
    n = len(order)
    for i in range(n):
        total += m[order[i]][order[(i + 1) % n]]
    return total


def _brute_force(m):
    from itertools import permutations

    n = len(m)
    # Fix index 0 to remove rotational duplicates.
    best = None
    best_cost = math.inf
    for perm in permutations(range(1, n)):
        order = [0, *perm]
        c = cycle_cost(order, m)
        if c < best_cost:
            best_cost = c
            best = order
    return {"order": best, "cost": best_cost}


def _nearest_neighbour(m):
    n = len(m)
    visited = [False] * n
    order = [0]
    visited[0] = True
    for _ in range(1, n):
        last = order[-1]
        nxt = -1
        best_d = math.inf
        for j in range(n):
            if not visited[j] and m[last][j] < best_d:
                best_d = m[last][j]
                nxt = j
        order.append(nxt)
        visited[nxt] = True
    return order


def _two_opt(order, m):
    best = list(order)
    best_cost = cycle_cost(best, m)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(best) - 1):
            for k in range(i + 1, len(best)):
                cand = best[:i] + best[i:k + 1][::-1] + best[k + 1:]
                c = cycle_cost(cand, m)
                if c < best_cost - 1e-9:
                    best = cand
                    best_cost = c
                    improved = True
    return {"order": best, "cost": best_cost}


def _baseline_cost(m):
    # Identity order (load-as-listed) is the "no optimisation" baseline.
    return cycle_cost(list(range(len(m))), m)


def optimize_color_order(colors, density_gcm3=1.24):
    """Return the optimised cyclic color order + savings vs load-as-listed.

    colors: filament colors as '#RRGGBB'. For N <= 8 the optimum is brute-forced;
    above that, nearest-neighbour + 2-opt.
    """
    n = len(colors) if isinstance(colors, (list, tuple)) else 0
    if n < 2:
        return {
            "order": [0] if n == 1 else [],
            "orderedColors": list(colors) if colors else [],
            "optimizedFlushMm3": 0, "optimizedFlushG": 0,
            "baselineFlushMm3": 0, "baselineFlushG": 0,
            "savedMm3": 0, "savedG": 0, "savedPct": 0, "method": "trivial",
        }
    m = build_matrix(colors)
    baseline = _baseline_cost(m)
    if n <= BRUTE_LIMIT:
        result = _brute_force(m)
        method = "brute-force"
    else:
        result = _two_opt(_nearest_neighbour(m), m)
        method = "nn+2opt"
    opt = result["cost"]
    saved_mm3 = max(0, baseline - opt)
    return {
        "order": result["order"],
        "orderedColors": [colors[i] for i in result["order"]],
        "optimizedFlushMm3": round(opt),
        "optimizedFlushG": round(mm3_to_grams(opt, density_gcm3) * 100) / 100,
        "baselineFlushMm3": round(baseline),
        "baselineFlushG": round(mm3_to_grams(baseline, density_gcm3) * 100) / 100,
        "savedMm3": round(saved_mm3),
        "savedG": round(mm3_to_grams(saved_mm3, density_gcm3) * 100) / 100,
        "savedPct": round((saved_mm3 / baseline) * 1000) / 10 if baseline > 0 else 0,
        "method": method,
    }


# --- Color naming (nearest palette match) ------------------------------------

_PALETTE = [
    ("White", 0xFF, 0xFF, 0xFF),
    ("Black", 0x00, 0x00, 0x00),
    ("Red", 0xFF, 0x00, 0x00),
    ("Green", 0x00, 0x80, 0x00),
    ("Blue", 0x00, 0x00, 0xFF),
    ("Yellow", 0xFF, 0xFF, 0x00),
    ("Cyan", 0x00, 0xFF, 0xFF),
    ("Magenta", 0xFF, 0x00, 0xFF),
    ("Orange", 0xFF, 0xA5, 0x00),
    ("Purple", 0x80, 0x00, 0x80),
    ("Pink", 0xFF, 0xC0, 0xCB),
    ("Hot Pink", 0xF5, 0x54, 0x7C),
    ("Brown", 0x8B, 0x45, 0x13),
    ("Cocoa", 0x6F, 0x50, 0x34),
    ("Bronze", 0xE4, 0xBD, 0x68),
    ("Gold", 0xFF, 0xD7, 0x00),
    ("Silver", 0xC0, 0xC0, 0xC0),
    ("Gray", 0x80, 0x80, 0x80),
    ("Light Gray", 0xD3, 0xD3, 0xD3),
    ("Dark Gray", 0x40, 0x40, 0x40),
    ("Sky Blue", 0x00, 0x86, 0xD6),
    ("Navy", 0x00, 0x00, 0x80),
    ("Lime", 0x00, 0xFF, 0x00),
    ("Olive", 0x80, 0x80, 0x00),
    ("Maroon", 0x80, 0x00, 0x00),
    ("Teal", 0x00, 0x80, 0x80),
    ("Beige", 0xF5, 0xF5, 0xDC),
    ("Tan", 0xD2, 0xB4, 0x8C),
]

_NEAR_MATCH_THRESHOLD = 80  # Euclidean RGB distance


def basic_color_name(hex_str):
    """Map a 6-char hex string to a basic English color name, or None if the
    closest palette match is too far (caller falls back to raw hex)."""
    if not hex_str:
        return None
    clean = str(hex_str).lstrip("#")[:6]
    if len(clean) != 6:
        return None
    try:
        r = int(clean[0:2], 16)
        g = int(clean[2:4], 16)
        b = int(clean[4:6], 16)
    except ValueError:
        return None
    best = None
    best_dist = math.inf
    for name, pr, pg, pb in _PALETTE:
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_dist:
            best_dist = d
            best = name
    return best if math.sqrt(best_dist) <= _NEAR_MATCH_THRESHOLD else None
