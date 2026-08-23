"""Ports de l'application : contrats que les adaptateurs doivent honorer.

`RoutingProvider` (AD-8) est remplaçable -- Valhalla est l'unique
implémentation en V1, mais rien ici ne le suppose. `RouteRepository`
matérialise AD-3 : PostgreSQL/PostGIS reste l'unique état durable des
tracés, jamais un cache ou le fournisseur de routage lui-même.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from ..domain.models import Coordinate, RouteResult
from ..domain.route import Route


class RoutingProvider(Protocol):
    """Calcule un tracé routé pour une liste ordonnée de points (départ en
    premier, destination en dernier). N'est jamais appelé ailleurs que
    depuis son adaptateur (AD-8) : l'application dépend de ce protocole, pas
    d'une implémentation concrète."""

    def route(self, points: list[Coordinate]) -> RouteResult: ...


class RouteRepository(Protocol):
    """Persiste un tracé calculé (AD-3). Seul le dépôt écrit dans `routes` ;
    aucun adaptateur ne modifie la table autrement."""

    def save(self, *, account_id: uuid.UUID, points: list[Coordinate], result: RouteResult) -> Route: ...


class RoutingProviderError(Exception):
    """Erreur de fournisseur de routage : indisponibilité, timeout ou
    réponse invalide -- toujours transitoire/opérationnelle. Distincte d'un
    point non routé, qui est un résultat métier normal porté par
    `RouteResult.unrouted_points`, pas une exception."""
