"""Weekly maintenance schedule (Sunday–Saturday): the optimiser's proposal, hand edits, and the two-step approval
(engineer: schedule.review, then maintenance manager: schedule.approve, which writes the assignments and planned dates)."""

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.core.errors import DomainError
from app.models.assets import Asset
from app.models.enums import RosterKind
from app.models.identity import User
from app.models.shifts import RosterEntry, ShiftDefinition
from app.models.weekly import ScheduleItem, StopWindow, WeeklySchedule
from app.models.workorders import WorkOrder
from app.schemas.common import In
from app.services import weekly as svc
from app.services.common import audit, plant_today

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _sched(db: Session, ctx: Ctx, sid: uuid.UUID) -> WeeklySchedule:
    s = db.get(WeeklySchedule, sid)
    if s is None or s.plant_id != ctx.plant_id:
        raise HTTPException(404, "Schedule not found")
    return s


def _name(db: Session, uid: uuid.UUID | None) -> str | None:
    u = db.get(User, uid) if uid else None
    return u.full_name if u else None


def view(db: Session, ctx: Ctx, week_start: date, n_days: int | None = None) -> dict:
    """The plan as the page shows it: people × days (roster and load), the placed and deferred work, and the warnings.
    A plan starts on any day and is 1–31 days long (its own length once proposed; else n_days, by default a week)."""
    s = svc.plan_at(db, ctx.plant_id, week_start)
    n = s.days if s else (n_days or 7)
    svc.check_days(n)
    days = [week_start + timedelta(days=i) for i in range(n)]
    chk = svc.check(db, ctx, s) if s else {"warnings": {}, "over_capacity": [], "week": None}
    week = chk["week"] or svc.load_week(db, ctx.plant_id, ZoneInfo(ctx.plant.timezone), week_start, date.min, Decimal(2), n)
    items = list(s.items) if s else []
    wos = {w.id: w for w in db.execute(select(WorkOrder).where(WorkOrder.id.in_([i.work_order_id for i in items]))).scalars()}
    assets = {a.id: a for a in db.execute(select(Asset).where(Asset.id.in_([w.asset_id for w in wos.values()]))).scalars()}
    people_ids = set(week.people) | {i.user_id for i in items if i.user_id}
    users = {u.id: u for u in db.execute(select(User).where(User.id.in_(people_ids))).scalars()}
    shifts = {sh.id: sh.code for sh in db.execute(select(ShiftDefinition).where(ShiftDefinition.plant_id == ctx.plant_id)).scalars()}
    roster = db.execute(
        select(RosterEntry).where(RosterEntry.user_id.in_(people_ids), RosterEntry.work_date >= days[0], RosterEntry.work_date <= days[-1])
    ).scalars()
    cal: dict[uuid.UUID, dict[str, dict]] = defaultdict(dict)
    for r in roster:
        at_work = r.kind in (RosterKind.WORK, RosterKind.OVERTIME, RosterKind.CALLOUT)
        p = week.people.get(r.user_id)
        day = p.days.get(r.work_date) if p else None
        cal[r.user_id][r.work_date.isoformat()] = {
            "kind": r.kind.value,
            "shift": shifts.get(r.shift_id) if r.shift_id else None,
            "regular": float(day.regular) if day and at_work else 0,
            "capacity": float(day.regular + day.overtime) if day and at_work else 0,
        }
    load: dict[tuple[uuid.UUID, str], float] = defaultdict(float)
    for i in items:
        if not i.deferred and i.user_id and i.work_date:
            load[(i.user_id, i.work_date.isoformat())] += float(i.hours)
    people = [
        {
            "user_id": u.id,
            "name": u.full_name,
            "trade": u.trade,
            "days": cal.get(u.id, {}),
            "load": {d.isoformat(): load.get((u.id, d.isoformat()), 0) for d in days},
        }
        for u in sorted(users.values(), key=lambda u: ((u.trade or "~").lower(), u.full_name))
    ]

    def wo_out(w: WorkOrder) -> dict:
        a = assets.get(w.asset_id)
        job = week.jobs.get(w.id)
        return {
            "id": w.id,
            "number": w.number,
            "title": w.title,
            "type": w.type.value,
            "status": w.status.value,
            "priority": w.priority.value,
            "asset": f"{a.code} · {a.name}" if a else None,
            "criticality": job.crit if job else (a.criticality.value if a and a.criticality else None),
            "due_date": job.due if job else w.due_date,
            "pm_deadline": job.pm_deadline if job else None,
            "hours": float(job.hours) if job and job.hours else None,
            "crew": job.crew if job else 1,
            "trade": job.trade if job else None,
            "safety": bool(w.requires_loto or w.requires_permit),
            "stop": w.requires_stop,
            "skills": [f"{sk.code} ≥ {r.min_level}" for r, sk in job.need] if job else [],
        }

    out_items = [
        {
            "id": i.id,
            "work_order": wo_out(wos[i.work_order_id]) if i.work_order_id in wos else None,
            "user_id": i.user_id,
            "work_date": i.work_date,
            "hours": float(i.hours),
            "overtime": i.overtime,
            "is_lead": i.is_lead,
            "deferred": i.deferred,
            "reason": i.reason,
            "reason_code": i.reason_code,
            "reason_params": i.reason_params or {},
            "pinned": i.pinned,
            "warnings": chk["warnings"].get(str(i.id), []),
        }
        for i in items
    ]
    sched = None
    if s:
        sched = {
            "id": s.id,
            "status": s.status,
            "days": s.days,
            "max_overtime_hours": float(s.max_overtime_hours),
            "proposed_at": s.proposed_at,
            "proposed_by": _name(db, s.created_by_id),
            "engineer_at": s.engineer_at,
            "engineer_by": _name(db, s.engineer_by_id),
            "manager_at": s.manager_at,
            "manager_by": _name(db, s.manager_by_id),
            "returned_comment": s.returned_comment,
            "stats": s.stats or {},
        }
    return {
        "week_start": week_start,
        "days": days,
        "today": plant_today(ctx.plant),
        "schedule": sched,
        "people": people,
        "items": out_items,
        "over_capacity": [{**o, "hours": float(o["hours"]), "capacity": float(o["capacity"])} for o in chk["over_capacity"]],
        "windows": windows_of(db, ctx, week_start, n),
        # other plans sharing a day with this period (a new plan here may not overlap them)
        "overlaps": [
            {"start": o.week_start, "days": o.days, "end": o.week_start + timedelta(days=o.days - 1), "status": o.status}
            for o in svc.overlapping(db, ctx.plant_id, week_start, n, s.id if s else None)
        ],
    }


def windows_of(db: Session, ctx: Ctx, week_start: date, n_days: int = 7) -> list[dict]:
    tz = ZoneInfo(ctx.plant.timezone)
    lo = datetime.combine(week_start, time(0), tzinfo=tz)
    rows = db.execute(
        select(StopWindow, Asset)
        .join(Asset, Asset.id == StopWindow.asset_id)
        .where(StopWindow.plant_id == ctx.plant_id, StopWindow.starts_at < lo + timedelta(days=n_days), StopWindow.ends_at > lo)
        .order_by(StopWindow.starts_at, Asset.code)
    ).all()
    return [
        {
            "id": w.id,
            "asset_id": a.id,
            "asset": f"{a.code} · {a.name}",
            "asset_code": a.code,
            "date": w.starts_at.astimezone(tz).date(),
            "starts_at": w.starts_at,
            "ends_at": w.ends_at,
            "start": w.starts_at.astimezone(tz).strftime("%H:%M"),
            "end": w.ends_at.astimezone(tz).strftime("%H:%M"),
            "hours": round((w.ends_at - w.starts_at).total_seconds() / 3600, 2),
            "note": w.note,
        }
        for w, a in rows
    ]


@router.get("/weeks/{week_start}")
def get_week(
    week_start: date, days: int | None = Query(None, ge=1, le=svc.MAX_DAYS), ctx: Ctx = Depends(require("wo.view")),
    db: Session = Depends(get_db, scope="function"),
) -> dict:  # fmt: skip
    return view(db, ctx, week_start, days)


class ProposeIn(In):
    max_overtime_hours: Decimal = Field(Decimal(2), ge=0, le=8)
    days: int | None = Field(None, ge=1, le=svc.MAX_DAYS)  # length of the plan; default: as it is, or a week


@router.post("/weeks/{week_start}/propose")
def propose(
    week_start: date, body: ProposeIn, ctx: Ctx = Depends(require("schedule.plan")), db: Session = Depends(get_db, scope="function")
) -> dict:
    s = svc.propose(db, ctx, week_start, body.max_overtime_hours, n_days=body.days)
    notify_reviewers(db, ctx, s)
    return view(db, ctx, week_start)


def notify_reviewers(db: Session, ctx: Ctx, s: WeeklySchedule) -> None:
    from app.services.notifications import notify, users_with_permission

    to = [u for u in users_with_permission(db, ctx.plant_id, "schedule.review") if u != ctx.user.id]
    notify(db, ctx.plant_id, to, kind="approval", title=f"Weekly schedule {s.week_start} proposed",
           body=f"{s.stats.get('scheduled', 0)} work orders scheduled, {s.stats.get('deferred', 0)} deferred",
           link=f"/schedule?week={s.week_start}", dedupe_key=f"schedule:{s.id}:proposed")  # fmt: skip


def _editable(s: WeeklySchedule) -> None:
    if s.status == "approved":
        raise DomainError("This week is approved; reopen it to change it", "schedule_approved", 409)


def _day_shift(db: Session, user_id: uuid.UUID, d: date) -> uuid.UUID | None:
    r = db.execute(select(RosterEntry).where(RosterEntry.user_id == user_id, RosterEntry.work_date == d)).scalar_one_or_none()
    return r.shift_id if r else None


def _in_week(s: WeeklySchedule, d: date) -> None:
    if not (s.week_start <= d <= s.week_start + timedelta(days=s.days - 1)):
        raise DomainError("The day is not in this plan", "not_in_week", 422)


class MoveIn(In):
    user_id: uuid.UUID | None = None
    work_date: date | None = None


@router.patch("/items/{item_id}")
def move_item(
    item_id: uuid.UUID, body: MoveIn, ctx: Ctx = Depends(require("schedule.plan")), db: Session = Depends(get_db, scope="function")
) -> dict:
    """Move one person's placement to another person and/or day. Moved placements are pinned (kept on a new proposal)."""
    it = db.get(ScheduleItem, item_id)
    s = _sched(db, ctx, it.schedule_id) if it else None
    if it is None or s is None or it.deferred:
        raise HTTPException(404, "Placement not found")
    _editable(s)
    if body.work_date:
        _in_week(s, body.work_date)
    new_user, new_day = body.user_id or it.user_id, body.work_date or it.work_date
    assert new_user and new_day
    if any(o.id != it.id and not o.deferred and o.work_order_id == it.work_order_id and o.user_id == new_user for o in s.items):
        raise DomainError("This person is already on that work order", "duplicate_person", 409)
    # the whole crew of a work order moves day together
    for o in s.items:
        if o.work_order_id == it.work_order_id and not o.deferred and body.work_date:
            o.work_date, o.shift_id, o.pinned = new_day, _day_shift(db, o.user_id, new_day) if o.user_id else None, True
    it.user_id, it.work_date, it.shift_id, it.pinned = new_user, new_day, _day_shift(db, new_user, new_day), True
    svc.edited(s)
    audit(db, "schedule.edit", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"item": str(it.id), "user": str(new_user), "day": str(new_day)})  # fmt: skip
    db.flush()
    return view(db, ctx, s.week_start)


class DeferIn(In):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/{sid}/work-orders/{wo_id}/defer")
def defer(
    sid: uuid.UUID, wo_id: uuid.UUID, body: DeferIn, ctx: Ctx = Depends(require("schedule.plan")),
    db: Session = Depends(get_db, scope="function"),
) -> dict:  # fmt: skip
    s = _sched(db, ctx, sid)
    _editable(s)
    mine = [i for i in s.items if i.work_order_id == wo_id]
    if not mine:
        raise HTTPException(404, "Work order is not in this week")
    for i in mine:
        s.items.remove(i)
    s.items.append(ScheduleItem(work_order_id=wo_id, deferred=True, reason=body.reason, pinned=True))
    svc.edited(s)
    audit(db, "schedule.defer", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"work_order": str(wo_id), "reason": body.reason})  # fmt: skip
    db.flush()
    return view(db, ctx, s.week_start)


class PlaceIn(In):
    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    work_date: date


@router.post("/{sid}/work-orders/{wo_id}/place")
def place(
    sid: uuid.UUID, wo_id: uuid.UUID, body: PlaceIn, ctx: Ctx = Depends(require("schedule.plan")),
    db: Session = Depends(get_db, scope="function"),
) -> dict:  # fmt: skip
    """Put a (deferred) work order on a day with the people chosen by hand; pinned. Rule breaks show as warnings."""
    s = _sched(db, ctx, sid)
    _editable(s)
    _in_week(s, body.work_date)
    w = db.get(WorkOrder, wo_id)
    if w is None or w.plant_id != ctx.plant_id:
        raise HTTPException(404, "Work order not found")
    week = svc.load_week(db, ctx.plant_id, ZoneInfo(ctx.plant.timezone), s.week_start, date.min, s.max_overtime_hours, s.days)
    job = week.jobs.get(wo_id)
    if job is None:
        raise DomainError("This work order is not open for scheduling this week", "not_schedulable", 409)
    if job.hours is None:
        raise DomainError("Enter the estimated hours of the work order first", "no_hours", 422)
    users = list(dict.fromkeys(body.user_ids))
    per = (job.hours / len(users)).quantize(Decimal("0.25"))
    for i in [i for i in s.items if i.work_order_id == wo_id]:
        s.items.remove(i)
    for n, uid in enumerate(users):
        s.items.append(ScheduleItem(work_order_id=wo_id, user_id=uid, work_date=body.work_date, shift_id=_day_shift(db, uid, body.work_date),
                                    hours=per, is_lead=n == 0, pinned=True))  # fmt: skip
    svc.edited(s)
    audit(db, "schedule.place", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"work_order": str(wo_id), "users": [str(u) for u in users], "day": str(body.work_date)})  # fmt: skip
    db.flush()
    return view(db, ctx, s.week_start)


@router.post("/{sid}/review")
def review(sid: uuid.UUID, ctx: Ctx = Depends(require("schedule.review")), db: Session = Depends(get_db, scope="function")) -> dict:
    s = _sched(db, ctx, sid)
    svc.review(db, ctx, s)
    db.flush()
    return view(db, ctx, s.week_start)


@router.post("/{sid}/approve")
def approve(sid: uuid.UUID, ctx: Ctx = Depends(require("schedule.approve")), db: Session = Depends(get_db, scope="function")) -> dict:
    s = _sched(db, ctx, sid)
    warnings = svc.approve(db, ctx, s)
    db.flush()
    return view(db, ctx, s.week_start) | {"apply_warnings": warnings}


class ReturnIn(In):
    comment: str = Field(min_length=3, max_length=1000)


@router.post("/{sid}/return")
def send_back(
    sid: uuid.UUID, body: ReturnIn, ctx: Ctx = Depends(require("schedule.review")), db: Session = Depends(get_db, scope="function")
) -> dict:
    s = _sched(db, ctx, sid)
    if s.status == "approved":
        raise DomainError("This week is approved; reopen it instead", "schedule_approved", 409)
    svc.send_back(db, ctx, s, body.comment)
    db.flush()
    return view(db, ctx, s.week_start)


@router.post("/{sid}/reopen")
def reopen(sid: uuid.UUID, ctx: Ctx = Depends(require("schedule.approve")), db: Session = Depends(get_db, scope="function")) -> dict:
    s = _sched(db, ctx, sid)
    svc.reopen(db, ctx, s)
    db.flush()
    return view(db, ctx, s.week_start)


# ---------------------------------------------------------------------------------------------------------------------
# Line stop windows: when each line is stopped for maintenance (entered by the planner, engineer or production manager)


class WindowIn(In):
    asset_id: uuid.UUID
    work_date: date
    start_time: time
    hours: Decimal = Field(gt=0, le=168)
    note: str | None = Field(None, max_length=300)


@router.post("/stop-windows", status_code=201)
def add_window(body: WindowIn, ctx: Ctx = Depends(require("stop_window.manage")), db: Session = Depends(get_db, scope="function")) -> dict:
    a = db.get(Asset, body.asset_id)
    if a is None or a.plant_id != ctx.plant_id:
        raise HTTPException(404, "Asset not found")
    start = datetime.combine(body.work_date, body.start_time, tzinfo=ZoneInfo(ctx.plant.timezone))
    w = StopWindow(plant_id=ctx.plant_id, asset_id=a.id, starts_at=start, ends_at=start + timedelta(hours=float(body.hours)),
                   note=body.note, created_by_id=ctx.user.id)  # fmt: skip
    db.add(w)
    db.flush()
    audit(db, "stop_window.add", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="stop_window", entity_id=w.id,
          data={"asset": a.code, "start": start.isoformat(), "hours": str(body.hours)})  # fmt: skip
    return {"id": w.id}


@router.delete("/stop-windows/{window_id}", status_code=204)
def delete_window(
    window_id: uuid.UUID, ctx: Ctx = Depends(require("stop_window.manage")), db: Session = Depends(get_db, scope="function")
) -> None:
    w = db.get(StopWindow, window_id)
    if w is None or w.plant_id != ctx.plant_id:
        raise HTTPException(404, "Stop window not found")
    audit(db, "stop_window.delete", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="stop_window", entity_id=w.id,
          data={"start": w.starts_at.isoformat()})  # fmt: skip
    db.delete(w)


class CopyIn(In):
    from_week: date  # first day of the period copied from
    to_week: date  # first day of the period copied to
    days: int = Field(7, ge=1, le=svc.MAX_DAYS)


@router.post("/stop-windows/copy")
def copy_windows(body: CopyIn, ctx: Ctx = Depends(require("stop_window.manage")), db: Session = Depends(get_db, scope="function")) -> dict:
    """Repeat one period's stop windows in another (same offset and time); windows already there are not doubled."""
    shift = timedelta(days=(body.to_week - body.from_week).days)
    have = {(w["asset_id"], w["starts_at"], w["ends_at"]) for w in windows_of(db, ctx, body.to_week, body.days)}
    n = 0
    for w in windows_of(db, ctx, body.from_week, body.days):
        key = (w["asset_id"], w["starts_at"] + shift, w["ends_at"] + shift)
        if key in have:
            continue
        db.add(
            StopWindow(
                plant_id=ctx.plant_id, asset_id=w["asset_id"], starts_at=key[1], ends_at=key[2], note=w["note"], created_by_id=ctx.user.id
            )
        )
        n += 1
    db.flush()
    audit(db, "stop_window.copy", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="stop_window", entity_id=None,
          data={"from": str(body.from_week), "to": str(body.to_week), "copied": n})  # fmt: skip
    return {"copied": n}
