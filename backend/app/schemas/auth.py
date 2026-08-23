"""Schémas Pydantic pour `POST /register`, `POST /login`, `POST /logout`,
`GET /session`, `GET /sessions` et `DELETE /sessions/{session_id}`."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RegisterRequest(BaseModel):
    identifiant: str
    mot_de_passe: str


class LoginRequest(BaseModel):
    identifiant: str
    mot_de_passe: str


class AccountResponse(BaseModel):
    """Représentation publique d'un compte (jamais `password_hash`)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    identifiant: str
    created_at: datetime


class SessionResponse(BaseModel):
    """Identité résolue depuis le cookie de session par `GET /session`."""

    model_config = ConfigDict(from_attributes=True)

    identifiant: str


class SessionListItem(BaseModel):
    """Une ligne de `GET /sessions` : identité technique de la session, sans
    jamais exposer `account_id` (déjà implicite -- la liste est scopée par le
    compte authentifié)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    expires_at: datetime
    current: bool


class ErrorResponse(BaseModel):
    """Forme commune de toute erreur applicative (jamais le mot de passe)."""

    code: str
    message: str
    details: dict = {}
    correlationId: str
