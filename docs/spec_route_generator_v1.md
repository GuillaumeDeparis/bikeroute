```markdown
# Spécification détaillée — Moteur de génération automatique de parcours vélo

**Identifiant :** SPEC-ROUTE-GENERATOR  
**Statut :** Draft  
**Version :** 0.2  
**Date :** 2026-08-17  
**Composant :** Route Generator Engine

# Objet

Cette spécification définit sans ambiguïté le comportement fonctionnel et technique du moteur chargé de générer automatiquement des parcours cyclistes en boucle.

Le moteur reçoit des contraintes exprimées par l'utilisateur ou par un composant applicatif, puis recherche plusieurs parcours répondant au mieux à ces contraintes.

Le moteur doit notamment prendre en compte :

- un point de départ ;
- une distance cible ;
- un dénivelé positif cible ;
- une direction préférentielle ;
- un type de sortie ;
- des contraintes de surface ;
- des contraintes liées au réseau routier ;
- des caractéristiques de montée ;
- l'historique géographique du cycliste ;
- une préférence de nouveauté ;
- la difficulté intrinsèque du parcours ;
- éventuellement la difficulté personnalisée pour le cycliste.

Le moteur retourne un ensemble limité de propositions :

- valides ;
- cyclables selon les informations disponibles ;
- proches des objectifs demandés ;
- géographiquement différentes ;
- explicables ;
- modifiables manuellement après génération.

Le moteur ne garantit pas qu'une combinaison arbitraire de contraintes puisse être satisfaite.

Lorsqu'aucune solution ne respecte toutes les contraintes non négociables, aucun parcours invalide ne doit être retourné.

Lorsqu'une solution respecte les contraintes non négociables mais ne satisfait pas totalement les préférences, le meilleur résultat disponible peut être retourné avec un statut `PARTIAL`.

# Périmètre

Le moteur couvre :

- la génération de boucles ;
- la sélection des points de passage ;
- l'évaluation des parcours ;
- le calcul du score ;
- l'analyse de la direction ;
- l'analyse du dénivelé ;
- l'analyse des montées ;
- la comparaison avec l'historique ;
- la diversification des résultats ;
- l'explication des résultats.

Le moteur ne couvre pas :

- la navigation GPS pendant la sortie ;
- l'enregistrement GPS temps réel ;
- l'estimation médicale ou physiologique ;
- le calcul d'une route élémentaire entre deux points à partir du graphe routier.

Cette dernière responsabilité appartient au `RoutingProvider`.

# Architecture générale

~~~text
Utilisateur / Coach
        │
        ▼
RouteGenerationRequest
        │
        ▼
Route Generator Engine
        │
        ├── ConstraintNormalizer
        ├── SearchAreaBuilder
        ├── TerrainSampler
        ├── CandidateStrategySelector
        ├── WaypointGenerator
        ├── RoutingOrchestrator
        ├── RouteAnalyzer
        ├── ElevationAnalyzer
        ├── ClimbDetector
        ├── SimilarityAnalyzer
        ├── ConstraintEvaluator
        ├── CandidateScorer
        ├── CandidateDeduplicator
        └── DiversitySelector
                 │
                 ▼
          RoutingProvider
                 │
        ┌────────┼─────────┐
        ▼        ▼         ▼
    Valhalla  BRouter  GraphHopper
~~~

# Terminologie normative

Les termes `DOIT`, `NE DOIT PAS`, `DEVRAIT`, `PEUT` sont utilisés comme suit.

## DOIT

Règle obligatoire.

Une implémentation qui ne respecte pas cette règle est non conforme à la spécification.

## NE DOIT PAS

Interdiction.

## DEVRAIT

Comportement recommandé.

Une implémentation peut s'en écarter, mais la justification doit être documentée.

## PEUT

Fonctionnement optionnel.

# Définitions générales

## Parcours

Géométrie routée complète reliant le point de départ à lui-même.

Un parcours contient au minimum :

- une géométrie ordonnée ;
- une distance ;
- un profil d'altitude ou une source permettant de le calculer ;
- une liste de segments routiers ou des métadonnées équivalentes lorsque disponibles.

## Candidat

Hypothèse de parcours en cours de génération.

Un candidat existe avant ou après son passage dans le moteur de routage.

Un candidat non routé contient principalement :

- le point de départ ;
- les anchors ;
- leur ordre.

Un candidat routé contient en plus :

- une géométrie ;
- des métriques ;
- des scores.

## Point de départ

Position géographique servant à la fois :

- de point initial ;
- de point final.

## Waypoint

Point géographique imposé au moteur de routage.

## Anchor

Waypoint créé automatiquement par le générateur afin d'influencer la forme générale d'une boucle.

Un anchor ne correspond pas nécessairement à un lieu visible par l'utilisateur.

## Segment

Partie élémentaire d'un parcours comprise entre deux positions de la géométrie ou entre deux edges routiers.

## Boucle

Parcours dont le point d'arrivée est équivalent au point de départ selon la tolérance définie dans cette spécification.

## Contrainte

Condition utilisée pour déterminer si un parcours est acceptable ou préférable.

Une contrainte possède obligatoirement un type :

- `HARD` ;
- `SOFT`.

# Contrainte dure

Une contrainte dure est une condition non négociable.

Si un candidat ne respecte pas une contrainte dure :

~~~text
le candidat DOIT être rejeté
~~~

Le score du candidat ne peut jamais compenser une violation d'une contrainte dure.

Un candidat rejeté pour une contrainte dure :

- ne peut pas être retourné à l'utilisateur ;
- ne peut pas apparaître comme résultat `PARTIAL` ;
- peut uniquement être conservé dans les diagnostics internes si nécessaire.

Exemple :

~~~text
surfacePolicy = PAVED_ONLY
~~~

et un segment est connu de manière fiable comme :

~~~text
surface = gravel
~~~

Alors :

~~~text
candidate.status = REJECTED
reason = HARD_CONSTRAINT_SURFACE
~~~

Même si :

~~~text
distance_score = 1.0
elevation_score = 1.0
direction_score = 1.0
~~~

le candidat reste rejeté.

# Contrainte souple

Une contrainte souple exprime une préférence ou un objectif pouvant être partiellement satisfait.

Une violation :

- NE DOIT PAS entraîner automatiquement le rejet ;
- DOIT dégrader un score ;
- PEUT générer un avertissement.

Exemple :

~~~text
distance cible = 50 km
tolérance = ±5 km
~~~

Un parcours de :

~~~text
56 km
~~~

peut être conservé si aucune limite dure n'est dépassée.

# Limite dure

Une limite dure est une valeur minimale ou maximale associée à une contrainte et déclarée non négociable.

Exemple :

~~~text
distance cible     = 50 km
tolérance souple   = ±5 km
minimum dur        = 40 km
maximum dur        = 65 km
~~~

Interprétation :

~~~text
45 à 55 km
→ plage optimale

40 à <45 km
ou
>55 à 65 km
→ acceptable mais pénalisé

<40 km
ou
>65 km
→ rejet obligatoire
~~~

La limite dure ne doit jamais être déduite silencieusement d'une tolérance utilisateur sauf si une politique produit explicitement versionnée le prévoit.

# Plage optimale

Intervalle dans lequel une contrainte est considérée comme correctement satisfaite.

Exemple :

~~~text
target = 50
tolerance = 5

optimalMin = 45
optimalMax = 55
~~~

# Écart

Différence entre une valeur demandée et une valeur obtenue.

~~~text
delta = actual - target
~~~

Exemple :

~~~text
target = 800 m
actual = 720 m

delta = -80 m
~~~

# Score

Valeur numérique comprise entre :

~~~text
0.0 et 1.0
~~~

avec :

~~~text
0.0 = très mauvais
1.0 = correspondance maximale
~~~

Un score ne constitue jamais une preuve de validité.

La validité est déterminée avant le scoring par les contraintes dures.

# Rejet

État d'un candidat ne pouvant pas être retourné.

~~~text
REJECTED
~~~

# Résultat partiel

Un résultat `PARTIAL` signifie :

- toutes les contraintes dures sont respectées ;
- une ou plusieurs contraintes souples ne sont pas satisfaites de manière optimale ;
- aucun meilleur ensemble de résultats n'a été trouvé dans le budget de recherche disponible.

`PARTIAL` ne signifie jamais qu'une contrainte dure a été ignorée.

# Distance commune

Longueur d'un parcours considérée géographiquement équivalente à une partie d'un autre parcours.

La méthode de calcul est définie dans la section de similarité.

# Nouveauté

Mesure indiquant dans quelle proportion un parcours évite des routes déjà générées, enregistrées ou parcourues.

# Recouvrement interne

Partie d'un même parcours empruntée plusieurs fois.

Exemple :

~~~text
A → B → C → B → D
~~~

Le segment autour de `B` peut contribuer au recouvrement interne.

# Recouvrement historique

Partie d'un candidat correspondant à une partie d'un parcours historique.

# Direction principale

Direction générale du parcours relativement au point de départ.

Elle est calculée à partir de la position géographique représentative du parcours, et non à partir du premier segment uniquement.

# Difficulté intrinsèque

Difficulté estimée uniquement à partir des caractéristiques du parcours.

Elle ne dépend pas du cycliste.

# Difficulté personnalisée

Difficulté estimée pour un cycliste particulier en fonction de son état actuel.

Elle ne modifie pas la difficulté intrinsèque.

# Contrat d'entrée

~~~typescript
interface RouteGenerationRequest {
  userId: string;

  start: GeoPoint;

  distance: DistanceConstraint;

  elevation?: ElevationConstraint;

  direction?: DirectionConstraint;

  rideType: RideType;

  roadPreferences: RoadPreferences;

  climbPreferences?: ClimbPreferences;

  novelty: NoveltyPreferences;

  loopPreferences: LoopPreferences;

  generationOptions?: GenerationOptions;

  cyclistStateId?: string;
}
~~~

# Coordonnées

~~~typescript
interface GeoPoint {
  lat: number;
  lon: number;
}
~~~

Validité :

~~~text
-90 <= lat <= 90
-180 <= lon <= 180
~~~

Toute autre valeur DOIT provoquer :

~~~text
INVALID_COORDINATES
~~~

# Snapping du point de départ

Le point de départ fourni par l'utilisateur peut ne pas correspondre exactement au réseau routable.

Le `RoutingProvider` ou un service dédié DOIT rechercher le point cyclable le plus proche.

Paramètre initial :

~~~text
START_SNAP_MAX_DISTANCE = 100 m
~~~

Si aucun point cyclable n'est trouvé dans cette distance :

~~~text
START_POINT_NOT_ROUTABLE
~~~

La génération DOIT échouer.

Cette valeur doit être configurable et versionnée.

# Distance

~~~typescript
interface DistanceConstraint {
  targetKm: number;

  toleranceKm: number;

  hardMinKm?: number;

  hardMaxKm?: number;
}
~~~

Règles :

~~~text
targetKm > 0
toleranceKm >= 0
~~~

Si présents :

~~~text
hardMinKm > 0
hardMaxKm > hardMinKm
hardMinKm <= targetKm
hardMaxKm >= targetKm
~~~

Sinon :

~~~text
INVALID_DISTANCE_CONSTRAINT
~~~

# Interprétation de la distance

Exemple :

~~~text
targetKm = 50
toleranceKm = 5
hardMinKm = 40
hardMaxKm = 65
~~~

Alors :

~~~text
45 <= distance <= 55
→ optimale

40 <= distance < 45
55 < distance <= 65
→ valide mais sous-optimale

distance < 40
distance > 65
→ candidat rejeté
~~~

# Dénivelé

~~~typescript
interface ElevationConstraint {
  targetGainM: number;

  toleranceM: number;

  hardMinM?: number;

  hardMaxM?: number;
}
~~~

Les mêmes règles que pour la distance s'appliquent.

Exemple :

~~~text
targetGainM = 800
toleranceM = 100
hardMinM = 500
hardMaxM = 1100
~~~

Interprétation :

~~~text
700 à 900 m
→ optimal

500 à <700
ou
>900 à 1100
→ valide avec pénalité

<500
ou
>1100
→ rejet
~~~

# Direction

~~~typescript
interface DirectionConstraint {
  mode:
    | "FREE"
    | "N"
    | "NE"
    | "E"
    | "SE"
    | "S"
    | "SW"
    | "W"
    | "NW"
    | "CUSTOM";

  azimuthDeg?: number;

  halfAngleDeg?: number;

  strength?: "LOW" | "MEDIUM" | "HIGH";
}
~~~

# Azimut

L'azimut est exprimé en degrés.

~~~text
0°   = Nord
90°  = Est
180° = Sud
270° = Ouest
~~~

Valeurs prédéfinies :

~~~text
N  = 0°
NE = 45°
E  = 90°
SE = 135°
S  = 180°
SW = 225°
W  = 270°
NW = 315°
~~~

# Direction CUSTOM

Si :

~~~text
mode = CUSTOM
~~~

alors :

~~~text
azimuthDeg DOIT être fourni
0 <= azimuthDeg < 360
~~~

Sinon :

~~~text
INVALID_DIRECTION
~~~

# Force directionnelle

Valeurs initiales :

~~~text
LOW
MEDIUM
HIGH
~~~

Elles déterminent la dispersion acceptée autour de l'azimut.

Valeurs initiales de référence :

~~~text
LOW    → sigma = 60°
MEDIUM → sigma = 40°
HIGH   → sigma = 25°
~~~

Ces valeurs sont des paramètres versionnés.

# Direction représentative du parcours

La direction d'un parcours NE DOIT PAS être calculée :

- uniquement à partir du premier segment ;
- uniquement à partir du waypoint le plus éloigné.

Elle DOIT être calculée à partir du centroïde pondéré par longueur du parcours, après exclusion éventuelle de la zone neutre autour du départ.

Processus :

~~~text
géométrie du parcours
        ↓
échantillonnage régulier
        ↓
centroïde des échantillons
        ↓
vecteur départ → centroïde
        ↓
azimut du vecteur
~~~

# Score directionnel

Soit :

~~~text
requested = azimut demandé
actual = azimut calculé
~~~

La différence angulaire DOIT utiliser la plus petite distance sur le cercle.

~~~text
delta =
min(
  abs(requested - actual),
  360 - abs(requested - actual)
)
~~~

Exemple :

~~~text
requested = 350°
actual = 10°

delta = 20°
~~~

et non :

~~~text
340°
~~~

Le score est :

~~~text
directionScore =
exp(
  -(delta² / (2 × sigma²))
)
~~~

# Direction et contrainte dure

Par défaut, la direction est une contrainte souple.

Une option explicite peut permettre de définir :

~~~text
maxDirectionDeviationDeg
~~~

comme limite dure.

Exemple :

~~~text
requested = NE = 45°
maxDirectionDeviationDeg = 70°
~~~

Si :

~~~text
delta > 70°
~~~

le candidat est rejeté.

Sans `maxDirectionDeviationDeg`, aucune route ne doit être rejetée uniquement pour une mauvaise orientation.

# Type de sortie

~~~typescript
type RideType =
  | "RECOVERY"
  | "ENDURANCE"
  | "HILLY_ENDURANCE"
  | "CLIMB_REPEATS"
  | "LONG_CLIMB"
  | "LONG_RIDE"
  | "FREE";
~~~

Définitions :

## RECOVERY

Sortie volontairement facile.

Le moteur doit :

- limiter le relief ;
- favoriser un réseau simple ;
- éviter les montées importantes lorsque possible.

## ENDURANCE

Sortie régulière sans contrainte forte de montée.

## HILLY_ENDURANCE

Sortie d'endurance avec relief significatif.

## CLIMB_REPEATS

Parcours comportant une ou plusieurs montées adaptées à des répétitions.

## LONG_CLIMB

Parcours devant comporter au moins une montée continue importante.

## LONG_RIDE

Priorité principale donnée à la durée ou à la distance.

## FREE

Aucune pondération particulière liée au type de séance.

# Surface

~~~typescript
type SurfacePolicy =
  | "PAVED_ONLY"
  | "PAVED_PREFERRED"
  | "MIXED_ALLOWED";
~~~

# PAVED_ONLY

Tout segment dont la surface est explicitement connue comme non goudronnée constitue une violation dure.

Exemples de surfaces rejetées :

~~~text
gravel
dirt
ground
sand
mud
unpaved
compacted
fine_gravel
~~~

La liste exacte DOIT être centralisée et versionnée.

# Surface inconnue

Une surface `unknown` NE DOIT PAS être automatiquement assimilée à une surface non goudronnée.

Politique initiale :

~~~text
PAVED_ONLY + surface inconnue
→ candidat autorisé
→ warning SURFACE_UNKNOWN
→ pénalité configurable
~~~

Une politique plus stricte pourra être ajoutée ultérieurement.

# PAVED_PREFERRED

Les segments non goudronnés sont autorisés mais pénalisés.

# MIXED_ALLOWED

Aucune pénalité automatique pour les surfaces non goudronnées sauf règles propres au profil.

# Grands axes

Un grand axe est défini à partir des catégories routières du référentiel OSM ou du RoutingProvider.

Liste initiale :

~~~text
motorway
motorway_link
trunk
trunk_link
~~~

Ces catégories sont interdites pour le vélo route lorsque non cyclables.

Pour :

~~~text
primary
primary_link
~~~

la politique par défaut est :

~~~text
autorisé si cyclable
mais pénalisé lorsque avoidMajorRoads = true
~~~

La définition exacte doit rester configurable.

# Préférences routières

~~~typescript
interface RoadPreferences {
  surfacePolicy: SurfacePolicy;

  avoidMajorRoads: boolean;

  preferSecondaryRoads: boolean;

  preferCycleInfrastructure: boolean;

  allowFerries: boolean;

  allowTunnels: boolean;

  customAvoidZones?: GeoPolygon[];
}
~~~

# Ferry

Si :

~~~text
allowFerries = false
~~~

tout segment identifié comme ferry constitue une violation dure.

# Tunnel

Si :

~~~text
allowTunnels = false
~~~

tout segment identifié comme tunnel constitue une violation dure.

# Zone d'évitement

Une `customAvoidZone` constitue une contrainte dure.

Toute géométrie intersectant cette zone au-delà de la tolérance géométrique doit être rejetée.

# Contraintes de montée

~~~typescript
interface ClimbPreferences {
  minSignificantClimbLengthKm?: number;

  minLongClimbLengthKm?: number;

  minLongClimbDurationMin?: number;

  preferredClimbCount?: {
    min?: number;
    max?: number;
  };

  maxGradientPct?: number;

  maxGradientConstraintType?: "HARD" | "SOFT";

  targetAverageGradientPct?: {
    min?: number;
    max?: number;
  };

  elevationDistribution?:
    | "FREE"
    | "DISTRIBUTED"
    | "ONE_MAIN_CLIMB"
    | "MULTIPLE_CLIMBS"
    | "ROLLING";
}
~~~

# Pente maximale

Si :

~~~text
maxGradientConstraintType = HARD
~~~

et :

~~~text
maxSmoothedGradientPct > maxGradientPct
~~~

le candidat est rejeté.

Si :

~~~text
maxGradientConstraintType = SOFT
~~~

le candidat est seulement pénalisé.

La pente brute instantanée NE DOIT PAS être utilisée pour cette règle.

La valeur utilisée est la pente maximale lissée telle que définie plus bas.

# Préférence de nouveauté

~~~typescript
interface NoveltyPreferences {
  mode:
    | "IGNORE"
    | "BALANCED"
    | "PREFER_NEW"
    | "STRONGLY_PREFER_NEW"
    | "REPEAT_ALLOWED";

  compareGeneratedRoutes: boolean;

  compareSavedRoutes: boolean;

  compareCompletedRoutes: boolean;

  recencyWeighting: boolean;

  historyWindowDays?: number;
}
~~~

# Signification des modes de nouveauté

## IGNORE

Le score de nouveauté n'influence pas le classement.

## BALANCED

La nouveauté influence faiblement le score.

## PREFER_NEW

La nouveauté possède un poids significatif.

## STRONGLY_PREFER_NEW

La nouveauté possède un poids élevé.

Le moteur peut accepter une légère dégradation de distance ou de D+ afin d'obtenir une route sensiblement plus nouvelle.

Il ne peut jamais violer une contrainte dure pour obtenir davantage de nouveauté.

## REPEAT_ALLOWED

La répétition historique n'est pas pénalisée.

Ce mode est adapté à la répétition volontaire d'un parcours.

# Préférences de boucle

~~~typescript
interface LoopPreferences {
  maxInternalOverlapRatio?: number;

  maxInternalOverlapConstraintType?: "HARD" | "SOFT";

  preferredShape?:
    | "ANY"
    | "ROUND"
    | "TRIANGULAR"
    | "ELONGATED";

  allowOutAndBackSections?: boolean;

  maxDistanceFromStartKm?: number;

  maxDistanceFromStartConstraintType?: "HARD" | "SOFT";
}
~~~

# Recouvrement interne maximal

Exemple :

~~~text
maxInternalOverlapRatio = 0.15
constraintType = HARD
~~~

Un parcours présentant :

~~~text
17 % de recouvrement interne
~~~

DOIT être rejeté.

Avec :

~~~text
constraintType = SOFT
~~~

il reste valide avec pénalité.

# Génération

Le moteur DOIT utiliser une stratégie multi-candidats.

Il NE DOIT PAS :

- générer une seule boucle puis la retourner sans comparaison ;
- sélectionner les résultats uniquement selon la distance.

# Étapes de génération

~~~text
normalisation
    ↓
construction de la zone de recherche
    ↓
analyse sommaire du relief
    ↓
création des candidats initiaux
    ↓
routage
    ↓
analyse
    ↓
évaluation des contraintes dures
    ↓
scoring
    ↓
mutation des meilleurs candidats
    ↓
réévaluation
    ↓
déduplication
    ↓
diversification
    ↓
résultats
~~~

# Normalisation

Le `ConstraintNormalizer` :

- valide toutes les valeurs ;
- complète les valeurs par défaut ;
- convertit les unités ;
- crée les plages optimales ;
- enregistre les limites dures ;
- sélectionne les poids de scoring.

Aucune autre partie du moteur ne doit redéfinir ces règles.

# Zone de recherche

La zone de recherche représente la région dans laquelle les anchors peuvent être générés.

Elle ne constitue pas une limite dure sur la géométrie finale sauf option explicite.

# Rayon de recherche initial

Le rayon nominal est calculé par :

~~~text
nominalRadiusKm =
distanceTargetKm × SEARCH_RADIUS_FACTOR
~~~

Valeur initiale :

~~~text
SEARCH_RADIUS_FACTOR = 0.35
~~~

Exemple :

~~~text
distance cible = 50 km

rayon nominal =
17.5 km
~~~

Ce rayon est une heuristique.

Il ne constitue pas une propriété métier.

# Direction et zone de recherche

Lorsque la direction est définie, la majorité des anchors initiaux doit être générée dans le secteur correspondant.

Exemple :

~~~text
direction = NE
azimut = 45°
~~~

Le moteur favorise les positions comprises autour de cet azimut.

Le retour vers le départ peut sortir du secteur.

# TerrainSampler

Le `TerrainSampler` produit un modèle approximatif du relief.

Il NE DOIT PAS être utilisé comme source officielle du D+.

Il sert uniquement à guider la génération.

# Échantillonnage terrain

La zone est divisée en cellules.

Chaque cellule peut contenir :

~~~typescript
interface TerrainCell {
  center: GeoPoint;

  meanElevationM: number;

  minElevationM: number;

  maxElevationM: number;

  localReliefM: number;
}
~~~

avec :

~~~text
localReliefM =
maxElevationM - minElevationM
~~~

# Stratégies de forme

Le moteur MVP doit prendre en charge au minimum :

- `TRIANGLE` ;
- `ELONGATED_LOOP` ;
- `ASYMMETRIC_LOOP`.

Le support du losange peut être ajouté ensuite.

# Triangle

Structure :

~~~text
START → A → B → START
~~~

Deux anchors.

# Boucle allongée

Structure :

~~~text
START → A → B → C → START
~~~

avec les anchors majoritairement distribués suivant l'axe demandé.

# Boucle asymétrique

Structure identique mais anchors volontairement non uniformes.

Elle est utilisée notamment pour :

- rechercher du relief ;
- inclure une montée ;
- éviter une zone ;
- améliorer la nouveauté.

# Nombre maximal d'anchors

MVP :

~~~text
2 <= anchorCount <= 4
~~~

Le moteur NE DOIT PAS dépasser quatre anchors automatiques dans le MVP.

# Seed

Toute génération possède un `seed`.

Si l'utilisateur n'en fournit pas :

~~~text
seed = UUID de génération
~~~

Le générateur pseudo-aléatoire DOIT être initialisé avec cette valeur.

À données externes identiques :

~~~text
même requête
+
même seed
+
même version moteur
+
même provider
+
même données cartographiques
~~~

DEVRAIENT produire les mêmes candidats.

# Routage

Le générateur appelle un `RoutingProvider`.

~~~typescript
interface RoutingProvider {
  route(
    request: ProviderRouteRequest
  ): Promise<ProviderRouteResult>;
}
~~~

# Requête de routage

~~~typescript
interface ProviderRouteRequest {
  points: GeoPoint[];

  profile: "ROAD_CYCLING";

  surfacePolicy: SurfacePolicy;

  avoidMajorRoads: boolean;

  preferSecondaryRoads: boolean;

  preferCycleInfrastructure: boolean;

  allowFerries: boolean;

  allowTunnels: boolean;

  avoidZones?: GeoPolygon[];
}
~~~

# Échec du provider

Un échec du provider sur un candidat ne provoque pas nécessairement l'échec de toute la génération.

Le candidat est marqué :

~~~text
ROUTING_FAILED
~~~

et écarté.

La génération échoue uniquement si aucun candidat valide ne peut être produit.

# Source officielle du D+

Le D+ officiel de l'application DOIT être calculé par l'`ElevationAnalyzer`.

La valeur éventuellement fournie directement par le RoutingProvider peut être conservée à titre de diagnostic mais NE DOIT PAS être utilisée comme valeur métier de référence.

# Profil d'élévation

Le profil est obtenu par :

- l'ElevationProvider ;
- ou un profil du RoutingProvider normalisé par l'application.

Format :

~~~typescript
interface ElevationSample {
  distanceFromStartM: number;
  elevationM: number;
}
~~~

# Rééchantillonnage

Avant analyse :

~~~text
ELEVATION_SAMPLE_INTERVAL = 25 m
~~~

Le profil DOIT être interpolé à intervalles réguliers de 25 mètres.

La valeur est configurable et versionnée.

# Lissage altimétrique

Pipeline MVP :

~~~text
profil brut
    ↓
rééchantillonnage 25 m
    ↓
filtre médian
    ↓
lissage
    ↓
deadband vertical
    ↓
calcul D+
~~~

# Filtre médian

Valeur initiale :

~~~text
MEDIAN_WINDOW_SIZE = 5 échantillons
~~~

Soit environ :

~~~text
125 m
~~~

à 25 m par échantillon.

# Lissage

Après filtre médian, une moyenne glissante peut être appliquée.

Valeur initiale :

~~~text
SMOOTHING_WINDOW_SIZE = 3
~~~

# Deadband vertical

Les variations verticales inférieures au seuil :

~~~text
ELEVATION_DEADBAND = 2 m
~~~

ne sont pas comptées individuellement comme variation significative.

Le deadband doit éviter l'accumulation du bruit.

# Calcul du D+

Après lissage :

~~~text
gain = 0

pour chaque variation significative positive :
    gain += variation
~~~

Les variations successives inférieures au deadband peuvent être accumulées avant décision afin de ne pas supprimer une montée progressive réelle.

L'algorithme exact DOIT être couvert par des tests de référence.

# Pente

La pente est définie par :

~~~text
gradientPct =
100 × elevationDelta / horizontalDistance
~~~

La pente instantanée entre deux échantillons adjacents NE DOIT PAS être exposée comme pente maximale.

# Fenêtres de pente

Le système calcule au minimum :

~~~text
gradient_100m
gradient_250m
gradient_500m
~~~

# Pente maximale

La métrique métier :

~~~text
maxSmoothedGradientPct
~~~

correspond par défaut à :

~~~text
max(gradient_100m)
~~~

Elle ne correspond pas à la pente entre deux points distants de 25 m.

# Détection des montées

Une montée est une section continue présentant :

- un gain d'altitude net ;
- une longueur minimale ;
- une pente moyenne minimale.

Seuils MVP :

~~~text
CLIMB_MIN_LENGTH = 500 m
CLIMB_MIN_GAIN = 30 m
CLIMB_MIN_AVG_GRADIENT = 2 %
~~~

Les trois conditions doivent être satisfaites.

# Petites descentes au sein d'une montée

Une montée peut contenir des descentes locales.

Une descente locale ne termine pas immédiatement une montée.

Valeur initiale :

~~~text
MAX_INTERNAL_DESCENT = 20 m cumulés
~~~

Au-delà, le détecteur peut clôturer la montée.

La règle exacte doit être stable et versionnée.

# Longueur de montée

~~~text
climbLength =
endDistance - startDistance
~~~

# Pente moyenne d'une montée

~~~text
averageGradientPct =
100 × netElevationGain / climbLength
~~~

# Similarité

La similarité entre routes doit être calculée indépendamment du fournisseur de routage.

Le mécanisme principal repose sur la géométrie PostGIS.

# Tolérance spatiale de similarité

Valeur initiale :

~~~text
ROUTE_SIMILARITY_BUFFER = 15 m
~~~

Deux portions de trace à moins de 15 mètres l'une de l'autre peuvent être considérées comme correspondant à la même voie.

# Sens de parcours

Pour le calcul de nouveauté :

~~~text
A → B
~~~

et :

~~~text
B → A
~~~

sont considérés comme la même route.

# Ratio de recouvrement

Pour un candidat `A` comparé à une route historique `B` :

~~~text
overlapRatio(A,B) =
commonLength(A,B)
/
length(A)
~~~

Le ratio est donc asymétrique.

# Recouvrement global historique

Le recouvrement avec l'historique NE DOIT PAS simplement additionner les recouvrements individuels, afin d'éviter de compter plusieurs fois le même segment.

Le système doit construire une union spatiale pondérée ou une représentation équivalente des zones déjà parcourues.

# Types d'historique

Poids initiaux :

~~~text
completed ride  = 1.00
saved route     = 0.60
generated route = 0.20
~~~

Ces poids sont configurables.

# Récence

Si :

~~~text
recencyWeighting = true
~~~

le poids temporel est :

~~~text
recencyWeight =
exp(-ageDays / tau)
~~~

Valeur initiale :

~~~text
tau = 60 jours
~~~

# Exemple de récence

Pour une sortie réalisée aujourd'hui :

~~~text
age = 0
weight = 1
~~~

Pour :

~~~text
age = 60
~~~

le poids vaut environ :

~~~text
0.368
~~~

# Fenêtre d'historique

Si :

~~~text
historyWindowDays = 365
~~~

les parcours plus anciens que 365 jours ne participent pas au calcul de nouveauté.

Ils restent néanmoins disponibles dans l'historique utilisateur.

# Zone neutre autour du départ

Valeur MVP :

~~~text
NOVELTY_IGNORE_RADIUS = 1.5 km
~~~

Les segments situés entièrement à moins de 1,5 km du point de départ :

- ne sont pas comptés dans la pénalité de nouveauté ;
- peuvent toujours être comptés dans le recouvrement interne.

Objectif :

ne pas pénaliser un utilisateur contraint d'emprunter les mêmes routes pour quitter son domicile.

# Score de nouveauté

~~~text
noveltyScore =
1 - weightedHistoricalOverlap
~~~

avec :

~~~text
0 <= weightedHistoricalOverlap <= 1
~~~

# Recouvrement interne

Le recouvrement interne est calculé sur la géométrie du candidat après exclusion des simples intersections ponctuelles.

Un segment doit avoir une longueur commune minimale pour être considéré comme recouvert.

Valeur initiale :

~~~text
MIN_OVERLAP_SEGMENT_LENGTH = 50 m
~~~

# Score de distance

Soit :

~~~text
error =
abs(actual - target)
~~~

Le score est :

~~~text
score =
exp(
  -(error² / (2 × tolerance²))
)
~~~

Si :

~~~text
tolerance = 0
~~~

alors la comparaison devient exacte selon une tolérance technique minimale définie.

Valeur :

~~~text
TECHNICAL_DISTANCE_EPSILON = 0.1 km
~~~

# Score D+

Même formule.

Si :

~~~text
toleranceM = 0
~~~

la tolérance technique est :

~~~text
TECHNICAL_ELEVATION_EPSILON = 10 m
~~~

# Score de boucle

Le `LoopScore` combine :

- faible recouvrement interne ;
- cohérence de la boucle ;
- absence d'aller-retour excessif.

Formule MVP :

~~~text
LoopScore =
1 - internalOverlapRatio
~~~

bornée :

~~~text
0 <= LoopScore <= 1
~~~

Des métriques supplémentaires pourront être ajoutées ultérieurement.

# RoadQualityScore

Le score routier est normalisé entre 0 et 1.

Il prend en compte uniquement des segments qui ont déjà passé les contraintes dures.

Pénalités possibles :

- grands axes cyclables mais évitables ;
- surface inconnue ;
- surface non idéale ;
- absence d'infrastructure cyclable lorsque cette préférence est active.

Le détail des coefficients doit être externalisé dans une configuration versionnée.

# ClimbScore

Le calcul dépend du `RideType`.

## LONG_CLIMB

Entrées :

- longueur de la plus longue montée ;
- D+ de la plus longue montée ;
- pente moyenne ;
- respect des préférences utilisateur.

La longueur minimale demandée doit être explicitement évaluée.

## HILLY_ENDURANCE

Entrées :

- D+ global ;
- nombre de montées significatives ;
- répartition du D+.

## CLIMB_REPEATS

Le moteur privilégie :

- plusieurs montées adaptées ;
- ou une montée répétable avec faible distance de transition.

Le détail algorithmique de ce mode pourra faire l'objet d'une sous-spécification dédiée.

# Score total

Après validation des contraintes dures :

~~~text
TotalScore =
    Wdistance  × DistanceScore
  + Welevation × ElevationScore
  + Wdirection × DirectionScore
  + Wroad      × RoadQualityScore
  + Wclimb     × ClimbScore
  + Wloop      × LoopScore
  + Wnovelty   × NoveltyScore
~~~

Condition :

~~~text
Wdistance
+ Welevation
+ Wdirection
+ Wroad
+ Wclimb
+ Wloop
+ Wnovelty
= 1
~~~

# Pondérations

Les pondérations ne doivent jamais être codées dans plusieurs composants.

Elles doivent être chargées depuis une configuration centralisée versionnée.

Exemple initial `HILLY_ENDURANCE` :

~~~text
distance    = 0.20
elevation   = 0.20
direction   = 0.10
road        = 0.15
climb       = 0.15
loop        = 0.10
novelty     = 0.10
~~~

# Contraintes non demandées

Si aucune cible de D+ n'est fournie :

~~~text
Welevation = 0
~~~

Les poids restants DOIVENT être renormalisés afin que leur somme reste égale à 1.

Même règle pour toute dimension optionnelle absente.

# Mutation

La mutation est une modification contrôlée d'un candidat existant.

Types MVP :

~~~text
ROTATE
EXPAND
SHRINK
MOVE_ANCHOR
MOVE_ANCHOR_HIGHER
MOVE_ANCHOR_LOWER
INSERT_ANCHOR
REMOVE_ANCHOR
CHANGE_SHAPE
REVERSE
~~~

# ROTATE

Rotation des anchors autour du point de départ.

Angles initiaux possibles :

~~~text
±10°
±20°
±30°
~~~

# EXPAND

Chaque anchor sélectionné est éloigné radialement du départ.

Facteurs initiaux :

~~~text
1.05
1.10
1.20
~~~

# SHRINK

Facteurs :

~~~text
0.95
0.90
0.80
~~~

# MOVE_ANCHOR_HIGHER

Le moteur recherche autour de l'anchor une cellule présentant davantage de potentiel de relief.

Rayon initial :

~~~text
ANCHOR_MUTATION_RADIUS = 3 km
~~~

# MOVE_ANCHOR_LOWER

Même principe vers un potentiel de relief inférieur.

# Mutation adaptative

Les mutations doivent prioritairement corriger le plus mauvais score significatif.

Exemple :

~~~text
distance = 0.96
elevation = 0.31
direction = 0.90
loop = 0.88
~~~

Le moteur doit favoriser :

~~~text
MOVE_ANCHOR_HIGHER
INSERT_ANCHOR
```

plutôt que :

```text
ROTATE
```

sauf si la zone choisie ne possède pas suffisamment de relief.

# Budget de génération

```typescript
interface GenerationOptions {
  resultCount?: number;

  maxRoutingCalls?: number;

  maxIterations?: number;

  maxEvaluatedCandidates?: number;

  timeoutMs?: number;

  seed?: string;
}
```

Valeurs MVP par défaut :

```text
resultCount = 3
maxRoutingCalls = 80
maxIterations = 4
maxEvaluatedCandidates = 60
timeoutMs = 15000
```

# Signification du timeout

Le timeout constitue un budget opérationnel.

Lorsque le timeout est atteint :

* aucun nouvel appel de routage ne doit être démarré ;
* les appels déjà terminés sont analysés ;
* les meilleurs candidats valides existants peuvent être retournés ;
* le statut devient `PARTIAL` si la recherche n'est pas considérée comme terminée.

# Arrêt anticipé

Le moteur peut arrêter la recherche si :

````text
nombre de résultats valides >= resultCount
```

et :

~~~text
score de chacun >= EXCELLENT_SCORE_THRESHOLD
```

et :

~~~text
diversité finale respectée
```

Valeur initiale :

~~~text
EXCELLENT_SCORE_THRESHOLD = 0.90
````

# Convergence

Le moteur peut arrêter les mutations si l'amélioration du meilleur score est inférieure à :

```text
MIN_SCORE_IMPROVEMENT = 0.01
```

pendant :

```text
2 itérations consécutives
```

# Déduplication

Deux candidats sont considérés comme doublons si :

````text
overlapRatio(A,B) >= 0.80
```

et :

~~~text
overlapRatio(B,A) >= 0.80
````

Valeur :

```text
RESULT_DUPLICATE_THRESHOLD = 0.80
```

Dans ce cas, seul le candidat ayant le meilleur `TotalScore` est conservé.

En cas d'égalité :

* conserver celui ayant le meilleur `RoadQualityScore` ;
* puis celui ayant le meilleur `NoveltyScore` ;
* puis le premier évalué.

# Diversification finale

Le moteur NE DOIT PAS simplement retourner les trois plus grands scores.

Processus :

```text
1. trier par TotalScore décroissant
2. sélectionner le meilleur
3. rechercher le meilleur candidat restant suffisamment différent
4. répéter jusqu'à resultCount
```

Seuil initial de recouvrement entre résultats :

```text
MAX_RESULT_PAIR_OVERLAP = 0.65
```

Si le nombre de résultats est insuffisant :

```text
0.65
→ 0.75
→ 0.85
```

Le seuil peut être relâché progressivement.

Il NE DOIT PAS dépasser :

```text
0.90
```

Au-delà, retourner moins de résultats est préférable.

# Nombre de résultats

Si :

```text
resultCount = 3
```

mais seulement deux résultats suffisamment valides et différents existent :

```text
candidates.length = 2
status = PARTIAL
```

Le moteur NE DOIT PAS inventer un troisième résultat de mauvaise qualité.

# Relaxation

La relaxation ne concerne que les contraintes souples.

Ordre par défaut :

```text
nouveauté
    ↓
direction
    ↓
préférences de montée
    ↓
D+ dans sa zone souple
    ↓
distance dans sa zone souple
```

Cet ordre doit être configurable.

# Ce qui ne peut jamais être relaxé

* hardMin ;
* hardMax ;
* route explicitement interdite ;
* accès vélo interdit ;
* surface interdite par une règle dure ;
* ferry interdit ;
* tunnel interdit ;
* zone d'évitement ;
* contrainte de pente déclarée `HARD` ;
* recouvrement déclaré `HARD`.

# États des candidats

```text
CREATED
ROUTING
ROUTING_FAILED
ROUTED
ANALYZED
REJECTED
VALID
SELECTED
DISCARDED_DUPLICATE
DISCARDED_LOW_SCORE
```

# États d'une génération

```text
PENDING
SAMPLING
GENERATING
ROUTING
ANALYZING
OPTIMIZING
SELECTING
COMPLETED
PARTIAL
FAILED
CANCELLED
```

# COMPLETED

Une génération est `COMPLETED` lorsque :

* au moins un candidat est retourné ;
* le moteur est allé au terme normal de sa recherche ou a satisfait les critères d'arrêt anticipé ;
* aucune erreur globale n'a interrompu le traitement.

Des candidats peuvent contenir des compromis souples sans empêcher le statut `COMPLETED`.

# PARTIAL

Une génération est `PARTIAL` lorsque :

* au moins un candidat valide existe ;
* mais le nombre demandé n'a pas été atteint ;
* ou le budget de calcul a interrompu la recherche ;
* ou certaines contraintes souples importantes restent insatisfaites.

# FAILED

Une génération est `FAILED` lorsque :

* aucun candidat valide n'existe ;
* ou une erreur globale empêche toute génération.

# Contrat de sortie

```typescript
interface RouteGenerationResult {
  generationId: string;

  status:
    | "COMPLETED"
    | "PARTIAL"
    | "FAILED";

  candidates: GeneratedRoute[];

  unmetPreferences: UnmetPreference[];

  diagnostics: GenerationDiagnostics;
}
```

# Route retournée

```typescript
interface GeneratedRoute {
  id: string;

  geometry: GeoLineString;

  distanceKm: number;

  elevationGainM: number;

  elevationLossM: number;

  estimatedDurationSec?: number;

  primaryDirectionDeg: number;

  climbs: RouteClimb[];

  intrinsicDifficulty: RouteDifficulty;

  personalDifficulty?: PersonalDifficulty;

  metrics: RouteCandidateMetrics;

  score: RouteCandidateScore;

  warnings: RouteWarning[];

  explanation: CandidateExplanation;
}
```

# Explication

```typescript
interface CandidateExplanation {
  strengths: string[];

  compromises: string[];
}
```

Exemple :

```text
Points forts :
- distance dans la plage cible ;
- D+ dans la plage cible ;
- direction Nord-Est respectée ;
- 72 % du parcours non emprunté récemment.

Compromis :
- montée principale de 4,7 km au lieu des 5 km souhaités.
```

# Difficulté intrinsèque

Valeurs :

```text
VERY_EASY
EASY
MODERATE
HARD
VERY_HARD
EXTREME
```

Elle est calculée indépendamment du cycliste.

Entrées minimales :

* distance ;
* D+ ;
* durée estimée ;
* longueur de la plus longue montée ;
* pente moyenne de la plus longue montée ;
* pente maximale lissée.

La formule fera l'objet d'une spécification dédiée avant implémentation définitive.

Le Route Generator doit uniquement consommer ce calcul.

# Difficulté personnalisée

Valeurs identiques :

```text
VERY_EASY
EASY
MODERATE
HARD
VERY_HARD
EXTREME
UNKNOWN
```

Avec :

```typescript
interface PersonalDifficulty {
  value: RouteDifficulty | "UNKNOWN";

  confidence:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
}
```

Le moteur NE DOIT PAS calculer lui-même l'état sportif du cycliste.

Il appelle :

```text
CyclistCapabilityService
```

# Absence de données sportives fiables

Si le service retourne une confiance insuffisante :

```text
personalDifficulty.value = UNKNOWN
```

ou une estimation :

```text
confidence = LOW
```

L'interface doit pouvoir l'afficher comme telle.

# Régularité

La régularité du cycliste est gérée par `CyclistCapabilityService`.

Le Route Generator reçoit uniquement un état déjà calculé.

Exemple :

```typescript
interface CyclistCurrentState {
  distanceCapacityKm?: number;

  elevationCapacityM?: number;

  durationCapacityMin?: number;

  climbCapacityMin?: number;

  regularity:
    | "VERY_REGULAR"
    | "REGULAR"
    | "OCCASIONAL"
    | "RETURNING"
    | "INACTIVE";

  daysSinceLastRide?: number;

  confidence:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
}
```

# Coach et Route Generator

Le coach ne doit pas transmettre de texte libre au moteur.

Contrat :

```typescript
interface TrainingRoutePrescription {
  distance: DistanceConstraint;

  elevation?: ElevationConstraint;

  direction?: DirectionConstraint;

  rideType: RideType;

  climbPreferences?: ClimbPreferences;

  novelty: NoveltyPreferences;

  maxPersonalDifficulty?: RouteDifficulty;
}
```

# maxPersonalDifficulty

Si le coach définit :

```text
maxPersonalDifficulty = MODERATE
```

et que la difficulté personnalisée fiable d'un candidat est :

```text
HARD
```

le comportement doit être explicitement défini.

Pour une prescription issue du coach :

````text
maxPersonalDifficulty
```

est une contrainte dure uniquement lorsque :

~~~text
personalDifficulty.confidence = HIGH
````

Avec confiance `MEDIUM` ou `LOW` :

* le candidat peut rester valide ;
* un avertissement doit être ajouté ;
* le coach peut choisir de le rejeter ensuite.

# API

```text
POST /api/route-generations
```

Exemple :

```json
{
  "start": {
    "lat": 44.0,
    "lon": 4.8
  },
  "distance": {
    "targetKm": 55,
    "toleranceKm": 5,
    "hardMinKm": 45,
    "hardMaxKm": 70
  },
  "elevation": {
    "targetGainM": 800,
    "toleranceM": 100,
    "hardMinM": 500,
    "hardMaxM": 1100
  },
  "direction": {
    "mode": "NE",
    "strength": "MEDIUM"
  },
  "rideType": "HILLY_ENDURANCE",
  "roadPreferences": {
    "surfacePolicy": "PAVED_ONLY",
    "avoidMajorRoads": true,
    "preferSecondaryRoads": true,
    "preferCycleInfrastructure": true,
    "allowFerries": false,
    "allowTunnels": true
  },
  "novelty": {
    "mode": "PREFER_NEW",
    "compareGeneratedRoutes": true,
    "compareSavedRoutes": true,
    "compareCompletedRoutes": true,
    "recencyWeighting": true,
    "historyWindowDays": 365
  },
  "loopPreferences": {
    "maxInternalOverlapRatio": 0.15,
    "maxInternalOverlapConstraintType": "SOFT"
  },
  "generationOptions": {
    "resultCount": 3
  }
}
```

# Exemple de réponse

```json
{
  "generationId": "gen_xxx",
  "status": "COMPLETED",
  "candidates": [
    {
      "id": "route_a",
      "distanceKm": 53.8,
      "elevationGainM": 824,
      "primaryDirectionDeg": 38,
      "intrinsicDifficulty": "HARD",
      "personalDifficulty": {
        "value": "MODERATE",
        "confidence": "HIGH"
      },
      "score": {
        "total": 0.93,
        "distance": 0.97,
        "elevation": 0.98,
        "direction": 0.94,
        "roadQuality": 0.91,
        "climb": 0.87,
        "loop": 0.96,
        "novelty": 0.82
      },
      "warnings": [],
      "explanation": {
        "strengths": [
          "Distance dans la plage cible.",
          "Dénivelé dans la plage cible.",
          "Bonne correspondance avec la direction Nord-Est."
        ],
        "compromises": []
      }
    }
  ],
  "unmetPreferences": []
}
```

# API asynchrone

La génération doit être compatible avec un traitement asynchrone.

Création :

```text
POST /api/route-generations
```

Réponse :

```text
202 Accepted
```

avec :

```json
{
  "generationId": "gen_xxx",
  "status": "PENDING"
}
```

Consultation :

```text
GET /api/route-generations/{generationId}
```

# Annulation

```text
POST /api/route-generations/{generationId}/cancel
```

Après annulation :

* aucun nouvel appel au RoutingProvider ne doit être lancé ;
* les résultats partiels ne sont pas retournés comme résultats définitifs sauf option explicite ;
* statut final `CANCELLED`.

# Persistance

Chaque génération doit conserver :

* requête normalisée ;
* seed ;
* provider ;
* version provider ;
* version du moteur ;
* version du scoring ;
* version du calcul D+ ;
* version des données cartographiques si disponible ;
* résultats sélectionnés ;
* raisons de rejet agrégées ;
* durée totale ;
* nombre d'appels de routage.

# Candidats intermédiaires

En production :

* leur persistance complète est optionnelle.

En mode diagnostic :

* ils peuvent être enregistrés.

# Versionnement

Les paramètres algorithmiques doivent appartenir à une version explicite.

Exemples :

```text
generationAlgorithmVersion = 1
scoringVersion = 1
elevationAlgorithmVersion = 1
similarityAlgorithmVersion = 1
climbDetectionVersion = 1
difficultyAlgorithmVersion = 1
```

# Configuration

Toutes les constantes présentes dans cette spécification doivent être regroupées dans une configuration centralisée.

Exemples :

```text
START_SNAP_MAX_DISTANCE
SEARCH_RADIUS_FACTOR
ELEVATION_SAMPLE_INTERVAL
MEDIAN_WINDOW_SIZE
SMOOTHING_WINDOW_SIZE
ELEVATION_DEADBAND
ROUTE_SIMILARITY_BUFFER
NOVELTY_IGNORE_RADIUS
RESULT_DUPLICATE_THRESHOLD
MAX_RESULT_PAIR_OVERLAP
EXCELLENT_SCORE_THRESHOLD
```

Elles NE DOIVENT PAS être dupliquées dans le code.

# Observabilité

Métriques minimales :

```text
route_generation_duration_seconds
routing_calls_count
routing_errors_count
candidate_generated_count
candidate_routed_count
candidate_rejected_count
candidate_valid_count
candidate_selected_count
iteration_count
cache_hit_ratio
best_candidate_score
completed_generation_count
partial_generation_count
failed_generation_count
```

# Diagnostics des rejets

Les motifs de rejet doivent être structurés.

Valeurs minimales :

```text
HARD_DISTANCE_MIN
HARD_DISTANCE_MAX
HARD_ELEVATION_MIN
HARD_ELEVATION_MAX
HARD_SURFACE
HARD_BICYCLE_ACCESS
HARD_FERRY
HARD_TUNNEL
HARD_AVOID_ZONE
HARD_GRADIENT
HARD_INTERNAL_OVERLAP
HARD_DIRECTION
ROUTING_FAILED
INVALID_GEOMETRY
```

# Avertissements

Valeurs minimales :

```text
SURFACE_UNKNOWN
TARGET_DISTANCE_NOT_MET
TARGET_ELEVATION_NOT_MET
DIRECTION_WEAK_MATCH
LOW_NOVELTY
HIGH_INTERNAL_OVERLAP
NO_REQUESTED_CLIMB_FOUND
PERSONAL_DIFFICULTY_LOW_CONFIDENCE
```

# Sécurité routière

Le moteur ne doit jamais présenter un parcours comme :

````text
sûr
```

sur la seule base des données OSM.

Formulations autorisées :

~~~text
grands axes évités
route cyclable selon les données disponibles
surface connue comme goudronnée
````

# Informations manquantes

Une donnée OSM absente doit être représentée comme :

```text
UNKNOWN
```

Elle ne doit pas être convertie arbitrairement en :

```text
false
safe
paved
allowed
```

# Cache

Le cache de routage peut utiliser :

* provider ;
* profil ;
* coordonnées quantifiées ;
* préférences routières.

La précision de quantification doit être suffisamment fine pour ne pas changer fonctionnellement les waypoints.

# Tests unitaires obligatoires

Le moteur doit disposer de tests sur :

* validation des limites dures ;
* calcul des plages optimales ;
* calcul de l'écart angulaire ;
* score directionnel ;
* score distance ;
* score D+ ;
* rejet des contraintes dures ;
* surface inconnue ;
* calcul du D+ ;
* détection des montées ;
* similarité ;
* recouvrement interne ;
* récence ;
* déduplication ;
* diversification ;
* relaxation ;
* timeout ;
* génération partielle.

# Test de limite dure

Exemple :

```text
target = 50
tolerance = 5
hardMin = 40
hardMax = 65
```

Cas :

```text
39.9 km → rejet
40 km   → valide
44 km   → valide pénalisé
45 km   → optimal
50 km   → optimal maximum
55 km   → optimal
56 km   → valide pénalisé
65 km   → valide
65.1 km → rejet
```

# Test de direction

```text
requested = 350°
actual = 10°

expected delta = 20°
```

# Test de contrainte dure

Un candidat ayant :

````text
score total théorique = 0.99
```

mais :

~~~text
surface connue = gravel
surfacePolicy = PAVED_ONLY
````

doit être rejeté.

# Test du statut PARTIAL

Si :

```text
resultCount = 3
```

et seulement deux candidats valides sont disponibles :

```text
status = PARTIAL
candidates.length = 2
```

# Test FAILED

Si tous les candidats violent une contrainte dure :

```text
status = FAILED
candidates.length = 0
```

# Benchmark

Le corpus de benchmark doit inclure au minimum :

```text
CASE-FLAT-050
CASE-HILLY-050
CASE-HILLY-070
CASE-LONG-CLIMB
CASE-DIRECTION-N
CASE-DIRECTION-NE
CASE-DIRECTION-S
CASE-NOVELTY
CASE-PAVED-ONLY
CASE-IMPOSSIBLE-ELEVATION
CASE-HARD-DISTANCE
CASE-HIGH-OVERLAP
```

# Critères d'acceptation MVP

Une génération standard doit permettre une requête de type :

```text
Départ :
domicile

Distance :
55 km ±5 km
limites dures :
45–70 km

D+ :
800 m ±100 m
limites dures :
500–1100 m

Direction :
Nord-Est

Type :
endurance vallonnée

Surface :
goudronnée

Grands axes :
éviter

Nouveauté :
privilégier

Résultats :
3
```

Le système est fonctionnellement conforme si :

* aucune route retournée ne viole une contrainte dure ;
* au moins un parcours valide est retourné lorsque la zone le permet ;
* le D+ est calculé avec une méthode unique ;
* la direction est calculée selon la méthode définie ;
* les parcours quasi identiques sont dédupliqués ;
* la nouveauté utilise la géométrie réelle ;
* les résultats sont diversifiés ;
* chaque compromis est explicable ;
* une contrainte impossible produit un résultat `PARTIAL` ou `FAILED` selon la nature de la contrainte.

# Ordre d'implémentation recommandé

## Socle métier

Implémenter :

* contrats ;
* validation ;
* définition HARD / SOFT ;
* limites dures ;
* score distance ;
* score direction ;
* RoutingProvider ;
* génération triangulaire ;
* sélection multi-candidats.

## Relief

Implémenter :

* ElevationProvider ;
* profil normalisé ;
* calcul D+ ;
* TerrainSampler ;
* score D+ ;
* mutations liées au relief.

## Qualité des boucles

Implémenter :

* recouvrement interne ;
* déduplication ;
* diversification.

## Historique

Implémenter :

* stockage PostGIS ;
* comparaison spatiale ;
* nouveauté ;
* récence ;
* zone neutre autour du départ.

## Montées

Implémenter :

* détection ;
* métriques ;
* préférences ;
* score par type de séance.

## Personnalisation

Implémenter :

* connexion au CyclistCapabilityService ;
* difficulté personnalisée ;
* contraintes issues du coach.

# Structure logicielle cible

```text
route-generator/
│
├── domain/
│   ├── constraints/
│   ├── generation/
│   ├── candidate/
│   ├── route/
│   ├── metrics/
│   ├── scoring/
│   └── errors/
│
├── application/
│   ├── generate-route/
│   ├── evaluate-candidate/
│   ├── mutate-candidate/
│   └── select-results/
│
├── generation/
│   ├── search-area/
│   ├── terrain/
│   ├── strategies/
│   ├── waypoints/
│   └── mutations/
│
├── analysis/
│   ├── distance/
│   ├── elevation/
│   ├── climbs/
│   ├── direction/
│   ├── overlap/
│   └── similarity/
│
├── providers/
│   ├── routing/
│   ├── elevation/
│   └── cyclist-capability/
│
└── infrastructure/
    ├── valhalla/
    ├── brouter/
    ├── graphhopper/
    └── postgis/
```

# Règle architecturale

Le domaine du Route Generator NE DOIT PAS importer :

* un SDK Valhalla ;
* un SDK GraphHopper ;
* du code BRouter ;
* du code PostGIS spécifique ;
* un composant d'interface utilisateur.

Toutes ces dépendances doivent être fournies via des interfaces.

# Synthèse normative

Le moteur suit impérativement cette règle :

```text
Contraintes dures
        ↓
Validation binaire
        ↓
REJET ou VALIDATION
        ↓
Contraintes souples
        ↓
Scoring
        ↓
Optimisation
        ↓
Déduplication
        ↓
Diversification
        ↓
Résultat
```

Une contrainte dure répond à :

> Cette route peut-elle être retournée ?

Une contrainte souple répond à :

> Parmi les routes qui peuvent être retournées, laquelle correspond le mieux à la demande ?

Un score ne peut donc jamais rendre valide un parcours qui ne l'est pas.

Cette distinction constitue une règle fondamentale du moteur et doit être conservée dans toute évolution future.

```
