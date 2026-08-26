"""Test de contrat de l'adaptateur `ValhallaElevationProvider` face au
protocole `ElevationProvider` (AD-8).

N'exige aucune connexion réseau vers un vrai Valhalla : le transport HTTP
est remplacé par un `httpx.MockTransport`, même patron que
`test_valhalla_provider_contract.py`. Le corpus OSM minimal et déterministe
(`deploy/valhalla/corpus.osm.pbf`) ne porte aucune donnée d'élévation réelle
(cf. Design Notes de la spec-2-5) : un test de contrat contre une vraie
instance Valhalla servie avec de vraies tuiles skadi locales reste à ajouter
(skip/xfail sans tuiles), hors de ce fichier."""

from __future__ import annotations

import json

import httpx
import pytest

from app.route_engine.adapters.outbound.valhalla_elevation_provider import ValhallaElevationProvider
from app.route_engine.application.ports import ElevationProviderError
from app.route_engine.domain.models import Coordinate

DEPART = Coordinate(lat=45.0000, lon=5.0000)
DESTINATION = Coordinate(lat=45.0050, lon=5.0050)


def _provider(handler) -> ValhallaElevationProvider:
    client = httpx.Client(base_url="http://valhalla.test", transport=httpx.MockTransport(handler))
    return ValhallaElevationProvider(base_url="http://valhalla.test", timeout_seconds=1.0, client=client)


def test_elevations_renvoie_une_altitude_par_point_dans_lordre() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/height"
        payload = json.loads(request.read())
        assert payload["shape"] == [{"lat": 45.0, "lon": 5.0}, {"lat": 45.005, "lon": 5.005}]
        return httpx.Response(200, json={"height": [186.0, 210.5]})

    provider = _provider(handler)

    result = provider.elevations((DEPART, DESTINATION))

    assert result == (186.0, 210.5)


def test_altitude_nulle_pour_un_point_hors_couverture_leve_elevation_provider_error() -> None:
    """Valhalla renvoie `null` pour un point hors couverture SRTM/skadi --
    jamais une valeur par défaut silencieuse (fausserait D+/D-), cf.
    Boundaries de la spec-2-5 ("pas de métriques partielles")."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"height": [186.0, None]})

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


def test_altitude_booleenne_leve_elevation_provider_error() -> None:
    """`bool` est une sous-classe d'`int` en Python : `float(True/False)`
    vaudrait silencieusement `1.0`/`0.0` sans garde-fou explicite -- rejeté
    au même titre qu'une altitude `null`/non numérique ci-dessus."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"height": [186.0, True]})

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


def test_longueur_de_reponse_inattendue_leve_elevation_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"height": [186.0]})

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


def test_reponse_sans_cle_height_leve_elevation_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


@pytest.mark.parametrize("body", [[], {"height": None}, {"height": 42}])
def test_reponse_de_structure_inattendue_leve_elevation_provider_error(body: object) -> None:
    provider = _provider(lambda request: httpx.Response(200, json=body))

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


@pytest.mark.parametrize("altitude_json", ["NaN", "Infinity", "-Infinity"])
def test_altitude_non_finie_leve_elevation_provider_error(altitude_json: str) -> None:
    provider = _provider(
        lambda request: httpx.Response(200, content=f'{{"height":[186.0,{altitude_json}]}}'.encode())
    )

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


def test_erreur_serveur_leve_elevation_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="indisponible")

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))


def test_panne_reseau_leve_elevation_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connexion refusée", request=request)

    provider = _provider(handler)

    with pytest.raises(ElevationProviderError):
        provider.elevations((DEPART, DESTINATION))
