"""operations module: paper machine daily production report (machines, grades and ideal rates, disciplines, sections,
defects, daily reports with run segments, reels, quality losses, stops split by discipline); operations columns on
downtime_events; ideal and net tonnes on production_records

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-17 11:08:04.575409
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "op_defects",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("disposition", sa.String(length=10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_defects_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_defects")),
        sa.UniqueConstraint("plant_id", "name", name=op.f("uq_op_defects_plant_id_name")),
    )
    op.create_index(op.f("ix_op_defects_plant_id"), "op_defects", ["plant_id"], unique=False)
    op.create_table(
        "op_disciplines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("maintenance", sa.Boolean(), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_disciplines_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_disciplines")),
        sa.UniqueConstraint("plant_id", "code", name=op.f("uq_op_disciplines_plant_id_code")),
    )
    op.create_index(op.f("ix_op_disciplines_plant_id"), "op_disciplines", ["plant_id"], unique=False)
    op.create_table(
        "op_machines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("department_id", sa.UUID(), nullable=False),
        sa.Column("asset_id", sa.UUID(), nullable=False),
        sa.Column("trim_width_m", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("day_start", sa.Time(), nullable=False),
        sa.Column("shifts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], name=op.f("fk_op_machines_asset_id_assets"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["department_id"], ["departments.id"], name=op.f("fk_op_machines_department_id_departments"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_machines_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_machines")),
        sa.UniqueConstraint("plant_id", "code", name=op.f("uq_op_machines_plant_id_code")),
    )
    op.create_index(op.f("ix_op_machines_department_id"), "op_machines", ["department_id"], unique=False)
    op.create_index(op.f("ix_op_machines_plant_id"), "op_machines", ["plant_id"], unique=False)
    op.create_table(
        "op_daily_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("machine_id", sa.UUID(), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "submitted", "confirmed", name="op_report_status", native_enum=False, create_constraint=True, length=32),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("supervisors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("steam_mt", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("water_pm_m3", sa.Numeric(precision=10, scale=1), nullable=True),
        sa.Column("water_sp_m3", sa.Numeric(precision=10, scale=1), nullable=True),
        sa.Column("water_ut_m3", sa.Numeric(precision=10, scale=1), nullable=True),
        sa.Column("broke_tower_pct", sa.Numeric(precision=5, scale=1), nullable=True),
        sa.Column("submitted_by_id", sa.UUID(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_id", sa.UUID(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_note", sa.Text(), nullable=True),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["confirmed_by_id"], ["users.id"], name=op.f("fk_op_daily_reports_confirmed_by_id_users"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_op_daily_reports_created_by_id_users"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["machine_id"], ["op_machines.id"], name=op.f("fk_op_daily_reports_machine_id_op_machines"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_daily_reports_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["submitted_by_id"], ["users.id"], name=op.f("fk_op_daily_reports_submitted_by_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_daily_reports")),
        sa.UniqueConstraint("machine_id", "report_date", name=op.f("uq_op_daily_reports_machine_id_report_date")),
    )
    op.create_index(op.f("ix_op_daily_reports_machine_id"), "op_daily_reports", ["machine_id"], unique=False)
    op.create_index(op.f("ix_op_daily_reports_plant_id"), "op_daily_reports", ["plant_id"], unique=False)
    op.create_table(
        "op_grades",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("machine_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("gsm", sa.Integer(), nullable=False),
        sa.Column("target_speed_mpm", sa.Numeric(precision=8, scale=1), nullable=True),
        sa.Column("ideal_mt_min", sa.Numeric(precision=10, scale=5), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["op_machines.id"], name=op.f("fk_op_grades_machine_id_op_machines"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_grades_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_grades")),
        sa.UniqueConstraint("machine_id", "code", name=op.f("uq_op_grades_machine_id_code")),
    )
    op.create_index(op.f("ix_op_grades_machine_id"), "op_grades", ["machine_id"], unique=False)
    op.create_index(op.f("ix_op_grades_plant_id"), "op_grades", ["plant_id"], unique=False)
    op.create_table(
        "op_sections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("machine_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("asset_id", sa.UUID(), nullable=True),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], name=op.f("fk_op_sections_asset_id_assets"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["machine_id"], ["op_machines.id"], name=op.f("fk_op_sections_machine_id_op_machines"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_sections_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_sections")),
        sa.UniqueConstraint("machine_id", "name", name=op.f("uq_op_sections_machine_id_name")),
    )
    op.create_index(op.f("ix_op_sections_machine_id"), "op_sections", ["machine_id"], unique=False)
    op.create_index(op.f("ix_op_sections_plant_id"), "op_sections", ["plant_id"], unique=False)
    op.create_table(
        "op_quality_losses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("report_id", sa.UUID(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("reject", "downgrade", name="op_loss_kind", native_enum=False, create_constraint=True, length=32),
            nullable=False,
        ),
        sa.Column("shift", sa.String(length=8), nullable=True),
        sa.Column("defect_id", sa.UUID(), nullable=True),
        sa.Column("defect_text", sa.String(length=200), nullable=True),
        sa.Column("qty_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("disposition", sa.String(length=10), nullable=True),
        sa.ForeignKeyConstraint(
            ["defect_id"], ["op_defects.id"], name=op.f("fk_op_quality_losses_defect_id_op_defects"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["report_id"], ["op_daily_reports.id"], name=op.f("fk_op_quality_losses_report_id_op_daily_reports"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_quality_losses")),
    )
    op.create_index(op.f("ix_op_quality_losses_report_id"), "op_quality_losses", ["report_id"], unique=False)
    op.create_table(
        "op_reels",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("report_id", sa.UUID(), nullable=False),
        sa.Column("shift", sa.String(length=8), nullable=False),
        sa.Column("reel_no", sa.String(length=20), nullable=False),
        sa.Column("gsm", sa.Integer(), nullable=True),
        sa.Column("gross_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("net_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("reject_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("b_grade_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("s_grade_mt", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(
            ["report_id"], ["op_daily_reports.id"], name=op.f("fk_op_reels_report_id_op_daily_reports"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_reels")),
        sa.UniqueConstraint("report_id", "reel_no", name=op.f("uq_op_reels_report_id_reel_no")),
    )
    op.create_index(op.f("ix_op_reels_report_id"), "op_reels", ["report_id"], unique=False)
    op.create_table(
        "op_run_segments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("report_id", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("grade_id", sa.UUID(), nullable=True),
        sa.Column("gsm", sa.Integer(), nullable=False),
        sa.Column("speed_mpm", sa.Numeric(precision=8, scale=1), nullable=True),
        sa.Column("ideal_mt_min", sa.Numeric(precision=10, scale=5), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("grade_change_hours", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("grade_change_reject_mt", sa.Numeric(precision=10, scale=3), nullable=True),
        sa.CheckConstraint("ended_at > started_at", name=op.f("ck_op_run_segments_end_after_start")),
        sa.ForeignKeyConstraint(["grade_id"], ["op_grades.id"], name=op.f("fk_op_run_segments_grade_id_op_grades"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["report_id"], ["op_daily_reports.id"], name=op.f("fk_op_run_segments_report_id_op_daily_reports"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_run_segments")),
    )
    op.create_index(op.f("ix_op_run_segments_report_id"), "op_run_segments", ["report_id"], unique=False)
    op.create_table(
        "op_stop_parts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("downtime_event_id", sa.UUID(), nullable=False),
        sa.Column("discipline_id", sa.UUID(), nullable=False),
        sa.Column("hours", sa.Numeric(precision=7, scale=3), nullable=False),
        sa.ForeignKeyConstraint(
            ["discipline_id"], ["op_disciplines.id"], name=op.f("fk_op_stop_parts_discipline_id_op_disciplines"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["downtime_event_id"],
            ["downtime_events.id"],
            name=op.f("fk_op_stop_parts_downtime_event_id_downtime_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_stop_parts")),
    )
    op.create_index(op.f("ix_op_stop_parts_downtime_event_id"), "op_stop_parts", ["downtime_event_id"], unique=False)
    op.add_column("downtime_events", sa.Column("source", sa.String(length=16), server_default="maintenance", nullable=False))
    op.add_column("downtime_events", sa.Column("event_type", sa.String(length=20), nullable=True))
    op.add_column("downtime_events", sa.Column("section_id", sa.UUID(), nullable=True))
    op.add_column("downtime_events", sa.Column("op_report_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_downtime_events_op_report_id"), "downtime_events", ["op_report_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_downtime_events_section_id_op_sections"), "downtime_events", "op_sections", ["section_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        op.f("fk_downtime_events_op_report_id_op_daily_reports"),
        "downtime_events",
        "op_daily_reports",
        ["op_report_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("production_records", sa.Column("ideal_tons", sa.Numeric(precision=12, scale=3), nullable=True))
    op.add_column("production_records", sa.Column("net_tons", sa.Numeric(precision=12, scale=3), nullable=True))

    app_role = os.environ.get("CMMS_APP_DB_ROLE", "cmms_app")  # same least-privilege grant as 0002, for the new tables
    op.execute(
        f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{app_role}') THEN "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON op_machines, op_grades, op_disciplines, op_sections, op_defects, op_daily_reports, op_run_segments, op_reels, op_stop_parts, op_quality_losses TO {app_role}; END IF; END $$;"
    )


def downgrade() -> None:
    op.drop_column("production_records", "net_tons")
    op.drop_column("production_records", "ideal_tons")
    op.drop_constraint(op.f("fk_downtime_events_op_report_id_op_daily_reports"), "downtime_events", type_="foreignkey")
    op.drop_constraint(op.f("fk_downtime_events_section_id_op_sections"), "downtime_events", type_="foreignkey")
    op.drop_index(op.f("ix_downtime_events_op_report_id"), table_name="downtime_events")
    op.drop_column("downtime_events", "op_report_id")
    op.drop_column("downtime_events", "section_id")
    op.drop_column("downtime_events", "event_type")
    op.drop_column("downtime_events", "source")
    op.drop_index(op.f("ix_op_stop_parts_downtime_event_id"), table_name="op_stop_parts")
    op.drop_table("op_stop_parts")
    op.drop_index(op.f("ix_op_run_segments_report_id"), table_name="op_run_segments")
    op.drop_table("op_run_segments")
    op.drop_index(op.f("ix_op_reels_report_id"), table_name="op_reels")
    op.drop_table("op_reels")
    op.drop_index(op.f("ix_op_quality_losses_report_id"), table_name="op_quality_losses")
    op.drop_table("op_quality_losses")
    op.drop_index(op.f("ix_op_sections_plant_id"), table_name="op_sections")
    op.drop_index(op.f("ix_op_sections_machine_id"), table_name="op_sections")
    op.drop_table("op_sections")
    op.drop_index(op.f("ix_op_grades_plant_id"), table_name="op_grades")
    op.drop_index(op.f("ix_op_grades_machine_id"), table_name="op_grades")
    op.drop_table("op_grades")
    op.drop_index(op.f("ix_op_daily_reports_plant_id"), table_name="op_daily_reports")
    op.drop_index(op.f("ix_op_daily_reports_machine_id"), table_name="op_daily_reports")
    op.drop_table("op_daily_reports")
    op.drop_index(op.f("ix_op_machines_plant_id"), table_name="op_machines")
    op.drop_index(op.f("ix_op_machines_department_id"), table_name="op_machines")
    op.drop_table("op_machines")
    op.drop_index(op.f("ix_op_disciplines_plant_id"), table_name="op_disciplines")
    op.drop_table("op_disciplines")
    op.drop_index(op.f("ix_op_defects_plant_id"), table_name="op_defects")
    op.drop_table("op_defects")
