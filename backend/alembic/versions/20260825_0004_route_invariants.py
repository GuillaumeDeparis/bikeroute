"""Contraintes d'intégrité des parcours.

Revision ID: 0004_route_invariants
Revises: 0003_route_metrics
Create Date: 2026-08-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_route_invariants"
down_revision: str | None = "0003_route_metrics"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint("ck_routes_statut", "routes", "statut IN ('routed', 'non_route')")
    op.create_check_constraint(
        "ck_routes_statut_geometry",
        "routes",
        "(statut = 'routed' AND geometry IS NOT NULL) OR (statut = 'non_route' AND geometry IS NULL)",
    )
    op.create_check_constraint(
        "ck_routes_points_shape",
        "routes",
        "jsonb_typeof(points) = 'object' AND jsonb_typeof(points->'input') = 'array' "
        "AND jsonb_typeof(points->'unrouted_indices') = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_routes_points_shape", "routes", type_="check")
    op.drop_constraint("ck_routes_statut_geometry", "routes", type_="check")
    op.drop_constraint("ck_routes_statut", "routes", type_="check")
