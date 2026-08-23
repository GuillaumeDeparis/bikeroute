"""Adaptateur sortant du port `RouteRepository` : persistance PostGIS (AD-3).

Seul module qui traduit le domaine du moteur de routage vers la table
`routes` (SQLAlchemy/GeoAlchemy2) ; l'application ne connaît que le
protocole `RouteRepository`.
"""

from __future__ import annotations

import uuid

from geoalchemy2.elements import WKTElement
from sqlalchemy.orm import Session as DBSession

from ....models.route import Route as RouteModel
from ...domain.models import Coordinate, RouteResult
from ...domain.route import Route, statut_pour


def _linestring_wkt(points: list[Coordinate]) -> str:
    coords = ", ".join(f"{point.lon} {point.lat}" for point in points)
    return f"LINESTRING({coords})"


class PostgisRouteRepository:
    """Implémente `RouteRepository` (`route_engine/application/ports.py`)."""

    def __init__(self, db: DBSession) -> None:
        self._db = db

    def save(self, *, account_id: uuid.UUID, points: list[Coordinate], result: RouteResult) -> Route:
        statut = statut_pour(result)
        # `>= 2` (jamais seulement "non vide") : un `LINESTRING` PostGIS/
        # GeoAlchemy2 exige au moins deux points -- une géométrie à un seul
        # point (ex. départ == destination) échouerait au `flush` avec une
        # erreur DB brute, hors du format d'erreur structuré du reste de
        # l'API. Cohérent avec `RouteResult.est_route` (domain/models.py).
        geometry = WKTElement(_linestring_wkt(list(result.geometry)), srid=4326) if len(result.geometry) >= 2 else None
        unrouted_indices = [index for index, point in enumerate(points) if point in result.unrouted_points]

        model = RouteModel(
            account_id=account_id,
            geometry=geometry,
            points={
                "input": [{"lat": point.lat, "lon": point.lon} for point in points],
                "unrouted_indices": unrouted_indices,
            },
            statut=statut,
            provider=result.provider,
            provider_version=result.version,
        )
        self._db.add(model)
        # `flush` (pas `commit`) : la transaction reste sous le contrôle de
        # l'appelant (adaptateur entrant HTTP), même convention que
        # `services/sessions.create_session`. Nécessaire pour que `model.id`
        # et `model.created_at` (défauts Python évalués côté ORM) soient
        # déjà résolus avant de construire l'entité de domaine ci-dessous.
        self._db.flush()

        return Route(
            id=model.id,
            account_id=model.account_id,
            points=tuple(points),
            result=result,
            statut=statut,
            created_at=model.created_at,
        )
