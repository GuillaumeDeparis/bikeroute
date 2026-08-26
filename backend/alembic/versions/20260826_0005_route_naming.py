"""Nom/note/étiquettes de bibliothèque sur les parcours (spec-2-6).

Revision ID: 0005_route_naming
Revises: 0004_route_invariants
Create Date: 2026-08-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_route_naming"
down_revision: str | None = "0004_route_invariants"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # `nom` non NULL marque un parcours comme "dans ma bibliothèque" (cf.
    # Intent de la spec-2-6) -- pas de nouveau statut de cycle de vie, un
    # simple marqueur posé sur la ligne `routes` déjà calculée. `note`/
    # `etiquettes` restent facultatifs même une fois `nom` posé.
    op.add_column("routes", sa.Column("nom", sa.String(length=200), nullable=True))
    op.add_column("routes", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("routes", sa.Column("etiquettes", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("routes", "etiquettes")
    op.drop_column("routes", "note")
    op.drop_column("routes", "nom")
