"""Cœur métier de l'inscription et de la connexion : hachage Argon2id,
création compte + session, authentification à temps constant, détection
d'identifiant déjà pris (insensible à la casse)."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.low_level import Type
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from ..config import Settings
from ..errors import AppError
from ..models.account import IDENTIFIANT_MAX_LENGTH, Account
from ..models.session import Session as SessionModel
from .sessions import create_session

# Mot de passe factice utilisé pour vérifier un hachage bidon quand
# l'identifiant est inconnu (cf. `authenticate_account`) : peu importe sa
# valeur, il n'est jamais comparé à une vraie saisie utilisateur.
_DUMMY_PASSWORD = "mot-de-passe-factice-pour-temps-constant"

# Singleton paresseux, calculé une seule fois avec les paramètres Argon2id
# courants : recalculer ce hachage à chaque tentative referait tout le
# travail qu'il est censé éviter. (Pas de cache par instance de `Settings` :
# un dict gardé par `id(settings)` serait fragile -- réutilisation d'un id
# après garbage collection, ou `Settings()` reconstruite en test.)
_dummy_hash: str | None = None


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

    session = create_session(db, account_id=account.id, settings=settings)
    db.commit()

    return account, session


def _dummy_password_hash(settings: Settings) -> str:
    """Hachage bidon vérifié quand l'identifiant est inconnu, pour qu'un
    identifiant inconnu et un mot de passe erroné prennent le même temps."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = _build_hasher(settings).hash(_DUMMY_PASSWORD)
    return _dummy_hash


def authenticate_account(db: DBSession, *, identifiant: str, mot_de_passe: str, settings: Settings) -> Account:
    """Vérifie identifiant + mot de passe ; lève `AppError` 401 générique
    (`IDENTIFIANTS_INVALIDES`) pour un identifiant inconnu OU un mot de passe
    faux, sans jamais distinguer les deux cas dans la réponse ni le timing.

    La défense temporelle repose sur le fait qu'un hachage Argon2id est
    *toujours* vérifié, que l'identifiant existe ou non (contre un hachage
    factice dans le second cas) : le coût de la vérification ne dépend donc
    jamais de la cause de l'échec.
    """
    hasher = _build_hasher(settings)
    account = db.execute(
        select(Account).where(func.lower(Account.identifiant) == identifiant.strip().lower())
    ).scalar_one_or_none()

    password_hash = account.password_hash if account is not None else _dummy_password_hash(settings)

    try:
        hasher.verify(password_hash, mot_de_passe)
        mot_de_passe_correct = True
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        # `InvalidHashError` hérite de `ValueError` (pas de `VerificationError`) :
        # un `password_hash` corrompu/malformé en base doit, lui aussi, retomber
        # sur l'échec générique plutôt que sur une 500 imprévue.
        mot_de_passe_correct = False

    if account is None or not mot_de_passe_correct:
        raise AppError(401, "IDENTIFIANTS_INVALIDES", "Identifiant ou mot de passe incorrect.", {})

    return account
