"""Schémas Pydantic de `POST /api/routes/calculate` -- propres à cet
adaptateur HTTP (AD-1) : le domaine et l'application n'en ont pas besoin."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


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


class ParcoursResponse(BaseModel):
    id: UUID
    statut: str
    geometry: list[PointResponse]
    unrouted_points: list[PointResponse]
    provider: str
    provider_version: str
    created_at: datetime
