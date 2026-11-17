"""Operations daily logs (utilities daily generation and electricity, stock preparation shift report …) and the
production dashboard. Part of the Operations module: present only when CMMS_OPERATIONS_MODULE is on."""

import uuid
from datetime import date, time, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.assets import Asset, Meter
from app.models.enums import OPEN_WO_STATUSES, OpReportStatus, RequestStatus
from app.models.identity import User
from app.models.operations import OpDailyReport, OpDiscipline, OpLog, OpLogField, OpLogTemplate, OpLogValue, OpMachine
from app.models.tenancy import Department
from app.models.workorders import WorkOrder, WorkRequest
from app.schemas.common import In
from app.services import operations as ops
from app.services import oplogs as svc
from app.services.common import audit, plant_today, utcnow
from app.services.pm import record_meter_reading

router = APIRouter(prefix="/operations", tags=["operations"])
DB = Depends(get_db, scope="function")
CODE = r"^[A-Za-z][A-Za-z0-9_]*$"


def _num(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


def _flush(db: Session, what: str) -> None:
    try:
        db.flush()
    except IntegrityError as e:
        raise HTTPException(409, f"{what} already exists") from e


# ================================================================ templates and fields
class ShiftIn(BaseModel):
    code: str = Field(min_length=1, max_length=8, pattern=r"^[A-Za-z0-9]+$")
    name: str = Field(min_length=1, max_length=40)
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class TemplateIn(In):
    code: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._/-]*$")
    name: str = Field(min_length=1, max_length=120)
    department_id: uuid.UUID
    frequency: Literal["day", "shift"] = "day"
    day_start: time = time(7, 0)
    shifts: list[ShiftIn] = Field(default_factory=list, max_length=4)
    issues: bool = False
    in_pm_report: bool = False
    sort: int = Field(0, ge=0, le=999)
    is_active: bool = True

    @field_validator("shifts")
    @classmethod
    def _distinct(cls, v: list[ShiftIn]) -> list[ShiftIn]:
        if len({s.code for s in v}) != len(v):
            raise ValueError("shift codes must be different")
        return v


class FieldIn(In):
    section: str = Field(min_length=1, max_length=80)
    code: str = Field(min_length=1, max_length=40, pattern=CODE)
    label: str = Field(min_length=1, max_length=160)
    kind: Literal["meter", "counter", "number", "check", "text", "calc"]
    unit: str | None = Field(None, max_length=20)
    decimals: int = Field(1, ge=0, le=4)
    formula: str | None = Field(None, max_length=400)
    low: float | None = None
    high: float | None = None
    meter_id: uuid.UUID | None = None
    chart: bool = False
    per_ton: bool = False
    day_agg: Literal["sum", "avg"] | None = None
    sort: int = Field(0, ge=0, le=9999)
    is_active: bool = True


def template_out(t: OpLogTemplate, fields: list[OpLogField] | None = None) -> dict:
    out = {
        "id": str(t.id), "code": t.code, "name": t.name, "department_id": str(t.department_id), "frequency": t.frequency,
        "day_start": t.day_start.strftime("%H:%M"), "shifts": t.shifts, "issues": t.issues, "in_pm_report": t.in_pm_report, "sort": t.sort, "is_active": t.is_active,
    }  # fmt: skip
    if fields is not None:
        out["fields"] = [field_out(x) for x in fields]
    return out


def field_out(x: OpLogField) -> dict:
    return {
        "id": str(x.id), "section": x.section, "code": x.code, "label": x.label, "kind": x.kind, "unit": x.unit, "decimals": x.decimals,
        "formula": x.formula, "low": _num(x.low), "high": _num(x.high), "meter_id": str(x.meter_id) if x.meter_id else None,
        "chart": x.chart, "per_ton": x.per_ton, "day_agg": x.day_agg, "sort": x.sort, "is_active": x.is_active,
    }  # fmt: skip


def _template(db: Session, ctx: Ctx, tid: uuid.UUID) -> OpLogTemplate:
    t = db.get(OpLogTemplate, tid)
    if t is None or t.plant_id != ctx.plant_id or not ctx.dept_ok(t.department_id):
        raise HTTPException(404, "Log form not found")
    return t


def _check_template(db: Session, ctx: Ctx, body: TemplateIn) -> None:
    d = db.get(Department, body.department_id)
    if d is None or d.plant_id != ctx.plant_id:
        raise HTTPException(422, "Unknown department")
    if body.frequency == "shift" and not body.shifts:
        raise HTTPException(422, "A per-shift log needs its shifts")


@router.get("/log-templates")
def list_templates(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    rows = db.execute(
        select(OpLogTemplate).where(OpLogTemplate.plant_id == ctx.plant_id).order_by(OpLogTemplate.sort, OpLogTemplate.code)
    ).scalars()
    return [template_out(t, svc.fields_of(db, t.id)) for t in rows if ctx.dept_ok(t.department_id)]


@router.post("/log-templates", status_code=201)
def create_template(body: TemplateIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    _check_template(db, ctx, body)
    t = OpLogTemplate(plant_id=ctx.plant_id, **{**body.model_dump(), "shifts": [s.model_dump() for s in body.shifts]})
    db.add(t)
    _flush(db, "A log form with this code")
    return template_out(t, [])


@router.put("/log-templates/{tid}")
def update_template(tid: uuid.UUID, body: TemplateIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    t = _template(db, ctx, tid)
    _check_template(db, ctx, body)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    t.shifts = [s.model_dump() for s in body.shifts]
    _flush(db, "A log form with this code")
    return template_out(t)


def _check_field(db: Session, ctx: Ctx, t: OpLogTemplate, body: FieldIn, own: uuid.UUID | None) -> None:
    if body.kind == "calc":
        if not body.formula:
            raise HTTPException(422, "A calculated line needs a formula")
        codes = {x.code for x in svc.fields_of(db, t.id) if x.id != own}
        try:
            svc.check_formula(body.formula, codes)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    if body.meter_id:
        if body.kind != "counter":
            raise HTTPException(422, "Only a counter line can update an equipment meter")
        m = db.get(Meter, body.meter_id)
        if m is None or m.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown meter")
    if body.low is not None and body.high is not None and body.low > body.high:
        raise HTTPException(422, "Low limit is above the high limit")


@router.post("/log-templates/{tid}/fields", status_code=201)
def create_field(tid: uuid.UUID, body: FieldIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    t = _template(db, ctx, tid)
    _check_field(db, ctx, t, body, None)
    x = OpLogField(template_id=t.id, **body.model_dump())
    db.add(x)
    _flush(db, "A line with this code")
    return field_out(x)


@router.put("/log-fields/{fid}")
def update_field(fid: uuid.UUID, body: FieldIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    x = db.get(OpLogField, fid)
    if x is None:
        raise HTTPException(404, "Line not found")
    t = _template(db, ctx, x.template_id)
    _check_field(db, ctx, t, body, x.id)
    for k, v in body.model_dump().items():
        setattr(x, k, v)
    _flush(db, "A line with this code")
    return field_out(x)


@router.get("/meters")
def meters(ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> list[dict]:
    """Equipment meters a counter line can update (running hours → meter-based PM)."""
    rows = db.execute(
        select(Meter, Asset.code, Asset.name)
        .join(Asset, Asset.id == Meter.asset_id)
        .where(Meter.plant_id == ctx.plant_id)
        .order_by(Asset.code)
    ).all()
    return [{"id": str(m.id), "label": f"{code} – {name}: {m.name} ({m.unit})"} for m, code, name in rows]


# ================================================================ logs
def _log(db: Session, ctx: Ctx, lid: uuid.UUID, lock: bool = False) -> tuple[OpLog, OpLogTemplate]:
    q = select(OpLog).where(OpLog.id == lid, OpLog.plant_id == ctx.plant_id)
    if lock:
        q = q.with_for_update()
    lg = db.execute(q).scalar_one_or_none()
    if lg is None:
        raise HTTPException(404, "Log not found")
    return lg, _template(db, ctx, lg.template_id)


def _editable(ctx: Ctx, lg: OpLog) -> None:
    if lg.status == OpReportStatus.CONFIRMED:
        raise DomainError("The log is confirmed and locked. Reopen it to change it.", "locked", 409)
    if lg.status == OpReportStatus.SUBMITTED and not ctx.has("op.confirm"):
        raise DomainError("The log was submitted: only the manager can change it now.", "submitted", 409)
    if lg.status == OpReportStatus.DRAFT and not (ctx.has("op.enter") or ctx.has("op.confirm")):
        raise HTTPException(403, "Missing permission: op.enter")


def _over(ctx: Ctx, t: OpLogTemplate, lg: OpLog) -> bool:
    _, end = svc.window_of(t, ctx.plant, lg.log_date, lg.shift)
    return utcnow() >= end


class LogCreate(In):
    template_id: uuid.UUID
    log_date: date
    shift: str = Field("-", max_length=8)


@router.get("/logs")
def list_logs(
    template_id: uuid.UUID,
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: Ctx = Depends(require("op.view")),
    db: Session = DB,
) -> dict:
    t = _template(db, ctx, template_id)
    today = plant_today(ctx.plant)
    y, mo = (int(x) for x in month.split("-")) if month else (today.year, today.month)
    d0, d1 = date(y, mo, 1), date(y + (mo == 12), mo % 12 + 1, 1)
    logs = list(
        db.execute(
            select(OpLog)
            .where(OpLog.template_id == t.id, OpLog.log_date >= d0, OpLog.log_date < d1)
            .order_by(OpLog.log_date.desc(), OpLog.shift.desc())
        ).scalars()
    )
    fields = svc.fields_of(db, t.id)
    heads = [x for x in fields if x.chart and x.is_active and x.kind != "text"][:6]
    vals = svc.values_of(db, [x.id for x in logs])
    items = []
    for lg in logs:
        calc, warns = svc.compute(fields, vals[lg.id])
        items.append({
            "id": str(lg.id), "log_date": lg.log_date.isoformat(), "shift": lg.shift, "status": lg.status.value, "revision": lg.revision,
            "values": {str(x.id): calc[str(x.id)]["value"] for x in heads}, "warnings": len(warns),
            "in_progress": not _over(ctx, t, lg),
        })  # fmt: skip
    return {"items": items, "month": f"{y:04d}-{mo:02d}", "columns": [field_out(x) for x in heads], "template": template_out(t)}


@router.post("/logs", status_code=201)
def create_log(body: LogCreate, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    t = _template(db, ctx, body.template_id)
    if not t.is_active:
        raise HTTPException(422, "The log form is not active")
    shift = body.shift if t.frequency == "shift" else "-"
    if t.frequency == "shift" and shift not in {s["code"] for s in t.shifts}:
        raise HTTPException(422, "Choose the shift")
    if body.log_date > plant_today(ctx.plant):
        raise HTTPException(422, "A log cannot be made for a future day")
    old = db.execute(
        select(OpLog).where(OpLog.template_id == t.id, OpLog.log_date == body.log_date, OpLog.shift == shift)
    ).scalar_one_or_none()
    if old is not None:
        return {"id": str(old.id), "existing": True}
    lg = OpLog(plant_id=ctx.plant_id, template_id=t.id, log_date=body.log_date, shift=shift, created_by_id=ctx.user.id)
    db.add(lg)
    db.flush()
    # meters and counters start where the previous log ended
    for fid, closing in svc.last_closings(db, t.id, lg).items():
        db.add(OpLogValue(log_id=lg.id, field_id=fid, opening=closing))
    db.flush()
    return {"id": str(lg.id), "existing": False}


def _issues(db: Session, t: OpLogTemplate) -> dict:
    """Open work requests and work orders of the log's department (shown on the log; nothing is typed twice)."""
    reqs = db.execute(
        select(WorkRequest, Asset.code)
        .join(Asset, Asset.id == WorkRequest.asset_id)
        .where(WorkRequest.plant_id == t.plant_id, Asset.department_id == t.department_id, WorkRequest.status == RequestStatus.SUBMITTED)
        .order_by(WorkRequest.created_at.desc())
        .limit(50)
    ).all()
    wos = db.execute(
        select(WorkOrder, Asset.code)
        .join(Asset, Asset.id == WorkOrder.asset_id)
        .where(WorkOrder.plant_id == t.plant_id, WorkOrder.department_id == t.department_id, WorkOrder.status.in_(OPEN_WO_STATUSES))
        .order_by(WorkOrder.created_at.desc())
        .limit(50)
    ).all()
    return {
        "requests": [{"id": str(r.id), "number": r.number, "title": r.title, "asset": code, "breakdown": r.is_breakdown,
                      "created_at": r.created_at.isoformat()} for r, code in reqs],
        "work_orders": [{"id": str(w.id), "number": w.number, "title": w.title, "asset": code, "status": w.status.value,
                         "priority": w.priority.value, "created_at": w.created_at.isoformat()} for w, code in wos],
    }  # fmt: skip


def _pm_report_id(db: Session, ctx: Ctx, d: date) -> str | None:
    """The paper machine report of the same day (a stock preparation shift log goes back to it)."""
    rid = db.execute(
        select(OpDailyReport.id)
        .where(OpDailyReport.plant_id == ctx.plant_id, OpDailyReport.report_date == d)
        .order_by(OpDailyReport.created_at)
        .limit(1)
    ).scalar_one_or_none()
    return str(rid) if rid else None


@router.get("/logs/{lid}")
def get_log(lid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    lg, t = _log(db, ctx, lid)
    fields = svc.fields_of(db, t.id)
    vals = svc.values_of(db, [lg.id])[lg.id]
    calc, warns = svc.compute(fields, vals)
    names: dict = dict(
        db.execute(
            select(User.id, User.full_name).where(User.id.in_([x for x in (lg.created_by_id, lg.submitted_by_id, lg.confirmed_by_id) if x]))
        ).all()
    )
    sibling = select(OpLog.id, OpLog.log_date, OpLog.shift).where(OpLog.template_id == t.id)
    prev = db.execute(
        sibling.where((OpLog.log_date < lg.log_date) | ((OpLog.log_date == lg.log_date) & (OpLog.shift < lg.shift)))
        .order_by(OpLog.log_date.desc(), OpLog.shift.desc()).limit(1)
    ).first()  # fmt: skip
    nxt = db.execute(
        sibling.where((OpLog.log_date > lg.log_date) | ((OpLog.log_date == lg.log_date) & (OpLog.shift > lg.shift)))
        .order_by(OpLog.log_date, OpLog.shift).limit(1)
    ).first()  # fmt: skip
    can_edit = True
    try:
        _editable(ctx, lg)
    except (DomainError, HTTPException):
        can_edit = False
    start, end = svc.window_of(t, ctx.plant, lg.log_date, lg.shift)
    return {
        "id": str(lg.id), "template": template_out(t), "log_date": lg.log_date.isoformat(), "shift": lg.shift, "status": lg.status.value,
        "revision": lg.revision, "notes": lg.notes, "can_edit": can_edit, "in_progress": utcnow() < end,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "created_by": names.get(lg.created_by_id), "submitted_by": names.get(lg.submitted_by_id), "confirmed_by": names.get(lg.confirmed_by_id),
        "submitted_at": lg.submitted_at.isoformat() if lg.submitted_at else None, "confirmed_at": lg.confirmed_at.isoformat() if lg.confirmed_at else None,
        "reopen_note": lg.reopen_note,
        "prev": {"id": str(prev[0]), "date": prev[1].isoformat(), "shift": prev[2]} if prev else None,
        "next": {"id": str(nxt[0]), "date": nxt[1].isoformat(), "shift": nxt[2]} if nxt else None,
        "fields": [field_out(x) for x in fields if x.is_active or str(x.id) in {str(k) for k in vals}],
        "values": calc, "warnings": warns, "issues": _issues(db, t) if t.issues else None,
        "pm_report_id": _pm_report_id(db, ctx, lg.log_date) if t.in_pm_report else None,
    }  # fmt: skip


class ValueIn(BaseModel):
    field_id: uuid.UUID
    opening: float | None = None
    closing: float | None = None
    value: float | None = None
    text: str | None = Field(None, max_length=2000)


class ValuesIn(In):
    values: list[ValueIn] = Field(max_length=500)
    notes: str | None = Field(None, max_length=4000)


@router.put("/logs/{lid}/values")
def save_values(lid: uuid.UUID, body: ValuesIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    lg, t = _log(db, ctx, lid, lock=True)
    _editable(ctx, lg)
    fields = {x.id: x for x in svc.fields_of(db, t.id)}
    have = svc.values_of(db, [lg.id])[lg.id]
    for v in body.values:
        fl = fields.get(v.field_id)
        if fl is None:
            raise HTTPException(422, "Unknown line")
        if fl.kind == "calc":
            continue
        row = have.get(fl.id)
        if row is None:
            row = OpLogValue(log_id=lg.id, field_id=fl.id)
            db.add(row)
            have[fl.id] = row
        if fl.kind in svc.READING_KINDS:
            row.opening = Decimal(str(v.opening)) if v.opening is not None else None
            row.closing = Decimal(str(v.closing)) if v.closing is not None else None
        elif fl.kind == "text":
            row.text = (v.text or "").strip() or None
        elif fl.kind == "check":
            row.value = Decimal(1 if v.value else 0) if v.value is not None else None
        else:
            row.value = Decimal(str(v.value)) if v.value is not None else None
    lg.notes = (body.notes or "").strip() or None
    db.flush()
    calc, warns = svc.compute(list(fields.values()), have)
    return {"values": calc, "warnings": warns}


class NoteIn(In):
    note: str = Field(min_length=3, max_length=1000)


@router.post("/logs/{lid}/submit")
def submit_log(lid: uuid.UUID, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    lg, t = _log(db, ctx, lid, lock=True)
    if lg.status != OpReportStatus.DRAFT:
        raise DomainError("Only a draft log can be submitted", "not_draft", 409)
    if not _over(ctx, t, lg):
        raise DomainError("The day / shift is not over yet", "in_progress", 422)
    lg.status, lg.submitted_by_id, lg.submitted_at = OpReportStatus.SUBMITTED, ctx.user.id, utcnow()
    return {"status": lg.status.value}


@router.post("/logs/{lid}/confirm")
def confirm_log(lid: uuid.UUID, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> dict:
    lg, t = _log(db, ctx, lid, lock=True)
    if lg.status == OpReportStatus.CONFIRMED:
        raise DomainError("The log is already confirmed", "confirmed", 409)
    if not _over(ctx, t, lg):
        raise DomainError("The day / shift is not over yet", "in_progress", 422)
    _, end = svc.window_of(t, ctx.plant, lg.log_date, lg.shift)
    vals = svc.values_of(db, [lg.id])[lg.id]
    updated = []
    for fl in svc.fields_of(db, t.id):
        v = vals.get(fl.id)
        if fl.kind == "counter" and fl.meter_id and v is not None and v.closing is not None:
            m = db.get(Meter, fl.meter_id)
            if m is not None and Decimal(str(v.closing)) > Decimal(str(m.current_value or 0)):
                record_meter_reading(db, ctx.plant, m, float(v.closing), end, ctx.user.id, source="operations")
                updated.append(fl.label)
    lg.status, lg.confirmed_by_id, lg.confirmed_at = OpReportStatus.CONFIRMED, ctx.user.id, utcnow()
    if lg.submitted_at is None:
        lg.submitted_by_id, lg.submitted_at = ctx.user.id, lg.confirmed_at
    audit(db, "op.log.confirm", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_log", entity_id=lg.id,
          data={"form": t.code, "date": lg.log_date.isoformat(), "shift": lg.shift, "meters": updated})  # fmt: skip
    return {"status": lg.status.value, "meters_updated": updated}


@router.post("/logs/{lid}/reopen")
def reopen_log(lid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> dict:
    lg, t = _log(db, ctx, lid, lock=True)
    if lg.status == OpReportStatus.DRAFT:
        raise DomainError("The log is already open", "draft", 409)
    if lg.status == OpReportStatus.CONFIRMED:
        lg.revision += 1
    lg.status = OpReportStatus.DRAFT
    lg.submitted_by_id = lg.submitted_at = lg.confirmed_by_id = lg.confirmed_at = None
    lg.reopen_note = body.note
    audit(db, "op.log.reopen", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_log", entity_id=lg.id,
          data={"form": t.code, "date": lg.log_date.isoformat(), "shift": lg.shift, "note": body.note})  # fmt: skip
    return {"status": lg.status.value, "revision": lg.revision}


@router.delete("/logs/{lid}", status_code=204)
def delete_log(lid: uuid.UUID, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> None:
    lg, _ = _log(db, ctx, lid, lock=True)
    if lg.status != OpReportStatus.DRAFT:
        raise DomainError("Only a draft log can be deleted", "not_draft", 409)
    db.delete(lg)


# ================================================================ dashboard
@router.get("/dashboard")
def dashboard(
    days: int = Query(30, ge=7, le=366),
    machine_id: uuid.UUID | None = None,
    ctx: Ctx = Depends(require("op.view")),
    db: Session = DB,
) -> dict:
    """Production, losses and utilities of the last `days` production days, ending with the day in progress."""
    machines = [
        m
        for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id).order_by(OpMachine.code)).scalars()
        if ctx.dept_ok(m.department_id)
    ]
    m = next((x for x in machines if x.id == machine_id), machines[0] if machines else None)
    today = plant_today(ctx.plant)
    d1 = today
    d0 = d1 - timedelta(days=days - 1)
    prod: list[dict] = []
    net_by_day: dict[str, float] = {}
    period = None
    disc_names = {d.id: d.code for d in db.execute(select(OpDiscipline).where(OpDiscipline.plant_id == ctx.plant_id)).scalars()}
    if m is not None:
        reports = list(
            db.execute(select(OpDailyReport).where(OpDailyReport.machine_id == m.id, OpDailyReport.report_date >= d0, OpDailyReport.report_date <= d1)
                       .order_by(OpDailyReport.report_date)).scalars()
        )  # fmt: skip
        for r in reports:
            c = ops.compute(db, r, ctx.plant)
            net_by_day[r.report_date.isoformat()] = c["day"]["net"]
            prod.append({
                "date": r.report_date.isoformat(), "status": r.status.value, "in_progress": c["in_progress"], "gross": c["day"]["gross"],
                "net": c["day"]["net"], "a": c["day"]["a"], "reject": c["day"]["reject"], "b": c["day"]["b"] + c["day"]["s"],
                "trim": c["day"]["trim"], "run_hours": c["run_hours"], "oee": c["oee"]["oee"], "availability": c["oee"]["availability"],
                "performance": c["oee"]["performance"], "quality": c["oee"]["quality"], "breaks": c["stops"]["breaks_count"],
                "breaks_hours": c["stops"]["breaks_hours"], "downtime_hours": c["stops"]["downtime_hours"],
            })  # fmt: skip
        if reports:
            p = ops._period_totals(db, m, d0, d1)
            p["stops"]["downtime_by_discipline"] = {
                disc_names.get(uuid.UUID(k), k) if k != "none" else "—": v for k, v in p["stops"]["downtime_by_discipline"].items()
            }
            p["stops"]["breaks_count_by_discipline"] = {
                disc_names.get(uuid.UUID(k), k) if k != "none" else "—": v for k, v in p["stops"]["breaks_count_by_discipline"].items()
            }
            p["stops"]["breaks_hours_by_discipline"] = {
                disc_names.get(uuid.UUID(k), k) if k != "none" else "—": v for k, v in p["stops"]["breaks_hours_by_discipline"].items()
            }
            period = p
    logs = []
    for t in db.execute(
        select(OpLogTemplate).where(OpLogTemplate.plant_id == ctx.plant_id, OpLogTemplate.is_active.is_(True)).order_by(OpLogTemplate.sort)
    ).scalars():
        if not ctx.dept_ok(t.department_id):
            continue
        fields = [x for x in svc.fields_of(db, t.id, active_only=True) if x.chart and x.kind != "text"]
        if not fields:
            continue
        series = svc.daily_series(db, t, d0, d1)
        out_fields = []
        for x in fields:
            s = series.get(str(x.id), {})
            per_ton = None
            if x.per_ton:
                per_ton = {d: round(v / net_by_day[d], 4) for d, v in s.items() if net_by_day.get(d)}
            total = sum(s.values()) if s else None
            out_fields.append({**field_out(x), "series": s, "per_ton_series": per_ton, "total": total,
                               "per_ton_period": round(total / sum(net_by_day[d] for d in s if d in net_by_day), 4) if x.per_ton and total is not None and any(net_by_day.get(d) for d in s) else None})  # fmt: skip
        logs.append({"template": template_out(t), "fields": out_fields})
    return {
        "start": d0.isoformat(), "end": d1.isoformat(), "machines": [{"id": str(x.id), "code": x.code, "name": x.name} for x in machines],
        "machine_id": str(m.id) if m else None, "production": prod, "period": period, "logs": logs,
    }  # fmt: skip
