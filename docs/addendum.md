---
title: Addendum technique et UX du PRD vélo
status: final
created: 2026-08-18
updated: 2026-08-18
---

# Addendum technique et UX

Cet addendum conserve les détails utiles à la spécification du moteur, à l'architecture et à l'UX, sans les transformer en exigences d'implémentation dans le PRD.

## 1. Modèle d'évaluation proposé

La conversation a fait émerger la structure conceptuelle suivante :

```yaml
RouteEvaluation:
  rank: integer
  globalScore: 0..100
  compliance:
    level: VERY_CLOSE | CLOSE | MODERATE_COMPROMISE | MAJOR_COMPROMISE | PARTIALLY_SATISFIED
    reasons: list
  dimensions:
    distance: DimensionEvaluation
    elevation: DimensionEvaluation
    difficulty: DimensionEvaluation
    direction: DimensionEvaluation
    roadQuality: DimensionEvaluation
    surface: DimensionEvaluation
    climbs: DimensionEvaluation
    routeGeometryQuality: DimensionEvaluation
    novelty: DimensionEvaluation
  dataConfidence:
    level: HIGH | MEDIUM | LOW
    unknownSurfaceRatio: number
    unknownRoadDataRatio: number
  warnings: list
```

Chaque dimension conserve la valeur réelle en plus de son score :

```yaml
elevation:
  requested: 800
  tolerance: 100
  actual: 612
  delta: -188
  deltaPercent: -23.5
  score: 54
  compliance: OUTSIDE_OPTIMAL_RANGE
```

La fiabilité des données est volontairement séparée du score global. Un revêtement inconnu ne devient ni goudronné ni défavorable par convention ; il réduit la confiance et déclenche un avertissement. Un accès vélo inconnu ou non renseigné suit désormais le même traitement : il reste admissible, réduit la confiance des données et déclenche un avertissement (`ACCESS_UNKNOWN`), sans exclusion automatique — seul un accès vélo explicitement interdit reste une violation dure.

## 2. Pondérations initiales à valider

Les pondérations doivent être configurables et versionnées par type de séance.

Exemple envisagé pour `HILLY_ENDURANCE` :

| Dimension | Poids |
|---|---:|
| Distance | 15 % |
| D+ | 15 % |
| Difficulté | 10 % |
| Direction | 10 % |
| Qualité routière | 15 % |
| Revêtement | 10 % |
| Caractéristiques des montées | 10 % |
| Qualité géométrique | 5 % |
| Nouveauté | 10 % |

Exemple envisagé pour `LONG_CLIMB` :

| Dimension | Poids |
|---|---:|
| Distance | 10 % |
| D+ | 15 % |
| Difficulté | 10 % |
| Direction | 5 % |
| Qualité routière | 10 % |
| Revêtement | 10 % |
| Caractéristiques des montées | 25 % |
| Qualité géométrique | 5 % |
| Nouveauté | 10 % |

La diversité entre propositions n'apparaît pas dans ces tableaux : elle intervient lors de la sélection de l'ensemble final. La nouveauté reste une propriété individuelle du candidat par rapport aux exports antérieurs.

Ces tableaux sont des hypothèses de départ pour le calibrage, pas encore le référentiel normatif. Le référentiel d'évaluation V1 ne devient normatif qu'après validation sur le corpus de référence exigé par FR-51 et NFR-16.

## 3. Sémantique des types de parcours

### 3.1 Étapes et ancres

- `UserStop` : lieu explicitement choisi, visible et significatif pour l'utilisateur.
- `GenerationAnchor` : point technique créé par le moteur pour façonner une route ; invisible comme étape.
- `GeneratedStop` : étape ou POI choisi automatiquement selon une intention ; reporté après la V1.

Un parcours multi-étapes V1 contient uniquement des `UserStop`. Une boucle peut utiliser plusieurs `GenerationAnchor` tout en restant une simple boucle du point de vue utilisateur.

### 3.2 Ordre des étapes

Avec un ordre imposé, le moteur respecte strictement `A → B → C → D → E`. Avec un ordre optimisable, il peut évaluer d'autres permutations telles que `A → C → B → D → E`, tout en conservant le départ, l'arrivée et toutes les étapes obligatoires.

### 3.3 Extension attendue de la spécification moteur

La spécification actuelle se concentre sur les boucles. Sa prochaine révision devra distinguer :

- boucle automatique avec direction et forme de boucle ;
- A → B avec destination connue, corridor, détour et préférences ;
- aller simple sans destination, où le moteur choisit un point d'arrivée selon les contraintes de distance et de direction ;
- multi-étapes à ordre imposé ;
- multi-étapes à ordre optimisable.

Le `RoutingProvider` calcule les chemins élémentaires. Le moteur de génération orchestre les variantes, applique les contraintes, évalue, diversifie et explique les résultats.

## 4. Principes UX conservés

La progression cible reste :

```text
Départ
  ↓
Destination ou type de parcours
  ↓
Route initiale ou demande de génération
  ↓
Analyse et propositions
  ↓
Sélection
  ↓
Ajustement
  ↓
Enregistrement
  ↓
Export
```

Sur ordinateur, la préparation associe un panneau de paramètres et une carte. Sur mobile, les paramètres peuvent apparaître dans un tiroir ou une feuille superposée. Les avertissements critiques et la fiabilité doivent rester visibles sur les deux formats.

La génération affiche une progression générale — analyse du réseau, relief, candidats — sans exposer les détails algorithmiques. Un tracé progressif est souhaitable, à condition qu'il soit explicitement provisoire avant validation.

Après modification, le parcours porte l'état « généré puis modifié ». L'évaluation courante remplace visuellement celle de la géométrie originale, tout en restant calculée contre la demande initiale conservée.

## 5. Matière reportée hors PRD V1

Le document exploratoire initial détaillait la difficulté personnalisée, l'état du cycliste, le journal de sorties, la progression, les objectifs, le coaching, les modèles de données et plusieurs algorithmes géographiques. Cette matière reste pertinente pour les évolutions et l'architecture, mais n'est pas une exigence de la V1 recentrée. Les choix d'algorithmes, fournisseurs, seuils et structures de données appartiennent aux spécifications techniques correspondantes.

## 6. Sources comparables consultées

Garmin Round-Trip Routing, Strava Generated Community Routes, Komoot Route Planner et Ride with GPS établissent la génération de boucles, les préférences de surface et relief, l'inspection et l'export comme attentes usuelles. Le territoire différenciant reste la combinaison explicable des contraintes d'entraînement, la validité prudente, la diversité et la nouveauté historique.

## 7. Portabilité complète

L'export GPX répond au transfert d'un parcours vers un outil de navigation. Il est distinct de l'export des données du compte, qui doit préserver les parcours, demandes de génération, préférences et historiques utiles dans des formats ouverts et documentés. Le choix exact du conteneur et des formats complémentaires appartient à l'architecture, sans remettre en cause cette capacité produit.

## 8. Politique de classification OpenStreetMap

Le PRD fixe les comportements visibles associés aux états autorisé, interdit, inconnu et dernier recours. La correspondance détaillée entre les tags OpenStreetMap et ces états appartient à `spec_route_generator.md`. Cette table doit être complète, versionnée et accompagnée de cas de test couvrant les combinaisons d'accès vélo, catégorie routière et revêtement pertinentes pour la France.
