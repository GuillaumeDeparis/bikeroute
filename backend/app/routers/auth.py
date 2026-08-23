"""Routes d'authentification : `POST /register`, `POST /login`, `POST /logout`,
`GET /session`, `GET /sessions`, `DELETE /sessions/{session_id}`."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError
from ..models.account import Account
from ..models.session import Session as SessionModel
from ..schemas.auth import (
    AccountResponse,
    ErrorResponse,
    LoginRequest,
    RegisterRequest,
    SessionListItem,
    SessionResponse,
)
from ..services.accounts import authenticate_account, register_account
from ..services.authorization import get_owned_or_404
from ..services.sessions import (
    clear_session_cookie,
    create_session,
    get_current_account,
    invalidate_session,
    list_active_sessions,
    resolve_current_session,
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


@router.get(
    "/sessions",
    response_model=list[SessionListItem],
    status_code=200,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
    },
)
def list_sessions(
    response: Response,
    account: Account = Depends(get_current_account),
    current_session: SessionModel = Depends(resolve_current_session),
    db: DBSession = Depends(get_db),
) -> list[SessionListItem]:
    """Sessions actives du compte authentifié ; `current: true` sur celle du
    cookie de la requête en cours."""
    # Même précaution que `GET /session` : données liées à l'identité, jamais
    # mises en cache.
    response.headers["Cache-Control"] = "no-store"
    sessions = list_active_sessions(db, account.id)
    return [
        SessionListItem(
            id=s.id,
            created_at=s.created_at,
            expires_at=s.expires_at,
            current=s.id == current_session.id,
        )
        for s in sessions
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=204,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
        404: {"model": ErrorResponse, "description": "Session introuvable ou n'appartenant pas à ce compte."},
    },
)
def revoke_session(
    session_id: uuid.UUID,
    response: Response,
    account: Account = Depends(get_current_account),
    current_session: SessionModel = Depends(resolve_current_session),
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Révoque une session du compte authentifié. 404 `RESSOURCE_INTROUVABLE`
    (jamais 403) si `session_id` n'existe pas ou appartient à un autre
    compte -- les deux cas sont indiscernables pour l'appelant (cf.
    `services/authorization.get_owned_or_404`). Efface aussi le cookie si la
    session révoquée est celle de la requête en cours.

    Délègue la suppression à `invalidate_session` (même chemin que
    `logout`) plutôt qu'un `db.delete` propre à cette route, pour qu'il n'y
    ait qu'une seule façon de supprimer une session dans tout le module."""
    target = get_owned_or_404(db, SessionModel, session_id, account.id)
    # Capturée avant suppression/commit : ne dépend pas de `expire_on_commit`
    # (configuré à `False` dans `db.py`, mais autant ne pas en dépendre ici).
    target_id = target.id

    invalidate_session(db, str(target_id))
    db.commit()

    if target_id == current_session.id:
        clear_session_cookie(response, settings)
