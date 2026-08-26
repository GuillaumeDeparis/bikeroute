"""Couvre `GET /api/geocode` (`routers/geocode.py`) : session requise,
mapping de la réponse Nominatim vers `ResultatRecherche`, et traduction de
tout échec fournisseur (réseau/HTTP/JSON invalide) en 502
`RECHERCHE_INDISPONIBLE` structuré. `httpx.get` est monkeypatché -- aucune
connexion réseau vers un vrai Nominatim dans ces tests."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.routers import geocode as geocode_module
from app.config import get_settings


def _inscrire_et_connecter(client: TestClient, identifiant: str = "alice") -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert response.status_code == 201


def test_sans_session_renvoie_401(client: TestClient) -> None:
    response = client.get("/api/geocode", params={"q": "Paris"})

    assert response.status_code == 401


def test_succes_mappe_display_name_et_caste_lat_lon_et_filtre_les_entrees_incompletes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _inscrire_et_connecter(client)

    def fake_get(url: str, *, params: dict, headers: dict, timeout: float) -> httpx.Response:
        assert params["q"] == "Paris"
        return httpx.Response(
            200,
            json=[
                {"display_name": "Paris, Île-de-France, France", "lat": "48.8566", "lon": "2.3522"},
                # Entrée sans lat/lon : doit être filtrée, jamais planter le cast float().
                {"display_name": "Résultat incomplet"},
            ],
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(geocode_module.httpx, "get", fake_get)

    response = client.get("/api/geocode", params={"q": "Paris"})

    assert response.status_code == 200
    body = response.json()
    assert body == [{"label": "Paris, Île-de-France, France", "lat": 48.8566, "lon": 2.3522}]
    assert isinstance(body[0]["lat"], float)
    assert isinstance(body[0]["lon"], float)


@pytest.mark.parametrize(
    "fake_get_factory",
    [
        # Panne réseau : `httpx.get` lève directement.
        lambda: (lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("connexion refusée"))),
        # Réponse HTTP en échec (Nominatim indisponible/quota dépassé).
        lambda: (lambda url, **k: httpx.Response(503, text="indisponible", request=httpx.Request("GET", url))),
        # Réponse 200 mais corps non-JSON.
        lambda: (lambda url, **k: httpx.Response(200, text="<html>pas du JSON</html>", request=httpx.Request("GET", url))),
    ],
    ids=["panne-reseau", "http-503", "json-invalide"],
)
def test_echec_fournisseur_renvoie_502_recherche_indisponible(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, fake_get_factory
) -> None:
    _inscrire_et_connecter(client)
    monkeypatch.setattr(geocode_module.httpx, "get", fake_get_factory())

    response = client.get("/api/geocode", params={"q": "Paris"})

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "RECHERCHE_INDISPONIBLE"
    assert "correlationId" in body


def test_rate_limit_geocode_bloque_avant_un_nouvel_appel_nominatim(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _inscrire_et_connecter(client)
    appels = 0

    def fake_get(url: str, **kwargs) -> httpx.Response:
        nonlocal appels
        appels += 1
        return httpx.Response(200, json=[], request=httpx.Request("GET", url))

    monkeypatch.setattr(geocode_module.httpx, "get", fake_get)
    limite = get_settings().geocode_rate_limit_max_attempts
    for _ in range(limite):
        assert client.get("/api/geocode", params={"q": "Paris"}).status_code == 200

    response = client.get("/api/geocode", params={"q": "Paris"})

    assert response.status_code == 429
    assert response.json()["code"] == "TROP_DE_TENTATIVES"
    assert appels == limite
