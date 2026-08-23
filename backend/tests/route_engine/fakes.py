"""Doubles de test des ports du moteur de routage -- utilisés par les tests
d'application et d'intégration pour ne jamais dépendre d'un vrai Valhalla."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.domain.models import Coordinate, RouteResult
from app.route_engine.domain.route import Route, statut_pour


class FakeRoutingProvider:
    """Fournisseur factice piloté par le test : renvoie un `RouteResult`
    préconfiguré, ou lève `RoutingProviderError` si `should_fail` est posé."""

    def __init__(self, *, result: RouteResult | None = None, should_fail: bool = False) -> None:
        self.result = result
        self.should_fail = should_fail
        self.calls: list[list[Coordinate]] = []

    def route(self, points: list[Coordinate]) -> RouteResult:
        self.calls.append(points)
        if self.should_fail:
            raise RoutingProviderError("Panne simulée du fournisseur de routage.")
        assert self.result is not None, "FakeRoutingProvider.result doit être défini si should_fail=False"
        return self.result


class InMemoryRouteRepository:
    """Dépôt factice en mémoire : suffisant pour les tests d'application,
    qui ne portent pas sur la persistance PostGIS elle-même (couverte par
    les tests d'intégration, avec une vraie base)."""

    def __init__(self) -> None:
        self.saved: list[Route] = []

    def save(self, *, account_id: uuid.UUID, points: list[Coordinate], result: RouteResult) -> Route:
        route = Route(
            id=uuid.uuid4(),
            account_id=account_id,
            points=tuple(points),
            result=result,
            statut=statut_pour(result),
            created_at=datetime.now(timezone.utc),
        )
        self.saved.append(route)
        return route
