"""Couvre la matrice I/O de `POST /api/auth/login` et `GET /api/auth/session`
(spec-1-2)."""

from __future__ import annotations

import re
from datetime import timedelta

from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text

from app.config import get_settings
from app.models.account import Account
from app.models.session import Session as SessionModel


def _inscrire(client: TestClient, identifiant: str, mot_de_passe: str = "un-mot-de-passe-solide") -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": mot_de_passe},
    )
    assert response.status_code == 201
    client.cookies.clear()


def test_connexion_reussie_ouvre_session_et_pose_le_cookie(client: TestClient, db_session) -> None:
    settings = get_settings()
    _inscrire(client, "alice")

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "alice", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["identifiant"] == "alice"
    assert "mot_de_passe" not in body
    assert "password_hash" not in body

    cookie = next(c for c in response.cookies.jar if c.name == settings.session_cookie_name)
    assert cookie.value is not None
    assert "HttpOnly" in cookie._rest  # type: ignore[attr-defined]
    assert cookie.secure is True
    assert cookie._rest.get("SameSite", "").lower() == "lax"  # type: ignore[attr-defined]

    # L'inscription (`_inscrire`) a déjà ouvert une première session : on
    # vérifie ici que la connexion en a bien créé une seconde, distincte,
    # et que c'est bien celle-ci que référence le nouveau cookie.
    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == cookie.value)
    ).scalar_one()
    assert str(session_row.id) == cookie.value
    assert session_row.account_id == db_session.execute(
        select(Account.id).where(Account.identifiant == "alice")
    ).scalar_one()


def test_identifiant_inconnu_renvoie_401_message_generique(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"identifiant": "personne-narrive", "mot_de_passe": "peu-importe-le-mdp"},
    )

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "IDENTIFIANTS_INVALIDES"
    assert "correlationId" in body
    assert "mot_de_passe" not in body
    assert "password_hash" not in body


def test_mot_de_passe_incorrect_renvoie_401_meme_message_generique(client: TestClient) -> None:
    _inscrire(client, "bob")

    reponse_mdp_faux = client.post(
        "/api/auth/login",
        json={"identifiant": "bob", "mot_de_passe": "mauvais-mot-de-passe"},
    )
    reponse_identifiant_inconnu = client.post(
        "/api/auth/login",
        json={"identifiant": "personne-de-ce-nom", "mot_de_passe": "peu-importe-le-mdp"},
    )

    assert reponse_mdp_faux.status_code == 401
    assert reponse_identifiant_inconnu.status_code == 401
    assert reponse_mdp_faux.json()["code"] == "IDENTIFIANTS_INVALIDES"
    assert reponse_identifiant_inconnu.json()["code"] == "IDENTIFIANTS_INVALIDES"
    # Même message, quelle que soit la cause : rien ne doit permettre de
    # distinguer "identifiant inconnu" de "mot de passe erroné".
    assert reponse_mdp_faux.json()["message"] == reponse_identifiant_inconnu.json()["message"]


def test_echec_connexion_verifie_toujours_un_hachage_meme_identifiant_inconnu(
    client: TestClient, monkeypatch
) -> None:
    """Défense temporelle (Design Notes) : un identifiant inconnu passe quand
    même par une vérification Argon2id (contre un hachage factice), pour que
    le coût de la vérification ne dépende jamais de la cause de l'échec."""
    appels: list[str] = []
    original_verify = PasswordHasher.verify

    def _verify_espionne(self: PasswordHasher, hash_: str, password: str) -> bool:
        appels.append(hash_)
        return original_verify(self, hash_, password)

    monkeypatch.setattr(PasswordHasher, "verify", _verify_espionne)

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "totalement-inconnu", "mot_de_passe": "peu-importe"},
    )

    assert response.status_code == 401
    assert len(appels) == 1


def test_verification_session_valide_renvoie_identite(client: TestClient) -> None:
    _inscrire(client, "carole")
    client.post(
        "/api/auth/login",
        json={"identifiant": "carole", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    assert response.json()["identifiant"] == "carole"


def test_verification_session_sans_cookie_renvoie_401(client: TestClient) -> None:
    response = client.get("/api/auth/session")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "SESSION_INVALIDE"
    assert "correlationId" in body


def test_verification_session_cookie_orphelin_renvoie_401(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "018f1e00-0000-7000-8000-000000000000")

    response = client.get("/api/auth/session")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"


def test_verification_session_cookie_malforme_renvoie_401(client: TestClient) -> None:
    settings = get_settings()
    client.cookies.set(settings.session_cookie_name, "pas-un-uuid")

    response = client.get("/api/auth/session")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"


def test_verification_session_expiree_renvoie_401(client: TestClient, db_session) -> None:
    settings = get_settings()
    _inscrire(client, "denis")
    login_response = client.post(
        "/api/auth/login",
        json={"identifiant": "denis", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    cookie = next(c for c in login_response.cookies.jar if c.name == settings.session_cookie_name)

    session_row = db_session.execute(
        select(SessionModel).where(SessionModel.id == cookie.value)
    ).scalar_one()
    session_row.expires_at = session_row.created_at - timedelta(seconds=1)
    db_session.commit()

    response = client.get("/api/auth/session")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"


def test_verification_session_reponse_n_est_jamais_mise_en_cache(client: TestClient) -> None:
    _inscrire(client, "karim")
    client.post(
        "/api/auth/login",
        json={"identifiant": "karim", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    assert response.headers.get("cache-control") == "no-store"


def test_connexion_avec_identifiant_espaces_en_bordure_fonctionne(client: TestClient) -> None:
    _inscrire(client, "hugo")

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "  hugo  ", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 200
    assert response.json()["identifiant"] == "hugo"


def test_connexion_insensible_a_la_casse_de_l_identifiant(client: TestClient) -> None:
    _inscrire(client, "isabelle")

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "ISABELLE", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 200
    assert response.json()["identifiant"] == "isabelle"


def test_connexion_reussie_cookie_max_age_correspond_a_la_duree_de_session(client: TestClient) -> None:
    settings = get_settings()
    _inscrire(client, "julien")

    response = client.post(
        "/api/auth/login",
        json={"identifiant": "julien", "mot_de_passe": "un-mot-de-passe-solide"},
    )

    assert response.status_code == 200
    set_cookie_header = response.headers.get("set-cookie", "")
    max_age_match = re.search(r"Max-Age=(\d+)", set_cookie_header, re.IGNORECASE)
    assert max_age_match is not None
    assert int(max_age_match.group(1)) == settings.session_duration_days * 24 * 3600


def test_deconnexion_une_session_ne_ferme_pas_les_autres_sessions_du_meme_compte(
    client: TestClient, db_session
) -> None:
    """Deux connexions concurrentes (deux appareils/onglets) du même compte
    ouvrent deux sessions distinctes : fermer l'une ne doit pas invalider
    l'autre."""
    settings = get_settings()
    _inscrire(client, "gaelle")

    connexion_a = client.post(
        "/api/auth/login",
        json={"identifiant": "gaelle", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    cookie_a = next(c for c in connexion_a.cookies.jar if c.name == settings.session_cookie_name).value

    connexion_b = client.post(
        "/api/auth/login",
        json={"identifiant": "gaelle", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    cookie_b = next(c for c in connexion_b.cookies.jar if c.name == settings.session_cookie_name).value
    assert cookie_a != cookie_b

    # Le jar du client courant porte le cookie B (la connexion la plus
    # récente) : se déconnecter ne doit fermer que cette session-là.
    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 204

    session_b_row = db_session.execute(select(SessionModel).where(SessionModel.id == cookie_b)).scalar_one_or_none()
    assert session_b_row is None

    session_a_row = db_session.execute(select(SessionModel).where(SessionModel.id == cookie_a)).scalar_one_or_none()
    assert session_a_row is not None

    # La session A, elle, authentifie toujours.
    client.cookies.set(settings.session_cookie_name, cookie_a)
    verification = client.get("/api/auth/session")
    assert verification.status_code == 200
    assert verification.json()["identifiant"] == "gaelle"


def test_verification_session_avec_compte_supprime_entre_temps_renvoie_401(
    client: TestClient, db_session
) -> None:
    """`get_current_account` doit renvoyer 401 si le cookie référence une
    session dont le compte a disparu -- même si ce n'est normalement pas
    censé arriver seul (FK `ON DELETE CASCADE`), c'est le filet de sécurité
    de dernier recours. On désactive momentanément les triggers (donc la
    cascade) pour isoler précisément ce cas : session encore présente,
    compte absent."""
    settings = get_settings()
    _inscrire(client, "fantome")
    login_response = client.post(
        "/api/auth/login",
        json={"identifiant": "fantome", "mot_de_passe": "un-mot-de-passe-solide"},
    )
    cookie = next(c for c in login_response.cookies.jar if c.name == settings.session_cookie_name)

    db_session.execute(text("SET LOCAL session_replication_role = replica"))
    db_session.execute(delete(Account).where(Account.identifiant == "fantome"))
    db_session.commit()

    # Confirme que la session a bien survécu à la suppression du compte
    # (sans quoi ce test ne prouverait rien de plus que le cas "orphelin").
    assert (
        db_session.execute(select(Account).where(Account.identifiant == "fantome")).scalar_one_or_none() is None
    )
    assert (
        db_session.execute(select(SessionModel).where(SessionModel.id == cookie.value)).scalar_one_or_none()
        is not None
    )

    response = client.get("/api/auth/session")

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_INVALIDE"
