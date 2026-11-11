"""root cause analysis (RCA): investigations, linked breakdown work orders, team, action plan; safety/environment
event flag on work orders

Revision ID: 0017
Revises: 0016
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rcas",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("number", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "candidate",
                "not_required",
                "investigation",
                "awaiting_approval",
                "action_plan",
                "monitoring",
                "closed",
                "cancelled",
                name="rca_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("asset_id", sa.UUID(), nullable=False),
        sa.Column("department_id", sa.UUID(), nullable=False),
        sa.Column("failure_code_id", sa.UUID(), nullable=True),
        sa.Column("trigger_reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_note", sa.Text(), nullable=True),
        sa.Column("decided_by_id", sa.UUID(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("leader_id", sa.UUID(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("problem", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("problem_statement", sa.Text(), nullable=True),
        sa.Column("timeline", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("whys", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("fishbone", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("root_causes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("analysis_summary", sa.Text(), nullable=True),
        sa.Column("lessons_learned", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_id", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("actions_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effectiveness_due", sa.Date(), nullable=True),
        sa.Column("effectiveness_result", sa.String(length=20), nullable=True),
        sa.Column("effectiveness_note", sa.Text(), nullable=True),
        sa.Column("recurrence_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_recurrence_wo_id", sa.UUID(), nullable=True),
        sa.Column("closed_by_id", sa.UUID(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], name=op.f("fk_rcas_approved_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], name=op.f("fk_rcas_asset_id_assets"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["closed_by_id"], ["users.id"], name=op.f("fk_rcas_closed_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_rcas_created_by_id_users"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], name=op.f("fk_rcas_decided_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], name=op.f("fk_rcas_department_id_departments"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["failure_code_id"], ["failure_codes.id"], name=op.f("fk_rcas_failure_code_id_failure_codes"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["last_recurrence_wo_id"], ["work_orders.id"], name=op.f("fk_rcas_last_recurrence_wo_id_work_orders"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["leader_id"], ["users.id"], name=op.f("fk_rcas_leader_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_rcas_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rcas")),
        sa.UniqueConstraint("plant_id", "number", name=op.f("uq_rcas_plant_id_number")),
    )
    op.create_index("ix_rca_plant_status", "rcas", ["plant_id", "status"], unique=False)
    op.create_index(op.f("ix_rcas_asset_id"), "rcas", ["asset_id"], unique=False)
    op.create_index(op.f("ix_rcas_department_id"), "rcas", ["department_id"], unique=False)
    op.create_index(op.f("ix_rcas_failure_code_id"), "rcas", ["failure_code_id"], unique=False)
    op.create_index(op.f("ix_rcas_leader_id"), "rcas", ["leader_id"], unique=False)
    op.create_index(op.f("ix_rcas_plant_id"), "rcas", ["plant_id"], unique=False)
    op.create_table(
        "rca_actions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("rca_id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "containment", "corrective", "preventive", name="rca_action_kind", native_enum=False, create_constraint=True, length=32
            ),
            nullable=False,
        ),
        sa.Column("root_cause_ref", sa.String(length=40), nullable=True),
        sa.Column("owner_id", sa.UUID(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "open", "in_progress", "done", "cancelled", name="rca_action_status", native_enum=False, create_constraint=True, length=32
            ),
            nullable=False,
        ),
        sa.Column("completion_note", sa.Text(), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_by_id", sa.UUID(), nullable=True),
        sa.Column("work_order_id", sa.UUID(), nullable=True),
        sa.Column("pm_plan_id", sa.UUID(), nullable=True),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_rca_actions_created_by_id_users"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["done_by_id"], ["users.id"], name=op.f("fk_rca_actions_done_by_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_rca_actions_owner_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_rca_actions_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["pm_plan_id"], ["pm_plans.id"], name=op.f("fk_rca_actions_pm_plan_id_pm_plans"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["rca_id"], ["rcas.id"], name=op.f("fk_rca_actions_rca_id_rcas"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["work_order_id"], ["work_orders.id"], name=op.f("fk_rca_actions_work_order_id_work_orders"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rca_actions")),
    )
    op.create_index("ix_rca_action_owner_status", "rca_actions", ["owner_id", "status"], unique=False)
    op.create_index(op.f("ix_rca_actions_plant_id"), "rca_actions", ["plant_id"], unique=False)
    op.create_index(op.f("ix_rca_actions_rca_id"), "rca_actions", ["rca_id"], unique=False)
    op.create_table(
        "rca_members",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("rca_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role_note", sa.String(length=80), nullable=True),
        sa.ForeignKeyConstraint(["rca_id"], ["rcas.id"], name=op.f("fk_rca_members_rca_id_rcas"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_rca_members_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rca_members")),
        sa.UniqueConstraint("rca_id", "user_id", name=op.f("uq_rca_members_rca_id_user_id")),
    )
    op.create_index(op.f("ix_rca_members_rca_id"), "rca_members", ["rca_id"], unique=False)
    op.create_index(op.f("ix_rca_members_user_id"), "rca_members", ["user_id"], unique=False)
    op.create_table(
        "rca_work_orders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("rca_id", sa.UUID(), nullable=False),
        sa.Column("work_order_id", sa.UUID(), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["rca_id"], ["rcas.id"], name=op.f("fk_rca_work_orders_rca_id_rcas"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["work_order_id"], ["work_orders.id"], name=op.f("fk_rca_work_orders_work_order_id_work_orders"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rca_work_orders")),
        sa.UniqueConstraint("work_order_id", name=op.f("uq_rca_work_orders_work_order_id")),
    )
    op.create_index(op.f("ix_rca_work_orders_rca_id"), "rca_work_orders", ["rca_id"], unique=False)
    op.add_column("work_orders", sa.Column("safety_event", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    app_role = os.environ.get("CMMS_APP_DB_ROLE", "cmms_app")  # same least-privilege grant as 0002, for the new tables
    op.execute(
        f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{app_role}') THEN "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON rcas, rca_work_orders, rca_members, rca_actions TO {app_role}; END IF; END $$;"
    )


def downgrade() -> None:
    op.drop_column("work_orders", "safety_event")
    op.drop_index(op.f("ix_rca_work_orders_rca_id"), table_name="rca_work_orders")
    op.drop_table("rca_work_orders")
    op.drop_index(op.f("ix_rca_members_user_id"), table_name="rca_members")
    op.drop_index(op.f("ix_rca_members_rca_id"), table_name="rca_members")
    op.drop_table("rca_members")
    op.drop_index(op.f("ix_rca_actions_rca_id"), table_name="rca_actions")
    op.drop_index(op.f("ix_rca_actions_plant_id"), table_name="rca_actions")
    op.drop_index("ix_rca_action_owner_status", table_name="rca_actions")
    op.drop_table("rca_actions")
    op.drop_index(op.f("ix_rcas_plant_id"), table_name="rcas")
    op.drop_index(op.f("ix_rcas_leader_id"), table_name="rcas")
    op.drop_index(op.f("ix_rcas_failure_code_id"), table_name="rcas")
    op.drop_index(op.f("ix_rcas_department_id"), table_name="rcas")
    op.drop_index(op.f("ix_rcas_asset_id"), table_name="rcas")
    op.drop_index("ix_rca_plant_status", table_name="rcas")
    op.drop_table("rcas")
