"""Table `accounts` : identifiant unique (insensible à la casse) + mot de passe haché."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from uuid6 import uuid7

from ..db import Base

# Longueur maximale d'un identifiant. Source de vérité unique partagée avec
# `services/accounts.py` (qui rejette explicitement tout dépassement en 422
# plutôt que de laisser une valeur trop longue échouer contre la colonne).
IDENTIFIANT_MAX_LENGTH = 255


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid7)
    identifiant: Mapped[str] = mapped_column(String(IDENTIFIANT_MAX_LENGTH), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


# Unicité insensible à la casse : index fonctionnel sur lower(identifiant)
# plutôt qu'une contrainte sur la colonne brute, pour que "Jean" et "jean"
# soient bien considérés comme le même identifiant (cf. matrice I/O).
Index(
    "ix_accounts_identifiant_lower",
    func.lower(Account.identifiant),
    unique=True,
)
