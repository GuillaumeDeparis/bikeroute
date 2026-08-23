"""Vérification de propriété par compte : mécanisme générique réutilisable
par toute ressource métier scopée par `account_id` (socle attendu tel quel
par les Epics 2-5, cf. spec-1-3)."""

from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from ..errors import AppError

ModelT = TypeVar("ModelT")


def _ressource_introuvable() -> AppError:
    return AppError(404, "RESSOURCE_INTROUVABLE", "Ressource introuvable.", {})


def get_owned_or_404(db: DBSession, model: type[ModelT], resource_id: Any, account_id: Any) -> ModelT:
    """Renvoie l'instance de `model` identifiée par `resource_id` si -- et
    seulement si -- elle appartient à `account_id`.

    Lève sinon un 404 `RESSOURCE_INTROUVABLE`, que la ressource n'existe pas
    du tout ou qu'elle appartienne à un autre compte : les deux cas doivent
    être indiscernables pour l'appelant (jamais de 403, qui confirmerait
    l'existence de la ressource chez un autre compte -- pas d'oracle
    d'existence inter-comptes, cf. Design Notes de spec-1-3).

    `model` doit exposer des colonnes `id` et `account_id` ; c'est le seul
    contrat requis pour qu'Epic 2-5 réutilisent cette fonction telle quelle.
    """
    resource = db.execute(
        select(model).where(model.id == resource_id, model.account_id == account_id)
    ).scalar_one_or_none()
    if resource is None:
        raise _ressource_introuvable()
    return resource
