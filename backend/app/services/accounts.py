"""Cœur métier de l'inscription : hachage Argon2id, création compte + session,
détection d'identifiant déjà pris (insensible à la casse)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.low_level import Type
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from ..config import Settings
from ..errors import AppError
from ..models.account import IDENTIFIANT_MAX_LENGTH, Account
from ..models.session import Session as SessionModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _build_hasher(settings: Settings) -> PasswordHasher:
    # Réglages lus depuis `config.py` (jamais codés en dur ici) pour rester
    # ajustables sans toucher au code, comme le reste de la politique
    # d'inscription.
    return PasswordHasher(
        time_cost=settings.argon2_time_cost,
        memory_cost=settings.argon2_memory_cost,
        parallelism=settings.argon2_parallelism,
        hash_len=settings.argon2_hash_len,
        salt_len=settings.argon2_salt_len,
        type=Type.ID,
    )


def _champ_requis(field: str, message: str, *, identifiant: str | None = None) -> AppError:
    details: dict[str, str] = {"field": field}
    if identifiant is not None:
        details["identifiant"] = identifiant
    return AppError(422, "CHAMP_REQUIS", message, details)


def _identifiant_indisponible(identifiant: str) -> AppError:
    return AppError(
        409,
        "IDENTIFIANT_INDISPONIBLE",
        "Cet identifiant est déjà utilisé.",
        {"field": "identifiant", "value": identifiant},
    )


def _identifiant_deja_pris(db: DBSession, identifiant: str) -> bool:
    return (
        db.execute(select(Account.id).where(func.lower(Account.identifiant) == identifiant.lower())).scalar_one_or_none()
        is not None
    )


def register_account(
    db: DBSession, *, identifiant: str, mot_de_passe: str, settings: Settings
) -> tuple[Account, SessionModel]:
    """Valide, crée le compte et ouvre immédiatement une session.

    Lève `AppError` (422/409) pour chaque cas de la matrice I/O de la spec ;
    ne journalise et ne renvoie jamais le mot de passe en clair.
    """
    if not identifiant or not identifiant.strip():
        raise _champ_requis("identifiant", "L'identifiant est requis.")

    # Un identifiant entouré d'espaces ("  alice ") désigne le même compte
    # que sa forme sans espaces : on normalise avant toute comparaison ou
    # écriture pour que l'unicité et le stockage soient cohérents.
    identifiant = identifiant.strip()

    if len(identifiant) > IDENTIFIANT_MAX_LENGTH:
        raise AppError(
            422,
            "IDENTIFIANT_TROP_LONG",
            f"L'identifiant ne doit pas dépasser {IDENTIFIANT_MAX_LENGTH} caractères.",
            {"field": "identifiant", "value": identifiant},
        )

    if not mot_de_passe:
        raise _champ_requis("mot_de_passe", "Le mot de passe est requis.", identifiant=identifiant)

    if (
        len(mot_de_passe) < settings.password_min_length
        or len(mot_de_passe) > settings.password_max_length
        or mot_de_passe.lower() == identifiant.lower()
    ):
        raise AppError(
            422,
            "MOT_DE_PASSE_INVALIDE",
            f"Le mot de passe doit contenir au moins {settings.password_min_length} caractères "
            "et être différent de l'identifiant.",
            {"field": "mot_de_passe", "identifiant": identifiant},
        )

    if _identifiant_deja_pris(db, identifiant):
        raise _identifiant_indisponible(identifiant)

    password_hash = _build_hasher(settings).hash(mot_de_passe)
    account = Account(identifiant=identifiant, password_hash=password_hash)
    db.add(account)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        # Filet de sécurité contre une course entre la vérification et l'écriture :
        # la vraie garantie d'unicité est l'index fonctionnel en base.
        raise _identifiant_indisponible(identifiant) from exc

    now = _utcnow()
    session = SessionModel(
        account_id=account.id,
        created_at=now,
        expires_at=now + timedelta(days=settings.session_duration_days),
    )
    db.add(session)
    db.commit()

    return account, session
