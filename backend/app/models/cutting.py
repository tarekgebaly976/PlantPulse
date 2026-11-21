"""Paper waste, phase B: the winder's cutting plan. The jumbo reel (the machine's width at the winder) is cut into reels of
the widths the customers ordered; the width no order takes is trim. A plan holds the orders of one machine and grade;
the optimiser picks the cutting patterns (which widths side by side in one set) and how many sets of each, for the least
trim and the fewest knife changes."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PlantScoped, Timestamped, fk, uuid_pk

CUT_PLAN_STATUSES = ("draft", "calculated", "released")


class CutWinder(Base, PlantScoped, Timestamped):
    """The winder of a paper machine: what one set (one jumbo width cut across) may hold."""

    __tablename__ = "cut_winders"
    __table_args__ = (
        UniqueConstraint("machine_id"),
        CheckConstraint("deckle_mm > 0 AND max_reels > 0 AND min_trim_mm >= 0 AND max_trim_mm >= min_trim_mm", name="limits"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = fk("op_machines.id", ondelete="CASCADE", index=False)
    deckle_mm: Mapped[int] = mapped_column(Integer)  # width of the jumbo at the winder
    max_reels: Mapped[int] = mapped_column(Integer, default=6)  # most reels side by side in one set (knives)
    min_trim_mm: Mapped[int] = mapped_column(Integer, default=20)  # the edges are always trimmed: at least this much
    max_trim_mm: Mapped[int] = mapped_column(Integer, default=250)  # a set with more trim than this is not used
    min_width_mm: Mapped[int] = mapped_column(Integer, default=300)  # narrowest reel the winder can make
    change_cost_sets: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0.5")
    )  # a knife change "costs" the trim of this many sets of the deckle


class CutPlan(Base, PlantScoped, Timestamped):
    """The orders of one machine (and grade) to cut, and the optimiser's result."""

    __tablename__ = "cut_plans"
    __table_args__ = (CheckConstraint("status IN ('draft','calculated','released')", name="status"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = fk("op_machines.id", ondelete="CASCADE")
    grade_id: Mapped[uuid.UUID | None] = fk("op_grades.id", nullable=True, ondelete="SET NULL", index=False)
    title: Mapped[str] = mapped_column(String(160))
    deckle_mm: Mapped[int | None] = mapped_column(Integer)  # this plan's jumbo width, if not the winder's
    status: Mapped[str] = mapped_column(String(12), default="draft")
    note: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict] = mapped_column(JSONB, default=dict)  # patterns, sets, trim, per width and order
    calculated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    orders: Mapped[list["CutOrder"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="CutOrder.sort")


class CutOrder(Base):
    """One customer order line: reels of one width (quantity in reels, with the over / under tolerance allowed)."""

    __tablename__ = "cut_orders"
    __table_args__ = (CheckConstraint("width_mm > 0 AND reels > 0 AND tolerance_pct >= 0 AND tolerance_pct <= 50", name="values"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    plan_id: Mapped[uuid.UUID] = fk("cut_plans.id", ondelete="CASCADE")
    customer: Mapped[str | None] = mapped_column(String(120))
    ref: Mapped[str | None] = mapped_column(String(60))  # order / sales reference
    width_mm: Mapped[int] = mapped_column(Integer)
    reels: Mapped[int] = mapped_column(Integer)
    tolerance_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal(0))  # ± reels allowed, in %
    due_date: Mapped[date | None] = mapped_column(Date)
    sort: Mapped[int] = mapped_column(Integer, default=0)
