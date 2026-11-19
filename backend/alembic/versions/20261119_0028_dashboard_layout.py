"""dashboard layout: the production dashboard's sections and KPIs per view (whole mill, each area), set by the
production manager or the administrator for everyone who sees the dashboard

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-19 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "op_plant_config",
        sa.Column("dashboard", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("op_plant_config", "dashboard")
