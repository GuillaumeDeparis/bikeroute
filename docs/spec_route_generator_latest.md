# Spécification détaillée — Route Generation Engine

**Identifiant :** SPEC-ROUTE-GENERATION-ENGINE  
**Statut :** Draft  
**Version :** 0.5  
**Date :** 2026-08-19  
**Composant :** Route Generation Engine

# Objet

Cette spécification définit le comportement fonctionnel et technique du moteur de génération, de routage, d’évaluation et de classement des parcours cyclistes.

Le moteur doit permettre de traiter plusieurs topologies de parcours :

- parcours d’un point A à un point B ;
- boucle avec retour au point de départ ;
- parcours comportant plusieurs étapes explicitement définies par l’utilisateur.

Le moteur doit également permettre deux modes principaux de construction :

- parcours construit manuellement par l’utilisateur ;
- parcours généré automatiquement à partir de contraintes.

La boucle constitue donc un cas d’usage important, mais elle ne constitue pas le modèle général du moteur.

Le moteur doit être capable de produire plusieurs propositions et de les comparer sans présenter automatiquement la meilleure proposition trouvée comme une excellente proposition.

Chaque proposition doit être caractérisée indépendamment par :

- sa validité ;
- son score global ;
- son rang ;
- son niveau de conformité à la demande ;
- les écarts réels par rapport aux contraintes ;
- la qualité et la complétude des données utilisées ;
- ses éventuels compromis.

# Périmètre

Le moteur couvre :

- la génération de parcours ;
- le routage entre points ;
- la création de points techniques intermédiaires ;
- l’optimisation de parcours ;
- le respect des contraintes utilisateur ;
- la prise en compte de la distance ;
- la prise en compte du D+ ;
- la prise en compte d’une direction lorsqu’elle est pertinente ;
- la prise en compte du type de sortie ;
- la prise en compte du revêtement ;
- la prise en compte de la qualité du réseau routier ;
- la prise en compte des caractéristiques des montées ;
- l’analyse de la géométrie du parcours ;
- la prise en compte de l’historique géographique ;
- la recherche de diversité ;
- le calcul d’un score global ;
- le calcul d’un niveau de conformité ;
- le classement des résultats ;
- la production d’explications structurées.

Le moteur ne couvre pas :

- la navigation temps réel ;
- l’enregistrement GPS pendant une sortie ;
- l’import automatique des activités ;
- la recommandation sportive ;
- le coaching ;
- le choix automatique de points d’intérêt à visiter dans la V1 ;
- l’analyse médicale ou physiologique.

# Principes normatifs

Les mots suivants ont une signification précise.

## DOIT

La règle est obligatoire.

Une implémentation ne respectant pas une règle `DOIT` est non conforme à cette spécification.

## NE DOIT PAS

La règle constitue une interdiction.

## DEVRAIT

Le comportement est recommandé.

Une implémentation peut s’en écarter si le choix est documenté.

## PEUT

Le comportement est optionnel.

# Concepts fondamentaux

## Parcours

Un parcours est une géométrie cyclable ordonnée reliant un point de départ à une destination.

Selon sa topologie, la destination peut être :

- différente du départ ;
- identique au départ ;
- située après plusieurs étapes intermédiaires.

## Topologie

La topologie décrit la structure logique du parcours.

Valeurs :

~~~typescript
type RouteTopology =
  | "POINT_TO_POINT"
  | "LOOP"
  | "MULTI_STOP";
~~~

## POINT_TO_POINT

Parcours ayant :

- un point de départ ;
- une destination différente du départ.

Exemple :

~~~text
A → B
~~~

Un `POINT_TO_POINT` peut également contenir des waypoints techniques.

~~~text
A → anchor1 → anchor2 → B
~~~

Ces anchors ne transforment pas le parcours en `MULTI_STOP`.

## LOOP

Parcours revenant au point de départ.

Exemple :

~~~text
A → anchor1 → anchor2 → A
~~~

Le dernier point doit être équivalent au point de départ selon la tolérance définie par le système.

## MULTI_STOP

Parcours comportant une ou plusieurs étapes explicitement significatives pour l’utilisateur.

Exemple :

~~~text
A → B → C → D
~~~

Les étapes peuvent avoir :

- un ordre imposé ;
- un ordre optimisable.

Un parcours `MULTI_STOP` peut revenir à son point de départ :

~~~text
A → B → C → A
~~~

ou terminer ailleurs :

~~~text
A → B → C → D
~~~

La présence de plusieurs points techniques créés par le moteur NE DOIT PAS suffire à qualifier un parcours de `MULTI_STOP`.

# Étape utilisateur

Une étape utilisateur est un lieu explicitement fourni par l’utilisateur et ayant une signification fonctionnelle.

Exemples :

- village ;
- col ;
- lieu de rendez-vous ;
- point de ravitaillement ;
- adresse ;
- destination intermédiaire.

Modèle :

~~~typescript
interface UserStop {
  id: string;
  location: GeoPoint;
  name?: string;

  orderMode:
    | "FIXED"
    | "OPTIMIZABLE";

  fixedOrder?: number;
}
~~~

# Anchor technique

Un `GenerationAnchor` est un point intermédiaire créé automatiquement par le moteur afin d’influencer la forme d’un parcours.

Il n’est pas affiché comme une étape fonctionnelle à l’utilisateur, sauf dans un mode de diagnostic ou d’édition avancée.

~~~typescript
interface GenerationAnchor {
  location: GeoPoint;

  purpose:
    | "SHAPE"
    | "DISTANCE"
    | "ELEVATION"
    | "DIRECTION"
    | "ROAD_QUALITY"
    | "NOVELTY";
}
~~~

# Choix automatique d’étapes

Dans la V1 :

- le moteur NE DOIT PAS choisir automatiquement des étapes fonctionnelles ou des points d’intérêt ;
- les étapes `MULTI_STOP` sont toujours fournies par l’utilisateur.

Le moteur PEUT néanmoins générer des anchors techniques.

Une évolution future pourra introduire :

~~~text
GENERATED_STOPS
~~~

pour permettre au moteur de sélectionner des points d’intérêt en fonction d’une intention explicite.

Exemples futurs :

- trouver une fontaine ;
- passer par un col ;
- prévoir une pause ;
- passer par un point de vue.

Ce comportement est hors périmètre V1.

# Modes de construction

~~~typescript
type RouteGenerationMode =
  | "MANUAL"
  | "AUTOMATIC";
~~~

# MANUAL

L’utilisateur fournit les points structurants du parcours.

Le moteur :

- effectue le routage ;
- analyse le parcours ;
- calcule les métriques ;
- évalue la conformité ;
- retourne le parcours.

Il NE DOIT PAS modifier automatiquement les étapes fournies par l’utilisateur.

# AUTOMATIC

Le moteur reçoit des contraintes et génère un ensemble de candidats.

Selon la topologie, le moteur peut créer :

- des anchors techniques ;
- une destination, si elle n’est pas explicitement définie et que le cas d’usage l’autorise.

# Contrat général d’entrée

~~~typescript
interface RouteGenerationRequest {
  userId: string;

  topology: RouteTopology;

  mode: RouteGenerationMode;

  start: GeoPoint;

  end?: GeoPoint;

  stops?: UserStop[];

  distance?: DistanceConstraint;

  elevation?: ElevationConstraint;

  direction?: DirectionConstraint;

  rideType?: RideType;

  roadPreferences: RoadPreferences;

  climbPreferences?: ClimbPreferences;

  novelty?: NoveltyPreferences;

  geometryPreferences?: RouteGeometryPreferences;

  pointToPointPreferences?: PointToPointPreferences;

  multiStopPreferences?: MultiStopPreferences;

  difficultyPreference?: DifficultyPreference;

  generationOptions?: GenerationOptions;
}
~~~

# Validation de la topologie

## POINT_TO_POINT

Cas standard :

~~~text
start obligatoire
end obligatoire
~~~

Exception autorisée en génération automatique :

~~~text
start obligatoire
end absent
distance obligatoire
direction obligatoire
~~~

Dans ce cas, le moteur doit générer une destination candidate.

## LOOP

~~~text
start obligatoire
~~~

`end` peut être absent.

Le moteur utilise alors :

~~~text
end = start
~~~

Si `end` est fourni, il doit être géographiquement équivalent au départ.

## MULTI_STOP

~~~text
start obligatoire
stops contenant au moins une étape
~~~

`end` peut :

- être fourni ;
- être égal au départ ;
- être déduit de la dernière étape selon le contrat applicatif.

# Coordonnées

~~~typescript
interface GeoPoint {
  lat: number;
  lon: number;
}
~~~

Conditions :

~~~text
-90 <= lat <= 90
-180 <= lon <= 180
~~~

Toute valeur non conforme provoque :

~~~text
INVALID_COORDINATES
~~~

# Snapping

Le moteur doit rattacher les points fournis au réseau routable vélo.

Valeur par défaut :

~~~text
START_SNAP_MAX_DISTANCE = 100 m
STOP_SNAP_MAX_DISTANCE = 100 m
END_SNAP_MAX_DISTANCE = 100 m
~~~

Si aucun point routable n’est trouvé :

~~~text
START_POINT_NOT_ROUTABLE
STOP_POINT_NOT_ROUTABLE
END_POINT_NOT_ROUTABLE
~~~

selon le point concerné.

# Contrainte

Une contrainte est une règle appliquée à un candidat.

Une contrainte possède un type :

~~~typescript
type ConstraintType =
  | "HARD"
  | "SOFT";
~~~

# Contrainte dure

Une contrainte `HARD` est non négociable.

Lorsqu’un candidat viole une contrainte dure :

~~~text
le candidat DOIT être rejeté
~~~

Un score élevé ne peut jamais compenser cette violation.

Exemple :

~~~text
surfacePolicy = PAVED_ONLY
~~~

et :

~~~text
un segment est explicitement connu comme gravel
~~~

Alors :

~~~text
candidate = REJECTED
reason = HARD_SURFACE
~~~

# Contrainte souple

Une contrainte `SOFT` exprime une préférence.

Une violation :

- ne rejette pas automatiquement le candidat ;
- réduit le score de la dimension concernée ;
- peut diminuer le niveau de conformité ;
- doit pouvoir être présentée comme compromis.

# Limite dure

Une limite dure est une borne explicitement déclarée au-delà de laquelle une valeur devient invalide.

Exemple :

~~~text
distance cible : 50 km
tolérance : ±5 km

hardMin : 40 km
hardMax : 65 km
~~~

Interprétation :

~~~text
45–55 km
→ plage optimale

40–<45 km
ou
>55–65 km
→ valide mais sous-optimal

<40 km
ou
>65 km
→ rejet
~~~

Une limite dure NE DOIT PAS être inventée silencieusement à partir de la tolérance utilisateur.

Des valeurs par défaut peuvent exister uniquement si elles proviennent d’une politique applicative explicitement versionnée.

# Distance

~~~typescript
interface DistanceConstraint {
  targetKm: number;
  toleranceKm: number;

  hardMinKm?: number;
  hardMaxKm?: number;
}
~~~

Validation :

~~~text
targetKm > 0
toleranceKm >= 0
~~~

Si présentes :

~~~text
hardMinKm > 0
hardMaxKm > hardMinKm
hardMinKm <= targetKm
hardMaxKm >= targetKm
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

Les mêmes règles de validation que pour la distance s’appliquent.

# Direction

La direction n’a pas la même signification selon la topologie.

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

  strength?: "LOW" | "MEDIUM" | "HIGH";

  maxDeviationDeg?: number;
}
~~~

# Azimuts

~~~text
N  =   0°
NE =  45°
E  =  90°
SE = 135°
S  = 180°
SW = 225°
W  = 270°
NW = 315°
~~~

# Direction pour LOOP

Pour une boucle, la direction indique le secteur dans lequel le parcours doit principalement se développer.

Elle ne signifie pas que chaque segment du parcours doit suivre cet azimut.

La direction réelle du parcours est calculée à partir du centroïde pondéré de sa géométrie.

~~~text
start
  ↓
géométrie
  ↓
échantillonnage spatial
  ↓
centroïde pondéré
  ↓
vecteur start → centroïde
  ↓
azimut réel
~~~

# Direction pour POINT_TO_POINT avec destination connue

Si `end` est fourni, la direction cardinale NE DOIT PAS être utilisée par défaut comme critère de scoring.

L’orientation générale est naturellement déterminée par :

~~~text
start → end
~~~

Dans ce cas :

~~~text
directionWeight = 0
~~~

sauf contrainte avancée explicitement fournie.

# Direction pour POINT_TO_POINT avec destination générée

Si :

~~~text
end absent
mode = AUTOMATIC
~~~

la direction sert à sélectionner la zone dans laquelle rechercher la destination.

Exemple :

~~~text
start = domicile
distance = 50 km
direction = NE
~~~

Le moteur doit rechercher une destination routable vers le Nord-Est permettant d’obtenir un parcours proche de 50 km.

# Direction pour MULTI_STOP

Lorsque les étapes sont imposées, la direction ne constitue normalement pas une contrainte pertinente.

~~~text
directionWeight = 0
~~~

Elle peut uniquement être utilisée dans des fonctionnalités avancées de génération automatique hors V1.

# Différence angulaire

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

# Score directionnel

~~~text
directionScore =
exp(
  -(delta² / (2 × sigma²))
)
~~~

Valeurs initiales :

~~~text
LOW    → sigma = 60°
MEDIUM → sigma = 40°
HIGH   → sigma = 25°
~~~

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

Le type de sortie agit sur les pondérations de scoring.

Il ne modifie pas directement la validité d’un parcours sauf si des contraintes spécifiques lui sont associées.

# Préférences routières

~~~typescript
interface RoadPreferences {
  surfacePolicy:
    | "PAVED_ONLY"
    | "PAVED_PREFERRED"
    | "MIXED_ALLOWED";

  avoidMajorRoads: boolean;

  preferSecondaryRoads: boolean;

  preferCycleInfrastructure: boolean;

  allowFerries: boolean;

  allowTunnels: boolean;

  customAvoidZones?: GeoPolygon[];
}
~~~

# Surface PAVED_ONLY

Une surface explicitement connue comme non goudronnée constitue une violation dure.

Liste initiale à centraliser :

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

La liste doit être versionnée.

# Surface inconnue

Une surface inconnue NE DOIT PAS être supposée goudronnée.

Elle NE DOIT PAS non plus être automatiquement considérée comme non goudronnée.

Comportement V1 :

~~~text
surface = UNKNOWN
+
PAVED_ONLY
→ candidat autorisé
→ warning SURFACE_UNKNOWN
→ diminution de la confiance des données
→ aucune pénalité directe du score global
~~~

# Accès vélo inconnu

Un accès vélo non renseigné ou ambigu NE DOIT PAS être supposé interdit.

Comportement V1 :

~~~text
bicycle access = UNKNOWN
→ candidat autorisé
→ warning ACCESS_UNKNOWN
→ diminution de la confiance des données
→ aucune pénalité directe du score global
~~~

# Ferry

Si :

~~~text
allowFerries = false
~~~

un segment ferry constitue une violation dure.

# Tunnel

Si :

~~~text
allowTunnels = false
~~~

un segment tunnel constitue une violation dure.

# Zone à éviter

Toute `customAvoidZone` constitue une contrainte dure.

Un parcours intersectant une zone interdite doit être rejeté.

# Grands axes

Catégories initiales considérées comme grands axes :

~~~text
motorway
motorway_link
trunk
trunk_link
primary
primary_link
~~~

`motorway` et assimilés restent soumis aux restrictions vélo du référentiel.

`primary` peut être cyclable mais doit être pénalisée lorsque :

~~~text
avoidMajorRoads = true
~~~

# Classification normative OpenStreetMap

OpenStreetMap est le référentiel géographique canonique de la V1. La classification suivante est versionnée avec l’algorithme et appliquée à chaque segment avant le scoring.

Priorité normative, de la plus forte à la plus faible :

1. une interdiction vélo explicite classe le segment `FORBIDDEN` ;
2. une autorisation vélo explicite peut rendre admissible une classe routière, sans annuler une autre interdiction dure ;
3. le revêtement décide ensuite de la compatibilité vélo de route ;
4. la classe routière décide enfin entre `ALLOWED` et `LAST_RESORT` ;
5. l’absence d’information d’accès vélo classe le segment `UNKNOWN_ACCESS`, admissible avec avertissement et fiabilité réduite (traitement symétrique à `UNKNOWN_SURFACE`).

| Dimension OSM | Tags ou valeurs | État V1 | Effet normatif |
|---|---|---|---|
| Accès vélo interdit | `bicycle=no`, `bicycle=use_sidepath`, `access=no`, `access=private` sans autorisation vélo explicite | `FORBIDDEN` | Rejet du candidat |
| Accès vélo autorisé | `bicycle=yes`, `bicycle=designated`, `bicycle=permissive`, ou accès général autorisé sans restriction vélo | `ALLOWED_ACCESS` | Poursuivre la classification |
| Accès vélo absent ou ambigu | aucune valeur exploitable, valeur non reconnue ou conflit non résolu | `UNKNOWN_ACCESS` | Candidat admissible, avertissement `ACCESS_UNKNOWN` et fiabilité réduite, sans baisse directe du score |
| Revêtement incompatible route | `gravel`, `dirt`, `ground`, `sand`, `mud`, `unpaved`, `compacted`, `fine_gravel` | `FORBIDDEN` avec `PAVED_ONLY` | Rejet du candidat |
| Revêtement compatible route | `asphalt`, `paved`, `concrete`, `concrete:plates` | `ALLOWED` | Aucun rejet lié au revêtement |
| Revêtement absent ou non reconnu | aucune valeur exploitable ou valeur non reconnue | `UNKNOWN_SURFACE` | Candidat admissible, avertissement et fiabilité réduite, sans baisse directe du score |
| Axe incompatible ou réservé | `highway=motorway`, `motorway_link`, ou toute classe non cyclable selon l’accès effectif | `FORBIDDEN` | Rejet du candidat |
| Grand axe cyclable | `highway=trunk`, `trunk_link`, `primary`, `primary_link` avec accès vélo autorisé | `LAST_RESORT` | Admissible seulement si nécessaire, forte pénalité et avertissement |
| Réseau routier ordinaire cyclable | autre `highway=*` routable avec accès vélo autorisé | `ALLOWED` | Candidat admissible |

Une valeur OSM inconnue NE DOIT PAS être transformée silencieusement en état favorable. Les listes exactes de valeurs, règles de conflit et versions de tags doivent être centralisées et couvertes par des tests de table.

# Préférences de montée

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

  maxGradientConstraintType?: ConstraintType;

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

# Difficulté

Deux notions doivent être séparées.

## Difficulté intrinsèque

Caractéristique objective du parcours.

Valeurs :

~~~text
VERY_EASY
EASY
MODERATE
HARD
VERY_HARD
EXTREME
~~~

## Difficulté personnalisée

Estimation de la difficulté du parcours pour l’utilisateur courant.

Valeurs :

~~~text
VERY_EASY
EASY
MODERATE
HARD
VERY_HARD
EXTREME
UNKNOWN
~~~

Elle doit être calculée par un composant métier spécialisé et non directement par l’algorithme géographique.

# Préférence de difficulté

~~~typescript
interface DifficultyPreference {
  target?: RouteDifficulty;

  max?: RouteDifficulty;

  maxConstraintType?: ConstraintType;

  usePersonalDifficulty?: boolean;
}
~~~

Si :

~~~text
usePersonalDifficulty = true
~~~

la difficulté personnalisée est utilisée uniquement si son niveau de confiance est suffisant.

# Nouveauté et diversité

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

# Différence entre nouveauté et diversité

## Nouveauté

Compare un nouveau candidat avec l’historique de l’utilisateur.

## Diversité

Compare les propositions produites au cours de la génération courante.

Un parcours peut donc être :

- nouveau par rapport à l’historique ;
- mais presque identique à une autre proposition actuelle.

Les deux métriques doivent rester distinctes.

# Historique

Catégories :

~~~text
COMPLETED_RIDE
SAVED_ROUTE
GENERATED_ROUTE
~~~

Poids initiaux :

~~~text
COMPLETED_RIDE  = 1.00
SAVED_ROUTE     = 0.60
GENERATED_ROUTE = 0.20
~~~

# Pondération temporelle

~~~text
recencyWeight =
exp(-ageDays / tau)
~~~

Valeur initiale :

~~~text
tau = 60 jours
~~~

# Zone neutre autour du départ

Valeur initiale :

~~~text
NOVELTY_IGNORE_RADIUS_START = 1.5 km
~~~

Les segments compris dans cette zone ne doivent pas pénaliser la nouveauté.

Pour un `POINT_TO_POINT`, une zone similaire autour de la destination pourra être prise en compte :

~~~text
NOVELTY_IGNORE_RADIUS_END
~~~

# Similarité géographique

La comparaison doit être indépendante du fournisseur de routage.

Le moteur utilise la géométrie spatiale, notamment via PostGIS.

Tolérance initiale :

~~~text
ROUTE_SIMILARITY_BUFFER = 15 m
~~~

Le sens de parcours n’est pas pris en compte pour la nouveauté.

~~~text
A → B
~~~

et :

~~~text
B → A
~~~

sont considérés comme la même portion de route.

# Recouvrement

Pour A comparé à B :

~~~text
overlapRatio(A,B) =
commonLength(A,B)
/
length(A)
~~~

Le ratio est asymétrique.

# Qualité géométrique

La notion précédente de `LoopQuality` est remplacée par :

~~~text
RouteGeometryQuality
~~~

afin de s’appliquer à toutes les topologies.

Elle prend notamment en compte :

- recouvrement interne ;
- aller-retour inutile ;
- détours artificiels ;
- répétitions de segments ;
- cohérence de la géométrie.

# Recouvrement interne

~~~typescript
interface RouteGeometryPreferences {
  maxInternalOverlapRatio?: number;

  maxInternalOverlapConstraintType?: ConstraintType;

  allowOutAndBackSections?: boolean;

  maxDistanceFromStartKm?: number;

  maxDistanceFromStartConstraintType?: ConstraintType;
}
~~~

# Multi-étapes

~~~typescript
interface MultiStopPreferences {
  stopOrder:
    | "FIXED"
    | "OPTIMIZABLE";
}
~~~

# Ordre FIXED

Les étapes doivent être desservies exactement dans l’ordre fourni.

Exemple :

~~~text
start
B
C
D
end
~~~

Produit :

~~~text
A → B → C → D → E
~~~

Le moteur NE DOIT PAS modifier cet ordre.

# Ordre OPTIMIZABLE

Le moteur peut réordonner uniquement les étapes déclarées optimisables.

Exemple :

~~~text
A
B
C
D
E
~~~

peut devenir :

~~~text
A → C → B → D → E
~~~

si cela améliore le parcours.

Le point de départ et la destination finale restent fixes.

# Étapes partiellement figées

Une évolution pourra permettre de mélanger :

- étapes fixes ;
- groupes d’étapes optimisables.

Ce comportement n’est pas requis en V1.

# Génération automatique des étapes

V1 :

~~~text
interdite
~~~

Le moteur ne doit pas décider de lui-même qu’un village ou un POI doit devenir une étape utilisateur.

# Point-to-point

~~~typescript
interface PointToPointPreferences {
  maxDetourRatio?: number;

  maxDetourConstraintType?: ConstraintType;
}
~~~

# Distance de référence A → B

Le moteur calcule un trajet de référence utilisant le même profil de routage mais sans contraintes souples supplémentaires de découverte ou de détour.

~~~text
referenceDistance
~~~

# Ratio de détour

~~~text
detourRatio =
candidateDistance
/
referenceDistance
~~~

Exemple :

~~~text
reference = 40 km
candidate = 46 km

ratio = 1.15
~~~

soit :

~~~text
15 % de détour
~~~

# Moteur de génération

Architecture :

~~~text
RouteGenerationRequest
        │
        ▼
ConstraintNormalizer
        │
        ▼
TopologyStrategy
        │
        ▼
CandidateGenerator
        │
        ▼
RoutingProvider
        │
        ▼
RouteAnalyzer
        │
        ▼
HardConstraintEvaluator
        │
        ├── violation → REJECTED
        │
        ▼
RouteScorer
        │
        ▼
ComplianceEvaluator
        │
        ▼
CandidateOptimizer
        │
        ▼
CandidateDeduplicator
        │
        ▼
DiversitySelector
        │
        ▼
Ranking
        │
        ▼
RouteGenerationResult
~~~

# Stratégies topologiques

~~~typescript
interface TopologyStrategy {
  generateInitialCandidates(
    request: NormalizedRouteGenerationRequest
  ): Candidate[];
}
~~~

Implémentations V1 :

~~~text
LoopGenerationStrategy
PointToPointGenerationStrategy
GeneratedDestinationStrategy
MultiStopRoutingStrategy
~~~

# LoopGenerationStrategy

Responsable de :

- génération d’anchors ;
- orientation ;
- distance ;
- D+ ;
- forme de boucle ;
- diversité ;
- retour au départ.

# PointToPointGenerationStrategy

Utilisée lorsque A et B sont connus.

Responsable de :

- variantes de chemin ;
- éventuels via points techniques ;
- détour ;
- D+ ;
- qualité routière ;
- diversité.

# GeneratedDestinationStrategy

Utilisée lorsque :

~~~text
POINT_TO_POINT
+
destination inconnue
~~~

Responsable de :

- création de destinations candidates ;
- respect de la direction ;
- respect de la distance ;
- routage jusqu’à la destination.

# MultiStopRoutingStrategy

Responsable de :

- respect des étapes utilisateur ;
- optimisation éventuelle de leur ordre ;
- calcul du parcours global ;
- analyse globale des contraintes.

Elle NE DOIT PAS générer de nouvelles étapes fonctionnelles.

# Stratégies initiales de boucle

V1 :

~~~text
TRIANGLE
ELONGATED_LOOP
ASYMMETRIC_LOOP
~~~

# Triangle

~~~text
START → A → B → START
~~~

# Boucle allongée

~~~text
START → A → B → C → START
~~~

avec une répartition fortement orientée selon la direction choisie.

# Boucle asymétrique

Les anchors sont volontairement répartis de manière non uniforme afin de :

- chercher du relief ;
- éviter des zones ;
- améliorer la nouveauté ;
- respecter la distance.

# Nombre d’anchors

V1 :

~~~text
2 <= automaticAnchorCount <= 4
~~~

# Search Area

Le moteur construit une zone dans laquelle rechercher les anchors ou destinations candidates.

Rayon initial :

~~~text
nominalRadiusKm =
distanceTargetKm × SEARCH_RADIUS_FACTOR
~~~

Valeur initiale :

~~~text
SEARCH_RADIUS_FACTOR = 0.35
~~~

Cette valeur est une heuristique configurable.

Elle ne constitue pas une contrainte métier.

# TerrainSampler

Le `TerrainSampler` permet d’identifier les zones présentant plus ou moins de relief.

Il ne constitue pas la source officielle du D+.

~~~typescript
interface TerrainCell {
  center: GeoPoint;

  meanElevationM: number;
  minElevationM: number;
  maxElevationM: number;

  localReliefM: number;
}
~~~

~~~text
localReliefM =
maxElevationM - minElevationM
~~~

# RoutingProvider

~~~typescript
interface RoutingProvider {
  route(
    request: ProviderRouteRequest
  ): Promise<ProviderRouteResult>;
}
~~~

# Requête fournisseur normalisée

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

# Réponse fournisseur

~~~typescript
interface ProviderRouteResult {
  geometry: GeoLineString;

  distanceM: number;

  durationSec?: number;

  elevationProfile?: ElevationSample[];

  segments?: RouteSegmentMetadata[];
}
~~~

# Échec du routage

Un échec sur un candidat produit :

~~~text
ROUTING_FAILED
~~~

Le candidat est écarté.

La génération complète ne devient `FAILED` que lorsqu’aucun candidat valide ne peut être retourné.

# Source officielle du D+

La valeur métier du D+ doit être calculée par l’application.

Elle NE DOIT PAS dépendre directement de la valeur agrégée fournie par un moteur externe.

# Profil d’altitude

~~~typescript
interface ElevationSample {
  distanceFromStartM: number;
  elevationM: number;
}
~~~

# Rééchantillonnage

Valeur initiale :

~~~text
ELEVATION_SAMPLE_INTERVAL = 25 m
~~~

# Pipeline altimétrique

~~~text
profil source
    ↓
rééchantillonnage
    ↓
filtre médian
    ↓
lissage
    ↓
deadband vertical
    ↓
calcul du D+
    ↓
calcul des pentes
    ↓
détection des montées
~~~

# Filtre médian

~~~text
MEDIAN_WINDOW_SIZE = 5
~~~

# Lissage

~~~text
SMOOTHING_WINDOW_SIZE = 3
~~~

# Deadband vertical

~~~text
ELEVATION_DEADBAND = 2 m
~~~

Les petites oscillations ne doivent pas être additionnées naïvement au D+.

# Pente

~~~text
gradientPct =
100 × elevationDelta / horizontalDistance
~~~

# Pentes calculées

Le moteur calcule au minimum :

~~~text
gradient_100m
gradient_250m
gradient_500m
~~~

La pente maximale métier correspond par défaut au maximum de :

~~~text
gradient_100m
~~~

et non à une variation instantanée entre deux échantillons.

# Montée

Seuils initiaux :

~~~text
CLIMB_MIN_LENGTH = 500 m
CLIMB_MIN_GAIN = 30 m
CLIMB_MIN_AVG_GRADIENT = 2 %
~~~

Une montée doit respecter les trois conditions.

# Descente interne tolérée

~~~text
MAX_INTERNAL_DESCENT = 20 m
~~~

Une courte descente n’interrompt donc pas nécessairement une montée.

# Mutation des candidats

Les mutations doivent dépendre de la topologie.

# Mutations LOOP

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

# Mutations POINT_TO_POINT avec destination fixe

~~~text
MOVE_VIA_POINT
INSERT_VIA_POINT
REMOVE_VIA_POINT
SHIFT_CORRIDOR
MOVE_VIA_HIGHER
MOVE_VIA_LOWER
~~~

La destination finale NE DOIT PAS être modifiée.

# Mutations POINT_TO_POINT avec destination générée

~~~text
ROTATE_DESTINATION
MOVE_DESTINATION_FARTHER
MOVE_DESTINATION_CLOSER
MOVE_DESTINATION_HIGHER
MOVE_DESTINATION_LOWER
SHIFT_DESTINATION
~~~

# Mutations MULTI_STOP

Si ordre fixe :

~~~text
MOVE_TECHNICAL_VIA_POINT
INSERT_TECHNICAL_VIA_POINT
REMOVE_TECHNICAL_VIA_POINT
~~~

Les étapes utilisateur restent inchangées.

Si ordre optimisable :

~~~text
REORDER_OPTIMIZABLE_STOPS
~~~

peut être ajouté.

# Mutation adaptative

Le moteur doit prioriser les mutations susceptibles d’améliorer les dimensions faibles.

Exemple :

~~~text
distanceScore = 0.96
elevationScore = 0.35
directionScore = 0.90
~~~

Le moteur doit privilégier une mutation liée au relief plutôt qu’une mutation arbitraire de direction.

# Évaluation d’un candidat

Pipeline :

~~~text
routage
   ↓
analyse géométrique
   ↓
analyse altimétrique
   ↓
analyse montées
   ↓
analyse historique
   ↓
contrôles HARD
   ↓
calcul dimensions
   ↓
score global
   ↓
conformité
   ↓
confiance des données
~~~

# Validité

La validité est binaire.

~~~typescript
type CandidateValidity =
  | "VALID"
  | "REJECTED";
~~~

Un candidat `REJECTED` ne peut pas être classé.

# Score global

Tout candidat valide reçoit un score absolu :

~~~text
0 à 100
~~~

Le score NE DOIT PAS être normalisé relativement aux autres candidats.

Exemple interdit :

~~~text
meilleur candidat trouvé
→ score forcé à 100
~~~

Exemple correct :

~~~text
meilleur candidat trouvé
→ 57 / 100
~~~

si la qualité réelle de correspondance est médiocre.

# Rang

Le rang indique uniquement la position parmi les résultats retournés.

~~~text
rank = 1
rank = 2
rank = 3
~~~

Le rang NE DOIT PAS modifier le score.

# Dimensions du score

Dimensions disponibles :

~~~text
distance
elevation
difficulty
direction
roadQuality
surface
climbs
routeGeometry
novelty
~~~

# Distance

Mesure la correspondance avec :

- distance cible ;
- ou détour cible/maximal selon le cas.

# Elevation

Mesure la correspondance avec le D+ demandé.

# Difficulty

Mesure la correspondance avec la difficulté demandée.

# Direction

Applicable principalement :

- LOOP ;
- POINT_TO_POINT avec destination générée.

# RoadQuality

Prend en compte :

- classe routière ;
- routes secondaires ;
- grands axes ;
- infrastructures cyclables ;
- accès.

# Surface

Prend en compte :

- surface connue ;
- adéquation au vélo route ;
- proportion de revêtement inconnu.

# Climbs

Prend en compte :

- longueur ;
- nombre ;
- pente ;
- répartition ;
- correspondance avec le type de séance.

# RouteGeometry

Prend en compte :

- recouvrement interne ;
- détours artificiels ;
- aller-retour inutile ;
- répétition de portions.

# Novelty

Prend en compte l’historique utilisateur.

# Dimensions non applicables

Une dimension non applicable :

~~~text
weight = 0
~~~

Les autres poids sont renormalisés afin que :

~~~text
somme = 1
~~~

# Pondération par type de sortie

Exemple initial `HILLY_ENDURANCE` avec boucle :

~~~text
Distance           15 %
D+                 15 %
Difficulté         10 %
Direction          10 %
Qualité routière   15 %
Revêtement         10 %
Montées            10 %
Géométrie           5 %
Nouveauté          10 %
                   ----
                  100 %
~~~

# Exemple A → B

~~~text
Distance / détour  15 %
D+                 15 %
Difficulté         10 %
Direction           0 %
Qualité routière   20 %
Revêtement         15 %
Montées            10 %
Géométrie           5 %
Nouveauté          10 %
                   ----
                  100 %
~~~

# LONG_CLIMB

Exemple :

~~~text
Distance           10 %
D+                 15 %
Difficulté         10 %
Direction           5 % si applicable
Qualité routière   10 %
Revêtement         10 %
Montées            25 %
Géométrie           5 %
Nouveauté          10 %
~~~

Les poids doivent rester configurables et versionnés.

# Score d’une dimension

Les dimensions quantitatives utilisent une fonction continue.

Exemple pour distance :

~~~text
error =
abs(actual - target)
~~~

~~~text
score =
exp(
  -(error² / (2 × tolerance²))
)
~~~

Puis conversion :

~~~text
dimensionScore100 =
round(score × 100)
~~~

# Conformité

La conformité est distincte du score global.

Valeurs :

~~~typescript
type ComplianceLevel =
  | "VERY_CLOSE"
  | "CLOSE"
  | "MODERATE_COMPROMISE"
  | "IMPORTANT_COMPROMISE"
  | "PARTIALLY_SATISFIED";
~~~

Affichage :

~~~text
Très proche
Proche
Compromis modéré
Compromis important
Demande partiellement satisfaite
~~~

# VERY_CLOSE

Toutes les contraintes principales demandées sont :

- dans leur plage optimale ;
- ou présentent uniquement un écart négligeable.

Aucun compromis significatif.

# CLOSE

Une ou plusieurs contraintes présentent un écart faible.

Le résultat reste très cohérent avec l’intention initiale.

# MODERATE_COMPROMISE

Au moins une contrainte importante est sensiblement hors cible.

Le parcours reste pertinent.

# IMPORTANT_COMPROMISE

Une caractéristique importante est fortement dégradée ou plusieurs caractéristiques sont hors cible.

# PARTIALLY_SATISFIED

Toutes les contraintes dures restent respectées, mais une part significative de la demande souple n’a pas pu être satisfaite.

# Conformité et rang

Exemple parfaitement valide :

~~~text
Proposition #1

Score global
58 / 100

Conformité
Compromis important
~~~

Le moteur NE DOIT PAS transformer le niveau de conformité en `VERY_CLOSE` uniquement parce qu’il s’agit du meilleur résultat trouvé.

# Écarts réels

Le moteur doit conserver les valeurs réelles de chaque dimension.

~~~typescript
interface DimensionEvaluation<T = number | string> {
  score: number;

  requested?: T;

  actual: T;

  delta?: number;

  deltaPercent?: number;

  status:
    | "OPTIMAL"
    | "ACCEPTABLE"
    | "OUTSIDE_OPTIMAL"
    | "NEAR_HARD_LIMIT";
}
~~~

# Exemple D+

~~~json
{
  "requested": 800,
  "actual": 612,
  "delta": -188,
  "deltaPercent": -23.5,
  "score": 54,
  "status": "OUTSIDE_OPTIMAL"
}
~~~

# Confiance des données

Elle doit être séparée du score global.

~~~typescript
interface RouteDataConfidence {
  level:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  unknownSurfaceRatio: number;

  unknownRoadClassificationRatio: number;

  unknownAccessRatio: number;
}
~~~

Un parcours peut donc avoir :

~~~text
Score : 86 / 100
Conformité : Très proche
Confiance des données : Moyenne
Revêtement inconnu : 11 %
~~~

# Déduplication

Deux candidats sont considérés comme quasi identiques si :

~~~text
overlapRatio(A,B) >= 0.80
ET
overlapRatio(B,A) >= 0.80
~~~

Valeur :

~~~text
RESULT_DUPLICATE_THRESHOLD = 0.80
~~~

Le candidat avec le score global le plus faible est éliminé.

# Diversification finale

Le moteur ne doit pas simplement retourner les quatre meilleurs scores.

Processus :

~~~text
trier les candidats par score
    ↓
prendre le meilleur
    ↓
chercher le meilleur restant suffisamment différent
    ↓
répéter
~~~

Seuil par défaut :

~~~text
MAX_RESULT_PAIR_OVERLAP = 0.60
~~~

Le seuil correspond à la part commune maximale calculée par rapport au parcours le plus court de chaque paire. Il est configurable par la demande et NE DOIT PAS être relâché automatiquement.

S’il ne peut produire quatre propositions respectant le seuil demandé :

~~~text
retourner moins de résultats
~~~

est préférable.

# Nombre de résultats

Valeur par défaut :

~~~text
resultCount = 4
~~~

Si deux résultats seulement sont jugés valides :

~~~text
status = PARTIAL
candidates.length = 2
~~~

# Budget de génération

~~~typescript
interface GenerationOptions {
  resultCount?: number;

  maxRoutingCalls?: number;

  maxIterations?: number;

  maxEvaluatedCandidates?: number;

  nominalTargetMs?: number;

  hardTimeoutMs?: number;

  seed?: string;
}
~~~

Valeurs initiales :

~~~text
resultCount = 4
maxRoutingCalls = 80
maxIterations = 4
maxEvaluatedCandidates = 60
nominalTargetMs = 15000
hardTimeoutMs = 60000
~~~

# Budgets temporels

À 15 secondes, la recherche PEUT continuer, mais le dépassement de la cible nominale DOIT être signalé à l’interface et enregistré dans les diagnostics.

À 60 secondes, le moteur DOIT arrêter définitivement la recherche :

- aucun nouvel appel de routage ne commence ;
- seuls les candidats entièrement validés avant l’arrêt peuvent être retournés ;
- un à trois candidats valides produisent `PARTIAL` ;
- aucun candidat valide produit `FAILED` avec les contraintes bloquantes et les assouplissements possibles ;
- tout résultat asynchrone reçu après l’état terminal est ignoré.

# Arrêt anticipé

Le moteur peut arrêter la recherche lorsque :

~~~text
nombre de résultats >= resultCount
~~~

et :

~~~text
chaque résultat sélectionné possède un score >= 90
~~~

et :

~~~text
conformité >= CLOSE
~~~

et :

~~~text
diversité suffisante
~~~

# Convergence

Arrêt possible si :

~~~text
amélioration du meilleur score < 1 point
~~~

durant :

~~~text
2 itérations consécutives
~~~

# Relaxation

Seules les contraintes souples peuvent être relâchées.

Ordre par défaut :

~~~text
nouveauté
    ↓
direction
    ↓
préférences de montée
    ↓
D+ hors zone optimale mais dans les limites dures
    ↓
distance hors zone optimale mais dans les limites dures
~~~

Les contraintes dures ne peuvent jamais être relaxées.

# Statuts des candidats

~~~text
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
~~~

# Statuts d’une génération

~~~text
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
~~~

Une génération atteint exactement un état terminal parmi `COMPLETED`, `PARTIAL`, `FAILED` et `CANCELLED`. Une annulation utilisateur ou l’arrêt à 60 secondes est définitif ; aucune transition ni résultat tardif ne peut le remplacer.

# COMPLETED

Une génération est `COMPLETED` lorsque :

- le traitement s’est achevé normalement ou par arrêt anticipé ;
- le nombre de résultats valides demandé est retourné.

Elle peut malgré tout contenir des compromis souples.

# PARTIAL

Une génération est `PARTIAL` lorsque :

- des résultats valides existent ;
- mais leur nombre est inférieur au nombre demandé ;
- ou le budget a interrompu la recherche ;
- ou les préférences principales ne sont que partiellement satisfaites.

# FAILED

Une génération est `FAILED` si :

- aucun candidat valide ne peut être retourné ;
- ou une erreur globale empêche le fonctionnement du moteur.

# Contraintes impossibles

Exemple :

~~~text
30 km
2 000 m D+
zone plate
~~~

Si le D+ constitue uniquement une contrainte souple et qu’un parcours valide existe :

~~~text
status = PARTIAL
~~~

avec explication.

Si :

~~~text
hardMinM = 1500
~~~

et aucun candidat n’atteint 1 500 m :

~~~text
status = FAILED
~~~

# Explications

~~~typescript
interface CandidateExplanation {
  strengths: ExplanationItem[];
  compromises: ExplanationItem[];
}
~~~

Exemple :

~~~text
Points forts

- Distance proche de la cible.
- D+ conforme.
- Bonne correspondance avec la direction Nord-Est.
- 74 % de routes peu ou pas parcourues récemment.

Compromis

- 9 % du revêtement est inconnu.
- La montée principale mesure 4,6 km contre 5 km demandés.
~~~

# Résultat d’évaluation

~~~typescript
interface RouteEvaluation {
  rank?: number;

  globalScore: number;

  compliance: {
    level: ComplianceLevel;
    reasons: ComplianceReason[];
  };

  dimensions: {
    distance?: DimensionEvaluation;
    elevation?: DimensionEvaluation;
    difficulty?: DimensionEvaluation;
    direction?: DimensionEvaluation;
    roadQuality?: DimensionEvaluation;
    surface?: DimensionEvaluation;
    climbs?: DimensionEvaluation;
    routeGeometry?: DimensionEvaluation;
    novelty?: DimensionEvaluation;
  };

  dataConfidence: RouteDataConfidence;

  warnings: RouteWarning[];
}
~~~

# Parcours retourné

~~~typescript
interface GeneratedRoute {
  id: string;

  topology: RouteTopology;

  geometry: GeoLineString;

  start: GeoPoint;

  end: GeoPoint;

  stops?: UserStop[];

  distanceKm: number;

  elevationGainM: number;

  elevationLossM: number;

  estimatedDurationSec?: number;

  primaryDirectionDeg?: number;

  climbs: RouteClimb[];

  intrinsicDifficulty: RouteDifficulty;

  personalDifficulty?: PersonalDifficulty;

  evaluation: RouteEvaluation;

  explanation: CandidateExplanation;
}
~~~

# Contrat de réponse

~~~typescript
interface RouteGenerationResult {
  generationId: string;

  status:
    | "COMPLETED"
    | "PARTIAL"
    | "FAILED"
    | "CANCELLED";

  candidates: GeneratedRoute[];

  unmetPreferences: UnmetPreference[];

  diagnostics: GenerationDiagnostics;
}
~~~

# Exemples de requêtes

## Boucle

~~~json
{
  "topology": "LOOP",
  "mode": "AUTOMATIC",
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
  "rideType": "HILLY_ENDURANCE"
}
~~~

## A vers B

~~~json
{
  "topology": "POINT_TO_POINT",
  "mode": "AUTOMATIC",
  "start": {
    "lat": 44.0,
    "lon": 4.8
  },
  "end": {
    "lat": 44.24,
    "lon": 5.07
  },
  "pointToPointPreferences": {
    "maxDetourRatio": 1.20,
    "maxDetourConstraintType": "SOFT"
  }
}
~~~

## Destination générée

~~~json
{
  "topology": "POINT_TO_POINT",
  "mode": "AUTOMATIC",
  "start": {
    "lat": 44.0,
    "lon": 4.8
  },
  "distance": {
    "targetKm": 50,
    "toleranceKm": 5
  },
  "direction": {
    "mode": "NE",
    "strength": "MEDIUM"
  }
}
~~~

## Multi-étapes avec ordre imposé

~~~json
{
  "topology": "MULTI_STOP",
  "mode": "AUTOMATIC",
  "start": {
    "lat": 44.0,
    "lon": 4.8
  },
  "stops": [
    {
      "id": "stop_1",
      "location": {
        "lat": 44.1,
        "lon": 4.9
      },
      "orderMode": "FIXED",
      "fixedOrder": 1
    },
    {
      "id": "stop_2",
      "location": {
        "lat": 44.2,
        "lon": 5.0
      },
      "orderMode": "FIXED",
      "fixedOrder": 2
    }
  ],
  "multiStopPreferences": {
    "stopOrder": "FIXED"
  }
}
~~~

## Multi-étapes avec ordre optimisable

~~~json
{
  "topology": "MULTI_STOP",
  "mode": "AUTOMATIC",
  "start": {
    "lat": 44.0,
    "lon": 4.8
  },
  "end": {
    "lat": 44.3,
    "lon": 5.1
  },
  "stops": [
    {
      "id": "stop_1",
      "location": {
        "lat": 44.1,
        "lon": 5.0
      },
      "orderMode": "OPTIMIZABLE"
    },
    {
      "id": "stop_2",
      "location": {
        "lat": 44.2,
        "lon": 4.9
      },
      "orderMode": "OPTIMIZABLE"
    }
  ],
  "multiStopPreferences": {
    "stopOrder": "OPTIMIZABLE"
  }
}
~~~

# API

Création :

~~~text
POST /api/route-generations
~~~

Réponse initiale possible :

~~~text
202 Accepted
~~~

~~~json
{
  "generationId": "gen_xxx",
  "status": "PENDING"
}
~~~

Consultation :

~~~text
GET /api/route-generations/{generationId}
~~~

Annulation :

~~~text
POST /api/route-generations/{generationId}/cancel
~~~

# Persistance

Chaque génération doit conserver :

- requête initiale ;
- requête normalisée ;
- seed ;
- topologie ;
- provider ;
- version provider ;
- version de l’algorithme ;
- version du scoring ;
- version du calcul D+ ;
- version de l’algorithme de similarité ;
- candidats sélectionnés ;
- score de chaque résultat ;
- conformité ;
- diagnostics ;
- motifs de rejet agrégés ;
- nombre d’appels au routeur ;
- durée d’exécution.

# Versionnement

~~~text
generationAlgorithmVersion
scoringVersion
elevationAlgorithmVersion
similarityAlgorithmVersion
osmClassificationVersion
climbDetectionVersion
difficultyAlgorithmVersion
complianceAlgorithmVersion
~~~

# Configuration centralisée

Les paramètres techniques ne doivent pas être dispersés dans le code.

Exemples :

~~~text
START_SNAP_MAX_DISTANCE
SEARCH_RADIUS_FACTOR
ELEVATION_SAMPLE_INTERVAL
MEDIAN_WINDOW_SIZE
SMOOTHING_WINDOW_SIZE
ELEVATION_DEADBAND
ROUTE_SIMILARITY_BUFFER
NOVELTY_IGNORE_RADIUS_START
RESULT_DUPLICATE_THRESHOLD
MAX_RESULT_PAIR_OVERLAP
NOMINAL_TARGET_MS
HARD_TIMEOUT_MS
~~~

# Observabilité

Métriques minimales :

~~~text
route_generation_duration_seconds
routing_calls_count
routing_errors_count
candidate_generated_count
candidate_routed_count
candidate_rejected_count
candidate_valid_count
candidate_selected_count
iteration_count
best_candidate_score
average_selected_score
completed_generation_count
partial_generation_count
failed_generation_count
~~~

# Diagnostics de rejet

~~~text
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
HARD_DIFFICULTY
HARD_MAX_DETOUR
ROUTING_FAILED
INVALID_GEOMETRY
INVALID_STOP
~~~

# Avertissements

~~~text
SURFACE_UNKNOWN
ROAD_CLASSIFICATION_UNKNOWN
ACCESS_UNKNOWN
NOMINAL_TIME_EXCEEDED
TARGET_DISTANCE_NOT_MET
TARGET_ELEVATION_NOT_MET
DIRECTION_WEAK_MATCH
LOW_NOVELTY
HIGH_INTERNAL_OVERLAP
NO_REQUESTED_CLIMB_FOUND
DIFFICULTY_ABOVE_TARGET
PERSONAL_DIFFICULTY_LOW_CONFIDENCE
~~~

# Tests obligatoires

Le moteur doit disposer de tests unitaires sur :

- contraintes dures ;
- contraintes souples ;
- limites ;
- calcul du score ;
- calcul de conformité ;
- distance ;
- D+ ;
- direction ;
- circularité des azimuts ;
- surface inconnue ;
- détection des montées ;
- similarité ;
- nouveauté ;
- recouvrement interne ;
- déduplication ;
- diversification ;
- relaxation ;
- timeout ;
- signalement du dépassement nominal à 15 secondes ;
- arrêt définitif à 60 secondes et rejet des résultats tardifs ;
- classification OSM normative et règles de priorité ;
- quatre résultats par défaut sans relaxation automatique de diversité ;
- génération partielle ;
- optimisation de l’ordre des étapes ;
- respect d’un ordre fixe ;
- absence de génération automatique de POI en V1.

# Tests POINT_TO_POINT

Cas :

~~~text
A → B
~~~

Le moteur doit conserver A et B.

Aucune mutation ne peut déplacer B si B a été explicitement fournie.

# Tests LOOP

Cas :

~~~text
A → ... → A
~~~

Le point final doit correspondre au point initial selon la tolérance de snapping.

# Tests MULTI_STOP FIXED

Entrée :

~~~text
A
B
C
D
E
~~~

Résultat obligatoire :

~~~text
A → B → C → D → E
~~~

# Tests MULTI_STOP OPTIMIZABLE

Entrée :

~~~text
A
[B,C,D optimisables]
E
~~~

Le moteur peut modifier l’ordre de B, C et D.

Il ne peut pas déplacer :

~~~text
A
E
~~~

# Test absence de GeneratedStop V1

Une requête :

~~~text
60 km
900 m D+
