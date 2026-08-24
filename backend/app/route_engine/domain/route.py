"""Entité de domaine `Route` : un tracé calculé pour un compte donné.

Pure elle aussi (AD-1) : ne connaît ni la table `routes` (SQLAlchemy) ni la
réponse HTTP renvoyée à l'appelant -- ces deux traductions vivent dans les
adaptateurs sortant/entrant respectifs.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from .metrics import RouteMetrics
from .models import Coordinate, RouteResult

# Statuts persistés/exposés pour un tracé. Seuls ces deux-là existent en V1
# (un aller simple à deux points est soit entièrement routé, soit non routé
# faute d'un point rattachable) ; un statut "partiel" n'aurait de sens qu'à
# partir de plusieurs segments indépendants (multi-étapes, Story 2.2).
STATUT_ROUTE = "routed"
STATUT_NON_ROUTE = "non_route"


def statut_pour(result: RouteResult) -> str:
    return STATUT_ROUTE if result.est_route else STATUT_NON_ROUTE


@dataclass(frozen=True, slots=True)
class Route:
    """Tracé persisté : identité + points d'entrée + résultat de routage."""

    id: uuid.UUID
    account_id: uuid.UUID
    points: tuple[Coordinate, ...]
    result: RouteResult
    statut: str
    created_at: datetime
    # `None` pour un parcours non routé (même garde que `geometry` côté
    # adaptateur entrant, cf. `routes_router.py`) -- jamais de métriques
    # partielles (Boundaries de la spec-2-5).
    metrics: RouteMetrics | None = None
