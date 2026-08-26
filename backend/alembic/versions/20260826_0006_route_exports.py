"""Historique des exports GPX (spec-2-7).

Revision ID: 0006_route_exports
Revises: 0005_route_naming
Create Date: 2026-08-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_route_exports"
down_revision: str | None = "0005_route_naming"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Une ligne par export réussi (Intent de la spec) -- alimente
    # l'historique nécessaire à la nouveauté de la future génération assistée
    # (FR-25, Epic 3). Jamais de ligne pour un export en échec (Boundaries) :
    # l'insertion se fait toujours après la génération réussie du GPX, côté
    # routeur.
    op.create_table(
        "route_exports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "route_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("routes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_route_exports_account_id", "route_exports", ["account_id"])
    op.create_index("ix_route_exports_exported_at", "route_exports", ["exported_at"])


def downgrade() -> None:
    op.drop_index("ix_route_exports_exported_at", table_name="route_exports")
    op.drop_index("ix_route_exports_account_id", table_name="route_exports")
    op.drop_table("route_exports")
