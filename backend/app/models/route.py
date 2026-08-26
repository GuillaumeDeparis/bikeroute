"""Table `routes` : tracé calculé, géométrie PostGIS SRID 4326 (AD-3).

Nommée `Route` comme l'entité de domaine `route_engine.domain.route.Route`
(collision assumée, même convention que `models/session.py` face à
`sqlalchemy.orm.Session` -- import sous alias `Route as RouteModel` côté
adaptateur, cf. `services/sessions.py`/`routers/auth.py`)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from uuid6 import uuid7

from ..db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (
        CheckConstraint("statut IN ('routed', 'non_route')", name="ck_routes_statut"),
        CheckConstraint(
            "(statut = 'routed' AND geometry IS NOT NULL) OR (statut = 'non_route' AND geometry IS NULL)",
            name="ck_routes_statut_geometry",
        ),
        CheckConstraint(
            "jsonb_typeof(points) = 'object' AND jsonb_typeof(points->'input') = 'array' "
            "AND jsonb_typeof(points->'unrouted_indices') = 'array'",
            name="ck_routes_points_shape",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid7)
    account_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Nul quand le tracé n'a pas pu être routé (`statut == "non_route"`) :
    # jamais de géométrie de repli (segment direct), cf. matrice I/O.
    # Index spatial créé explicitement par la migration (`spatial_index=False`
    # ici pour ne pas entrer en conflit avec cette création manuelle).
    geometry: Mapped[Any | None] = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=False))
    # Points d'entrée bruts (départ/destination) + indices non routés :
    # {"input": [{"lat":..,"lon":..}, ...], "unrouted_indices": [...]}.
    points: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    statut: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_version: Mapped[str] = mapped_column(String(64), nullable=False)
    # Nul quand le tracé n'a pas pu être routé (même garde que `geometry`) --
    # jamais de métriques partielles (Boundaries de la spec-2-5). Sérialisées
    # telles quelles en JSONB (patron `points`), pas en colonnes dédiées : le
    # morceau différé (revêtements, montées, ...) y ajoutera des champs, sans
    # requête SQL structurante dessus en V1 (cf. Design Notes de la spec).
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Méthode de calcul unique et versionnée (NFR-9) : traçabilité de la
    # méthode qui a produit `metrics`, même si elle change ensuite.
    metrics_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    # Marqueur de bibliothèque (spec-2-6, Intent) : un parcours est "dans ma
    # bibliothèque" ssi `nom` est non vide -- `PATCH /api/routes/{id}` sur
    # cette même ligne déjà calculée, jamais un nouveau statut de cycle de
    # vie ni une nouvelle table. `note`/`etiquettes` restent facultatifs même
    # une fois `nom` posé.
    nom: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    etiquettes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
