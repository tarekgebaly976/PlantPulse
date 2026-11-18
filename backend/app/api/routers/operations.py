"""Production module API: production lines and their settings (disciplines, sections, defects; paper profile: grades
and ideal rates) and the daily production report of any line (generic profile: output lines; paper profile: runs and
reels), stops classified by loss category, quality losses, submit / confirm / reopen.
Calculations live in app.services.production (reports dispatches to the line's report profile). The whole module is present only when the installation switches it on
(CMMS_OPERATIONS_MODULE): otherwise nobody holds an op.* permission and every route answers 403."""

import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.assets import Asset, DowntimeEvent
from app.models.enums import OpLossKind, OpReportStatus
from app.models.identity import User
from app.models.operations import (
    OpDailyReport,
    OpDefect,
    OpDiscipline,
    OpGrade,
    OpMachine,
    OpQualityLoss,
    OpReel,
    OpRunSegment,
    OpSection,
    OpStopPart,
)
from app.models.production import OpLossCategory, OpOutput, OpProduct
from app.models.tenancy import Department
from app.schemas.common import In
from app.services import oplogs as oplog_svc
from app.services.common import audit, plant_today, utcnow
from app.services.production import generic, paper
from app.services.production import reports as svc
from app.services.production.periods import hours as _hours
from app.services.production.stops import default_category

router = APIRouter(prefix="/operations", tags=["operations"])

DB = Depends(get_db, scope="function")
CODE = r"^[A-Za-z0-9][A-Za-z0-9 ._/&-]*$"


def _num(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


def _commit_unique(db: Session, what: str) -> None:
    try:
        db.flush()
    except IntegrityError as e:
        raise HTTPException(409, f"{what} already exists") from e


# ================================================================ settings
class ShiftIn(BaseModel):
    code: str = Field(min_length=1, max_length=8, pattern=CODE)
    name: str = Field(min_length=1, max_length=40)
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class MachineIn(In):
    code: str = Field(min_length=1, max_length=20, pattern=CODE)
    name: str = Field(min_length=1, max_length=120)
    department_id: uuid.UUID
    asset_id: uuid.UUID
    production_model: Literal["continuous", "batch", "discrete"] = "continuous"
    output_unit: str = Field("t", min_length=1, max_length=12)
    report_profile: Literal["generic", "paper_machine"] = "generic"
    trim_width_m: float | None = Field(None, gt=0, le=20)
    day_start: time = time(7, 0)
    shifts: list[ShiftIn] = Field(min_length=1, max_length=4)
    is_active: bool = True

    @field_validator("shifts")
    @classmethod
    def _distinct(cls, v: list[ShiftIn]) -> list[ShiftIn]:
        if len({s.code for s in v}) != len(v):
            raise ValueError("shift codes must be different")
        return v


class GradeIn(In):
    code: str = Field(min_length=1, max_length=30, pattern=CODE)
    name: str | None = Field(None, max_length=120)
    gsm: int = Field(ge=10, le=2000)
    target_speed_mpm: float | None = Field(None, gt=0, le=3000)
    ideal_mt_min: float = Field(gt=0, le=10)
    is_active: bool = True


class DisciplineIn(In):
    code: str = Field(min_length=1, max_length=20, pattern=CODE)
    name: str = Field(min_length=1, max_length=80)
    maintenance: bool = False
    sort: int = Field(0, ge=0, le=999)
    is_active: bool = True


class SectionIn(In):
    name: str = Field(min_length=1, max_length=80)
    asset_id: uuid.UUID | None = None
    sort: int = Field(0, ge=0, le=999)
    is_active: bool = True


class DefectIn(In):
    name: str = Field(min_length=1, max_length=120)
    disposition: str = Field("R/P", min_length=1, max_length=10)
    is_active: bool = True


def machine_out(m: OpMachine) -> dict:
    return {
        "id": str(m.id),
        "code": m.code,
        "name": m.name,
        "department_id": str(m.department_id),
        "asset_id": str(m.asset_id),
        "production_model": m.production_model,
        "output_unit": m.output_unit,
        "report_profile": m.report_profile,
        "trim_width_m": _num(m.trim_width_m),
        "day_start": m.day_start.strftime("%H:%M"),
        "shifts": m.shifts,
        "is_active": m.is_active,
    }


def grade_out(g: OpGrade) -> dict:
    return {
        "id": str(g.id),
        "machine_id": str(g.machine_id),
        "code": g.code,
        "name": g.name,
        "gsm": g.gsm,
        "target_speed_mpm": _num(g.target_speed_mpm),
        "ideal_mt_min": _num(g.ideal_mt_min),
        "is_active": g.is_active,
    }


def _machine(db: Session, ctx: Ctx, mid: uuid.UUID) -> OpMachine:
    m = db.get(OpMachine, mid)
    if m is None or m.plant_id != ctx.plant_id or not ctx.dept_ok(m.department_id):
        raise HTTPException(404, "Machine not found")
    return m


def _check_machine_refs(db: Session, ctx: Ctx, body: MachineIn) -> None:
    d = db.get(Department, body.department_id)
    if d is None or d.plant_id != ctx.plant_id:
        raise HTTPException(422, "Unknown department")
    a = db.get(Asset, body.asset_id)
    if a is None or a.plant_id != ctx.plant_id:
        raise HTTPException(422, "Unknown asset")


def _check_asset(db: Session, ctx: Ctx, aid: uuid.UUID | None) -> None:
    if aid is not None:
        a = db.get(Asset, aid)
        if a is None or a.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown asset")


@router.get("/settings")
def get_settings_(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    machines = [m for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id).order_by(OpMachine.code)).scalars()]
    machines = [m for m in machines if ctx.dept_ok(m.department_id)]
    mids = [m.id for m in machines]
    grades = (
        list(db.execute(select(OpGrade).where(OpGrade.machine_id.in_(mids)).order_by(OpGrade.gsm, OpGrade.code)).scalars()) if mids else []
    )
    sections = (
        list(db.execute(select(OpSection).where(OpSection.machine_id.in_(mids)).order_by(OpSection.sort, OpSection.name)).scalars())
        if mids
        else []
    )
    disc = db.execute(
        select(OpDiscipline).where(OpDiscipline.plant_id == ctx.plant_id).order_by(OpDiscipline.sort, OpDiscipline.code)
    ).scalars()
    defects = db.execute(select(OpDefect).where(OpDefect.plant_id == ctx.plant_id).order_by(OpDefect.name)).scalars()
    return {
        "machines": [
            {
                **machine_out(m),
                "grades": [grade_out(g) for g in grades if g.machine_id == m.id],
                "sections": [
                    {
                        "id": str(s.id),
                        "name": s.name,
                        "asset_id": str(s.asset_id) if s.asset_id else None,
                        "sort": s.sort,
                        "is_active": s.is_active,
                    }
                    for s in sections
                    if s.machine_id == m.id
                ],
            }
            for m in machines
        ],
        "disciplines": [
            {"id": str(d.id), "code": d.code, "name": d.name, "maintenance": d.maintenance, "sort": d.sort, "is_active": d.is_active}
            for d in disc
        ],
        "defects": [{"id": str(d.id), "name": d.name, "disposition": d.disposition, "is_active": d.is_active} for d in defects],
    }


@router.post("/machines", status_code=201)
def create_machine(body: MachineIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    _check_machine_refs(db, ctx, body)
    data = body.model_dump()
    data["shifts"] = [s.model_dump() for s in body.shifts]
    m = OpMachine(plant_id=ctx.plant_id, **data)
    db.add(m)
    _commit_unique(db, "A machine with this code")
    audit(
        db, "op.machine.create", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_machine", entity_id=m.id, data={"code": m.code}
    )
    return machine_out(m)


@router.put("/machines/{mid}")
def update_machine(mid: uuid.UUID, body: MachineIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    m = _machine(db, ctx, mid)
    _check_machine_refs(db, ctx, body)
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    m.shifts = [s.model_dump() for s in body.shifts]
    _commit_unique(db, "A machine with this code")
    return machine_out(m)


@router.post("/machines/{mid}/grades", status_code=201)
def create_grade(mid: uuid.UUID, body: GradeIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    m = _machine(db, ctx, mid)
    g = OpGrade(plant_id=ctx.plant_id, machine_id=m.id, **body.model_dump())
    db.add(g)
    _commit_unique(db, "A grade with this code")
    return grade_out(g)


@router.put("/grades/{gid}")
def update_grade(gid: uuid.UUID, body: GradeIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    g = db.get(OpGrade, gid)
    if g is None or g.plant_id != ctx.plant_id:
        raise HTTPException(404, "Grade not found")
    _machine(db, ctx, g.machine_id)
    before = _num(g.ideal_mt_min)
    for k, v in body.model_dump().items():
        setattr(g, k, v)
    _commit_unique(db, "A grade with this code")
    if before != body.ideal_mt_min:  # old reports keep the rate they copied; only new runs use the new one
        audit(
            db, "op.grade.rate", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_grade", entity_id=g.id,
            data={"code": g.code, "from": before, "to": body.ideal_mt_min},
        )  # fmt: skip
    return grade_out(g)


@router.post("/machines/{mid}/sections", status_code=201)
def create_section(mid: uuid.UUID, body: SectionIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    m = _machine(db, ctx, mid)
    _check_asset(db, ctx, body.asset_id)
    s = OpSection(plant_id=ctx.plant_id, machine_id=m.id, **body.model_dump())
    db.add(s)
    _commit_unique(db, "A section with this name")
    return {"id": str(s.id)}


@router.put("/sections/{sid}")
def update_section(sid: uuid.UUID, body: SectionIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    s = db.get(OpSection, sid)
    if s is None or s.plant_id != ctx.plant_id:
        raise HTTPException(404, "Section not found")
    _check_asset(db, ctx, body.asset_id)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    _commit_unique(db, "A section with this name")
    return {"id": str(s.id)}


@router.post("/disciplines", status_code=201)
def create_discipline(body: DisciplineIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    d = OpDiscipline(plant_id=ctx.plant_id, **body.model_dump())
    db.add(d)
    _commit_unique(db, "A discipline with this code")
    return {"id": str(d.id)}


@router.put("/disciplines/{did}")
def update_discipline(did: uuid.UUID, body: DisciplineIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    d = db.get(OpDiscipline, did)
    if d is None or d.plant_id != ctx.plant_id:
        raise HTTPException(404, "Discipline not found")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    _commit_unique(db, "A discipline with this code")
    return {"id": str(d.id)}


@router.post("/defects", status_code=201)
def create_defect(body: DefectIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    d = OpDefect(plant_id=ctx.plant_id, **body.model_dump())
    db.add(d)
    _commit_unique(db, "A defect with this name")
    return {"id": str(d.id)}


@router.put("/defects/{did}")
def update_defect(did: uuid.UUID, body: DefectIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    d = db.get(OpDefect, did)
    if d is None or d.plant_id != ctx.plant_id:
        raise HTTPException(404, "Defect not found")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    _commit_unique(db, "A defect with this name")
    return {"id": str(d.id)}


# ================================================================ daily reports
def _report(db: Session, ctx: Ctx, rid: uuid.UUID, lock: bool = False) -> tuple[OpDailyReport, OpMachine]:
    q = select(OpDailyReport).where(OpDailyReport.id == rid, OpDailyReport.plant_id == ctx.plant_id)
    if lock:
        q = q.with_for_update()
    r = db.execute(q).scalar_one_or_none()
    if r is None:
        raise HTTPException(404, "Report not found")
    m = db.get(OpMachine, r.machine_id)
    if m is None or not ctx.dept_ok(m.department_id):
        raise HTTPException(404, "Report not found")
    return r, m


def _editable(ctx: Ctx, r: OpDailyReport) -> None:
    """Draft: whoever enters reports. Submitted: only the person who confirms (to correct before locking). Confirmed:
    nobody (reopen first, which keeps a revision)."""
    if r.status == OpReportStatus.CONFIRMED:
        raise DomainError("The report is confirmed and locked. Reopen it to change it.", "locked", 409)
    if r.status == OpReportStatus.SUBMITTED and not ctx.has("op.confirm"):
        raise DomainError("The report was submitted: only the production manager can change it now.", "submitted", 409)
    if r.status == OpReportStatus.DRAFT and not (ctx.has("op.enter") or ctx.has("op.confirm")):
        raise HTTPException(403, "Missing permission: op.enter")


def _edit(db: Session, ctx: Ctx, rid: uuid.UUID) -> tuple[OpDailyReport, OpMachine]:
    r, m = _report(db, ctx, rid, lock=True)
    _editable(ctx, r)
    return r, m


def _aware(v: datetime, tz: ZoneInfo) -> datetime:
    return v.replace(tzinfo=tz) if v.tzinfo is None else v


class ReportCreate(In):
    machine_id: uuid.UUID
    report_date: date


class ReportPatch(In):
    supervisors: dict[str, str] | None = None
    notes: str | None = Field(None, max_length=4000)
    steam_mt: float | None = Field(None, ge=0, le=100000)
    water_pm_m3: float | None = Field(None, ge=0, le=1000000)
    water_sp_m3: float | None = Field(None, ge=0, le=1000000)
    water_ut_m3: float | None = Field(None, ge=0, le=1000000)
    broke_tower_pct: float | None = Field(None, ge=0, le=100)


def _names(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _summary(db: Session, ctx: Ctx, r: OpDailyReport, m: OpMachine) -> dict:
    """List row in the standard measures (any profile): gross = produced, a = good."""
    c = svc.compute(db, r, ctx.plant, to_date=False)
    ms = c["measures"]
    return {
        "id": str(r.id),
        "machine_id": str(m.id),
        "machine": m.code,
        "profile": m.report_profile,
        "unit": m.output_unit,
        "report_date": r.report_date.isoformat(),
        "status": r.status.value,
        "revision": r.revision,
        "gross": ms["produced"],
        "net": ms["net"],
        "a": ms["good"],
        "reject_pct": round(ms["reject"] / ms["net"], 4) if ms["net"] else None,
        "run_hours": ms["run_hours"],
        "oee": c["oee"]["oee"],
        "breaks": ms.get("breaks"),
        "downtime_hours": c["stops"]["downtime_hours"],
        "warnings": len(c["warnings"]),
    }


@router.get("/reports")
def list_reports(
    machine_id: uuid.UUID | None = None,
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: Ctx = Depends(require("op.view")),
    db: Session = DB,
) -> dict:
    today = plant_today(ctx.plant)
    y, mo = (int(x) for x in month.split("-")) if month else (today.year, today.month)
    d0 = date(y, mo, 1)
    d1 = date(y + (mo == 12), mo % 12 + 1, 1)
    q = select(OpDailyReport).where(OpDailyReport.plant_id == ctx.plant_id, OpDailyReport.report_date >= d0, OpDailyReport.report_date < d1)
    if machine_id:
        q = q.where(OpDailyReport.machine_id == machine_id)
    rows = []
    machines: dict[uuid.UUID, OpMachine | None] = {}
    for r in db.execute(q.order_by(OpDailyReport.report_date.desc())).scalars():
        if r.machine_id not in machines:
            machines[r.machine_id] = db.get(OpMachine, r.machine_id)
        m = machines[r.machine_id]
        if m is None or not ctx.dept_ok(m.department_id):
            continue
        rows.append(_summary(db, ctx, r, m))
    mtd = None
    if machine_id and rows:
        m = machines.get(machine_id)
        if m is not None:
            last = date.fromisoformat(rows[0]["report_date"])
            mtd = (paper._period_totals(db, m, d0, last) if m.report_profile == "paper_machine"
                   else generic.period_totals(db, m, ctx.plant, d0, last))  # fmt: skip
    return {"items": rows, "month": f"{y:04d}-{mo:02d}", "today": today.isoformat(), "mtd": mtd}


@router.post("/reports", status_code=201)
def create_report(body: ReportCreate, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    m = _machine(db, ctx, body.machine_id)
    if not m.is_active:
        raise HTTPException(422, "The machine is not active")
    if body.report_date > plant_today(ctx.plant):
        raise HTTPException(422, "A report cannot be made for a future day")
    old = db.execute(
        select(OpDailyReport).where(OpDailyReport.machine_id == m.id, OpDailyReport.report_date == body.report_date)
    ).scalar_one_or_none()
    if old is not None:
        return {"id": str(old.id), "existing": True}
    r = OpDailyReport(plant_id=ctx.plant_id, machine_id=m.id, report_date=body.report_date, created_by_id=ctx.user.id, supervisors={})
    db.add(r)
    db.flush()
    audit(db, "op.report.create", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_report", entity_id=r.id,
          data={"machine": m.code, "date": body.report_date.isoformat()})  # fmt: skip
    return {"id": str(r.id), "existing": False}


@router.get("/reports/{rid}")
def get_report(rid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _report(db, ctx, rid)
    segs = list(db.execute(select(OpRunSegment).where(OpRunSegment.report_id == r.id).order_by(OpRunSegment.started_at)).scalars())
    reels = list(db.execute(select(OpReel).where(OpReel.report_id == r.id)).scalars())
    reels.sort(key=lambda x: (x.shift, x.reel_no.zfill(12)))
    losses = list(db.execute(select(OpQualityLoss).where(OpQualityLoss.report_id == r.id)).scalars())
    events = svc.stops_of(db, [r.id])
    parts = svc.parts_of(db, [e.id for e in events])
    names = _names(db, {r.created_by_id, r.submitted_by_id, r.confirmed_by_id})
    calc = svc.compute(db, r, ctx.plant)
    seg_calc = {s["id"]: s for s in calc.get("segments", [])}
    outputs = generic.outputs_of(db, [r.id]) if m.report_profile != "paper_machine" else []
    prev = db.execute(
        select(OpDailyReport.id, OpDailyReport.report_date)
        .where(OpDailyReport.machine_id == m.id, OpDailyReport.report_date < r.report_date)
        .order_by(OpDailyReport.report_date.desc())
        .limit(1)
    ).first()
    nxt = db.execute(
        select(OpDailyReport.id, OpDailyReport.report_date)
        .where(OpDailyReport.machine_id == m.id, OpDailyReport.report_date > r.report_date)
        .order_by(OpDailyReport.report_date)
        .limit(1)
    ).first()
    can_edit = True
    try:
        _editable(ctx, r)
    except (DomainError, HTTPException):
        can_edit = False
    return {
        "id": str(r.id),
        "machine": machine_out(m),
        "report_date": r.report_date.isoformat(),
        "status": r.status.value,
        "revision": r.revision,
        "can_edit": can_edit,
        "supervisors": r.supervisors or {},
        "notes": r.notes,
        "steam_mt": _num(r.steam_mt),
        "water_pm_m3": _num(r.water_pm_m3),
        "water_sp_m3": _num(r.water_sp_m3),
        "water_ut_m3": _num(r.water_ut_m3),
        "broke_tower_pct": _num(r.broke_tower_pct),
        "created_by": names.get(r.created_by_id),
        "submitted_by": names.get(r.submitted_by_id),
        "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        "confirmed_by": names.get(r.confirmed_by_id),
        "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
        "reopen_note": r.reopen_note,
        "prev": {"id": str(prev[0]), "date": prev[1].isoformat()} if prev else None,
        "next": {"id": str(nxt[0]), "date": nxt[1].isoformat()} if nxt else None,
        "segments": [
            {
                "id": str(s.id),
                "started_at": s.started_at.isoformat(),
                "ended_at": s.ended_at.isoformat(),
                "grade_id": str(s.grade_id) if s.grade_id else None,
                "gsm": s.gsm,
                "speed_mpm": _num(s.speed_mpm),
                "ideal_mt_min": _num(s.ideal_mt_min),
                "reason": s.reason,
                "grade_change_hours": _num(s.grade_change_hours),
                "grade_change_reject_mt": _num(s.grade_change_reject_mt),
                "hours": seg_calc.get(str(s.id), {}).get("hours"),
                "ideal_mt": seg_calc.get(str(s.id), {}).get("ideal_mt"),
            }
            for s in segs
        ],
        "reels": [
            {
                "id": str(x.id),
                "shift": x.shift,
                "reel_no": x.reel_no,
                "gsm": x.gsm,
                "gross_mt": _num(x.gross_mt),
                "net_mt": _num(x.net_mt),
                "reject_mt": _num(x.reject_mt),
                "b_grade_mt": _num(x.b_grade_mt),
                "s_grade_mt": _num(x.s_grade_mt),
                "trim_mt": round(float(x.gross_mt - x.net_mt - x.reject_mt), 3),
                "note": x.note,
            }
            for x in reels
        ],
        "stops": [
            {
                "id": str(e.id),
                "started_at": e.started_at.isoformat(),
                "ended_at": e.ended_at.isoformat() if e.ended_at else None,
                "hours": round(_hours(e.started_at, e.ended_at), 3) if e.ended_at else None,
                "event_type": e.event_type,
                "loss_category_id": str(e.loss_category_id) if e.loss_category_id else None,
                "section_id": str(e.section_id) if e.section_id else None,
                "asset_id": str(e.asset_id),
                "reason": e.reason,
                "is_failure": e.is_failure,
                "is_planned": e.is_planned,
                "production_loss_tons": _num(e.production_loss_tons),
                "parts": [{"discipline_id": str(p.discipline_id), "hours": _num(p.hours)} for p in parts.get(e.id, [])],
            }
            for e in events
        ],
        "losses": [
            {
                "id": str(x.id),
                "kind": x.kind.value,
                "shift": x.shift,
                "defect_id": str(x.defect_id) if x.defect_id else None,
                "defect_text": x.defect_text,
                "qty_mt": _num(x.qty_mt),
                "disposition": x.disposition,
            }
            for x in losses
        ],
        "outputs": [output_out(o) for o in outputs],
        "calc": calc,
        "shift_logs": oplog_svc.report_sections(db, ctx.plant, r.report_date, ctx.dept_ok, m.id),
        "utilities": oplog_svc.report_utilities(db, ctx.plant, r.report_date, calc["measures"]["net"] or 0.0, ctx.dept_ok, m.id),
    }


@router.patch("/reports/{rid}")
def patch_report(rid: uuid.UUID, body: ReportPatch, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    data = body.model_dump(exclude_unset=True)
    if "supervisors" in data:
        codes = {s["code"] for s in m.shifts or []}
        sup = {k: v.strip()[:120] for k, v in (data["supervisors"] or {}).items() if v and v.strip()}
        if set(sup) - codes:
            raise HTTPException(422, "Unknown shift")
        data["supervisors"] = sup
    for k, v in data.items():
        setattr(r, k, v)
    return {"ok": True}


# ---------------- run segments
class SegmentIn(In):
    started_at: datetime
    ended_at: datetime
    grade_id: uuid.UUID
    speed_mpm: float | None = Field(None, gt=0, le=3000)
    reason: str | None = Field(None, max_length=500)
    grade_change_hours: float | None = Field(None, ge=0, le=24)
    grade_change_reject_mt: float | None = Field(None, ge=0, le=1000)


def _paper_only(m: OpMachine) -> None:
    if m.report_profile != "paper_machine":
        raise HTTPException(422, "Runs and reels belong to the paper machine report profile; this line records output lines")


def _seg_values(db: Session, ctx: Ctx, m: OpMachine, body: SegmentIn) -> dict:
    _paper_only(m)
    tz = ZoneInfo(ctx.plant.timezone)
    data = body.model_dump()
    data["started_at"], data["ended_at"] = _aware(body.started_at, tz), _aware(body.ended_at, tz)
    if data["ended_at"] <= data["started_at"]:
        raise HTTPException(422, "The end must be after the start")
    if (data["ended_at"] - data["started_at"]).total_seconds() > 26 * 3600:
        raise HTTPException(422, "A run segment cannot be longer than the production day")
    g = db.get(OpGrade, body.grade_id)
    if g is None or g.machine_id != m.id:
        raise HTTPException(422, "Unknown grade for this machine")
    data["gsm"] = g.gsm
    data["ideal_mt_min"] = g.ideal_mt_min
    if data["speed_mpm"] is None:
        data["speed_mpm"] = g.target_speed_mpm
    return data


@router.post("/reports/{rid}/segments", status_code=201)
def add_segment(rid: uuid.UUID, body: SegmentIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    s = OpRunSegment(report_id=r.id, **_seg_values(db, ctx, m, body))
    db.add(s)
    db.flush()
    return {"id": str(s.id)}


@router.put("/segments/{sid}")
def update_segment(sid: uuid.UUID, body: SegmentIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    s = db.get(OpRunSegment, sid)
    if s is None:
        raise HTTPException(404, "Run not found")
    r, m = _edit(db, ctx, s.report_id)
    vals = _seg_values(db, ctx, m, body)
    if s.grade_id == body.grade_id:
        vals["ideal_mt_min"] = s.ideal_mt_min  # keep the rate copied when the run was written
    for k, v in vals.items():
        setattr(s, k, v)
    return {"id": str(s.id)}


@router.delete("/segments/{sid}", status_code=204)
def delete_segment(sid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> None:
    s = db.get(OpRunSegment, sid)
    if s is None:
        raise HTTPException(404, "Run not found")
    _edit(db, ctx, s.report_id)
    db.delete(s)


# ---------------- reels
class ReelIn(In):
    shift: str = Field(min_length=1, max_length=8)
    reel_no: str = Field(min_length=1, max_length=20)
    gsm: int | None = Field(None, ge=10, le=2000)
    gross_mt: float = Field(gt=0, le=1000)
    net_mt: float = Field(ge=0, le=1000)
    reject_mt: float = Field(0, ge=0, le=1000)
    b_grade_mt: float = Field(0, ge=0, le=1000)
    s_grade_mt: float = Field(0, ge=0, le=1000)
    note: str | None = Field(None, max_length=200)


def _reel_check(m: OpMachine, body: ReelIn) -> None:
    _paper_only(m)
    if body.shift not in {s["code"] for s in m.shifts or []}:
        raise HTTPException(422, "Unknown shift")
    if body.net_mt + body.reject_mt > body.gross_mt + paper.TOL_MT:
        raise HTTPException(422, "Net + reject cannot be more than the gross weight")
    if body.b_grade_mt + body.s_grade_mt > body.net_mt + paper.TOL_MT:
        raise HTTPException(422, "B + S grade cannot be more than the net weight")


@router.post("/reports/{rid}/reels", status_code=201)
def add_reel(rid: uuid.UUID, body: ReelIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    _reel_check(m, body)
    x = OpReel(report_id=r.id, **body.model_dump())
    db.add(x)
    _commit_unique(db, "A reel with this number")
    return {"id": str(x.id)}


@router.put("/reels/{xid}")
def update_reel(xid: uuid.UUID, body: ReelIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    x = db.get(OpReel, xid)
    if x is None:
        raise HTTPException(404, "Reel not found")
    r, m = _edit(db, ctx, x.report_id)
    _reel_check(m, body)
    for k, v in body.model_dump().items():
        setattr(x, k, v)
    _commit_unique(db, "A reel with this number")
    return {"id": str(x.id)}


@router.delete("/reels/{xid}", status_code=204)
def delete_reel(xid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> None:
    x = db.get(OpReel, xid)
    if x is None:
        raise HTTPException(404, "Reel not found")
    _edit(db, ctx, x.report_id)
    db.delete(x)


# ---------------- output lines (generic profile)
class OutputIn(In):
    shift: str | None = Field(None, max_length=8)
    product_id: uuid.UUID | None = None
    order_ref: str | None = Field(None, max_length=60)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    run_hours: float | None = Field(None, ge=0, le=24)
    planned_qty: float | None = Field(None, ge=0, le=1e9)
    input_qty: float | None = Field(None, ge=0, le=1e9)
    produced_qty: float = Field(ge=0, le=1e9)
    reject_qty: float = Field(0, ge=0, le=1e9)
    downgrade_qty: float = Field(0, ge=0, le=1e9)
    completed: bool = True
    note: str | None = Field(None, max_length=300)


def output_out(o: OpOutput) -> dict:
    rh = generic.output_hours(o)
    return {
        "id": str(o.id), "shift": o.shift, "product_id": str(o.product_id) if o.product_id else None, "order_ref": o.order_ref,
        "started_at": o.started_at.isoformat() if o.started_at else None, "ended_at": o.ended_at.isoformat() if o.ended_at else None,
        "run_hours": _num(o.run_hours), "hours": None if rh is None else round(rh, 3), "planned_qty": _num(o.planned_qty), "input_qty": _num(o.input_qty),
        "produced_qty": _num(o.produced_qty), "reject_qty": _num(o.reject_qty), "downgrade_qty": _num(o.downgrade_qty),
        "good_qty": round(float(o.produced_qty - o.reject_qty - o.downgrade_qty), 3), "ideal_rate_per_h": _num(o.ideal_rate_per_h),
        "ideal_qty": round(rh * float(o.ideal_rate_per_h), 3) if rh is not None and o.ideal_rate_per_h is not None else None,
        "completed": o.completed, "note": o.note,
    }  # fmt: skip


def _output_values(db: Session, ctx: Ctx, m: OpMachine, body: OutputIn, current: OpOutput | None = None) -> dict:
    if m.report_profile == "paper_machine":
        raise HTTPException(422, "A paper machine records runs and reels")
    tz = ZoneInfo(ctx.plant.timezone)
    data = body.model_dump()
    data["started_at"] = _aware(body.started_at, tz) if body.started_at else None
    data["ended_at"] = _aware(body.ended_at, tz) if body.ended_at else None
    if data["started_at"] and data["ended_at"] and data["ended_at"] <= data["started_at"]:
        raise HTTPException(422, "The end must be after the start")
    if body.shift and body.shift not in {s["code"] for s in m.shifts or []}:
        raise HTTPException(422, "Unknown shift")
    if body.reject_qty + body.downgrade_qty > body.produced_qty + generic.TOL_Q:
        raise HTTPException(422, "Reject and downgrade cannot be more than the quantity produced")
    rate = None
    if body.product_id:
        p = db.get(OpProduct, body.product_id)
        if p is None or p.plant_id != ctx.plant_id or (p.machine_id and p.machine_id != m.id):
            raise HTTPException(422, "Unknown product for this line")
        rate = _num(p.ideal_rate_per_h) or (3600 / float(p.ideal_cycle_s) if p.ideal_cycle_s else None)
    if current is not None and current.product_id == body.product_id and current.ideal_rate_per_h is not None:
        rate = _num(current.ideal_rate_per_h)  # the rate copied when the line was entered stays
    data["ideal_rate_per_h"] = rate
    return data


@router.post("/reports/{rid}/outputs", status_code=201)
def add_output(rid: uuid.UUID, body: OutputIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    o = OpOutput(report_id=r.id, **_output_values(db, ctx, m, body))
    db.add(o)
    db.flush()
    return output_out(o)


@router.put("/outputs/{oid}")
def update_output(oid: uuid.UUID, body: OutputIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    o = db.get(OpOutput, oid)
    if o is None:
        raise HTTPException(404, "Line not found")
    _, m = _edit(db, ctx, o.report_id)
    for k, v in _output_values(db, ctx, m, body, o).items():
        setattr(o, k, v)
    db.flush()
    return output_out(o)


@router.delete("/outputs/{oid}", status_code=204)
def delete_output(oid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> None:
    o = db.get(OpOutput, oid)
    if o is None:
        raise HTTPException(404, "Line not found")
    _edit(db, ctx, o.report_id)
    db.delete(o)


# ---------------- stops and sheet breaks
class PartIn(BaseModel):
    discipline_id: uuid.UUID
    hours: float | None = Field(None, gt=0, le=48)


class StopIn(In):
    started_at: datetime
    ended_at: datetime | None = None
    # the loss category decides how the stop is recorded; event_type is kept for profiles that record it directly
    event_type: Literal["breakdown", "sheet_break", "planned", "other"] | None = None
    loss_category_id: uuid.UUID | None = None
    section_id: uuid.UUID | None = None
    reason: str | None = Field(None, max_length=2000)
    production_loss_tons: float | None = Field(None, ge=0, le=10000)
    parts: list[PartIn] = Field(default_factory=list, max_length=6)


def _stop_values(db: Session, ctx: Ctx, m: OpMachine, body: StopIn) -> tuple[dict, list[tuple[OpDiscipline, float]]]:
    tz = ZoneInfo(ctx.plant.timezone)
    start = _aware(body.started_at, tz)
    end = _aware(body.ended_at, tz) if body.ended_at else None
    if end is not None and end <= start:
        raise HTTPException(422, "The end must be after the start")
    if end is not None and (end - start).total_seconds() > 31 * 86400:
        raise HTTPException(422, "A stop cannot be longer than a month")
    asset_id = m.asset_id
    if body.section_id:
        sec = db.get(OpSection, body.section_id)
        if sec is None or sec.machine_id != m.id:
            raise HTTPException(422, "Unknown section for this machine")
        asset_id = sec.asset_id or m.asset_id
    cat = None
    if body.loss_category_id:
        cat = db.get(OpLossCategory, body.loss_category_id)
        if cat is None or cat.plant_id != ctx.plant_id or not cat.is_active:
            raise HTTPException(422, "Unknown loss category")
    event_type = body.event_type or (cat.event_type if cat else "other")
    if cat is None and body.event_type:
        cat = default_category(db, ctx.plant_id, body.event_type)
    if cat is None and m.report_profile != "paper_machine":
        raise HTTPException(422, "Choose the loss category of the stop")
    dur = _hours(start, end) if end else None
    parts: list[tuple[OpDiscipline, float]] = []
    if len({p.discipline_id for p in body.parts}) != len(body.parts):
        raise HTTPException(422, "A discipline is listed twice")
    for p in body.parts:
        d = db.get(OpDiscipline, p.discipline_id)
        if d is None or d.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown discipline")
        h = p.hours
        if h is None:
            if len(body.parts) > 1 or dur is None:
                raise HTTPException(422, "Give the hours of each discipline")
            h = dur
        parts.append((d, h))
    if dur is not None and parts and abs(sum(h for _, h in parts) - dur) > svc.TOL_H:
        raise HTTPException(422, f"The disciplines' hours ({sum(h for _, h in parts):.2f}) must add up to the stop ({dur:.2f} h)")
    if (event_type in ("breakdown", "sheet_break") or (cat and cat.failure)) and not parts:
        if cat and cat.discipline_id and dur is not None:  # the category names who is responsible
            d = db.get(OpDiscipline, cat.discipline_id)
            if d is not None:
                parts.append((d, dur))
        if not parts:
            raise HTTPException(422, "Choose who is responsible (discipline)")
    failure, planned = svc.classify(event_type, [d for d, _ in parts], cat)
    vals = {
        "asset_id": asset_id,
        "started_at": start,
        "ended_at": end,
        "event_type": event_type,
        "loss_category_id": cat.id if cat else None,
        "section_id": body.section_id,
        "reason": body.reason,
        "production_loss_tons": body.production_loss_tons,
        "is_failure": failure,
        "is_planned": planned,
    }
    return vals, parts


def _set_parts(db: Session, eid: uuid.UUID, parts: list[tuple[OpDiscipline, float]]) -> None:
    db.execute(delete(OpStopPart).where(OpStopPart.downtime_event_id == eid))
    for d, h in parts:
        db.add(OpStopPart(downtime_event_id=eid, discipline_id=d.id, hours=Decimal(str(round(h, 3)))))


@router.post("/reports/{rid}/stops", status_code=201)
def add_stop(rid: uuid.UUID, body: StopIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    vals, parts = _stop_values(db, ctx, m, body)
    e = DowntimeEvent(plant_id=ctx.plant_id, source="operations", op_report_id=r.id, created_by_id=ctx.user.id, **vals)
    db.add(e)
    db.flush()
    _set_parts(db, e.id, parts)
    return {"id": str(e.id), "asset_id": str(e.asset_id), "is_failure": e.is_failure}


def _stop(db: Session, ctx: Ctx, eid: uuid.UUID) -> tuple[DowntimeEvent, OpDailyReport, OpMachine]:
    e = db.get(DowntimeEvent, eid)
    if e is None or e.plant_id != ctx.plant_id or e.op_report_id is None:
        raise HTTPException(404, "Stop not found")
    r, m = _edit(db, ctx, e.op_report_id)
    return e, r, m


@router.put("/stops/{eid}")
def update_stop(eid: uuid.UUID, body: StopIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    e, r, m = _stop(db, ctx, eid)
    vals, parts = _stop_values(db, ctx, m, body)
    for k, v in vals.items():
        setattr(e, k, v)
    _set_parts(db, e.id, parts)
    return {"id": str(e.id), "is_failure": e.is_failure}


@router.delete("/stops/{eid}", status_code=204)
def delete_stop(eid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> None:
    e, _, _ = _stop(db, ctx, eid)
    if e.work_order_id is not None:
        raise DomainError("A work order is linked to this stop; it cannot be deleted", "linked", 409)
    db.delete(e)


# ---------------- quality losses
class LossIn(In):
    kind: Literal["reject", "downgrade"]
    shift: str | None = Field(None, max_length=8)
    defect_id: uuid.UUID | None = None
    defect_text: str | None = Field(None, max_length=200)
    qty_mt: float = Field(gt=0, le=1000)
    disposition: str | None = Field(None, max_length=10)


def _loss_values(db: Session, ctx: Ctx, m: OpMachine, body: LossIn) -> dict:
    data = body.model_dump()
    data["kind"] = OpLossKind(body.kind)
    if body.shift and body.shift not in {s["code"] for s in m.shifts or []}:
        raise HTTPException(422, "Unknown shift")
    if body.defect_id:
        d = db.get(OpDefect, body.defect_id)
        if d is None or d.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown defect")
        data["disposition"] = data["disposition"] or d.disposition
    elif not body.defect_text:
        raise HTTPException(422, "Choose a defect or describe it")
    return data


@router.post("/reports/{rid}/losses", status_code=201)
def add_loss(rid: uuid.UUID, body: LossIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    r, m = _edit(db, ctx, rid)
    x = OpQualityLoss(report_id=r.id, **_loss_values(db, ctx, m, body))
    db.add(x)
    db.flush()
    return {"id": str(x.id)}


@router.put("/losses/{xid}")
def update_loss(xid: uuid.UUID, body: LossIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    x = db.get(OpQualityLoss, xid)
    if x is None:
        raise HTTPException(404, "Line not found")
    r, m = _edit(db, ctx, x.report_id)
    for k, v in _loss_values(db, ctx, m, body).items():
        setattr(x, k, v)
    return {"id": str(x.id)}


@router.delete("/losses/{xid}", status_code=204)
def delete_loss(xid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> None:
    x = db.get(OpQualityLoss, xid)
    if x is None:
        raise HTTPException(404, "Line not found")
    _edit(db, ctx, x.report_id)
    db.delete(x)


# ---------------- workflow
class NoteIn(In):
    note: str = Field(min_length=3, max_length=1000)


def _day_over(db: Session, ctx: Ctx, r: OpDailyReport) -> None:
    m = db.get(OpMachine, r.machine_id)
    assert m is not None
    if svc.planned_hours(m, ctx.plant, r.report_date) < svc.DAY_HOURS:
        raise DomainError("The production day is not over yet", "day_in_progress", 422)


def _need_content(db: Session, r: OpDailyReport) -> None:
    m = db.get(OpMachine, r.machine_id)
    assert m is not None
    if not svc.has_content(db, r, m):
        raise DomainError("Enter the line's production (or the stops of a day without production) first", "empty", 422)


@router.post("/reports/{rid}/submit")
def submit(rid: uuid.UUID, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    r, m = _report(db, ctx, rid, lock=True)
    if r.status != OpReportStatus.DRAFT:
        raise DomainError("Only a draft report can be submitted", "not_draft", 409)
    _day_over(db, ctx, r)
    _need_content(db, r)
    r.status = OpReportStatus.SUBMITTED
    r.submitted_by_id, r.submitted_at = ctx.user.id, utcnow()
    audit(db, "op.report.submit", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_report", entity_id=r.id,
          data={"machine": m.code, "date": r.report_date.isoformat()})  # fmt: skip
    return {"status": r.status.value}


@router.post("/reports/{rid}/confirm")
def confirm(rid: uuid.UUID, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> dict:
    r, m = _report(db, ctx, rid, lock=True)
    if r.status == OpReportStatus.CONFIRMED:
        raise DomainError("The report is already confirmed", "confirmed", 409)
    _day_over(db, ctx, r)
    _need_content(db, r)
    open_stops = db.execute(
        select(func.count()).select_from(DowntimeEvent).where(DowntimeEvent.op_report_id == r.id, DowntimeEvent.ended_at.is_(None))
    ).scalar_one()
    if open_stops:
        raise DomainError("A stop has no end time yet", "open_stop", 422)
    r.status = OpReportStatus.CONFIRMED
    r.confirmed_by_id, r.confirmed_at = ctx.user.id, utcnow()
    if r.submitted_at is None:
        r.submitted_by_id, r.submitted_at = ctx.user.id, r.confirmed_at
    calc = svc.compute(db, r, ctx.plant)
    svc.write_production_record(db, r, ctx.plant, calc)
    audit(
        db, "op.report.confirm", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_report", entity_id=r.id,
        data={"machine": m.code, "date": r.report_date.isoformat(), "revision": r.revision, "produced": calc["measures"]["produced"],
              "oee": calc["oee"]["oee"]},
    )  # fmt: skip
    return {"status": r.status.value}


@router.post("/reports/{rid}/reopen")
def reopen(rid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> dict:
    r, m = _report(db, ctx, rid, lock=True)
    if r.status == OpReportStatus.DRAFT:
        raise DomainError("The report is already open", "draft", 409)
    was = r.status.value
    if r.status == OpReportStatus.CONFIRMED:
        r.revision += 1
    r.status = OpReportStatus.DRAFT
    r.confirmed_by_id = r.confirmed_at = None
    r.submitted_by_id = r.submitted_at = None
    r.reopen_note = body.note
    audit(db, "op.report.reopen", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_report", entity_id=r.id,
          data={"machine": m.code, "date": r.report_date.isoformat(), "from": was, "revision": r.revision, "note": body.note})  # fmt: skip
    return {"status": r.status.value, "revision": r.revision}


@router.delete("/reports/{rid}", status_code=204)
def delete_report(rid: uuid.UUID, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> None:
    r, _ = _report(db, ctx, rid, lock=True)
    if r.status != OpReportStatus.DRAFT:
        raise DomainError("Only a draft report can be deleted", "not_draft", 409)
    linked = db.execute(
        select(func.count()).select_from(DowntimeEvent).where(DowntimeEvent.op_report_id == r.id, DowntimeEvent.work_order_id.is_not(None))
    ).scalar_one()
    if linked:
        raise DomainError("A stop of this report is linked to a work order", "linked", 409)
    db.delete(r)


# ---------------- grade at a moment (helps the form start a new day where the last one ended)
@router.get("/machines/{mid}/last-run")
def last_run(mid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    m = _machine(db, ctx, mid)
    s = db.execute(
        select(OpRunSegment)
        .join(OpDailyReport, OpDailyReport.id == OpRunSegment.report_id)
        .where(OpDailyReport.machine_id == m.id)
        .order_by(OpRunSegment.ended_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if s is None:
        return {"grade_id": None}
    return {
        "grade_id": str(s.grade_id) if s.grade_id else None,
        "speed_mpm": _num(s.speed_mpm),
        "ended_at": s.ended_at.astimezone(UTC).isoformat(),
    }
