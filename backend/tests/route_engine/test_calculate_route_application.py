"""Tests du cas d'usage `calculer_parcours` (`route_engine/application`) :
domaine + ports factices, sans FastAPI ni PostGIS ni Valhalla réels."""

from __future__ import annotations

import uuid

import pytest

from app.route_engine.application.calculate_route import ParametresInvalides, calculer_parcours
from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.domain.models import Coordinate, RouteResult
from app.route_engine.domain.route import STATUT_NON_ROUTE, STATUT_ROUTE

from .fakes import FakeRoutingProvider, InMemoryRouteRepository


def test_calcule_et_persiste_un_parcours_route() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    repository = InMemoryRouteRepository()
    account_id = uuid.uuid4()

    route = calculer_parcours(
        routing_provider=provider,
        repository=repository,
        account_id=account_id,
        points=[depart, destination],
    )

    assert route.statut == STATUT_ROUTE
    assert route.account_id == account_id
    assert repository.saved == [route]
    assert provider.calls == [[depart, destination]]


def test_persiste_un_parcours_non_route_sans_lever() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=46.0, lon=6.5)
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    repository = InMemoryRouteRepository()

    route = calculer_parcours(
        routing_provider=provider,
        repository=repository,
        account_id=uuid.uuid4(),
        points=[depart, destination],
    )

    assert route.statut == STATUT_NON_ROUTE
    assert route.result.unrouted_points == (destination,)


def test_rejette_moins_de_deux_points() -> None:
    provider = FakeRoutingProvider(should_fail=True)
    repository = InMemoryRouteRepository()

    with pytest.raises(ParametresInvalides):
        calculer_parcours(
            routing_provider=provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[Coordinate(lat=45.0, lon=5.0)],
        )

    assert provider.calls == []
    assert repository.saved == []


def test_propage_une_erreur_de_fournisseur_sans_persister() -> None:
    provider = FakeRoutingProvider(should_fail=True)
    repository = InMemoryRouteRepository()

    with pytest.raises(RoutingProviderError):
        calculer_parcours(
            routing_provider=provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[Coordinate(lat=45.0, lon=5.0), Coordinate(lat=45.005, lon=5.005)],
        )

    assert repository.saved == []
