"""Fixtures pytest : base PostgreSQL réelle (pas de mock/sqlite), nettoyée entre tests.

Nécessite `DATABASE_URL` pointant vers un PostgreSQL de test déjà migré
(`uv run alembic upgrade head`) avant de lancer la suite.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import SessionLocal, engine
from app.main import app


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    yield
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE sessions, accounts RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    # `base_url` en `https` (et non le `http://testserver` par défaut) :
    # le cookie de session est marqué `Secure` (cf. spec-1-1/1-2), donc un
    # jar de cookies conforme ne le renverrait pas sur une requête suivante
    # faite en `http`. La production sert exclusivement en `https` (voir
    # Design Notes de spec-1-1), donc ce choix reproduit fidèlement le
    # comportement réel plutôt que d'en masquer un écart.
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


@pytest.fixture
def db_session() -> Iterator[SessionLocal]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
