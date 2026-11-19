"""Standard production measures: the industry-independent vocabulary KPIs, alerts and insights are written in.

Every report profile answers in these measures (per line and production day); daily log form lines add their own
codes (water, energy, temperatures, any parameter). Quantities are in the line's output unit (t, pcs, m³, batches
…). A measure the plant does not record is None — never 0 — so a KPI that needs it shows "missing data" instead
of a wrong value."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.operations import OpDailyReport, OpLogTemplate, OpMachine
from app.models.production import OpLossCategory
from app.models.tenancy import Plant
from app.services import oplogs

# code → kind ("qty" in the line's unit, "h" hours, "count")
STANDARD: dict[str, str] = {
    "planned_hours": "h",  # hours of the production day that have passed (24 for a finished day)
    "run_hours": "h",
    "produced": "qty",  # everything made (gross)
    "good": "qty",  # first quality
    "reject": "qty",
    "downgrade": "qty",  # second quality / rework
    "net": "qty",  # good + downgrade + reject
    "ideal": "qty",  # what the line makes at its ideal rate in the run time
    "planned_qty": "qty",  # target of the runs / orders
    "input_qty": "qty",  # material in
    "batches": "count",
    "batches_completed": "count",
    "downtime_hours": "h",
    "planned_downtime_hours": "h",
    "unplanned_downtime_hours": "h",
    "failure_hours": "h",  # equipment failures (maintenance discipline responsible)
    "stops": "count",
    "failures": "count",
    "quality_loss": "qty",  # rejected + downgraded quantity explained by defect
    "incidents": "count",  # safety incidents (register) of the lines' areas
    "lost_time_incidents": "count",
    "recordable_incidents": "count",  # lost time + medical treatment (TRIR)
    "lost_days": "count",  # working days lost to lost-time injuries (LTISR)
    "hours_worked": "h",  # employees + contractors, from the monthly hours worked (spread over the days)
    "safety_base": "count",  # the plant's rate base: 1,000,000 or 200,000 hours (LTIFR = LTI × base ÷ hours)
}


def lines_in_scope(
    db: Session, plant_id: uuid.UUID, machine_id: uuid.UUID | None = None, department_id: uuid.UUID | None = None
) -> list[OpMachine]:
    q = select(OpMachine).where(OpMachine.plant_id == plant_id)
    if machine_id:
        q = q.where(OpMachine.id == machine_id)
    elif department_id:
        q = q.where(OpMachine.department_id == department_id)
    return list(db.execute(q.order_by(OpMachine.code)).scalars())


def _profile_extras() -> dict[str, str]:
    from app.services.production.reports import PROFILES

    out: dict[str, str] = {}
    for mod in PROFILES.values():
        out.update(getattr(mod, "EXTRA_MEASURES", {}))
    return out


def variables(db: Session, plant_id: uuid.UUID) -> list[dict]:
    """Every code a KPI formula or alert rule may use: standard measures, profile measures in use, loss categories
    (loss_<CODE>, stop hours) and daily log lines."""
    out = [{"code": c, "kind": "measure", "unit": k} for c, k in STANDARD.items()]
    profiles = {m.report_profile for m in lines_in_scope(db, plant_id)}
    from app.services.production.reports import PROFILES

    for p in profiles:
        for c, k in getattr(PROFILES.get(p), "EXTRA_MEASURES", {}).items():
            out.append({"code": c, "kind": "profile", "unit": k, "profile": p})
    for c in db.execute(
        select(OpLossCategory).where(OpLossCategory.plant_id == plant_id).order_by(OpLossCategory.sort, OpLossCategory.code)
    ).scalars():
        out.append({"code": f"loss_{c.code}", "kind": "loss", "unit": "h", "label": c.name})
    seen = {v["code"] for v in out}
    for t in db.execute(select(OpLogTemplate).where(OpLogTemplate.plant_id == plant_id).order_by(OpLogTemplate.sort)).scalars():
        for fl in oplogs.fields_of(db, t.id, active_only=True):
            if fl.kind in oplogs.NUMERIC_KINDS and fl.code not in seen:
                seen.add(fl.code)
                out.append(
                    {
                        "code": fl.code,
                        "kind": "log",
                        "unit": fl.unit,
                        "label": fl.label,
                        "form": t.name,
                        "agg": "avg" if oplogs.averaged(fl) else "sum",
                    }
                )
    return out


def variable_codes(db: Session, plant_id: uuid.UUID) -> set[str]:
    codes = {v["code"] for v in variables(db, plant_id)}
    return codes | set(STANDARD) | set(_profile_extras())


def line_daily(db: Session, plant: Plant, lines: list[OpMachine], d0: date, d1: date) -> dict[date, dict[str, float | None]]:
    """{day: {measure: value}} of the lines' daily reports from d0 to d1, added up over the lines."""
    from app.services.production.reports import compute

    out: dict[date, dict[str, float | None]] = {}
    ids = [m.id for m in lines]
    if not ids:
        return out
    reports = db.execute(
        select(OpDailyReport).where(OpDailyReport.machine_id.in_(ids), OpDailyReport.report_date >= d0, OpDailyReport.report_date <= d1)
    ).scalars()
    for r in reports:
        day = out.setdefault(r.report_date, {})
        for k, v in compute(db, r, plant, to_date=False)["measures"].items():
            if v is None:
                day.setdefault(k, None)
            else:
                day[k] = (day.get(k) or 0.0) + float(v)
    return out


def log_daily(
    db: Session, plant: Plant, lines: list[OpMachine] | None, d0: date, d1: date, area_id: uuid.UUID | None = None
) -> tuple[dict[date, dict[str, float]], dict[str, str]]:
    """{day: {log line code: day figure}} of the plant's daily log forms (those of other lines left out when a scope of
    lines is given; with `area_id` only the area's forms and those of its lines) and how each code adds up over a
    period ("sum" or "avg")."""
    ids = {m.id for m in lines} if lines is not None else None
    out: dict[date, dict[str, float]] = defaultdict(dict)
    agg: dict[str, str] = {}
    for t in db.execute(
        select(OpLogTemplate).where(OpLogTemplate.plant_id == plant.id, OpLogTemplate.is_active.is_(True)).order_by(OpLogTemplate.sort)
    ).scalars():
        if ids is not None and t.machine_id is not None and t.machine_id not in ids:
            continue
        if area_id is not None and t.department_id != area_id and t.machine_id not in (ids or set()):
            continue
        fields = {str(fl.id): fl for fl in oplogs.fields_of(db, t.id, active_only=True) if fl.kind in oplogs.NUMERIC_KINDS}
        t_codes = {fl.code for fl in fields.values() if fl.code not in agg}
        for fid, series in oplogs.daily_series(db, t, d0, d1).items():
            fl = fields.get(fid)
            if fl is None or (fl.code in agg and fl.code not in t_codes):  # same code on two forms: the first form wins
                continue
            agg[fl.code] = "avg" if oplogs.averaged(fl) else "sum"
            for ds, v in series.items():
                out[date.fromisoformat(ds)].setdefault(fl.code, v)
    return dict(out), agg


def collect(
    db: Session, plant: Plant, lines: list[OpMachine], d0: date, d1: date, plant_wide: bool = False, area_id: uuid.UUID | None = None
) -> tuple[dict[date, dict[str, float | None]], dict[str, str]]:
    """Daily values of every measure and log code for the lines from d0 to d1, and the period rule of each code.
    Safety incidents: of the lines' areas (and the lines), or of the whole plant when `plant_wide`; every day counts
    (a day without incidents is 0, not missing). `area_id`: an area's figures (its incidents, hours worked and log
    forms), also for an area without production lines."""
    from app.services.production.incidents import daily_counts, daily_hours, safety_base

    daily = line_daily(db, plant, lines, d0, d1)
    depts = None if plant_wide else ({area_id} if area_id else {m.department_id for m in lines})
    inc = daily_counts(db, plant, d0, d1, depts, {m.id for m in lines})
    hrs = daily_hours(db, plant, d0, d1, depts)
    base = float(safety_base(db, plant.id))
    for d in days_between(d0, d1):
        day = daily.setdefault(d, {})
        c = inc.get(d, {})
        day["incidents"] = c.get("incidents", 0.0)
        day["lost_time_incidents"] = c.get("lost_time_incidents", 0.0)
        day["recordable_incidents"] = c.get("recordable_incidents", 0.0)
        day["lost_days"] = c.get("lost_days", 0.0)
        day["safety_base"] = base
        if d in hrs:
            day["hours_worked"] = hrs[d]
    logs, agg = log_daily(db, plant, lines, d0, d1, area_id)
    for d, vals in logs.items():
        day = daily.setdefault(d, {})
        for k, v in vals.items():
            if k not in day:  # a standard measure wins over a log line with the same code
                day[k] = v
    agg["safety_base"] = "avg"  # a constant: never added up over the days
    return daily, agg


def aggregate(daily: dict[date, dict[str, float | None]], agg: dict[str, str], days: list[date]) -> dict[str, float | None]:
    """Period figure of every code over the given days: measures and most log lines add up; averaged log lines
    (levels, temperatures, % …) are averaged. None when no day of the period has a value."""
    acc: dict[str, list[float]] = defaultdict(list)
    keys: set[str] = set()
    for d in days:
        for k, v in daily.get(d, {}).items():
            keys.add(k)
            if v is not None:
                acc[k].append(float(v))
    out: dict[str, float | None] = {}
    for k in keys:
        xs = acc.get(k)
        if not xs:
            out[k] = None
        else:
            out[k] = sum(xs) / len(xs) if agg.get(k) == "avg" else sum(xs)
    return out


def days_between(d0: date, d1: date) -> list[date]:
    return [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
