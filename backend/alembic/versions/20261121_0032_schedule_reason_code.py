"""weekly schedule: the optimiser's reason for a deferral as a code with parameters, so the page can translate it

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-21 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0032'
down_revision: str | None = '0031'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('weekly_schedule_items', sa.Column('reason_code', sa.String(length=40), nullable=True))
    op.add_column('weekly_schedule_items', sa.Column('reason_params', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('weekly_schedule_items', 'reason_params')
    op.drop_column('weekly_schedule_items', 'reason_code')
