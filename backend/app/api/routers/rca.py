"""Root cause analysis (RCA) API: rules, register, the analysis (5W1H, 5 Whys, fishbone, root causes), team, action
plan, approvals and the effectiveness check. Business rules live in app.services.rca."""

import io
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, get_ctx, require
from app.api.pagination import PageQ
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.assets import Asset, FailureCode
from app.models.enums import ACTIVE_RCA_STATUSES, Priority, RCAActionKind, RCAActionStatus, RCAStatus, WOStatus, WOType
from app.models.identity import Membership, User
from app.models.pm import PMPlan
from app.models.rca import RCA, RCAAction, RCAMember, RCAWorkOrder
from app.models.tenancy import Department
from app.models.workorders import WorkOrder
from app.schemas.common import In
from app.services import rca as svc
from app.services.common import audit, plant_today, utcnow
from app.services.notifications import notify, users_with_permission
from app.services.search import where_text

router = APIRouter(prefix="/rca", tags=["rca"])

TEXT = 4000


# ---------------- rules ----------------
class DowntimeLimits(BaseModel):
    A: float | None = Field(None, ge=0)
    B: float | None = Field(None, ge=0)
    C: float | None = Field(None, ge=0)


class RulesIn(In):
    enabled: bool
    auto_open: bool = False
    wo_types: list[Literal["corrective", "emergency", "inspection", "predictive", "preventive", "improvement", "shutdown"]] = Field(
        min_length=1
    )
    downtime_hours: DowntimeLimits
    repeat_enabled: bool
    repeat_count: int = Field(ge=2, le=20)
    repeat_days: int = Field(ge=1, le=730)
    failure_mode_ids: list[uuid.UUID] = Field(default_factory=list, max_length=300)
    production_loss_tons: float | None = Field(None, ge=0)
    cost: float | None = Field(None, ge=0)
    safety_event: bool = True
    analysis_days: int = Field(ge=1, le=180)
    effectiveness_days: int = Field(ge=0, le=730)


@router.get("/rules")
def get_rules(ctx: Ctx = Depends(require("rca.view")), db: Session = Depends(get_db, scope="function")) -> dict:
    return svc.rules(ctx.plant)


@router.put("/rules")
def put_rules(body: RulesIn, ctx: Ctx = Depends(require("rca.settings")), db: Session = Depends(get_db, scope="function")) -> dict:
    data = body.model_dump(mode="json")
    if data["failure_mode_ids"]:
        found = set(
            db.execute(
                select(FailureCode.id).where(FailureCode.plant_id == ctx.plant_id, FailureCode.id.in_(body.failure_mode_ids))
            ).scalars()
        )
        if len(found) != len(set(body.failure_mode_ids)):
            raise HTTPException(422, "Unknown failure code")
    return svc.save_rules(db, ctx.plant, data, ctx.user.id)


# ---------------- access helpers ----------------
def _get(db: Session, ctx: Ctx, rid: uuid.UUID, lock: bool = False) -> RCA:
    q = select(RCA).where(RCA.id == rid, RCA.plant_id == ctx.plant_id)
    if lock:
        q = q.with_for_update()
    r = db.execute(q).scalar_one_or_none()
    if r is None or not ctx.dept_ok(r.department_id):
        raise HTTPException(404, "RCA not found")
    if not ctx.has("rca.view") and ctx.user.id not in _people(db, r):
        raise HTTPException(404, "RCA not found")
    return r


def _people(db: Session, r: RCA) -> set[uuid.UUID]:
    owners = set(db.execute(select(RCAAction.owner_id).where(RCAAction.rca_id == r.id, RCAAction.owner_id.is_not(None))).scalars())
    return svc.team_ids(db, r) | {o for o in owners if o}


def _can_edit(db: Session, ctx: Ctx, r: RCA) -> bool:
    return ctx.has("rca.approve") or ctx.has("rca.edit") or ctx.user.id in svc.team_ids(db, r)


def _need_edit(db: Session, ctx: Ctx, r: RCA) -> None:
    if not _can_edit(db, ctx, r):
        raise HTTPException(403, "Only the RCA team, engineers and the manager may change this RCA")


def _editable_analysis(ctx: Ctx, r: RCA) -> None:
    ok = r.status == RCAStatus.INVESTIGATION or (ctx.has("rca.approve") and r.status == RCAStatus.AWAITING_APPROVAL)
    if not ok:
        raise DomainError("The analysis can be changed during the investigation only", "read_only", 409)


def _names(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {uid: name for uid, name in db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()}


# ---------------- register ----------------
def _summaries(db: Session, ctx: Ctx, rows: list[RCA]) -> list[dict]:
    if not rows:
        return []
    ids = [r.id for r in rows]
    assets = {a.id: a for a in db.execute(select(Asset).where(Asset.id.in_({r.asset_id for r in rows}))).scalars()}
    fcs = {
        f.id: f
        for f in db.execute(select(FailureCode).where(FailureCode.id.in_({r.failure_code_id for r in rows if r.failure_code_id}))).scalars()
    }
    names = _names(db, {r.leader_id for r in rows})
    wo_agg = {
        rid: (n, d)
        for rid, n, d in db.execute(
            select(RCAWorkOrder.rca_id, func.count(), func.coalesce(func.sum(WorkOrder.downtime_hours), 0))
            .join(WorkOrder, WorkOrder.id == RCAWorkOrder.work_order_id)
            .where(RCAWorkOrder.rca_id.in_(ids))
            .group_by(RCAWorkOrder.rca_id)
        ).all()
    }
    acts: dict[uuid.UUID, list[RCAAction]] = {}
    for act in db.execute(select(RCAAction).where(RCAAction.rca_id.in_(ids))).scalars():
        acts.setdefault(act.rca_id, []).append(act)
    today = plant_today(ctx.plant)
    out = []
    for r in rows:
        a = assets.get(r.asset_id)
        fc = fcs.get(r.failure_code_id) if r.failure_code_id else None
        al = acts.get(r.id, [])
        n, down = wo_agg.get(r.id, (0, 0))
        out.append(
            {
                "id": r.id,
                "number": r.number,
                "title": r.title,
                "status": r.status,
                "source": r.source,
                "asset": {"id": a.id, "code": a.code, "name": a.name, "criticality": a.criticality} if a else None,
                "failure_mode": {"id": fc.id, "code": fc.code, "description": fc.description} if fc else None,
                "leader": names.get(r.leader_id) if r.leader_id else None,
                "due_date": r.due_date,
                "created_at": r.created_at,
                "closed_at": r.closed_at,
                "effectiveness_due": r.effectiveness_due,
                "trigger_reasons": r.trigger_reasons or [],
                "work_orders": n,
                "downtime_hours": float(down or 0),
                "actions_total": len([x for x in al if x.status != RCAActionStatus.CANCELLED]),
                "actions_done": len([x for x in al if x.status == RCAActionStatus.DONE]),
                "actions_overdue": len([x for x in al if x.status not in svc.DONE_ACTION and x.due_date and x.due_date < today]),
                "overdue": bool(r.status == RCAStatus.INVESTIGATION and r.due_date and r.due_date < today),
                "recurrence_count": r.recurrence_count,
            }
        )
    return out


def _list_query(db: Session, ctx: Ctx, status: str | None, q: str | None, mine: bool, asset_id: uuid.UUID | None):
    stmt = select(RCA).where(RCA.plant_id == ctx.plant_id, ctx.dept_where(RCA.department_id))
    if status == "active":
        stmt = stmt.where(RCA.status.in_(ACTIVE_RCA_STATUSES))
    elif status == "open":  # started and not finished: what the team is working on
        stmt = stmt.where(
            RCA.status.in_([RCAStatus.INVESTIGATION, RCAStatus.AWAITING_APPROVAL, RCAStatus.ACTION_PLAN, RCAStatus.MONITORING])
        )
    elif status:
        stmt = stmt.where(RCA.status == RCAStatus(status))
    if asset_id:
        stmt = stmt.where(RCA.asset_id == asset_id)
    stmt = where_text(stmt, q, RCA.number, RCA.title, asset_col=RCA.asset_id, plant_id=ctx.plant_id)
    if mine or not ctx.has("rca.view"):
        me = ctx.user.id
        stmt = stmt.where(
            or_(
                RCA.leader_id == me,
                RCA.id.in_(select(RCAMember.rca_id).where(RCAMember.user_id == me)),
                RCA.id.in_(select(RCAAction.rca_id).where(RCAAction.owner_id == me)),
            )
        )
    return stmt


@router.get("")
def list_rca(
    ctx: Ctx = Depends(get_ctx),
    db: Session = Depends(get_db, scope="function"),
    page: PageQ = Depends(),
    status: Literal[
        "active",
        "open",
        "candidate",
        "not_required",
        "investigation",
        "awaiting_approval",
        "action_plan",
        "monitoring",
        "closed",
        "cancelled",
    ]
    | None = None,
    q: str | None = None,
    mine: bool = False,
    asset_id: uuid.UUID | None = None,
) -> dict:
    stmt = _list_query(db, ctx, status, q, mine, asset_id)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(stmt.order_by(RCA.created_at.desc()).limit(page.limit).offset(page.offset)).scalars())
    return {"items": _summaries(db, ctx, rows), "total": total, "limit": page.limit, "offset": page.offset}


@router.get("/stats")
def rca_stats(
    start: date | None = None,
    end: date | None = None,
    ctx: Ctx = Depends(require("rca.view")),
    db: Session = Depends(get_db, scope="function"),
) -> dict:
    today = plant_today(ctx.plant)
    end = end or today
    start = start or end.replace(day=1)
    return {"start": start, "end": end, **svc.stats(db, ctx.plant_id, start, end, ctx.dept_where(RCA.department_id))}


@router.get("/leaders")
def leaders(ctx: Ctx = Depends(require("rca.view")), db: Session = Depends(get_db, scope="function")) -> list[dict]:
    """People who may lead an RCA (engineering positions: permission rca.lead)."""
    ids = users_with_permission(db, ctx.plant_id, "rca.lead")
    rows = db.execute(
        select(User, Membership)
        .join(Membership, Membership.user_id == User.id)
        .where(User.id.in_(ids), Membership.plant_id == ctx.plant_id)
    ).all()
    return sorted(
        [{"id": u.id, "full_name": u.full_name, "role": m.role.name, "trade": u.trade} for u, m in rows], key=lambda x: x["full_name"]
    )


@router.get("/export.xlsx")
def export_xlsx(
    status: str | None = None, ctx: Ctx = Depends(require("rca.view")), db: Session = Depends(get_db, scope="function")
) -> Response:
    rows = list(db.execute(_list_query(db, ctx, status, None, False, None).order_by(RCA.created_at)).scalars())
    summ = {s["id"]: s for s in _summaries(db, ctx, rows)}
    depts = {d.id: d.code for d in db.execute(select(Department).where(Department.plant_id == ctx.plant_id)).scalars()}
    wb = Workbook()
    ws = wb.active
    ws.title = "RCA register"
    head = [
        "RCA no.", "Status", "Title", "Asset", "Department", "Failure mode", "Why it needs an RCA", "Leader", "Created", "Analysis due",
        "Closed", "Work orders", "Downtime (h)", "Root causes", "Actions done", "Actions total", "Actions overdue", "Recurrences",
    ]  # fmt: skip
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F4E79")
    tz = ctx.plant.timezone
    from zoneinfo import ZoneInfo

    def d(v: datetime | None) -> str:
        return v.astimezone(ZoneInfo(tz)).strftime("%Y-%m-%d") if v else ""

    for r in rows:
        s = summ[r.id]
        ws.append(
            [
                r.number,
                r.status.value.replace("_", " "),
                r.title,
                f"{s['asset']['code']} {s['asset']['name']}" if s["asset"] else "",
                depts.get(r.department_id, ""),
                f"{s['failure_mode']['code']} {s['failure_mode']['description']}" if s["failure_mode"] else "",
                "; ".join(svc.reason_text(x) for x in r.trigger_reasons or [] if x.get("rule") in svc.RULE_CODES),
                s["leader"] or "",
                d(r.created_at),
                r.due_date.isoformat() if r.due_date else "",
                d(r.closed_at),
                s["work_orders"],
                s["downtime_hours"],
                "\n".join(f"[{c.get('type')}] {c.get('text')}" for c in r.root_causes or []),
                s["actions_done"],
                s["actions_total"],
                s["actions_overdue"],
                r.recurrence_count,
            ]
        )
    for col, w in zip("ABCDEFGHIJKLMNOPQR", (16, 16, 40, 30, 10, 28, 40, 20, 11, 11, 11, 8, 10, 50, 8, 8, 8, 8), strict=True):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="rca-register.xlsx"'},
    )


# ---------------- request (manual) ----------------
class RequestIn(In):
    work_order_id: uuid.UUID | None = None
    asset_id: uuid.UUID | None = None
    title: str | None = Field(None, max_length=200)
    note: str = Field(min_length=3, max_length=TEXT)


@router.post("", status_code=201)
def request_rca(body: RequestIn, ctx: Ctx = Depends(require("rca.edit")), db: Session = Depends(get_db, scope="function")) -> dict:
    """Ask for an RCA on a breakdown (or an asset) that the rules did not pick up. The manager decides."""
    wo = None
    if body.work_order_id:
        wo = db.get(WorkOrder, body.work_order_id)
        if wo is None or wo.plant_id != ctx.plant_id or not ctx.dept_ok(wo.department_id):
            raise HTTPException(404, "Work order not found")
        linked = db.execute(select(RCAWorkOrder.rca_id).where(RCAWorkOrder.work_order_id == wo.id)).scalar_one_or_none()
        if linked:
            raise DomainError("This work order already has an RCA", "duplicate", 409)
    asset_id = wo.asset_id if wo else body.asset_id
    if not asset_id:
        raise HTTPException(422, "Choose a work order or an asset")
    asset = db.get(Asset, asset_id)
    if asset is None or asset.plant_id != ctx.plant_id:
        raise HTTPException(422, "Asset not found in this plant")
    ctx.check_asset(db, asset.id, code=403)
    mode = db.get(FailureCode, wo.problem_code_id) if wo and wo.problem_code_id else None
    title = body.title or f"{asset.code} {asset.name} – {mode.description if mode else (wo.title if wo else 'breakdown')}"
    reason = {"rule": "manual", "by": ctx.user.full_name, "work_order": wo.number if wo else None}
    r = svc.create_candidate(
        db,
        ctx.plant,
        asset=asset,
        title=title,
        reasons=[reason],
        work_orders=[wo] if wo else [],
        user_id=ctx.user.id,
        source="manual",
        note=body.note,
        failure_code_id=wo.problem_code_id if wo else None,
        department_id=wo.department_id if wo else None,
    )
    return {"id": r.id, "number": r.number, "status": r.status}


# ---------------- detail ----------------
@router.get("/{rid}")
def detail(rid: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid)
    asset = db.get(Asset, r.asset_id)
    fc = db.get(FailureCode, r.failure_code_id) if r.failure_code_id else None
    wos = db.execute(
        select(WorkOrder, RCAWorkOrder)
        .join(RCAWorkOrder, RCAWorkOrder.work_order_id == WorkOrder.id)
        .where(RCAWorkOrder.rca_id == r.id)
        .order_by(WorkOrder.created_at)
    ).all()
    members = list(db.execute(select(RCAMember).where(RCAMember.rca_id == r.id)).scalars())
    actions = svc.open_actions(db, r)
    codes = {
        f.id: f"{f.code} {f.description}"
        for f in db.execute(
            select(FailureCode).where(
                FailureCode.id.in_({x for w, _ in wos for x in (w.problem_code_id, w.cause_code_id, w.remedy_code_id) if x})
            )
        ).scalars()
    }
    act_wos = {
        w.id: w
        for w in db.execute(select(WorkOrder).where(WorkOrder.id.in_({a.work_order_id for a in actions if a.work_order_id}))).scalars()
    }
    pms = {p.id: p for p in db.execute(select(PMPlan).where(PMPlan.id.in_({a.pm_plan_id for a in actions if a.pm_plan_id}))).scalars()}
    names = _names(
        db,
        {r.leader_id, r.decided_by_id, r.approved_by_id, r.closed_by_id, r.created_by_id}
        | {m.user_id for m in members}
        | {a.owner_id for a in actions}
        | {a.done_by_id for a in actions},
    )
    today = plant_today(ctx.plant)
    can_edit = _can_edit(db, ctx, r)
    return {
        "rca": {
            "id": r.id,
            "number": r.number,
            "title": r.title,
            "status": r.status,
            "source": r.source,
            "trigger_reasons": r.trigger_reasons or [],
            "request_note": r.request_note,
            "requested_by": names.get(r.created_by_id) if r.created_by_id else None,
            "created_at": r.created_at,
            "decided_by": names.get(r.decided_by_id) if r.decided_by_id else None,
            "decided_at": r.decided_at,
            "decision_note": r.decision_note,
            "leader_id": r.leader_id,
            "leader": names.get(r.leader_id) if r.leader_id else None,
            "started_at": r.started_at,
            "due_date": r.due_date,
            "overdue": bool(r.status == RCAStatus.INVESTIGATION and r.due_date and r.due_date < today),
            "problem": r.problem or {},
            "problem_statement": r.problem_statement,
            "timeline": r.timeline or [],
            "whys": r.whys or [],
            "fishbone": r.fishbone or [],
            "root_causes": r.root_causes or [],
            "analysis_summary": r.analysis_summary,
            "lessons_learned": r.lessons_learned,
            "failure_code_id": r.failure_code_id,
            "submitted_at": r.submitted_at,
            "approved_by": names.get(r.approved_by_id) if r.approved_by_id else None,
            "approved_at": r.approved_at,
            "review_note": r.review_note,
            "actions_done_at": r.actions_done_at,
            "effectiveness_due": r.effectiveness_due,
            "effectiveness_result": r.effectiveness_result,
            "effectiveness_note": r.effectiveness_note,
            "recurrence_count": r.recurrence_count,
            "closed_at": r.closed_at,
            "closed_by": names.get(r.closed_by_id) if r.closed_by_id else None,
        },
        "asset": {"id": asset.id, "code": asset.code, "name": asset.name, "criticality": asset.criticality, "location": asset.location}
        if asset
        else None,
        "failure_mode": {"id": fc.id, "code": fc.code, "description": fc.description} if fc else None,
        "work_orders": [
            {
                "id": w.id,
                "number": w.number,
                "title": w.title,
                "type": w.type,
                "status": w.status,
                "created_at": w.created_at,
                "actual_start": w.actual_start,
                "completed_at": w.completed_at,
                "downtime_hours": float(w.downtime_hours) if w.downtime_hours is not None else None,
                "production_loss_tons": float(w.production_loss_tons) if w.production_loss_tons is not None else None,
                "cost": round(w.actual_cost, 2),
                "currency": w.currency,
                "symptoms": w.symptoms,
                "findings": w.findings,
                "root_cause": w.root_cause,
                "corrective_action": w.corrective_action,
                "problem": codes.get(w.problem_code_id) if w.problem_code_id else None,
                "cause": codes.get(w.cause_code_id) if w.cause_code_id else None,
                "remedy": codes.get(w.remedy_code_id) if w.remedy_code_id else None,
                "safety_event": w.safety_event,
                "note": link.note,
            }
            for w, link in wos
        ],
        "totals": {
            "downtime_hours": round(sum(float(w.downtime_hours or 0) for w, _ in wos), 2),
            "production_loss_tons": round(sum(float(w.production_loss_tons or 0) for w, _ in wos), 2),
            "cost": round(sum(w.actual_cost for w, _ in wos), 2),
            "currency": ctx.plant.currency,
        },
        "team": [{"user_id": m.user_id, "name": names.get(m.user_id), "role_note": m.role_note} for m in members],
        "actions": [
            {
                "id": a.id,
                "seq": a.seq,
                "description": a.description,
                "kind": a.kind,
                "root_cause_ref": a.root_cause_ref,
                "owner_id": a.owner_id,
                "owner": names.get(a.owner_id) if a.owner_id else None,
                "due_date": a.due_date,
                "status": a.status,
                "overdue": bool(a.status not in svc.DONE_ACTION and a.due_date and a.due_date < today),
                "completion_note": a.completion_note,
                "done_at": a.done_at,
                "done_by": names.get(a.done_by_id) if a.done_by_id else None,
                "work_order": {"id": a.work_order_id, "number": act_wos[a.work_order_id].number, "status": act_wos[a.work_order_id].status}
                if a.work_order_id in act_wos
                else None,
                "pm_plan": {"id": a.pm_plan_id, "code": pms[a.pm_plan_id].code, "name": pms[a.pm_plan_id].name}
                if a.pm_plan_id in pms
                else None,
                "can_update": can_edit or a.owner_id == ctx.user.id,
            }
            for a in actions
        ],
        "me": {
            "can_edit": can_edit,
            "can_approve": ctx.has("rca.approve"),
            "is_leader": r.leader_id == ctx.user.id,
            "can_create_wo": ctx.has("wo.create"),
        },
    }


# ---------------- analysis ----------------
class Problem(BaseModel):
    what: str | None = Field(None, max_length=TEXT)
    where: str | None = Field(None, max_length=TEXT)
    when: str | None = Field(None, max_length=TEXT)
    who: str | None = Field(None, max_length=TEXT)
    which: str | None = Field(None, max_length=TEXT)
    how: str | None = Field(None, max_length=TEXT)


class TimelineItem(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    at: str | None = Field(None, max_length=40)
    text: str = Field(max_length=1000)


class Why(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    parent_id: str | None = Field(None, max_length=40)
    text: str = Field(max_length=1000)
    is_root: bool = False


class Bone(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    category: Literal["man", "machine", "method", "material", "measurement", "environment"]
    text: str = Field(max_length=500)
    status: Literal["possible", "verified", "ruled_out"] = "possible"


class RootCause(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    type: Literal["physical", "human", "latent"]
    text: str = Field(max_length=1000)


class AnalysisIn(In):
    title: str | None = Field(None, min_length=3, max_length=200)
    problem: Problem | None = None
    problem_statement: str | None = Field(None, max_length=TEXT)
    timeline: list[TimelineItem] | None = Field(None, max_length=100)
    whys: list[Why] | None = Field(None, max_length=100)
    fishbone: list[Bone] | None = Field(None, max_length=200)
    root_causes: list[RootCause] | None = Field(None, max_length=30)
    analysis_summary: str | None = Field(None, max_length=TEXT)
    lessons_learned: str | None = Field(None, max_length=TEXT)
    failure_code_id: uuid.UUID | None = None
    due_date: date | None = None


@router.patch("/{rid}")
def update_analysis(rid: uuid.UUID, body: AnalysisIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid, lock=True)
    _need_edit(db, ctx, r)
    data = body.model_dump(exclude_unset=True, mode="json")
    if "due_date" in data:
        if not ctx.has("rca.approve"):
            raise HTTPException(403, "Only the manager changes the analysis due date")
        if r.status != RCAStatus.INVESTIGATION or not data["due_date"]:
            raise DomainError("The analysis due date is set during the investigation", "invalid_state", 409)
    if set(data) - {"lessons_learned", "due_date"}:
        _editable_analysis(ctx, r)
    elif r.status not in ACTIVE_RCA_STATUSES:
        raise DomainError("This RCA is finished", "read_only", 409)
    if "whys" in data:
        ids = {w["id"] for w in data["whys"]}
        if any(w["parent_id"] and w["parent_id"] not in ids for w in data["whys"]):
            raise HTTPException(422, "A why points to a missing parent")
    if data.get("failure_code_id"):
        fc = db.get(FailureCode, body.failure_code_id)
        if fc is None or fc.plant_id != ctx.plant_id:
            raise HTTPException(422, "Unknown failure code")
    for k, v in data.items():
        setattr(r, k, date.fromisoformat(v) if k == "due_date" and v else v)
    audit(db, "rca.update", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data={"fields": sorted(data)})
    db.flush()
    return {"ok": True}


class Member(BaseModel):
    user_id: uuid.UUID
    role_note: str | None = Field(None, max_length=80)


class TeamIn(In):
    leader_id: uuid.UUID | None = None
    members: list[Member] = Field(default_factory=list, max_length=30)


@router.put("/{rid}/team")
def put_team(rid: uuid.UUID, body: TeamIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid, lock=True)
    if r.status not in ACTIVE_RCA_STATUSES or r.status == RCAStatus.CANDIDATE:
        raise DomainError("The team is set when the RCA starts", "invalid_state", 409)
    if not (ctx.has("rca.approve") or r.leader_id == ctx.user.id):
        raise HTTPException(403, "Only the manager or the RCA leader may change the team")
    if "leader_id" in body.model_fields_set and body.leader_id != r.leader_id:
        if not ctx.has("rca.approve"):
            raise HTTPException(403, "Only the manager changes the RCA leader")
        if body.leader_id is None:
            raise HTTPException(422, "An RCA needs a leader")
        svc.check_leader(db, ctx.plant, body.leader_id)
        r.leader_id = body.leader_id
        notify(
            db,
            ctx.plant_id,
            [body.leader_id],
            kind="rca",
            title=f"You lead RCA {r.number}",
            link=f"/rca/{r.id}",
            dedupe_key=f"rca-lead:{r.id}:{body.leader_id}",
        )
    before = svc.team_ids(db, r)
    svc.set_team(db, r, [m.user_id for m in body.members], {m.user_id: m.role_note for m in body.members})
    added = svc.team_ids(db, r) - before
    notify(db, ctx.plant_id, added, kind="rca", title=f"You are on RCA {r.number}", link=f"/rca/{r.id}", dedupe_key=f"rca-team:{r.id}")
    audit(db, "rca.team", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data=body.model_dump())
    return {"ok": True}


# ---------------- workflow ----------------
class StartIn(In):
    leader_id: uuid.UUID
    member_ids: list[uuid.UUID] = Field(default_factory=list, max_length=30)
    due_date: date | None = None
    note: str | None = Field(None, max_length=TEXT)


class NoteIn(In):
    note: str = Field(min_length=3, max_length=TEXT)


class OptNoteIn(In):
    note: str | None = Field(None, max_length=TEXT)


@router.post("/{rid}/start")
def start(
    rid: uuid.UUID, body: StartIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    if r.status == RCAStatus.INVESTIGATION and r.leader_id is None:  # started automatically: the manager names the leader
        svc.check_leader(db, ctx.plant, body.leader_id)
        r.leader_id = body.leader_id
        if body.due_date:
            r.due_date = body.due_date
        svc.set_team(db, r, body.member_ids)
        notify(
            db,
            ctx.plant_id,
            svc.team_ids(db, r),
            kind="rca",
            title=f"You are on RCA {r.number}",
            link=f"/rca/{r.id}",
            dedupe_key=f"rca-team:{r.id}",
        )
    else:
        svc.start(
            db,
            ctx.plant,
            r,
            user_id=ctx.user.id,
            leader_id=body.leader_id,
            member_ids=body.member_ids,
            due_date=body.due_date,
            note=body.note,
        )
    return {"status": r.status}


@router.post("/{rid}/not-required")
def not_required(
    rid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.decline(db, r, ctx.user.id, body.note)
    return {"status": r.status}


@router.post("/{rid}/submit")
def submit(rid: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid, lock=True)
    if not (r.leader_id == ctx.user.id or ctx.has("rca.approve")):
        raise HTTPException(403, "The RCA leader submits the analysis")
    svc.submit(db, r, ctx.user.id)
    return {"status": r.status}


@router.post("/{rid}/approve")
def approve(
    rid: uuid.UUID, body: OptNoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.approve(db, ctx.plant, r, ctx.user.id, body.note)
    return {"status": r.status}


@router.post("/{rid}/return")
def return_rca(
    rid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.return_to_team(db, r, ctx.user.id, body.note)
    return {"status": r.status}


@router.post("/{rid}/close")
def close(
    rid: uuid.UUID, body: OptNoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.close(db, ctx.plant, r, ctx.user.id, body.note)
    return {"status": r.status}


@router.post("/{rid}/reopen")
def reopen(
    rid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.reopen(db, ctx.plant, r, ctx.user.id, body.note)
    return {"status": r.status}


@router.post("/{rid}/cancel")
def cancel(
    rid: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require("rca.approve")), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    svc.cancel(db, r, ctx.user.id, body.note)
    return {"status": r.status}


# ---------------- linked work orders ----------------
class LinkIn(In):
    work_order_id: uuid.UUID


@router.post("/{rid}/work-orders")
def link_wo(rid: uuid.UUID, body: LinkIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid, lock=True)
    _need_edit(db, ctx, r)
    if r.status not in ACTIVE_RCA_STATUSES:
        raise DomainError("This RCA is finished", "read_only", 409)
    wo = db.get(WorkOrder, body.work_order_id)
    if wo is None or wo.plant_id != ctx.plant_id or not ctx.dept_ok(wo.department_id):
        raise HTTPException(404, "Work order not found")
    if not svc.link_work_order(db, r, wo, f"Added by {ctx.user.full_name}"):
        raise DomainError("This work order already belongs to an RCA", "duplicate", 409)
    audit(db, "rca.link", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data={"work_order": wo.number})
    return {"ok": True}


@router.delete("/{rid}/work-orders/{wo_id}", status_code=204)
def unlink_wo(rid: uuid.UUID, wo_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> None:
    r = _get(db, ctx, rid, lock=True)
    _need_edit(db, ctx, r)
    if r.status not in ACTIVE_RCA_STATUSES:
        raise DomainError("This RCA is finished", "read_only", 409)
    link = db.execute(select(RCAWorkOrder).where(RCAWorkOrder.rca_id == r.id, RCAWorkOrder.work_order_id == wo_id)).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Not linked")
    db.delete(link)
    audit(db, "rca.unlink", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data={"work_order": wo_id})


# ---------------- action plan ----------------
class ActionIn(In):
    description: str = Field(min_length=3, max_length=TEXT)
    kind: RCAActionKind = RCAActionKind.CORRECTIVE
    root_cause_ref: str | None = Field(None, max_length=40)
    owner_id: uuid.UUID | None = None
    due_date: date | None = None
    pm_plan_id: uuid.UUID | None = None


class ActionUpdate(In):
    description: str | None = Field(None, min_length=3, max_length=TEXT)
    kind: RCAActionKind | None = None
    root_cause_ref: str | None = Field(None, max_length=40)
    owner_id: uuid.UUID | None = None
    due_date: date | None = None
    pm_plan_id: uuid.UUID | None = None
    status: RCAActionStatus | None = None
    completion_note: str | None = Field(None, max_length=TEXT)


ACTION_STATES = (RCAStatus.INVESTIGATION, RCAStatus.AWAITING_APPROVAL, RCAStatus.ACTION_PLAN)


def _check_action_refs(db: Session, ctx: Ctx, r: RCA, data: dict) -> None:
    if data.get("owner_id"):
        ok = db.execute(
            select(Membership.id).where(
                Membership.user_id == data["owner_id"], Membership.plant_id == ctx.plant_id, Membership.is_active.is_(True)
            )
        ).first()
        if not ok:
            raise HTTPException(422, "The action owner must be a user of this plant")
    if data.get("pm_plan_id"):
        p = db.get(PMPlan, data["pm_plan_id"])
        if p is None or p.plant_id != ctx.plant_id:
            raise HTTPException(422, "PM plan not found")
    if data.get("root_cause_ref") and data["root_cause_ref"] not in {c.get("id") for c in r.root_causes or []}:
        raise HTTPException(422, "Unknown root cause")


def _action(db: Session, r: RCA, aid: uuid.UUID) -> RCAAction:
    a = db.get(RCAAction, aid)
    if a is None or a.rca_id != r.id:
        raise HTTPException(404, "Action not found")
    return a


@router.post("/{rid}/actions", status_code=201)
def add_action(rid: uuid.UUID, body: ActionIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    r = _get(db, ctx, rid, lock=True)
    _need_edit(db, ctx, r)
    if r.status not in ACTION_STATES:
        raise DomainError("Actions are planned during the investigation and the action plan", "invalid_state", 409)
    data = body.model_dump()
    _check_action_refs(db, ctx, r, data)
    seq = (db.execute(select(func.max(RCAAction.seq)).where(RCAAction.rca_id == r.id)).scalar() or 0) + 1
    a = RCAAction(plant_id=ctx.plant_id, rca_id=r.id, seq=seq, created_by_id=ctx.user.id, **data)
    db.add(a)
    db.flush()
    if a.owner_id and a.owner_id != ctx.user.id and r.status == RCAStatus.ACTION_PLAN:
        notify(
            db,
            ctx.plant_id,
            [a.owner_id],
            kind="rca",
            title=f"RCA {r.number}: new action for you",
            body=a.description[:200],
            link=f"/rca/{r.id}",
            dedupe_key=f"rca-act:{a.id}",
        )
    audit(db, "rca.action.add", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data=data)
    return {"id": a.id}


@router.patch("/{rid}/actions/{aid}")
def update_action(
    rid: uuid.UUID, aid: uuid.UUID, body: ActionUpdate, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")
) -> dict:
    r = _get(db, ctx, rid, lock=True)
    a = _action(db, r, aid)
    data = body.model_dump(exclude_unset=True)
    editor = _can_edit(db, ctx, r)
    if not editor and not (a.owner_id == ctx.user.id and set(data) <= {"status", "completion_note"}):
        raise HTTPException(403, "Only the action owner or the RCA team may update this action")
    if r.status not in ACTION_STATES:
        raise DomainError("This RCA is not in the action plan", "invalid_state", 409)
    _check_action_refs(db, ctx, r, data)
    new_status = data.pop("status", None)
    old_owner = a.owner_id
    for k, v in data.items():
        setattr(a, k, v)
    if new_status and new_status != a.status:
        if new_status == RCAActionStatus.CANCELLED and not (data.get("completion_note") or a.completion_note):
            raise HTTPException(422, "Give a reason to cancel the action")
        a.status = new_status
        if new_status == RCAActionStatus.DONE:
            a.done_at, a.done_by_id = utcnow(), ctx.user.id
        elif new_status in (RCAActionStatus.OPEN, RCAActionStatus.IN_PROGRESS):
            a.done_at = a.done_by_id = None
    audit(
        db,
        "rca.action.update",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="rca",
        entity_id=r.id,
        data={"action": a.id, **body.model_dump(exclude_unset=True)},
    )
    db.flush()
    if "owner_id" in data and a.owner_id and a.owner_id != ctx.user.id and r.status == RCAStatus.ACTION_PLAN:
        notify(
            db,
            ctx.plant_id,
            [a.owner_id],
            kind="rca",
            title=f"RCA {r.number}: action for you",
            body=a.description[:200],
            link=f"/rca/{r.id}",
            dedupe_key=f"rca-act:{a.id}:{old_owner}",
        )
    svc.check_actions_done(db, r)
    return {"ok": True, "rca_status": r.status}


@router.delete("/{rid}/actions/{aid}", status_code=204)
def delete_action(rid: uuid.UUID, aid: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> None:
    r = _get(db, ctx, rid, lock=True)
    _need_edit(db, ctx, r)
    a = _action(db, r, aid)
    if r.status != RCAStatus.INVESTIGATION:
        raise DomainError("After approval, cancel the action instead (with a reason)", "invalid_state", 409)
    db.delete(a)
    audit(db, "rca.action.delete", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="rca", entity_id=r.id, data={"action": aid})


@router.post("/{rid}/actions/{aid}/work-order", status_code=201)
def action_work_order(
    rid: uuid.UUID, aid: uuid.UUID, ctx: Ctx = Depends(require("wo.create")), db: Session = Depends(get_db, scope="function")
) -> dict:
    """Raise a work order for an action. Completing that work order finishes the action."""
    from app.services.workorders import create_work_order

    r = _get(db, ctx, rid, lock=True)
    a = _action(db, r, aid)
    if r.status not in ACTION_STATES or a.status in svc.DONE_ACTION:
        raise DomainError("The action is finished or the RCA is not in the action plan", "invalid_state", 409)
    if a.work_order_id:
        raise DomainError("This action already has a work order", "duplicate", 409)
    asset = db.get(Asset, r.asset_id)
    assert asset is not None
    containment = a.kind == RCAActionKind.CONTAINMENT
    wo = create_work_order(
        db,
        ctx.plant,
        asset=asset,
        type=WOType.CORRECTIVE if containment else WOType.IMPROVEMENT,
        title=f"{r.number}: {a.description}"[:200],
        user_id=ctx.user.id,
        priority=Priority.P2_HIGH if containment else Priority.P3_MEDIUM,
        description=f"Action {a.seq} of {r.number} ({a.kind.value}).\n{a.description}",
        due_date=a.due_date,
        status=WOStatus.TRIAGE,
    )
    a.work_order_id = wo.id
    if a.status == RCAActionStatus.OPEN:
        a.status = RCAActionStatus.IN_PROGRESS
    audit(
        db,
        "rca.action.wo",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="rca",
        entity_id=r.id,
        data={"action": a.id, "work_order": wo.number},
    )
    return {"id": wo.id, "number": wo.number}


@router.get("/{rid}/related")
def related(rid: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db, scope="function")) -> dict:
    """Help for the analysis: other breakdowns of this asset (last 12 months) that are not in any RCA, and the asset's PM plans."""
    r = _get(db, ctx, rid)
    since = utcnow() - timedelta(days=365)
    wos = db.execute(
        select(WorkOrder)
        .where(
            WorkOrder.plant_id == ctx.plant_id,
            WorkOrder.asset_id == r.asset_id,
            WorkOrder.type.in_([WOType.CORRECTIVE, WOType.EMERGENCY]),
            WorkOrder.created_at >= since,
            WorkOrder.id.not_in(select(RCAWorkOrder.work_order_id)),
        )
        .order_by(WorkOrder.created_at.desc())
        .limit(50)
    ).scalars()
    plans = db.execute(select(PMPlan).where(PMPlan.plant_id == ctx.plant_id, PMPlan.asset_id == r.asset_id).order_by(PMPlan.code)).scalars()
    return {
        "work_orders": [
            {
                "id": w.id,
                "number": w.number,
                "title": w.title,
                "status": w.status,
                "created_at": w.created_at,
                "downtime_hours": w.downtime_hours,
            }
            for w in wos
        ],
        "pm_plans": [{"id": p.id, "code": p.code, "name": p.name} for p in plans],
    }
