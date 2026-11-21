"""maintenance schedule: a plan of any length (1–31 days, a week by default) starting on any day

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-21 13:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0033'
down_revision: str | None = '0032'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('weekly_schedules', sa.Column('days', sa.Integer(), server_default='7', nullable=False))
    op.create_check_constraint(op.f('ck_weekly_schedules_days'), 'weekly_schedules', 'days BETWEEN 1 AND 31')


def downgrade() -> None:
    op.drop_constraint(op.f('ck_weekly_schedules_days'), 'weekly_schedules', type_='check')
    op.drop_column('weekly_schedules', 'days')
