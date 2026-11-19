"""Whole-mill view of the production dashboard: every area on one screen (output, OEE, downtime, safety and the
worst KPI status of each area), production per line, the main losses over all lines, safety rates and the
follow-up (open alerts, overdue actions, open incidents). Quantities of different units (tonnes, packs …) are never
added up: production is given per line with its unit."""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.operations import OpMachine
from app.models.production import OpAction, OpAlert, OpIncident, OpLossCategory
from app.models.tenancy import Department, Plant
from app.services.production import incidents as inc_svc
from app.services.production import kpis as kp
from app.services.production import measures as ms
from app.services.production.generic import oee

RANK = {"critical": 0, "warning": 1, "off_target": 2, "ok": 3, "no_target": 4, "missing": 5}


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


def line_summary(db: Session, plant: Plant, m: OpMachine, days: list[date]) -> tuple[dict, dict[str, float], dict[str, float]]:
    """(summary of the finished days, losses in hours by category code, produced per day) of one line."""
    daily = ms.line_daily(db, plant, [m], days[0], days[-1]) if days else {}
    tot: dict[str, float] = defaultdict(float)
    losses: dict[str, float] = defaultdict(float)
    per_day: dict[str, float] = {}
    n = 0
    for d in days:
        v = daily.get(d)
        if not v:
            continue
        n += 1
        if v.get("produced") is not None:
            per_day[d.isoformat()] = round(float(v["produced"]), 3)
        for k, x in v.items():
            if x is None:
                continue
            if k.startswith("loss_"):
                losses[k[5:]] += float(x)
            else:
                tot[k] += float(x)
    o = oee(
        tot.get("run_hours"),
        tot.get("planned_hours", 0.0),
        tot.get("produced", 0.0),
        tot.get("ideal"),
        tot.get("good", 0.0),
        tot.get("net", 0.0),
    )
    return (
        {
            "id": str(m.id),
            "code": m.code,
            "name": m.name,
            "unit": m.output_unit,
            "days": n,
            "produced": _r(tot.get("produced")),
            "good": _r(tot.get("good")),
            "planned_qty": _r(tot.get("planned_qty")),
            "oee": _r(o["oee"], 4),
            "availability": _r(o["availability"], 4),
            "performance": _r(o["performance"], 4),
            "quality": _r(o["quality"], 4),
            "downtime_hours": _r(tot.get("downtime_hours"), 2),
            "failure_hours": _r(tot.get("failure_hours"), 2),
        },  # fmt: skip
        dict(losses),
        per_day,
    )


def view(
    db: Session, plant: Plant, areas: list[Department], lines: list[OpMachine], today: date, days: int, area_kpis: list, mill_kpis: list
) -> dict:
    last = today - timedelta(days=1)
    window = ms.days_between(today - timedelta(days=days - 1), last)
    active = [m for m in lines if m.is_active]
    summaries: dict[uuid.UUID, dict] = {}
    losses: dict[str, float] = defaultdict(float)
    production: dict[str, dict] = {}
    for m in active:
        s, lo, per_day = line_summary(db, plant, m, window)
        summaries[m.id] = s
        for k, h in lo.items():
            losses[k] += h
        g = production.setdefault(m.output_unit or "", {"unit": m.output_unit, "lines": [], "days": defaultdict(dict)})
        g["lines"].append(m.code)
        for d, v in per_day.items():
            g["days"][d][m.code] = v

    # loss categories: top-level ones (sub-categories are counted in their parent by the report)
    cats = list(db.execute(select(OpLossCategory).where(OpLossCategory.plant_id == plant.id)).scalars())
    top = {c.code: c.name for c in cats if c.parent_id is None}
    loss_rows = sorted(
        ({"code": k, "name": top[k], "hours": round(h, 2)} for k, h in losses.items() if k in top and h > 0), key=lambda x: -x["hours"]
    )

    # open alerts per area (an alert of a line belongs to the line's area)
    line_area = {m.id: m.department_id for m in lines}
    alert_rows = db.execute(
        select(OpAlert.machine_id, OpAlert.severity).where(OpAlert.plant_id == plant.id, OpAlert.status == "open")
    ).all()
    alerts_by_area: dict[uuid.UUID | None, int] = defaultdict(int)
    alerts_by_sev: dict[str, int] = defaultdict(int)
    for mid, sev in alert_rows:
        alerts_by_area[line_area.get(mid) if mid else None] += 1
        alerts_by_sev[sev] += 1

    inc = inc_svc.daily_counts(db, plant, window[0], window[-1], None) if window else {}
    area_rows = []
    for a in areas:
        a_lines = [summaries[m.id] for m in active if m.department_id == a.id]
        a_inc = (
            inc_svc.daily_counts(db, plant, window[0], window[-1], {a.id}, {m.id for m in active if m.department_id == a.id})
            if window
            else {}
        )
        statuses = []
        rows = [k for k in area_kpis if k.department_id in (None, a.id) and (k.machine_id is None or line_area.get(k.machine_id) == a.id)]
        for r in kp.evaluate(db, plant, rows, today, days=days, range_days=days, area_id=a.id) if rows else []:
            v = r["values"]["range"]
            if v["value"] is None:
                continue
            statuses.append({"code": r["code"], "name": r["name"], "status": v["status"]})
        bad = sorted((x for x in statuses if x["status"] in ("critical", "warning", "off_target")), key=lambda x: RANK[x["status"]])
        area_rows.append({
            "id": str(a.id), "code": a.code, "name": a.name, "name_ar": a.name_ar, "lines": a_lines,
            "incidents": int(sum(x["incidents"] for x in a_inc.values())), "lost_time": int(sum(x["lost_time_incidents"] for x in a_inc.values())),
            "open_alerts": alerts_by_area.get(a.id, 0), "status": bad[0]["status"] if bad else ("ok" if statuses else "no_target"),
            "off": bad[:3], "kpis": len(statuses),
        })  # fmt: skip

    overdue = db.execute(
        select(func.count())
        .select_from(OpAction)
        .where(OpAction.plant_id == plant.id, OpAction.status.in_(("open", "in_progress")), OpAction.due_date < today)
    ).scalar_one()
    open_actions = db.execute(
        select(func.count()).select_from(OpAction).where(OpAction.plant_id == plant.id, OpAction.status.in_(("open", "in_progress")))
    ).scalar_one()
    open_inc = db.execute(
        select(func.count()).select_from(OpIncident).where(OpIncident.plant_id == plant.id, OpIncident.status != "closed")
    ).scalar_one()
    safety = inc_svc.monthly(db, plant, today)
    stats = inc_svc.stats(db, plant, today)
    return {
        "kpis": kp.evaluate(db, plant, mill_kpis, today, days=days, range_days=days) if mill_kpis else [],
        "areas": area_rows,
        "production": [
            {"unit": g["unit"], "lines": g["lines"], "series": [{"day": d, **v} for d, v in sorted(g["days"].items())]}
            for g in production.values()
        ],
        "losses": loss_rows,
        "safety": {
            "base": safety["base"],
            "rolling": safety["rolling"],
            "days_since_lost_time": stats["days_since_lost_time"],
            "incidents": int(sum(x["incidents"] for x in inc.values())),
            "lost_time": int(sum(x["lost_time_incidents"] for x in inc.values())),
        },  # fmt: skip
        "follow_up": {
            "alerts": dict(alerts_by_sev),
            "open_alerts": len(alert_rows),
            "overdue_actions": overdue,
            "open_actions": open_actions,
            "open_incidents": open_inc,
        },
    }
