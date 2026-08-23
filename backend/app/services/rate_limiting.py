"""Limiteur de débit en mémoire, fenêtre glissante par clé (IP + identifiant).

Adapté à un déploiement mono-processus ; à remplacer par un backend partagé
(Redis, ...) si l'API tourne un jour derrière plusieurs workers/instances,
où cet état en mémoire ne serait plus cohérent entre eux.
"""

from __future__ import annotations

import time
from collections import defaultdict

from ..errors import AppError

_attempts: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, *, max_attempts: int, window_seconds: float) -> None:
    """Enregistre une tentative pour `key` et lève 429 si `max_attempts` a été
    atteint sur les `window_seconds` dernières secondes."""
    now = time.monotonic()
    horizon = now - window_seconds
    attempts = _attempts[key]
    attempts[:] = [t for t in attempts if t > horizon]
    if len(attempts) >= max_attempts:
        raise AppError(
            429,
            "TROP_DE_TENTATIVES",
            "Trop de tentatives. Réessayez plus tard.",
            {},
        )
    attempts.append(now)


def reset_rate_limits() -> None:
    """Réservé aux tests : vide l'état en mémoire entre deux cas, pour que la
    limite ne s'accumule pas au fil d'une suite qui ne teste pas elle-même
    le rate limiting."""
    _attempts.clear()
