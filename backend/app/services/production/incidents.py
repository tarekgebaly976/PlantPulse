"""Safety, health and environment incident register (industry-independent): one register per plant, reported from
any department's shift log, a line's daily report or the register page; followed up with actions and work requests.
Daily counts feed the standard measures `incidents` and `lost_time_incidents` (KPIs, alert rules, insights)."""

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.production import OpIncident
from app.models.tenancy import Plant
from app.services.notifications import notify, users_with_permission

KINDS = ("near_miss", "first_aid", "medical", "lost_time", "property", "environment", "other")
SEVERITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "investigating", "closed")
SERIOUS = {"lost_time", "medical", "environment"}


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
    out: dict[date, dict[str, float]] = defaultdict(lambda: {"incidents": 0.0, "lost_time_incidents": 0.0})
    for i in db.execute(q).scalars():
        if department_ids is not None and i.department_id not in department_ids and (not machine_ids or i.machine_id not in machine_ids):
            continue
        local = i.occurred_at.astimezone(tz)
        d = (local - timedelta(hours=7)).date()  # production day (07:00 to 07:00)
        out[d]["incidents"] += 1
        if i.kind == "lost_time":
            out[d]["lost_time_incidents"] += 1
    return dict(out)


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
