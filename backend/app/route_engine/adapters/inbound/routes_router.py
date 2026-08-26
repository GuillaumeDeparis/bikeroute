"""Adaptateur entrant HTTP : `POST /api/routes/calculate`.

Traduit HTTP <-> domaine (points/DTO) et compose les ports (`RoutingProvider`
via `bootstrap`, `RouteRepository` via l'adaptateur PostGIS) ; ne contient
aucune logique de routage elle-même (AD-1/AD-8)."""

from __future__ import annotations

import json
import re
import unicodedata
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from ....db import get_db
from ....errors import AppError
from ....models.account import Account
from ....models.route import Route as RouteModel
from ....models.route_export import RouteExport
from ....schemas.auth import ErrorResponse
from ....services.authorization import get_owned_or_404
from ....services.sessions import get_current_account
from ...application.calculate_route import ParametresInvalides, calculer_parcours
from ...application.ports import ElevationProviderError, RoutingProviderError
from ...bootstrap.elevation import get_elevation_provider
from ...bootstrap.routing import get_routing_provider
from ...domain.gpx import construire_gpx
from ...domain.metrics import PointProfil
from ...domain.models import Coordinate
from ...domain.route import STATUT_ROUTE
from ..outbound.postgis_route_repository import PostgisRouteRepository
from ..outbound.valhalla_elevation_provider import ValhallaElevationProvider
from ..outbound.valhalla_provider import ValhallaRoutingProvider
from .schemas import (
    CalculerParcoursRequest,
    EnregistrerParcoursRequest,
    MetriquesResponse,
    MonteeSignificativeResponse,
    ParcoursResponse,
    ParcoursResumeResponse,
    PointProfilResponse,
    PointResponse,
)

router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.post(
    "/calculate",
    response_model=ParcoursResponse,
    status_code=201,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
        422: {"model": ErrorResponse, "description": "Points invalides (départ/destination requis)."},
        502: {"model": ErrorResponse, "description": "Moteur de routage indisponible."},
    },
)
def calculate(
    payload: CalculerParcoursRequest,
    account: Account = Depends(get_current_account),
    db: DBSession = Depends(get_db),
    routing_provider: ValhallaRoutingProvider = Depends(get_routing_provider),
    elevation_provider: ValhallaElevationProvider = Depends(get_elevation_provider),
) -> ParcoursResponse:
    """Calcule automatiquement le premier tracé dès que départ+destination
    sont fournis, sans aucun paramètre sportif (cf. Boundaries de la spec).
    L'identité vient du principal authentifié (`get_current_account`), jamais
    du payload -- même socle que le reste de l'API (AD-13)."""
    points = [Coordinate(lat=p.lat, lon=p.lon) for p in payload.points]

    try:
        route = calculer_parcours(
            routing_provider=routing_provider,
            elevation_provider=elevation_provider,
            repository=PostgisRouteRepository(db),
            account_id=account.id,
            points=points,
        )
    except ParametresInvalides as exc:
        raise AppError(422, "PARAMETRES_INVALIDES", exc.message, {}) from exc
    except (RoutingProviderError, ElevationProviderError) as exc:
        # Le dernier tracé+métriques valides (s'ils existent) restent
        # affichés côté client : cette route ne fait qu'échouer proprement,
        # elle n'écrase rien. Échec du fournisseur d'élévation traité
        # identiquement à un échec du fournisseur de routage -- même réponse
        # 502, pas de métriques partielles (Boundaries de la spec-2-5).
        raise AppError(
            502,
            "MOTEUR_ROUTAGE_INDISPONIBLE",
            "Le moteur de routage est indisponible. Réessayez plus tard.",
            {},
        ) from exc

    db.commit()

    # Jamais de géométrie/métriques exposées hors statut "routed" -- même
    # garde que `PostgisRouteRepository.save` (`geometry=None`/`metrics=None`
    # si non routé) : un fournisseur pourrait renvoyer une forme dégénérée
    # (ex. un seul point pour un départ == destination) sans que
    # `unrouted_points` la signale ; ce n'est pas un tracé exploitable,
    # jamais affiché comme tel.
    routed = route.statut == STATUT_ROUTE
    geometry = route.result.geometry if routed else ()
    metriques = (
        MetriquesResponse(
            version=route.metrics.version,
            distance_m=route.metrics.distance_m,
            denivele_positif_m=route.metrics.denivele_positif_m,
            denivele_negatif_m=route.metrics.denivele_negatif_m,
            duree_s=route.metrics.duree_s,
            difficulte=route.metrics.difficulte,
            revetements=route.metrics.revetements,
            categories_routieres=route.metrics.categories_routieres,
            profil=[
                PointProfilResponse(distance_m=point.distance_m, elevation_m=point.elevation_m)
                for point in route.metrics.profil
            ],
            montees_significatives=[
                MonteeSignificativeResponse(
                    distance_m=montee.distance_m, denivele_m=montee.denivele_m, pente_moyenne=montee.pente_moyenne
                )
                for montee in route.metrics.montees_significatives
            ],
        )
        if routed and route.metrics is not None
        else None
    )

    return ParcoursResponse(
        id=route.id,
        statut=route.statut,
        geometry=[PointResponse(lat=c.lat, lon=c.lon) for c in geometry],
        unrouted_points=[PointResponse(lat=c.lat, lon=c.lon) for c in route.result.unrouted_points],
        provider=route.result.provider,
        provider_version=route.result.version,
        created_at=route.created_at,
        metriques=metriques,
    )


def _metriques_response_depuis_json(metrics: dict[str, Any]) -> MetriquesResponse:
    """Reconstruit `MetriquesResponse` depuis le `metrics` JSONB déjà persisté
    (`PATCH`/`GET /api/routes/{id}`) -- chemin distinct de `calculate`
    ci-dessus, qui construit sa réponse depuis l'entité de domaine fraîchement
    calculée. Lecture défensive (`.get()`) : un parcours calculé avant la
    story 2.5 (détail) n'a pas `revetements`/`categories_routieres`/`profil`/
    `montees_significatives` en base -- jamais d'erreur 500, champs absents
    remplacés par leur équivalent vide (Boundaries de la spec-2-6)."""
    return MetriquesResponse(
        version=metrics.get("version") or "",
        distance_m=metrics.get("distance_m") or 0.0,
        denivele_positif_m=metrics.get("denivele_positif_m") or 0.0,
        denivele_negatif_m=metrics.get("denivele_negatif_m") or 0.0,
        duree_s=metrics.get("duree_s") or 0.0,
        # "facile" par défaut (comme `domain/metrics.py::_difficulte_pour`
        # pour une distance dégénérée) plutôt qu'une valeur hors du `Literal`
        # `Difficulte` si jamais absente d'un très ancien parcours.
        difficulte=metrics.get("difficulte") or "facile",
        revetements=metrics.get("revetements") or {"inconnu": 0.0},
        categories_routieres=metrics.get("categories_routieres") or {"inconnu": 0.0},
        profil=[
            PointProfilResponse(distance_m=point["distance_m"], elevation_m=point["elevation_m"])
            for point in metrics.get("profil") or []
        ],
        montees_significatives=[
            MonteeSignificativeResponse(
                distance_m=montee["distance_m"],
                denivele_m=montee["denivele_m"],
                pente_moyenne=montee["pente_moyenne"],
            )
            for montee in metrics.get("montees_significatives") or []
        ],
    )


def _geometrie_en_points(db: DBSession, route_id: uuid.UUID) -> list[PointResponse]:
    """Relit la géométrie PostGIS déjà persistée sous forme de points --
    jamais recalculée/re-routée (Boundaries de la spec-2-6 : "aucun nouvel
    appel Valhalla"). Passe par `ST_AsGeoJSON` plutôt que par Shapely (non
    installé, `geoalchemy2` en dépend optionnellement) : `coordinates` d'un
    GeoJSON `LineString` est déjà `[lon, lat]`, même ordre que le WKT écrit
    par `PostgisRouteRepository._linestring_wkt`."""
    geojson_brut = db.execute(
        select(func.ST_AsGeoJSON(RouteModel.geometry)).where(RouteModel.id == route_id)
    ).scalar_one_or_none()
    if not geojson_brut:
        return []
    coordonnees = json.loads(geojson_brut)["coordinates"]
    return [PointResponse(lat=lat, lon=lon) for lon, lat in coordonnees]


def _parcours_response_depuis_modele(db: DBSession, model: RouteModel) -> ParcoursResponse:
    """Construit `ParcoursResponse` depuis une ligne `routes` déjà persistée
    -- partagée par `PATCH`/`GET /api/routes/{id}` (spec-2-6), distincte de
    `calculate` ci-dessus qui part de l'entité de domaine fraîchement
    calculée plutôt que de relire la base."""
    routed = model.statut == STATUT_ROUTE
    points_bruts = model.points.get("input", []) if model.points else []
    unrouted_indices = set(model.points.get("unrouted_indices", []) if model.points else [])
    metriques = (
        _metriques_response_depuis_json({**model.metrics, "version": model.metrics_version or ""})
        if routed and model.metrics
        else None
    )
    return ParcoursResponse(
        id=model.id,
        statut=model.statut,
        geometry=_geometrie_en_points(db, model.id) if routed else [],
        unrouted_points=[
            PointResponse(lat=point["lat"], lon=point["lon"])
            for index, point in enumerate(points_bruts)
            if index in unrouted_indices
        ],
        provider=model.provider,
        provider_version=model.provider_version,
        created_at=model.created_at,
        metriques=metriques,
        nom=model.nom,
        note=model.note,
        etiquettes=model.etiquettes or [],
        points=[PointResponse(lat=point["lat"], lon=point["lon"]) for point in points_bruts],
    )


@router.patch(
    "/{route_id}",
    response_model=ParcoursResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
        404: {"model": ErrorResponse, "description": "Parcours introuvable ou appartenant à un autre compte."},
        422: {"model": ErrorResponse, "description": "Nom manquant, ou parcours pas encore routé."},
    },
)
def enregistrer(
    route_id: uuid.UUID,
    payload: EnregistrerParcoursRequest,
    account: Account = Depends(get_current_account),
    db: DBSession = Depends(get_db),
) -> ParcoursResponse:
    """Pose un `nom` (marqueur de bibliothèque, spec-2-6) sur une ligne
    `routes` déjà calculée -- `PATCH` pur, jamais un nouveau statut de cycle
    de vie ni une nouvelle table (Intent de la spec). Ownership vérifiée par
    `get_owned_or_404` avant toute autre validation : un id appartenant à un
    autre compte doit rester indiscernable d'un id inexistant, y compris
    quand le nom envoyé est vide (spec-1-3)."""
    model = get_owned_or_404(db, RouteModel, route_id, account.id)

    # Vérifié manuellement (pas via `Field(min_length=1, ...)` sur
    # `EnregistrerParcoursRequest.nom`) pour renvoyer `PARAMETRES_INVALIDES`
    # ici, jamais le `CHAMP_REQUIS` générique de `RequestValidationError`
    # (cf. docstring du schéma).
    nom = payload.nom.strip()
    if not nom:
        raise AppError(422, "PARAMETRES_INVALIDES", "Le nom du parcours est requis pour l'enregistrer.", {})

    if model.statut != STATUT_ROUTE:
        raise AppError(
            422,
            "PARCOURS_NON_PRET",
            "Seul un parcours calculé avec succès peut être enregistré dans la bibliothèque.",
            {},
        )

    model.nom = nom
    model.note = payload.note
    model.etiquettes = payload.etiquettes
    db.commit()

    return _parcours_response_depuis_modele(db, model)


def _nom_fichier_gpx(nom: str | None) -> str:
    """Slug ASCII de `nom` (translittéré, espaces/ponctuation -> tirets) +
    `.gpx`, ou `parcours.gpx` générique si `nom` est nul ou vide une fois
    translittéré -- jamais de caractère non-ASCII brut dans
    `Content-Disposition` (RFC 6266), jamais de nom de fichier vide ni non
    téléchargeable (Boundaries de la spec)."""
    if not nom:
        return "parcours.gpx"
    ascii_nom = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", ascii_nom).strip("-").lower()
    return f"{slug}.gpx" if slug else "parcours.gpx"


@router.post(
    "/{route_id}/export",
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
        404: {"model": ErrorResponse, "description": "Parcours introuvable ou appartenant à un autre compte."},
        422: {"model": ErrorResponse, "description": "Parcours pas encore routé."},
    },
)
def exporter(
    route_id: uuid.UUID,
    account: Account = Depends(get_current_account),
    db: DBSession = Depends(get_db),
) -> Response:
    """Génère un GPX 1.1 depuis le tracé/le profil déjà persistés (spec-2-7)
    -- même garde que `enregistrer` ci-dessus (`statut == "routed"`), jamais
    de nouvel appel Valhalla (Boundaries). Journalise chaque export réussi
    dans `route_exports` (historique du compte, FR-25/Epic 3) : la ligne
    n'est insérée qu'une fois le GPX construit avec succès, jamais pour un
    export en échec."""
    model = get_owned_or_404(db, RouteModel, route_id, account.id)

    if model.statut != STATUT_ROUTE:
        raise AppError(422, "PARCOURS_NON_PRET", "Seul un parcours calculé avec succès peut être exporté.", {})

    geometrie = tuple(Coordinate(lat=p.lat, lon=p.lon) for p in _geometrie_en_points(db, model.id))
    points_bruts = model.points.get("input", []) if model.points else []
    points_entree = tuple(Coordinate(lat=point["lat"], lon=point["lon"]) for point in points_bruts)
    # Accès défensif (même patron que `_metriques_response_depuis_json`) :
    # un parcours `routed` calculé avant la story 2.5 (détail) a un `metrics`
    # JSONB sans clé `"profil"` (voire `metrics` lui-même `None`, cf.
    # `test_reouverture_dun_ancien_parcours_sans_revetements_ni_profil...`).
    profil_brut = (model.metrics or {}).get("profil") or []
    profil = tuple(
        PointProfil(distance_m=point["distance_m"], elevation_m=point["elevation_m"]) for point in profil_brut
    )
    if len(profil) != len(geometrie):
        # Le GPX doit porter l'élévation sur tout le tracé (Boundaries
        # "Always" déjà actées du spec) : un profil manquant/incomplet ne
        # peut structurellement pas la satisfaire -- traité comme "pas
        # encore prêt", pas comme une erreur serveur (jamais de 500 non
        # documenté ici).
        raise AppError(
            422,
            "PARCOURS_NON_PRET",
            "Ce parcours a été calculé avant le suivi altimétrique détaillé et ne peut pas encore être exporté.",
            {},
        )
    gpx = construire_gpx(model.nom, points_entree, geometrie, profil)

    db.add(RouteExport(route_id=model.id, account_id=account.id))
    db.commit()

    return Response(
        content=gpx,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{_nom_fichier_gpx(model.nom)}"'},
    )


@router.get(
    "",
    response_model=list[ParcoursResumeResponse],
    responses={401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."}},
)
def lister(
    account: Account = Depends(get_current_account),
    db: DBSession = Depends(get_db),
) -> list[ParcoursResumeResponse]:
    """« Mes parcours » (spec-2-6) : uniquement les lignes `nom IS NOT NULL`
    du compte connecté, les plus récentes d'abord -- un calcul jamais
    enregistré (`nom` nul) reste une ligne orpheline, jamais listée
    (Design Notes de la spec)."""
    lignes = (
        db.execute(
            select(RouteModel)
            .where(RouteModel.account_id == account.id, RouteModel.nom.isnot(None))
            .order_by(RouteModel.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        ParcoursResumeResponse(
            id=ligne.id,
            nom=ligne.nom or "",
            note=ligne.note,
            etiquettes=ligne.etiquettes or [],
            distance_m=(ligne.metrics or {}).get("distance_m"),
            denivele_positif_m=(ligne.metrics or {}).get("denivele_positif_m"),
            duree_s=(ligne.metrics or {}).get("duree_s"),
            difficulte=(ligne.metrics or {}).get("difficulte"),
            created_at=ligne.created_at,
        )
        for ligne in lignes
    ]


@router.get(
    "/{route_id}",
    response_model=ParcoursResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Session absente, inconnue ou expirée."},
        404: {"model": ErrorResponse, "description": "Parcours introuvable ou appartenant à un autre compte."},
    },
)
def obtenir(
    route_id: uuid.UUID,
    account: Account = Depends(get_current_account),
    db: DBSession = Depends(get_db),
) -> ParcoursResponse:
    """Réouverture depuis « Mes parcours » (spec-2-6) : recharge points/tracé/
    métriques déjà persistés, aucun nouvel appel Valhalla (Boundaries de la
    spec) -- la reconstruction de topologie/rôles à partir de `points` reste
    entièrement du ressort du frontend (Design Notes)."""
    model = get_owned_or_404(db, RouteModel, route_id, account.id)
    return _parcours_response_depuis_modele(db, model)
