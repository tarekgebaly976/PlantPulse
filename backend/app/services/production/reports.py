"""Daily production reports of any line: the report profile of the line does the calculation, every profile
answers in the same standard measures (app.services.production.measures), and confirming a report writes the day's
production record so the maintenance KPI pages (OEE, cost per unit) use the same figures.

Report profiles are plug-ins: "generic" (any continuous, batch or discrete line) and industry configurations such as
"paper_machine" (the paper mill demo). A new industry needing its own report form adds a profile here; most need
none and use the generic profile with configured products, loss categories, log forms and KPIs."""

from decimal import Decimal
from types import ModuleType

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assets import DowntimeEvent
from app.models.enums import OpReportStatus
from app.models.operations import OpDailyReport, OpMachine, OpRunSegment
from app.models.production import OpOutput
from app.models.system import ProductionRecord
from app.models.tenancy import Plant
from app.services.production import generic, paper
from app.services.production.periods import DAY_HOURS, planned_hours  # noqa: F401  (re-exported)
from app.services.production.stops import TOL_H, classify, parts_of, stops_of  # noqa: F401  (re-exported)

PROFILES: dict[str, ModuleType] = {"generic": generic, "paper_machine": paper}


def profile_of(machine: OpMachine) -> ModuleType:
    return PROFILES.get(machine.report_profile or "generic", generic)


def compute(db: Session, report: OpDailyReport, plant: Plant, to_date: bool = True) -> dict:
    machine = db.get(OpMachine, report.machine_id)
    assert machine is not None
    return profile_of(machine).compute(db, report, plant, to_date=to_date)


def has_content(db: Session, report: OpDailyReport, machine: OpMachine) -> bool:
    stops = db.execute(select(func.count()).select_from(DowntimeEvent).where(DowntimeEvent.op_report_id == report.id)).scalar_one()
    model = OpRunSegment if machine.report_profile == "paper_machine" else OpOutput
    rows = db.execute(select(func.count()).select_from(model).where(model.report_id == report.id)).scalar_one()
    return bool(stops or rows)


def _dec(v: float | None, nd: int = 3) -> Decimal | None:
    return Decimal(str(round(v, nd))) if v is not None else None


def write_production_record(db: Session, report: OpDailyReport, plant: Plant, calc: dict) -> None:
    """Confirmed report → the day's production record of the line (planned and run hours, produced, good, net and
    ideal quantity in the line's unit), so OEE and cost per unit on the KPI pages use the report's figures."""
    machine = db.get(OpMachine, report.machine_id)
    assert machine is not None
    m = calc["measures"]
    rec = db.execute(
        select(ProductionRecord).where(
            ProductionRecord.plant_id == plant.id,
            ProductionRecord.department_id == machine.department_id,
            ProductionRecord.asset_id == machine.asset_id,
            ProductionRecord.record_date == report.report_date,
        )
    ).scalar_one_or_none()
    if rec is None:
        rec = ProductionRecord(
            plant_id=plant.id, department_id=machine.department_id, asset_id=machine.asset_id, record_date=report.report_date
        )
        db.add(rec)
    run_h = m.get("run_hours")
    rec.tons_produced = _dec(m.get("produced") or 0.0)  # type: ignore[assignment]
    rec.good_tons = _dec(m.get("good"))
    rec.net_tons = _dec(m.get("net"))
    rec.ideal_tons = _dec(m.get("ideal"))
    rec.planned_production_hours = _dec(m.get("planned_hours"), 2)
    rec.run_hours = _dec(run_h, 2)
    rec.ideal_rate_tph = _dec(m["ideal"] / run_h) if run_h and m.get("ideal") else None
    rec.created_by_id = report.confirmed_by_id
    db.flush()


def is_locked(report: OpDailyReport) -> bool:
    return report.status == OpReportStatus.CONFIRMED


def day_over(machine: OpMachine, plant: Plant, report: OpDailyReport) -> bool:
    return planned_hours(machine, plant, report.report_date) >= DAY_HOURS
