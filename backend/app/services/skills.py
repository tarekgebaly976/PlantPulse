"""Skill matrix rules: certificate status, whether a technician meets a work order's required skills, and copying a job
plan's skills to the work orders it generates."""

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import User
from app.models.skills import JobPlanSkill, SkillDefinition, TechnicianSkill, WORequiredSkill

EXPIRING_DAYS = 30


def cert_status(skill: SkillDefinition, ts: TechnicianSkill | None, on: date) -> str:
    """none: no such skill · valid · expiring (within 30 days) · expired · no_certificate (one is required but no date)."""
    if ts is None:
        return "none"
    if not skill.needs_certificate and ts.certified_until is None:
        return "valid"
    if ts.certified_until is None:
        return "no_certificate"
    if ts.certified_until < on:
        return "expired"
    if ts.certified_until <= on + timedelta(days=EXPIRING_DAYS):
        return "expiring"
    return "valid"


def required_skills(db: Session, wo_id: uuid.UUID) -> list[tuple[WORequiredSkill, SkillDefinition]]:
    return list(
        db.execute(
            select(WORequiredSkill, SkillDefinition)
            .join(SkillDefinition, SkillDefinition.id == WORequiredSkill.skill_id)
            .where(WORequiredSkill.work_order_id == wo_id)
            .order_by(SkillDefinition.code)
        ).all()
    )


def gap_codes(lacking: list[str]) -> list[str]:
    """The skill codes in the sentences gaps() returns ("certificate HV expired …" names it second, the others last)."""
    return sorted({g.split()[1] if g.startswith("certificate ") else g.split()[-1] for g in lacking})


def gaps(db: Session, wo_id: uuid.UUID, user: User, on: date) -> list[str]:
    """What the technician lacks for this work order on that day (empty = qualified). Plain sentences for the
    assignment warning, e.g. "no skill HYD", "level 1 < 2 for HYD", "certificate HV expired 2026-10-01"."""
    out: list[str] = []
    req = required_skills(db, wo_id)
    if not req:
        return out
    have = {
        t.skill_id: t
        for t in db.execute(
            select(TechnicianSkill).where(TechnicianSkill.user_id == user.id, TechnicianSkill.skill_id.in_([r.skill_id for r, _ in req]))
        ).scalars()
    }
    for r, sk in req:
        t = have.get(r.skill_id)
        if t is None:
            out.append(f"no skill {sk.code}")
            continue
        if t.level < r.min_level:
            out.append(f"level {t.level} < {r.min_level} for {sk.code}")
        st = cert_status(sk, t, on)
        if st == "expired":
            out.append(f"certificate {sk.code} expired {t.certified_until}")
        elif st == "no_certificate":
            out.append(f"no certificate date for {sk.code}")
    return out


def copy_from_job_plan(db: Session, job_plan_id: uuid.UUID, wo_id: uuid.UUID) -> None:
    for js in db.execute(select(JobPlanSkill).where(JobPlanSkill.job_plan_id == job_plan_id)).scalars():
        db.add(WORequiredSkill(work_order_id=wo_id, skill_id=js.skill_id, min_level=js.min_level))
