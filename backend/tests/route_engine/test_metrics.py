"""Tests unitaires du domaine pur `route_engine/domain/metrics.py` : aucune
infrastructure (AD-1) -- unique méthode de calcul normative (NFR-9)."""

from __future__ import annotations

import pytest

from app.route_engine.domain.metrics import (
    DIFFICULTE_DIFFICILE,
    DIFFICULTE_FACILE,
    DIFFICULTE_MODEREE,
    DIFFICULTE_TRES_DIFFICILE,
    METRICS_VERSION,
    calculer_metriques,
)
from app.route_engine.domain.models import Coordinate, SegmentAttribut

# ~1000 m est-ouest à cette latitude (arrondi, sert de repère aux assertions
# de distance ci-dessous -- pas une valeur normative en soi).
_UN_KM_EST = Coordinate(lat=45.0, lon=5.012739)


def test_calcule_distance_dplus_dmoins_et_duree() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    milieu = Coordinate(lat=45.0, lon=5.01)
    arrivee = Coordinate(lat=45.0, lon=5.02)
    geometry = (depart, milieu, arrivee)
    elevations = (100.0, 150.0, 120.0)  # +50 m puis -30 m

    metriques = calculer_metriques(geometry, elevations, duree_s=600.0)

    assert metriques.version == METRICS_VERSION
    assert metriques.distance_m > 0
    assert metriques.denivele_positif_m == pytest.approx(50.0)
    assert metriques.denivele_negatif_m == pytest.approx(30.0)
    assert metriques.duree_s == 600.0


def test_distance_haversine_environ_un_kilometre() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    metriques = calculer_metriques((depart, _UN_KM_EST), (0.0, 0.0), duree_s=0.0)

    assert metriques.distance_m == pytest.approx(1000.0, rel=0.01)


def test_denivele_ignore_les_paliers_constants() -> None:
    """Une altitude qui ne varie pas entre deux points ne contribue ni au
    D+ ni au D- (`delta == 0`, ni positif ni négatif)."""
    points = (Coordinate(lat=45.0, lon=5.0), Coordinate(lat=45.0, lon=5.001), Coordinate(lat=45.0, lon=5.002))
    metriques = calculer_metriques(points, (100.0, 100.0, 100.0), duree_s=60.0)

    assert metriques.denivele_positif_m == 0.0
    assert metriques.denivele_negatif_m == 0.0


def test_leve_si_altitudes_et_geometrie_ont_des_longueurs_differentes() -> None:
    points = (Coordinate(lat=45.0, lon=5.0), Coordinate(lat=45.0, lon=5.001))

    with pytest.raises(ValueError):
        calculer_metriques(points, (100.0,), duree_s=60.0)


@pytest.mark.parametrize(
    "m_par_km, difficulte_attendue",
    [
        (0.0, DIFFICULTE_FACILE),
        (9.999, DIFFICULTE_FACILE),
        (10.0, DIFFICULTE_MODEREE),
        (19.999, DIFFICULTE_MODEREE),
        (20.0, DIFFICULTE_DIFFICILE),
        (34.999, DIFFICULTE_DIFFICILE),
        (35.0, DIFFICULTE_TRES_DIFFICILE),
        (100.0, DIFFICULTE_TRES_DIFFICILE),
    ],
)
def test_difficulte_selon_les_paliers_dplus_par_km(m_par_km: float, difficulte_attendue: str) -> None:
    """Paliers tranchés avec l'utilisateur (Design Notes de la spec) :
    Facile <10, Modéré 10-20, Difficile 20-35, Très difficile >=35 (m/km).
    Construit une géométrie de 1 km exact et un D+ choisi pour obtenir
    précisément le ratio testé, plutôt que de dépendre de l'arrondi
    haversine."""
    depart = Coordinate(lat=45.0, lon=5.0)
    # Distance nulle donnerait toujours "Facile" (garde anti-division par
    # zéro du domaine) -- on construit donc une géométrie à distance connue
    # (repère `_UN_KM_EST`, ~1 km), puis on choisit le D+ pour obtenir
    # exactement `m_par_km` sur cette distance mesurée.
    geometry = (depart, _UN_KM_EST)
    distance_m = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0).distance_m
    denivele_positif_m = m_par_km * (distance_m / 1000.0)

    metriques = calculer_metriques(geometry, (0.0, denivele_positif_m), duree_s=0.0)

    assert metriques.difficulte == difficulte_attendue


# ~800 m est-ouest à cette latitude (mêmes proportions que `_UN_KM_EST` ci-
# dessus, à l'échelle 0,8) -- repère pour les tests de montée significative.
_HUIT_CENTS_M_EST = Coordinate(lat=45.0, lon=5.0 + 0.012739 * 0.8)
# ~200 m est-ouest -- repère pour les montées courtes mais raides (sous le
# seuil de distance, mais au-dessus du seuil de dénivelé cumulé).
_DEUX_CENTS_M_EST = Coordinate(lat=45.0, lon=5.0 + 0.012739 * 0.2)


def test_revetements_et_categories_routieres_cle_inconnu_toujours_presente_meme_a_zero() -> None:
    """Aucun `surface_segments`/`road_class_segments` fourni (défaut `()`,
    ex. valeur par défaut de `RouteResult`) : la clé "inconnu" reste
    présente, à `0.0` -- jamais un dict vide (NFR-10)."""
    depart = Coordinate(lat=45.0, lon=5.0)
    milieu = Coordinate(lat=45.0, lon=5.01)

    metriques = calculer_metriques((depart, milieu), (0.0, 0.0), duree_s=0.0)

    assert metriques.revetements == {"inconnu": 0.0}
    assert metriques.categories_routieres == {"inconnu": 0.0}


def test_revetement_partiellement_inconnu_reste_explicite() -> None:
    """Matrice I/O de la spec : 6 % du tracé sans tag `surface` -> la clé
    "inconnu" affiche `0.06`, jamais repliée dans le revêtement connu."""
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _UN_KM_EST)
    distance_m = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0).distance_m
    inconnu_m = distance_m * 0.06
    surface_segments = (
        SegmentAttribut(distance_m=distance_m - inconnu_m, valeur="asphalte"),
        SegmentAttribut(distance_m=inconnu_m, valeur="inconnu"),
    )

    metriques = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0, surface_segments=surface_segments)

    assert metriques.revetements["inconnu"] == pytest.approx(0.06)
    assert metriques.revetements["asphalte"] == pytest.approx(0.94)


def test_categories_routieres_meme_methode_que_revetements() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _UN_KM_EST)
    distance_m = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0).distance_m
    road_class_segments = (SegmentAttribut(distance_m=distance_m, valeur="residential"),)

    metriques = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0, road_class_segments=road_class_segments)

    assert metriques.categories_routieres == {"inconnu": 0.0, "residential": pytest.approx(1.0)}


def test_profil_point_a_point_sur_les_memes_vertices_que_denivele() -> None:
    """Profil = mêmes points `(distance cumulée, élévation)` que D+/D- --
    jamais un ré-échantillonnage à intervalle fixe (Design Notes)."""
    depart = Coordinate(lat=45.0, lon=5.0)
    milieu = Coordinate(lat=45.0, lon=5.01)
    arrivee = Coordinate(lat=45.0, lon=5.02)
    geometry = (depart, milieu, arrivee)
    elevations = (100.0, 150.0, 120.0)

    metriques = calculer_metriques(geometry, elevations, duree_s=0.0)

    assert len(metriques.profil) == len(geometry)
    assert metriques.profil[0].distance_m == 0.0
    assert metriques.profil[0].elevation_m == 100.0
    assert metriques.profil[-1].elevation_m == 120.0
    assert metriques.profil[-1].distance_m == pytest.approx(metriques.distance_m)
    distances = [point.distance_m for point in metriques.profil]
    assert distances == sorted(distances)  # jamais de binning par paliers


def test_aucune_montee_significative_sur_un_parcours_plat() -> None:
    """Matrice I/O : parcours plat (<3 % partout) -> `montees_significatives`
    vide, aucune erreur."""
    depart = Coordinate(lat=45.0, lon=5.0)
    milieu = Coordinate(lat=45.0, lon=5.01)
    arrivee = Coordinate(lat=45.0, lon=5.02)

    metriques = calculer_metriques((depart, milieu, arrivee), (100.0, 100.0, 100.0), duree_s=0.0)

    assert metriques.montees_significatives == ()


def test_montee_significative_unique_par_distance_et_pente() -> None:
    """Matrice I/O : segment continu 800 m à pente moyenne 4 % -> une seule
    entrée (distance/dénivelé/pente)."""
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _HUIT_CENTS_M_EST)
    distance_m = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0).distance_m
    assert distance_m >= 500.0  # confirme le repère "≥500 m" du seuil testé
    denivele_m = distance_m * 0.04  # pente moyenne exactement 4 %, >= seuil de 3 %

    metriques = calculer_metriques(geometry, (100.0, 100.0 + denivele_m), duree_s=0.0)

    assert len(metriques.montees_significatives) == 1
    montee = metriques.montees_significatives[0]
    assert montee.distance_m == pytest.approx(distance_m)
    assert montee.denivele_m == pytest.approx(denivele_m)
    assert montee.pente_moyenne == pytest.approx(4.0)


def test_montee_courte_mais_denivele_cumule_suffisant_reste_significative() -> None:
    """Seuil alternatif (Design Notes) : sous 500 m mais >= 50 m de D+
    cumulé -- qualifie quand même, même sans atteindre 3 % sur 500 m."""
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _DEUX_CENTS_M_EST)
    distance_m = calculer_metriques(geometry, (0.0, 0.0), duree_s=0.0).distance_m
    assert distance_m < 500.0  # confirme le "cas court" testé ici

    metriques = calculer_metriques(geometry, (100.0, 155.0), duree_s=0.0)  # 55 m de D+

    assert len(metriques.montees_significatives) == 1
    assert metriques.montees_significatives[0].denivele_m == pytest.approx(55.0)


def test_montee_courte_et_peu_denivelee_nest_pas_significative() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _DEUX_CENTS_M_EST)

    metriques = calculer_metriques(geometry, (100.0, 105.0), duree_s=0.0)  # 5 m sur ~200 m : ni seuil

    assert metriques.montees_significatives == ()


def test_descente_nest_jamais_comptee_comme_montee() -> None:
    depart = Coordinate(lat=45.0, lon=5.0)
    geometry = (depart, _HUIT_CENTS_M_EST)

    metriques = calculer_metriques(geometry, (200.0, 100.0), duree_s=0.0)

    assert metriques.montees_significatives == ()
