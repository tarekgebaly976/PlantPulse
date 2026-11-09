"""Root cause analysis (RCA) of major breakdowns.

A completed breakdown work order is checked against the plant's RCA rules (long downtime by asset criticality,
repeated failure mode on the same asset, selected failure modes, production loss, cost, safety / environment
event). A match makes an RCA *candidate*; the maintenance manager starts it or marks it not required. The team
then records the problem (5W1H), the 5 Whys, a fishbone (6M) and the root causes, and plans actions. After the
actions the RCA waits an effectiveness period; the same failure mode on the asset reopens it."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Attributed, Base, PlantScoped, Timestamped, enum_col, fk, uuid_pk
from app.models.enums import RCAActionKind, RCAActionStatus, RCAStatus


class RCA(Base, PlantScoped, Timestamped, Attributed):
    __tablename__ = "rcas"
    __table_args__ = (UniqueConstraint("plant_id", "number"), Index("ix_rca_plant_status", "plant_id", "status"))
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[RCAStatus] = enum_col(RCAStatus, ck_name="rca_status", default=RCAStatus.CANDIDATE)
    source: Mapped[str] = mapped_column(String(10), default="auto")  # auto (a rule matched) | manual (someone asked)
    asset_id: Mapped[uuid.UUID] = fk("assets.id")
    department_id: Mapped[uuid.UUID] = fk("departments.id")
    failure_code_id: Mapped[uuid.UUID | None] = fk("failure_codes.id", nullable=True)  # failure mode (problem code)
    # [{"rule": "downtime", "value": 6.5, "limit": 3, "work_order": "WO-..."}, ...]
    trigger_reasons: Mapped[list] = mapped_column(JSONB, default=list)
    request_note: Mapped[str | None] = mapped_column(Text)
    decided_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    leader_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[date | None] = mapped_column(Date)  # analysis due (started + plant's analysis days)

    # Analysis. Small structured documents edited as a whole by the team, so JSONB.
    problem: Mapped[dict] = mapped_column(JSONB, default=dict)  # 5W1H: what, where, when, who, which, how
    problem_statement: Mapped[str | None] = mapped_column(Text)
    timeline: Mapped[list] = mapped_column(JSONB, default=list)  # [{"id", "at", "text"}]
    whys: Mapped[list] = mapped_column(JSONB, default=list)  # [{"id", "parent_id", "text", "is_root"}] (branches allowed)
    fishbone: Mapped[list] = mapped_column(JSONB, default=list)  # [{"id", "category", "text", "status"}]
    root_causes: Mapped[list] = mapped_column(JSONB, default=list)  # [{"id", "type": physical|human|latent, "text"}]
    analysis_summary: Mapped[str | None] = mapped_column(Text)
    lessons_learned: Mapped[str | None] = mapped_column(Text)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)  # manager's note when returning the analysis
    actions_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    effectiveness_due: Mapped[date | None] = mapped_column(Date)
    effectiveness_result: Mapped[str | None] = mapped_column(String(20))  # effective | not_effective
    effectiveness_note: Mapped[str | None] = mapped_column(Text)
    recurrence_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_recurrence_wo_id: Mapped[uuid.UUID | None] = fk("work_orders.id", nullable=True, index=False)
    closed_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RCAWorkOrder(Base):
    """Breakdown work orders analysed by an RCA. A work order belongs to at most one RCA."""

    __tablename__ = "rca_work_orders"
    __table_args__ = (UniqueConstraint("work_order_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    rca_id: Mapped[uuid.UUID] = fk("rcas.id", ondelete="CASCADE")
    work_order_id: Mapped[uuid.UUID] = fk("work_orders.id", index=False)
    note: Mapped[str | None] = mapped_column(String(200))  # e.g. "recurrence after actions"
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RCAMember(Base):
    __tablename__ = "rca_members"
    __table_args__ = (UniqueConstraint("rca_id", "user_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    rca_id: Mapped[uuid.UUID] = fk("rcas.id", ondelete="CASCADE")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    role_note: Mapped[str | None] = mapped_column(String(80))  # e.g. "Production", "OEM"


class RCAAction(Base, PlantScoped, Timestamped, Attributed):
    __tablename__ = "rca_actions"
    __table_args__ = (Index("ix_rca_action_owner_status", "owner_id", "status"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    rca_id: Mapped[uuid.UUID] = fk("rcas.id", ondelete="CASCADE")
    seq: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str] = mapped_column(Text)
    kind: Mapped[RCAActionKind] = enum_col(RCAActionKind, ck_name="rca_action_kind", default=RCAActionKind.CORRECTIVE)
    root_cause_ref: Mapped[str | None] = mapped_column(String(40))  # id of the root cause it addresses
    owner_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[RCAActionStatus] = enum_col(RCAActionStatus, ck_name="rca_action_status", default=RCAActionStatus.OPEN)
    completion_note: Mapped[str | None] = mapped_column(Text)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    work_order_id: Mapped[uuid.UUID | None] = fk("work_orders.id", nullable=True, index=False)
    pm_plan_id: Mapped[uuid.UUID | None] = fk("pm_plans.id", nullable=True, index=False)
