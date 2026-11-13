"""Field mode (no internet on the shop floor): everything a phone needs to scan any equipment QR label, show its card
and raise a work request without a connection. Downloaded once ("Prepare for offline") and refreshed when online;
requests written offline are sent later to POST /work-requests with their own client_ref (no duplicates)."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.core.db import get_db
from app.models.assets import Asset, FailureCode
from app.models.enums import FailureCodeKind
from app.models.tenancy import Department
from app.models.workorders import WorkOrder
from app.services.common import utcnow

router = APIRouter(prefix="/offline", tags=["offline"])

RECENT_PER_ASSET = 5
RECENT_DAYS = 365


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

    return {
        "generated_at": utcnow().isoformat(),
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
