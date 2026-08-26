"""Schémas Pydantic de `POST /api/routes/calculate` -- propres à cet
adaptateur HTTP (AD-1) : le domaine et l'application n'en ont pas besoin."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

from ...domain.metrics import Difficulte

# Une étiquette individuelle (spec-2-6) : non vide après trim, longueur
# raisonnable -- `strip_whitespace=True` normalise aussi la valeur stockée
# (une étiquette envoyée avec des espaces superflus est persistée déjà
# nettoyée), pas seulement validée. Le frontend trim/filtre déjà côté
# `Atelier.tsx`, mais l'API reste appelable directement (hors frontend) :
# jamais d'étiquette vide/arbitrairement longue persistée pour autant
# (revue de code post-implémentation), même validation stricte que
# `PointEntreeRequest` ci-dessous pour les autres champs de cette story.
EtiquetteRequest = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class PointEntreeRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class CalculerParcoursRequest(BaseModel):
    # Au moins départ + destination ; borne haute levée en Story 2.2 pour
    # les topologies boucle/multi-étapes (le moteur route déjà n'importe
    # quelle liste ordonnée de points, cf. spec-2-2).
    points: list[PointEntreeRequest] = Field(min_length=2, max_length=50)


class PointResponse(BaseModel):
    lat: float
    lon: float


class PointProfilResponse(BaseModel):
    distance_m: float
    elevation_m: float


class MonteeSignificativeResponse(BaseModel):
    distance_m: float
    denivele_m: float
    pente_moyenne: float


class MetriquesResponse(BaseModel):
    # Méthode de calcul unique et versionnée (NFR-9) : traçabilité de la
    # méthode qui a produit ces valeurs, même si elle change ensuite (cf.
    # `domain/metrics.py`).
    version: str
    distance_m: float
    denivele_positif_m: float
    denivele_negatif_m: float
    duree_s: float
    difficulte: Difficulte
    # Proportions (0..1) par valeur de revêtement/catégorie routière -- clé
    # "inconnu" toujours présente, même à 0.0 (NFR-10, cf. `domain/metrics.py`).
    revetements: dict[str, float]
    categories_routieres: dict[str, float]
    # Profil altimétrique point-à-point (mêmes vertices que D+/D-), jamais
    # un binning par paliers -- rendu en courbe continue côté frontend.
    profil: list[PointProfilResponse]
    montees_significatives: list[MonteeSignificativeResponse]


class ParcoursResponse(BaseModel):
    id: UUID
    statut: str
    geometry: list[PointResponse]
    unrouted_points: list[PointResponse]
    provider: str
    provider_version: str
    created_at: datetime
    # `None` pour un parcours non routé -- même garde que `geometry`
    # (`routes_router.py`) : aucune métrique affichée hors statut "routed"
    # (Boundaries de la spec-2-5).
    metriques: MetriquesResponse | None = None
    # Marqueur de bibliothèque (spec-2-6) : `None`/`[]` tant que le parcours
    # n'a jamais été enregistré (`/calculate` ne les renseigne jamais).
    nom: str | None = None
    note: str | None = None
    etiquettes: list[str] = Field(default_factory=list)
    # Points d'entrée bruts (départ/passages/destination), tels que persistés
    # (`points.input`) -- requis pour reconstruire la topologie à la
    # réouverture (spec-2-6, Design Notes) ; jamais renseigné par
    # `/calculate` (l'appelant connaît déjà ses propres points), seulement
    # par `GET /api/routes/{id}` et `PATCH /api/routes/{id}`.
    points: list[PointResponse] = Field(default_factory=list)


class EnregistrerParcoursRequest(BaseModel):
    """Corps de `PATCH /api/routes/{id}` (spec-2-6). `nom` n'est volontairement
    pas contraint par `Field(min_length=1, ...)` ici : un `nom` vide/absent
    doit renvoyer le code `PARAMETRES_INVALIDES` propre à cette story (cf.
    matrice I/O), jamais le `CHAMP_REQUIS` générique que déclencherait une
    violation de contrainte Pydantic (`RequestValidationError`, cf.
    `app/main.py`) -- validé explicitement dans `routes_router.py`."""

    nom: str = Field(default="", max_length=200)
    note: str | None = Field(default=None, max_length=2000)
    etiquettes: list[EtiquetteRequest] = Field(default_factory=list, max_length=20)


class ParcoursResumeResponse(BaseModel):
    """Une ligne de « Mes parcours » (`GET /api/routes`) : uniquement le
    résumé nécessaire à la liste, jamais la géométrie/le profil complets
    (cf. `ParcoursResponse`, réservée à la réouverture individuelle).
    Métriques optionnelles : lecture défensive d'un `metrics` JSONB
    éventuellement absent (parcours calculé avant la story 2.5 socle),
    jamais d'erreur 500 (Boundaries de la spec-2-6)."""

    id: UUID
    nom: str
    note: str | None = None
    etiquettes: list[str] = Field(default_factory=list)
    distance_m: float | None = None
    denivele_positif_m: float | None = None
    duree_s: float | None = None
    difficulte: Difficulte | None = None
    created_at: datetime
