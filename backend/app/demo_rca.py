"""Sample root cause analyses for the DEMO plant, built from its own breakdown history: one closed as effective, one in
the action plan, one under investigation and one waiting for the manager's decision. SAMPLE data only.

Run on a demo that is already loaded: `python -m app.cli demo-rca` (does nothing if the plant already has RCAs)."""

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assets import Asset, FailureCode
from app.models.enums import RCAActionKind, RCAActionStatus, RCAStatus, WOStatus, WOType
from app.models.identity import User
from app.models.rca import RCA, RCAAction, RCAMember, RCAWorkOrder
from app.models.tenancy import Organization, Plant
from app.models.workorders import WorkOrder
from app.services.common import next_number, plant_today
from app.services.rca import match


def _id() -> str:
    return uuid.uuid4().hex[:8]


def _analysis(asset: Asset, mode: str, wo: WorkOrder) -> dict:
    w1, w2, w3, w4, w5 = (_id() for _ in range(5))
    rc1, rc2, rc3 = _id(), _id(), _id()
    return {
        "problem": {
            "what": f"{mode}: {wo.title}",
            "where": f"{asset.code} {asset.name}",
            "when": f"{wo.number}, {(wo.actual_start or wo.created_at):%Y-%m-%d %H:%M}, night shift, full load",
            "who": "Found by the operator (abnormal noise), repaired by the mechanical shift team",
            "which": f"Line stopped {float(wo.downtime_hours or 0):g} h; second failure of this kind this year",
            "how": "Noise and heat for about two days, then a trip. The part was found worn out far before its normal life.",
        },
        "problem_statement": f"{asset.code} stopped for {float(wo.downtime_hours or 0):g} h because of {mode.lower()}; the part failed long before its expected life.",
        "whys": [
            {"id": w1, "parent_id": None, "text": f"The {mode.lower()} stopped the machine", "is_root": False},
            {"id": w2, "parent_id": w1, "text": "The part wore out much faster than its normal life", "is_root": False},
            {"id": w3, "parent_id": w2, "text": "Early signs (noise, temperature) were not acted on", "is_root": False},
            {"id": w4, "parent_id": w3, "text": "The PM checklist has no condition check for this part", "is_root": True},
            {"id": w5, "parent_id": w2, "text": "Operators did not report the abnormal noise at once", "is_root": True},
        ],
        "fishbone": [
            {"id": _id(), "category": "man", "text": "Abnormal noise not reported by the shift", "status": "verified"},
            {"id": _id(), "category": "machine", "text": "Part at end of life, alignment out", "status": "verified"},
            {"id": _id(), "category": "method", "text": "PM checklist misses a condition check", "status": "verified"},
            {"id": _id(), "category": "material", "text": "Spare from a new supplier", "status": "ruled_out"},
            {"id": _id(), "category": "measurement", "text": "No vibration / temperature reading on this asset", "status": "verified"},
            {"id": _id(), "category": "environment", "text": "Dust and heat in the area", "status": "possible"},
        ],
        "root_causes": [
            {"id": rc1, "type": "physical", "text": "Worn part running misaligned"},
            {"id": rc2, "type": "human", "text": "Abnormal noise was not reported or stopped for"},
            {"id": rc3, "type": "latent", "text": "PM plan written from the manual only: no condition check, no failure-history review"},
        ],
        "summary": "The failure was predictable: the part gave warning signs for two days. The PM plan did not check its condition and the shift did not report the noise.",
        "actions": [
            (RCAActionKind.CONTAINMENT, "Daily noise / temperature check by the operators until the fix is in", rc1),
            (RCAActionKind.CORRECTIVE, "Add vibration and temperature readings to the PM plan of this asset (every 2 weeks)", rc3),
            (RCAActionKind.CORRECTIVE, "Toolbox talk: report abnormal noise at once and stop the machine if needed", rc2),
            (RCAActionKind.PREVENTIVE, "Apply the same condition check to the similar machines on the other lines", rc3),
        ],
    }


def add_demo_rcas(db: Session, plant: Plant) -> dict:
    if db.execute(select(func.count()).select_from(RCA).where(RCA.plant_id == plant.id)).scalar_one():
        return {"skipped": "the plant already has RCAs"}
    tz = ZoneInfo(plant.timezone)
    today = plant_today(plant)

    def at(d: date, h: int = 9) -> datetime:
        return datetime.combine(d, time(h), tzinfo=tz)

    users = {u.email.split("@")[0]: u for u in db.execute(select(User).where(User.email.like("%@demo.example.com"))).scalars()}
    manager, eng = users.get("manager"), users.get("engineer") or users.get("reliability")
    if not manager or not eng:
        return {"skipped": "demo users not found"}
    team = [u for u in (users.get("tech1"), users.get("mech.sup"), users.get("production")) if u]
    wos = list(
        db.execute(
            select(WorkOrder)
            .where(
                WorkOrder.plant_id == plant.id,
                WorkOrder.type.in_([WOType.EMERGENCY, WOType.CORRECTIVE]),
                WorkOrder.status.in_([WOStatus.CLOSED, WOStatus.COMPLETED]),
                WorkOrder.problem_code_id.is_not(None),
                WorkOrder.downtime_hours.is_not(None),
            )
            .order_by(WorkOrder.downtime_hours.desc())
        ).scalars()
    )
    used_assets: set[uuid.UUID] = set()
    picks: list[WorkOrder] = []
    for w in wos:
        if w.asset_id not in used_assets:
            picks.append(w)
            used_assets.add(w.asset_id)
    if not picks:
        return {"skipped": "no breakdown history with failure codes"}
    # The biggest breakdowns, by date: the oldest is closed, the newest waits for the decision.
    picks = sorted(picks[:8], key=lambda w: w.created_at)
    plans: list[tuple[str, WorkOrder]] = [("closed", picks[0])]
    for state, k in (("candidate", -1), ("investigation", -2), ("action_plan", -3)):
        if len(picks) >= -k + 1:
            plans.append((state, picks[k]))
    made = {}
    for state, wo in plans:
        asset = db.get(Asset, wo.asset_id)
        assert asset is not None
        fc = db.get(FailureCode, wo.problem_code_id)
        mode = fc.description if fc else wo.title
        reasons, related = match(db, plant, wo, asset)
        if not reasons:
            reasons = [
                {
                    "rule": "downtime",
                    "value": float(wo.downtime_hours or 0),
                    "limit": float(wo.downtime_hours or 0),
                    "criticality": asset.criticality.value,
                }
            ]
        for x in reasons:
            x["work_order"] = wo.number
        done = (wo.completed_at or wo.created_at).astimezone(tz).date()
        rca = RCA(
            plant_id=plant.id,
            number=next_number(db, plant, "RCA"),
            title=f"{asset.code} {asset.name} – {mode}"[:200],
            status=RCAStatus.CANDIDATE,
            source="auto",
            asset_id=asset.id,
            department_id=wo.department_id,
            failure_code_id=wo.problem_code_id,
            trigger_reasons=reasons,
            problem={},
            timeline=[],
            whys=[],
            fishbone=[],
            root_causes=[],
            created_at=at(done, 10),
        )
        db.add(rca)
        db.flush()
        for w in [*[r for r in related if r.id != wo.id], wo]:
            if not db.execute(select(RCAWorkOrder.id).where(RCAWorkOrder.work_order_id == w.id)).first():
                db.add(RCAWorkOrder(rca_id=rca.id, work_order_id=w.id, added_at=at(done, 10)))
        made[state] = rca.number
        if state == "candidate":
            continue
        a = _analysis(asset, mode, wo)
        start = done + timedelta(days=1)
        rca.status = RCAStatus.INVESTIGATION
        rca.leader_id, rca.decided_by_id, rca.decided_at = eng.id, manager.id, at(start, 8)
        rca.decision_note = "Major breakdown: RCA required"
        rca.started_at, rca.due_date = at(start, 8), start + timedelta(days=7)
        rca.problem = a["problem"]
        rca.timeline = [
            {"id": _id(), "at": (wo.actual_start or wo.created_at).isoformat(), "text": f"{wo.number}: {wo.title}"},
            {"id": _id(), "at": (wo.completed_at or wo.created_at).isoformat(), "text": "Repaired and back in service"},
        ]
        for u in team:
            db.add(RCAMember(rca_id=rca.id, user_id=u.id, role_note="Production" if u.email.startswith("production") else None))
        if state == "investigation":
            rca.due_date = max(start + timedelta(days=7), today + timedelta(days=4))  # extended by the manager
            rca.whys = a["whys"][:3]
            rca.fishbone = a["fishbone"][:3]
            continue
        rca.problem_statement = a["problem_statement"]
        rca.whys, rca.fishbone, rca.root_causes = a["whys"], a["fishbone"], a["root_causes"]
        rca.analysis_summary = a["summary"]
        rca.submitted_at = at(start + timedelta(days=5), 14)
        rca.approved_by_id, rca.approved_at = manager.id, at(start + timedelta(days=6), 9)
        rca.status = RCAStatus.ACTION_PLAN
        owners = [users.get("tech1"), eng, users.get("mech.sup"), users.get("reliability") or eng]
        for i, (kind, text, ref) in enumerate(a["actions"], start=1):
            owner = owners[i - 1] or eng
            due = start + timedelta(days=(2 if kind == RCAActionKind.CONTAINMENT else 14 + 7 * i))
            st = RCAActionStatus.OPEN
            if state == "closed" or i <= 2:
                st = RCAActionStatus.DONE
            elif i == 3:
                st = RCAActionStatus.IN_PROGRESS
            act = RCAAction(
                plant_id=plant.id, rca_id=rca.id, seq=i, description=text, kind=kind, root_cause_ref=ref, owner_id=owner.id,
                due_date=due, status=st, created_by_id=eng.id,
            )  # fmt: skip
            if st == RCAActionStatus.DONE:
                act.done_at, act.done_by_id = at(min(due, today), 15), owner.id
                act.completion_note = "Done and checked on site"
            db.add(act)
        if state == "closed":
            finished = start + timedelta(days=40)
            rca.actions_done_at = at(finished, 15)
            rca.effectiveness_due = finished + timedelta(days=90)
            rca.lessons_learned = "Review the failure history when writing PM plans; condition checks catch this failure weeks earlier."
            if rca.effectiveness_due <= today:
                rca.status = RCAStatus.CLOSED
                rca.closed_by_id, rca.closed_at = manager.id, at(rca.effectiveness_due, 10)
                rca.effectiveness_result, rca.effectiveness_note = "effective", "No repeat of this failure mode in the check period"
            else:
                rca.status = RCAStatus.MONITORING
    db.flush()
    return {"created": made}


def run_for_demo() -> str:
    from app.core.db import SessionLocal

    with SessionLocal() as db, db.begin():
        org = db.execute(select(Organization).where(Organization.code == "DEMO")).scalar_one_or_none()
        if org is None:
            return "No DEMO organization"
        plants = list(db.execute(select(Plant).where(Plant.organization_id == org.id)).scalars())
        return "; ".join(f"{p.code}: {add_demo_rcas(db, p)}" for p in plants)
