"""Root cause analysis (RCA): which breakdowns need one, and the RCA workflow.

Rules (plant.settings["rca"], set in Administration › RCA rules) decide what a *major breakdown* is. They are checked
when a breakdown work order is completed or closed, and again if its downtime, loss or codes are corrected after
completion:

- downtime at or above a limit per asset criticality (A / B / C; blank = rule off for that class)
- the same failure mode (problem code) on the same asset N times within D days (repeated failure)
- selected failure modes that always need an RCA
- production loss (tons) or repair cost at or above a limit
- a safety / environment event recorded on the work order

A match makes an RCA *candidate* (or starts it at once when `auto_open` is on). The maintenance manager starts it
with a leader (an engineering position: permission rca.lead) and team, or marks it not required with a reason.

Workflow: candidate → investigation → awaiting approval → action plan → monitoring → closed (also not required /
cancelled). When the last action is finished the RCA enters the effectiveness check (default 90 days). A new
breakdown with the same failure mode on the asset during an open RCA is linked to it; during the check it reopens
the investigation (recurrence)."""

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models.assets import Asset, FailureCode
from app.models.enums import ACTIVE_RCA_STATUSES, RCAActionStatus, RCAStatus, WOStatus, WOType
from app.models.rca import RCA, RCAAction, RCAMember, RCAWorkOrder
from app.models.tenancy import Plant
from app.models.workorders import WorkOrder
from app.services.common import audit, next_number, plant_today, utcnow
from app.services.notifications import notify, notify_permission, users_with_permission

DEFAULT_RULES: dict[str, Any] = {
    "enabled": True,
    "auto_open": False,  # True: a match starts the RCA without waiting for the manager
    "wo_types": ["corrective", "emergency"],
    "downtime_hours": {"A": 2, "B": 3, "C": 5},  # per asset criticality; None = no downtime rule for that class
    "repeat_enabled": True,
    "repeat_count": 2,  # this many failures with the same failure mode on the same asset ...
    "repeat_days": 30,  # ... within this many days
    "failure_mode_ids": [],  # problem codes that always need an RCA
    "production_loss_tons": None,
    "cost": None,
    "safety_event": True,
    "analysis_days": 7,  # analysis due this many days after the RCA starts
    "effectiveness_days": 90,  # check period after the last action, before closing as effective
}

RULE_CODES = ("downtime", "repeat", "failure_mode", "production_loss", "cost", "safety", "manual")
DONE_ACTION = (RCAActionStatus.DONE, RCAActionStatus.CANCELLED)


def rules(plant: Plant) -> dict[str, Any]:
    saved = (plant.settings or {}).get("rca") or {}
    out = {**DEFAULT_RULES, **saved}
    out["downtime_hours"] = {**DEFAULT_RULES["downtime_hours"], **(saved.get("downtime_hours") or {})}
    return out


def save_rules(db: Session, plant: Plant, data: dict[str, Any], user_id: uuid.UUID) -> dict[str, Any]:
    settings = dict(plant.settings or {})
    settings["rca"] = {**rules(plant), **data}
    plant.settings = settings  # reassign so SQLAlchemy sees the JSONB change
    audit(db, "rca.rules", user_id=user_id, plant_id=plant.id, entity_type="plant", entity_id=plant.id, data=data)
    return rules(plant)


def _num(v: Any) -> float | None:
    return None if v is None else float(v)


def _fc_label(db: Session, fc_id: uuid.UUID | None) -> str | None:
    fc = db.get(FailureCode, fc_id) if fc_id else None
    return f"{fc.code} {fc.description}" if fc else None


def _prior_same_mode(db: Session, wo: WorkOrder, types: list[str], days: int) -> list[WorkOrder]:
    """Other breakdowns with the same failure mode on the same asset within `days` before this one."""
    end = wo.completed_at or utcnow()
    return list(
        db.execute(
            select(WorkOrder)
            .where(
                WorkOrder.plant_id == wo.plant_id,
                WorkOrder.asset_id == wo.asset_id,
                WorkOrder.id != wo.id,
                WorkOrder.problem_code_id == wo.problem_code_id,
                WorkOrder.type.in_([WOType(t) for t in types]),
                WorkOrder.status != WOStatus.CANCELLED,
                func.coalesce(WorkOrder.completed_at, WorkOrder.created_at) >= end - timedelta(days=days),
                func.coalesce(WorkOrder.completed_at, WorkOrder.created_at) <= end,
            )
            .order_by(WorkOrder.created_at)
        ).scalars()
    )


def match(db: Session, plant: Plant, wo: WorkOrder, asset: Asset) -> tuple[list[dict], list[WorkOrder]]:
    """Rules this work order meets, and earlier work orders that belong with it (repeated failure)."""
    r = rules(plant)
    reasons: list[dict] = []
    related: list[WorkOrder] = []
    limit = r["downtime_hours"].get(asset.criticality.value)
    if limit is not None and wo.downtime_hours is not None and float(wo.downtime_hours) >= float(limit):
        reasons.append(
            {"rule": "downtime", "value": float(wo.downtime_hours), "limit": float(limit), "criticality": asset.criticality.value}
        )
    if r["repeat_enabled"] and wo.problem_code_id:
        prior = _prior_same_mode(db, wo, r["wo_types"], int(r["repeat_days"]))
        if len(prior) + 1 >= int(r["repeat_count"]):
            reasons.append(
                {
                    "rule": "repeat",
                    "value": len(prior) + 1,
                    "limit": int(r["repeat_count"]),
                    "days": int(r["repeat_days"]),
                    "failure_mode": _fc_label(db, wo.problem_code_id),
                }
            )
            related = prior
    if wo.problem_code_id and str(wo.problem_code_id) in {str(x) for x in r["failure_mode_ids"]}:
        reasons.append({"rule": "failure_mode", "failure_mode": _fc_label(db, wo.problem_code_id)})
    tons = r["production_loss_tons"]
    if tons is not None and wo.production_loss_tons is not None and float(wo.production_loss_tons) >= float(tons):
        reasons.append({"rule": "production_loss", "value": float(wo.production_loss_tons), "limit": float(tons)})
    cost = r["cost"]
    if cost is not None and wo.actual_cost >= float(cost):
        reasons.append({"rule": "cost", "value": round(wo.actual_cost, 2), "limit": float(cost), "currency": wo.currency})
    if r["safety_event"] and wo.safety_event:
        reasons.append({"rule": "safety"})
    for x in reasons:
        x["work_order"] = wo.number
    return reasons, related


def _linked_rca(db: Session, wo_id: uuid.UUID) -> RCA | None:
    return db.execute(
        select(RCA).join(RCAWorkOrder, RCAWorkOrder.rca_id == RCA.id).where(RCAWorkOrder.work_order_id == wo_id)
    ).scalar_one_or_none()


def link_work_order(db: Session, rca: RCA, wo: WorkOrder, note: str | None = None) -> bool:
    if db.execute(select(RCAWorkOrder.id).where(RCAWorkOrder.work_order_id == wo.id)).first():
        return False
    db.add(RCAWorkOrder(rca_id=rca.id, work_order_id=wo.id, note=note, added_at=utcnow()))
    db.flush()
    return True


def team_ids(db: Session, rca: RCA) -> set[uuid.UUID]:
    ids = set(db.execute(select(RCAMember.user_id).where(RCAMember.rca_id == rca.id)).scalars())
    if rca.leader_id:
        ids.add(rca.leader_id)
    return ids


def _notify_approvers(db: Session, rca: RCA, title: str, key: str, body: str | None = None, email: bool = False) -> None:
    notify_permission(
        db,
        rca.plant_id,
        "rca.approve",
        department_id=rca.department_id,
        kind="rca",
        title=title,
        body=body,
        link=f"/rca/{rca.id}",
        dedupe_key=key,
        email=email,
    )


def _notify_team(db: Session, rca: RCA, title: str, key: str, body: str | None = None) -> None:
    notify(db, rca.plant_id, team_ids(db, rca), kind="rca", title=title, body=body, link=f"/rca/{rca.id}", dedupe_key=key)


def reason_text(x: dict) -> str:
    """Short English text of a trigger reason (notifications, Excel). The app shows translated texts."""
    rule = x.get("rule")
    if rule == "downtime":
        return f"Downtime {x['value']:g} h ≥ {x['limit']:g} h (criticality {x.get('criticality', '')})"
    if rule == "repeat":
        return f"Repeated failure: {x['value']}× {x.get('failure_mode') or ''} in {x['days']} days"
    if rule == "failure_mode":
        return f"Failure mode needs RCA: {x.get('failure_mode') or ''}"
    if rule == "production_loss":
        return f"Production loss {x['value']:g} t ≥ {x['limit']:g} t"
    if rule == "cost":
        return f"Cost {x['value']:,.0f} ≥ {x['limit']:,.0f} {x.get('currency', '')}"
    if rule == "safety":
        return "Safety / environment event"
    if rule == "manual":
        return f"Requested by {x.get('by') or 'user'}"
    return str(rule)


def create_candidate(
    db: Session,
    plant: Plant,
    *,
    asset: Asset,
    title: str,
    reasons: list[dict],
    work_orders: list[WorkOrder],
    user_id: uuid.UUID | None,
    source: str = "auto",
    note: str | None = None,
    failure_code_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
) -> RCA:
    rca = RCA(
        plant_id=plant.id,
        number=next_number(db, plant, "RCA"),
        title=title[:200],
        status=RCAStatus.CANDIDATE,
        source=source,
        asset_id=asset.id,
        department_id=department_id or asset.department_id,
        failure_code_id=failure_code_id,
        trigger_reasons=reasons,
        request_note=note,
        created_by_id=user_id,
        problem={},
        timeline=[],
        whys=[],
        fishbone=[],
        root_causes=[],
    )
    db.add(rca)
    db.flush()
    for w in work_orders:
        link_work_order(db, rca, w)
    audit(db, "rca.candidate", user_id=user_id, plant_id=plant.id, entity_type="rca", entity_id=rca.id, data={"reasons": reasons})
    if rules(plant)["auto_open"] and source == "auto":
        start(db, plant, rca, user_id=None, leader_id=None, member_ids=[], note="Started automatically (RCA rules)")
        _notify_approvers(
            db,
            rca,
            f"RCA started: {rca.number} {asset.code} – choose the leader",
            f"rca-start:{rca.id}",
            "; ".join(map(reason_text, reasons)),
        )
    else:
        _notify_approvers(
            db,
            rca,
            f"RCA proposed: {rca.number} {asset.code}",
            f"rca-candidate:{rca.id}",
            "; ".join(map(reason_text, reasons)),
            email=True,
        )
    return rca


def evaluate(db: Session, plant: Plant, wo: WorkOrder, user_id: uuid.UUID | None = None) -> RCA | None:
    """Check a completed / closed breakdown work order against the RCA rules. Idempotent: a work order is linked to
    at most one RCA, so checking it again (e.g. after the downtime is corrected) adds nothing twice."""
    _finish_linked_actions(db, wo, user_id)
    r = rules(plant)
    if not r["enabled"] or wo.source != "cmms" or wo.type.value not in r["wo_types"] or wo.status == WOStatus.CANCELLED:
        return None
    if _linked_rca(db, wo.id):
        return None
    asset = db.get(Asset, wo.asset_id)
    if asset is None:
        return None
    if wo.problem_code_id:
        existing = db.execute(
            select(RCA)
            .where(
                RCA.plant_id == plant.id,
                RCA.asset_id == asset.id,
                RCA.failure_code_id == wo.problem_code_id,
                RCA.status.in_(ACTIVE_RCA_STATUSES),
            )
            .order_by(RCA.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if existing:
            _same_failure_again(db, plant, existing, wo)
            return existing
    reasons, related = match(db, plant, wo, asset)
    if not reasons:
        return None
    related = [w for w in related if not _linked_rca(db, w.id)]
    mode = db.get(FailureCode, wo.problem_code_id) if wo.problem_code_id else None
    title = f"{asset.code} {asset.name} – {mode.description if mode else wo.title}"
    return create_candidate(
        db,
        plant,
        asset=asset,
        title=title,
        reasons=reasons,
        work_orders=[*related, wo],
        user_id=user_id,
        failure_code_id=wo.problem_code_id,
        department_id=wo.department_id,
    )


def _same_failure_again(db: Session, plant: Plant, rca: RCA, wo: WorkOrder) -> None:
    """The same failure mode failed again on the asset while an RCA is open: link it; during the effectiveness check
    it means the actions did not work, so the investigation reopens."""
    if rca.status in (RCAStatus.MONITORING, RCAStatus.ACTION_PLAN):
        link_work_order(
            db, rca, wo, "Recurrence after the RCA actions" if rca.status == RCAStatus.MONITORING else "Failed again during the actions"
        )
        rca.recurrence_count = (rca.recurrence_count or 0) + 1
        rca.last_recurrence_wo_id = wo.id
        if rca.status == RCAStatus.MONITORING:
            rca.status = RCAStatus.INVESTIGATION
            rca.effectiveness_due = None
            rca.actions_done_at = None
            rca.submitted_at = rca.approved_at = None
            rca.due_date = plant_today(plant) + timedelta(days=int(rules(plant)["analysis_days"]))
        title = f"RCA {rca.number}: failed again ({wo.number})"
        _notify_team(db, rca, title, f"rca-recur:{rca.id}:{wo.id}")
        _notify_approvers(db, rca, title, f"rca-recur:{rca.id}:{wo.id}", email=True)
        audit(db, "rca.recurrence", plant_id=plant.id, entity_type="rca", entity_id=rca.id, data={"work_order": wo.number})
    else:
        link_work_order(db, rca, wo, "Same failure mode")
        rca.trigger_reasons = [*(rca.trigger_reasons or []), {"rule": "repeat_linked", "work_order": wo.number}]
        _notify_team(db, rca, f"RCA {rca.number}: another failure linked ({wo.number})", f"rca-link:{rca.id}:{wo.id}")


def _finish_linked_actions(db: Session, wo: WorkOrder, user_id: uuid.UUID | None) -> None:
    """A work order raised from an RCA action finishes the action when the work is completed."""
    if wo.status not in (WOStatus.COMPLETED, WOStatus.CLOSED):
        return
    for a in db.execute(select(RCAAction).where(RCAAction.work_order_id == wo.id, RCAAction.status.not_in(DONE_ACTION))).scalars():
        a.status, a.done_at, a.done_by_id = RCAActionStatus.DONE, utcnow(), user_id
        a.completion_note = a.completion_note or f"Work order {wo.number} completed"
        rca = db.get(RCA, a.rca_id)
        if rca:
            db.flush()
            check_actions_done(db, rca)


# ---------------- workflow ----------------
def _require_status(rca: RCA, *allowed: RCAStatus) -> None:
    if rca.status not in allowed:
        raise DomainError(f"Not possible while the RCA is {rca.status.value}", "invalid_state", 409)


def check_leader(db: Session, plant: Plant, leader_id: uuid.UUID) -> None:
    if leader_id not in users_with_permission(db, plant.id, "rca.lead"):
        raise DomainError("The RCA leader must hold an engineering position (permission rca.lead)", "invalid_leader", 422)


def set_team(db: Session, rca: RCA, member_ids: list[uuid.UUID], notes: dict[uuid.UUID, str | None] | None = None) -> None:
    from app.models.identity import Membership

    valid = set(db.execute(select(Membership.user_id).where(Membership.plant_id == rca.plant_id, Membership.is_active.is_(True))).scalars())
    wanted = [m for m in dict.fromkeys(member_ids) if m != rca.leader_id]
    bad = [m for m in wanted if m not in valid]
    if bad:
        raise DomainError("Team members must be users of this plant", "invalid_member", 422)
    current = {m.user_id: m for m in db.execute(select(RCAMember).where(RCAMember.rca_id == rca.id)).scalars()}
    for uid, m in current.items():
        if uid not in wanted:
            db.delete(m)
    for uid in wanted:
        note = (notes or {}).get(uid)
        if uid in current:
            current[uid].role_note = note
        else:
            db.add(RCAMember(rca_id=rca.id, user_id=uid, role_note=note))
    db.flush()


def start(
    db: Session,
    plant: Plant,
    rca: RCA,
    *,
    user_id: uuid.UUID | None,
    leader_id: uuid.UUID | None,
    member_ids: list[uuid.UUID],
    due_date: date | None = None,
    note: str | None = None,
) -> None:
    _require_status(rca, RCAStatus.CANDIDATE)
    if leader_id:
        check_leader(db, plant, leader_id)
    rca.leader_id = leader_id
    rca.status = RCAStatus.INVESTIGATION
    rca.decided_by_id, rca.decided_at, rca.decision_note = user_id, utcnow(), note
    rca.started_at = utcnow()
    rca.due_date = due_date or plant_today(plant) + timedelta(days=int(rules(plant)["analysis_days"]))
    _prefill_problem(db, rca)
    set_team(db, rca, member_ids)
    audit(
        db, "rca.start", user_id=user_id, plant_id=plant.id, entity_type="rca", entity_id=rca.id, data={"leader": leader_id, "note": note}
    )
    _notify_team(db, rca, f"You are on RCA {rca.number}", f"rca-team:{rca.id}", f"{rca.title}. Analysis due {rca.due_date}.")


def _prefill_problem(db: Session, rca: RCA) -> None:
    """5W1H and timeline start from the linked work orders; the team corrects and completes them."""
    wos = list(
        db.execute(
            select(WorkOrder)
            .join(RCAWorkOrder, RCAWorkOrder.work_order_id == WorkOrder.id)
            .where(RCAWorkOrder.rca_id == rca.id)
            .order_by(WorkOrder.created_at)
        ).scalars()
    )
    asset = db.get(Asset, rca.asset_id)
    p = dict(rca.problem or {})
    if wos:
        last = wos[-1]
        mode = _fc_label(db, rca.failure_code_id)
        p.setdefault("what", " / ".join(x for x in (mode, last.symptoms or last.title) if x))
        p.setdefault("where", f"{asset.code} {asset.name}" + (f" ({asset.location})" if asset and asset.location else "") if asset else "")
        p.setdefault("when", ", ".join(f"{w.number}: {(w.actual_start or w.created_at):%Y-%m-%d %H:%M}" for w in wos))
        down = sum(float(w.downtime_hours or 0) for w in wos)
        loss = sum(float(w.production_loss_tons or 0) for w in wos)
        p.setdefault("which", f"{len(wos)} failure(s), downtime {down:g} h" + (f", production loss {loss:g} t" if loss else ""))
        p.setdefault("how", last.findings or last.description or "")
    rca.problem = p
    if not rca.timeline and wos:
        rca.timeline = [
            {"id": uuid.uuid4().hex[:8], "at": (w.actual_start or w.created_at).isoformat(), "text": f"{w.number} {w.title}"} for w in wos
        ]


def decline(db: Session, rca: RCA, user_id: uuid.UUID, note: str) -> None:
    _require_status(rca, RCAStatus.CANDIDATE)
    rca.status = RCAStatus.NOT_REQUIRED
    rca.decided_by_id, rca.decided_at, rca.decision_note = user_id, utcnow(), note
    audit(db, "rca.not_required", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"note": note})


def open_actions(db: Session, rca: RCA) -> list[RCAAction]:
    return list(db.execute(select(RCAAction).where(RCAAction.rca_id == rca.id).order_by(RCAAction.seq)).scalars())


def submit(db: Session, rca: RCA, user_id: uuid.UUID) -> None:
    _require_status(rca, RCAStatus.INVESTIGATION)
    missing = []
    if not (rca.problem_statement or (rca.problem or {}).get("what")):
        missing.append("problem description (5W1H)")
    if not any(w.get("is_root") and (w.get("text") or "").strip() for w in rca.whys or []):
        missing.append("5 Whys down to a root cause (mark the last why of the chain)")
    if not rca.root_causes:
        missing.append("at least one root cause")
    if not [a for a in open_actions(db, rca) if a.status != RCAActionStatus.CANCELLED]:
        missing.append("at least one action")
    if not rca.leader_id:
        missing.append("a leader")
    if missing:
        raise DomainError("Before submitting, add: " + ", ".join(missing), "incomplete", 409)
    rca.status, rca.submitted_at, rca.review_note = RCAStatus.AWAITING_APPROVAL, utcnow(), None
    audit(db, "rca.submit", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id)
    _notify_approvers(db, rca, f"RCA {rca.number} submitted for approval", f"rca-submit:{rca.id}:{rca.submitted_at.isoformat()}")


def approve(db: Session, plant: Plant, rca: RCA, user_id: uuid.UUID, note: str | None) -> None:
    _require_status(rca, RCAStatus.AWAITING_APPROVAL)
    rca.status, rca.approved_by_id, rca.approved_at, rca.review_note = RCAStatus.ACTION_PLAN, user_id, utcnow(), note
    audit(db, "rca.approve", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"note": note})
    owners = {a.owner_id for a in open_actions(db, rca) if a.owner_id and a.status not in DONE_ACTION}
    notify(
        db,
        rca.plant_id,
        owners,
        kind="rca",
        title=f"RCA {rca.number}: you have actions to do",
        link=f"/rca/{rca.id}",
        dedupe_key=f"rca-actions:{rca.id}",
    )
    _notify_team(db, rca, f"RCA {rca.number} approved", f"rca-approved:{rca.id}:{rca.approved_at.isoformat()}")
    check_actions_done(db, rca)


def return_to_team(db: Session, rca: RCA, user_id: uuid.UUID, note: str) -> None:
    _require_status(rca, RCAStatus.AWAITING_APPROVAL)
    rca.status, rca.review_note, rca.submitted_at = RCAStatus.INVESTIGATION, note, None
    audit(db, "rca.return", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"note": note})
    _notify_team(db, rca, f"RCA {rca.number} returned: {note[:80]}", f"rca-return:{rca.id}:{utcnow().isoformat()}")


def check_actions_done(db: Session, rca: RCA) -> None:
    """All actions finished during the action plan → effectiveness check starts."""
    if rca.status != RCAStatus.ACTION_PLAN:
        return
    acts = open_actions(db, rca)
    if not acts or any(a.status not in DONE_ACTION for a in acts) or not any(a.status == RCAActionStatus.DONE for a in acts):
        return
    plant = db.get(Plant, rca.plant_id)
    assert plant is not None
    rca.status, rca.actions_done_at = RCAStatus.MONITORING, utcnow()
    rca.effectiveness_due = plant_today(plant) + timedelta(days=int(rules(plant)["effectiveness_days"]))
    audit(db, "rca.monitoring", plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"until": rca.effectiveness_due})
    _notify_team(
        db,
        rca,
        f"RCA {rca.number}: all actions done, effectiveness check until {rca.effectiveness_due}",
        f"rca-mon:{rca.id}:{rca.actions_done_at.isoformat()}",
    )


def close(db: Session, plant: Plant, rca: RCA, user_id: uuid.UUID, note: str | None) -> None:
    _require_status(rca, RCAStatus.MONITORING)
    early = rca.effectiveness_due and plant_today(plant) < rca.effectiveness_due
    if early and not note:
        raise DomainError("The effectiveness check is still running: give a reason to close early", "reason_required", 422)
    rca.status, rca.closed_at, rca.closed_by_id = RCAStatus.CLOSED, utcnow(), user_id
    rca.effectiveness_result, rca.effectiveness_note = "effective", note
    audit(
        db,
        "rca.close",
        user_id=user_id,
        plant_id=rca.plant_id,
        entity_type="rca",
        entity_id=rca.id,
        data={"note": note, "early": bool(early)},
    )
    _notify_team(db, rca, f"RCA {rca.number} closed as effective", f"rca-closed:{rca.id}")


def reopen(db: Session, plant: Plant, rca: RCA, user_id: uuid.UUID, note: str) -> None:
    _require_status(rca, RCAStatus.MONITORING, RCAStatus.ACTION_PLAN, RCAStatus.CLOSED)
    if rca.status == RCAStatus.CLOSED:
        rca.effectiveness_result = "not_effective"
    rca.status = RCAStatus.INVESTIGATION
    rca.review_note = note
    rca.effectiveness_due = rca.actions_done_at = rca.closed_at = rca.submitted_at = rca.approved_at = None
    rca.due_date = plant_today(plant) + timedelta(days=int(rules(plant)["analysis_days"]))
    audit(db, "rca.reopen", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"note": note})
    _notify_team(db, rca, f"RCA {rca.number} reopened: {note[:80]}", f"rca-reopen:{rca.id}:{utcnow().isoformat()}")


def cancel(db: Session, rca: RCA, user_id: uuid.UUID, note: str) -> None:
    _require_status(rca, *ACTIVE_RCA_STATUSES)
    rca.status, rca.decision_note, rca.closed_at, rca.closed_by_id = RCAStatus.CANCELLED, note, utcnow(), user_id
    audit(db, "rca.cancel", user_id=user_id, plant_id=rca.plant_id, entity_type="rca", entity_id=rca.id, data={"note": note})


# ---------------- reminders (worker) ----------------
def run_reminders(db: Session, plant: Plant) -> dict:
    """Daily: overdue analyses and actions (reminded on the first overdue day, then weekly), effectiveness checks that
    have ended (recurrences found on the way reopen the RCA; otherwise the manager is told it can be closed)."""
    today = plant_today(plant)
    out = {"overdue_rcas": 0, "overdue_actions": 0, "ready_to_close": 0, "recurrences": 0}
    for rca in db.execute(
        select(RCA).where(RCA.plant_id == plant.id, RCA.status == RCAStatus.INVESTIGATION, RCA.due_date < today)
    ).scalars():
        week = (today - rca.due_date).days // 7 if rca.due_date else 0
        _notify_team(db, rca, f"RCA {rca.number} analysis overdue (due {rca.due_date})", f"rca-overdue:{rca.id}:{week}")
        _notify_approvers(db, rca, f"RCA {rca.number} analysis overdue (due {rca.due_date})", f"rca-overdue:{rca.id}:{week}")
        out["overdue_rcas"] += 1
    rows = db.execute(
        select(RCAAction, RCA)
        .join(RCA, RCA.id == RCAAction.rca_id)
        .where(
            RCA.plant_id == plant.id,
            RCA.status.in_([RCAStatus.INVESTIGATION, RCAStatus.AWAITING_APPROVAL, RCAStatus.ACTION_PLAN]),
            RCAAction.status.not_in(DONE_ACTION),
            RCAAction.due_date < today,
        )
    ).all()
    for a, rca in rows:
        week = (today - a.due_date).days // 7 if a.due_date else 0
        to = {x for x in (a.owner_id, rca.leader_id) if x}
        notify(
            db,
            plant.id,
            to,
            kind="rca",
            severity="warning",
            title=f"RCA {rca.number}: action overdue (due {a.due_date})",
            body=a.description[:200],
            link=f"/rca/{rca.id}",
            dedupe_key=f"rca-act-overdue:{a.id}:{week}",
        )
        out["overdue_actions"] += 1
    for rca in db.execute(select(RCA).where(RCA.plant_id == plant.id, RCA.status == RCAStatus.MONITORING)).scalars():
        if rca.failure_code_id and rca.actions_done_at:
            again = (
                db.execute(
                    select(WorkOrder).where(
                        WorkOrder.plant_id == plant.id,
                        WorkOrder.asset_id == rca.asset_id,
                        WorkOrder.problem_code_id == rca.failure_code_id,
                        WorkOrder.status.in_([WOStatus.COMPLETED, WOStatus.CLOSED]),
                        WorkOrder.completed_at > rca.actions_done_at,
                        WorkOrder.id.not_in(select(RCAWorkOrder.work_order_id)),
                    )
                )
                .scalars()
                .first()
            )
            if again:
                _same_failure_again(db, plant, rca, again)
                out["recurrences"] += 1
                continue
        if rca.effectiveness_due and rca.effectiveness_due <= today:
            _notify_approvers(db, rca, f"RCA {rca.number}: no recurrence in the check period – ready to close", f"rca-effective:{rca.id}")
            out["ready_to_close"] += 1
    return out


# ---------------- figures ----------------
def stats(db: Session, plant_id: uuid.UUID, start_d: date, end_d: date, dept_where: Any = None) -> dict:
    """RCA figures for a period (by the RCA's creation date) and the open situation now."""
    from zoneinfo import ZoneInfo

    plant = db.get(Plant, plant_id)
    assert plant is not None
    tz = ZoneInfo(plant.timezone)
    from datetime import datetime, time

    t0 = datetime.combine(start_d, time.min, tz)
    t1 = datetime.combine(end_d + timedelta(days=1), time.min, tz)
    base = select(RCA).where(RCA.plant_id == plant_id)
    if dept_where is not None:
        base = base.where(dept_where)
    period = list(db.execute(base.where(RCA.created_at >= t0, RCA.created_at < t1)).scalars())
    closed = list(db.execute(base.where(RCA.closed_at >= t0, RCA.closed_at < t1, RCA.status == RCAStatus.CLOSED)).scalars())
    active = list(db.execute(base.where(RCA.status.in_(ACTIVE_RCA_STATUSES))).scalars())
    today = plant_today(plant)
    act_rows = (
        db.execute(
            select(RCAAction)
            .join(RCA, RCA.id == RCAAction.rca_id)
            .where(RCA.id.in_([r.id for r in active]) if active else RCA.id.is_(None))
        )
        .scalars()
        .all()
    )
    days = [(r.closed_at - (r.started_at or r.created_at)).days for r in closed if r.closed_at]
    with_result = [r for r in db.execute(base.where(RCA.status.in_([RCAStatus.MONITORING, RCAStatus.CLOSED]))).scalars()]
    by_status: dict[str, int] = {}
    for r in active:
        by_status[r.status.value] = by_status.get(r.status.value, 0) + 1
    by_rule: dict[str, int] = {}
    for r in period:
        for x in r.trigger_reasons or []:
            if x.get("rule") in RULE_CODES:
                by_rule[x["rule"]] = by_rule.get(x["rule"], 0) + 1
    return {
        "opened": len(period),
        "started": len([r for r in period if r.status not in (RCAStatus.CANDIDATE, RCAStatus.NOT_REQUIRED)]),
        "not_required": len([r for r in period if r.status == RCAStatus.NOT_REQUIRED]),
        "closed": len(closed),
        "avg_days_to_close": round(sum(days) / len(days), 1) if days else None,
        "open_now": len(active),
        "candidates_now": by_status.get("candidate", 0),
        "overdue_analyses": len([r for r in active if r.status == RCAStatus.INVESTIGATION and r.due_date and r.due_date < today]),
        "actions_open": len([a for a in act_rows if a.status not in DONE_ACTION]),
        "actions_overdue": len([a for a in act_rows if a.status not in DONE_ACTION and a.due_date and a.due_date < today]),
        "recurrence_pct": round(100 * len([r for r in with_result if r.recurrence_count]) / len(with_result), 1) if with_result else None,
        "by_status": by_status,
        "by_rule": by_rule,
    }
