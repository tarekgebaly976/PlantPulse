"""Production (operations) module: production lines and their daily production reports, daily log forms.

Industry-independent core: a production line (table op_machines, each one a production-line asset) has a production
model (continuous, batch, discrete), an output unit and a report profile. Responsible disciplines, line sections,
quality defects, stops (rows of downtime_events with source "operations", so maintenance KPIs use the same facts) and
quality losses are shared by every profile; loss categories, products, KPIs, alert rules and actions are in
app.models.production.

Report profiles:
* "generic": output lines (product, batch / order reference, produced, reject, downgrade quantities, run time);
* "paper_machine": the paper mill configuration (grades with GSM and ideal rate, run segments, jumbo reels, sheet
  breaks) — paper-specific tables below are used by this profile only (app.services.production.paper).
Totals and KPIs are calculated (app.services.production), never typed."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Attributed, Base, PlantScoped, Timestamped, enum_col, fk, uuid_pk
from app.models.enums import OpLossKind, OpReportStatus


class OpMachine(Base, PlantScoped, Timestamped):
    __tablename__ = "op_machines"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    department_id: Mapped[uuid.UUID] = fk("departments.id")
    asset_id: Mapped[uuid.UUID] = fk("assets.id", index=False)  # the production line: stops are downtime of this asset
    # continuous | batch | discrete: how the line's output is counted (informational, shapes the generic report form)
    production_model: Mapped[str] = mapped_column(String(12), default="continuous", server_default="continuous")
    output_unit: Mapped[str] = mapped_column(String(12), default="t", server_default="t")  # t, kg, m³, pcs, batch …
    report_profile: Mapped[str] = mapped_column(String(20), default="generic", server_default="generic")  # generic | paper_machine
    trim_width_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))  # paper profile: ideal rates (gsm × speed × width)
    day_start: Mapped[time] = mapped_column(Time, default=time(7, 0))  # production day starts (and ends next day) here
    shifts: Mapped[list] = mapped_column(JSONB, default=list)  # [{"code": "D", "name": "Day shift", "start": "07:00"}, ...]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpGrade(Base, PlantScoped, Timestamped):
    """Paper profile only. A product grade of a machine with its target speed and ideal production rate (the mill's "Rate" table).
    Run segments copy the rate, so changing it later never changes old reports."""

    __tablename__ = "op_grades"
    __table_args__ = (UniqueConstraint("machine_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = fk("op_machines.id", ondelete="CASCADE")
    code: Mapped[str] = mapped_column(String(30))  # e.g. "350"
    name: Mapped[str | None] = mapped_column(String(120))
    gsm: Mapped[int] = mapped_column(Integer)
    target_speed_mpm: Mapped[Decimal | None] = mapped_column(Numeric(8, 1))
    ideal_mt_min: Mapped[Decimal] = mapped_column(Numeric(10, 5))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpDiscipline(Base, PlantScoped):
    """Who is responsible for a stop: SCM, PM/CK, EAI, ME/WS, EMD, Power plant, SP, UT, Misc …
    `maintenance`: a breakdown of this discipline is an equipment failure (counts for MTBF)."""

    __tablename__ = "op_disciplines"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(80))
    maintenance: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpSection(Base, PlantScoped):
    """Machine section where a stop happened (wire, press, dryer, coaters, calender, reel …)."""

    __tablename__ = "op_sections"
    __table_args__ = (UniqueConstraint("machine_id", "name"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = fk("op_machines.id", ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(80))
    asset_id: Mapped[uuid.UUID | None] = fk("assets.id", nullable=True, index=False)  # its equipment, for work requests
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpDefect(Base, PlantScoped):
    __tablename__ = "op_defects"
    __table_args__ = (UniqueConstraint("plant_id", "name"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120))
    disposition: Mapped[str] = mapped_column(String(10), default="R/P")  # R/P repulp, F/H finishing house …
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpDailyReport(Base, PlantScoped, Timestamped, Attributed):
    __tablename__ = "op_daily_reports"
    __table_args__ = (UniqueConstraint("machine_id", "report_date"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = fk("op_machines.id")
    report_date: Mapped[date] = mapped_column(Date)
    status: Mapped[OpReportStatus] = enum_col(OpReportStatus, ck_name="op_report_status", default=OpReportStatus.DRAFT)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    supervisors: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"D": "name", "N": "name"}
    notes: Mapped[str | None] = mapped_column(Text)
    # paper profile only (the generic profile records consumption in daily log forms)
    steam_mt: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    water_pm_m3: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    water_sp_m3: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    water_ut_m3: Mapped[Decimal | None] = mapped_column(Numeric(10, 1))
    broke_tower_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    submitted_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reopen_note: Mapped[str | None] = mapped_column(Text)


class OpRunSegment(Base):
    """Paper profile only. A period the machine ran on one grade at one speed. Ideal tonnes = minutes × ideal MT/min (copied from the grade)."""

    __tablename__ = "op_run_segments"
    __table_args__ = (CheckConstraint("ended_at > started_at", name="end_after_start"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = fk("op_daily_reports.id", ondelete="CASCADE")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    grade_id: Mapped[uuid.UUID | None] = fk("op_grades.id", nullable=True, ondelete="SET NULL", index=False)
    gsm: Mapped[int] = mapped_column(Integer)
    speed_mpm: Mapped[Decimal | None] = mapped_column(Numeric(8, 1))
    ideal_mt_min: Mapped[Decimal] = mapped_column(Numeric(10, 5))
    reason: Mapped[str | None] = mapped_column(Text)  # reason for the GSM or speed change
    grade_change_hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    grade_change_reject_mt: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))


class OpReel(Base):
    """Paper profile only. A jumbo reel. A-grade = net − B − S; trim = gross − net − reject."""

    __tablename__ = "op_reels"
    __table_args__ = (UniqueConstraint("report_id", "reel_no"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = fk("op_daily_reports.id", ondelete="CASCADE")
    shift: Mapped[str] = mapped_column(String(8))
    reel_no: Mapped[str] = mapped_column(String(20))
    gsm: Mapped[int | None] = mapped_column(Integer)
    gross_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    net_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    reject_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=0)
    b_grade_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=0)
    s_grade_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=0)
    note: Mapped[str | None] = mapped_column(String(200))


class OpStopPart(Base):
    """Share of a stop (downtime event) a discipline is responsible for, e.g. 1.75 h Mechanical then 1.75 h EAI."""

    __tablename__ = "op_stop_parts"
    id: Mapped[uuid.UUID] = uuid_pk()
    downtime_event_id: Mapped[uuid.UUID] = fk("downtime_events.id", ondelete="CASCADE")
    discipline_id: Mapped[uuid.UUID] = fk("op_disciplines.id", index=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(7, 3))


class OpQualityLoss(Base):
    """Why output was rejected or downgraded (defect, quantity in the line's output unit, where it went)."""

    __tablename__ = "op_quality_losses"
    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = fk("op_daily_reports.id", ondelete="CASCADE")
    kind: Mapped[OpLossKind] = enum_col(OpLossKind, ck_name="op_loss_kind")
    shift: Mapped[str | None] = mapped_column(String(8))
    defect_id: Mapped[uuid.UUID | None] = fk("op_defects.id", nullable=True, ondelete="SET NULL", index=False)
    defect_text: Mapped[str | None] = mapped_column(String(200))
    qty_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    disposition: Mapped[str | None] = mapped_column(String(10))


# ---------------------------------------------------------------- daily logs (utilities, stock preparation …)
class OpLogTemplate(Base, PlantScoped, Timestamped):
    """A daily or per-shift log form of a department (e.g. utilities daily generation report, stock preparation shift
    report). Its fields are configured, so a new form needs no code."""

    __tablename__ = "op_log_templates"
    __table_args__ = (UniqueConstraint("plant_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    department_id: Mapped[uuid.UUID] = fk("departments.id")
    frequency: Mapped[str] = mapped_column(String(10), default="day")  # day | shift
    day_start: Mapped[time] = mapped_column(Time, default=time(7, 0))
    shifts: Mapped[list] = mapped_column(JSONB, default=list)  # [{"code": "D", "name": "Day shift", "start": "07:00"}]
    issues: Mapped[bool] = mapped_column(Boolean, default=False)  # show the department's open work requests / orders
    # show the department's safety incidents of the day / shift, with "Report incident"
    incidents: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # the production line the form belongs to (None: the area / plant); its "per unit" lines divide by this line's output
    machine_id: Mapped[uuid.UUID | None] = fk("op_machines.id", nullable=True, ondelete="SET NULL", index=False)
    # shown inside the daily production report (e.g. the paper mill's stock preparation shift log)
    in_pm_report: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpLogField(Base):
    """One line of a log form. kind: meter (opening/closing reading, value = difference), counter (running hours,
    same, and the closing reading goes to the equipment's meter when the log is confirmed), number, check (yes / no),
    text, calc (formula over other fields' codes, e.g. "(RO1 + RO2) / RO_FEED * 100"), select (one of `options`,
    e.g. a status), multi (several of `options`, e.g. a checklist), datetime, product (one of the plant's products),
    ref (batch, lot or production order reference). Number lines may have a target and low / high limits."""

    __tablename__ = "op_log_fields"
    __table_args__ = (UniqueConstraint("template_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    template_id: Mapped[uuid.UUID] = fk("op_log_templates.id", ondelete="CASCADE")
    section: Mapped[str] = mapped_column(String(80))
    code: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(10))
    unit: Mapped[str | None] = mapped_column(String(20))
    decimals: Mapped[int] = mapped_column(Integer, default=1)
    formula: Mapped[str | None] = mapped_column(String(400))
    low: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))  # outside low–high: flagged
    high: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    target: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    required: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # must be filled to submit
    options: Mapped[list | None] = mapped_column(JSONB)  # choices of a select / multi line
    meter_id: Mapped[uuid.UUID | None] = fk("meters.id", nullable=True, ondelete="SET NULL", index=False)
    chart: Mapped[bool] = mapped_column(Boolean, default=False)  # shown on the production dashboard
    per_ton: Mapped[bool] = mapped_column(Boolean, default=False)  # also shown per unit of output (t, pcs …) of the line(s)
    # day figure of a per-shift log (and dashboard): "sum" (bales, tonnes), "avg" (levels, flows); None = automatic
    day_agg: Mapped[str | None] = mapped_column(String(8))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpLog(Base, PlantScoped, Timestamped, Attributed):
    __tablename__ = "op_logs"
    __table_args__ = (UniqueConstraint("template_id", "log_date", "shift"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    template_id: Mapped[uuid.UUID] = fk("op_log_templates.id")
    log_date: Mapped[date] = mapped_column(Date)
    shift: Mapped[str] = mapped_column(String(8), default="-")  # "-" for a daily log
    status: Mapped[OpReportStatus] = enum_col(OpReportStatus, ck_name="op_log_status", default=OpReportStatus.DRAFT)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True, index=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reopen_note: Mapped[str | None] = mapped_column(Text)


class OpLogValue(Base):
    __tablename__ = "op_log_values"
    __table_args__ = (UniqueConstraint("log_id", "field_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    log_id: Mapped[uuid.UUID] = fk("op_logs.id", ondelete="CASCADE")
    field_id: Mapped[uuid.UUID] = fk("op_log_fields.id", ondelete="CASCADE", index=False)
    opening: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    closing: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    text: Mapped[str | None] = mapped_column(Text)
