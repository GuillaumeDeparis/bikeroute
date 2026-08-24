"""route metrics

Revision ID: 0003_route_metrics
Revises: 0002_postgis_routes
Create Date: 2026-08-24

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_route_metrics"
down_revision: str | None = "0002_postgis_routes"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Nulles quand le tracé n'a pas pu être routé -- même garde que
    # `geometry` (Boundaries de la spec-2-5 : jamais de métriques
    # partielles). JSONB tel quel (patron `points`), pas de colonnes dédiées
    # en V1 -- cf. Design Notes de la spec.
    op.add_column("routes", sa.Column("metrics", postgresql.JSONB(), nullable=True))
    op.add_column("routes", sa.Column("metrics_version", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("routes", "metrics_version")
    op.drop_column("routes", "metrics")
