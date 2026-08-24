"""Cas d'usage : calcul (synchrone) d'un premier tracé départ→destination.

Orchestration pure : ne connaît ni FastAPI, ni SQLAlchemy, ni Valhalla
(AD-1) -- uniquement les ports `RoutingProvider`/`RouteRepository` injectés
par l'appelant (l'adaptateur entrant HTTP, via `bootstrap`).
"""

from __future__ import annotations

import uuid

from ..domain.models import Coordinate
from ..domain.route import Route
from .ports import RouteRepository, RoutingProvider

__all__ = ["ParametresInvalides", "calculer_parcours"]


class ParametresInvalides(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def calculer_parcours(
    *,
    routing_provider: RoutingProvider,
    repository: RouteRepository,
    account_id: uuid.UUID,
    points: list[Coordinate],
) -> Route:
    """Au moins un départ et une destination sont requis ; au-delà, la liste
    ordonnée porte n'importe quelle topologie résolue côté frontend (boucle,
    aller simple, multi-étapes -- Story 2.2), le moteur restant topologie-
    agnostique. Délègue le calcul au fournisseur injecté puis persiste le
    résultat -- routé ou non -- via le dépôt injecté ; ne décide jamais
    elle-même de rattachabilité au réseau (cela reste au fournisseur, AD-8)."""
    if len(points) < 2:
        raise ParametresInvalides("Un départ et une destination sont requis pour calculer un parcours.")

    result = routing_provider.route(points)

    return repository.save(account_id=account_id, points=points, result=result)
