"""Application FastAPI : montage des routers (auth, moteur de routage,
géocodage) + format d'erreur structuré commun."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings
from .db import SessionLocal
from .errors import AppError
from .route_engine.adapters.inbound.routes_router import router as routes_router
from .route_engine.bootstrap.elevation import shutdown_elevation_provider
from .route_engine.bootstrap.routing import shutdown_routing_provider
from .routers.auth import router as auth_router
from .routers.geocode import router as geocode_router
from .services.accounts import warm_up_dummy_hash

# Taille max acceptée pour un corps de requête, avant même que les contrôles
# de longueur applicatifs (`services/accounts.py`) ne s'exécutent -- évite
# qu'un payload arbitrairement gros ne soit lu/parsé pour un endpoint non
# authentifié (`/register`, `/login`).
MAX_BODY_SIZE_BYTES = 16 * 1024


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        content_length = request.headers.get("content-length")
        if content_length is not None and content_length.isdigit() and int(content_length) > MAX_BODY_SIZE_BYTES:
            return JSONResponse(
                status_code=413,
                content=_error_body("PAYLOAD_TROP_VOLUMINEUX", "Corps de requête trop volumineux.", {}),
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        # API pure (pas de HTML servi ici) : en-têtes défensifs de base contre
        # le MIME-sniffing, le clickjacking et les fuites de référent, avec
        # HSTS puisque la production ne sert qu'en HTTPS (cf. Design Notes
        # spec-1-1).
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    warm_up_dummy_hash(get_settings())
    yield
    # Libère le client HTTP des singletons `RoutingProvider`/`ElevationProvider`
    # (AD-8) construits par `bootstrap/routing.py`/`bootstrap/elevation.py` --
    # rien d'autre ne le fait.
    shutdown_routing_provider()
    shutdown_elevation_provider()


app = FastAPI(title="BikeRoute API", lifespan=_lifespan)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(MaxBodySizeMiddleware)

app.include_router(auth_router)
app.include_router(routes_router)
app.include_router(geocode_router)


def _error_body(code: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "details": details,
        "correlationId": str(uuid.uuid4()),
    }


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=_error_body(exc.code, exc.message, exc.details))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Filet de sécurité : un corps de requête malformé (champ absent, mauvais
    type, ...) renvoie tout de même le format d'erreur structuré commun."""
    errors = exc.errors()
    field = errors[0]["loc"][-1] if errors and errors[0].get("loc") else None
    details = {"field": field} if field else {}
    return JSONResponse(
        status_code=422,
        content=_error_body("CHAMP_REQUIS", "Champ requis manquant ou invalide.", details),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Filet de sécurité final : toute exception non gérée respecte quand
    même le contrat d'erreur structuré commun, pas seulement AppError."""
    return JSONResponse(
        status_code=500,
        content=_error_body("ERREUR_INATTENDUE", "Une erreur inattendue s'est produite.", {}),
    )


@app.get("/health")
def health() -> JSONResponse:
    """Sonde de disponibilité : vérifie aussi la connectivité PostgreSQL,
    sans quoi une base injoignable resterait masquée par un "ok" statique
    alors que toute route applicative échouerait."""
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(status_code=200, content={"status": "ok"})
