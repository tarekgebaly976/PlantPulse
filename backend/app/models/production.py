"""Industry-independent core of the production module: plant configuration, products, generic output lines, loss
categories, configurable KPIs, alert rules, alerts and actions. Nothing here assumes an industry: a paper mill, a food
plant or an assembly line are configurations (app.services.production.templates)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, PlantScoped, Timestamped, fk, uuid_pk


class OpPlantConfig(Base, Timestamped):
    """How the production module is set up in a plant: industry (informational), the template it started from, which
    features are shown, and the names of the menu entries (e.g. "PM & SP daily report")."""

    __tablename__ = "op_plant_config"
    plant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plants.id", ondelete="CASCADE"), primary_key=True)
    industry: Mapped[str | None] = mapped_column(String(60))
    template: Mapped[str | None] = mapped_column(String(30))
    features: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"reports": true, "logs": true, "kpis": true, ...}
    labels: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"reports": "...", "logs": "..."}: menu names
    setup_done: Mapped[bool] = mapped_column(Boolean, default=False)


class OpProduct(Base, PlantScoped, Timestamped):
    """A product (or product family) a line makes, with its ideal rate (units of the line per hour) or ideal cycle
    time. Output lines copy the rate, so changing it later never changes old reports. `attributes`: anything the
    industry needs (size, recipe, colour …), shown but never calculated with."""

    __tablename__ = "op_products"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str | None] = mapped_column(String(80))
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="SET NULL", index=False)  # None: any line
    unit: Mapped[str | None] = mapped_column(String(12))
    ideal_rate_per_h: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    ideal_cycle_s: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpOutput(Base):
    """One output line of a generic daily report: a run, batch, lot or production order of one product in a shift.
    good = produced − reject − downgrade. Ideal quantity = run hours × the rate copied from the product."""

    __tablename__ = "op_outputs"
    __table_args__ = (CheckConstraint("ended_at IS NULL OR started_at IS NULL OR ended_at > started_at", name="end_after_start"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = fk("op_daily_reports.id", ondelete="CASCADE")
    shift: Mapped[str | None] = mapped_column(String(8))
    product_id: Mapped[uuid.UUID | None] = fk("op_products.id", nullable=True, ondelete="SET NULL", index=False)
    order_ref: Mapped[str | None] = mapped_column(String(60))  # batch, lot or production order
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    run_hours: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    planned_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))  # target of the run / order
    input_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))  # material in (yield = good ÷ input)
    produced_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    reject_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    downgrade_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    ideal_rate_per_h: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    completed: Mapped[bool] = mapped_column(Boolean, default=True)  # batch / order finished
    note: Mapped[str | None] = mapped_column(String(300))


class OpLossCategory(Base, PlantScoped):
    """A configurable loss classification (with sub-categories through parent_id): equipment failure, changeover,
    material shortage … `affects`: the KPI factor the loss reduces (availability, performance, quality, none).
    `event_type` is how a stop of this category is recorded for maintenance (breakdown, planned, other or a
    profile-specific type such as the paper mill's sheet_break); `failure`: a stop of this category is an equipment
    failure (counts for MTBF) when a maintenance discipline is responsible."""

    __tablename__ = "op_loss_categories"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    parent_id: Mapped[uuid.UUID | None] = fk("op_loss_categories.id", nullable=True, ondelete="SET NULL", index=False)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    affects: Mapped[str] = mapped_column(String(12), default="availability")
    event_type: Mapped[str] = mapped_column(String(20), default="other")
    planned: Mapped[bool] = mapped_column(Boolean, default=False)
    failure: Mapped[bool] = mapped_column(Boolean, default=False)
    discipline_id: Mapped[uuid.UUID | None] = fk("op_disciplines.id", nullable=True, ondelete="SET NULL", index=False)
    department_id: Mapped[uuid.UUID | None] = fk("departments.id", nullable=True, ondelete="SET NULL", index=False)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpKpi(Base, PlantScoped, Timestamped):
    """A KPI: a formula over standard production measures (produced, good, run_hours …, see
    app.services.production.measures) and daily-log line codes. `standard`: copied from the library (OEE …).
    Status: compared with target, warning and critical limits in its direction (higher or lower is better)."""

    __tablename__ = "op_kpis"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(400))
    formula: Mapped[str] = mapped_column(String(400))
    unit: Mapped[str | None] = mapped_column(String(20))
    decimals: Mapped[int] = mapped_column(Integer, default=1)
    direction: Mapped[str] = mapped_column(String(8), default="higher")  # higher | lower is better
    target: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    warn: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    critical: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    period: Mapped[str] = mapped_column(String(8), default="day")  # day | week | month: the default reporting period
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="CASCADE", index=False)  # line
    department_id: Mapped[uuid.UUID | None] = fk("departments.id", nullable=True, ondelete="SET NULL", index=False)  # area
    standard: Mapped[bool] = mapped_column(Boolean, default=False)
    dashboard: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpAlertRule(Base, PlantScoped, Timestamped):
    """A proactive monitoring rule. source: a KPI code or a measure / log line code. condition: below, above,
    outside (low–high), kpi_limits (the KPI's warning / critical limits), total_above (sum over the look-back days,
    e.g. repeated stops), trend_down / trend_up (change in % between the halves of the look-back), action_overdue.
    `periods`: consecutive days the condition must hold. Notifies a role (in the app, optionally by email) and
    escalates to another role when the alert is still not acknowledged after `escalate_after_days`."""

    __tablename__ = "op_alert_rules"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(160))
    source_kind: Mapped[str] = mapped_column(String(10), default="kpi")  # kpi | measure | none
    source_code: Mapped[str | None] = mapped_column(String(40))
    condition: Mapped[str] = mapped_column(String(14))
    threshold: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    threshold_high: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    periods: Mapped[int] = mapped_column(Integer, default=1)
    lookback_days: Mapped[int] = mapped_column(Integer, default=7)
    severity: Mapped[str] = mapped_column(String(10), default="warning")  # info | warning | critical
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="CASCADE", index=False)
    department_id: Mapped[uuid.UUID | None] = fk("departments.id", nullable=True, ondelete="SET NULL", index=False)
    notify_role: Mapped[str | None] = mapped_column(String(40))  # role code
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    escalate_after_days: Mapped[int | None] = mapped_column(Integer)
    escalate_role: Mapped[str | None] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpAlert(Base, PlantScoped, Timestamped):
    """A rule that fired: open (new), acknowledged, resolved (the condition no longer holds) or closed (by a user).
    One open alert per rule and line; later evaluations update it."""

    __tablename__ = "op_alerts"
    id: Mapped[uuid.UUID] = uuid_pk()
    rule_id: Mapped[uuid.UUID] = fk("op_alert_rules.id", ondelete="CASCADE")
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="CASCADE", index=False)
    status: Mapped[str] = mapped_column(String(14), default="open")
    severity: Mapped[str] = mapped_column(String(10), default="warning")
    period_date: Mapped[date] = mapped_column(Date)  # last production day evaluated
    value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OpAction(Base, PlantScoped, Timestamped):
    """An operational action (follow-up) raised from an alert, an insight, a report or by hand."""

    __tablename__ = "op_actions"
    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | in_progress | done | cancelled
    owner_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual | alert | insight | report | incident
    alert_id: Mapped[uuid.UUID | None] = fk("op_alerts.id", nullable=True, ondelete="SET NULL", index=False)
    incident_id: Mapped[uuid.UUID | None] = fk("op_incidents.id", nullable=True, ondelete="SET NULL", index=False)
    report_id: Mapped[uuid.UUID | None] = fk("op_daily_reports.id", nullable=True, ondelete="SET NULL", index=False)
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="SET NULL", index=False)
    created_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[str | None] = mapped_column(Text)


class OpIncident(Base, PlantScoped, Timestamped):
    """Safety, health and environment incident register of the plant (one place for every area and industry).
    Reported from anywhere — the incident page, a department's shift log, a line's daily report — and followed up
    with actions and work requests. kind: near_miss, first_aid, medical, lost_time, property, environment, other."""

    __tablename__ = "op_incidents"
    __table_args__ = (UniqueConstraint("plant_id", "number"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    number: Mapped[str] = mapped_column(String(40))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    department_id: Mapped[uuid.UUID] = fk("departments.id")
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="SET NULL", index=False)
    asset_id: Mapped[uuid.UUID | None] = fk("assets.id", nullable=True, ondelete="SET NULL", index=False)
    shift: Mapped[str | None] = mapped_column(String(8))
    kind: Mapped[str] = mapped_column(String(14))
    severity: Mapped[str] = mapped_column(String(10), default="low")  # low | medium | high | critical
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(160))
    people: Mapped[str | None] = mapped_column(String(400))  # names / roles involved (free text)
    injured: Mapped[int] = mapped_column(Integer, default=0)
    lost_days: Mapped[int | None] = mapped_column(Integer)
    immediate_action: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(14), default="open")  # open | investigating | closed
    log_id: Mapped[uuid.UUID | None] = fk("op_logs.id", nullable=True, ondelete="SET NULL", index=False)
    report_id: Mapped[uuid.UUID | None] = fk("op_daily_reports.id", nullable=True, ondelete="SET NULL", index=False)
    reported_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    closed_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
