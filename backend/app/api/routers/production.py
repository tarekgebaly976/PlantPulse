"""Production module — industry-independent configuration and intelligence: plant setup (industry, template,
features, menu names), products, loss categories, KPIs (library, variables, results), alert rules and alerts,
actions, Production Insights. Present only when CMMS_OPERATIONS_MODULE is on (op.* permissions)."""

import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.models.identity import Membership, Role, User
from app.models.operations import OpDailyReport, OpDefect, OpDiscipline, OpLog, OpLogTemplate, OpMachine
from app.models.production import OpAction, OpAlert, OpAlertRule, OpIncident, OpKpi, OpLossCategory, OpProduct, OpWorkHours
from app.models.tenancy import Department
from app.schemas.common import In
from app.services import oplogs as oplog_svc
from app.services.common import audit, next_number, plant_today, utcnow
from app.services.production import alerts as alert_svc
from app.services.production import incidents as inc_svc
from app.services.production import insights as insight_svc
from app.services.production import kpis as kp
from app.services.production import layout
from app.services.production import measures as ms
from app.services.production import templates as tpl
from app.services.production import trim as trim_svc
from app.services.production.periods import day_window

router = APIRouter(prefix="/operations", tags=["production"])
DB = Depends(get_db, scope="function")
CODE = r"^[A-Za-z][A-Za-z0-9_]*$"


def _f(v) -> float | None:
    return float(v) if v is not None else None


def _flush(db: Session, what: str) -> None:
    try:
        db.flush()
    except IntegrityError as e:
        raise HTTPException(409, f"{what} already exists") from e


def _line(db: Session, ctx: Ctx, mid: uuid.UUID | None) -> None:
    if mid is None:
        return
    m = db.get(OpMachine, mid)
    if m is None or m.plant_id != ctx.plant_id:
        raise HTTPException(422, "Unknown production line")


def _dept(db: Session, ctx: Ctx, did: uuid.UUID | None) -> None:
    if did is None:
        return
    d = db.get(Department, did)
    if d is None or d.plant_id != ctx.plant_id:
        raise HTTPException(422, "Unknown department")


# ================================================================ plant setup
class ConfigIn(In):
    industry: str | None = Field(None, max_length=60)
    features: dict[str, bool] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)
    setup_done: bool = False
    safety_base: Literal[1_000_000, 200_000] = 1_000_000


def config_out(c) -> dict:
    return {
        "industry": c.industry, "template": c.template, "features": {k: bool((c.features or {}).get(k, True)) for k in tpl.FEATURES},
        "labels": {k: v for k, v in (c.labels or {}).items() if v}, "setup_done": c.setup_done, "safety_base": c.safety_base or 1_000_000,
        "templates": [{"key": k, "name": v["name"]} for k, v in tpl.TEMPLATES.items()],
    }  # fmt: skip


@router.get("/config")
def get_config(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    return config_out(tpl.config(db, ctx.plant_id))


@router.put("/config")
def put_config(body: ConfigIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    c = tpl.config(db, ctx.plant_id)
    c.industry = (body.industry or "").strip() or None
    c.features = {k: bool(body.features.get(k, True)) for k in tpl.FEATURES}
    c.labels = {k: v.strip()[:60] for k, v in body.labels.items() if k in ("reports", "logs") and v and v.strip()}
    c.setup_done = body.setup_done
    c.safety_base = body.safety_base
    db.flush()
    return config_out(c)


class LayoutSection(In):
    id: str = Field(max_length=20)
    on: bool = True


class LayoutIn(In):
    scope: str = Field(max_length=40)  # "mill" or an area (department) id
    sections: list[LayoutSection] | None = Field(None, max_length=20)
    kpis: list[uuid.UUID] | None = Field(None, max_length=40)  # None = the KPIs marked "show on dashboard"
    reset: bool = False


def _scope(db: Session, ctx: Ctx, scope: str) -> str:
    if scope == layout.MILL:
        return scope
    try:
        dept = db.get(Department, uuid.UUID(scope))
    except ValueError:
        dept = None
    if dept is None or dept.plant_id != ctx.plant_id or not ctx.dept_ok(dept.id):
        raise HTTPException(404, "Unknown area")
    return str(dept.id)


@router.get("/dashboard-layout")
def get_layout(scope: str, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    return {"scope": scope, **layout.get(db, ctx.plant_id, _scope(db, ctx, scope))}


@router.put("/dashboard-layout")
def put_layout(body: LayoutIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    """The production dashboard's sections and KPIs of one view, for everyone who sees the dashboard."""
    scope = _scope(db, ctx, body.scope)
    if body.kpis is not None:
        own = {k.id for k in kp.plant_kpis(db, ctx.plant_id, active_only=False)}
        if any(k not in own for k in body.kpis):
            raise HTTPException(422, "Unknown KPI")
    if body.reset:
        out = layout.put(db, ctx.plant_id, scope, None, None)
    else:
        out = layout.put(db, ctx.plant_id, scope, [x.model_dump() for x in body.sections or []], [str(k) for k in body.kpis] if body.kpis is not None else None)
    audit(db, "op.dashboard.layout", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_plant_config", entity_id=None,
          data={"scope": scope, "reset": body.reset})  # fmt: skip
    return {"scope": body.scope, **out}


@router.post("/templates/{key}/apply")
def apply_template(key: str, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    if key not in tpl.TEMPLATES:
        raise HTTPException(404, "Unknown template")
    added = tpl.apply(db, ctx.plant_id, key)
    audit(
        db,
        "op.template.apply",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="op_plant_config",
        entity_id=None,
        data={"template": key, **added},
    )
    return added


@router.get("/setup")
def setup_status(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    """What is configured (counts), for the setup wizard's checklist."""

    def n(model, *where) -> int:
        return db.execute(select(func.count()).select_from(model).where(model.plant_id == ctx.plant_id, *where)).scalar_one()

    lines = list(db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id)).scalars())
    return {
        "config": config_out(tpl.config(db, ctx.plant_id)),
        "counts": {
            "areas": n(Department), "lines": len(lines), "lines_with_shifts": sum(1 for m in lines if m.shifts),
            "products": n(OpProduct), "disciplines": n(OpDiscipline), "loss_categories": n(OpLossCategory), "kpis": n(OpKpi),
            "kpis_with_target": n(OpKpi, OpKpi.target.is_not(None)), "defects": n(OpDefect), "log_forms": n(OpLogTemplate),
            "alert_rules": n(OpAlertRule),
        },
        "units": sorted({m.output_unit for m in lines}),
        "models": sorted({m.production_model for m in lines}),
    }  # fmt: skip


# ================================================================ products
class ProductIn(In):
    code: str = Field("", max_length=40, pattern=r"^$|^[A-Za-z0-9][A-Za-z0-9 ._/&-]*$")  # blank: made from the name
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(None, max_length=80)
    machine_id: uuid.UUID | None = None
    unit: str | None = Field(None, max_length=12)
    ideal_rate_per_h: float | None = Field(None, gt=0, le=1e9)
    ideal_cycle_s: float | None = Field(None, gt=0, le=1e6)
    attributes: dict[str, str] = Field(default_factory=dict)
    is_active: bool = True


def product_out(p: OpProduct) -> dict:
    return {"id": str(p.id), "code": p.code, "name": p.name, "category": p.category, "machine_id": str(p.machine_id) if p.machine_id else None,
            "unit": p.unit, "ideal_rate_per_h": _f(p.ideal_rate_per_h), "ideal_cycle_s": _f(p.ideal_cycle_s), "attributes": p.attributes or {},
            "is_active": p.is_active}  # fmt: skip


@router.get("/products")
def list_products(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    return [
        product_out(p) for p in db.execute(select(OpProduct).where(OpProduct.plant_id == ctx.plant_id).order_by(OpProduct.code)).scalars()
    ]


def _product_body(db: Session, ctx: Ctx, body: ProductIn) -> dict:
    _line(db, ctx, body.machine_id)
    data = body.model_dump()
    data["attributes"] = {k.strip()[:40]: str(v).strip()[:120] for k, v in body.attributes.items() if k.strip()}
    return data


@router.post("/products", status_code=201)
def create_product(body: ProductIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    p = OpProduct(plant_id=ctx.plant_id, **_product_body(db, ctx, body))
    db.add(p)
    _flush(db, "A product with this code")
    return product_out(p)


@router.put("/products/{pid}")
def update_product(pid: uuid.UUID, body: ProductIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    p = db.get(OpProduct, pid)
    if p is None or p.plant_id != ctx.plant_id:
        raise HTTPException(404, "Product not found")
    for k, v in _product_body(db, ctx, body).items():
        setattr(p, k, v)
    _flush(db, "A product with this code")
    return product_out(p)


# ================================================================ loss categories
class LossCategoryIn(In):
    code: str = Field("", max_length=30, pattern="^$|" + CODE)  # blank: made from the name
    name: str = Field(min_length=1, max_length=120)
    parent_id: uuid.UUID | None = None
    affects: Literal["availability", "performance", "quality", "none"] = "availability"
    event_type: Literal["breakdown", "planned", "other", "sheet_break"] = "other"
    planned: bool = False
    failure: bool = False
    discipline_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    sort: int = Field(0, ge=0, le=9999)
    is_active: bool = True


def loss_out(c: OpLossCategory) -> dict:
    return {"id": str(c.id), "code": c.code, "name": c.name, "parent_id": str(c.parent_id) if c.parent_id else None, "affects": c.affects,
            "event_type": c.event_type, "planned": c.planned, "failure": c.failure, "discipline_id": str(c.discipline_id) if c.discipline_id else None,
            "department_id": str(c.department_id) if c.department_id else None, "sort": c.sort, "is_active": c.is_active}  # fmt: skip


@router.get("/loss-categories")
def list_losses(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    q = select(OpLossCategory).where(OpLossCategory.plant_id == ctx.plant_id).order_by(OpLossCategory.sort, OpLossCategory.code)
    return [loss_out(c) for c in db.execute(q).scalars()]


def _loss_body(db: Session, ctx: Ctx, body: LossCategoryIn, own: uuid.UUID | None) -> dict:
    if body.parent_id:
        p = db.get(OpLossCategory, body.parent_id)
        if p is None or p.plant_id != ctx.plant_id or p.id == own or p.parent_id is not None:
            raise HTTPException(422, "The parent must be a top-level category of this plant")
    if body.discipline_id:
        d = db.get(OpDiscipline, body.discipline_id)
        if d is None or d.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown discipline")
    _dept(db, ctx, body.department_id)
    data = body.model_dump()
    if body.event_type == "planned":
        data["planned"] = True
    if data["planned"]:
        data["failure"] = False
    return data


@router.post("/loss-categories", status_code=201)
def create_loss(body: LossCategoryIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    c = OpLossCategory(plant_id=ctx.plant_id, **_loss_body(db, ctx, body, None))
    db.add(c)
    _flush(db, "A loss category with this code")
    return loss_out(c)


@router.put("/loss-categories/{cid}")
def update_loss(cid: uuid.UUID, body: LossCategoryIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    c = db.get(OpLossCategory, cid)
    if c is None or c.plant_id != ctx.plant_id:
        raise HTTPException(404, "Loss category not found")
    for k, v in _loss_body(db, ctx, body, c.id).items():
        setattr(c, k, v)
    _flush(db, "A loss category with this code")
    return loss_out(c)


# ================================================================ KPIs
class KpiIn(In):
    code: str = Field("", max_length=30, pattern="^$|" + CODE)  # blank: made from the name
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(None, max_length=400)
    formula: str = Field(min_length=1, max_length=400)
    unit: str | None = Field(None, max_length=20)
    decimals: int = Field(1, ge=0, le=4)
    direction: Literal["higher", "lower"] = "higher"
    target: float | None = None
    warn: float | None = None
    critical: float | None = None
    period: Literal["day", "week", "month"] = "day"
    machine_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    dashboard: bool = True
    sort: int = Field(0, ge=0, le=9999)
    is_active: bool = True


def kpi_out(k: OpKpi) -> dict:
    return {"id": str(k.id), "code": k.code, "name": k.name, "description": k.description, "formula": k.formula, "unit": k.unit,
            "decimals": k.decimals, "direction": k.direction, "target": _f(k.target), "warn": _f(k.warn), "critical": _f(k.critical),
            "period": k.period, "machine_id": str(k.machine_id) if k.machine_id else None,
            "department_id": str(k.department_id) if k.department_id else None, "standard": k.standard, "dashboard": k.dashboard,
            "sort": k.sort, "is_active": k.is_active}  # fmt: skip


def _kpi_body(db: Session, ctx: Ctx, body: KpiIn) -> dict:
    try:
        kp.check(body.formula, ms.variable_codes(db, ctx.plant_id))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    _line(db, ctx, body.machine_id)
    _dept(db, ctx, body.department_id)
    lower = body.direction == "lower"
    lims = [x for x in (body.target, body.warn, body.critical) if x is not None]
    if len(lims) > 1 and lims != sorted(lims, reverse=not lower):
        raise HTTPException(422, "Target, warning and critical limits must go from best to worst in the KPI's direction")
    return body.model_dump()


@router.get("/kpis")
def list_kpis(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    return {"items": [kpi_out(k) for k in kp.plant_kpis(db, ctx.plant_id, active_only=False)], "library": kp.LIBRARY,
            "variables": ms.variables(db, ctx.plant_id)}  # fmt: skip


@router.post("/kpis", status_code=201)
def create_kpi(body: KpiIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    k = OpKpi(plant_id=ctx.plant_id, standard=body.code in kp.LIBRARY_BY_CODE and body.formula == kp.LIBRARY_BY_CODE[body.code]["formula"],
              **_kpi_body(db, ctx, body))  # fmt: skip
    db.add(k)
    _flush(db, "A KPI with this code")
    return kpi_out(k)


@router.put("/kpis/{kid}")
def update_kpi(kid: uuid.UUID, body: KpiIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    k = db.get(OpKpi, kid)
    if k is None or k.plant_id != ctx.plant_id:
        raise HTTPException(404, "KPI not found")
    for a, v in _kpi_body(db, ctx, body).items():
        setattr(k, a, v)
    lib = kp.LIBRARY_BY_CODE.get(k.code)
    k.standard = bool(lib and lib["formula"] == k.formula)
    _flush(db, "A KPI with this code")
    return kpi_out(k)


@router.post("/kpis/library/{code}", status_code=201)
def add_library_kpi(code: str, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    lib = kp.LIBRARY_BY_CODE.get(code)
    if lib is None:
        raise HTTPException(404, "Unknown standard KPI")
    k = OpKpi(plant_id=ctx.plant_id, standard=True, sort=(kp.LIBRARY.index(lib) + 1) * 10, **lib)
    db.add(k)
    _flush(db, "A KPI with this code")
    return kpi_out(k)


@router.get("/kpi-results")
def kpi_results(
    machine_id: uuid.UUID | None = None, days: int = Query(30, ge=7, le=120), ctx: Ctx = Depends(require("op.view")), db: Session = DB
) -> list[dict]:
    """Every active KPI (of one line, or all) with its day / week / month values, status, missing data, series, trend."""
    rows = [k for k in kp.plant_kpis(db, ctx.plant_id) if machine_id is None or k.machine_id in (None, machine_id)]
    return kp.evaluate(db, ctx.plant, rows, plant_today(ctx.plant), days=days, line_id=machine_id)


# ================================================================ alert rules and alerts
class RuleIn(In):
    code: str = Field("", max_length=30, pattern="^$|" + CODE)  # blank: made from the name
    name: str = Field(min_length=1, max_length=160)
    source_kind: Literal["kpi", "measure", "none"] = "kpi"
    source_code: str | None = Field(None, max_length=40)
    condition: Literal["below", "above", "outside", "kpi_limits", "total_above", "trend_down", "trend_up", "action_overdue"]
    threshold: float | None = None
    threshold_high: float | None = None
    periods: int = Field(1, ge=1, le=30)
    lookback_days: int = Field(7, ge=2, le=90)
    severity: Literal["info", "warning", "critical"] = "warning"
    machine_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    notify_role: str | None = Field(None, max_length=40)
    notify_email: bool = False
    escalate_after_days: int | None = Field(None, ge=1, le=60)
    escalate_role: str | None = Field(None, max_length=40)
    is_active: bool = True


def rule_out(r: OpAlertRule) -> dict:
    return {"id": str(r.id), "code": r.code, "name": r.name, "source_kind": r.source_kind, "source_code": r.source_code, "condition": r.condition,
            "threshold": _f(r.threshold), "threshold_high": _f(r.threshold_high), "periods": r.periods, "lookback_days": r.lookback_days,
            "severity": r.severity, "machine_id": str(r.machine_id) if r.machine_id else None,
            "department_id": str(r.department_id) if r.department_id else None, "notify_role": r.notify_role, "notify_email": r.notify_email,
            "escalate_after_days": r.escalate_after_days, "escalate_role": r.escalate_role, "is_active": r.is_active}  # fmt: skip


def _rule_body(db: Session, ctx: Ctx, body: RuleIn) -> dict:
    data = body.model_dump()
    if body.condition == "action_overdue":
        data["source_kind"], data["source_code"] = "none", None
    elif body.condition == "kpi_limits" and body.source_kind != "kpi":
        raise HTTPException(422, "KPI limits need a KPI as source")
    elif body.source_kind == "kpi":
        if not db.execute(select(OpKpi.id).where(OpKpi.plant_id == ctx.plant_id, OpKpi.code == body.source_code)).first():
            raise HTTPException(422, "Unknown KPI")
    elif body.source_kind == "measure":
        if body.source_code not in ms.variable_codes(db, ctx.plant_id):
            raise HTTPException(422, "Unknown measure or log line code")
    else:
        raise HTTPException(422, "Choose what the rule watches")
    if body.condition in ("below", "above", "total_above", "trend_down", "trend_up") and body.threshold is None:
        raise HTTPException(422, "Give the threshold")
    if body.condition == "outside" and body.threshold is None and body.threshold_high is None:
        raise HTTPException(422, "Give the low and / or high limit")
    roles = {c for (c,) in db.execute(select(Role.code)).all()}
    for r in (body.notify_role, body.escalate_role):
        if r and r not in roles:
            raise HTTPException(422, "Unknown role")
    _line(db, ctx, body.machine_id)
    _dept(db, ctx, body.department_id)
    return data


@router.get("/alert-rules")
def list_rules(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    rules = db.execute(select(OpAlertRule).where(OpAlertRule.plant_id == ctx.plant_id).order_by(OpAlertRule.code)).scalars()
    used = {
        rid
        for (rid,) in db.execute(
            select(Membership.role_id).where(Membership.plant_id == ctx.plant_id, Membership.is_active.is_(True))
        ).all()
    }
    roles = [{"code": r.code, "name": r.name} for r in db.execute(select(Role).order_by(Role.name)).scalars() if r.id in used]
    return {"items": [rule_out(r) for r in rules], "roles": roles, "conditions": list(alert_svc.CONDITIONS)}


@router.post("/alert-rules", status_code=201)
def create_rule(body: RuleIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    r = OpAlertRule(plant_id=ctx.plant_id, **_rule_body(db, ctx, body))
    db.add(r)
    _flush(db, "A rule with this code")
    return rule_out(r)


@router.put("/alert-rules/{rid}")
def update_rule(rid: uuid.UUID, body: RuleIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    r = db.get(OpAlertRule, rid)
    if r is None or r.plant_id != ctx.plant_id:
        raise HTTPException(404, "Rule not found")
    for k, v in _rule_body(db, ctx, body).items():
        setattr(r, k, v)
    _flush(db, "A rule with this code")
    return rule_out(r)


@router.post("/alerts/evaluate")
def evaluate_alerts(ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    return alert_svc.evaluate(db, ctx.plant)


def alert_out(a: OpAlert, rules: dict, lines: dict, names: dict) -> dict:
    r = rules.get(a.rule_id)
    return {"id": str(a.id), "rule": rule_out(r) if r else None, "line": lines.get(a.machine_id), "status": a.status, "severity": a.severity,
            "period_date": a.period_date.isoformat(), "value": _f(a.value), "detail": a.detail, "first_seen": a.first_seen.isoformat(),
            "last_seen": a.last_seen.isoformat(), "acknowledged_by": names.get(a.acknowledged_by_id),
            "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None, "escalated": a.escalated_at is not None,
            "closed_at": a.closed_at.isoformat() if a.closed_at else None}  # fmt: skip


@router.get("/alerts")
def list_alerts(status: Literal["active", "all"] = "active", ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> list[dict]:
    q = select(OpAlert).where(OpAlert.plant_id == ctx.plant_id)
    if status == "active":
        q = q.where(OpAlert.status.in_(alert_svc.OPEN))
    alerts = list(db.execute(q.order_by(OpAlert.last_seen.desc()).limit(200)).scalars())
    rules = {r.id: r for r in db.execute(select(OpAlertRule).where(OpAlertRule.plant_id == ctx.plant_id)).scalars()}
    lines = {m.id: m.code for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id)).scalars()}
    names = _names(db, {a.acknowledged_by_id for a in alerts})
    return [alert_out(a, rules, lines, names) for a in alerts]


def _alert(db: Session, ctx: Ctx, aid: uuid.UUID) -> OpAlert:
    a = db.get(OpAlert, aid)
    if a is None or a.plant_id != ctx.plant_id:
        raise HTTPException(404, "Alert not found")
    return a


@router.post("/alerts/{aid}/ack")
def ack_alert(aid: uuid.UUID, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    a = _alert(db, ctx, aid)
    if a.status == "open":
        a.status, a.acknowledged_by_id, a.acknowledged_at = "acknowledged", ctx.user.id, utcnow()
    return {"status": a.status}


@router.post("/alerts/{aid}/close")
def close_alert(aid: uuid.UUID, ctx: Ctx = Depends(require("op.confirm")), db: Session = DB) -> dict:
    a = _alert(db, ctx, aid)
    if a.status in alert_svc.OPEN:
        a.status, a.closed_at = "closed", utcnow()
    return {"status": a.status}


# ================================================================ actions
class ActionIn(In):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=4000)
    status: Literal["open", "in_progress", "done", "cancelled"] = "open"
    owner_id: uuid.UUID | None = None
    due_date: date | None = None
    source: Literal["manual", "alert", "insight", "report", "incident"] = "manual"
    alert_id: uuid.UUID | None = None
    incident_id: uuid.UUID | None = None
    report_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None
    result: str | None = Field(None, max_length=4000)


def _names(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}  # type: ignore[arg-type]


def action_out(a: OpAction, names: dict, lines: dict, today: date) -> dict:
    return {"id": str(a.id), "title": a.title, "description": a.description, "status": a.status, "owner_id": str(a.owner_id) if a.owner_id else None,
            "owner": names.get(a.owner_id), "due_date": a.due_date.isoformat() if a.due_date else None, "source": a.source,
            "alert_id": str(a.alert_id) if a.alert_id else None,
            "incident_id": str(a.incident_id) if a.incident_id else None, "report_id": str(a.report_id) if a.report_id else None,
            "machine_id": str(a.machine_id) if a.machine_id else None, "line": lines.get(a.machine_id), "result": a.result,
            "overdue": bool(a.due_date and a.due_date < today and a.status in ("open", "in_progress")),
            "created_at": a.created_at.isoformat() if a.created_at else None, "closed_at": a.closed_at.isoformat() if a.closed_at else None}  # fmt: skip


@router.get("/actions")
def list_actions(status: Literal["active", "all"] = "active", ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    q = select(OpAction).where(OpAction.plant_id == ctx.plant_id)
    if status == "active":
        q = q.where(OpAction.status.in_(("open", "in_progress")))
    items = list(db.execute(q.order_by(OpAction.due_date.asc().nulls_last(), OpAction.created_at.desc()).limit(300)).scalars())
    lines = {m.id: m.code for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id)).scalars()}
    members = db.execute(
        select(User.id, User.full_name).join(Membership, Membership.user_id == User.id)
        .where(Membership.plant_id == ctx.plant_id, Membership.is_active.is_(True), User.is_active.is_(True)).order_by(User.full_name)
    ).all()  # fmt: skip
    names = {uid: n for uid, n in members} | _names(db, {a.owner_id for a in items})
    today = plant_today(ctx.plant)
    return {"items": [action_out(a, names, lines, today) for a in items], "people": [{"id": str(uid), "name": n} for uid, n in members]}


def _action_body(db: Session, ctx: Ctx, body: ActionIn) -> dict:
    if (
        body.owner_id
        and not db.execute(
            select(Membership.id).where(
                Membership.plant_id == ctx.plant_id, Membership.user_id == body.owner_id, Membership.is_active.is_(True)
            )
        ).first()
    ):
        raise HTTPException(422, "The owner is not a member of this plant")
    if body.alert_id:
        _alert(db, ctx, body.alert_id)
    if body.incident_id:
        _incident(db, ctx, body.incident_id)
    _line(db, ctx, body.machine_id)
    return body.model_dump()


@router.post("/actions", status_code=201)
def create_action(body: ActionIn, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    a = OpAction(plant_id=ctx.plant_id, created_by_id=ctx.user.id, **_action_body(db, ctx, body))
    if a.incident_id and a.machine_id is None:
        inc = db.get(OpIncident, a.incident_id)
        a.machine_id = inc.machine_id if inc else None
    if a.alert_id and a.machine_id is None:
        al = db.get(OpAlert, a.alert_id)
        a.machine_id = al.machine_id if al else None
    if a.status in ("done", "cancelled"):
        a.closed_at = utcnow()
    db.add(a)
    db.flush()
    if a.alert_id:  # an action taken: the alert is acknowledged
        al = db.get(OpAlert, a.alert_id)
        if al and al.status == "open":
            al.status, al.acknowledged_by_id, al.acknowledged_at = "acknowledged", ctx.user.id, utcnow()
    return {"id": str(a.id)}


@router.put("/actions/{aid}")
def update_action(aid: uuid.UUID, body: ActionIn, ctx: Ctx = Depends(require("op.enter")), db: Session = DB) -> dict:
    a = db.get(OpAction, aid)
    if a is None or a.plant_id != ctx.plant_id:
        raise HTTPException(404, "Action not found")
    if not (ctx.has("op.confirm") or a.owner_id == ctx.user.id or a.created_by_id == ctx.user.id):
        raise HTTPException(403, "Only the owner, the creator or a production manager can change this action")
    was = a.status
    for k, v in _action_body(db, ctx, body).items():
        setattr(a, k, v)
    if a.status in ("done", "cancelled") and was not in ("done", "cancelled"):
        a.closed_at = utcnow()
    elif a.status in ("open", "in_progress"):
        a.closed_at = None
    return {"id": str(a.id), "status": a.status}


# ================================================================ insights
@router.get("/insights")
def insights(ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    return insight_svc.generate(db, ctx.plant, plant_today(ctx.plant), ctx.dept_ok)


# ================================================================ paper waste (trim loss), phase A
@router.get("/trim-loss")
def trim_loss(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    machine_id: uuid.UUID | None = None,
    ctx: Ctx = Depends(require("op.view")),
    db: Session = DB,
) -> dict:
    """Waste per paper machine and converting line (sheeters): by grade / sheet size, week, shift, with the top causes.
    Default: the last 4 full weeks plus this week."""
    to = date_to or plant_today(ctx.plant)
    frm = date_from or trim_svc.week_of(to) - timedelta(days=28)
    if frm > to:
        raise HTTPException(422, "The start is after the end")
    if (to - frm).days > 366:
        raise HTTPException(422, "At most one year")
    _line(db, ctx, machine_id)
    return trim_svc.analyse(db, ctx.plant, frm, to, machine_id, ctx.dept_ok)


# ================================================================ safety incidents
class IncidentIn(In):
    occurred_at: datetime
    department_id: uuid.UUID
    machine_id: uuid.UUID | None = None
    asset_id: uuid.UUID | None = None
    shift: str | None = Field(None, max_length=8)
    kind: Literal["near_miss", "first_aid", "medical", "lost_time", "property", "environment", "other"]
    severity: Literal["low", "medium", "high", "critical"] = "low"
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=4000)
    location: str | None = Field(None, max_length=160)
    people: str | None = Field(None, max_length=400)
    injured: int = Field(0, ge=0, le=500)
    lost_days: int | None = Field(None, ge=0, le=3650)
    immediate_action: str | None = Field(None, max_length=4000)
    root_cause: str | None = Field(None, max_length=4000)
    status: Literal["open", "investigating", "closed"] = "open"
    log_id: uuid.UUID | None = None
    report_id: uuid.UUID | None = None


def incident_out(i: OpIncident, names: dict, depts: dict, lines: dict) -> dict:
    return {"id": str(i.id), "number": i.number, "occurred_at": i.occurred_at.isoformat(), "department_id": str(i.department_id),
            "department": depts.get(i.department_id), "machine_id": str(i.machine_id) if i.machine_id else None, "line": lines.get(i.machine_id),
            "asset_id": str(i.asset_id) if i.asset_id else None, "shift": i.shift, "kind": i.kind, "severity": i.severity, "title": i.title,
            "description": i.description, "location": i.location, "people": i.people, "injured": i.injured, "lost_days": i.lost_days,
            "immediate_action": i.immediate_action, "root_cause": i.root_cause, "status": i.status, "log_id": str(i.log_id) if i.log_id else None,
            "report_id": str(i.report_id) if i.report_id else None, "reported_by": names.get(i.reported_by_id), "closed_by": names.get(i.closed_by_id),
            "closed_at": i.closed_at.isoformat() if i.closed_at else None, "created_at": i.created_at.isoformat() if i.created_at else None}  # fmt: skip


def _incident(db: Session, ctx: Ctx, iid: uuid.UUID) -> OpIncident:
    i = db.get(OpIncident, iid)
    if i is None or i.plant_id != ctx.plant_id or not ctx.dept_ok(i.department_id):
        raise HTTPException(404, "Incident not found")
    return i


def _can_report(ctx: Ctx) -> None:
    """Anyone who enters production reports or raises work requests may report an incident (safety first)."""
    if not (ctx.has("op.enter") or ctx.has("request.create") or ctx.has("op.confirm")):
        raise HTTPException(403, "Missing permission: op.enter")


def _incident_body(db: Session, ctx: Ctx, body: IncidentIn) -> dict:
    from zoneinfo import ZoneInfo

    from app.models.assets import Asset

    _dept(db, ctx, body.department_id)
    _line(db, ctx, body.machine_id)
    if body.asset_id:
        a = db.get(Asset, body.asset_id)
        if a is None or a.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown asset")
    if body.log_id:
        lg = db.get(OpLog, body.log_id)
        if lg is None or lg.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown log")
    if body.report_id:
        r = db.get(OpDailyReport, body.report_id)
        if r is None or r.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown report")
    data = body.model_dump()
    tz = ZoneInfo(ctx.plant.timezone)
    data["occurred_at"] = body.occurred_at.replace(tzinfo=tz) if body.occurred_at.tzinfo is None else body.occurred_at
    if data["occurred_at"] > utcnow() + timedelta(minutes=10):
        raise HTTPException(422, "The incident cannot be in the future")
    if body.kind != "lost_time":
        data["lost_days"] = None
    return data


@router.get("/incidents")
def list_incidents(
    status: Literal["active", "all"] = "all",
    days: int = Query(90, ge=1, le=3650),
    department_id: uuid.UUID | None = None,
    log_id: uuid.UUID | None = None,
    report_id: uuid.UUID | None = None,
    ctx: Ctx = Depends(require("op.view")),
    db: Session = DB,
) -> dict:
    """The register (newest first), or the incidents of one shift log / daily report (its area and time window)."""
    q = select(OpIncident).where(OpIncident.plant_id == ctx.plant_id)
    if log_id:
        lg = db.get(OpLog, log_id)
        if lg is None or lg.plant_id != ctx.plant_id:
            raise HTTPException(404, "Log not found")
        t = db.get(OpLogTemplate, lg.template_id)
        assert t is not None
        a, b = oplog_svc.window_of(t, ctx.plant, lg.log_date, lg.shift)
        q = q.where(
            OpIncident.department_id == t.department_id,
            ((OpIncident.occurred_at >= a) & (OpIncident.occurred_at < b)) | (OpIncident.log_id == lg.id),
        )
    elif report_id:
        r = db.get(OpDailyReport, report_id)
        if r is None or r.plant_id != ctx.plant_id:
            raise HTTPException(404, "Report not found")
        m = db.get(OpMachine, r.machine_id)
        assert m is not None
        a, b = day_window(m, ctx.plant, r.report_date)
        q = q.where((OpIncident.department_id == m.department_id) | (OpIncident.machine_id == m.id),
                    ((OpIncident.occurred_at >= a) & (OpIncident.occurred_at < b)) | (OpIncident.report_id == r.id))  # fmt: skip
    else:
        q = q.where(OpIncident.occurred_at >= utcnow() - timedelta(days=days))
        if department_id:
            q = q.where(OpIncident.department_id == department_id)
    if status == "active":
        q = q.where(OpIncident.status != "closed")
    rows = [i for i in db.execute(q.order_by(OpIncident.occurred_at.desc()).limit(500)).scalars() if ctx.dept_ok(i.department_id)]
    names = _names(db, {i.reported_by_id for i in rows} | {i.closed_by_id for i in rows})
    depts = {d.id: d.name for d in db.execute(select(Department).where(Department.plant_id == ctx.plant_id)).scalars()}
    lines = {m.id: m.code for m in db.execute(select(OpMachine).where(OpMachine.plant_id == ctx.plant_id)).scalars()}
    return {"items": [incident_out(i, names, depts, lines) for i in rows], "stats": inc_svc.stats(db, ctx.plant, plant_today(ctx.plant)),
            "can_report": ctx.has("op.enter") or ctx.has("request.create") or ctx.has("op.confirm"), "can_close": ctx.has("op.confirm")}  # fmt: skip


@router.post("/incidents", status_code=201)
def create_incident(body: IncidentIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    _can_report(ctx)
    data = _incident_body(db, ctx, body)
    if data["status"] == "closed" and not ctx.has("op.confirm"):
        data["status"] = "open"
    i = OpIncident(plant_id=ctx.plant_id, number=next_number(db, ctx.plant, "INC"), reported_by_id=ctx.user.id, **data)
    if i.status == "closed":
        i.closed_by_id, i.closed_at = ctx.user.id, utcnow()
    db.add(i)
    db.flush()
    inc_svc.announce(db, ctx.plant, i)
    audit(db, "op.incident.create", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_incident", entity_id=i.id,
          data={"number": i.number, "kind": i.kind, "severity": i.severity})  # fmt: skip
    return {"id": str(i.id), "number": i.number}


@router.put("/incidents/{iid}")
def update_incident(iid: uuid.UUID, body: IncidentIn, ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    i = _incident(db, ctx, iid)
    manager = ctx.has("op.confirm")
    if not manager and not (i.reported_by_id == ctx.user.id and i.status == "open"):
        raise HTTPException(403, "Only the reporter (while open) or a production manager can change this incident")
    if body.status != i.status and not manager:
        raise HTTPException(403, "Only a production manager can change the status")
    was = i.status
    for k, v in _incident_body(db, ctx, body).items():
        setattr(i, k, v)
    if i.status == "closed" and was != "closed":
        i.closed_by_id, i.closed_at = ctx.user.id, utcnow()
    elif i.status != "closed":
        i.closed_by_id = i.closed_at = None
    audit(db, "op.incident.update", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_incident", entity_id=i.id,
          data={"number": i.number, "status": i.status})  # fmt: skip
    return {"id": str(i.id), "status": i.status}


# ================================================================ hours worked and safety rates
class HoursRow(In):
    department_id: uuid.UUID | None = None  # None: the whole plant
    employee_hours: float = Field(0, ge=0, le=10_000_000)
    contractor_hours: float = Field(0, ge=0, le=10_000_000)
    note: str | None = Field(None, max_length=200)


class HoursIn(In):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    rows: list[HoursRow] = Field(max_length=200)


def _month(m: str) -> date:
    y, mo = (int(x) for x in m.split("-"))
    if not 1 <= mo <= 12:
        raise HTTPException(422, "Unknown month")
    return date(y, mo, 1)


@router.get("/work-hours")
def get_work_hours(month: str = Query(pattern=r"^\d{4}-\d{2}$"), ctx: Ctx = Depends(require("op.view")), db: Session = DB) -> dict:
    m = _month(month)
    rows = db.execute(select(OpWorkHours).where(OpWorkHours.plant_id == ctx.plant_id, OpWorkHours.month == m)).scalars()
    return {"month": month, "rows": [{"department_id": str(r.department_id) if r.department_id else None, "employee_hours": _f(r.employee_hours),
                                      "contractor_hours": _f(r.contractor_hours), "note": r.note} for r in rows]}  # fmt: skip


@router.put("/work-hours")
def put_work_hours(body: HoursIn, ctx: Ctx = Depends(require("op.manage")), db: Session = DB) -> dict:
    """Replace the hours worked of a month: one row per area, or one row for the whole plant (not both, which would
    count the hours twice)."""
    m = _month(body.month)
    if m > plant_today(ctx.plant).replace(day=1):
        raise HTTPException(422, "Hours cannot be entered for a future month")
    depts = [r.department_id for r in body.rows]
    if None in depts and len(body.rows) > 1:
        raise HTTPException(422, "Enter the hours either per area or for the whole plant, not both")
    if len(set(depts)) != len(depts):
        raise HTTPException(422, "An area is listed twice")
    for d in depts:
        _dept(db, ctx, d)
    db.execute(OpWorkHours.__table__.delete().where(OpWorkHours.plant_id == ctx.plant_id, OpWorkHours.month == m))
    for r in body.rows:
        if r.employee_hours or r.contractor_hours:
            db.add(OpWorkHours(plant_id=ctx.plant_id, month=m, department_id=r.department_id, employee_hours=r.employee_hours,
                               contractor_hours=r.contractor_hours, note=(r.note or "").strip() or None))  # fmt: skip
    db.flush()
    audit(db, "op.work_hours.save", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="op_work_hours", entity_id=None,
          data={"month": body.month, "total": sum(r.employee_hours + r.contractor_hours for r in body.rows)})  # fmt: skip
    return {"month": body.month, "saved": len([r for r in body.rows if r.employee_hours or r.contractor_hours])}


@router.get("/safety-rates")
def safety_rates(
    months: int = Query(12, ge=1, le=36), department_id: uuid.UUID | None = None, ctx: Ctx = Depends(require("op.view")), db: Session = DB
) -> dict:
    """Monthly and rolling-12-month LTIFR, LTISR and TRIR with the hours worked and incident counts behind them."""
    return inc_svc.monthly(db, ctx.plant, plant_today(ctx.plant), months, department_id)
