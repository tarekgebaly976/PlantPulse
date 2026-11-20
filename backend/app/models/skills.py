"""Skill matrix: the plant's list of skills (equipment, technique, safety authorisation), each technician's level and
certificate expiry, and the skills a job plan or work order needs. Kept by the engineer (permission skill.manage)."""

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, PlantScoped, Timestamped, fk, uuid_pk

SKILL_CATEGORIES = ("equipment", "technique", "safety")
LEVELS = (1, 2, 3)  # 1 basic (under supervision), 2 independent, 3 expert (trains others)


class SkillDefinition(Base, PlantScoped, Timestamped):
    __tablename__ = "skill_definitions"
    __table_args__ = (
        UniqueConstraint("plant_id", "code"),
        CheckConstraint("category IN ('equipment','technique','safety')", name="ck_skill_category"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    name_ar: Mapped[str | None] = mapped_column(String(120))
    trade: Mapped[str | None] = mapped_column(String(40))  # mechanical / electrical / instrumentation / … (blank = any)
    category: Mapped[str] = mapped_column(String(12), default="equipment")
    needs_certificate: Mapped[bool] = mapped_column(Boolean, default=False)  # a certificate with an expiry date is required
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TechnicianSkill(Base, PlantScoped, Timestamped):
    __tablename__ = "technician_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_id"), CheckConstraint("level BETWEEN 1 AND 3", name="ck_tech_skill_level"))
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    skill_id: Mapped[uuid.UUID] = fk("skill_definitions.id", ondelete="CASCADE")
    level: Mapped[int] = mapped_column(Integer, default=1)
    certified_until: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    assessed_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, ondelete="SET NULL", index=False)


class JobPlanSkill(Base):
    """Skill a job plan needs; copied to the work orders the plan generates."""

    __tablename__ = "job_plan_skills"
    __table_args__ = (UniqueConstraint("job_plan_id", "skill_id"), CheckConstraint("min_level BETWEEN 1 AND 3", name="ck_jp_skill_level"))
    id: Mapped[uuid.UUID] = uuid_pk()
    job_plan_id: Mapped[uuid.UUID] = fk("job_plans.id", ondelete="CASCADE")
    skill_id: Mapped[uuid.UUID] = fk("skill_definitions.id", ondelete="CASCADE")
    min_level: Mapped[int] = mapped_column(Integer, default=1)


class WORequiredSkill(Base):
    __tablename__ = "wo_required_skills"
    __table_args__ = (UniqueConstraint("work_order_id", "skill_id"), CheckConstraint("min_level BETWEEN 1 AND 3", name="ck_wo_skill_level"))
    id: Mapped[uuid.UUID] = uuid_pk()
    work_order_id: Mapped[uuid.UUID] = fk("work_orders.id", ondelete="CASCADE")
    skill_id: Mapped[uuid.UUID] = fk("skill_definitions.id", ondelete="CASCADE")
    min_level: Mapped[int] = mapped_column(Integer, default=1)
