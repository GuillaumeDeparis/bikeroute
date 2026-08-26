"""Tests unitaires purs de `construire_gpx` (`route_engine/domain/gpx.py`) :
aucune infrastructure, aucun accès réseau/DB (AD-1)."""

from __future__ import annotations

from xml.etree import ElementTree as ET

import pytest

from app.route_engine.domain.gpx import construire_gpx
from app.route_engine.domain.metrics import PointProfil
from app.route_engine.domain.models import Coordinate

NS = {"gpx": "http://www.topografix.com/GPX/1/1"}


def test_echappe_un_nom_contenant_esperluette_et_chevron() -> None:
    nom = "Côte & Descente <rapide>"
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.01, lon=5.01)

    xml = construire_gpx(
        nom,
        (depart, destination),
        (depart, destination),
        (PointProfil(distance_m=0.0, elevation_m=100.0), PointProfil(distance_m=100.0, elevation_m=110.0)),
    )

    # Le nom brut ne doit jamais apparaître non échappé dans la sortie --
    # seul vrai risque XML via ce champ utilisateur (Boundaries "Ask First"
    # de la spec) -- uniquement sa forme échappée.
    assert nom not in xml
    assert "&amp;" in xml
    assert "&lt;rapide&gt;" in xml

    racine = ET.fromstring(xml)
    assert racine.find("gpx:metadata/gpx:name", NS).text == nom
    assert racine.find("gpx:trk/gpx:name", NS).text == nom


def test_associe_une_elevation_a_chaque_point_de_trace_dans_lordre() -> None:
    geometry = (
        Coordinate(lat=45.0, lon=5.0),
        Coordinate(lat=45.01, lon=5.01),
        Coordinate(lat=45.02, lon=5.02),
    )
    profil = (
        PointProfil(distance_m=0.0, elevation_m=100.0),
        PointProfil(distance_m=500.0, elevation_m=180.0),
        PointProfil(distance_m=1200.0, elevation_m=140.0),
    )

    xml = construire_gpx("Ma sortie", (geometry[0], geometry[-1]), geometry, profil)

    racine = ET.fromstring(xml)
    trkpts = racine.findall("gpx:trk/gpx:trkseg/gpx:trkpt", NS)
    assert len(trkpts) == 3
    for trkpt, point, point_profil in zip(trkpts, geometry, profil, strict=True):
        assert trkpt.get("lat") == f"{point.lat:.7f}"
        assert trkpt.get("lon") == f"{point.lon:.7f}"
        assert trkpt.find("gpx:ele", NS).text == f"{point_profil.elevation_m:.1f}"


def test_deduit_le_role_des_waypoints_par_position() -> None:
    points_entree = (
        Coordinate(lat=45.0, lon=5.0),
        Coordinate(lat=45.01, lon=5.01),
        Coordinate(lat=45.02, lon=5.02),
        Coordinate(lat=45.03, lon=5.03),
    )
    geometry = (points_entree[0], points_entree[-1])
    profil = (PointProfil(distance_m=0.0, elevation_m=100.0), PointProfil(distance_m=100.0, elevation_m=110.0))

    xml = construire_gpx("Sortie multi-étapes", points_entree, geometry, profil)

    racine = ET.fromstring(xml)
    wpts = racine.findall("gpx:wpt", NS)
    assert [wpt.find("gpx:name", NS).text for wpt in wpts] == [
        "Départ",
        "Point de passage 1",
        "Point de passage 2",
        "Arrivée",
    ]
    for wpt, point in zip(wpts, points_entree, strict=True):
        assert wpt.get("lat") == f"{point.lat:.7f}"
        assert wpt.get("lon") == f"{point.lon:.7f}"


def test_boucle_le_dernier_waypoint_est_arrivee_meme_sil_coincide_avec_le_depart() -> None:
    """Une boucle répète le départ en dernière position (spec-2-2) --
    "Arrivée" y désigne donc le même point que "Départ" (cf. docstring de
    `_libelle_role`)."""
    depart = Coordinate(lat=45.0, lon=5.0)
    passage = Coordinate(lat=45.01, lon=5.01)
    points_entree = (depart, passage, depart)
    geometry = (depart, passage, depart)
    profil = tuple(PointProfil(distance_m=float(i), elevation_m=100.0) for i in range(3))

    xml = construire_gpx(None, points_entree, geometry, profil)

    racine = ET.fromstring(xml)
    wpts = racine.findall("gpx:wpt", NS)
    assert [wpt.find("gpx:name", NS).text for wpt in wpts] == ["Départ", "Point de passage 1", "Arrivée"]
    assert wpts[0].get("lat") == wpts[-1].get("lat")
    assert wpts[0].get("lon") == wpts[-1].get("lon")


def test_nom_absent_utilise_un_titre_generique() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.01, lon=5.01)

    xml = construire_gpx(
        None,
        (depart, destination),
        (depart, destination),
        (PointProfil(distance_m=0.0, elevation_m=100.0), PointProfil(distance_m=100.0, elevation_m=110.0)),
    )

    racine = ET.fromstring(xml)
    assert racine.find("gpx:metadata/gpx:name", NS).text == "Parcours"
    assert racine.find("gpx:trk/gpx:name", NS).text == "Parcours"


def test_une_coordonnee_proche_de_zero_est_serialisee_en_notation_fixe() -> None:
    """`str(3e-05)` produit une notation scientifique ("3e-05"), invalide
    pour un lecteur GPX strict -- un cas réel, pas seulement théorique ici :
    le méridien de Greenwich (0° de longitude) traverse des communes
    françaises (ex. en Normandie)."""
    depart = Coordinate(lat=49.0, lon=0.00003)
    destination = Coordinate(lat=49.01, lon=0.01)

    xml = construire_gpx(
        "Sortie normande",
        (depart, destination),
        (depart, destination),
        (PointProfil(distance_m=0.0, elevation_m=0.00002), PointProfil(distance_m=100.0, elevation_m=5.0)),
    )

    assert "e-0" not in xml
    assert "E-0" not in xml
    racine = ET.fromstring(xml)
    wpt = racine.findall("gpx:wpt", NS)[0]
    assert wpt.get("lon") == "0.0000300"
    trkpt = racine.findall("gpx:trk/gpx:trkseg/gpx:trkpt", NS)[0]
    assert trkpt.find("gpx:ele", NS).text == "0.0"


def test_leve_une_erreur_si_profil_et_geometrie_ont_des_longueurs_differentes() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    destination = Coordinate(lat=45.01, lon=5.01)

    with pytest.raises(ValueError):
        construire_gpx(
            "Sortie",
            (depart, destination),
            (depart, destination),
            (PointProfil(distance_m=0.0, elevation_m=100.0),),
        )
