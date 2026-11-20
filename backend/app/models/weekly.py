"""Weekly maintenance schedule: a proposal (made by the optimiser, then edited by hand) of who does which open work order
on which day of a Sunday–Saturday week, or why it is deferred. Approved in two steps: the engineer, then the maintenance
manager; the manager's approval writes the assignments and planned dates to the work orders."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PlantScoped, Timestamped, fk, uuid_pk

SCHEDULE_STATUSES = ("draft", "engineer_approved", "approved")


class WeeklySchedule(Base, PlantScoped, Timestamped):
    __tablename__ = "weekly_schedules"
    __table_args__ = (
        UniqueConstraint("plant_id", "week_start"),
        CheckConstraint("status IN ('draft','engineer_approved','approved')", name="status"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    week_start: Mapped[date] = mapped_column(Date)  # always a Sunday
    status: Mapped[str] = mapped_column(String(20), default="draft")
    max_overtime_hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=2)  # extra hours a person may get on a work day
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    proposed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    engineer_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    engineer_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    manager_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    manager_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_comment: Mapped[str | None] = mapped_column(Text)  # why it was sent back to draft
    stats: Mapped[dict] = mapped_column(JSONB, default=dict)  # solver status, objective, seconds, totals

    items: Mapped[list["ScheduleItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ScheduleItem(Base):
    """One person on one work order on one day; or one deferred work order (no person, no day, with the reason)."""

    __tablename__ = "weekly_schedule_items"
    __table_args__ = (CheckConstraint("deferred OR (user_id IS NOT NULL AND work_date IS NOT NULL)", name="placed"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    schedule_id: Mapped[uuid.UUID] = fk("weekly_schedules.id", ondelete="CASCADE")
    work_order_id: Mapped[uuid.UUID] = fk("work_orders.id", ondelete="CASCADE")
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    work_date: Mapped[date | None] = mapped_column(Date)
    shift_id: Mapped[uuid.UUID | None] = fk("shift_definitions.id", nullable=True)
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)  # this person's hours on it
    overtime: Mapped[bool] = mapped_column(Boolean, default=False)  # falls (partly) in overtime
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)
    deferred: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)  # set by hand: kept when the week is proposed again


class StopWindow(Base, PlantScoped, Timestamped):
    """A time the production line (or machine) is stopped and maintenance may work on it, e.g. a wash-up or a planned
    stop agreed with production. Work orders that need the stop are only scheduled inside a window of their line."""

    __tablename__ = "line_stop_windows"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ends_after_start"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    asset_id: Mapped[uuid.UUID] = fk("assets.id", ondelete="CASCADE")  # the line, or any asset above the work
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
