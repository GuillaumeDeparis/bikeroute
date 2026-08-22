"""`POST /api/auth/register` : crée le compte et ouvre la session immédiatement."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as DBSession

from ..config import Settings, get_settings
from ..db import get_db
from ..schemas.auth import ErrorResponse, RegisterRequest, RegisterResponse
from ..services.accounts import register_account

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=201,
    responses={
        409: {"model": ErrorResponse, "description": "Identifiant déjà utilisé."},
        422: {"model": ErrorResponse, "description": "Champ requis manquant ou mot de passe invalide."},
    },
)
def register(
    payload: RegisterRequest,
    response: Response,
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RegisterResponse:
    account, session = register_account(
        db,
        identifiant=payload.identifiant,
        mot_de_passe=payload.mot_de_passe,
        settings=settings,
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(session.id),
        max_age=settings.session_duration_days * 24 * 3600,
        expires=session.expires_at,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )

    return RegisterResponse.model_validate(account)
