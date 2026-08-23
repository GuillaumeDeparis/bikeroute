"""Tests unitaires du domaine pur (`route_engine/domain`) : aucune
infrastructure, aucun accès réseau/DB (AD-1)."""

from __future__ import annotations

import pytest

from app.route_engine.domain.models import Coordinate, RouteResult
from app.route_engine.domain.route import STATUT_NON_ROUTE, STATUT_ROUTE, statut_pour


def test_coordinate_accepte_les_bornes_valides() -> None:
    Coordinate(lat=90.0, lon=180.0)
    Coordinate(lat=-90.0, lon=-180.0)
    Coordinate(lat=0.0, lon=0.0)


@pytest.mark.parametrize(
    "lat, lon",
    [
        (90.0001, 0.0),
        (-90.0001, 0.0),
        (0.0, 180.0001),
        (0.0, -180.0001),
    ],
)
def test_coordinate_rejette_les_valeurs_hors_bornes(lat: float, lon: float) -> None:
    with pytest.raises(ValueError):
        Coordinate(lat=lat, lon=lon)


def test_route_result_est_route_seulement_si_geometrie_et_aucun_point_non_route() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)

    routed = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    assert routed.est_route is True
    assert statut_pour(routed) == STATUT_ROUTE

    non_routed = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    assert non_routed.est_route is False
    assert statut_pour(non_routed) == STATUT_NON_ROUTE

    # Cas dégénéré (ne devrait pas être produit par un fournisseur correct) :
    # une géométrie vide sans point non routé signalé n'est pas non plus
    # considérée "routée" -- pas de faux positif silencieux.
    vide = RouteResult(geometry=(), unrouted_points=(), provider="valhalla", version="3.8.3")
    assert vide.est_route is False


def test_route_result_geometrie_a_un_seul_point_nest_pas_routee() -> None:
    """Départ == destination (ou quasi-identiques) : un fournisseur pourrait
    renvoyer une "forme" à un seul point. Un `LINESTRING` PostGIS exige au
    moins deux points -- ce résultat ne doit donc jamais être classé
    "routé" (sans quoi la persistance échouerait plus loin avec une erreur
    DB brute, hors format d'erreur structuré)."""
    point = Coordinate(lat=45.0, lon=5.0)
    degenere = RouteResult(geometry=(point,), unrouted_points=(), provider="valhalla", version="3.8.3")

    assert degenere.est_route is False
    assert statut_pour(degenere) == STATUT_NON_ROUTE
