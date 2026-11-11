"""Targets for the KPIs the CMMS calculates: one per KPI for the whole plant, optionally overridden per department."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.kpi_definitions import KPI_DEFINITIONS
from app.models.system import KPITarget
from app.models.tenancy import Department, Plant
from app.services.common import utcnow

# Which way is good, used when a target is first set (the user can change it).
LOWER_IS_BETTER = {
    "backlog",
    "overdue_work_orders",
    "emergency_pct",
    "mttr",
    "cost_per_ton",
    "cost_by_department",
    "repeat_failure_rate",
    "breakdown_downtime",
    "pdm_alerts",
    "stockout_rate",
    "budget_vs_actual",
}
CODES = {d["code"] for d in KPI_DEFINITIONS}


def higher_is_better(code: str) -> bool:
    return code not in LOWER_IS_BETTER


def out(t: KPITarget) -> dict[str, Any]:
    return {
        "kpi_code": t.kpi_code,
        "department_id": str(t.department_id) if t.department_id else None,
        "target": float(t.target),
        "higher_is_better": t.higher_is_better,
    }


def list_targets(db: Session, plant: Plant) -> list[dict[str, Any]]:
    rows = db.execute(select(KPITarget).where(KPITarget.plant_id == plant.id).order_by(KPITarget.kpi_code)).scalars()
    return [out(t) for t in rows]


def save_target(
    db: Session, plant: Plant, code: str, department_id: uuid.UUID | None, target: float | None, hib: bool | None
) -> dict[str, Any] | None:
    """Set (or with target None remove) the target of one KPI for the plant or a department."""
    if code not in CODES:
        raise ValueError(f"Unknown KPI {code}")
    if department_id is not None:
        d = db.get(Department, department_id)
        if d is None or d.plant_id != plant.id:
            raise ValueError("Department not found")
    scope = str(department_id) if department_id else "plant"
    t = db.execute(
        select(KPITarget).where(KPITarget.plant_id == plant.id, KPITarget.kpi_code == code, KPITarget.scope_key == scope)
    ).scalar_one_or_none()
    if target is None:
        if t is not None:
            db.delete(t)
        return None
    if t is None:
        t = KPITarget(plant_id=plant.id, kpi_code=code, scope_key=scope, department_id=department_id)
        db.add(t)
    t.target, t.updated_at = target, utcnow()
    t.higher_is_better = higher_is_better(code) if hib is None else hib
    db.flush()
    return out(t)


DEMO_TARGETS = {
    "pm_compliance": 90,
    "schedule_compliance": 85,
    "planned_maintenance_pct": 80,
    "emergency_pct": 10,
    "mtbf": 300,
    "mttr": 4,
    "availability": 97,
    "oee": 85,
    "lubrication_compliance": 95,
    "backlog": 40,
    "overdue_work_orders": 3,
}


def add_demo_targets(db: Session, plant: Plant) -> int:
    """Plant-level targets for the sample plant (kept if already set)."""
    have = {t["kpi_code"] for t in list_targets(db, plant)}
    n = 0
    for code, v in DEMO_TARGETS.items():
        if code not in have:
            save_target(db, plant, code, None, v, None)
            n += 1
    return n


def run_for_demo() -> str:
    from app.core.db import SessionLocal
    from app.models.tenancy import Organization

    with SessionLocal() as db, db.begin():
        org = db.execute(select(Organization).where(Organization.code == "DEMO")).scalar_one_or_none()
        if org is None:
            return "No DEMO organization"
        plants = list(db.execute(select(Plant).where(Plant.organization_id == org.id)).scalars())
        return "; ".join(f"{p.code}: {add_demo_targets(db, p)} targets added" for p in plants)
