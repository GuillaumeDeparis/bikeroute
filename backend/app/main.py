"""Application FastAPI : montage du router auth + format d'erreur structuré commun."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .errors import AppError
from .routers.auth import router as auth_router

app = FastAPI(title="BikeRoute API")

app.include_router(auth_router)


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
def health() -> dict[str, str]:
    return {"status": "ok"}
