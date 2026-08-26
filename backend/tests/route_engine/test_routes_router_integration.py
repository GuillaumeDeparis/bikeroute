"""Test d'intégration de `POST /api/routes/calculate` : vraie base
PostgreSQL/PostGIS (via `client`/`db_session`, cf. `conftest.py`), mais
`RoutingProvider` remplacé par un double injecté via
`app.dependency_overrides` -- aucune connexion réseau vers un vrai Valhalla
(cf. Boundaries de la spec)."""

from __future__ import annotations

from uuid import uuid4
from xml.etree import ElementTree as ET

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.route import Route as RouteModel
from app.models.route_export import RouteExport as RouteExportModel
from app.route_engine.application.ports import RoutingProviderError
from app.route_engine.adapters.inbound.routes_router import _nom_fichier_gpx
from app.route_engine.bootstrap.elevation import get_elevation_provider
from app.route_engine.bootstrap.routing import get_routing_provider
from app.route_engine.domain.models import Coordinate, RouteResult

from .fakes import FakeElevationProvider, FakeRoutingProvider

DEPART = {"lat": 45.0, "lon": 5.0}
DESTINATION = {"lat": 45.005, "lon": 5.005}


def _inscrire_et_connecter(client: TestClient, identifiant: str = "alice") -> None:
    response = client.post(
        "/api/auth/register",
        json={"identifiant": identifiant, "mot_de_passe": "un-mot-de-passe-solide"},
    )
    assert response.status_code == 201


def _override_provider(provider: FakeRoutingProvider) -> None:
    app.dependency_overrides[get_routing_provider] = lambda: provider


def _override_elevation_provider(provider: FakeElevationProvider | None = None) -> None:
    # Par défaut : altitude nulle pour chaque point demandé -- suffisant
    # pour ces tests d'intégration, qui ne portent pas sur les valeurs de
    # métrique elles-mêmes (couvertes par `test_metrics.py`/
    # `test_calculate_route_application.py`).
    app.dependency_overrides[get_elevation_provider] = lambda: provider or FakeElevationProvider()


def teardown_function() -> None:
    app.dependency_overrides.pop(get_routing_provider, None)
    app.dependency_overrides.pop(get_elevation_provider, None)


def test_calcul_reussi_persiste_et_renvoie_le_trace(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(
        geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3", duration_s=300.0
    )
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider(elevations=(100.0, 140.0)))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "routed"
    assert body["geometry"] == [DEPART, DESTINATION]
    assert body["unrouted_points"] == []
    assert body["provider"] == "valhalla"
    # Métriques exposées pour un parcours routé (spec-2-5) -- une seule
    # méthode de calcul serveur versionnée, jamais recalculée côté client.
    assert body["metriques"] is not None
    assert body["metriques"]["denivele_positif_m"] == pytest.approx(40.0)
    assert body["metriques"]["denivele_negatif_m"] == pytest.approx(0.0)
    assert body["metriques"]["duree_s"] == 300.0
    assert body["metriques"]["distance_m"] > 0
    assert body["metriques"]["difficulte"]
    assert body["metriques"]["version"]
    # Complément spec-2-5 : revêtements/catégories routières ("inconnu"
    # toujours présent, NFR-10 -- `FakeRoutingProvider` ne fournit aucun
    # `surface_segments`/`road_class_segments`), profil point-à-point et
    # montées significatives exposés par la même méthode versionnée.
    assert body["metriques"]["revetements"] == {"inconnu": 1.0}
    assert body["metriques"]["categories_routieres"] == {"inconnu": 1.0}
    assert len(body["metriques"]["profil"]) == 2
    assert body["metriques"]["profil"][0] == {"distance_m": 0.0, "elevation_m": 100.0}
    assert body["metriques"]["profil"][1]["elevation_m"] == 140.0
    # 40 m de D+ sur ~680 m (> seuil de 500 m à >= 3 % de pente moyenne) :
    # qualifie comme montée significative (cf. matrice I/O de la spec-2-5).
    assert len(body["metriques"]["montees_significatives"]) == 1
    assert body["metriques"]["montees_significatives"][0]["denivele_m"] == pytest.approx(40.0)

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "routed"
    assert str(rows[0].id) == body["id"]
    # Persistées avec le tracé (même flush que `PostgisRouteRepository.save`)
    # -- même garde que `geometry` ci-dessus.
    assert rows[0].metrics is not None
    assert rows[0].metrics["denivele_positif_m"] == pytest.approx(40.0)
    assert rows[0].metrics["revetements"] == body["metriques"]["revetements"]
    assert rows[0].metrics["categories_routieres"] == body["metriques"]["categories_routieres"]
    assert rows[0].metrics["profil"] == body["metriques"]["profil"]
    assert rows[0].metrics["montees_significatives"] == body["metriques"]["montees_significatives"]
    assert rows[0].metrics_version == body["metriques"]["version"]


def test_calcul_a_plus_de_deux_points_est_accepte(client: TestClient, db_session) -> None:
    """Boucle fermée (Story 2.2) : départ + point de passage + départ répété
    -- la borne `max_length` de `CalculerParcoursRequest.points` a été levée
    de 2 à 50, le moteur restant topologie-agnostique."""
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    point_de_passage = Coordinate(lat=45.002, lon=5.002)
    points_requete = [DEPART, {"lat": 45.002, "lon": 5.002}, DEPART]
    result = RouteResult(
        geometry=(depart, point_de_passage, depart),
        unrouted_points=(),
        provider="valhalla",
        version="3.8.3",
    )
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider()

    response = client.post("/api/routes/calculate", json={"points": points_requete})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "routed"
    assert body["geometry"] == [DEPART, {"lat": 45.002, "lon": 5.002}, DEPART]
    assert body["metriques"] is not None

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "routed"


def test_borne_de_points_accepte_50_et_rejette_51(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    points_50 = [{"lat": 45.0 + index * 0.0001, "lon": 5.0 + index * 0.0001} for index in range(50)]
    geometry = tuple(Coordinate(lat=point["lat"], lon=point["lon"]) for point in points_50)
    provider = FakeRoutingProvider(
        result=RouteResult(
            geometry=geometry,
            unrouted_points=(),
            provider="valhalla",
            version="3.8.3",
            duration_s=600.0,
        )
    )
    _override_provider(provider)
    _override_elevation_provider()

    accepte = client.post("/api/routes/calculate", json={"points": points_50})
    rejete = client.post("/api/routes/calculate", json={"points": [*points_50, {"lat": 46.0, "lon": 6.0}]})

    assert accepte.status_code == 201
    assert rejete.status_code == 422
    assert len(provider.calls) == 1


def test_point_non_routable_est_marque_sans_segment_direct(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    provider = FakeRoutingProvider(result=result)
    _override_provider(provider)
    elevation_provider = FakeElevationProvider()
    _override_elevation_provider(elevation_provider)

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "non_route"
    # Jamais de segment direct trompeur : la géométrie reste vide.
    assert body["geometry"] == []
    assert body["unrouted_points"] == [DESTINATION]
    # Aucune métrique pour un parcours non routé (Boundaries de la
    # spec-2-5) : le fournisseur d'élévation n'est même pas sollicité.
    assert body["metriques"] is None
    assert elevation_provider.calls == []

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows[0].statut == "non_route"
    assert rows[0].geometry is None
    assert rows[0].metrics is None
    assert rows[0].metrics_version is None


def test_depart_et_destination_coincidents_geometrie_degeneree_nest_pas_persistee_comme_routee(
    client: TestClient, db_session
) -> None:
    """Un fournisseur pourrait renvoyer une géométrie à un seul point pour un
    départ == destination (segment de longueur nulle). Doit être traité
    comme non routé -- jamais un crash de persistance PostGIS (`LINESTRING`
    à un seul point), jamais un statut "routed" trompeur."""
    _inscrire_et_connecter(client)
    point = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    result = RouteResult(geometry=(point,), unrouted_points=(), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DEPART]})

    assert response.status_code == 201
    body = response.json()
    assert body["statut"] == "non_route"
    assert body["geometry"] == []

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert len(rows) == 1
    assert rows[0].statut == "non_route"
    assert rows[0].geometry is None


def test_fournisseur_indisponible_renvoie_une_erreur_structuree_sans_persister(
    client: TestClient, db_session
) -> None:
    _inscrire_et_connecter(client)
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "MOTEUR_ROUTAGE_INDISPONIBLE"
    assert "correlationId" in body

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows == []


def test_fournisseur_delevation_indisponible_renvoie_la_meme_erreur_structuree_sans_persister(
    client: TestClient, db_session
) -> None:
    """Boundaries de la spec-2-5 : un échec du fournisseur d'élévation est
    traité exactement comme un échec du fournisseur de routage -- même
    réponse 502 `MOTEUR_ROUTAGE_INDISPONIBLE`, aucune persistance (ni tracé
    ni métrique partielle), même pour un routage par ailleurs réussi."""
    _inscrire_et_connecter(client)
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "MOTEUR_ROUTAGE_INDISPONIBLE"
    assert "correlationId" in body

    rows = list(db_session.execute(select(RouteModel)).scalars())
    assert rows == []


def test_non_authentifie_renvoie_401(client: TestClient) -> None:
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})

    assert response.status_code == 401


def test_un_seul_point_est_rejete_en_422(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    _override_provider(FakeRoutingProvider(should_fail=True))

    response = client.post("/api/routes/calculate", json={"points": [DEPART]})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# spec-2-6 : PATCH /api/routes/{id} (enregistrement), GET /api/routes (liste),
# GET /api/routes/{id} (réouverture) -- matrice I/O de la spec.
# ---------------------------------------------------------------------------


def _calculer_un_parcours_route(client: TestClient) -> dict:
    depart = Coordinate(lat=DEPART["lat"], lon=DEPART["lon"])
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(
        geometry=(depart, destination), unrouted_points=(), provider="valhalla", version="3.8.3", duration_s=300.0
    )
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider(elevations=(100.0, 140.0)))
    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})
    assert response.status_code == 201
    return response.json()


def _calculer_un_parcours_non_route(client: TestClient) -> dict:
    destination = Coordinate(lat=DESTINATION["lat"], lon=DESTINATION["lon"])
    result = RouteResult(geometry=(), unrouted_points=(destination,), provider="valhalla", version="3.8.3")
    _override_provider(FakeRoutingProvider(result=result))
    _override_elevation_provider(FakeElevationProvider())
    response = client.post("/api/routes/calculate", json={"points": [DEPART, DESTINATION]})
    assert response.status_code == 201
    return response.json()


def test_enregistrement_reussi_persiste_nom_note_etiquettes(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(
        f"/api/routes/{parcours['id']}",
        json={"nom": "Boucle du dimanche", "note": "Belle vue au sommet.", "etiquettes": ["gravel", "weekend"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["nom"] == "Boucle du dimanche"
    assert body["note"] == "Belle vue au sommet."
    assert body["etiquettes"] == ["gravel", "weekend"]
    # Points bruts d'entrée exposés pour la réouverture (spec-2-6, Design
    # Notes) -- jamais renvoyés par `/calculate` (`points` y reste `[]`).
    assert body["points"] == [DEPART, DESTINATION]
    assert body["metriques"] is not None

    row = db_session.execute(select(RouteModel).where(RouteModel.id == parcours["id"])).scalar_one()
    assert row.nom == "Boucle du dimanche"
    assert row.note == "Belle vue au sommet."
    assert row.etiquettes == ["gravel", "weekend"]


def test_enregistrement_nom_vide_est_rejete_sans_modifier_la_ligne(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "", "note": "gardé"})

    assert response.status_code == 422
    assert response.json()["code"] == "PARAMETRES_INVALIDES"

    row = db_session.execute(select(RouteModel).where(RouteModel.id == parcours["id"])).scalar_one()
    assert row.nom is None


def test_enregistrement_nom_absent_est_rejete(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(f"/api/routes/{parcours['id']}", json={})

    assert response.status_code == 422
    assert response.json()["code"] == "PARAMETRES_INVALIDES"


def test_enregistrement_avec_une_etiquette_vide_apres_trim_est_rejete(client: TestClient, db_session) -> None:
    """Le frontend trim/filtre déjà les étiquettes avant envoi (`Atelier.tsx`),
    mais l'API reste appelable directement -- une étiquette vide/uniquement
    des espaces ne doit jamais être persistée (revue de code post-
    implémentation)."""
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Valide", "etiquettes": ["gravel", "   "]})

    assert response.status_code == 422

    row = db_session.execute(select(RouteModel).where(RouteModel.id == parcours["id"])).scalar_one()
    assert row.nom is None


def test_enregistrement_avec_une_etiquette_trop_longue_est_rejete(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Valide", "etiquettes": ["x" * 51]})

    assert response.status_code == 422


def test_enregistrement_normalise_les_etiquettes_par_un_trim(client: TestClient) -> None:
    """`StringConstraints(strip_whitespace=True, ...)` normalise aussi la
    valeur stockée, pas seulement la validation."""
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Valide", "etiquettes": ["  gravel  "]})

    assert response.status_code == 200
    assert response.json()["etiquettes"] == ["gravel"]


def test_enregistrement_dun_parcours_non_route_est_refuse(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_non_route(client)
    assert parcours["statut"] == "non_route"

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Tentative"})

    assert response.status_code == 422
    assert response.json()["code"] == "PARCOURS_NON_PRET"


def test_enregistrement_dun_parcours_dun_autre_compte_renvoie_404(client: TestClient) -> None:
    _inscrire_et_connecter(client, identifiant="alice")
    parcours = _calculer_un_parcours_route(client)

    client.post("/api/auth/logout")
    _inscrire_et_connecter(client, identifiant="bob")

    response = client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Vol de parcours"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESSOURCE_INTROUVABLE"


def test_enregistrement_dun_id_inexistant_renvoie_404_identique(client: TestClient) -> None:
    _inscrire_et_connecter(client)

    response = client.patch(f"/api/routes/{uuid4()}", json={"nom": "Fantôme"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESSOURCE_INTROUVABLE"


def test_enregistrement_sans_authentification_renvoie_401(client: TestClient) -> None:
    response = client.patch(f"/api/routes/{uuid4()}", json={"nom": "Peu importe"})

    assert response.status_code == 401


def test_liste_mes_parcours_ne_contient_que_les_parcours_nommes_recent_dabord(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    non_nomme = _calculer_un_parcours_route(client)
    premier_nomme = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{premier_nomme['id']}", json={"nom": "Premier"})
    second_nomme = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{second_nomme['id']}", json={"nom": "Second", "etiquettes": ["rapide"]})

    response = client.get("/api/routes")

    assert response.status_code == 200
    body = response.json()
    ids = [ligne["id"] for ligne in body]
    assert non_nomme["id"] not in ids
    assert ids == [second_nomme["id"], premier_nomme["id"]]
    assert body[0]["nom"] == "Second"
    assert body[0]["etiquettes"] == ["rapide"]
    assert body[0]["distance_m"] > 0
    assert body[0]["duree_s"] == 300.0
    assert body[0]["difficulte"]


def test_liste_mes_parcours_vide_quand_aucun_parcours_nomme(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    _calculer_un_parcours_route(client)

    response = client.get("/api/routes")

    assert response.status_code == 200
    assert response.json() == []


def test_liste_mes_parcours_sans_authentification_renvoie_401(client: TestClient) -> None:
    response = client.get("/api/routes")

    assert response.status_code == 401


def test_reouverture_dun_parcours_enregistre_renvoie_points_trace_et_metriques(
    client: TestClient, db_session
) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Boucle du dimanche"})

    response = client.get(f"/api/routes/{parcours['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["statut"] == "routed"
    assert body["nom"] == "Boucle du dimanche"
    assert body["points"] == [DEPART, DESTINATION]
    # Tracé relu depuis PostGIS (jamais recalculé -- aucun fournisseur de
    # routage/élévation surchargé pour cet appel, cf. Boundaries de la spec).
    assert body["geometry"] == [DEPART, DESTINATION]
    assert body["metriques"] is not None
    assert body["metriques"]["duree_s"] == pytest.approx(300.0)
    assert body["metriques"]["denivele_positif_m"] == pytest.approx(40.0)


def test_reouverture_dun_parcours_dun_autre_compte_renvoie_404(client: TestClient) -> None:
    _inscrire_et_connecter(client, identifiant="alice")
    parcours = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{parcours['id']}", json={"nom": "À moi"})

    client.post("/api/auth/logout")
    _inscrire_et_connecter(client, identifiant="bob")

    response = client.get(f"/api/routes/{parcours['id']}")

    assert response.status_code == 404
    assert response.json()["code"] == "RESSOURCE_INTROUVABLE"


def test_reouverture_sans_authentification_renvoie_401(client: TestClient) -> None:
    response = client.get(f"/api/routes/{uuid4()}")

    assert response.status_code == 401


def test_reouverture_dun_ancien_parcours_sans_revetements_ni_profil_naffiche_que_ce_qui_existe(
    client: TestClient, db_session
) -> None:
    """Un parcours calculé avant la story 2.5 (détail) n'a en base ni
    `revetements`/`categories_routieres`/`profil`/`montees_significatives`
    (JSONB plus ancien) -- la réouverture doit rester possible, avec ces
    champs vides, jamais une erreur 500 (matrice I/O de la spec-2-6)."""
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Vieux parcours"})

    row = db_session.execute(select(RouteModel).where(RouteModel.id == parcours["id"])).scalar_one()
    ancien_metrics = {
        "distance_m": row.metrics["distance_m"],
        "denivele_positif_m": row.metrics["denivele_positif_m"],
        "denivele_negatif_m": row.metrics["denivele_negatif_m"],
        "duree_s": row.metrics["duree_s"],
        "difficulte": row.metrics["difficulte"],
    }
    row.metrics = ancien_metrics
    db_session.commit()

    response = client.get(f"/api/routes/{parcours['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["metriques"] is not None
    assert body["metriques"]["distance_m"] == pytest.approx(ancien_metrics["distance_m"])
    assert body["metriques"]["revetements"] == {"inconnu": 0.0}
    assert body["metriques"]["categories_routieres"] == {"inconnu": 0.0}
    assert body["metriques"]["profil"] == []
    assert body["metriques"]["montees_significatives"] == []


def test_export_reussi_renvoie_un_gpx_bien_forme_et_journalise_lhistorique(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)
    client.patch(f"/api/routes/{parcours['id']}", json={"nom": "Boucle du dimanche"})

    response = client.post(f"/api/routes/{parcours['id']}/export")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/gpx+xml")
    assert response.headers["content-disposition"] == 'attachment; filename="boucle-du-dimanche.gpx"'

    racine = ET.fromstring(response.text)
    ns = {"gpx": "http://www.topografix.com/GPX/1/1"}
    trkpts = racine.findall("gpx:trk/gpx:trkseg/gpx:trkpt", ns)
    assert len(trkpts) == 2
    assert trkpts[0].find("gpx:ele", ns).text == "100.0"
    wpts = racine.findall("gpx:wpt", ns)
    assert [wpt.find("gpx:name", ns).text for wpt in wpts] == ["Départ", "Arrivée"]

    lignes = list(db_session.execute(select(RouteExportModel)).scalars())
    assert len(lignes) == 1
    assert str(lignes[0].route_id) == parcours["id"]


def test_export_sans_nom_utilise_un_nom_de_fichier_generique(client: TestClient) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)
    assert parcours["nom"] is None  # jamais renseigné par `/calculate` (schéma `ParcoursResponse`)

    response = client.post(f"/api/routes/{parcours['id']}/export")

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="parcours.gpx"'


def test_export_dun_parcours_non_route_est_refuse_sans_journaliser(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_non_route(client)
    assert parcours["statut"] == "non_route"

    response = client.post(f"/api/routes/{parcours['id']}/export")

    assert response.status_code == 422
    assert response.json()["code"] == "PARCOURS_NON_PRET"
    assert list(db_session.execute(select(RouteExportModel)).scalars()) == []


def test_export_dun_parcours_dun_autre_compte_renvoie_404(client: TestClient) -> None:
    _inscrire_et_connecter(client, identifiant="alice")
    parcours = _calculer_un_parcours_route(client)

    client.post("/api/auth/logout")
    _inscrire_et_connecter(client, identifiant="bob")

    response = client.post(f"/api/routes/{parcours['id']}/export")

    assert response.status_code == 404
    assert response.json()["code"] == "RESSOURCE_INTROUVABLE"


def test_export_dun_id_inexistant_renvoie_404_identique(client: TestClient) -> None:
    _inscrire_et_connecter(client)

    response = client.post(f"/api/routes/{uuid4()}/export")

    assert response.status_code == 404
    assert response.json()["code"] == "RESSOURCE_INTROUVABLE"


def test_export_sans_authentification_renvoie_401(client: TestClient) -> None:
    response = client.post(f"/api/routes/{uuid4()}/export")

    assert response.status_code == 401


def test_export_repete_journalise_une_ligne_par_export(client: TestClient, db_session) -> None:
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    premiere = client.post(f"/api/routes/{parcours['id']}/export")
    seconde = client.post(f"/api/routes/{parcours['id']}/export")

    assert premiere.status_code == 200
    assert seconde.status_code == 200
    lignes = list(db_session.execute(select(RouteExportModel)).scalars())
    assert len(lignes) == 2


def test_export_dun_ancien_parcours_sans_profil_est_refuse_proprement_sans_journaliser(
    client: TestClient, db_session
) -> None:
    """Un parcours `routed` calculé avant la story 2.5 (détail) a un
    `metrics` JSONB sans clé `"profil"` (même scénario que
    `test_reouverture_dun_ancien_parcours_sans_revetements_ni_profil...`) --
    le GPX ne peut structurellement pas porter d'élévation sur tout le tracé
    dans ce cas (Boundaries "Always" du spec) : traité comme "pas encore
    prêt" (422), jamais un 500 non documenté."""
    _inscrire_et_connecter(client)
    parcours = _calculer_un_parcours_route(client)

    row = db_session.execute(select(RouteModel).where(RouteModel.id == parcours["id"])).scalar_one()
    row.metrics = {
        "distance_m": row.metrics["distance_m"],
        "denivele_positif_m": row.metrics["denivele_positif_m"],
        "denivele_negatif_m": row.metrics["denivele_negatif_m"],
        "duree_s": row.metrics["duree_s"],
        "difficulte": row.metrics["difficulte"],
    }
    db_session.commit()

    response = client.post(f"/api/routes/{parcours['id']}/export")

    assert response.status_code == 422
    assert response.json()["code"] == "PARCOURS_NON_PRET"
    assert list(db_session.execute(select(RouteExportModel)).scalars()) == []


def test_nom_fichier_gpx_dun_nom_qui_se_translittere_en_chaine_vide_retombe_sur_le_generique() -> None:
    """Un nom entièrement non-ASCII (ex. sinogrammes, emoji) ne survit pas à
    la translittération NFKD -> ASCII : `slug` devient vide, jamais un nom de
    fichier vide ni non téléchargeable (Boundaries du spec)."""
    assert _nom_fichier_gpx("中文") == "parcours.gpx"
    assert _nom_fichier_gpx("🚴") == "parcours.gpx"
