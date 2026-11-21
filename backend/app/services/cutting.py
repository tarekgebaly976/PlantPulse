"""Paper waste, phase B: the winder's cutting plan (a cutting stock problem).

1. Patterns: every way to put the ordered widths side by side in one set of the jumbo width (deckle), with at most
   `max_reels` reels and a side trim between `min_trim_mm` and `max_trim_mm`. For the usual sizes all of them can be
   listed (up to PATTERN_CAP); the list is cut at the cap, the widest-filling patterns first.
2. CP-SAT chooses how many sets of each pattern: every width gets its demand within the orders' tolerance; the goal is
   the least trim (mm × sets), then the fewest patterns (each one is a knife change, costing `change_cost_sets` sets of
   the deckle's width), then the fewest extra reels over the demand and short reels under it.
3. The reels of each width are shared out to its orders, earliest due date first.

Everything is in whole millimetres; trim % = trim ÷ (deckle × sets)."""

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from ortools.sat.python import cp_model

PATTERN_CAP = 20000
SOLVE_SECONDS = 10.0


@dataclass
class Limits:
    deckle: int
    max_reels: int
    min_trim: int
    max_trim: int
    min_width: int
    change_cost_sets: float


@dataclass
class Line:
    key: str
    width: int
    reels: int
    tolerance_pct: float
    due: date | None


def patterns(widths: list[int], lim: Limits) -> tuple[list[tuple[int, ...]], bool]:
    """Count vectors over `widths` (each a set that fits), and whether the list was cut at the cap."""
    ws = sorted(set(widths), reverse=True)
    usable = lim.deckle - lim.min_trim
    out: list[tuple[int, ...]] = []
    counts = [0] * len(ws)
    capped = False

    def walk(i: int, used: int, n: int) -> None:
        nonlocal capped
        if capped:
            return
        if i == len(ws):
            trim = lim.deckle - used
            if n > 0 and lim.min_trim <= trim <= lim.max_trim:
                out.append(tuple(counts))
                if len(out) >= PATTERN_CAP:
                    capped = True
            return
        most = min((usable - used) // ws[i], lim.max_reels - n)
        for k in range(most, -1, -1):  # fullest first
            counts[i] = k
            walk(i + 1, used + k * ws[i], n + k)
        counts[i] = 0

    walk(0, 0, 0)
    return [tuple(dict(zip(ws, p, strict=True)).get(w, 0) for w in sorted(set(widths))) for p in out], capped


def problems(lines: list[Line], lim: Limits) -> list[dict]:
    """What makes the plan impossible before solving (code + parameters, translated on the page)."""
    out = []
    if lim.deckle <= 0:
        out.append({"code": "no_deckle", "params": {}})
    for ln in lines:
        if ln.width < lim.min_width:
            out.append({"code": "too_narrow", "params": {"width": ln.width, "min": lim.min_width}})
        if ln.width > lim.deckle - lim.min_trim:
            out.append({"code": "too_wide", "params": {"width": ln.width, "max": lim.deckle - lim.min_trim}})
    return out


def solve(lines: list[Line], lim: Limits, seconds: float = SOLVE_SECONDS) -> dict:
    pre = problems(lines, lim)
    if pre:
        return {"status": "invalid", "problems": pre}
    if not lines:
        return {"status": "invalid", "problems": [{"code": "no_orders", "params": {}}]}
    widths = sorted({ln.width for ln in lines})
    demand: dict[int, int] = defaultdict(int)
    lo: dict[int, int] = defaultdict(int)
    hi: dict[int, int] = defaultdict(int)
    for ln in lines:
        demand[ln.width] += ln.reels
        lo[ln.width] += math.ceil(ln.reels * (1 - ln.tolerance_pct / 100))
        hi[ln.width] += math.floor(ln.reels * (1 + ln.tolerance_pct / 100))
    pats, capped = patterns(widths, lim)
    pats = [p for p in pats if all(p[j] <= hi[w] for j, w in enumerate(widths))]
    if not pats:
        return {"status": "infeasible", "problems": [{"code": "no_pattern", "params": {}}], "patterns_considered": 0}
    m = cp_model.CpModel()
    ub = max(hi.values())
    x = [m.new_int_var(0, ub, f"x{i}") for i in range(len(pats))]
    y = [m.new_bool_var(f"y{i}") for i in range(len(pats))]
    for xi, yi in zip(x, y, strict=True):
        m.add(xi <= ub * yi)
    cost = []
    for j, w in enumerate(widths):
        made = sum(p[j] * xi for p, xi in zip(pats, x, strict=True) if p[j])
        m.add(made >= lo[w])
        m.add(made <= hi[w])
        over = m.new_int_var(0, hi[w], "")
        short = m.new_int_var(0, demand[w], "")
        m.add(made - demand[w] == over - short)
        cost += [w * over, 2 * w * short]  # an extra reel costs its width; a short one, twice
    trim = [lim.deckle - sum(p[j] * w for j, w in enumerate(widths)) for p in pats]
    cost += [t * 10 * xi for t, xi in zip(trim, x, strict=True)]  # trim weighs most
    change = int(lim.change_cost_sets * lim.deckle * 10)
    cost += [change * yi for yi in y]
    m.minimize(sum(cost))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = seconds
    solver.parameters.num_workers = 8
    st = solver.solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        code = "infeasible" if st == cp_model.INFEASIBLE else "timeout"
        return {"status": code, "problems": [{"code": code, "params": {}}], "patterns_considered": len(pats), "capped": capped}
    used = [(p, solver.value(xi), t) for p, xi, t in zip(pats, x, trim, strict=True) if solver.value(xi) > 0]
    used.sort(key=lambda u: (-u[1], u[2]))
    sets = sum(n for _, n, _ in used)
    trim_total = sum(n * t for _, n, t in used)
    made = {w: sum(p[j] * n for p, n, _ in used) for j, w in enumerate(widths)}
    # share each width's reels out to its orders, earliest due date first, then up to its tolerance
    given: dict[str, int] = {}
    for w in widths:
        mine = sorted((ln for ln in lines if ln.width == w), key=lambda ln: (ln.due or date.max, ln.key))
        left = made[w]
        for ln in mine:
            given[ln.key] = min(ln.reels, left)
            left -= given[ln.key]
        for ln in mine:
            extra = min(left, math.floor(ln.reels * (1 + ln.tolerance_pct / 100)) - given[ln.key])
            given[ln.key] += max(0, extra)
            left -= max(0, extra)
        if left > 0 and mine:  # (cannot happen within the tolerance; kept on the last order)
            given[mine[-1].key] += left
    return {
        "status": "optimal" if st == cp_model.OPTIMAL else "feasible",
        "seconds": round(solver.wall_time, 2),
        "patterns_considered": len(pats),
        "capped": capped,
        "deckle_mm": lim.deckle,
        "sets": sets,
        "patterns_used": len(used),
        "trim_mm_total": trim_total,
        "trim_pct": round(trim_total / (lim.deckle * sets), 4) if sets else None,
        "patterns": [
            {
                "widths": [w for j, w in sorted(enumerate(widths), key=lambda t: -t[1]) for _ in range(p[j])],
                "sets": n,
                "trim_mm": t,
                "trim_pct": round(t / lim.deckle, 4),
            }
            for p, n, t in used
        ],
        "widths": [{"width": w, "demand": demand[w], "min": lo[w], "max": hi[w], "made": made[w]} for w in widths],
        "orders": given,
    }
