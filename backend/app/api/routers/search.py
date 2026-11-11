"""One search box for the whole app (top bar): equipment, work orders, requests, spare parts, PM plans, lubrication and
condition-monitoring points, RCAs and shutdowns. Each group is shown only to users who may open that module, and only
for their departments; at most `limit` hits per group."""

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, get_ctx
from app.core.db import get_db
from app.models.assets import Asset
from app.models.inventory import Part
from app.models.lubrication import LubricationPoint
from app.models.pdm import MeasurementPoint
from app.models.pm import PMPlan
from app.models.rca import RCA
from app.models.shutdowns import Shutdown
from app.models.workorders import WorkOrder, WorkRequest
from app.services.search import fold, where_text, words

router = APIRouter(tags=["search"])


def _codes(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {a.id: f"{a.code} {a.name}" for a in db.execute(select(Asset).where(Asset.id.in_(ids))).scalars()}


@router.get("/search")
def search(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(6, ge=1, le=20),
    ctx: Ctx = Depends(get_ctx),
    db: Session = Depends(get_db, scope="function"),
) -> dict[str, Any]:
    if not words(q) or len(q.strip()) < 2:
        return {"q": q, "groups": []}
    pid = ctx.plant_id
    first = fold(words(q)[0])
    groups: list[dict[str, Any]] = []

    def exact_first(code_col: Any) -> Any:
        # an exact code (e.g. a scanned or typed WO number) comes first
        return case((code_col.ilike(first), 0), else_=1)

    def add(kind: str, items: list[dict[str, Any]]) -> None:
        if items:
            groups.append({"kind": kind, "items": items})

    if ctx.has("asset.view"):
        st = where_text(
            select(Asset).where(Asset.plant_id == pid, ctx.dept_where(Asset.department_id)),
            q, Asset.code, Asset.name, Asset.name_ar, Asset.serial_number, Asset.location, Asset.oem, Asset.model,
        )  # fmt: skip
        rows = db.execute(st.order_by(exact_first(Asset.code), Asset.path).limit(limit)).scalars().all()
        add(
            "asset",
            [
                {"id": a.id, "title": f"{a.code} — {a.name}", "sub": a.location, "status": a.criticality, "link": f"/assets/{a.id}"}
                for a in rows
            ],
        )
    if ctx.has("wo.view"):
        st = where_text(
            select(WorkOrder).where(WorkOrder.plant_id == pid, ctx.dept_where(WorkOrder.department_id)),
            q, WorkOrder.number, WorkOrder.title, WorkOrder.external_ref, asset_col=WorkOrder.asset_id, plant_id=pid,
        )  # fmt: skip
        rows = db.execute(st.order_by(exact_first(WorkOrder.number), WorkOrder.created_at.desc()).limit(limit)).scalars().all()
        names = _codes(db, {w.asset_id for w in rows})
        add(
            "work_order",
            [
                {
                    "id": w.id,
                    "title": f"{w.number} — {w.title}",
                    "sub": names.get(w.asset_id),
                    "status": w.status,
                    "link": f"/work-orders/{w.id}",
                }
                for w in rows
            ],
        )
        st = where_text(
            select(WorkRequest).where(WorkRequest.plant_id == pid, ctx.in_department(WorkRequest.asset_id)),
            q, WorkRequest.number, WorkRequest.title, WorkRequest.symptoms, asset_col=WorkRequest.asset_id, plant_id=pid,
        )  # fmt: skip
        rows_r = db.execute(st.order_by(exact_first(WorkRequest.number), WorkRequest.created_at.desc()).limit(limit)).scalars().all()
        names = _codes(db, {r.asset_id for r in rows_r})
        add(
            "request",
            [
                {
                    "id": r.id,
                    "title": f"{r.number} — {r.title}",
                    "sub": names.get(r.asset_id),
                    "status": r.status,
                    "link": f"/requests/{r.id}",
                }
                for r in rows_r
            ],
        )
    if ctx.has("inventory.view"):
        st = where_text(
            select(Part).where(Part.plant_id == pid),
            q, Part.code, Part.description, Part.description_ar, Part.oem_part_number, Part.manufacturer,
        )  # fmt: skip
        rows_p = db.execute(st.order_by(exact_first(Part.code), Part.code).limit(limit)).scalars().all()
        add(
            "part",
            [
                {
                    "id": p.id,
                    "title": f"{p.code} — {p.description}",
                    "sub": p.oem_part_number,
                    "status": None,
                    "link": f"/inventory/parts/{p.id}",
                }
                for p in rows_p
            ],
        )
    if ctx.has("pm.view"):
        st = where_text(
            select(PMPlan).where(PMPlan.plant_id == pid, ctx.in_department(PMPlan.asset_id), PMPlan.is_active.is_(True)),
            q, PMPlan.code, PMPlan.name, asset_col=PMPlan.asset_id, plant_id=pid,
        )  # fmt: skip
        rows_pm = db.execute(st.order_by(exact_first(PMPlan.code), PMPlan.code).limit(limit)).scalars().all()
        names = _codes(db, {p.asset_id for p in rows_pm})
        add(
            "pm_plan",
            [
                {
                    "id": p.id,
                    "title": f"{p.code} — {p.name}",
                    "sub": names.get(p.asset_id),
                    "status": None,
                    "link": f"/pm?plan={p.id}&q={p.code}",
                }
                for p in rows_pm
            ],
        )
    if ctx.has("lube.view"):
        st = where_text(
            select(LubricationPoint).where(LubricationPoint.plant_id == pid, ctx.in_department(LubricationPoint.asset_id)),
            q, LubricationPoint.code, LubricationPoint.component, LubricationPoint.location, asset_col=LubricationPoint.asset_id, plant_id=pid,
        )  # fmt: skip
        rows_l = db.execute(st.order_by(exact_first(LubricationPoint.code), LubricationPoint.code).limit(limit)).scalars().all()
        names = _codes(db, {p.asset_id for p in rows_l})
        add(
            "lube_point",
            [
                {
                    "id": p.id,
                    "title": f"{p.code} — {p.component or ''}",
                    "sub": names.get(p.asset_id),
                    "status": None,
                    "link": f"/lubrication?q={p.code}",
                }
                for p in rows_l
            ],
        )
    if ctx.has("pdm.view"):
        st = where_text(
            select(MeasurementPoint).where(MeasurementPoint.plant_id == pid, ctx.in_department(MeasurementPoint.asset_id), MeasurementPoint.is_active.is_(True)),
            q, MeasurementPoint.code, MeasurementPoint.name, asset_col=MeasurementPoint.asset_id, plant_id=pid,
        )  # fmt: skip
        rows_m = db.execute(st.order_by(exact_first(MeasurementPoint.code), MeasurementPoint.code).limit(limit)).scalars().all()
        names = _codes(db, {p.asset_id for p in rows_m})
        add(
            "pdm_point",
            [
                {
                    "id": p.id,
                    "title": f"{p.code} — {p.name}",
                    "sub": names.get(p.asset_id),
                    "status": p.last_status,
                    "link": f"/pdm?q={p.code}",
                }
                for p in rows_m
            ],
        )
    if ctx.has("rca.view"):
        st = where_text(
            select(RCA).where(RCA.plant_id == pid, ctx.dept_where(RCA.department_id)),
            q, RCA.number, RCA.title, asset_col=RCA.asset_id, plant_id=pid,
        )  # fmt: skip
        rows_c = db.execute(st.order_by(exact_first(RCA.number), RCA.created_at.desc()).limit(limit)).scalars().all()
        add(
            "rca",
            [{"id": r.id, "title": f"{r.number} — {r.title}", "sub": None, "status": r.status, "link": f"/rca/{r.id}"} for r in rows_c],
        )
    if ctx.has("shutdown.view"):
        st = where_text(select(Shutdown).where(Shutdown.plant_id == pid), q, Shutdown.code, Shutdown.name, Shutdown.scope)
        rows_s = db.execute(st.order_by(Shutdown.planned_start.desc()).limit(limit)).scalars().all()
        add(
            "shutdown",
            [{"id": s.id, "title": f"{s.code} — {s.name}", "sub": None, "status": s.status, "link": f"/shutdowns/{s.id}"} for s in rows_s],
        )
    return {"q": q, "groups": groups}
