"""offline work orders: work orders created on a phone without internet (own reference, written time) and the record
of every offline execution batch sent later (sent twice = applied once; what was applied and what conflicted)

Revision ID: 0021
Revises: 0020
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("work_orders", sa.Column("client_ref", sa.String(length=40), nullable=True))
    op.add_column("work_orders", sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_wo_client_ref", "work_orders", ["plant_id", "client_ref"], unique=True, postgresql_where=sa.text("client_ref IS NOT NULL")
    )
    op.create_table(
        "offline_syncs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("client_ref", sa.String(length=40), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("work_order_id", sa.UUID(), nullable=False),
        sa.Column("written_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plant_id", "client_ref"),
    )
    op.create_index("ix_offline_syncs_wo", "offline_syncs", ["work_order_id"], unique=False)
    op.create_index(op.f("ix_offline_syncs_plant_id"), "offline_syncs", ["plant_id"], unique=False)
    app_role = os.environ.get("CMMS_APP_DB_ROLE", "cmms_app")  # same least-privilege grant as 0002, for the new table
    op.execute(
        f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{app_role}') THEN "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON offline_syncs TO {app_role}; END IF; END $$;"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_offline_syncs_plant_id"), table_name="offline_syncs")
    op.drop_index("ix_offline_syncs_wo", table_name="offline_syncs")
    op.drop_table("offline_syncs")
    op.drop_index("ix_wo_client_ref", table_name="work_orders", postgresql_where=sa.text("client_ref IS NOT NULL"))
    op.drop_column("work_orders", "reported_at")
    op.drop_column("work_orders", "client_ref")
