"""maintenance schedule per department: a plan is for the whole plant or one department (its work orders and the people
who may work there); one plan per start day for each

Revision ID: 0034
Revises: 0033
Create Date: 2026-11-21 14:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0034'
down_revision: str | None = '0033'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('weekly_schedules', sa.Column('department_id', sa.UUID(), nullable=True))
    op.create_foreign_key(op.f('fk_weekly_schedules_department_id_departments'), 'weekly_schedules', 'departments', ['department_id'], ['id'],
                          ondelete='CASCADE')
    op.drop_constraint(op.f('uq_weekly_schedules_plant_id_week_start'), 'weekly_schedules', type_='unique')
    op.create_index('uq_weekly_schedules_plant_start', 'weekly_schedules', ['plant_id', 'week_start'], unique=True,
                    postgresql_where=sa.text('department_id IS NULL'))
    op.create_index('uq_weekly_schedules_dept_start', 'weekly_schedules', ['plant_id', 'department_id', 'week_start'], unique=True,
                    postgresql_where=sa.text('department_id IS NOT NULL'))


def downgrade() -> None:
    op.execute("DELETE FROM weekly_schedules WHERE department_id IS NOT NULL")
    op.drop_index('uq_weekly_schedules_dept_start', table_name='weekly_schedules')
    op.drop_index('uq_weekly_schedules_plant_start', table_name='weekly_schedules')
    op.create_unique_constraint(op.f('uq_weekly_schedules_plant_id_week_start'), 'weekly_schedules', ['plant_id', 'week_start'])
    op.drop_constraint(op.f('fk_weekly_schedules_department_id_departments'), 'weekly_schedules', type_='foreignkey')
    op.drop_column('weekly_schedules', 'department_id')
