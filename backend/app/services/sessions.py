"""Socle de session partagé par `register`/`login`/`logout`/`session` :
création, pose/effacement du cookie, résolution de l'identité connectée."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession

from ..config import Settings, get_settings
from ..db import get_db
from ..errors import AppError
from ..models.account import Account
from ..models.session import Session as SessionModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _session_invalide() -> AppError:
    return AppError(401, "SESSION_INVALIDE", "Session invalide ou expirée.", {})


def create_session(db: DBSession, *, account_id: uuid.UUID, settings: Settings) -> SessionModel:
    """Construit la ligne `sessions` (non committée : l'appelant décide du commit)."""
    now = _utcnow()
    session = SessionModel(
        account_id=account_id,
        created_at=now,
        expires_at=now + timedelta(days=settings.session_duration_days),
    )
    db.add(session)
    return session


def set_session_cookie(response: Response, session: SessionModel, settings: Settings) -> None:
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


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )


def invalidate_session(db: DBSession, session_id_raw: str | None) -> None:
    """Supprime la session en base si elle existe (l'appelant décide du
    commit, comme `create_session`). Ne lève jamais : un cookie absent,
    malformé ou déjà orphelin est un no-op (déconnexion idempotente)."""
    if not session_id_raw:
        return
    try:
        session_uuid = uuid.UUID(session_id_raw)
    except ValueError:
        return
    db.execute(delete(SessionModel).where(SessionModel.id == session_uuid))


def get_current_account(
    request: Request,
    db: DBSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Account:
    """Résout l'identité depuis le cookie de session ; 401 `SESSION_INVALIDE`
    si le cookie est absent, malformé, orphelin ou expiré. C'est la seule
    route qui établit *qui* est connecté ; l'autorisation par propriétaire
    sur une ressource métier reste entière à 1.3, au-dessus de cette identité."""
    session_id_raw = request.cookies.get(settings.session_cookie_name)
    if not session_id_raw:
        raise _session_invalide()

    try:
        session_uuid = uuid.UUID(session_id_raw)
    except ValueError:
        raise _session_invalide()

    session = db.execute(select(SessionModel).where(SessionModel.id == session_uuid)).scalar_one_or_none()
    if session is None or session.expires_at <= _utcnow():
        raise _session_invalide()

    account = db.execute(select(Account).where(Account.id == session.account_id)).scalar_one_or_none()
    if account is None:
        raise _session_invalide()

    return account
