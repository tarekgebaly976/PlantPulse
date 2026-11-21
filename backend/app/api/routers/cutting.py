"""Paper waste, phase B: the winder's cutting plan. Winder settings per paper machine (op.manage), plans with their
order lines (op.cut), the optimiser (calculate), release; everyone with op.view sees them. Each plan shows the actual trim
of its grade over the last 4 weeks (phase A) beside the planned trim."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.cutting import CutOrder, CutPlan, CutWinder
from app.models.identity import User
from app.models.operations import OpGrade, OpMachine
from app.schemas.common import In
from app.services import cutting as svc
from app.services.common import audit, plant_today, utcnow
from app.services.production import trim as trim_svc

router = APIRouter(prefix="/operations/cutting", tags=["cutting"])
DB = Depends(get_db, scope="function")


def _machine(db: Session, ctx: Ctx, mid: uuid.UUID) -> OpMachine:
    m = db.get(OpMachine, mid)
    if m is None or m.plant_id != ctx.plant_id or not ctx.dept_ok(m.department_id):
        raise HTTPException(404, "Production line not found")
    if m.report_profile != "paper_machine":
        raise DomainError("Cutting plans are for paper machines", "not_paper_machine", 422)
    return m


def _winder(db: Session, m: OpMachine) -> CutWinder | None:
    return db.execute(select(CutWinder).where(CutWinder.machine_id == m.id)).scalar_one_or_none()


def winder_out(db: Session, m: OpMachine, w: CutWinder | None) -> dict:
    deckle = w.deckle_mm if w else (int(round(float(m.trim_width_m) * 1000)) if m.trim_width_m else None)
    return {
        "machine_id": m.id,
        "code": m.code,
        "name": m.name,
        "saved": w is not None,
        "deckle_mm": deckle,
        "max_reels": w.max_reels if w else 6,
        "min_trim_mm": w.min_trim_mm if w else 20,
        "max_trim_mm": w.max_trim_mm if w else 250,
        "min_width_mm": w.min_width_mm if w else 300,
        "change_cost_sets": float(w.change_cost_sets) if w else 0.5,
        "grades": [
            {"id": g.id, "code": g.code, "gsm": g.gsm}
            for g in db.execute(
                select(OpGrade).where(OpGrade.machine_id == m.id, OpGrade.is_active.is_(True)).order_by(OpGrade.gsm)
            ).scalars()
        ],
    }


@router.get("/winders")
def winders(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    ms = db.execute(
        select(OpMachine).where(OpMachine.plant_id == ctx.plant_id, OpMachine.report_profile == "paper_machine", OpMachine.is_active.is_(True))
        .order_by(OpMachine.code)
    ).scalars()  # fmt: skip
    return [winder_out(db, m, _winder(db, m)) for m in ms if ctx.dept_ok(m.department_id)]


class WinderIn(In):
    deckle_mm: int = Field(ge=500, le=12000)
    max_reels: int = Field(6, ge=1, le=20)
    min_trim_mm: int = Field(20, ge=0, le=1000)
    max_trim_mm: int = Field(250, ge=0, le=3000)
    min_width_mm: int = Field(300, ge=50, le=12000)
    change_cost_sets: Decimal = Field(Decimal("0.5"), ge=0, le=100)


@router.put("/winders/{machine_id}")
def save_winder(machine_id: uuid.UUID, body: WinderIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    m = _machine(db, ctx, machine_id)
    if body.max_trim_mm < body.min_trim_mm:
        raise DomainError("The largest trim is below the smallest", "trim_limits", 422)
    w = _winder(db, m) or CutWinder(plant_id=ctx.plant_id, machine_id=m.id, deckle_mm=body.deckle_mm)
    for k, v in body.model_dump().items():
        setattr(w, k, v)
    db.add(w)
    db.flush()
    audit(
        db,
        "cut.winder",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="op_machine",
        entity_id=m.id,
        data=body.model_dump(mode="json"),
    )
    return winder_out(db, m, w)


def _plan(db: Session, ctx: Ctx, pid: uuid.UUID) -> CutPlan:
    p = db.get(CutPlan, pid)
    if p is None or p.plant_id != ctx.plant_id:
        raise HTTPException(404, "Cutting plan not found")
    _machine(db, ctx, p.machine_id)
    return p


def _editable(p: CutPlan) -> None:
    if p.status == "released":
        raise DomainError("The plan is released; reopen it to change it", "cut_released", 409)


def plan_out(db: Session, ctx: Ctx, p: CutPlan, full: bool = True) -> dict:
    m = db.get(OpMachine, p.machine_id)
    assert m is not None
    g = db.get(OpGrade, p.grade_id) if p.grade_id else None
    r = p.result or {}
    out = {
        "id": p.id,
        "title": p.title,
        "machine_id": p.machine_id,
        "machine": f"{m.code} · {m.name}",
        "grade_id": p.grade_id,
        "grade": g.code if g else None,
        "gsm": g.gsm if g else None,
        "deckle_mm": p.deckle_mm,
        "status": p.status,
        "note": p.note,
        "orders_count": len(p.orders),
        "reels": sum(o.reels for o in p.orders),
        "trim_pct": r.get("trim_pct"),
        "sets": r.get("sets"),
        "calculated_at": p.calculated_at,
        "created_at": p.created_at,
    }
    if not full:
        return out
    u = db.get(User, p.created_by_id) if p.created_by_id else None
    out |= {
        "created_by": u.full_name if u else None,
        "orders": [
            {
                "id": o.id,
                "customer": o.customer,
                "ref": o.ref,
                "width_mm": o.width_mm,
                "reels": o.reels,
                "tolerance_pct": float(o.tolerance_pct),
                "due_date": o.due_date,
                "made": (r.get("orders") or {}).get(str(o.id)),
            }
            for o in p.orders
        ],  # fmt: skip
        "result": r,
        "winder": winder_out(db, m, _winder(db, m)),
        "baseline": baseline(db, ctx, m, g),
    }
    return out


def baseline(db: Session, ctx: Ctx, m: OpMachine, g: OpGrade | None) -> dict:
    """Actual trim of the machine (and of the plan's grade) over the last 4 weeks, from the reel reports (phase A)."""
    to = plant_today(ctx.plant)
    frm = to - timedelta(days=28)
    a = trim_svc.analyse(db, ctx.plant, frm, to, m.id)
    blk = a["machines"][0] if a["machines"] else None
    grade = None
    if blk and g:
        grade = next((x for x in blk["by_grade"] if x["grade"] == g.code), None)
    return {
        "from": frm,
        "to": to,
        "machine_trim_pct": blk["totals"]["trim_pct"] if blk else None,
        "grade_trim_pct": grade["trim_pct"] if grade else None,
    }


@router.get("/plans")
def list_plans(machine_id: uuid.UUID | None = None, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    q = select(CutPlan).where(CutPlan.plant_id == ctx.plant_id)
    if machine_id:
        q = q.where(CutPlan.machine_id == machine_id)
    plans = db.execute(q.order_by(CutPlan.created_at.desc()).limit(200)).scalars()
    ok = {m.id for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id)).scalars() if ctx.dept_ok(m.department_id)}
    return [plan_out(db, ctx, p, full=False) for p in plans if p.machine_id in ok]


class PlanIn(In):
    machine_id: uuid.UUID
    grade_id: uuid.UUID | None = None
    title: str = Field(min_length=2, max_length=160)
    deckle_mm: int | None = Field(None, ge=500, le=12000)
    note: str | None = Field(None, max_length=2000)


def _grade(db: Session, m: OpMachine, gid: uuid.UUID | None) -> None:
    if gid:
        g = db.get(OpGrade, gid)
        if g is None or g.machine_id != m.id:
            raise HTTPException(422, "Unknown grade for this machine")


@router.post("/plans", status_code=201)
def create_plan(body: PlanIn, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    m = _machine(db, ctx, body.machine_id)
    _grade(db, m, body.grade_id)
    p = CutPlan(plant_id=ctx.plant_id, created_by_id=ctx.user.id, status="draft", result={}, **body.model_dump())
    db.add(p)
    db.flush()
    audit(
        db, "cut.plan_create", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="cut_plan", entity_id=p.id, data={"title": p.title}
    )
    return plan_out(db, ctx, p)


@router.get("/plans/{pid}")
def get_plan(pid: uuid.UUID, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    return plan_out(db, ctx, _plan(db, ctx, pid))


class PlanEdit(In):
    grade_id: uuid.UUID | None = None
    title: str = Field(min_length=2, max_length=160)
    deckle_mm: int | None = Field(None, ge=500, le=12000)
    note: str | None = Field(None, max_length=2000)


def _stale(p: CutPlan) -> None:
    """A change to the orders or the plan's width makes the last result out of date."""
    if p.status == "calculated":
        p.status = "draft"


@router.put("/plans/{pid}")
def edit_plan(pid: uuid.UUID, body: PlanEdit, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    p = _plan(db, ctx, pid)
    _editable(p)
    m = db.get(OpMachine, p.machine_id)
    assert m is not None
    _grade(db, m, body.grade_id)
    if body.deckle_mm != p.deckle_mm:
        _stale(p)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.flush()
    return plan_out(db, ctx, p)


class OrderIn(In):
    customer: str | None = Field(None, max_length=120)
    ref: str | None = Field(None, max_length=60)
    width_mm: int = Field(ge=10, le=12000)
    reels: int = Field(ge=1, le=100000)
    tolerance_pct: Decimal = Field(Decimal(0), ge=0, le=50)
    due_date: date | None = None


class OrdersIn(In):
    orders: list[OrderIn] = Field(max_length=300)


@router.put("/plans/{pid}/orders")
def save_orders(pid: uuid.UUID, body: OrdersIn, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    """The plan's order lines, all at once (the page edits them as a table)."""
    p = _plan(db, ctx, pid)
    _editable(p)
    p.orders.clear()
    db.flush()
    for i, o in enumerate(body.orders):
        p.orders.append(CutOrder(sort=i, **o.model_dump()))
    _stale(p)
    p.result = {}
    p.calculated_at = None
    db.flush()
    return plan_out(db, ctx, p)


@router.post("/plans/{pid}/calculate")
def calculate(pid: uuid.UUID, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    p = _plan(db, ctx, pid)
    _editable(p)
    m = db.get(OpMachine, p.machine_id)
    assert m is not None
    wo = winder_out(db, m, _winder(db, m))
    deckle = p.deckle_mm or wo["deckle_mm"]
    if not deckle:
        raise DomainError("Set the winder's jumbo width first", "no_deckle", 422)
    lim = svc.Limits(deckle=deckle, max_reels=wo["max_reels"], min_trim=wo["min_trim_mm"], max_trim=wo["max_trim_mm"],
                     min_width=wo["min_width_mm"], change_cost_sets=wo["change_cost_sets"])  # fmt: skip
    lines = [svc.Line(str(o.id), o.width_mm, o.reels, float(o.tolerance_pct), o.due_date) for o in p.orders]
    r = svc.solve(lines, lim)
    p.result = r
    p.calculated_at = utcnow()
    p.status = "calculated" if r["status"] in ("optimal", "feasible") else "draft"
    db.flush()
    audit(db, "cut.calculate", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="cut_plan", entity_id=p.id,
          data={"status": r["status"], "sets": r.get("sets"), "trim_pct": r.get("trim_pct")})  # fmt: skip
    return plan_out(db, ctx, p)


@router.post("/plans/{pid}/release")
def release(pid: uuid.UUID, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    p = _plan(db, ctx, pid)
    if p.status != "calculated":
        raise DomainError("Calculate the plan first", "cut_not_calculated", 409)
    p.status = "released"
    db.flush()
    audit(db, "cut.release", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="cut_plan", entity_id=p.id, data={"title": p.title})
    return plan_out(db, ctx, p)


@router.post("/plans/{pid}/reopen")
def reopen(pid: uuid.UUID, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> dict:
    p = _plan(db, ctx, pid)
    if p.status != "released":
        raise DomainError("Only a released plan can be reopened", "cut_state", 409)
    p.status = "calculated"
    db.flush()
    audit(db, "cut.reopen", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="cut_plan", entity_id=p.id, data={})
    return plan_out(db, ctx, p)


@router.delete("/plans/{pid}", status_code=204)
def delete_plan(pid: uuid.UUID, ctx: Ctx = Depends(require("op.cut")), db: Session = DB) -> None:
    p = _plan(db, ctx, pid)
    _editable(p)
    audit(
        db, "cut.plan_delete", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="cut_plan", entity_id=p.id, data={"title": p.title}
    )
    db.delete(p)
