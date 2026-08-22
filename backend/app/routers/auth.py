"""Routes d'authentification : `POST /register`, `POST /login`, `POST /logout`,
`GET /session`."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError
from ..models.account import Account
from ..schemas.auth import AccountResponse, ErrorResponse, LoginRequest, RegisterRequest, SessionResponse
from ..services.accounts import authenticate_account, register_account
from ..services.sessions import (
    clear_session_cookie,
    create_session,
    get_current_account,
    invalidate_session,
    set_session_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AccountResponse,
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
) -> AccountResponse:
    account, session = register_account(
        db,
        identifiant=payload.identifiant,
        mot_de_passe=payload.mot_de_passe,
        settings=settings,
    )

    set_session_cookie(response, session, settings)

    return AccountResponse.model_validate(account)


@router.post(
    "/login",
    response_model=AccountResponse,
    status_code=200,
    responses={
        401: {"model": ErrorResponse, "description": "Identifiant ou mot de passe incorrect."},
    },
)
def login(
    payload: LoginRequest,
    response: Response,
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccountResponse:
    account = authenticate_account(
        db,
        identifiant=payload.identifiant,
        mot_de_passe=payload.mot_de_passe,
        settings=settings,
    )

    session = create_session(db, account_id=account.id, settings=settings)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Course rare mais réelle : le compte a pu être supprimé entre la
        # vérification des identifiants et la création de la session. Même
        # traitement que toute autre défaillance d'authentification : 401
        # générique, jamais une 500.
        raise AppError(401, "IDENTIFIANTS_INVALIDES", "Identifiant ou mot de passe incorrect.", {}) from exc

    set_session_cookie(response, session, settings)

    return AccountResponse.model_validate(account)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Invalide la session en base (pas seulement le cookie). Idempotent :
    un cookie absent ou déjà invalide renvoie tout de même 204."""
    session_id_raw = request.cookies.get(settings.session_cookie_name)
    invalidate_session(db, session_id_raw)
    db.commit()
    clear_session_cookie(response, settings)


@router.get(
    "/session",
    response_model=SessionResponse,
    status_code=200,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
    },
)
def session(response: Response, account: Account = Depends(get_current_account)) -> SessionResponse:
    # Réponse liée à l'identité résolue depuis le cookie de session : jamais
    # mise en cache (navigateur, proxy intermédiaire, ...).
    response.headers["Cache-Control"] = "no-store"
    return SessionResponse.model_validate(account)
