"""Skill matrix: the plant's skills, technicians' levels and certificates, and the skills a job plan / work order needs.
Everyone who sees shifts sees the matrix; the engineer and the maintenance manager keep it (skill.manage)."""

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Ctx, require
from app.api.routers.workorders import get_wo
from app.core.db import get_db
from app.models.identity import Membership, Role, User
from app.models.pm import JobPlan
from app.models.skills import JobPlanSkill, SkillDefinition, TechnicianSkill, WORequiredSkill
from app.schemas.common import ORM, In
from app.services import skills as svc
from app.services.common import audit, plant_today

router = APIRouter(tags=["skills"])

Category = Literal["equipment", "technique", "safety"]


class SkillIn(In):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    name_ar: str | None = Field(None, max_length=120)
    trade: str | None = Field(None, max_length=40)
    category: Category = "equipment"
    needs_certificate: bool = False


class SkillUpdate(In):
    name: str | None = Field(None, min_length=2, max_length=120)
    name_ar: str | None = Field(None, max_length=120)
    trade: str | None = Field(None, max_length=40)
    category: Category | None = None
    needs_certificate: bool | None = None
    is_active: bool | None = None


class SkillOut(ORM):
    id: uuid.UUID
    code: str
    name: str
    name_ar: str | None
    trade: str | None
    category: str
    needs_certificate: bool
    is_active: bool


def _skill(db: Session, ctx: Ctx, skill_id: uuid.UUID) -> SkillDefinition:
    s = db.get(SkillDefinition, skill_id)
    if s is None or s.plant_id != ctx.plant_id:
        raise HTTPException(404, "Skill not found")
    return s


@router.get("/skills", response_model=list[SkillOut])
def list_skills(
    active: bool = True, ctx: Ctx = Depends(require("shift.view")), db: Session = Depends(get_db, scope="function")
) -> list[SkillDefinition]:
    q = select(SkillDefinition).where(SkillDefinition.plant_id == ctx.plant_id)
    if active:
        q = q.where(SkillDefinition.is_active.is_(True))
    return list(db.execute(q.order_by(SkillDefinition.category, SkillDefinition.code)).scalars())


@router.post("/skills", response_model=SkillOut, status_code=201)
def create_skill(
    body: SkillIn, ctx: Ctx = Depends(require("skill.manage")), db: Session = Depends(get_db, scope="function")
) -> SkillDefinition:
    s = SkillDefinition(plant_id=ctx.plant_id, **{**body.model_dump(), "code": body.code.upper()})
    db.add(s)
    try:
        db.flush()
    except IntegrityError as e:
        raise HTTPException(409, "Skill code exists") from e
    audit(db, "skill.create", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="skill", entity_id=s.id, data={"code": s.code})
    return s


@router.patch("/skills/{skill_id}", response_model=SkillOut)
def update_skill(
    skill_id: uuid.UUID, body: SkillUpdate, ctx: Ctx = Depends(require("skill.manage")), db: Session = Depends(get_db, scope="function")
) -> SkillDefinition:
    s = _skill(db, ctx, skill_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    audit(
        db,
        "skill.update",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="skill",
        entity_id=s.id,
        data=body.model_dump(exclude_unset=True),
    )
    return s


@router.get("/skills/matrix")
def matrix(everyone: bool = False, ctx: Ctx = Depends(require("shift.view")), db: Session = Depends(get_db, scope="function")) -> dict:
    """People (technicians, supervisors and engineers; `everyone` = all active members) × active skills, with level and
    certificate status per cell, and per skill how many people hold it valid at level 2 or more (single points of failure)."""
    today = plant_today(ctx.plant)
    skills = list(
        db.execute(
            select(SkillDefinition)
            .where(SkillDefinition.plant_id == ctx.plant_id, SkillDefinition.is_active.is_(True))
            .order_by(SkillDefinition.category, SkillDefinition.code)
        ).scalars()
    )
    rows = db.execute(
        select(User, Role.code)
        .join(Membership, Membership.user_id == User.id)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.plant_id == ctx.plant_id, Membership.is_active.is_(True), User.is_active.is_(True))
        .order_by(User.full_name)
    ).all()
    field_roles = {"technician", "mech_supervisor", "elec_supervisor", "engineer", "reliability_engineer"}
    have = {
        (t.user_id, t.skill_id): t for t in db.execute(select(TechnicianSkill).where(TechnicianSkill.plant_id == ctx.plant_id)).scalars()
    }
    people = [
        {"user_id": u.id, "name": u.full_name, "trade": u.trade, "role": role}
        for u, role in rows
        if everyone or role in field_roles or any(k[0] == u.id for k in have)
    ]
    by_id = {s.id: s for s in skills}
    ids = {p["user_id"] for p in people}
    cells: list[dict] = []
    cover: dict[uuid.UUID, int] = {s.id: 0 for s in skills}
    for (uid, sid), t in have.items():
        sk = by_id.get(sid)
        if sk is None:
            continue
        st = svc.cert_status(sk, t, today)
        cells.append(
            {"user_id": uid, "skill_id": sid, "level": t.level, "certified_until": t.certified_until, "note": t.note, "status": st}
        )
        if uid in ids and t.level >= 2 and st in ("valid", "expiring"):
            cover[sid] += 1
    return {"skills": [SkillOut.model_validate(s).model_dump() for s in skills], "people": people, "cells": cells,
            "coverage": {str(k): v for k, v in cover.items()}, "today": today}  # fmt: skip


class CellIn(In):
    level: int = Field(ge=1, le=3)
    certified_until: date | None = None
    note: str | None = Field(None, max_length=500)


def _member(db: Session, ctx: Ctx, user_id: uuid.UUID) -> User:
    m = db.execute(
        select(Membership).where(Membership.user_id == user_id, Membership.plant_id == ctx.plant_id, Membership.is_active.is_(True))
    ).scalar_one_or_none()
    u = db.get(User, user_id)
    if m is None or u is None:
        raise HTTPException(404, "Not a member of this plant")
    return u


@router.put("/skills/matrix/{user_id}/{skill_id}")
def set_cell(
    user_id: uuid.UUID, skill_id: uuid.UUID, body: CellIn, ctx: Ctx = Depends(require("skill.manage")),
    db: Session = Depends(get_db, scope="function"),
) -> dict:  # fmt: skip
    _member(db, ctx, user_id)
    sk = _skill(db, ctx, skill_id)
    t = db.execute(
        select(TechnicianSkill).where(TechnicianSkill.user_id == user_id, TechnicianSkill.skill_id == skill_id)
    ).scalar_one_or_none()
    if t is None:
        t = TechnicianSkill(plant_id=ctx.plant_id, user_id=user_id, skill_id=skill_id)
        db.add(t)
    t.level, t.certified_until, t.note, t.assessed_by_id = body.level, body.certified_until, body.note, ctx.user.id
    db.flush()
    audit(db, "skill.assess", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="user", entity_id=user_id,
          data={"skill": sk.code, "level": body.level, "certified_until": str(body.certified_until) if body.certified_until else None})  # fmt: skip
    return {"status": svc.cert_status(sk, t, plant_today(ctx.plant))}


@router.delete("/skills/matrix/{user_id}/{skill_id}", status_code=204)
def clear_cell(
    user_id: uuid.UUID, skill_id: uuid.UUID, ctx: Ctx = Depends(require("skill.manage")), db: Session = Depends(get_db, scope="function")
) -> None:
    sk = _skill(db, ctx, skill_id)
    t = db.execute(
        select(TechnicianSkill).where(TechnicianSkill.user_id == user_id, TechnicianSkill.skill_id == skill_id)
    ).scalar_one_or_none()
    if t is not None:
        db.delete(t)
        audit(
            db, "skill.remove", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="user", entity_id=user_id, data={"skill": sk.code}
        )


class NeedIn(In):
    skill_id: uuid.UUID
    min_level: int = Field(1, ge=1, le=3)


class NeedsIn(In):
    skills: list[NeedIn] = Field(max_length=20)


def _needs_out(db: Session, rows: list) -> list[dict]:
    sk = (
        {s.id: s for s in db.execute(select(SkillDefinition).where(SkillDefinition.id.in_([r.skill_id for r in rows]))).scalars()}
        if rows
        else {}
    )
    return [{"skill_id": r.skill_id, "min_level": r.min_level, "code": sk[r.skill_id].code, "name": sk[r.skill_id].name,
             "name_ar": sk[r.skill_id].name_ar} for r in rows if r.skill_id in sk]  # fmt: skip


def _can_edit_needs(ctx: Ctx, perm: str) -> None:
    if not (ctx.has(perm) or ctx.has("skill.manage")):
        raise HTTPException(403, "Not allowed")


@router.get("/work-orders/{wo_id}/skills")
def wo_skills(wo_id: uuid.UUID, ctx: Ctx = Depends(require("wo.view")), db: Session = Depends(get_db, scope="function")) -> list[dict]:
    wo = get_wo(db, ctx, wo_id)
    return _needs_out(db, [r for r, _ in svc.required_skills(db, wo.id)])


@router.put("/work-orders/{wo_id}/skills")
def set_wo_skills(
    wo_id: uuid.UUID, body: NeedsIn, ctx: Ctx = Depends(require("wo.view")), db: Session = Depends(get_db, scope="function")
) -> list[dict]:
    _can_edit_needs(ctx, "wo.edit")
    wo = get_wo(db, ctx, wo_id)
    for n in body.skills:
        _skill(db, ctx, n.skill_id)
    for r in db.execute(select(WORequiredSkill).where(WORequiredSkill.work_order_id == wo.id)).scalars():
        db.delete(r)
    db.flush()
    rows = [
        WORequiredSkill(work_order_id=wo.id, skill_id=n.skill_id, min_level=n.min_level)
        for n in {n.skill_id: n for n in body.skills}.values()
    ]
    db.add_all(rows)
    db.flush()
    audit(db, "wo.skills", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="work_order", entity_id=wo.id,
          data={"skills": [str(r.skill_id) for r in rows]})  # fmt: skip
    return _needs_out(db, rows)


@router.get("/pm/job-plans/{jp_id}/skills")
def jp_skills(jp_id: uuid.UUID, ctx: Ctx = Depends(require("pm.view")), db: Session = Depends(get_db, scope="function")) -> list[dict]:
    jp = db.get(JobPlan, jp_id)
    if jp is None or jp.plant_id != ctx.plant_id:
        raise HTTPException(404, "Job plan not found")
    return _needs_out(db, list(db.execute(select(JobPlanSkill).where(JobPlanSkill.job_plan_id == jp.id)).scalars()))


@router.put("/pm/job-plans/{jp_id}/skills")
def set_jp_skills(
    jp_id: uuid.UUID, body: NeedsIn, ctx: Ctx = Depends(require("pm.view")), db: Session = Depends(get_db, scope="function")
) -> list[dict]:
    _can_edit_needs(ctx, "pm.manage")
    jp = db.get(JobPlan, jp_id)
    if jp is None or jp.plant_id != ctx.plant_id:
        raise HTTPException(404, "Job plan not found")
    for n in body.skills:
        _skill(db, ctx, n.skill_id)
    for r in db.execute(select(JobPlanSkill).where(JobPlanSkill.job_plan_id == jp.id)).scalars():
        db.delete(r)
    db.flush()
    rows = [
        JobPlanSkill(job_plan_id=jp.id, skill_id=n.skill_id, min_level=n.min_level) for n in {n.skill_id: n for n in body.skills}.values()
    ]
    db.add_all(rows)
    db.flush()
    audit(db, "jobplan.skills", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="job_plan", entity_id=jp.id,
          data={"skills": [str(r.skill_id) for r in rows]})  # fmt: skip
    return _needs_out(db, rows)
