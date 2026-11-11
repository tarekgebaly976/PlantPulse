"""targets for calculated KPIs (whole plant or one department)

Revision ID: 0019
Revises: 0018
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kpi_targets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kpi_code", sa.String(length=40), nullable=False),
        sa.Column("scope_key", sa.String(length=40), nullable=False),
        sa.Column("department_id", sa.UUID(), nullable=True),
        sa.Column("target", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("higher_is_better", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["kpi_code"], ["kpi_definitions.code"]),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plant_id", "kpi_code", "scope_key"),
    )
    op.create_index(op.f("ix_kpi_targets_plant_id"), "kpi_targets", ["plant_id"], unique=False)
    app_role = os.environ.get("CMMS_APP_DB_ROLE", "cmms_app")  # same least-privilege grant as 0002, for the new table
    op.execute(
        f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{app_role}') THEN "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON kpi_targets TO {app_role}; END IF; END $$;"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_kpi_targets_plant_id"), table_name="kpi_targets")
    op.drop_table("kpi_targets")
