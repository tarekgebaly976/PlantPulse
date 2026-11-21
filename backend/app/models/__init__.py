"""Import every model module so Base.metadata is complete (Alembic autogenerate relies on this)."""

from app.models import (  # noqa: F401
    assets,
    cutting,
    identity,
    inventory,
    lubrication,
    operations,
    pdm,
    pm,
    production,
    rca,
    shifts,
    shutdowns,
    skills,
    system,
    tenancy,
    weekly,
    workorders,
)
from app.models.base import Base  # noqa: F401
