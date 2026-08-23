"""Test d'intégration de `POST /api/routes/calculate` : vraie base
PostgreSQL/PostGIS (via `client`/`db_session`, cf. `conftest.py`), mais
`RoutingProvider` remplacé par un double injecté via
`app.dependency_overrides` -- aucune connexion réseau vers un vrai Valhalla
(cf. Boundaries de la spec)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.route import Route as RouteModel
from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.bootstrap.routing import get_routing_provider
from app.route_engine.domain.models import Coordinate, RouteResult

from .fakes import FakeRoutingProvider

DEPART = {"lat": 45.0, "lon": 5.0}
DESTINATION = {"lat": 45.005, "lon": 5.005}


def _inscrire_et_connecter(client: TestClient, identifiant: str = "alice") -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert response.status_code == 201


def _override_provider(provider: FakeRoutingProvider) -> None:
    app.dependency_overrides[get_routing_provider] = lambda: provider


def teardown_function() -> None:
    app.dependency_overrides.pop(get_routing_provider, None)


def test_calcul_reussi_persiste_et_renvoie_le_trace(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "routed"
    assert body["geometry"] == [DEPART, DESTINATION]
    assert body["unrouted_points"] == []
    assert body["provider"] == "valhalla"

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "routed"
    assert str(rows[0].id) == body["id"]


def test_point_non_routable_est_marque_sans_segment_direct(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "non_route"
    # Jamais de segment direct trompeur : la géométrie reste vide.
    assert body["geometry"] == []
    assert body["unrouted_points"] == [DESTINATION]

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows[0].statut == "non_route"
    assert rows[0].geometry is None


def test_depart_et_destination_coincidents_geometrie_degeneree_nest_pas_persistee_comme_routee(
    client: TestClient, db_session
) -> None:
    """Un fournisseur pourrait renvoyer une géométrie à un seul point pour un
    départ == destination (segment de longueur nulle). Doit être traité
    comme non routé -- jamais un crash de persistance PostGIS (`LINESTRING`
    à un seul point), jamais un statut "routed" trompeur."""
    _inscrire_et_connecter(client)
    point = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    result = RouteResult(geometry=(point,), unrouted_points=(), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DEPART]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "non_route"
    assert body["geometry"] == []

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "non_route"
    assert rows[0].geometry is None


def test_fournisseur_indisponible_renvoie_une_erreur_structuree_sans_persister(
    client: TestClient, db_session
) -> None:
    _inscrire_et_connecter(client)
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "MOTEUR_ROUTAGE_INDISPONIBLE"
    assert "correlationId" in body

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows == []


def test_non_authentifie_renvoie_401(client: TestClient) -> None:
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 401


def test_un_seul_point_est_rejete_en_422(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART]})

    assert response.status_code == 422
