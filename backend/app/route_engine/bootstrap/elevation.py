"""Composition : construit l'implémentation `ElevationProvider` (Valhalla) à
partir des réglages applicatifs, injectée comme dépendance FastAPI dans
l'adaptateur entrant HTTP (`adapters/inbound/routes_router.py`).

Seul point du code qui sait que le fournisseur concret est Valhalla ; le
reste de l'application ne dépend que du protocole `ElevationProvider`. Même
patron que `bootstrap/routing.py` -- même instance Valhalla (`valhalla_url`),
un point d'accès différent (`/height`, cf. l'adaptateur)."""

from __future__ import annotations

from functools import lru_cache

from ...config import get_settings
from ..adapters.outbound.valhalla_elevation_provider import ValhallaElevationProvider


@lru_cache
def _elevation_provider() -> ValhallaElevationProvider:
    settings = get_settings()
    return ValhallaElevationProvider(base_url=settings.valhalla_url, timeout_seconds=settings.valhalla_timeout_seconds)


def get_elevation_provider() -> ValhallaElevationProvider:
    return _elevation_provider()


def shutdown_elevation_provider() -> None:
    """Libère le client HTTP du singleton, s'il a été construit -- à appeler
    depuis le teardown de `_lifespan` (`main.py`). Vide aussi le cache : sans
    quoi un prochain `get_elevation_provider()` (ex. le prochain cycle
    démarrage/arrêt rejoué par `TestClient` à chaque test) renverrait
    l'instance déjà fermée ci-dessus plutôt que d'en reconstruire une."""
    if _elevation_provider.cache_info().currsize > 0:
        _elevation_provider().close()
    _elevation_provider.cache_clear()
