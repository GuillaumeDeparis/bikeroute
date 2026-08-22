# Réconciliation — spécification du générateur de parcours

**Entrée demandée :** `docs/spec_route_generator.md`  
**Entrée analysée :** `docs/spec_route_generator_latest.md` (le chemin demandé n'existe pas)  
**Références :** `docs/PRD.md`, `docs/addendum.md`  
**Date :** 2026-08-18

## Verdict

La version `latest` couvre déjà les trois topologies, les étapes utilisateur, le score absolu et la séparation score/conformité/rang/confiance. Elle n'est toutefois pas conforme au PRD V1 sur quatre points structurants : sélection de quatre résultats et diversité stricte, historique de nouveauté limité aux exports, politique de données inconnues, et budget temporel 15/60 secondes. Le chemin documentaire canonique est également cassé.

## Éléments correctement réconciliés

- Les topologies `POINT_TO_POINT`, `LOOP` et `MULTI_STOP` sont explicites.
- L'aller simple sans destination est prévu avec départ, distance et direction ; le moteur génère alors la destination.
- Le multi-étapes V1 n'utilise que des étapes fournies par l'utilisateur, en ordre fixe ou optimisable.
- Les `GenerationAnchor` restent distincts des étapes utilisateur.
- Le score est absolu, indépendant du rang, et la conformité ainsi que la confiance sont séparées.
- Les dimensions du score correspondent globalement aux neuf dimensions attendues.
- Les surfaces explicitement incompatibles sont traitées comme violations dures, et les grands axes autorisés peuvent être pénalisés.

## Écarts et mises à jour obligatoires

### 1. Nombre de résultats et diversité incompatibles avec le PRD

La spécification fixe encore `resultCount = 3`, parle de « trois propositions », et illustre les rangs jusqu'à 3. Le PRD exige une cible de **quatre propositions** (`FR-21`) et accepte 1 à 3 résultats avec statut partiel (`FR-22`).

La spécification fixe par ailleurs `MAX_RESULT_PAIR_OVERLAP = 0.65` et autorise une relaxation jusqu'à `0.90`. Le PRD impose par défaut au moins **40 % de distance non commune**, soit au plus 60 % de recouvrement, pour **chaque paire** (`FR-14`, `FR-24`, `SM-3`). Si le seuil empêche d'obtenir quatre résultats, le moteur doit en retourner moins ; il ne peut pas le relâcher silencieusement.

**Mise à jour requise :** remplacer les valeurs et exemples à trois par quatre ; définir le seuil utilisateur en distance non commune avec valeur par défaut 40 % ; supprimer la relaxation automatique qui violerait ce seuil ; retourner `PARTIAL` avec une raison structurée quand 1 à 3 candidats seulement satisfont la diversité demandée.

### 2. La nouveauté utilise le mauvais historique

La spécification permet de comparer les sorties effectuées, parcours enregistrés et parcours générés, avec des poids respectifs. Le PRD limite explicitement la nouveauté V1 aux **parcours exportés par l'utilisateur** (`FR-25`, `FR-43`) et demande une pondération plus forte des exports récents. Un parcours généré ou enregistré mais non exporté ne doit donc pas pénaliser la nouveauté.

**Mise à jour requise :** remplacer les catégories `COMPLETED_RIDE`, `SAVED_ROUTE` et `GENERATED_ROUTE` par une source V1 `EXPORTED_ROUTE` rattachée au compte ; rendre la décroissance temporelle versionnée ; aligner les contrats d'entrée, le calcul, les diagnostics et les tests. La constante `tau = 60 jours` peut rester une hypothèse technique à valider, mais ne doit pas être présentée comme décision produit acquise.

### 3. Politiques de validité et de confiance contradictoires

Le PRD exige le rejet d'un candidat dès qu'un segment a un accès vélo interdit **ou inconnu** (`FR-15`). La spécification expose `unknownAccessRatio`, `ACCESS_UNKNOWN` et `HARD_BICYCLE_ACCESS`, mais ne formule pas clairement la règle normative d'exclusion de l'accès inconnu.

Pour le revêtement inconnu, la spécification indique une « pénalité de score éventuelle ». Cela contredit `FR-17` et l'addendum : le revêtement inconnu est admissible, déclenche avertissement et baisse de confiance, mais **ne réduit pas directement le score global**. De même, la dimension `Surface` mentionne la proportion inconnue parmi les facteurs du score.

Enfin, `RoadPreferences` propose `PAVED_PREFERRED` et `MIXED_ALLOWED`, alors que la V1 route a arrêté une politique unique excluant terre, gravier et autres surfaces incompatibles explicites.

**Mise à jour requise :** formaliser l'accès vélo inconnu comme contrainte dure ; retirer toute pénalité de score liée uniquement à une surface inconnue ; réserver cette inconnue à `dataConfidence` et aux avertissements ; supprimer ou déclarer hors V1 les politiques permettant des surfaces incompatibles ; compléter les tests de rejet et d'incertitude.

### 4. Le modèle temporel ne couvre pas le nominal et le fail-safe

La spécification traite `timeoutMs = 15000` comme l'arrêt du moteur. Le PRD définit au contraire 15 secondes comme **objectif nominal** : au-delà, le calcul continue avec indication explicite, puis un arrêt de sécurité obligatoire intervient à **60 secondes** (`FR-34`, `FR-35`, `NFR-3`, `SM-5`). L'annulation est listée, mais ses garanties d'arrêt et de restitution ne sont pas détaillées.

**Mise à jour requise :** distinguer `nominalBudgetMs = 15000` de `hardTimeoutMs = 60000` ; émettre un état/événement de dépassement nominal sans arrêter la recherche ; au fail-safe, interrompre les nouveaux appels et le travail annulable, restituer les candidats déjà validés en `PARTIAL`, ou retourner `FAILED` avec contraintes bloquantes et recommandations d'assouplissement ; préciser le comportement de `CANCELLED`.

### 5. Contrat documentaire et quelques sémantiques restent à aligner

Le PRD référence `docs/spec_route_generator.md`, absent du dépôt ; seules les variantes `_latest` et `_v1` existent. Cette rupture empêche d'identifier la spécification normative.

Le PRD demande aussi que la demande initiale soit conservée puis réutilisée pour recalculer score, conformité et confiance après modification (`FR-38`, `FR-39`). Le mode manuel de la spécification dit qu'il évalue la conformité, mais le contrat de réévaluation d'un parcours « généré puis modifié » n'est pas explicite. Enfin, `MULTI_STOP` autorise une arrivée « déduite de la dernière étape », tandis que le minimum produit V1 exige départ, étapes et arrivée ; cette tolérance doit être alignée ou clairement portée par la couche applicative.

**Mise à jour requise :** choisir/renommer un fichier canonique ; ajouter un contrat de réévaluation conservant la demande versionnée et distinguant la géométrie originale de la courante ; aligner la validation minimale de `MULTI_STOP` avec le PRD.

## Priorité de révision recommandée

1. Validité des segments et traitement des inconnues, car ces règles conditionnent la sécurité fonctionnelle et `SM-1`.
2. Quatre résultats et diversité stricte, car ils changent la sélection finale et les statuts.
3. Budgets 15/60 secondes, car ils changent le cycle de vie de la génération et l'API.
4. Nouveauté sur exports seulement, car elle change le modèle historique et le score.
5. Canonisation du fichier et réévaluation après édition.
