"""postgis + routes

Revision ID: 0002_postgis_routes
Revises: 0001_initial
Create Date: 2026-08-23

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_postgis_routes"
down_revision: str | None = "0001_initial"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # AD-3 : PostgreSQL/PostGIS devient l'état durable des tracés. Doit
    # précéder `create_table` : le type `geometry` n'existe pas tant que
    # l'extension n'est pas active.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Nul quand le tracé n'a pas pu être routé -- jamais de géométrie de
        # repli (segment direct), cf. matrice I/O de la spec.
        sa.Column(
            "geometry",
            Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("points", postgresql.JSONB(), nullable=False),
        sa.Column("statut", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_version", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_routes_account_id", "routes", ["account_id"])
    op.create_index("ix_routes_geometry", "routes", ["geometry"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_index("ix_routes_geometry", table_name="routes")
    op.drop_index("ix_routes_account_id", table_name="routes")
    op.drop_table("routes")
    # L'extension PostGIS n'est volontairement pas retirée : des objets
    # système (ex. `spatial_ref_sys`) en dépendent durablement et sa seule
    # présence est sans effet une fois qu'aucune table ne l'utilise plus.
