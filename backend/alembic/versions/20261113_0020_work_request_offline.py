"""work requests written offline: the phone's own reference (no duplicates on re-send) and the time it was written

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("work_requests", sa.Column("client_ref", sa.String(length=40), nullable=True))
    op.add_column("work_requests", sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_wr_client_ref", "work_requests", ["plant_id", "client_ref"], unique=True, postgresql_where=sa.text("client_ref IS NOT NULL")
    )


def downgrade() -> None:
    op.drop_index("ix_wr_client_ref", table_name="work_requests", postgresql_where=sa.text("client_ref IS NOT NULL"))
    op.drop_column("work_requests", "reported_at")
    op.drop_column("work_requests", "client_ref")
