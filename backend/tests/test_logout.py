"""Couvre la matrice I/O de `POST /api/auth/logout` (spec-1-2)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.models.session import Session as SessionModel


def test_deconnexion_avec_cookie_valide_supprime_la_session_et_efface_le_cookie(
    client: TestClient, db_session
) -> None:
    settings = get_settings()
    client.post(
        "/api/auth/register",
        json={"identifiant": "eve", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    session_id = client.cookies.get(settings.session_cookie_name)
    assert session_id is not None

    response = client.post("/api/auth/logout")

    assert response.status_code == 204

    # Session invalidée en base, pas seulement le cookie.
    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    ).scalar_one_or_none()
    assert session_row is None

    # Cookie effacé côté client : Set-Cookie avec une valeur vidée / expirée.
    set_cookie_header = response.headers.get("set-cookie", "")
    assert settings.session_cookie_name in set_cookie_header
    assert "Max-Age=0" in set_cookie_header or "1970" in set_cookie_header

    # Le cookie effacé ne redonne plus accès à la session.
    verification = client.get("/api/auth/session")
    assert verification.status_code == 401


def test_deconnexion_sans_cookie_est_idempotente(client: TestClient) -> None:
    response = client.post("/api/auth/logout")

    assert response.status_code == 204


def test_deconnexion_avec_cookie_deja_invalide_est_idempotente(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "018f1e00-0000-7000-8000-000000000000")

    response = client.post("/api/auth/logout")

    assert response.status_code == 204


def test_deconnexion_avec_cookie_malforme_est_idempotente(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "pas-un-uuid")

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
