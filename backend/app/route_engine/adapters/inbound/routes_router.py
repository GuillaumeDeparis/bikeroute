"""Adaptateur entrant HTTP : `POST /api/routes/calculate`.

Traduit HTTP <-> domaine (points/DTO) et compose les ports (`RoutingProvider`
via `bootstrap`, `RouteRepository` via l'adaptateur PostGIS) ; ne contient
aucune logique de routage elle-même (AD-1/AD-8)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from ....db import get_db
from ....errors import AppError
from ....models.account import Account
from ....schemas.auth import ErrorResponse
from ....services.sessions import get_current_account
from ...application.calculate_route import ParametresInvalides, calculer_parcours
from ...application.ports import ElevationProviderError, RoutingProviderError
from ...bootstrap.elevation import get_elevation_provider
from ...bootstrap.routing import get_routing_provider
from ...domain.models import Coordinate
from ...domain.route import STATUT_ROUTE
from ..outbound.postgis_route_repository import PostgisRouteRepository
from ..outbound.valhalla_elevation_provider import ValhallaElevationProvider
from ..outbound.valhalla_provider import ValhallaRoutingProvider
from .schemas import (
    CalculerParcoursRequest,
    MetriquesResponse,
    MonteeSignificativeResponse,
    ParcoursResponse,
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
