"""Paper waste, phase B: the cutting plan of the winder and the converting units after it (sheeters, rewinders).

1. Patterns: every way to put the ordered widths side by side in one set of the jumbo width (deckle), with at most
   `max_reels` reels and a side trim between `min_trim_mm` and `max_trim_mm`. For the usual sizes all of them can be
   listed (up to PATTERN_CAP); the list is cut at the cap, the widest-filling patterns first.
2. CP-SAT chooses how many sets of each pattern: every width gets its demand within the orders' tolerance; the goal is
   the least trim (mm × sets), then the fewest patterns (each one is a knife change, costing `change_cost_sets` sets of
   the deckle's width), then the fewest extra reels over the demand and short reels under it.
3. Converting (any number of sheeters and rewinders after the winder): a sheet order (sheet width × length, in sheets)
   is cut from a parent reel of n sheets across plus the sheeter's side trim; a reel order may be cut on the winder
   itself, or on a rewinder from a parent reel n times its width. Every way that fits a unit's limits is an option;
   CP-SAT picks the options and the winder patterns together, so the parent widths suit both stages (the least total
   trim: winder + converting), with the fewest size changes. A parent reel is one set long (`set_length_m`).

Everything is in whole millimetres; trim % = trim ÷ (deckle × sets)."""

import math
from dataclasses import dataclass
from datetime import date

from ortools.sat.python import cp_model

PATTERN_CAP = 20000
SOLVE_SECONDS = 20.0  # a small server (2 cores) still finds a good plan; the page waits for it


@dataclass
class Limits:
    deckle: int
    max_reels: int
    min_trim: int
    max_trim: int
    min_width: int
    change_cost_sets: float
    set_length_m: int = 0  # metres of one set (= one parent reel); needed for sheet orders


@dataclass
class Line:
    """An order: reels of `width` (kind "reel"), or sheets of width × sheet_length (kind "sheet", quantity in sheets)."""

    key: str
    width: int
    reels: int  # the quantity: reels, or sheets for a sheet order
    tolerance_pct: float
    due: date | None
    kind: str = "reel"
    sheet_length: int | None = None
    converter: str | None = None  # this unit only (a sheet order may name its sheeter)


@dataclass
class Converter:
    key: str
    code: str
    kind: str  # "sheeter" | "rewinder"
    min_width: int
    max_width: int
    min_length: int | None
    max_length: int | None
    side_trim: int  # trimmed off each parent reel
    speed_mpm: float | None
    change_min: float  # minutes per size change
    stands: int = 1  # reels unwound together (a sheeter's output per pass)


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


def problems(lines: list[Line], lim: Limits, units: list[Converter] | None = None) -> list[dict]:
    """What makes the plan impossible before solving (code + parameters, translated on the page)."""
    out = []
    if lim.deckle <= 0:
        out.append({"code": "no_deckle", "params": {}})
    if any(ln.kind == "sheet" for ln in lines) and lim.set_length_m <= 0:
        out.append({"code": "no_set_length", "params": {}})
    for ln in lines:
        if ln.kind == "sheet":
            if not options(ln, lim, units or []):
                out.append({"code": "no_sheeter", "params": {"width": ln.width, "length": ln.sheet_length or 0}})
            continue
        if ln.width > lim.deckle - lim.min_trim:
            out.append({"code": "too_wide", "params": {"width": ln.width, "max": lim.deckle - lim.min_trim}})
        elif ln.width < lim.min_width and not options(ln, lim, units or []):
            out.append({"code": "too_narrow", "params": {"width": ln.width, "min": lim.min_width}})
    return out


@dataclass
class Option:
    """One way to make an order: parent reels of `width` from the winder, each giving `yield_` of the order's unit."""

    line: Line
    width: int
    yield_: int
    across: int
    unit: Converter | None  # None: straight off the winder
    trim: int  # side trim of the converting unit, mm per parent reel


def options(ln: Line, lim: Limits, units: list[Converter]) -> list[Option]:
    out: list[Option] = []
    fits = lambda w: lim.min_width <= w <= lim.deckle - lim.min_trim  # noqa: E731
    if ln.kind == "reel" and fits(ln.width):
        out.append(Option(ln, ln.width, 1, 1, None, 0))
    for u in units:
        if ln.converter and u.key != ln.converter:
            continue
        if ln.kind == "sheet":
            if u.kind != "sheeter" or not ln.sheet_length or lim.set_length_m <= 0:
                continue
            if (u.min_length and ln.sheet_length < u.min_length) or (u.max_length and ln.sheet_length > u.max_length):
                continue
            per_strip = (lim.set_length_m * 1000) // ln.sheet_length
            n = 1
            while (w := n * ln.width + u.side_trim) <= min(u.max_width, lim.deckle - lim.min_trim):
                if w >= max(u.min_width, lim.min_width) and per_strip > 0:
                    out.append(Option(ln, w, n * per_strip, n, u, u.side_trim))
                n += 1
        elif u.kind == "rewinder":
            n = 2
            while (w := n * ln.width + u.side_trim) <= min(u.max_width, lim.deckle - lim.min_trim):
                if w >= max(u.min_width, lim.min_width):
                    out.append(Option(ln, w, n, n, u, u.side_trim))
                n += 1
    return out


def solve(lines: list[Line], lim: Limits, seconds: float = SOLVE_SECONDS, units: list[Converter] | None = None) -> dict:
    units = units or []
    pre = problems(lines, lim, units)
    if pre:
        return {"status": "invalid", "problems": pre}
    if not lines:
        return {"status": "invalid", "problems": [{"code": "no_orders", "params": {}}]}
    opts = [o for ln in lines for o in options(ln, lim, units)]
    lo = {ln.key: math.ceil(ln.reels * (1 - ln.tolerance_pct / 100)) for ln in lines}
    hi = {ln.key: math.floor(ln.reels * (1 + ln.tolerance_pct / 100)) for ln in lines}
    widths = sorted({o.width for o in opts})
    pats, capped = patterns(widths, lim)
    most = {w: sum(math.ceil(hi[o.line.key] / o.yield_) for o in opts if o.width == w) for w in widths}
    pats = [p for p in pats if all(p[j] <= most[w] for j, w in enumerate(widths))]
    if not pats:
        return {"status": "infeasible", "problems": [{"code": "no_pattern", "params": {}}], "patterns_considered": 0}
    m = cp_model.CpModel()
    ub = max(most.values())
    x = [m.new_int_var(0, ub, f"x{i}") for i in range(len(pats))]
    y = [m.new_bool_var(f"y{i}") for i in range(len(pats))]
    for xi, yi in zip(x, y, strict=True):
        m.add(xi <= ub * yi)
    r = [m.new_int_var(0, math.ceil(hi[o.line.key] / o.yield_), "") for o in opts]  # parent reels of each option
    cost = []
    # every reel the winder cuts goes to an option of its width
    for j, w in enumerate(widths):
        m.add(
            sum(p[j] * xi for p, xi in zip(pats, x, strict=True) if p[j]) == sum(ri for o, ri in zip(opts, r, strict=True) if o.width == w)
        )
    for ln in lines:
        mine = [(o, ri) for o, ri in zip(opts, r, strict=True) if o.line is ln]
        made = sum(o.yield_ * ri for o, ri in mine)
        m.add(made >= lo[ln.key])
        m.add(made <= hi[ln.key])
        over = m.new_int_var(0, hi[ln.key], "")
        short = m.new_int_var(0, ln.reels, "")
        m.add(made - ln.reels == over - short)
        # an extra / missing unit costs its share of a parent strip: width (reel) or sheet area ÷ set length (sheet)
        unit_mm = ln.width if ln.kind == "reel" else max(1, round(ln.width * (ln.sheet_length or 0) / (lim.set_length_m * 1000)))
        cost += [unit_mm * over, 2 * unit_mm * short]
    trim = [lim.deckle - sum(p[j] * w for j, w in enumerate(widths)) for p in pats]
    cost += [t * 10 * xi for t, xi in zip(trim, x, strict=True)]  # winder trim weighs most
    # converting side trim (the parent width the sheets / reels across do not use): the same weight as the winder's
    cost += [(o.width - o.across * o.line.width) * 10 * ri for o, ri in zip(opts, r, strict=True) if o.unit]
    change = int(lim.change_cost_sets * lim.deckle * 10)
    cost += [change * yi for yi in y]
    # a size on a converting unit is a change too (its own minutes, as the trim of a set: half the winder's weight)
    used: list[tuple[Option, cp_model.IntVar]] = []
    for o, ri in zip(opts, r, strict=True):
        if o.unit:
            z = m.new_bool_var("")
            m.add(ri <= math.ceil(hi[o.line.key] / o.yield_) * z)
            used.append((o, z))
            cost.append(change // 2 * z)
    m.minimize(sum(cost))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = seconds
    solver.parameters.num_workers = 8
    st = solver.solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        code = "infeasible" if st == cp_model.INFEASIBLE else "timeout"
        return {"status": code, "problems": [{"code": code, "params": {}}], "patterns_considered": len(pats), "capped": capped}
    usedp = [(p, solver.value(xi), t) for p, xi, t in zip(pats, x, trim, strict=True) if solver.value(xi) > 0]
    usedp.sort(key=lambda u: (-u[1], u[2]))
    sets = sum(n for _, n, _ in usedp)
    trim_total = sum(n * t for _, n, t in usedp)
    made_w = {w: sum(p[j] * n for p, n, _ in usedp) for j, w in enumerate(widths)}
    routes = []
    for o, ri in zip(opts, r, strict=True):
        n = solver.value(ri)
        if n:
            routes.append({"order": o.line.key, "unit": o.unit.key if o.unit else None, "unit_code": o.unit.code if o.unit else None,
                           "parent_width": o.width, "across": o.across, "reels": n, "made": n * o.yield_,
                           "side_trim_mm": o.width - o.across * o.line.width if o.unit else 0})  # fmt: skip
    conv_trim = sum(rt["reels"] * rt["side_trim_mm"] for rt in routes)
    load = []
    for u in units:
        mine = [rt for rt in routes if rt["unit"] == u.key]
        if not mine:
            continue
        metres = sum(rt["reels"] for rt in mine) * lim.set_length_m / max(1, u.stands)
        load.append({"unit": u.key, "code": u.code, "kind": u.kind, "reels": sum(rt["reels"] for rt in mine), "sizes": len(mine),
                     "hours": round(metres / u.speed_mpm / 60 + (len(mine) - 1) * u.change_min / 60, 1) if u.speed_mpm else None})  # fmt: skip
    area = lim.deckle * sets
    return {
        "status": "optimal" if st == cp_model.OPTIMAL else "feasible",
        "seconds": round(solver.wall_time, 2),
        "patterns_considered": len(pats),
        "capped": capped,
        "deckle_mm": lim.deckle,
        "set_length_m": lim.set_length_m,
        "sets": sets,
        "patterns_used": len(usedp),
        "trim_mm_total": trim_total,
        "trim_pct": round(trim_total / area, 4) if sets else None,
        "converting_trim_mm_total": conv_trim,
        "total_trim_pct": round((trim_total + conv_trim) / area, 4) if sets else None,
        "patterns": [
            {
                "widths": [w for j, w in sorted(enumerate(widths), key=lambda t: -t[1]) for _ in range(p[j])],
                "sets": n,
                "trim_mm": t,
                "trim_pct": round(t / lim.deckle, 4),
            }
            for p, n, t in usedp
        ],
        "widths": [
            {"width": w, "made": made_w[w], "for": sorted({rt["unit_code"] or "" for rt in routes if rt["parent_width"] == w})}
            for w in widths
            if made_w[w]
        ],  # fmt: skip
        "orders": {ln.key: sum(rt["made"] for rt in routes if rt["order"] == ln.key) for ln in lines},
        "routes": routes,
        "load": load,
    }
