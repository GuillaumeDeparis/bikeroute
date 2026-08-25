"""Tests du cas d'usage `calculer_parcours` (`route_engine/application`) :
domaine + ports factices, sans FastAPI ni PostGIS ni Valhalla réels."""

from __future__ import annotations

import uuid

import pytest

from app.route_engine.application.calculate_route import ParametresInvalides, calculer_parcours
from app.route_engine.application.ports import ElevationProviderError, RoutingProviderError
from app.route_engine.domain.metrics import METRICS_VERSION
from app.route_engine.domain.models import Coordinate, RouteResult, SegmentAttribut
from app.route_engine.domain.route import STATUT_NON_ROUTE, STATUT_ROUTE

from .fakes import FakeElevationProvider, FakeRoutingProvider, InMemoryRouteRepository


def test_calcule_et_persiste_un_parcours_route() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)
    result = RouteResult(
        geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3", duration_s=120.0
    )
    provider = FakeRoutingProvider(result=result)
    elevation_provider = FakeElevationProvider(elevations=(100.0, 110.0))
    repository = InMemoryRouteRepository()
    account_id = uuid.uuid4()

    route = calculer_parcours(
        routing_provider=provider,
        elevation_provider=elevation_provider,
        repository=repository,
        account_id=account_id,
        points=[depart, destination],
    )

    assert route.statut == STATUT_ROUTE
    assert route.account_id == account_id
    assert repository.saved == [route]
    assert provider.calls == [[depart, destination]]
    # Un parcours routé déclenche le calcul des métriques (spec-2-5) :
    # élévation demandée sur la géométrie routée, jamais sur les points
    # d'entrée bruts (peuvent différer -- topologies boucle/multi-étapes).
    assert elevation_provider.calls == [(depart, destination)]
    assert route.metrics is not None
    assert route.metrics.version == METRICS_VERSION
    assert route.metrics.denivele_positif_m == pytest.approx(10.0)
    assert route.metrics.denivele_negatif_m == pytest.approx(0.0)
    assert route.metrics.duree_s == 120.0


def test_surface_et_road_class_segments_sont_transmis_au_bon_parametre_de_calculer_metriques() -> None:
    """Revue post-implémentation (verification-gap) : `surface_segments`/
    `road_class_segments` sont deux `tuple[SegmentAttribut, ...]` -- si
    `calculate_route.py` les inversait au site d'appel de
    `calculer_metriques`, aucun test existant (tous par défaut `()` sur les
    deux) ne le détecterait. Des valeurs distinctes sur chaque champ ici le
    détecteraient : `revetements` doit refléter `surface_segments`, jamais
    `road_class_segments`, et inversement pour `categories_routieres`."""
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)
    surface_segments = (SegmentAttribut(distance_m=500.0, valeur="asphalte"),)
    road_class_segments = (SegmentAttribut(distance_m=500.0, valeur="residential"),)
    result = RouteResult(
        geometry=(depart, destination),
        unrouted_points=(),
        provider="valhalla",
        version="3.8.3",
        duration_s=120.0,
        surface_segments=surface_segments,
        road_class_segments=road_class_segments,
    )
    provider = FakeRoutingProvider(result=result)
    elevation_provider = FakeElevationProvider(elevations=(100.0, 100.0))
    repository = InMemoryRouteRepository()

    route = calculer_parcours(
        routing_provider=provider,
        elevation_provider=elevation_provider,
        repository=repository,
        account_id=uuid.uuid4(),
        points=[depart, destination],
    )

    assert route.metrics is not None
    # Présence de la bonne clé dans le bon champ (un swap ferait échouer ces
    # accès avec `KeyError`, ou laisserait la clé dans l'autre champ).
    assert route.metrics.revetements["asphalte"] == pytest.approx(500.0 / route.metrics.distance_m)
    assert route.metrics.categories_routieres["residential"] == pytest.approx(500.0 / route.metrics.distance_m)
    assert "residential" not in route.metrics.revetements
    assert "asphalte" not in route.metrics.categories_routieres


def test_persiste_un_parcours_non_route_sans_lever() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=46.0, lon=6.5)
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    elevation_provider = FakeElevationProvider()
    repository = InMemoryRouteRepository()

    route = calculer_parcours(
        routing_provider=provider,
        elevation_provider=elevation_provider,
        repository=repository,
        account_id=uuid.uuid4(),
        points=[depart, destination],
    )

    assert route.statut == STATUT_NON_ROUTE
    assert route.result.unrouted_points == (destination,)
    # Jamais de métrique partielle pour un parcours non routé (Boundaries de
    # la spec-2-5) : le fournisseur d'élévation n'est même pas sollicité.
    assert route.metrics is None
    assert elevation_provider.calls == []


def test_calcule_et_persiste_un_parcours_a_plus_de_deux_points() -> None:
    """Boucle fermée (Story 2.2) : le départ répété en dernier point --
    aucune borne haute côté application, qui reste topologie-agnostique
    (cf. Design Notes de spec-2-2)."""
    depart = Coordinate(lat=45.0, lon=5.0)
    point_de_passage = Coordinate(lat=45.01, lon=5.01)
    points = [depart, point_de_passage, depart]
    result = RouteResult(geometry=(depart, point_de_passage, depart), unrouted_points=(), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    elevation_provider = FakeElevationProvider()
    repository = InMemoryRouteRepository()
    account_id = uuid.uuid4()

    route = calculer_parcours(
        routing_provider=provider,
        elevation_provider=elevation_provider,
        repository=repository,
        account_id=account_id,
        points=points,
    )

    assert route.statut == STATUT_ROUTE
    assert provider.calls == [points]
    assert repository.saved == [route]
    assert route.metrics is not None


def test_rejette_moins_de_deux_points() -> None:
    provider = FakeRoutingProvider(should_fail=True)
    elevation_provider = FakeElevationProvider(should_fail=True)
    repository = InMemoryRouteRepository()

    with pytest.raises(ParametresInvalides):
        calculer_parcours(
            routing_provider=provider,
            elevation_provider=elevation_provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[Coordinate(lat=45.0, lon=5.0)],
        )

    assert provider.calls == []
    assert repository.saved == []


def test_propage_une_erreur_de_fournisseur_de_routage_sans_persister() -> None:
    provider = FakeRoutingProvider(should_fail=True)
    elevation_provider = FakeElevationProvider(should_fail=True)
    repository = InMemoryRouteRepository()

    with pytest.raises(RoutingProviderError):
        calculer_parcours(
            routing_provider=provider,
            elevation_provider=elevation_provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[Coordinate(lat=45.0, lon=5.0), Coordinate(lat=45.005, lon=5.005)],
        )

    assert repository.saved == []
    # Un routage en échec ne produit aucune géométrie routée : le fournisseur
    # d'élévation n'est jamais sollicité.
    assert elevation_provider.calls == []


def test_propage_une_erreur_de_fournisseur_delevation_sans_persister() -> None:
    """Échec du fournisseur d'élévation : même traitement qu'un échec du
    fournisseur de routage (Boundaries de la spec-2-5) -- propagé tel quel,
    jamais de persistance ni de métrique partielle."""
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    elevation_provider = FakeElevationProvider(should_fail=True)
    repository = InMemoryRouteRepository()

    with pytest.raises(ElevationProviderError):
        calculer_parcours(
            routing_provider=provider,
            elevation_provider=elevation_provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[depart, destination],
        )


def test_fournisseur_delevation_incoherent_avec_la_geometrie_retraduit_en_elevation_provider_error() -> None:
    """`calculer_metriques` lève `ValueError` si `elevations`/`geometry` ont
    des longueurs différentes (contrat `ElevationProvider`, AD-8) --
    aujourd'hui inatteignable avec `FakeElevationProvider`/
    `ValhallaElevationProvider` (qui garantissent déjà l'égalité), mais un
    futur adaptateur qui violerait ce contrat ne doit pas court-circuiter le
    format d'erreur structuré de l'appelant HTTP : retraduit en
    `ElevationProviderError`, jamais un `ValueError` non géré."""
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.005, lon=5.005)
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    # Une seule altitude pour deux points de géométrie : longueur incohérente.
    elevation_provider = FakeElevationProvider(elevations=(100.0,))
    repository = InMemoryRouteRepository()

    with pytest.raises(ElevationProviderError):
        calculer_parcours(
            routing_provider=provider,
            elevation_provider=elevation_provider,
            repository=repository,
            account_id=uuid.uuid4(),
            points=[depart, destination],
        )

    assert repository.saved == []

    assert repository.saved == []
