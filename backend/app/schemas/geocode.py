"""Schéma de `GET /api/geocode` (recherche d'adresse, UX-DR17)."""

from __future__ import annotations

from pydantic import BaseModel


class ResultatRecherche(BaseModel):
    label: str
    lat: float
    lon: float
