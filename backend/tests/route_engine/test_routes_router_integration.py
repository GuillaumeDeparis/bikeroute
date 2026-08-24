"""Test d'intégration de `POST /api/routes/calculate` : vraie base
PostgreSQL/PostGIS (via `client`/`db_session`, cf. `conftest.py`), mais
`RoutingProvider` remplacé par un double injecté via
`app.dependency_overrides` -- aucune connexion réseau vers un vrai Valhalla
(cf. Boundaries de la spec)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.route import Route as RouteModel
from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.bootstrap.elevation import get_elevation_provider
from app.route_engine.bootstrap.routing import get_routing_provider
from app.route_engine.domain.models import Coordinate, RouteResult

from .fakes import FakeElevationProvider, FakeRoutingProvider

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


def _override_elevation_provider(provider: FakeElevationProvider | None = None) -> None:
    # Par défaut : altitude nulle pour chaque point demandé -- suffisant
    # pour ces tests d'intégration, qui ne portent pas sur les valeurs de
    # métrique elles-mêmes (couvertes par `test_metrics.py`/
    # `test_calculate_route_application.py`).
    app.dependency_overrides[get_elevation_provider] = lambda: provider or FakeElevationProvider()


def teardown_function() -> None:
    app.dependency_overrides.pop(get_routing_provider, None)
    app.dependency_overrides.pop(get_elevation_provider, None)


def test_calcul_reussi_persiste_et_renvoie_le_trace(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(
        geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3", duration_s=300.0
    )
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider(elevations=(100.0, 140.0)))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "routed"
    assert body["geometry"] == [DEPART, DESTINATION]
    assert body["unrouted_points"] == []
    assert body["provider"] == "valhalla"
    # Métriques exposées pour un parcours routé (spec-2-5) -- une seule
    # méthode de calcul serveur versionnée, jamais recalculée côté client.
    assert body["metriques"] is not None
    assert body["metriques"]["denivele_positif_m"] == pytest.approx(40.0)
    assert body["metriques"]["denivele_negatif_m"] == pytest.approx(0.0)
    assert body["metriques"]["duree_s"] == 300.0
    assert body["metriques"]["distance_m"] > 0
    assert body["metriques"]["difficulte"]
    assert body["metriques"]["version"]

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "routed"
    assert str(rows[0].id) == body["id"]
    # Persistées avec le tracé (même flush que `PostgisRouteRepository.save`)
    # -- même garde que `geometry` ci-dessus.
    assert rows[0].metrics is not None
    assert rows[0].metrics["denivele_positif_m"] == pytest.approx(40.0)
    assert rows[0].metrics_version == body["metriques"]["version"]


def test_calcul_a_plus_de_deux_points_est_accepte(client: TestClient, db_session) -> None:
    """Boucle fermée (Story 2.2) : départ + point de passage + départ répété
    -- la borne `max_length` de `CalculerParcoursRequest.points` a été levée
    de 2 à 50, le moteur restant topologie-agnostique."""
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    point_de_passage = Coordinate(lat=45.002, lon=5.002)
    points_requete = [DEPART, {"lat": 45.002, "lon": 5.002}, DEPART]
    result = RouteResult(
        geometry=(depart, point_de_passage, depart),
        unrouted_points=(),
        provider="valhalla",
        version="3.8.3",
    )
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider()

    response = client.post("/api/routes/calculate", json={"points": points_requete})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "routed"
    assert body["geometry"] == [DEPART, {"lat": 45.002, "lon": 5.002}, DEPART]
    assert body["metriques"] is not None

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "routed"


def test_point_non_routable_est_marque_sans_segment_direct(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    _override_provider(provider)
    elevation_provider = FakeElevationProvider()
    _override_elevation_provider(elevation_provider)

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "non_route"
    # Jamais de segment direct trompeur : la géométrie reste vide.
    assert body["geometry"] == []
    assert body["unrouted_points"] == [DESTINATION]
    # Aucune métrique pour un parcours non routé (Boundaries de la
    # spec-2-5) : le fournisseur d'élévation n'est même pas sollicité.
    assert body["metriques"] is None
    assert elevation_provider.calls == []

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows[0].statut == "non_route"
    assert rows[0].geometry is None
    assert rows[0].metrics is None
    assert rows[0].metrics_version is None


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


def test_fournisseur_delevation_indisponible_renvoie_la_meme_erreur_structuree_sans_persister(
    client: TestClient, db_session
) -> None:
    """Boundaries de la spec-2-5 : un échec du fournisseur d'élévation est
    traité exactement comme un échec du fournisseur de routage -- même
    réponse 502 `MOTEUR_ROUTAGE_INDISPONIBLE`, aucune persistance (ni tracé
    ni métrique partielle), même pour un routage par ailleurs réussi."""
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider(should_fail=True))

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
