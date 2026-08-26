"""Adaptateur sortant `ElevationProvider` vers Valhalla (`/height`, AD-8).

Seul module qui interroge ce point d'accès Valhalla directement -- toute
autre couche passe par le protocole `ElevationProvider`. Sert les mêmes
tuiles d'élévation (SRTM/skadi, cf. `docker-compose.yml`) que celles servant
déjà au routage vélo (`valhalla_provider.py`), sur la même instance --
patron d'erreurs/injection de client/singleton identique."""

from __future__ import annotations

from math import isfinite

import httpx

from ...application.ports import ElevationProviderError
from ...domain.models import Coordinate


class ValhallaElevationProvider:
    """Implémente `ElevationProvider` via l'API HTTP Valhalla (`/height`)."""

    def __init__(self, *, base_url: str, timeout_seconds: float, client: httpx.Client | None = None) -> None:
        # `client` injectable : les tests de contrat passent un transport
        # factice (`httpx.MockTransport`) sans jamais toucher le réseau.
        self._owns_client = client is None
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout_seconds)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def elevations(self, points: tuple[Coordinate, ...]) -> tuple[float, ...]:
        payload = {"shape": [{"lat": point.lat, "lon": point.lon} for point in points]}
        try:
            response = self._client.post("/height", json=payload)
        except httpx.HTTPError as exc:
            raise ElevationProviderError("Valhalla (élévation) injoignable.") from exc

        if response.status_code >= 400:
            raise ElevationProviderError(f"Valhalla (élévation) a répondu {response.status_code}.")

        try:
            body = response.json()
            if not isinstance(body, dict):
                raise TypeError("corps non objet")
            heights = body["height"]
            if not isinstance(heights, list):
                raise TypeError("altitudes non listées")
        except (ValueError, KeyError, TypeError) as exc:
            raise ElevationProviderError("Réponse Valhalla (élévation) inattendue.") from exc

        if len(heights) != len(points):
            raise ElevationProviderError(
                f"Réponse Valhalla (élévation) inattendue "
                f"(`/height` a renvoyé {len(heights)} valeur(s) pour {len(points)} point(s))."
            )

        try:
            # Un point hors couverture SRTM/skadi (rarissime pour un usage
            # cyclable, mais possible) renvoie `null` côté Valhalla -- traité
            # comme une réponse fournisseur inattendue plutôt qu'une valeur
            # par défaut silencieuse (0 m fausserait D+/D-) : cohérent avec
            # "pas de métriques partielles" (Boundaries de la spec-2-5).
            # `bool` est une sous-classe d'`int` en Python : `float(True)`
            # vaudrait silencieusement `1.0` sans ce garde-fou explicite --
            # rejeté au même titre qu'une altitude non numérique.
            elevations = tuple(float(height) for height in heights if not isinstance(height, bool))
            if len(elevations) != len(heights) or any(not isfinite(elevation) for elevation in elevations):
                raise ValueError("altitude booléenne ou non finie")
            return elevations
        except (TypeError, ValueError) as exc:
            raise ElevationProviderError("Réponse Valhalla (élévation) inattendue (altitude non numérique).") from exc
