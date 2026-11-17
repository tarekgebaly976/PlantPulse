"""operations daily logs: configurable daily / per-shift log forms of a department (utilities daily generation and
electricity, stock preparation shift report …): templates, fields (meter, counter, number, check, text, calc), logs, values

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-17 12:19:50.748194
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "op_log_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("department_id", sa.UUID(), nullable=False),
        sa.Column("frequency", sa.String(length=10), nullable=False),
        sa.Column("day_start", sa.Time(), nullable=False),
        sa.Column("shifts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("issues", sa.Boolean(), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["department_id"], ["departments.id"], name=op.f("fk_op_log_templates_department_id_departments"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_log_templates_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_log_templates")),
        sa.UniqueConstraint("plant_id", "code", name=op.f("uq_op_log_templates_plant_id_code")),
    )
    op.create_index(op.f("ix_op_log_templates_department_id"), "op_log_templates", ["department_id"], unique=False)
    op.create_index(op.f("ix_op_log_templates_plant_id"), "op_log_templates", ["plant_id"], unique=False)
    op.create_table(
        "op_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("shift", sa.String(length=8), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "submitted", "confirmed", name="op_log_status", native_enum=False, create_constraint=True, length=32),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("submitted_by_id", sa.UUID(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_id", sa.UUID(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_note", sa.Text(), nullable=True),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["confirmed_by_id"], ["users.id"], name=op.f("fk_op_logs_confirmed_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_op_logs_created_by_id_users"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_op_logs_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submitted_by_id"], ["users.id"], name=op.f("fk_op_logs_submitted_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["template_id"], ["op_log_templates.id"], name=op.f("fk_op_logs_template_id_op_log_templates"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_logs")),
        sa.UniqueConstraint("template_id", "log_date", "shift", name=op.f("uq_op_logs_template_id_log_date_shift")),
    )
    op.create_index(op.f("ix_op_logs_plant_id"), "op_logs", ["plant_id"], unique=False)
    op.create_index(op.f("ix_op_logs_template_id"), "op_logs", ["template_id"], unique=False)
    op.create_table(
        "op_log_fields",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("section", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("decimals", sa.Integer(), nullable=False),
        sa.Column("formula", sa.String(length=400), nullable=True),
        sa.Column("low", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("high", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("meter_id", sa.UUID(), nullable=True),
        sa.Column("chart", sa.Boolean(), nullable=False),
        sa.Column("per_ton", sa.Boolean(), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["meter_id"], ["meters.id"], name=op.f("fk_op_log_fields_meter_id_meters"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["template_id"], ["op_log_templates.id"], name=op.f("fk_op_log_fields_template_id_op_log_templates"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_log_fields")),
        sa.UniqueConstraint("template_id", "code", name=op.f("uq_op_log_fields_template_id_code")),
    )
    op.create_index(op.f("ix_op_log_fields_template_id"), "op_log_fields", ["template_id"], unique=False)
    op.create_table(
        "op_log_values",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("log_id", sa.UUID(), nullable=False),
        sa.Column("field_id", sa.UUID(), nullable=False),
        sa.Column("opening", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("closing", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("value", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["field_id"], ["op_log_fields.id"], name=op.f("fk_op_log_values_field_id_op_log_fields"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["log_id"], ["op_logs.id"], name=op.f("fk_op_log_values_log_id_op_logs"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_op_log_values")),
        sa.UniqueConstraint("log_id", "field_id", name=op.f("uq_op_log_values_log_id_field_id")),
    )
    op.create_index(op.f("ix_op_log_values_log_id"), "op_log_values", ["log_id"], unique=False)

    app_role = os.environ.get("CMMS_APP_DB_ROLE", "cmms_app")  # same least-privilege grant as 0002, for the new tables
    op.execute(
        f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{app_role}') THEN "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON op_log_templates, op_log_fields, op_logs, op_log_values TO {app_role}; END IF; END $$;"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_op_log_values_log_id"), table_name="op_log_values")
    op.drop_table("op_log_values")
    op.drop_index(op.f("ix_op_log_fields_template_id"), table_name="op_log_fields")
    op.drop_table("op_log_fields")
    op.drop_index(op.f("ix_op_logs_template_id"), table_name="op_logs")
    op.drop_index(op.f("ix_op_logs_plant_id"), table_name="op_logs")
    op.drop_table("op_logs")
    op.drop_index(op.f("ix_op_log_templates_plant_id"), table_name="op_log_templates")
    op.drop_index(op.f("ix_op_log_templates_department_id"), table_name="op_log_templates")
    op.drop_table("op_log_templates")
