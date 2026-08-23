"""Composition : construit l'implémentation `RoutingProvider` (Valhalla) à
partir des réglages applicatifs, injectée comme dépendance FastAPI dans
l'adaptateur entrant HTTP (`adapters/inbound/routes_router.py`).

Seul point du code qui sait que le fournisseur concret est Valhalla ; le
reste de l'application ne dépend que du protocole `RoutingProvider`."""

from __future__ import annotations

from functools import lru_cache

from ...config import get_settings
from ..adapters.outbound.valhalla_provider import ValhallaRoutingProvider


@lru_cache
def _routing_provider() -> ValhallaRoutingProvider:
    settings = get_settings()
    return ValhallaRoutingProvider(base_url=settings.valhalla_url, timeout_seconds=settings.valhalla_timeout_seconds)


def get_routing_provider() -> ValhallaRoutingProvider:
    return _routing_provider()


def shutdown_routing_provider() -> None:
    """Libère le client HTTP du singleton, s'il a été construit -- à appeler
    depuis le teardown de `_lifespan` (`main.py`). Vide aussi le cache : sans
    quoi un prochain `get_routing_provider()` (ex. le prochain cycle
    démarrage/arrêt rejoué par `TestClient` à chaque test) renverrait
    l'instance déjà fermée ci-dessus plutôt que d'en reconstruire une."""
    if _routing_provider.cache_info().currsize > 0:
        _routing_provider().close()
    _routing_provider.cache_clear()
