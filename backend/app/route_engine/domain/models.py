"""Modèles purs du moteur de routage.

Aucune dépendance FastAPI/SQLAlchemy/client HTTP ici (AD-1) : ce module et
ses tests s'exécutent sans infrastructure.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Coordinate:
    """Point géographique WGS84 (degrés décimaux, SRID 4326 aux frontières
    de persistance -- AD-11). Validé dès la construction : aucun point hors
    bornes ne doit pouvoir circuler dans le domaine."""

    lat: float
    lon: float

    def __post_init__(self) -> None:
        if not (-90.0 <= self.lat <= 90.0):
            raise ValueError(f"Latitude hors bornes : {self.lat}")
        if not (-180.0 <= self.lon <= 180.0):
            raise ValueError(f"Longitude hors bornes : {self.lon}")


@dataclass(frozen=True, slots=True)
class RouteResult:
    """Résultat d'un appel à un `RoutingProvider` (AD-8).

    `geometry` est la polyligne routée, ordonnée du départ à la destination
    -- vide si le calcul n'a pas abouti. `unrouted_points` liste les points
    d'entrée qui n'ont pas pu être rattachés au réseau routier connu ; leur
    présence signifie qu'aucun segment (et surtout aucun segment direct
    trompeur) ne doit être affiché à leur place."""

    geometry: tuple[Coordinate, ...]
    unrouted_points: tuple[Coordinate, ...]
    provider: str
    version: str
    # Durée du trajet routé, en secondes (AD-11) -- `trip.summary.time` côté
    # Valhalla (spec-2-5). Défaut `0.0` : sans effet pour un résultat non
    # routé (`metrics=None`, jamais utilisé), et garde les tests/doubles
    # existants valides sans avoir à le renseigner explicitement.
    duration_s: float = 0.0

    @property
    def est_route(self) -> bool:
        """Vrai seulement si tous les points d'entrée ont pu être routés et
        qu'une géométrie exploitable a bien été produite. `>= 2` (pas
        seulement `> 0`) : une géométrie à un seul point (ex. départ et
        destination coïncidents) n'est pas une polyligne persistable en
        PostGIS (`LINESTRING` exige au moins deux points) -- un tel résultat
        est donc traité comme non routé, jamais comme un cas "routé"
        dégénéré."""
        return len(self.unrouted_points) == 0 and len(self.geometry) >= 2
