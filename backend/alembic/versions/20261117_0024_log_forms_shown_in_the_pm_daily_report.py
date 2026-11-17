"""log forms shown in the PM daily report (stock preparation shift log inside the PM & SP daily report); how a
line's day figure is made (add up or average)

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-17 18:40:41.271054
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("op_log_templates", sa.Column("in_pm_report", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("op_log_fields", sa.Column("day_agg", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("op_log_fields", "day_agg")
    op.drop_column("op_log_templates", "in_pm_report")
