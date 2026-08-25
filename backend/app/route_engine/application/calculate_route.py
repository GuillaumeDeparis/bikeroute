"""Cas d'usage : calcul (synchrone) d'un premier tracé départ→destination.

Orchestration pure : ne connaît ni FastAPI, ni SQLAlchemy, ni Valhalla
(AD-1) -- uniquement les ports `RoutingProvider`/`RouteRepository` injectés
par l'appelant (l'adaptateur entrant HTTP, via `bootstrap`).
"""

from __future__ import annotations

import uuid

from ..domain.metrics import calculer_metriques
from ..domain.models import Coordinate
from ..domain.route import Route
from .ports import ElevationProvider, ElevationProviderError, RouteRepository, RoutingProvider

__all__ = ["ParametresInvalides", "calculer_parcours"]


class ParametresInvalides(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def calculer_parcours(
    *,
    routing_provider: RoutingProvider,
    elevation_provider: ElevationProvider,
    repository: RouteRepository,
    account_id: uuid.UUID,
    points: list[Coordinate],
) -> Route:
    """Au moins un départ et une destination sont requis ; au-delà, la liste
    ordonnée porte n'importe quelle topologie résolue côté frontend (boucle,
    aller simple, multi-étapes -- Story 2.2), le moteur restant topologie-
    agnostique. Délègue le calcul au fournisseur injecté puis persiste le
    résultat -- routé ou non -- via le dépôt injecté ; ne décide jamais
    elle-même de rattachabilité au réseau (cela reste au fournisseur, AD-8).

    Un parcours routé déclenche aussi le calcul des métriques (distance/D+/
    D-/durée/difficulté, spec-2-5) : élévation via `elevation_provider` puis
    unique méthode normative `calculer_metriques` -- jamais pour un résultat
    non routé (`metrics=None`), pas de métrique partielle."""
    if len(points) < 2:
        raise ParametresInvalides("Un départ et une destination sont requis pour calculer un parcours.")

    result = routing_provider.route(points)

    metrics = None
    if result.est_route:
        elevations = elevation_provider.elevations(result.geometry)
        try:
            metrics = calculer_metriques(
                result.geometry,
                elevations,
                result.duration_s,
                surface_segments=result.surface_segments,
                road_class_segments=result.road_class_segments,
            )
        except ValueError as exc:
            # `calculer_metriques` exige `elevations`/`geometry` de même
            # longueur (contrat `ElevationProvider`, AD-8) -- aujourd'hui
            # inatteignable avec l'unique adaptateur existant (qui garantit
            # déjà cette égalité, cf. `ValhallaElevationProvider`), mais un
            # futur adaptateur qui violerait ce contrat ne doit pas
            # court-circuiter le format d'erreur structuré de l'appelant
            # HTTP (`RoutingProviderError`/`ElevationProviderError` -> 502) :
            # retraduit comme une erreur du fournisseur d'élévation, jamais
            # comme un crash non géré.
            raise ElevationProviderError(
                "Réponse du fournisseur d'élévation incohérente avec la géométrie routée."
            ) from exc

    return repository.save(account_id=account_id, points=points, result=result, metrics=metrics)
