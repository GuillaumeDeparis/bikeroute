"""Couvre les durcissements ajoutés lors de la revue de code de l'épic 1 :
limitation de débit sur `/login`/`/register`, en-têtes de sécurité, limite
de taille de corps de requête, sonde `/health`, et purge des sessions
expirées."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.models.session import Session as SessionModel


def _inscrire(client: TestClient, identifiant: str, mot_de_passe: str = "un-mot-de-passe-solide") -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": mot_de_passe},
    )
    assert response.status_code == 201
    client.cookies.clear()


def test_login_bloque_apres_trop_de_tentatives(client: TestClient) -> None:
    settings = get_settings()
    _inscrire(client, "victime-brute-force")

    for _ in range(settings.login_rate_limit_max_attempts):
        response = client.post(
            "/api/auth/login",
            json={"identifiant": "victime-brute-force", "mot_de_passe": "mauvais-mot-de-passe"},
        )
        assert response.status_code == 401

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "victime-brute-force", "mot_de_passe": "mauvais-mot-de-passe"},
    )

    assert response.status_code == 429
    assert response.json()["code"] == "TROP_DE_TENTATIVES"


def test_register_bloque_apres_trop_de_tentatives(client: TestClient) -> None:
    """Même identifiant à chaque tentative : la clé de limitation est
    IP+identifiant, donc c'est en la gardant fixe que le quota s'épuise
    (un mot de passe vide échoue en 422 sans jamais créer le compte, ce qui
    permet de répéter l'identifiant sans collision d'unicité)."""
    settings = get_settings()

    for _ in range(settings.register_rate_limit_max_attempts):
        response = client.post(
            "/api/auth/register",
            json={"identifiant": "trop-de-tentatives", "mot_de_passe": ""},
        )
        assert response.status_code == 422

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "trop-de-tentatives", "mot_de_passe": ""},
    )

    assert response.status_code == 429
    assert response.json()["code"] == "TROP_DE_TENTATIVES"


def test_limite_de_tentatives_est_isolee_par_identifiant(client: TestClient) -> None:
    """Un identifiant qui épuise son quota ne bloque pas les tentatives sur
    un autre identifiant depuis la même IP (le rate limit est par
    IP+identifiant, pas seulement par IP)."""
    settings = get_settings()
    _inscrire(client, "premiere-victime")

    for _ in range(settings.login_rate_limit_max_attempts):
        client.post(
            "/api/auth/login",
            json={"identifiant": "premiere-victime", "mot_de_passe": "mauvais-mot-de-passe"},
        )

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "un-tout-autre-identifiant-inconnu", "mot_de_passe": "peu-importe"},
    )

    assert response.status_code == 401


def test_reponse_porte_les_en_tetes_de_securite_de_base(client: TestClient) -> None:
    response = client.get("/health")

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("strict-transport-security", "").startswith("max-age=")


def test_corps_de_requete_trop_volumineux_est_rejete(client: TestClient) -> None:
    payload_geant = "x" * (17 * 1024)

    response = client.post(
        "/api/auth/register",
        json={"identifiant": "peu-importe", "mot_de_passe": payload_geant},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TROP_VOLUMINEUX"


def test_health_renvoie_ok_quand_la_base_est_joignable(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_sessions_expirees_sont_purgees_a_la_prochaine_connexion(client: TestClient, db_session) -> None:
    _inscrire(client, "premiere-session")
    login_response = client.post(
        "/api/auth/login",
        json={"identifiant": "premiere-session", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    settings = get_settings()
    cookie = login_response.cookies.get(settings.session_cookie_name)

    session_row = db_session.execute(select(SessionModel).where(SessionModel.id == cookie)).scalar_one()
    session_row.expires_at = session_row.created_at - timedelta(seconds=1)
    db_session.commit()

    # Un compte différent se connecte : ce n'est pas son propre passage qui
    # est vérifié, mais l'effet de bord global de `create_session` sur
    # *toutes* les sessions expirées de la table, pas seulement les
    # siennes.
    _inscrire(client, "seconde-session")
    client.post(
        "/api/auth/login",
        json={"identifiant": "seconde-session", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert (
        db_session.execute(select(SessionModel).where(SessionModel.id == cookie)).scalar_one_or_none() is None
    )
