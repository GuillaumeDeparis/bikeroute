"""Doubles de test des ports du moteur de routage -- utilisés par les tests
d'application et d'intégration pour ne jamais dépendre d'un vrai Valhalla."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.route_engine.application.ports import ElevationProviderError, RoutingProviderError
from app.route_engine.domain.metrics import RouteMetrics
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


class FakeElevationProvider:
    """Fournisseur d'élévation factice piloté par le test : renvoie soit les
    altitudes préconfigurées, soit une altitude nulle pour chaque point
    demandé (assez pour les tests d'intégration, qui ne portent pas sur les
    valeurs de métrique elles-mêmes), soit lève `ElevationProviderError` si
    `should_fail` est posé."""

    def __init__(self, *, elevations: tuple[float, ...] | None = None, should_fail: bool = False) -> None:
        self.elevations_result = elevations
        self.should_fail = should_fail
        self.calls: list[tuple[Coordinate, ...]] = []

    def elevations(self, points: tuple[Coordinate, ...]) -> tuple[float, ...]:
        self.calls.append(points)
        if self.should_fail:
            raise ElevationProviderError("Panne simulée du fournisseur d'élévation.")
        if self.elevations_result is not None:
            return self.elevations_result
        return tuple(0.0 for _ in points)


class InMemoryRouteRepository:
    """Dépôt factice en mémoire : suffisant pour les tests d'application,
    qui ne portent pas sur la persistance PostGIS elle-même (couverte par
    les tests d'intégration, avec une vraie base)."""

    def __init__(self) -> None:
        self.saved: list[Route] = []

    def save(
        self, *, account_id: uuid.UUID, points: list[Coordinate], result: RouteResult, metrics: RouteMetrics | None
    ) -> Route:
        route = Route(
            id=uuid.uuid4(),
            account_id=account_id,
            points=tuple(points),
            result=result,
            statut=statut_pour(result),
            created_at=datetime.now(timezone.utc),
            metrics=metrics,
        )
        self.saved.append(route)
        return route
