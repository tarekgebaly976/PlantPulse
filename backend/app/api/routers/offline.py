"""Field mode (no internet on the shop floor): everything a phone needs to scan any equipment QR label, show its card
and raise a work request without a connection. Downloaded once ("Prepare for offline") and refreshed when online;
requests written offline are sent later to POST /work-requests with their own client_ref (no duplicates).

Phase 2: engineers and supervisors create work orders offline (POST /work-orders with client_ref), and whoever may
execute work carries it out offline: start, checklist and readings, labour, parts used, findings, hold or submit for
review. The phone sends each batch to POST /offline/work-orders/{id}/sync with its own reference. The server applies
each line on its own and checks it against what changed meanwhile (three-way: the value the phone saw when it
downloaded the work order, the phone's value, the value now on the server). A line changed by someone else in the
meantime is not overwritten: it comes back as a conflict for the user to decide (keep mine / keep theirs).
LOTO, permits, safety sign-off, approval, review and closing stay online on purpose."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.assets import Asset, FailureCode
from app.models.enums import FailureCodeKind, WOStatus, WOType
from app.models.identity import User
from app.models.inventory import Part, PartUsage
from app.models.tenancy import Department
from app.models.workorders import OfflineSync, WOAssignment, WOChecklistItem, WOComment, WOLabor, WorkOrder
from app.schemas.common import In
from app.services import part_usage as usage
from app.services import workorders as svc
from app.services.common import audit, plant_today, utcnow
from app.services.workflow import get_transition

router = APIRouter(prefix="/offline", tags=["offline"])

RECENT_PER_ASSET = 5
RECENT_DAYS = 365
MAX_FIELD_WOS = 150
MAX_PARTS = 5000
# Work orders a phone may carry out without internet (and emergencies still in triage, which may start at once).
FIELD_STATUSES = (WOStatus.APPROVED, WOStatus.PLANNED, WOStatus.SCHEDULED, WOStatus.IN_PROGRESS, WOStatus.ON_HOLD)
EXEC_FIELDS = ("findings", "recommendations", "root_cause", "corrective_action", "downtime_hours")


def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


@router.get("/catalog")
def catalog(ctx: Ctx = Depends(require("request.create")), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    """Equipment (only the caller's departments), symptoms and failure modes, and the last work orders per equipment.
    Keys are short on purpose: the whole plant fits in a few MB."""
    assets = list(
        db.execute(select(Asset).where(Asset.plant_id == ctx.plant_id, Asset.is_active.is_(True), ctx.in_department(Asset.id))).scalars()
    )
    # Equipment type of each asset: its own, else the nearest parent's (same rule as the failure-code list).
    all_types: dict[uuid.UUID, str | None] = dict(
        db.execute(select(Asset.id, Asset.equipment_type).where(Asset.plant_id == ctx.plant_id)).tuples().all()
    )

    def etype(a: Asset) -> str | None:
        if a.equipment_type:
            return a.equipment_type
        for x in reversed([p for p in a.path.strip("/").split("/") if p][:-1]):
            t = all_types.get(uuid.UUID(x))
            if t:
                return t
        return None

    depts = {
        d.id: d for d in db.execute(select(Department).where(Department.plant_id == ctx.plant_id, Department.is_active.is_(True))).scalars()
    }
    codes = db.execute(
        select(FailureCode)
        .where(
            FailureCode.plant_id == ctx.plant_id,
            FailureCode.is_active.is_(True),
            FailureCode.kind.in_([FailureCodeKind.SYMPTOM, FailureCodeKind.PROBLEM]),
        )
        .order_by(FailureCode.kind, FailureCode.code)
    ).scalars()

    ids = [a.id for a in assets]
    since = utcnow() - timedelta(days=RECENT_DAYS)
    rn = func.row_number().over(partition_by=WorkOrder.asset_id, order_by=WorkOrder.created_at.desc()).label("rn")
    sub = (
        select(WorkOrder.asset_id, WorkOrder.number, WorkOrder.title, WorkOrder.status, WorkOrder.type, WorkOrder.created_at, rn)
        .where(WorkOrder.plant_id == ctx.plant_id, WorkOrder.created_at >= since)
        .where(WorkOrder.asset_id.in_(ids) if ids else WorkOrder.asset_id.is_(None))
        .subquery()
    )
    recent: dict[str, list[dict[str, Any]]] = {}
    for aid, number, title, status, wtype, created, _ in db.execute(select(sub).where(sub.c.rn <= RECENT_PER_ASSET)):
        recent.setdefault(str(aid), []).append({"n": number, "t": title, "s": status.value, "y": wtype.value, "d": _iso(created)})

    out_wos: list[dict[str, Any]] = []
    parts: list[dict[str, Any]] = []
    if ctx.has("wo.execute"):
        out_wos = [_wo_snapshot(db, ctx, w) for w in _field_wos(db, ctx)]
        parts = [
            {"id": str(p.id), "c": p.code, "n": p.description, "u": p.uom}
            for p in db.execute(select(Part).where(Part.plant_id == ctx.plant_id).order_by(Part.code).limit(MAX_PARTS)).scalars()
        ]

    return {
        "generated_at": utcnow().isoformat(),
        "perms": {
            "request": ctx.has("request.create"),
            "create": ctx.has("wo.create"),
            "execute": ctx.has("wo.execute"),
            "assign": ctx.has("wo.assign"),
        },
        "wos": out_wos,
        "parts": parts,
        "plant": {"id": str(ctx.plant_id), "code": ctx.plant.code, "name": ctx.plant.name, "tz": ctx.plant.timezone},
        "user": {"id": str(ctx.user.id), "name": ctx.user.full_name, "locale": ctx.user.locale},
        "departments": [{"id": str(d.id), "c": d.code, "n": d.name} for d in depts.values()],
        "assets": [
            {
                "id": str(a.id),
                "c": a.code,
                "n": a.name,
                "na": a.name_ar,
                "p": str(a.parent_id) if a.parent_id else None,
                "d": str(a.department_id),
                "l": a.level.value,
                "k": a.criticality.value,
                "loc": a.location,
                "et": etype(a),
                "q": a.qr_token,
            }
            for a in assets
        ],
        "codes": [{"id": str(c.id), "k": c.kind.value, "c": c.code, "t": c.description, "et": c.equipment_type} for c in codes],
        "recent": recent,
    }


# ---------------- phase 2: work orders without internet ----------------
def _field_wos(db: Session, ctx: Ctx) -> list[WorkOrder]:
    """Assigned to me; for supervisors (wo.assign) also the active work of their departments."""
    active = or_(WorkOrder.status.in_(FIELD_STATUSES), (WorkOrder.status == WOStatus.TRIAGE) & (WorkOrder.type == WOType.EMERGENCY))
    mine = WorkOrder.id.in_(select(WOAssignment.work_order_id).where(WOAssignment.user_id == ctx.user.id))
    who = (
        or_(mine, WorkOrder.status.in_([WOStatus.IN_PROGRESS, WOStatus.ON_HOLD, WOStatus.SCHEDULED, WOStatus.TRIAGE]))
        if ctx.has("wo.assign")
        else mine
    )
    q = (
        select(WorkOrder)
        .where(WorkOrder.plant_id == ctx.plant_id, ctx.dept_where(WorkOrder.department_id), active, who)
        .order_by(WorkOrder.priority, WorkOrder.due_date.asc().nulls_last(), WorkOrder.number)
        .limit(MAX_FIELD_WOS)
    )
    return list(db.execute(q).scalars())


def _start_block(db: Session, ctx: Ctx, wo: WorkOrder) -> str | None:
    """Why this work cannot be started on the phone (None: it can, or it already runs)."""
    if wo.status in (WOStatus.IN_PROGRESS,):
        return None
    if (wo.requires_loto or wo.requires_permit) and not wo.safety_signed_at:
        return "safety"  # LOTO / permit sign-off is done on site with the supervisor, online
    if wo.requires_permit and wo.permit_valid_until and wo.permit_valid_until < utcnow():
        return "permit"
    if wo.status == WOStatus.TRIAGE and wo.type != WOType.EMERGENCY:
        return "approval"
    t = get_transition(db, ctx.plant_id, wo.status, WOStatus.IN_PROGRESS)
    if t is None:
        return "approval"
    if not ctx.has(t.permission):
        return "permission"
    return None


def _num(v: Decimal | float | None) -> float | None:
    return float(v) if v is not None else None


def _wo_snapshot(db: Session, ctx: Ctx, wo: WorkOrder) -> dict[str, Any]:
    """One work order as the phone keeps it. The values here are the "base" the phone compares against at sync."""
    a = db.get(Asset, wo.asset_id)
    items = db.execute(select(WOChecklistItem).where(WOChecklistItem.work_order_id == wo.id).order_by(WOChecklistItem.seq)).scalars().all()
    labor = db.execute(select(WOLabor).where(WOLabor.work_order_id == wo.id).order_by(WOLabor.work_date)).scalars().all()
    used = db.execute(
        select(PartUsage, Part)
        .outerjoin(Part, Part.id == PartUsage.part_id)
        .where(PartUsage.work_order_id == wo.id)
        .order_by(PartUsage.used_on)
    ).all()
    uids = {c.done_by_id for c in items if c.done_by_id} | {lab.user_id for lab in labor}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(uids))).tuples().all()) if uids else {}
    return {
        "id": str(wo.id),
        "n": wo.number,
        "t": wo.title,
        "ty": wo.type.value,
        "s": wo.status.value,
        "pr": wo.priority.value,
        "a": str(wo.asset_id),
        "ac": a.code if a else "",
        "an": a.name if a else "",
        "v": wo.version,
        "desc": wo.description,
        "sym": wo.symptoms,
        "safety": wo.safety_requirements,
        "loto": wo.requires_loto,
        "permit": wo.requires_permit,
        "signed": wo.safety_signed_at is not None,
        "test": wo.requires_testing,
        "due": wo.due_date.isoformat() if wo.due_date else None,
        "mine": any(x.user_id == ctx.user.id for x in wo.assignments),
        "sb": _start_block(db, ctx, wo),
        "f": {k: (_num(getattr(wo, k)) if k == "downtime_hours" else getattr(wo, k)) for k in EXEC_FIELDS},
        "cl": [
            {
                "id": str(c.id),
                "d": c.description,
                "k": c.kind.value,
                "req": c.is_required,
                "u": c.unit,
                "min": _num(c.min_value),
                "max": _num(c.max_value),
                "done": c.is_done,
                "ok": c.is_ok,
                "val": _num(c.reading_value),
                "rem": c.remark,
                "by": names.get(c.done_by_id) if c.done_by_id else None,
            }
            for c in items
        ],
        "lab": [
            {"d": lab.work_date.isoformat(), "h": float(lab.hours), "ot": lab.is_overtime, "who": names.get(lab.user_id), "no": lab.notes}
            for lab in labor
        ],
        "parts": [
            {"c": p.code if p else None, "n": p.description if p else u.description, "q": float(u.quantity), "u": u.uom} for u, p in used
        ],
        "at": utcnow().isoformat(),
    }


def _wo(db: Session, ctx: Ctx, wo_id: uuid.UUID, lock: bool = False) -> WorkOrder:
    q = select(WorkOrder).where(WorkOrder.id == wo_id, WorkOrder.plant_id == ctx.plant_id)
    if lock:
        q = q.with_for_update(key_share=True)
    wo = db.execute(q).scalar_one_or_none()
    if wo is None or not ctx.dept_ok(wo.department_id):
        raise HTTPException(404, "Work order not found")
    return wo


@router.get("/work-orders/{wo_id}")
def field_wo(wo_id: uuid.UUID, ctx: Ctx = Depends(require("wo.execute")), db: Session = Depends(get_db, scope="function")) -> dict:
    """The phone's fresh copy of one work order (after a sync, or a work order created offline)."""
    return _wo_snapshot(db, ctx, _wo(db, ctx, wo_id))


class CheckBase(In):
    done: bool = False
    val: float | None = None
    rem: str | None = None


class SyncCheck(In):
    id: uuid.UUID
    base: CheckBase  # as the phone saw it when the work order was downloaded
    is_done: bool = True
    is_ok: bool | None = None
    reading_value: float | None = None
    remark: str | None = Field(None, max_length=2000)
    at: datetime | None = None  # when it was done on the phone


class SyncField(In):
    name: Literal["findings", "recommendations", "root_cause", "corrective_action", "downtime_hours"]
    base: str | float | None = None
    value: str | float | None = None


class SyncLabor(In):
    work_date: date
    hours: float = Field(gt=0, le=24)
    is_overtime: bool = False
    notes: str | None = Field(None, max_length=2000)


class SyncPart(In):
    part_id: uuid.UUID | None = None
    description: str | None = Field(None, max_length=300)
    quantity: float = Field(gt=0)
    uom: str | None = Field(None, max_length=16)
    used_on: date | None = None
    note: str | None = Field(None, max_length=2000)


class SyncIn(In):
    client_ref: str = Field(min_length=8, max_length=40, pattern=r"^[A-Za-z0-9-]+$")
    written_at: datetime | None = None
    base_version: int | None = None
    start: bool = False
    checklist: list[SyncCheck] = Field(default_factory=list, max_length=500)
    fields: list[SyncField] = Field(default_factory=list, max_length=10)
    labor: list[SyncLabor] = Field(default_factory=list, max_length=50)
    parts: list[SyncPart] = Field(default_factory=list, max_length=100)
    comments: list[str] = Field(default_factory=list, max_length=20)
    finish: Literal["on_hold", "awaiting_review"] | None = None
    finish_comment: str | None = Field(None, max_length=2000)
    force: list[str] = Field(default_factory=list, max_length=600)  # keys the user decided to keep ("keep mine")


def _same(a: object, b: object) -> bool:
    if isinstance(a, int | float | Decimal) or isinstance(b, int | float | Decimal):
        try:
            return a is not None and b is not None and abs(float(a) - float(b)) < 1e-9  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return False
    return (a or None) == (b or None)  # "" and None are the same empty text


def _err(e: Exception) -> tuple[str, str]:
    if isinstance(e, DomainError):
        return e.code, e.message
    if isinstance(e, HTTPException):
        return f"http_{e.status_code}", str(e.detail)
    raise e


@router.post("/work-orders/{wo_id}/sync")
def sync_wo(
    wo_id: uuid.UUID, body: SyncIn, ctx: Ctx = Depends(require("wo.execute")), db: Session = Depends(get_db, scope="function")
) -> dict:
    """Apply one batch of offline work. Every line on its own: what can be applied is, the rest comes back as a
    conflict with the reason (and, for a value someone else changed meanwhile, their value)."""
    from app.api.routers.workorders import ChecklistUpdate, apply_checklist

    wo = _wo(db, ctx, wo_id, lock=True)  # one batch at a time per work order
    old = db.execute(
        select(OfflineSync).where(OfflineSync.plant_id == ctx.plant_id, OfflineSync.client_ref == body.client_ref)
    ).scalar_one_or_none()
    if old is not None:  # sent again after a lost answer
        if old.user_id != ctx.user.id or old.work_order_id != wo.id:
            raise HTTPException(409, "This reference belongs to another batch")
        return {**old.result, "repeat": True}

    from app.api.routers.workorders import _phone_time

    written = _phone_time(body.written_at)
    force = set(body.force)
    applied: list[str] = []
    conflicts: list[dict[str, Any]] = []
    changed_meanwhile = body.base_version is not None and body.base_version != wo.version

    def conflict(key: str, code: str, message: str, **extra: Any) -> None:
        conflicts.append({"key": key, "code": code, "message": message, **extra})

    def attempt(key: str, fn: Any) -> bool:
        try:
            with db.begin_nested():
                fn()
            applied.append(key)
            return True
        except (DomainError, HTTPException) as e:
            code, msg = _err(e)
            conflict(key, code, msg)
            return False

    everything = (
        (["start"] if body.start else [])
        + [f"check:{c.id}" for c in body.checklist]
        + [f"field:{f.name}" for f in body.fields]
        + [f"labor:{i}" for i in range(len(body.labor))]
        + [f"part:{i}" for i in range(len(body.parts))]
        + [f"comment:{i}" for i in range(len(body.comments))]
        + (["finish"] if body.finish else [])
    )
    stop: tuple[str, str] | None = None
    if wo.status in (WOStatus.COMPLETED, WOStatus.CLOSED, WOStatus.CANCELLED):
        stop = ("wo_finished", f"The work order is already {wo.status.value}")
    elif not (any(a.user_id == ctx.user.id for a in wo.assignments) or ctx.has("wo.assign")):
        stop = ("not_assigned", "You are no longer assigned to this work order")
    if stop:
        for k in everything:
            conflict(k, *stop)
    else:
        # 1. start (before anything that needs the work in progress)
        if body.start and wo.status != WOStatus.IN_PROGRESS:
            attempt("start", lambda: svc.change_status(db, ctx, wo, WOStatus.IN_PROGRESS, _note("Started", written)))
        elif body.start:
            applied.append("start")
        in_progress = wo.status in (WOStatus.IN_PROGRESS, WOStatus.ON_HOLD)

        # 2. checklist and readings: three-way check per line
        items = {i.id: i for i in db.execute(select(WOChecklistItem).where(WOChecklistItem.work_order_id == wo.id)).scalars()}
        for c in body.checklist:
            key = f"check:{c.id}"
            it = items.get(c.id)
            if it is None:
                conflict(key, "removed", "This checklist line was removed meanwhile")
                continue
            now_v = {"done": it.is_done, "val": _num(it.reading_value), "rem": it.remark}
            mine = {"done": c.is_done, "val": c.reading_value, "rem": c.remark}
            if all(_same(now_v[k], mine[k]) for k in now_v):
                applied.append(key)  # the server already has exactly this
                continue
            base = c.base.model_dump()
            if key not in force and not all(_same(now_v[k], base[k]) for k in now_v):
                who = db.get(User, it.done_by_id) if it.done_by_id else None
                conflict(
                    key,
                    "changed",
                    "Changed by someone else meanwhile",
                    label=it.description,
                    mine=mine,
                    theirs={**now_v, "by": who.full_name if who else None},
                )
                continue
            if not in_progress:
                conflict(key, "wo_not_in_progress", "Work must be in progress to record execution", label=it.description)
                continue
            upd = ChecklistUpdate(is_done=c.is_done, is_ok=c.is_ok, reading_value=c.reading_value, remark=c.remark)
            attempt(key, lambda it=it, upd=upd, at=c.at: apply_checklist(ctx, it, upd, _phone_time(at)))

        # 3. findings / corrective action / root cause / downtime: three-way check per field
        for f in body.fields:
            key = f"field:{f.name}"
            cur = getattr(wo, f.name)
            if _same(cur, f.value):
                applied.append(key)
                continue
            if key not in force and not _same(cur, f.base):
                conflict(
                    key,
                    "changed",
                    "Changed by someone else meanwhile",
                    label=f.name,
                    mine=f.value,
                    theirs=_num(cur) if f.name == "downtime_hours" else cur,
                )
                continue

            def set_field(f: SyncField = f) -> None:
                v: object = f.value
                if f.name == "downtime_hours":
                    try:
                        v = None if f.value in (None, "") else float(f.value)
                    except (TypeError, ValueError) as e:
                        raise DomainError("Downtime must be a number of hours", "invalid_number", 422) from e
                    if v is not None and v < 0:
                        raise DomainError("Downtime cannot be negative", "invalid_number", 422)
                elif isinstance(v, str):
                    v = v.strip() or None
                setattr(wo, f.name, v)
                db.flush()

            attempt(key, set_field)

        # 4. labour, parts and comments: added (sent twice = the whole batch is answered from the record)
        for i, lab in enumerate(body.labor):

            def add_lab(lab: SyncLabor = lab) -> None:
                if lab.work_date > plant_today(ctx.plant):
                    raise DomainError("Labor cannot be booked in the future", "future_date", 422)
                svc.add_labor(db, ctx, wo, ctx.user.id, lab.work_date, lab.hours, lab.is_overtime, _note(lab.notes, written, short=True))

            attempt(f"labor:{i}", add_lab)
        for i, pt in enumerate(body.parts):

            def add_part(pt: SyncPart = pt) -> None:
                part = None
                if pt.part_id:
                    part = db.get(Part, pt.part_id)
                    if part is None or part.plant_id != ctx.plant_id:
                        raise DomainError("Part not found", "part_not_found", 422)
                usage.record(
                    db,
                    ctx.plant,
                    wo,
                    ctx.user.id,
                    pt.quantity,
                    part=part,
                    description=pt.description,
                    uom=pt.uom,
                    used_on=pt.used_on,
                    note=pt.note,
                )
                db.flush()

            attempt(f"part:{i}", add_part)
        for i, text_ in enumerate(body.comments):

            def add_comment(text_: str = text_) -> None:
                if not text_.strip():
                    raise DomainError("Empty comment", "empty", 422)
                db.add(
                    WOComment(
                        work_order_id=wo.id,
                        user_id=ctx.user.id,
                        body=text_.strip()[:5000],
                        created_at=utcnow(),
                        data={"offline": True, "written_at": written.isoformat() if written else None},
                    )
                )
                db.flush()

            attempt(f"comment:{i}", add_comment)

        # 5. hold / submit for review, last, and only when nothing above conflicted
        if body.finish:
            if conflicts:
                conflict("finish", "held_back", "Not sent for review / put on hold because of the conflicts above")
            else:
                attempt("finish", lambda: svc.change_status(db, ctx, wo, WOStatus(body.finish), _note(body.finish_comment, written)))

    db.flush()
    db.refresh(wo)
    result = {
        "work_order": {"id": str(wo.id), "number": wo.number, "status": wo.status.value, "version": wo.version},
        "applied": applied,
        "conflicts": conflicts,
        "changed_meanwhile": changed_meanwhile,
        "snapshot": _wo_snapshot(db, ctx, wo),
    }
    db.add(
        OfflineSync(
            plant_id=ctx.plant_id,
            client_ref=body.client_ref,
            user_id=ctx.user.id,
            work_order_id=wo.id,
            written_at=written,
            result=result,
            created_at=utcnow(),
        )
    )
    audit(
        db,
        "wo.offline_sync",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="work_order",
        entity_id=wo.id,
        data={"ref": body.client_ref, "applied": len(applied), "conflicts": [c["key"] for c in conflicts]},
    )
    return result


def _note(text_: str | None, written: datetime | None, short: bool = False) -> str | None:
    """Text written offline carries when it was written (the server time is when it arrived)."""
    if not written:
        return text_
    tag = f"offline {written:%Y-%m-%d %H:%M} UTC"
    if short:
        return f"{text_} ({tag})" if text_ else f"({tag})"
    return f"{text_} ({tag})" if text_ else f"Recorded {tag}"
