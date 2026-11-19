"""Safety, health and environment incident register (industry-independent): one register per plant, reported from
any department's shift log, a line's daily report or the register page; followed up with actions and work requests.
Daily counts feed the standard measures `incidents` and `lost_time_incidents` (KPIs, alert rules, insights)."""

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.production import OpIncident, OpPlantConfig, OpWorkHours
from app.models.tenancy import Plant
from app.services.notifications import notify, users_with_permission

KINDS = ("near_miss", "first_aid", "medical", "lost_time", "property", "environment", "other")
SEVERITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "investigating", "closed")
SERIOUS = {"lost_time", "medical", "environment"}
RECORDABLE = {"lost_time", "medical"}  # recordable injuries for TRIR (first aid and near misses are not)


def day_bounds(plant: Plant, d0: date, d1: date, day_start: time = time(7, 0)) -> tuple[datetime, datetime]:
    tz = ZoneInfo(plant.timezone)
    return datetime.combine(d0, day_start, tzinfo=tz), datetime.combine(d1 + timedelta(days=1), day_start, tzinfo=tz)


def daily_counts(
    db: Session, plant: Plant, d0: date, d1: date, department_ids: set[uuid.UUID] | None, machine_ids: set[uuid.UUID] | None = None
) -> dict[date, dict[str, float]]:
    """{production day: {"incidents": n, "lost_time_incidents": n}}; department_ids None = the whole plant."""
    a, b = day_bounds(plant, d0, d1)
    q = select(OpIncident).where(OpIncident.plant_id == plant.id, OpIncident.occurred_at >= a, OpIncident.occurred_at < b)
    tz = ZoneInfo(plant.timezone)
    out: dict[date, dict[str, float]] = defaultdict(
        lambda: {"incidents": 0.0, "lost_time_incidents": 0.0, "recordable_incidents": 0.0, "lost_days": 0.0}
    )
    for i in db.execute(q).scalars():
        if department_ids is not None and i.department_id not in department_ids and (not machine_ids or i.machine_id not in machine_ids):
            continue
        local = i.occurred_at.astimezone(tz)
        d = (local - timedelta(hours=7)).date()  # production day (07:00 to 07:00)
        out[d]["incidents"] += 1
        if i.kind == "lost_time":
            out[d]["lost_time_incidents"] += 1
            out[d]["lost_days"] += float(i.lost_days or 0)
        if i.kind in RECORDABLE:
            out[d]["recordable_incidents"] += 1
    return dict(out)


def _month_days(m: date) -> int:
    nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    return (nxt - m).days


def daily_hours(db: Session, plant: Plant, d0: date, d1: date, department_ids: set[uuid.UUID] | None) -> dict[date, float]:
    """Hours worked spread evenly over the days of each month ({day: hours}); days of months without hours are
    absent (missing, not 0). department_ids None = the whole plant (every row)."""
    rows = db.execute(
        select(OpWorkHours).where(OpWorkHours.plant_id == plant.id, OpWorkHours.month >= d0.replace(day=1), OpWorkHours.month <= d1)
    ).scalars()
    per_month: dict[date, float] = defaultdict(float)
    for r in rows:
        if department_ids is not None and r.department_id not in department_ids:
            continue
        per_month[r.month] += float(r.employee_hours or 0) + float(r.contractor_hours or 0)
    out: dict[date, float] = {}
    d = d0
    while d <= d1:
        m = d.replace(day=1)
        if m in per_month:
            out[d] = per_month[m] / _month_days(m)
        d += timedelta(days=1)
    return out


def safety_base(db: Session, plant_id: uuid.UUID) -> int:
    c = db.get(OpPlantConfig, plant_id)
    return int(c.safety_base) if c and c.safety_base else 1_000_000


def _rates(n_lti: float, n_rec: float, lost: float, hours: float, base: int) -> dict:
    r = (lambda x: round(x * base / hours, 2)) if hours else (lambda _x: None)
    return {"ltifr": r(n_lti), "ltisr": r(lost), "trir": r(n_rec)}


def monthly(db: Session, plant: Plant, today: date, months: int = 12, department_id: uuid.UUID | None = None) -> dict:
    """Safety statistics per month (newest first) and over the rolling 12 months: hours worked, lost-time and
    recordable incidents, lost days, LTIFR / LTISR / TRIR per the plant's base (1,000,000 or 200,000 hours)."""
    tz = ZoneInfo(plant.timezone)
    base = safety_base(db, plant.id)
    first = today.replace(day=1)
    starts = []
    m = first
    for _ in range(months):
        starts.append(m)
        m = (m - timedelta(days=1)).replace(day=1)
    lo = starts[-1]
    hq = select(OpWorkHours).where(OpWorkHours.plant_id == plant.id, OpWorkHours.month >= lo)
    if department_id:
        hq = hq.where(OpWorkHours.department_id == department_id)
    hours: dict[date, list[float]] = defaultdict(lambda: [0.0, 0.0])
    recorded: set[date] = set()
    for h in db.execute(hq).scalars():
        hours[h.month][0] += float(h.employee_hours or 0)
        hours[h.month][1] += float(h.contractor_hours or 0)
        recorded.add(h.month)
    iq = select(OpIncident).where(OpIncident.plant_id == plant.id, OpIncident.occurred_at >= datetime.combine(lo, time(0), tzinfo=tz))
    if department_id:
        iq = iq.where(OpIncident.department_id == department_id)
    inc: dict[date, dict[str, float]] = defaultdict(lambda: {"lti": 0.0, "rec": 0.0, "lost": 0.0, "all": 0.0})
    for i in db.execute(iq).scalars():
        mm = i.occurred_at.astimezone(tz).date().replace(day=1)
        inc[mm]["all"] += 1
        if i.kind == "lost_time":
            inc[mm]["lti"] += 1
            inc[mm]["lost"] += float(i.lost_days or 0)
        if i.kind in RECORDABLE:
            inc[mm]["rec"] += 1
    rows = []
    tot = {"hours": 0.0, "lti": 0.0, "rec": 0.0, "lost": 0.0, "all": 0.0}
    for mm in starts:
        h = sum(hours[mm]) if mm in recorded else None
        c = inc[mm]
        rows.append({"month": mm.isoformat(), "employee_hours": hours[mm][0] if mm in recorded else None,
                     "contractor_hours": hours[mm][1] if mm in recorded else None, "hours": h, "incidents": int(c["all"]),
                     "lost_time": int(c["lti"]), "recordable": int(c["rec"]), "lost_days": int(c["lost"]),
                     **_rates(c["lti"], c["rec"], c["lost"], h or 0.0, base)})  # fmt: skip
        if h:  # rolling figures only over months with hours, so a missing month does not inflate the rates
            tot["hours"] += h
            for k in ("lti", "rec", "lost", "all"):
                tot[k] += c[k]
    return {"base": base, "months": rows, "rolling": {"months_with_hours": len(recorded), "hours": tot["hours"], "lost_time": int(tot["lti"]),
            "recordable": int(tot["rec"]), "lost_days": int(tot["lost"]), **_rates(tot["lti"], tot["rec"], tot["lost"], tot["hours"], base)}}  # fmt: skip


def stats(db: Session, plant: Plant, today: date) -> dict:
    rows = list(db.execute(select(OpIncident).where(OpIncident.plant_id == plant.id)).scalars())
    month0 = today.replace(day=1)
    tz = ZoneInfo(plant.timezone)
    by_kind: dict[str, int] = defaultdict(int)
    for i in rows:
        if i.occurred_at.astimezone(tz).date() >= month0:
            by_kind[i.kind] += 1
    lti = [i.occurred_at for i in rows if i.kind == "lost_time"]
    return {
        "open": sum(1 for i in rows if i.status != "closed"),
        "month_by_kind": dict(by_kind),
        "month_total": sum(by_kind.values()),
        "days_since_lost_time": (today - max(lti).astimezone(tz).date()).days if lti else None,
        "total": len(rows),
    }


def announce(db: Session, plant: Plant, inc: OpIncident) -> None:
    """Production managers of the area hear about every incident; serious ones also by e-mail."""
    serious = inc.kind in SERIOUS or inc.severity in ("high", "critical")
    users = set(users_with_permission(db, plant.id, "op.confirm", inc.department_id))
    notify(db, plant.id, users, kind="op_incident", title=f"{inc.number}: {inc.title}"[:200], severity="critical" if serious else "warning",
           body=inc.description, link="/operations/incidents", dedupe_key=f"op_incident:{inc.id}", email=serious)  # fmt: skip
