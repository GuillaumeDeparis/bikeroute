"""Couvre la matrice I/O de spec-1-3 : `GET /api/auth/sessions` et
`DELETE /api/auth/sessions/{session_id}`, preuve du mécanisme générique
d'autorisation par propriétaire (`services/authorization.get_owned_or_404`)
sur un vrai cas d'usage backend (les sessions)."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.models.session import Session as SessionModel


def _inscrire(client: TestClient, identifiant: str, mot_de_passe: str = "un-mot-de-passe-solide") -> str:
    """Inscrit un compte, laisse le cookie de session posé sur `client`, et
    renvoie l'id (str) de la session ouverte par l'inscription."""
    settings = get_settings()
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": mot_de_passe},
    )
    assert response.status_code == 201
    return client.cookies.get(settings.session_cookie_name)


def test_lister_ses_sessions_actives_renvoie_le_courant_marque(client: TestClient) -> None:
    settings = get_settings()
    session_id_1 = _inscrire(client, "alice")

    connexion = client.post(
        "/api/auth/login",
        json={"identifiant": "alice", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert connexion.status_code == 200
    session_id_2 = client.cookies.get(settings.session_cookie_name)
    assert session_id_2 != session_id_1

    response = client.get("/api/auth/sessions")

    assert response.status_code == 200
    # Données liées à l'identité : jamais mises en cache (même précaution que
    # `GET /session`, cf. spec-1-2).
    assert response.headers.get("cache-control") == "no-store"
    body = response.json()
    ids = {item["id"] for item in body}
    assert ids == {session_id_1, session_id_2}

    courant = [item for item in body if item["current"]]
    assert len(courant) == 1
    assert courant[0]["id"] == session_id_2

    non_courant = [item for item in body if not item["current"]]
    assert len(non_courant) == 1
    assert non_courant[0]["id"] == session_id_1

    for item in body:
        assert "created_at" in item
        assert "expires_at" in item


def test_lister_ses_sessions_ne_montre_pas_celles_d_un_autre_compte(client: TestClient) -> None:
    _inscrire(client, "alice")
    client.cookies.clear()
    _inscrire(client, "bob")

    response = client.get("/api/auth/sessions")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1


def test_lister_ses_sessions_exclut_une_session_expiree_du_meme_compte(
    client: TestClient, db_session
) -> None:
    """Une session expirée n'est pas "active" : `list_active_sessions` doit
    l'exclure, même si elle appartient au compte authentifié."""
    settings = get_settings()
    session_id_expiree = _inscrire(client, "helene")

    connexion = client.post(
        "/api/auth/login",
        json={"identifiant": "helene", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert connexion.status_code == 200
    session_id_courante = client.cookies.get(settings.session_cookie_name)

    # Expire la session de l'inscription (pas celle du cookie courant, sinon
    # la requête elle-même échouerait en 401).
    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id_expiree)
    ).scalar_one()
    session_row.expires_at = session_row.created_at - timedelta(seconds=1)
    db_session.commit()

    response = client.get("/api/auth/sessions")

    assert response.status_code == 200
    body = response.json()
    ids = {item["id"] for item in body}
    assert ids == {session_id_courante}


def test_lister_ses_sessions_ordonne_la_plus_recente_en_premier(client: TestClient) -> None:
    settings = get_settings()
    session_id_1 = _inscrire(client, "isidore")

    connexion = client.post(
        "/api/auth/login",
        json={"identifiant": "isidore", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert connexion.status_code == 200
    session_id_2 = client.cookies.get(settings.session_cookie_name)

    response = client.get("/api/auth/sessions")

    assert response.status_code == 200
    body = response.json()
    # Vérification positionnelle (pas seulement d'ensemble) : la session
    # ouverte par la connexion (la plus récente) doit apparaître en premier.
    assert [item["id"] for item in body] == [session_id_2, session_id_1]


def test_revoquer_une_autre_de_ses_sessions_supprime_uniquement_celle_ci(
    client: TestClient, db_session
) -> None:
    settings = get_settings()
    session_id_1 = _inscrire(client, "carole")

    connexion = client.post(
        "/api/auth/login",
        json={"identifiant": "carole", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert connexion.status_code == 200
    session_id_2 = client.cookies.get(settings.session_cookie_name)

    # Le cookie du client courant porte session_id_2 (session A la plus
    # récente) : on révoque explicitement l'autre (session_id_1) par id.
    response = client.delete(f"/api/auth/sessions/{session_id_1}")

    assert response.status_code == 204

    session_1_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id_1)
    ).scalar_one_or_none()
    assert session_1_row is None

    session_2_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id_2)
    ).scalar_one_or_none()
    assert session_2_row is not None

    # La session courante (session_id_2) n'a pas été révoquée : le cookie
    # doit toujours authentifier.
    verification = client.get("/api/auth/session")
    assert verification.status_code == 200
    assert verification.json()["identifiant"] == "carole"


def test_revoquer_sa_session_courante_efface_le_cookie(client: TestClient, db_session) -> None:
    settings = get_settings()
    session_id = _inscrire(client, "denis")

    response = client.delete(f"/api/auth/sessions/{session_id}")

    assert response.status_code == 204

    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    ).scalar_one_or_none()
    assert session_row is None

    set_cookie_header = response.headers.get("set-cookie", "")
    assert settings.session_cookie_name in set_cookie_header
    assert "Max-Age=0" in set_cookie_header or "1970" in set_cookie_header

    verification = client.get("/api/auth/session")
    assert verification.status_code == 401


def test_revoquer_une_session_d_un_autre_compte_renvoie_404_et_ne_supprime_rien(
    client: TestClient, db_session
) -> None:
    # Compte A et sa session.
    session_id_a = _inscrire(client, "eve")
    client.cookies.clear()

    # Compte B, authentifié sur le client courant.
    _inscrire(client, "frank")

    response = client.delete(f"/api/auth/sessions/{session_id_a}")

    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "RESSOURCE_INTROUVABLE"
    assert "correlationId" in body

    # Rien supprimé : la session du compte A existe toujours.
    session_a_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == session_id_a)
    ).scalar_one_or_none()
    assert session_a_row is not None


def test_revoquer_un_id_inexistant_renvoie_le_meme_404_sans_oracle(client: TestClient) -> None:
    _inscrire(client, "gaelle")

    response = client.delete("/api/auth/sessions/018f1e00-0000-7000-8000-000000000000")

    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "RESSOURCE_INTROUVABLE"


def test_lister_sessions_sans_cookie_renvoie_401(client: TestClient) -> None:
    response = client.get("/api/auth/sessions")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "SESSION_INVALIDE"
    assert "correlationId" in body


def test_lister_sessions_avec_cookie_invalide_renvoie_401(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "pas-un-uuid")

    response = client.get("/api/auth/sessions")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"


def test_revoquer_session_sans_cookie_renvoie_401(client: TestClient) -> None:
    response = client.delete("/api/auth/sessions/018f1e00-0000-7000-8000-000000000000")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "SESSION_INVALIDE"
    assert "correlationId" in body


def test_revoquer_session_avec_cookie_invalide_renvoie_401(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "018f1e00-0000-7000-8000-000000000000")

    response = client.delete("/api/auth/sessions/018f1e00-0000-7000-8000-000000000001")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"


def test_revoquer_session_avec_cookie_syntaxiquement_invalide_renvoie_401(client: TestClient) -> None:
    """Miroir de `test_lister_sessions_avec_cookie_invalide_renvoie_401` :
    même cas (cookie qui n'est même pas un UUID), sur l'endpoint DELETE."""
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "pas-un-uuid")

    response = client.delete("/api/auth/sessions/018f1e00-0000-7000-8000-000000000001")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"
