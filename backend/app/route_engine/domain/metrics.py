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

from .models import Coordinate, SegmentAttribut

# Incrémenté à chaque changement de méthode de calcul (distance, seuils de
# difficulté, ...) -- persisté avec chaque tracé (`RouteMetrics.version`) pour
# qu'un parcours ancien reste traçable jusqu'à la méthode qui l'a produit,
# même si la méthode change ensuite (NFR-9). "3" : ajout d'un seuil de bruit
# altimétrique de 3 m et normalisation de la couverture d'attributs après la
# revue de la spec-2-5.
METRICS_VERSION = "3"

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

# Seuils de montée significative, tranchés avec l'utilisateur avant la spec
# initiale (Design Notes) : un segment continu de dénivelé positif est
# significatif s'il fait au moins 500 m à une pente moyenne d'au moins 3 %,
# OU s'il cumule au moins 50 m de D+ (une montée courte mais très raide, sous
# 500 m, reste significative si elle gagne assez d'altitude).
_MONTEE_DISTANCE_MIN_M = 500.0
_MONTEE_PENTE_MIN_PCT = 3.0
_MONTEE_DENIVELE_MIN_M = 50.0
_BRUIT_ALTIMETRIQUE_M = 3.0


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


def _proportions_par_segment(segments: tuple[SegmentAttribut, ...], distance_totale_m: float) -> dict[str, float]:
    """Proportion (0..1) de la distance totale du tracé pour chaque valeur
    d'attribut (revêtement ou catégorie routière) -- clé "inconnu" toujours
    présente, même à `0.0` (NFR-10) : jamais repliée silencieusement dans une
    autre valeur. `ValhallaRoutingProvider` mappe déjà tout attribut absent
    côté Valhalla vers `"inconnu"` (`SegmentAttribut.valeur`) ; cette fonction
    se contente d'agréger par valeur, sans connaître Valhalla."""
    totaux: dict[str, float] = {"inconnu": 0.0}
    for segment in segments:
        totaux[segment.valeur] = totaux.get(segment.valeur, 0.0) + segment.distance_m
    if distance_totale_m <= 0:
        return dict.fromkeys(totaux, 0.0)
    distance_attribuee_m = sum(totaux.values())
    if distance_attribuee_m < distance_totale_m:
        totaux["inconnu"] += distance_totale_m - distance_attribuee_m
        denominateur_m = distance_totale_m
    else:
        # Les longueurs d'arêtes Valhalla et la distance haversine utilisent
        # deux mesures distinctes. En cas de léger dépassement, normaliser par
        # la couverture d'attributs évite des proportions > 100 %.
        denominateur_m = distance_attribuee_m
    return {valeur: distance / denominateur_m for valeur, distance in totaux.items()}


@dataclass(frozen=True, slots=True)
class PointProfil:
    """Un point du profil altimétrique : distance cumulée depuis le départ
    et élévation, au même vertex de géométrie routée que le point voisin
    (spec-2-5, Design Notes) -- jamais un ré-échantillonnage à intervalle
    fixe ni un binning par paliers."""

    distance_m: float
    elevation_m: float


@dataclass(frozen=True, slots=True)
class MonteeSignificative:
    """Un segment continu de montée jugé significatif (Design Notes de la
    spec) : `pente_moyenne` en pourcentage (ex. `4.2` pour 4,2 %)."""

    distance_m: float
    denivele_m: float
    pente_moyenne: float


def _construire_profil(geometry: tuple[Coordinate, ...], elevations: tuple[float, ...]) -> tuple[PointProfil, ...]:
    """Les mêmes points `(distance cumulée, élévation)` que ceux utilisés
    pour D+/D- ci-dessus -- mêmes vertices de géométrie routée, aucun
    ré-échantillonnage (Design Notes de la spec)."""
    if not elevations:
        return ()
    profil = [PointProfil(distance_m=0.0, elevation_m=elevations[0])]
    cumul_m = 0.0
    for i in range(len(geometry) - 1):
        cumul_m += _distance_haversine_m(geometry[i], geometry[i + 1])
        profil.append(PointProfil(distance_m=cumul_m, elevation_m=elevations[i + 1]))
    return tuple(profil)


def _evaluer_segment_montee(
    profil: tuple[PointProfil, ...], debut: int, fin: int, montees: list[MonteeSignificative]
) -> None:
    """Évalue le segment continu `[debut, fin]` (indices dans `profil`,
    inclusifs) contre les seuils de montée significative -- ajoute une entrée
    à `montees` si le segment qualifie, ne fait rien sinon (segment trop
    court/dégénéré ou pas assez pentu)."""
    if fin <= debut:
        return
    distance_m = profil[fin].distance_m - profil[debut].distance_m
    denivele_m = profil[fin].elevation_m - profil[debut].elevation_m
    if distance_m <= 0 or denivele_m <= 0:
        return
    pente_moyenne = (denivele_m / distance_m) * 100.0
    est_significative = (
        distance_m >= _MONTEE_DISTANCE_MIN_M and pente_moyenne >= _MONTEE_PENTE_MIN_PCT
    ) or denivele_m >= _MONTEE_DENIVELE_MIN_M
    if est_significative:
        montees.append(MonteeSignificative(distance_m=distance_m, denivele_m=denivele_m, pente_moyenne=pente_moyenne))


def _detecter_montees_significatives(profil: tuple[PointProfil, ...]) -> tuple[MonteeSignificative, ...]:
    """Détecte les montées significatives depuis le profil déjà calculé pour
    D+/D- ci-dessus (mêmes points, spec-2-5) : un segment continu de dénivelé
    positif (aucun delta négatif entre deux points consécutifs) est un
    candidat, évalué contre les seuils par `_evaluer_segment_montee`. Un plat
    (`delta == 0`) clôt aussi le segment courant -- seule une suite
    strictement croissante compte comme "continue"."""
    montees: list[MonteeSignificative] = []
    debut = 0
    for i in range(1, len(profil)):
        # Plats et petits creux SRTM restent dans la même montée ; une baisse
        # supérieure au seuil clôt réellement le segment continu.
        if profil[i].elevation_m - profil[i - 1].elevation_m >= -_BRUIT_ALTIMETRIQUE_M:
            continue
        _evaluer_segment_montee(profil, debut, i - 1, montees)
        debut = i
    _evaluer_segment_montee(profil, debut, len(profil) - 1, montees)
    return tuple(montees)


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
    revetements: dict[str, float]
    categories_routieres: dict[str, float]
    profil: tuple[PointProfil, ...]
    montees_significatives: tuple[MonteeSignificative, ...]


def calculer_metriques(
    geometry: tuple[Coordinate, ...],
    elevations: tuple[float, ...],
    duree_s: float,
    surface_segments: tuple[SegmentAttribut, ...] = (),
    road_class_segments: tuple[SegmentAttribut, ...] = (),
) -> RouteMetrics:
    """Unique méthode de calcul, versionnée (`METRICS_VERSION`) -- jamais
    dupliquée ni recalculée ailleurs (NFR-9). `elevations` doit porter
    exactement une altitude par point de `geometry`, dans le même ordre
    (contrat `ElevationProvider`, AD-8). `surface_segments`/
    `road_class_segments` viennent de `RouteResult` (`/trace_attributes`,
    NFR-10) -- défaut `()` : 100 % de la distance est alors `inconnu`."""
    if len(elevations) != len(geometry):
        raise ValueError(
            f"`elevations` ({len(elevations)}) et `geometry` ({len(geometry)}) doivent avoir la même longueur."
        )

    distance_m = sum(_distance_haversine_m(geometry[i], geometry[i + 1]) for i in range(len(geometry) - 1))

    denivele_positif_m = 0.0
    denivele_negatif_m = 0.0
    for i in range(len(elevations) - 1):
        delta = elevations[i + 1] - elevations[i]
        if delta >= _BRUIT_ALTIMETRIQUE_M:
            denivele_positif_m += delta
        elif delta <= -_BRUIT_ALTIMETRIQUE_M:
            denivele_negatif_m += -delta

    profil = _construire_profil(geometry, elevations)

    return RouteMetrics(
        version=METRICS_VERSION,
        distance_m=distance_m,
        denivele_positif_m=denivele_positif_m,
        denivele_negatif_m=denivele_negatif_m,
        duree_s=duree_s,
        difficulte=_difficulte_pour(denivele_positif_m, distance_m),
        revetements=_proportions_par_segment(surface_segments, distance_m),
        categories_routieres=_proportions_par_segment(road_class_segments, distance_m),
        profil=profil,
        montees_significatives=_detecter_montees_significatives(profil),
    )
