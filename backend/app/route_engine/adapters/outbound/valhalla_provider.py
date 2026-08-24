"""Adaptateur sortant `RoutingProvider` vers Valhalla (AD-8).

Seul module du code où l'API HTTP Valhalla est appelée directement -- toute
autre couche passe par le protocole `RoutingProvider`.

Valhalla ne désigne pas de façon fiable, dans l'erreur d'un `/route` en
échec, lequel des points fournis est en cause. On vérifie donc d'abord,
point par point mais en un seul appel groupé, la rattachabilité au réseau
via `/locate` ; seuls des points tous rattachables déclenchent l'appel
`/route`. Comportement vérifié contre une vraie instance Valhalla 3.8.3
servant le corpus minimal `deploy/valhalla/corpus.osm.pbf` (cf. tests de
contrat) : un point hors réseau renvoie `"edges": []` sur `/locate`.
"""

from __future__ import annotations

import httpx

from ...domain.models import Coordinate, RouteResult
from ...application.ports import RoutingProviderError

# "bicycle" : seul profil pertinent pour BikeRoute (aucun paramètre sportif
# exposé à l'utilisateur en V1, cf. Boundaries de la spec -- le profil de
# costing par défaut de Valhalla suffit).
_COSTING = "bicycle"
# `bicycle_type: "road"` : profil vélo de route pour un calcul d'itinéraire
# cohérent avec l'usage BikeRoute (`use_roads` reste au défaut Valhalla,
# seul `bicycle_type` est fixé en V1).
_COSTING_OPTIONS = {"bicycle": {"bicycle_type": "road"}}


def _decode_polyline6(encoded: str) -> tuple[Coordinate, ...]:
    """Décode une polyligne encodée précision 6 (format `shape` de Valhalla,
    variante à 1e6 de l'algorithme Google Encoded Polyline)."""
    coords: list[Coordinate] = []
    index = 0
    lat = 0
    lon = 0
    length = len(encoded)
    try:
        while index < length:
            for is_lat in (True, False):
                shift = 0
                result = 0
                while True:
                    byte = ord(encoded[index]) - 63
                    index += 1
                    result |= (byte & 0x1F) << shift
                    shift += 5
                    if byte < 0x20:
                        break
                delta = ~(result >> 1) if result & 1 else (result >> 1)
                if is_lat:
                    lat += delta
                else:
                    lon += delta
            coords.append(Coordinate(lat=lat / 1e6, lon=lon / 1e6))
    except IndexError as exc:
        # Chaîne tronquée/malformée (dernier groupe d'octets incomplet) :
        # traité comme une réponse fournisseur invalide, jamais comme un
        # crash -- même contrat que les autres échecs de ce module.
        raise RoutingProviderError("Forme du tracé invalide.") from exc
    return tuple(coords)


class ValhallaRoutingProvider:
    """Implémente `RoutingProvider` via l'API HTTP Valhalla."""

    def __init__(self, *, base_url: str, timeout_seconds: float, client: httpx.Client | None = None) -> None:
        # `client` injectable : les tests de contrat passent un transport
        # factice (`httpx.MockTransport`) sans jamais toucher le réseau.
        self._owns_client = client is None
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout_seconds)
        self._version_cache: str | None = None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def route(self, points: list[Coordinate]) -> RouteResult:
        version = self._version()

        unrouted = self._points_non_rattachables(points)
        if unrouted:
            return RouteResult(geometry=(), unrouted_points=tuple(unrouted), provider="valhalla", version=version)

        payload = {
            "locations": [{"lat": point.lat, "lon": point.lon} for point in points],
            "costing": _COSTING,
            "costing_options": _COSTING_OPTIONS,
        }
        try:
            response = self._client.post("/route", json=payload)
        except httpx.HTTPError as exc:
            raise RoutingProviderError("Valhalla injoignable.") from exc

        if response.status_code >= 500:
            raise RoutingProviderError(f"Valhalla a répondu {response.status_code}.")
        if response.status_code >= 400:
            # Course rare : un point a pu devenir non routable entre le
            # pré-contrôle `/locate` ci-dessus et cet appel. Traité comme un
            # résultat "non routé" (jamais un segment direct trompeur),
            # plutôt que comme une erreur fournisseur.
            return RouteResult(geometry=(), unrouted_points=tuple(points), provider="valhalla", version=version)

        try:
            body = response.json()
        except ValueError as exc:
            raise RoutingProviderError("Réponse Valhalla inattendue (corps non-JSON).") from exc
        try:
            legs = body["trip"]["legs"]
            shapes = [leg["shape"] for leg in legs]
            if not shapes:
                raise KeyError("legs")
        except (KeyError, IndexError) as exc:
            raise RoutingProviderError("Réponse Valhalla inattendue (forme du tracé absente).") from exc

        # `trip.summary.time` (secondes) : ignoré jusqu'ici, désormais lu pour
        # `RouteResult.duration_s` (spec-2-5, calcul des métriques). Absence
        # ou type invalide traité comme une réponse fournisseur inattendue --
        # même sévérité que la forme du tracé ci-dessus, jamais une durée par
        # défaut silencieuse qui fausserait la métrique persistée.
        try:
            temps = body["trip"]["summary"]["time"]
            # `bool` est une sous-classe d'`int` en Python : `float(True)`
            # vaudrait silencieusement `1.0` sans ce garde-fou explicite.
            # Rejeté au même titre qu'une valeur négative (impossible pour
            # une durée de trajet) -- jamais une conversion silencieuse.
            if isinstance(temps, bool) or float(temps) < 0:
                raise ValueError("durée du trajet invalide")
            duration_s = float(temps)
        except (KeyError, TypeError, ValueError) as exc:
            raise RoutingProviderError("Réponse Valhalla inattendue (durée du trajet absente).") from exc

        # N points (Story 2.2 : boucle/multi-étapes) produisent N-1 legs, un
        # par segment consécutif -- ne garder que `legs[0]` tronquait le tracé
        # à son premier segment. Chaque jonction entre deux legs partage son
        # point de coordonnées (fin du leg précédent = début du suivant) : on
        # ne le duplique pas dans la géométrie concaténée.
        geometry: list[Coordinate] = []
        for index, shape in enumerate(shapes):
            decoded = _decode_polyline6(shape)
            geometry.extend(decoded[1:] if index > 0 else decoded)

        return RouteResult(
            geometry=tuple(geometry),
            unrouted_points=(),
            provider="valhalla",
            version=version,
            duration_s=duration_s,
        )

    def _points_non_rattachables(self, points: list[Coordinate]) -> list[Coordinate]:
        payload = {
            "locations": [{"lat": point.lat, "lon": point.lon} for point in points],
            "costing": _COSTING,
        }
        try:
            response = self._client.post("/locate", json=payload)
        except httpx.HTTPError as exc:
            raise RoutingProviderError("Valhalla injoignable.") from exc

        if response.status_code >= 500:
            raise RoutingProviderError(f"Valhalla a répondu {response.status_code}.")
        if response.status_code >= 400:
            # Réponse `/locate` en échec pour l'ensemble de la requête : on
            # ne peut affirmer qu'aucun point n'est rattachable, mais on ne
            # peut pas non plus poursuivre vers `/route` -- traité comme
            # "tous non routés" plutôt que comme une erreur fournisseur, par
            # cohérence avec le traitement de `/route` ci-dessus.
            return list(points)

        try:
            body = response.json()
        except ValueError as exc:
            raise RoutingProviderError("Réponse Valhalla inattendue (corps non-JSON).") from exc

        if len(body) != len(points):
            # Désaccord de longueur entre la requête et la réponse `/locate` :
            # une association point<->entrée par position serait alors
            # arbitraire, exactement le risque de statut/segment trompeur que
            # la story interdit. Traité comme une erreur fournisseur plutôt
            # que comme un résultat métier.
            raise RoutingProviderError(
                f"Réponse Valhalla inattendue (`/locate` a renvoyé {len(body)} entrée(s) pour {len(points)} point(s))."
            )

        return [point for point, entry in zip(points, body, strict=True) if not entry.get("edges")]

    def _version(self) -> str:
        if self._version_cache is not None:
            return self._version_cache
        try:
            response = self._client.get("/status")
            response.raise_for_status()
            self._version_cache = str(response.json().get("version", "inconnue"))
        except (httpx.HTTPError, ValueError):
            # La version n'est qu'informative (traçabilité/debug) : ni son
            # indisponibilité réseau/HTTP, ni un corps non-JSON inattendu, ne
            # doivent jamais empêcher un calcul par ailleurs réussi.
            self._version_cache = "inconnue"
        return self._version_cache
