"""Calcul normatif des métriques d'un tracé (distance/D+/D-/durée/
difficulté), unique et versionné (NFR-9, spec-2-5).

Pur (AD-1) : ne connaît ni FastAPI, ni la persistance, ni Valhalla --
uniquement une géométrie déjà routée, les altitudes correspondantes (mêmes
longueur et ordre, cf. `ElevationProvider`) et une durée déjà fournie par le
fournisseur de routage. Appelé une seule fois, au moment du calcul du tracé
(`application/calculate_route.py`) -- jamais recalculé côté client ni à
l'affichage (cf. Boundaries de la spec) : deux affichages du même parcours
doivent toujours montrer la même valeur.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Literal

from .models import Coordinate

# Incrémenté à chaque changement de méthode de calcul (distance, seuils de
# difficulté, ...) -- persisté avec chaque tracé (`RouteMetrics.version`) pour
# qu'un parcours ancien reste traçable jusqu'à la méthode qui l'a produit,
# même si la méthode change ensuite (NFR-9).
METRICS_VERSION = "1"

# Rayon moyen de la Terre (mètres), pour la distance haversine ci-dessous --
# suffisant pour une distance de tracé cyclable (courte échelle), pas pour une
# géodésie de précision.
_RAYON_TERRE_M = 6_371_000.0

DIFFICULTE_FACILE = "facile"
DIFFICULTE_MODEREE = "modere"
DIFFICULTE_DIFFICILE = "difficile"
DIFFICULTE_TRES_DIFFICILE = "tres_difficile"

# Les 4 seules valeurs que `_difficulte_pour` peut produire -- portées au
# niveau du type (`Literal`, pas `str`) pour que le contrat de `RouteMetrics`
# (et, en aval, `MetriquesResponse`) garantisse qu'aucune 5e valeur ne peut
# sortir du backend.
Difficulte = Literal["facile", "modere", "difficile", "tres_difficile"]

# Paliers tranchés avec l'utilisateur (Design Notes de la spec) : D+ rapporté
# à la distance, en m/km. Bornes hautes exclusives (`< seuil`) : un ratio pile
# à 10/20/35 m/km appartient au palier supérieur, jamais à l'inférieur.
_SEUIL_MODERE_M_PAR_KM = 10.0
_SEUIL_DIFFICILE_M_PAR_KM = 20.0
_SEUIL_TRES_DIFFICILE_M_PAR_KM = 35.0


def _distance_haversine_m(a: Coordinate, b: Coordinate) -> float:
    lat1, lon1, lat2, lon2 = radians(a.lat), radians(a.lon), radians(b.lat), radians(b.lon)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * _RAYON_TERRE_M * asin(sqrt(min(1.0, h)))


def _difficulte_pour(denivele_positif_m: float, distance_m: float) -> Difficulte:
    # Distance nulle (dégénéré, ne devrait pas atteindre ce calcul --
    # `RouteResult.est_route` exige déjà >= 2 points -- mais pas de division
    # par zéro par précaution) : traité comme "Facile", jamais une erreur.
    if distance_m <= 0:
        return DIFFICULTE_FACILE
    m_par_km = denivele_positif_m / (distance_m / 1000.0)
    if m_par_km < _SEUIL_MODERE_M_PAR_KM:
        return DIFFICULTE_FACILE
    if m_par_km < _SEUIL_DIFFICILE_M_PAR_KM:
        return DIFFICULTE_MODEREE
    if m_par_km < _SEUIL_TRES_DIFFICILE_M_PAR_KM:
        return DIFFICULTE_DIFFICILE
    return DIFFICULTE_TRES_DIFFICILE


@dataclass(frozen=True, slots=True)
class RouteMetrics:
    """Métriques d'un tracé routé, sérialisées telles quelles en JSONB par
    `PostgisRouteRepository` (patron `points`, cf. Design Notes) -- aucune
    colonne dédiée en V1."""

    version: str
    distance_m: float
    denivele_positif_m: float
    denivele_negatif_m: float
    duree_s: float
    difficulte: Difficulte


def calculer_metriques(
    geometry: tuple[Coordinate, ...],
    elevations: tuple[float, ...],
    duree_s: float,
) -> RouteMetrics:
    """Unique méthode de calcul, versionnée (`METRICS_VERSION`) -- jamais
    dupliquée ni recalculée ailleurs (NFR-9). `elevations` doit porter
    exactement une altitude par point de `geometry`, dans le même ordre
    (contrat `ElevationProvider`, AD-8)."""
    if len(elevations) != len(geometry):
        raise ValueError(
            f"`elevations` ({len(elevations)}) et `geometry` ({len(geometry)}) doivent avoir la même longueur."
        )

    distance_m = sum(_distance_haversine_m(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1))

    denivele_positif_m = 0.0
    denivele_negatif_m = 0.0
    for i in range(len(elevations) - 1):
        delta = elevations[i + 1] - elevations[i]
        if delta > 0:
            denivele_positif_m += delta
        elif delta < 0:
            denivele_negatif_m += -delta

    return RouteMetrics(
        version=METRICS_VERSION,
        distance_m=distance_m,
        denivele_positif_m=denivele_positif_m,
        denivele_negatif_m=denivele_negatif_m,
        duree_s=duree_s,
        difficulte=_difficulte_pour(denivele_positif_m, distance_m),
    )
