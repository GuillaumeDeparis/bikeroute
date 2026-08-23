"""Couvre la matrice I/O de `POST /api/auth/register` (spec-1-1)."""

from __future__ import annotations

import re
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import get_settings
from app.models.account import Account
from app.models.session import Session as SessionModel
from app.services import accounts as accounts_service


def test_inscription_reussie_cree_compte_et_ouvre_session(client: TestClient, db_session) -> None:
    settings = get_settings()

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "alice", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["identifiant"] == "alice"
    assert "mot_de_passe" not in body
    assert "password_hash" not in body

    # Cookie de session HttpOnly/Secure/SameSite=Lax posé immédiatement.
    cookie = next(c for c in response.cookies.jar if c.name == settings.session_cookie_name)
    assert cookie.value is not None
    assert "HttpOnly" in cookie._rest  # type: ignore[attr-defined]
    assert cookie.secure is True
    assert cookie._rest.get("SameSite", "").lower() == "lax"  # type: ignore[attr-defined]

    account = db_session.execute(select(Account).where(Account.identifiant == "alice")).scalar_one()
    assert account.password_hash != "un-mot-de-passe-solide"
    assert account.password_hash.startswith("$argon2id$")

    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.account_id == account.id)
    ).scalar_one()
    assert str(session_row.id) == cookie.value

    # Durée de session : ligne en base ET attribut Max-Age du cookie doivent
    # tous deux refléter `settings.session_duration_days` (pas seulement la
    # présence des attributs HttpOnly/Secure/SameSite).
    assert session_row.expires_at - session_row.created_at == timedelta(days=settings.session_duration_days)
    set_cookie_header = response.headers.get("set-cookie", "")
    max_age_match = re.search(r"Max-Age=(\d+)", set_cookie_header, re.IGNORECASE)
    assert max_age_match is not None
    assert int(max_age_match.group(1)) == settings.session_duration_days * 24 * 3600


def test_identifiant_deja_pris_renvoie_409_et_conserve_la_valeur(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"identifiant": "Alice", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "alice", "mot_de_passe": "un-autre-mot-de-passe"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "IDENTIFIANT_INDISPONIBLE"
    assert body["details"]["field"] == "identifiant"
    assert body["details"]["value"] == "alice"
    assert "correlationId" in body
    assert "mot_de_passe" not in body
    assert "un-autre-mot-de-passe" not in str(body)


def test_identifiant_vide_renvoie_422_champ_requis(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "CHAMP_REQUIS"
    assert body["details"]["field"] == "identifiant"


def test_mot_de_passe_vide_renvoie_422_champ_requis(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "bob", "mot_de_passe": ""},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "CHAMP_REQUIS"
    assert body["details"]["field"] == "mot_de_passe"
    assert body["details"]["identifiant"] == "bob"


def test_mot_de_passe_trop_court_renvoie_422_mot_de_passe_invalide(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "carole", "mot_de_passe": "court1"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "MOT_DE_PASSE_INVALIDE"
    assert body["details"]["field"] == "mot_de_passe"
    assert body["details"]["identifiant"] == "carole"


def test_mot_de_passe_identique_a_identifiant_renvoie_422_mot_de_passe_invalide(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "identique-au-mdp", "mot_de_passe": "identique-au-mdp"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "MOT_DE_PASSE_INVALIDE"
    assert body["details"]["field"] == "mot_de_passe"


def test_mot_de_passe_jamais_journalise_en_clair(client: TestClient, caplog, capsys) -> None:
    """Vérifie tous les canaux de sortie réellement atteignables, pas
    seulement `logging` : l'app n'utilise aujourd'hui aucun `logger`, donc
    une assertion limitée à `caplog` passerait trivialement sans jamais
    pouvoir détecter une vraie fuite (print, exception non gérée, corps de
    réponse)."""
    secret = "mot-de-passe-tres-secret-123"
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "dave", "mot_de_passe": secret},
    )

    for record in caplog.records:
        assert secret not in record.getMessage()

    captured = capsys.readouterr()
    assert secret not in captured.out
    assert secret not in captured.err

    assert secret not in response.text


def test_mot_de_passe_identique_a_identifiant_insensible_a_la_casse(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "alice", "mot_de_passe": "Alice"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "MOT_DE_PASSE_INVALIDE"
    assert body["details"]["field"] == "mot_de_passe"


def test_identifiant_espaces_en_bordure_est_trime(client: TestClient, db_session) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "  frederic ", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 201
    assert response.json()["identifiant"] == "frederic"

    # L'identifiant trimé et sa variante non trimée désignent le même compte :
    # la seconde inscription doit être refusée comme doublon.
    doublon = client.post(
        "/api/auth/register",
        json={"identifiant": "frederic", "mot_de_passe": "un-autre-mot-de-passe"},
    )
    assert doublon.status_code == 409

    count = db_session.execute(
        select(func.count()).select_from(Account).where(func.lower(Account.identifiant) == "frederic")
    ).scalar_one()
    assert count == 1


def test_identifiant_trop_long_renvoie_422(client: TestClient) -> None:
    from app.models.account import IDENTIFIANT_MAX_LENGTH

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "a" * (IDENTIFIANT_MAX_LENGTH + 1), "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "IDENTIFIANT_TROP_LONG"
    assert body["details"]["field"] == "identifiant"


def test_identifiant_uniquement_espaces_renvoie_422_champ_requis(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "   ", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "CHAMP_REQUIS"
    assert body["details"]["field"] == "identifiant"


def test_course_entre_verification_et_ecriture_renvoie_409(
    client: TestClient, db_session, monkeypatch
) -> None:
    """Simule la fenêtre de course décrite dans services/accounts.py : la
    pré-vérification ne voit pas (encore) la ligne concurrente, seul l'index
    unique en base la détecte au flush -> IntegrityError -> 409 propre."""
    db_session.add(Account(identifiant="erwan", password_hash="hash-existant-hors-flux-normal"))
    db_session.commit()

    monkeypatch.setattr(accounts_service, "_identifiant_deja_pris", lambda db, identifiant: False)

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "erwan", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "IDENTIFIANT_INDISPONIBLE"

    # Le rollback n'a pas laissé de ligne compte/session orpheline ou dupliquée.
    compte_count = db_session.execute(
        select(func.count()).select_from(Account).where(func.lower(Account.identifiant) == "erwan")
    ).scalar_one()
    assert compte_count == 1
    session_count = db_session.execute(
        select(func.count()).select_from(SessionModel).join(Account, SessionModel.account_id == Account.id).where(
            func.lower(Account.identifiant) == "erwan"
        )
    ).scalar_one()
    assert session_count == 0


def test_identifiant_absent_renvoie_erreur_structuree(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "CHAMP_REQUIS"
    assert body["details"]["field"] == "identifiant"
    assert "correlationId" in body


def test_mot_de_passe_type_json_invalide_renvoie_erreur_structuree(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": "eve", "mot_de_passe": 12345},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "CHAMP_REQUIS"
    assert body["details"]["field"] == "mot_de_passe"
    assert "correlationId" in body
