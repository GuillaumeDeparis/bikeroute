"""Test de contrat de l'adaptateur `ValhallaRoutingProvider` face au
protocole `RoutingProvider` (AD-8).

N'exige aucune connexion réseau vers un vrai Valhalla (cf. Boundaries de la
spec) : le transport HTTP est remplacé par un `httpx.MockTransport` dont les
réponses reproduisent, telles quelles, celles capturées en faisant tourner
une vraie instance Valhalla 3.8.3 sur le corpus OSM minimal et déterministe
`deploy/valhalla/corpus.osm.pbf` (généré depuis `corpus.osm.xml`, cf. ce
répertoire) :

- `depart`  = (45.0000, 5.0000)  -- nœud du corpus, sur le réseau.
- `destination` = (45.0050, 5.0050) -- nœud du corpus, relié à `depart` par
  la boucle de voirie du corpus (via Rue Ouest puis Rue Nord).
- `hors_reseau` = (45.5000, 6.5000) -- en dehors de la zone couverte par le
  corpus : Valhalla renvoie `"edges": []` sur `/locate`.
"""

from __future__ import annotations

import httpx
import pytest

from app.route_engine.adapters.outbound.valhalla_provider import ValhallaRoutingProvider
from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.domain.models import Coordinate, SegmentAttribut

DEPART = Coordinate(lat=45.0000, lon=5.0000)
DESTINATION = Coordinate(lat=45.0050, lon=5.0050)
HORS_RESEAU = Coordinate(lat=45.5000, lon=6.5000)

_STATUS_BODY = {"version": "3.8.3"}

_LOCATE_RATTACHABLE_ENTRY = {
    "edges": [{"way_id": 101, "correlated_lat": 45.0, "correlated_lon": 5.0}],
    "nodes": [{"lon": 5.0, "lat": 45.0}],
}
_LOCATE_NON_RATTACHABLE_ENTRY = {"edges": [], "nodes": []}

# Capturé contre un vrai `valhalla_service` servant le corpus minimal :
# décode en [(45.0, 5.0), (45.005, 5.0), (45.005, 5.005)] (précision 1e6).
_ROUTE_SHAPE = "_sqytA_sdpHowH??owH"

# Corps `/trace_attributes` (spec-2-5) : `edges[].length` en kilomètres,
# converti en mètres côté adaptateur -- 0.3 km puis 0.2 km ici.
_TRACE_ATTRIBUTES_BODY = {
    "edges": [
        {"length": 0.3, "surface": "paved", "road_class": "residential"},
        {"length": 0.2, "surface": "gravel", "road_class": "unclassified"},
    ]
}


def _encode_polyline6(coords: list[tuple[float, float]]) -> str:
    """Encode l'inverse exact de `_decode_polyline6` -- sert uniquement à
    fabriquer des `shape` de test synthétiques (legs multiples) sans dépendre
    d'une capture réelle contre Valhalla."""

    def _encode_delta(delta: int) -> str:
        value = ((~delta) << 1) | 1 if delta < 0 else delta << 1
        chunks = []
        while value >= 0x20:
            chunks.append((value & 0x1F) | 0x20)
            value >>= 5
        chunks.append(value)
        return "".join(chr(chunk + 63) for chunk in chunks)

    out: list[str] = []
    prev_lat = prev_lon = 0
    for lat, lon in coords:
        ilat, ilon = round(lat * 1_000_000), round(lon * 1_000_000)
        out.append(_encode_delta(ilat - prev_lat))
        out.append(_encode_delta(ilon - prev_lon))
        prev_lat, prev_lon = ilat, ilon
    return "".join(out)


def _provider(handler) -> ValhallaRoutingProvider:
    client = httpx.Client(base_url="http://valhalla.test", transport=httpx.MockTransport(handler))
    return ValhallaRoutingProvider(base_url="http://valhalla.test", timeout_seconds=1.0, client=client)


def test_route_deux_points_rattachables_decode_la_geometrie() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(
                200, json={"trip": {"legs": [{"shape": _ROUTE_SHAPE}], "summary": {"time": 187.0}}}
            )
        if request.url.path == "/trace_attributes":
            return httpx.Response(200, json=_TRACE_ATTRIBUTES_BODY)
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    result = provider.route([DEPART, DESTINATION])

    assert result.provider == "valhalla"
    assert result.version == "3.8.3"
    assert result.unrouted_points == ()
    assert [(c.lat, c.lon) for c in result.geometry] == [(45.0, 5.0), (45.005, 5.0), (45.005, 5.005)]
    assert result.duration_s == 187.0
    # `/trace_attributes` (spec-2-5) : `edges[].length` (km) converti en
    # mètres, revêtement/catégorie tels quels.
    assert result.surface_segments == (
        SegmentAttribut(distance_m=300.0, valeur="paved"),
        SegmentAttribut(distance_m=200.0, valeur="gravel"),
    )
    assert result.road_class_segments == (
        SegmentAttribut(distance_m=300.0, valeur="residential"),
        SegmentAttribut(distance_m=200.0, valeur="unclassified"),
    )


def test_route_plus_de_deux_points_concatene_tous_les_legs() -> None:
    """Story 2.2 (boucle/multi-étapes) : Valhalla renvoie un `leg` par
    segment consécutif pour N>2 `locations` -- ne garder que `legs[0]`
    tronquerait la géométrie à son premier segment. Chaque jonction entre
    deux legs partage son point de coordonnées ; il ne doit pas être
    dupliqué dans la géométrie concaténée."""
    waypoint = Coordinate(lat=45.001, lon=5.001)
    leg1_shape = _encode_polyline6([(45.0, 5.0), (45.001, 5.001)])
    leg2_shape = _encode_polyline6([(45.001, 5.001), (45.0, 5.0)])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY] * 3)
        if request.url.path == "/route":
            return httpx.Response(
                200,
                json={
                    "trip": {
                        "legs": [{"shape": leg1_shape}, {"shape": leg2_shape}],
                        "summary": {"time": 340.0},
                    }
                },
            )
        if request.url.path == "/trace_attributes":
            return httpx.Response(200, json={"edges": []})
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    result = provider.route([DEPART, waypoint, DEPART])

    assert [(c.lat, c.lon) for c in result.geometry] == [(45.0, 5.0), (45.001, 5.001), (45.0, 5.0)]
    assert result.duration_s == 340.0


def test_point_hors_reseau_est_marque_non_route_sans_appeler_route() -> None:
    appels_route = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_NON_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            appels_route.append(request)
            raise AssertionError("`/route` ne doit pas être appelé si un point n'est pas rattachable.")
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    result = provider.route([DEPART, HORS_RESEAU])

    assert result.geometry == ()
    assert result.unrouted_points == (HORS_RESEAU,)
    assert appels_route == []


def test_erreur_route_apres_locate_optimiste_est_traitee_comme_non_route() -> None:
    """Course rare (cf. commentaire de l'adaptateur) : `/locate` juge les
    deux points rattachables mais `/route` échoue quand même (400, réponse
    Valhalla réelle capturée : `error_code` 171)."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(
                400,
                json={"error_code": 171, "error": "No suitable edges near location", "status_code": 400},
            )
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    result = provider.route([DEPART, DESTINATION])

    assert result.geometry == ()
    assert result.unrouted_points == (DEPART, DESTINATION)


def test_erreur_serveur_leve_routing_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(503, text="indisponible")
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def test_panne_reseau_leve_routing_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connexion refusée", request=request)

    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def test_duree_du_trajet_absente_leve_routing_provider_error() -> None:
    """`trip.summary.time` absent (spec-2-5) : même sévérité que la forme du
    tracé absente -- jamais une durée par défaut silencieuse."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(200, json={"trip": {"legs": [{"shape": _ROUTE_SHAPE}]}})
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def _handler_route_ok_avec_trace_attributes(trace_attributes_response: httpx.Response):
    """Fabrique un handler `/status`+`/locate`+`/route` réussis (mêmes corps
    que `test_route_deux_points_rattachables_decode_la_geometrie`), pour ne
    tester que le comportement de `/trace_attributes` ci-dessous."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(
                200, json={"trip": {"legs": [{"shape": _ROUTE_SHAPE}], "summary": {"time": 187.0}}}
            )
        if request.url.path == "/trace_attributes":
            return trace_attributes_response
        raise AssertionError(f"URL inattendue : {request.url}")

    return handler


def test_trace_attributes_surface_et_road_class_absents_deviennent_inconnu() -> None:
    """`edges[].surface`/`road_class` absents (spec-2-5, NFR-10) : jamais
    repliés dans une valeur favorable, toujours `"inconnu"`."""
    handler = _handler_route_ok_avec_trace_attributes(
        httpx.Response(200, json={"edges": [{"length": 0.5}]})
    )
    provider = _provider(handler)

    result = provider.route([DEPART, DESTINATION])

    assert result.surface_segments == (SegmentAttribut(distance_m=500.0, valeur="inconnu"),)
    assert result.road_class_segments == (SegmentAttribut(distance_m=500.0, valeur="inconnu"),)


def test_trace_attributes_en_echec_leve_routing_provider_error() -> None:
    """Matrice I/O de la spec : `/trace_attributes` indisponible/erreur ->
    même `RoutingProviderError` (même 502 côté API) que le reste."""
    handler = _handler_route_ok_avec_trace_attributes(httpx.Response(502, text="indisponible"))
    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def test_trace_attributes_reponse_sans_edges_leve_routing_provider_error() -> None:
    handler = _handler_route_ok_avec_trace_attributes(httpx.Response(200, json={}))
    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def test_trace_attributes_edge_non_objet_leve_routing_provider_error() -> None:
    """Revue post-implémentation : un élément d'`edges` qui n'est pas un
    objet (ex. une chaîne, dans un corps par ailleurs malformé) ferait lever
    `AttributeError` sur `.get(...)` sans le garde-fou explicite -- doit
    rester un `RoutingProviderError` propre, jamais une exception non gérée."""
    handler = _handler_route_ok_avec_trace_attributes(httpx.Response(200, json={"edges": ["pas un objet"]}))
    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


@pytest.mark.parametrize("longueur_invalide", [True, False, -0.5])
def test_trace_attributes_longueur_booleenne_ou_negative_leve_routing_provider_error(
    longueur_invalide: object,
) -> None:
    """Même garde que `duration_s` (`route()`) et les altitudes de
    `ValhallaElevationProvider` -- `bool` est une sous-classe d'`int` en
    Python (`float(True)` vaudrait silencieusement `1.0`), et une longueur
    négative n'a de toute façon aucun sens."""
    handler = _handler_route_ok_avec_trace_attributes(
        httpx.Response(200, json={"edges": [{"length": longueur_invalide, "surface": "paved"}]})
    )
    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


def test_trace_attributes_surface_uniquement_des_espaces_devient_inconnu() -> None:
    """Une valeur `surface`/`road_class` qui n'est qu'un espace (chaîne vide
    après `strip()`) est traitée comme "inconnu", jamais comme un libellé
    errant fait uniquement d'espaces (revue post-implémentation)."""
    handler = _handler_route_ok_avec_trace_attributes(
        httpx.Response(200, json={"edges": [{"length": 0.5, "surface": "   ", "road_class": "\t"}]})
    )
    provider = _provider(handler)

    result = provider.route([DEPART, DESTINATION])

    assert result.surface_segments == (SegmentAttribut(distance_m=500.0, valeur="inconnu"),)
    assert result.road_class_segments == (SegmentAttribut(distance_m=500.0, valeur="inconnu"),)


def test_trace_attributes_panne_reseau_leve_routing_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(
                200, json={"trip": {"legs": [{"shape": _ROUTE_SHAPE}], "summary": {"time": 187.0}}}
            )
        if request.url.path == "/trace_attributes":
            raise httpx.ConnectError("connexion refusée", request=request)
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])


@pytest.mark.parametrize("temps_invalide", [True, False, -1.0])
def test_duree_du_trajet_booleenne_ou_negative_leve_routing_provider_error(temps_invalide: object) -> None:
    """`bool` est une sous-classe d'`int` en Python : `float(True/False)`
    vaudrait silencieusement `1.0`/`0.0` sans garde-fou explicite -- et une
    durée négative n'a de toute façon aucun sens. Les deux doivent être
    rejetés au même titre qu'une durée absente, jamais convertis en silence."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/status":
            return httpx.Response(200, json=_STATUS_BODY)
        if request.url.path == "/locate":
            return httpx.Response(200, json=[_LOCATE_RATTACHABLE_ENTRY, _LOCATE_RATTACHABLE_ENTRY])
        if request.url.path == "/route":
            return httpx.Response(
                200, json={"trip": {"legs": [{"shape": _ROUTE_SHAPE}], "summary": {"time": temps_invalide}}}
            )
        raise AssertionError(f"URL inattendue : {request.url}")

    provider = _provider(handler)

    with pytest.raises(RoutingProviderError):
        provider.route([DEPART, DESTINATION])
