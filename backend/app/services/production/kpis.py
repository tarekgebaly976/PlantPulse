"""Configurable KPI engine. A KPI is a formula over standard measures and log line codes, worked out on the period
totals (so a ratio of a month is the ratio of the month's totals, not the average of daily ratios), compared with its
target and warning / critical limits in its direction. The library holds standard KPIs a plant may add (OEE is one of
them, never mandatory); plants add their own (energy per unit, cost drivers, any ratio of their log lines).

A KPI whose data are missing is reported as "missing" with the codes it lacks — never as 0."""

import ast
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.operations import OpMachine
from app.models.production import OpKpi
from app.models.tenancy import Plant
from app.services import oplogs
from app.services.production import measures as ms

UNIT = "{unit}"  # replaced by the line's output unit

# Standard KPIs (copied into a plant's KPIs on request; the plant may then change targets and limits)
LIBRARY: list[dict] = [
    {"code": "OEE", "name": "OEE", "formula": "run_hours / planned_hours * produced / ideal * good / net * 100", "unit": "%", "direction": "higher",
     "description": "Availability × performance × quality"},
    {"code": "AVAILABILITY", "name": "Availability", "formula": "run_hours / planned_hours * 100", "unit": "%", "direction": "higher",
     "description": "Run time ÷ planned time"},
    {"code": "PERFORMANCE", "name": "Performance", "formula": "produced / ideal * 100", "unit": "%", "direction": "higher",
     "description": "Output ÷ output at the ideal rate in the run time"},
    {"code": "QUALITY", "name": "Quality", "formula": "good / net * 100", "unit": "%", "direction": "higher", "description": "Good ÷ total output"},
    {"code": "PRODUCTION", "name": "Production", "formula": "produced", "unit": UNIT, "direction": "higher", "description": "Everything produced"},
    {"code": "GOOD", "name": "Good production", "formula": "good", "unit": UNIT, "direction": "higher", "description": "First quality output"},
    {"code": "RATE", "name": "Production rate", "formula": "produced / run_hours", "unit": UNIT + "/h", "direction": "higher",
     "description": "Output per run hour"},
    {"code": "TARGET_ACH", "name": "Target achievement", "formula": "produced / planned_qty * 100", "unit": "%", "direction": "higher",
     "description": "Output ÷ planned quantity"},
    {"code": "YIELD", "name": "Yield", "formula": "good / input_qty * 100", "unit": "%", "direction": "higher", "description": "Good output ÷ material in"},
    {"code": "SCRAP", "name": "Scrap / reject rate", "formula": "reject / net * 100", "unit": "%", "direction": "lower", "description": "Rejected ÷ total output"},
    {"code": "DOWNGRADE", "name": "Downgrade rate", "formula": "downgrade / net * 100", "unit": "%", "direction": "lower",
     "description": "Second quality ÷ total output"},
    {"code": "DOWNTIME", "name": "Downtime", "formula": "downtime_hours", "unit": "h", "direction": "lower", "description": "Stop hours"},
    {"code": "UNPLANNED_DT", "name": "Unplanned downtime", "formula": "unplanned_downtime_hours", "unit": "h", "direction": "lower",
     "description": "Stop hours that were not planned"},
    {"code": "STOPS", "name": "Stops", "formula": "stops", "unit": "", "direction": "lower", "description": "Number of stops"},
    {"code": "MAINT_LOSS", "name": "Equipment failure time", "formula": "failure_hours / planned_hours * 100", "unit": "%", "direction": "lower",
     "description": "Share of the time lost to equipment failures (maintenance-related loss)"},
    {"code": "CYCLE_TIME", "name": "Average cycle time", "formula": "run_hours * 3600 / produced", "unit": "s", "direction": "lower",
     "description": "Run seconds per unit produced"},
    {"code": "BATCH_DONE", "name": "Batch completion rate", "formula": "batches_completed / batches * 100", "unit": "%", "direction": "higher",
     "description": "Completed ÷ started batches / orders"},
]  # fmt: skip
LIBRARY_BY_CODE = {k["code"]: k for k in LIBRARY}


def names_in(formula: str) -> set[str]:
    try:
        return {n.id for n in ast.walk(ast.parse(formula, mode="eval")) if isinstance(n, ast.Name)}
    except SyntaxError:
        return set()


PERIOD_DAYS = {"day": 1, "week": 7, "month": 30}


def additive(formula: str) -> bool:
    """A formula without a division adds up over days (a quantity, a count, hours); a ratio does not."""
    try:
        return not any(isinstance(n, ast.BinOp) and isinstance(n.op, ast.Div) for n in ast.walk(ast.parse(formula, mode="eval")))
    except SyntaxError:
        return False


def check(formula: str, codes: set[str]) -> None:
    oplogs.check_formula(formula, codes)


def value(formula: str, env: dict[str, float | None]) -> tuple[float | None, list[str]]:
    """(value, codes with no data). None when data are missing or a division by zero."""
    missing = sorted(c for c in names_in(formula) if env.get(c) is None)
    if missing:
        return None, missing
    return oplogs.evaluate(formula, env), []


def status(k: OpKpi, v: float | None) -> str:
    """missing | no_target | ok (target met) | off_target | warning | critical (in the KPI's direction)."""
    if v is None:
        return "missing"
    lower = k.direction == "lower"
    worse = (lambda a, b: a > b) if lower else (lambda a, b: a < b)
    if k.critical is not None and worse(v, float(k.critical)):
        return "critical"
    if k.warn is not None and worse(v, float(k.warn)):
        return "warning"
    if k.target is not None and worse(v, float(k.target)):
        return "off_target"
    if k.target is None and k.warn is None and k.critical is None:
        return "no_target"
    return "ok"


def unit_of(k: OpKpi, lines: list[OpMachine]) -> str:
    u = k.unit or ""
    if UNIT in u:
        units = {m.output_unit for m in lines}
        u = u.replace(UNIT, units.pop() if len(units) == 1 else "")
    return u


def scope_lines(db: Session, plant_id: uuid.UUID, k: OpKpi) -> list[OpMachine]:
    return ms.lines_in_scope(db, plant_id, k.machine_id, k.department_id)


def trend(series: list[tuple[date, float]]) -> float | None:
    """Change in % between the first and the second half of the series (None with fewer than 4 values)."""
    vals = [v for _, v in series]
    if len(vals) < 4:
        return None
    h = len(vals) // 2
    a, b = sum(vals[:h]) / h, sum(vals[h:]) / (len(vals) - h)
    if a == 0:
        return None
    return round((b - a) / abs(a) * 100, 2)


def kpi_series(k: OpKpi, daily: dict, agg: dict[str, str], days: list[date]) -> list[tuple[date, float]]:
    out = []
    for d in days:
        v, _ = value(k.formula, ms.aggregate(daily, agg, [d]))
        if v is not None:
            out.append((d, v))
    return out


def unit_groups(lines: list[OpMachine]) -> list[list[OpMachine]]:
    """Lines whose output is counted in the same unit. Quantities of different units (tonnes and pieces) are never
    added up: a KPI over a scope with several units is worked out for each unit group."""
    groups: dict[str, list[OpMachine]] = {}
    for m in lines:
        groups.setdefault(m.output_unit or "", []).append(m)
    return list(groups.values()) or [[]]


def evaluate(
    db: Session, plant: Plant, kpis: list[OpKpi], today: date, days: int = 30, line_id: uuid.UUID | None = None, range_days: int | None = None
) -> list[dict]:
    """Each KPI: last complete day, last 7 days, month to date, daily series of `days`, trend, status, missing codes.
    `line_id`: plant-wide KPIs are worked out for this line only (a line's dashboard). A scope whose lines count
    output in different units gives one result per unit group; a group that never records what the KPI needs (e.g.
    a profile-specific measure) is left out."""
    last = today - timedelta(days=1)
    d0 = min(last - timedelta(days=days - 1), last.replace(day=1))
    win = ms.days_between(last - timedelta(days=days - 1), last)
    periods = {
        "day": [last],
        "week": ms.days_between(last - timedelta(days=6), last),
        "month": ms.days_between(last.replace(day=1), last),
        "today": [today],
    }
    if range_days:  # a dashboard window: its finished days (the day in progress is left out, as on the dashboard)
        periods["range"] = ms.days_between(today - timedelta(days=range_days - 1), last)
    cache: dict[tuple, list] = {}
    out = []
    for k in kpis:
        key = (k.machine_id, k.department_id)
        if line_id is not None and k.machine_id is None and k.department_id is None:
            key = (line_id, None)
        if key not in cache:
            groups = unit_groups(ms.lines_in_scope(db, plant.id, key[0], key[1]))
            cache[key] = [(g, *ms.collect(db, plant, g, d0, today)) for g in groups]
        entries = cache[key]
        for lines, daily, agg in entries:
            needed = names_in(k.formula)
            if len(entries) > 1 and not all(any(daily.get(d, {}).get(c) is not None for d in daily) for c in needed):
                continue  # this unit group never records something the KPI needs (e.g. a measure of another profile)
            res: dict[str, dict] = {}
            add = additive(k.formula)
            for name, ds in periods.items():
                v, missing = value(k.formula, ms.aggregate(daily, agg, ds))
                row = {"value": None if v is None else round(v, 4), "status": status(k, v), "missing": missing}
                n_days = len([d for d in ds if d in daily]) or len(ds)
                if add and v is not None and n_days > 1:
                    # a total (production, stops, breaks, hours) over several days is judged by its rate per the KPI's
                    # period: 47 breaks in 30 days against a target of 6 a day is 1.6 a day, not 47
                    per = v / n_days * PERIOD_DAYS.get(k.period, 1)
                    row.update({"per_period": round(per, 4), "status": status(k, per)})
                res[name] = row
            series = kpi_series(k, daily, agg, win)
            out.append({
                "id": str(k.id), "code": k.code, "name": k.name, "description": k.description, "formula": k.formula, "unit": unit_of(k, lines),
                "decimals": k.decimals, "direction": k.direction, "target": _f(k.target), "warn": _f(k.warn), "critical": _f(k.critical),
                "period": k.period, "machine_id": str(k.machine_id) if k.machine_id else None,
                "department_id": str(k.department_id) if k.department_id else None, "standard": k.standard, "dashboard": k.dashboard,
                "lines": [m.code for m in lines], "values": res, "series": [{"date": d.isoformat(), "value": round(v, 4)} for d, v in series],
                "trend_pct": trend(series[-14:]),
            })  # fmt: skip
    return out


def _f(v) -> float | None:
    return float(v) if v is not None else None


def plant_kpis(db: Session, plant_id: uuid.UUID, active_only: bool = True) -> list[OpKpi]:
    q = select(OpKpi).where(OpKpi.plant_id == plant_id)
    if active_only:
        q = q.where(OpKpi.is_active.is_(True))
    return list(db.execute(q.order_by(OpKpi.sort, OpKpi.code)).scalars())
