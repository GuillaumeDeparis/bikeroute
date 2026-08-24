"""Schémas Pydantic de `POST /api/routes/calculate` -- propres à cet
adaptateur HTTP (AD-1) : le domaine et l'application n'en ont pas besoin."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from ...domain.metrics import Difficulte


class PointEntreeRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class CalculerParcoursRequest(BaseModel):
    # Au moins départ + destination ; borne haute levée en Story 2.2 pour
    # les topologies boucle/multi-étapes (le moteur route déjà n'importe
    # quelle liste ordonnée de points, cf. spec-2-2).
    points: list[PointEntreeRequest] = Field(min_length=2, max_length=50)


class PointResponse(BaseModel):
    lat: float
    lon: float


class MetriquesResponse(BaseModel):
    # Méthode de calcul unique et versionnée (NFR-9) : traçabilité de la
    # méthode qui a produit ces valeurs, même si elle change ensuite (cf.
    # `domain/metrics.py`).
    version: str
    distance_m: float
    denivele_positif_m: float
    denivele_negatif_m: float
    duree_s: float
    difficulte: Difficulte


class ParcoursResponse(BaseModel):
    id: UUID
    statut: str
    geometry: list[PointResponse]
    unrouted_points: list[PointResponse]
    provider: str
    provider_version: str
    created_at: datetime
    # `None` pour un parcours non routé -- même garde que `geometry`
    # (`routes_router.py`) : aucune métrique affichée hors statut "routed"
    # (Boundaries de la spec-2-5).
    metriques: MetriquesResponse | None = None
