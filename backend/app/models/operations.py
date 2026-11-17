"""Operations module: the paper machine's daily production report (as on a typical paper-mill daily form).

Settings: machines (each one a production-line asset), grades with their ideal production rate, responsible
disciplines, machine sections and quality defects. A daily report (production day, e.g. 07:00 to 07:00) holds the
run segments (grade, speed, ideal tonnes), the reels, the stops and sheet breaks (rows of downtime_events with source
"operations", so maintenance KPIs use the same facts) split by responsible discipline, and the quality losses.
Totals, OEE and to-date figures are calculated (app.services.operations), never typed."""

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
    trim_width_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))  # helps work out ideal rates (gsm × speed × width)
    day_start: Mapped[time] = mapped_column(Time, default=time(7, 0))  # production day starts (and ends next day) here
    shifts: Mapped[list] = mapped_column(JSONB, default=list)  # [{"code": "D", "name": "Day shift", "start": "07:00"}, ...]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class OpGrade(Base, PlantScoped, Timestamped):
    """A product grade of a machine with its target speed and ideal production rate (the mill's "Rate" table).
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
    """A period the machine ran on one grade at one speed. Ideal tonnes = minutes × ideal MT/min (copied from the grade)."""

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
    """A jumbo reel. A-grade = net − B − S; trim = gross − net − reject."""

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
    """Why paper was rejected or downgraded (defect, quantity, where it went)."""

    __tablename__ = "op_quality_losses"
    id: Mapped[uuid.UUID] = uuid_pk()
    report_id: Mapped[uuid.UUID] = fk("op_daily_reports.id", ondelete="CASCADE")
    kind: Mapped[OpLossKind] = enum_col(OpLossKind, ck_name="op_loss_kind")
    shift: Mapped[str | None] = mapped_column(String(8))
    defect_id: Mapped[uuid.UUID | None] = fk("op_defects.id", nullable=True, ondelete="SET NULL", index=False)
    defect_text: Mapped[str | None] = mapped_column(String(200))
    qty_mt: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    disposition: Mapped[str | None] = mapped_column(String(10))
