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
from app.route_engine.domain.models import Coordinate

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
