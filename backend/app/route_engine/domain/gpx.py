"""Génération GPX 1.1 pure (spec-2-7) : aucune infrastructure (AD-1) --
`construire_gpx` ne connaît ni la table `routes` ni la réponse HTTP, ces deux
traductions vivent dans l'adaptateur entrant (`routes_router.py`).

Via `xml.etree.ElementTree` (stdlib) plutôt qu'une dépendance externe
(`gpxpy`) : le format visé (wpt/trk/trkpt) est simple, et l'échappement XML --
seul vrai risque via le `nom` utilisateur -- est géré nativement (Boundaries
"Ask First" de la spec, cf. Design Notes)."""

from __future__ import annotations

from xml.etree.ElementTree import Element, SubElement, tostring

from .metrics import PointProfil
from .models import Coordinate

_GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1"
_GPX_CREATOR = "bikeroute"
_TITRE_PAR_DEFAUT = "Parcours"


def _coordonnee(valeur: float) -> str:
    """Notation à virgule fixe, jamais scientifique (`str(3e-05)` donne
    `"3e-05"`, invalide pour un lecteur GPX strict) -- un cas réel, pas
    seulement théorique pour cette appli : le méridien de Greenwich (0° de
    longitude) traverse des communes françaises (ex. en Normandie), un point
    posé à proximité produirait une valeur `str()`-formatée en notation
    scientifique. 7 décimales : précision centimétrique, cohérente avec le
    WGS84 déjà en jeu ailleurs dans le projet (AD-11)."""
    return f"{valeur:.7f}"


def _elevation(valeur: float) -> str:
    """Même précaution que `_coordonnee` (notation scientifique possible
    près de 0) -- une décimale, largement suffisante face à la précision des
    fournisseurs d'élévation existants (SRTM/skadi, AD-8)."""
    return f"{valeur:.1f}"


def _libelle_role(index: int, total: int) -> str:
    """Rôle déduit par position, jamais par un champ persisté -- `routes`
    ne conserve que les points bruts d'entrée, pas leurs rôles/la topologie
    (même convention que la reconstruction de topologie à la réouverture,
    Design Notes de la spec-2-6). Une boucle répète le départ en dernière
    position (spec-2-2) : "Arrivée" y désigne donc le même point que
    "Départ", ce qui reste correct -- fermer une boucle, c'est revenir à son
    point de départ."""
    if index == 0:
        return "Départ"
    if index == total - 1:
        return "Arrivée"
    return f"Point de passage {index}"


def construire_gpx(
    nom: str | None,
    points_entree: tuple[Coordinate, ...],
    geometry: tuple[Coordinate, ...],
    profil: tuple[PointProfil, ...],
) -> str:
    """GPX 1.1 (`wpt`/`trk`/`trkpt`) : le tracé complet en `trkpt` avec
    élévation, chaque point d'entrée en `wpt` (rôle déduit par position, cf.
    `_libelle_role`). `profil` doit porter exactement un point par point de
    `geometry`, dans le même ordre (même contrat que `calculer_metriques`,
    `domain/metrics.py`) -- aucun recalcul/resampling ici, aucune extension
    propriétaire requise pour exploiter le fichier ailleurs (NFR-7)."""
    if len(profil) != len(geometry):
        raise ValueError(f"`profil` ({len(profil)}) et `geometry` ({len(geometry)}) doivent avoir la même longueur.")

    titre = nom or _TITRE_PAR_DEFAUT

    # Attribut `xmlns` brut sur la racine plutôt qu'un `QName`/
    # `register_namespace` (qui préfixerait chaque balise `ns0:...`) : un
    # `xmlns` porté par la racine s'applique par héritage à tous les
    # descendants non préfixés -- une forme tout aussi valide et bien plus
    # lisible en sortie.
    racine = Element("gpx", {"version": "1.1", "creator": _GPX_CREATOR, "xmlns": _GPX_NAMESPACE})

    metadata = SubElement(racine, "metadata")
    SubElement(metadata, "name").text = titre

    total = len(points_entree)
    for index, point in enumerate(points_entree):
        wpt = SubElement(racine, "wpt", {"lat": _coordonnee(point.lat), "lon": _coordonnee(point.lon)})
        SubElement(wpt, "name").text = _libelle_role(index, total)

    trk = SubElement(racine, "trk")
    SubElement(trk, "name").text = titre
    trkseg = SubElement(trk, "trkseg")
    for point, point_profil in zip(geometry, profil, strict=True):
        trkpt = SubElement(trkseg, "trkpt", {"lat": _coordonnee(point.lat), "lon": _coordonnee(point.lon)})
        SubElement(trkpt, "ele").text = _elevation(point_profil.elevation_m)

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(racine, encoding="unicode")
