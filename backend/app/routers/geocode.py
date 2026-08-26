"""`GET /api/geocode?q=` : proxy vers l'API de recherche Nominatim
(OpenStreetMap) pour la Place search de l'Atelier (UX-DR17).

Un simple proxy authentifié -- pas un port du moteur de routage (pas de
fournisseur alternatif prévu ni de logique métier ici) : reste dans
`routers/`, comme `auth.py`, plutôt que dans `route_engine/`. Le proxy
évite au frontend de gérer CORS/clé pour une origine externe, et centralise
le `User-Agent` identifiant requis par la politique d'usage Nominatim."""

from __future__ import annotations

import math

import httpx
from fastapi import APIRouter, Depends, Query, Request

from ..config import Settings, get_settings
from ..errors import AppError
from ..models.account import Account
from ..schemas.geocode import ResultatRecherche
from ..services.rate_limiting import check_rate_limit
from ..services.sessions import get_current_account

router = APIRouter(prefix="/api", tags=["geocode"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _recherche_indisponible() -> AppError:
    return AppError(502, "RECHERCHE_INDISPONIBLE", "La recherche d'adresse est indisponible. Réessayez plus tard.", {})


@router.get("/geocode", response_model=list[ResultatRecherche])
def geocode(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    account: Account = Depends(get_current_account),
    settings: Settings = Depends(get_settings),
) -> list[ResultatRecherche]:
    # Par IP + compte (même schéma que login/register) : protège la
    # politique d'usage Nominatim d'un compte qui solliciterait ce proxy en
    # boucle, sans bloquer les autres comptes derrière une IP partagée.
    check_rate_limit(
        f"geocode:{_client_ip(request)}:{account.id}",
        max_attempts=settings.geocode_rate_limit_max_attempts,
        window_seconds=settings.geocode_rate_limit_window_seconds,
    )
    try:
        response = httpx.get(
            f"{settings.nominatim_url}/search",
            params={"q": q, "format": "jsonv2", "limit": 5},
            headers={"User-Agent": settings.nominatim_user_agent},
            timeout=settings.nominatim_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise _recherche_indisponible() from exc

    if response.status_code >= 400:
        raise _recherche_indisponible()

    try:
        body = response.json()
    except ValueError as exc:
        raise _recherche_indisponible() from exc

    if not isinstance(body, list):
        raise _recherche_indisponible()

    resultats: list[ResultatRecherche] = []
    try:
        for item in body:
            if not isinstance(item, dict) or "lat" not in item or "lon" not in item:
                continue
            lat = float(item["lat"])
            lon = float(item["lon"])
            if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue
            resultats.append(ResultatRecherche(label=str(item.get("display_name", "")), lat=lat, lon=lon))
    except (TypeError, ValueError) as exc:
        raise _recherche_indisponible() from exc
    return resultats
