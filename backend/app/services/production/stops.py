"""Stops of a production line (industry-independent): downtime events written by the production module, split
between responsible disciplines, classified by the plant's configured loss categories."""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assets import DowntimeEvent
from app.models.enums import OpEventType
from app.models.operations import OpDiscipline, OpStopPart
from app.models.production import OpLossCategory
from app.services.production.periods import f, hours

TOL_H = 0.02  # hours


def stops_of(db: Session, report_ids: list[uuid.UUID]) -> list[DowntimeEvent]:
    if not report_ids:
        return []
    return list(
        db.execute(select(DowntimeEvent).where(DowntimeEvent.op_report_id.in_(report_ids)).order_by(DowntimeEvent.started_at)).scalars()
    )


def parts_of(db: Session, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[OpStopPart]]:
    out: dict[uuid.UUID, list[OpStopPart]] = defaultdict(list)
    if event_ids:
        for p in db.execute(select(OpStopPart).where(OpStopPart.downtime_event_id.in_(event_ids))).scalars():
            out[p.downtime_event_id].append(p)
    return out


def classify(event_type: str, disciplines: list[OpDiscipline], category: OpLossCategory | None = None) -> tuple[bool, bool]:
    """(is_failure, is_planned) of a stop for the maintenance KPIs: a breakdown (or a stop whose loss category is
    marked "equipment failure") is an equipment failure when a maintenance discipline is responsible; process stops
    and other interruptions are not failures (they would wreck MTBF)."""
    planned = event_type == OpEventType.PLANNED or bool(category and category.planned)
    breakdown = event_type == OpEventType.BREAKDOWN or bool(category and category.failure)
    failure = breakdown and not planned and any(d.maintenance for d in disciplines)
    return failure, planned


def categories(db: Session, plant_id: uuid.UUID) -> dict[uuid.UUID, OpLossCategory]:
    return {c.id: c for c in db.execute(select(OpLossCategory).where(OpLossCategory.plant_id == plant_id)).scalars()}


def default_category(db: Session, plant_id: uuid.UUID, event_type: str) -> OpLossCategory | None:
    """The first active top-level loss category recorded as this event type (used when a report profile records the
    type, e.g. the paper mill's sheet breaks, and nobody chose a category)."""
    return db.execute(
        select(OpLossCategory)
        .where(OpLossCategory.plant_id == plant_id, OpLossCategory.event_type == event_type, OpLossCategory.is_active.is_(True))
        .order_by(OpLossCategory.parent_id.is_not(None), OpLossCategory.sort, OpLossCategory.code)
        .limit(1)
    ).scalar_one_or_none()


def loss_tables(db: Session, events: list[DowntimeEvent]) -> dict:
    """Stop hours and counts by loss category (code; "none" when not classified), by KPI factor the loss reduces,
    and the equipment failures among them."""
    cats = categories(db, events[0].plant_id) if events else {}
    by_code: dict[str, float] = defaultdict(float)
    n_by_code: dict[str, int] = defaultdict(int)
    by_factor: dict[str, float] = defaultdict(float)
    failure_h = 0.0
    failures = 0
    for e in events:
        h = hours(e.started_at, e.ended_at)
        c = cats.get(e.loss_category_id) if e.loss_category_id else None
        code = c.code if c else "none"
        by_code[code] += h
        n_by_code[code] += 1
        if c and c.parent_id and c.parent_id in cats:  # sub-category: also counts for its parent
            by_code[cats[c.parent_id].code] += h
            n_by_code[cats[c.parent_id].code] += 1
        by_factor[c.affects if c else "availability"] += h
        if e.is_failure:
            failure_h += h
            failures += 1
    return {
        "hours_by_code": {k: round(v, 3) for k, v in by_code.items()},
        "count_by_code": dict(n_by_code),
        "hours_by_factor": {k: round(v, 3) for k, v in by_factor.items()},
        "failure_hours": round(failure_h, 3),
        "failures": failures,
        "stops": len(events),
    }


def discipline_hours(events: list[DowntimeEvent], parts: dict[uuid.UUID, list[OpStopPart]]) -> dict[str, float]:
    """Stop hours by responsible discipline (id; "none" when nobody was named), planned stops left out."""
    out: dict[str, float] = defaultdict(float)
    for e in events:
        if e.is_planned:
            continue
        ps = parts.get(e.id, [])
        if ps:
            for p in ps:
                out[str(p.discipline_id)] += f(p.hours)
        else:
            out["none"] += hours(e.started_at, e.ended_at)
    return {k: round(v, 3) for k, v in out.items()}
