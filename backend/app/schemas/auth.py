"""Schémas Pydantic pour `POST /api/auth/register`."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RegisterRequest(BaseModel):
    identifiant: str
    mot_de_passe: str


class RegisterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    identifiant: str
    created_at: datetime


class ErrorResponse(BaseModel):
    """Forme commune de toute erreur applicative (jamais le mot de passe)."""

    code: str
    message: str
    details: dict = {}
    correlationId: str
