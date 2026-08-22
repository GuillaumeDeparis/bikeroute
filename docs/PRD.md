---
title: Application de préparation et génération intelligente de parcours vélo
status: final
created: 2026-08-17
updated: 2026-08-18
---

# PRD — Application de préparation et génération intelligente de parcours vélo

## Synthèse exécutive

- **Décision V1 :** prouver la génération intelligente, explicable et éditable de boucles, d'allers simples et de parcours multi-étapes pour vélo de route.
- **Expérience cible :** jusqu'à quatre propositions valides et différentes, évaluées par score absolu, conformité, rang et fiabilité, puis modifiables et exportables en GPX.
- **Garde-fous :** aucune contrainte dure n'est compensée par le score ; les résultats partiels et les données inconnues sont explicités.
- **Déploiement :** application web adaptative (responsive) multi-utilisateur, auto-hébergée par Docker Compose, avec couverture France.
- **Succès :** au moins 90 % des demandes réalistes du corpus produisent un parcours valide ; aucun calcul ne dépasse 60 secondes.
- **Prérequis moteur :** calibrage du score, table OSM normative, protocole de performance et mise à jour de `spec_route_generator_latest.md`.

## 0. Objet du document

Ce PRD définit la première version exploitable d'une application web adaptative de préparation de parcours pour cyclistes sur route. Il constitue le contrat produit pour les travaux UX, d'architecture et de découpage en epics. La spécification détaillée du moteur reste dans [`spec_route_generator_latest.md`](./spec_route_generator_latest.md) et couvre les itinéraires aller simple et multi-étapes. Les mécanismes techniques et décisions de conception sont conservés dans [`addendum.md`](./addendum.md).

## 1. Vision

L'application aide un cycliste à créer, générer, comparer, ajuster, enregistrer et exporter un parcours adapté à son besoin. Elle couvre les boucles, les itinéraires d'un point A à un point B et les parcours comportant plusieurs étapes.

La V1 doit avant tout prouver la **génération intelligente de parcours** : à partir de contraintes simples ou avancées, elle recherche plusieurs parcours valides, les évalue de manière absolue, explique leurs écarts par rapport à la demande et rend visibles les incertitudes des données.

La proposition de valeur n'est pas de générer une boucle quelconque, mais de produire des parcours vélo de route crédibles au regard de la distance, du dénivelé, de la difficulté, de la direction, de la qualité routière, du profil des montées et de la nouveauté recherchés. Le meilleur candidat est celui qui répond le mieux à la demande ; il peut néanmoins rester un compromis important.

L'application privilégie la simplicité, l'explicabilité, les formats standards, la portabilité des données, les composants remplaçables et l'auto-hébergement. Elle ne prétend jamais garantir la sécurité réelle d'un parcours à partir des seules données cartographiques.

## 2. Utilisateur cible

La cible initiale est un cycliste sur route de niveau loisir ou loisir avancé, qui souhaite préparer des sorties adaptées à des objectifs géographiques et sportifs sans dépendre d'une plateforme propriétaire.

### 2.1 Besoins principaux

- Obtenir rapidement un parcours exploitable à partir de peu de paramètres.
- Affiner la demande avec des contraintes de distance, D+, direction, difficulté, route et montée.
- Comprendre pourquoi une proposition répond bien ou mal à la demande.
- Comparer des propositions réellement différentes.
- Ajuster manuellement un résultat sans perdre la demande initiale.
- Enregistrer et exporter le parcours vers un GPS ou une application compatible GPX.

### 2.2 Parcours utilisateur

#### UJ-1 — Guillaume génère et exporte un parcours

Guillaume se connecte depuis un ordinateur ou un téléphone et ouvre l'accueil sportif. Il choisit de préparer un parcours, indique son départ, son type de parcours et les contraintes utiles. Le système affiche l'avancement de la recherche puis jusqu'à quatre propositions classées, cartographiées et expliquées. Guillaume compare les résultats, sélectionne le meilleur compromis, l'ajuste sur la carte, vérifie les métriques recalculées, l'enregistre et l'exporte en GPX.

Si la demande est trop restrictive, le système présente moins de quatre résultats avec une explication. Si aucun candidat valide n'est disponible après 60 secondes, il explique l'échec et suggère les paramètres à assouplir.

#### UJ-2 — Guillaume crée un parcours manuellement

Guillaume choisit un départ, une destination ou un retour au départ, puis ajoute des passages ou des étapes sur la carte. Le parcours est recalculé après chaque modification. Les métriques, le profil altimétrique, les montées et les incertitudes restent accessibles. Guillaume enregistre ensuite le parcours ou l'exporte en GPX.

#### UJ-3 — Guillaume optimise un parcours multi-étapes

Guillaume définit un départ, une arrivée et des étapes significatives. Il impose leur ordre ou autorise le moteur à l'optimiser. Le système propose des parcours qui desservent toutes les étapes sous les contraintes applicables, sans transformer ses points techniques internes en étapes visibles.

## 3. Glossaire

- **Parcours** — Tracé cyclable préparé par l'utilisateur ou par le moteur.
- **Boucle** — Parcours dont le départ et l'arrivée sont identiques.
- **Aller simple** — Parcours dont le départ et l'arrivée sont distincts ; la destination peut être imposée ou choisie par le moteur.
- **Parcours multi-étapes** — Parcours desservant des étapes explicitement choisies par l'utilisateur, avec départ et arrivée définis.
- **Étape utilisateur** — Lieu visible et significatif choisi par l'utilisateur.
- **Point de passage** — Point ajouté pour contraindre la géométrie sans constituer nécessairement une étape.
- **Ancre technique** — Point invisible utilisé par le moteur pour façonner un candidat ; ce n'est pas une étape utilisateur.
- **Demande de génération** — Ensemble versionné des entrées, contraintes, préférences et tolérances fournies pour une recherche.
- **Candidat valide** — Parcours qui ne viole aucune contrainte dure.
- **Score global** — Note absolue de 0 à 100 représentant l'adéquation d'un candidat à la demande, indépendamment des autres candidats trouvés.
- **Conformité** — Niveau décrivant les écarts entre le résultat et les contraintes demandées.
- **Rang** — Position d'un candidat parmi les candidats valides, triés par score global décroissant.
- **Fiabilité des données** — Indicateur indépendant du score décrivant la couverture et l'incertitude des attributs cartographiques utiles.
- **Diversité** — Différence géographique entre les propositions d'une même génération.
- **Nouveauté** — Différence entre un candidat et les parcours exportés précédemment par l'utilisateur, pondérée par récence.
- **Contrainte dure** — Condition dont la violation interdit de retourner le candidat.
- **Préférence** — Objectif optimisable dont l'écart est autorisé s'il est mesuré et expliqué.

## 4. Fonctionnalités et exigences fonctionnelles

### 4.1 Comptes et accès

**Description :** La V1 est multi-utilisateur. Chaque personne crée un compte et n'accède qu'à ses propres données.

#### FR-1 — Inscription

Un visiteur peut créer librement un compte avec un identifiant et un mot de passe.

#### FR-2 — Session utilisateur

Un utilisateur peut se connecter, conserver une session sécurisée et se déconnecter.

#### FR-3 — Isolation des données

Les demandes, parcours, exports et préférences sont rattachés au compte connecté et inaccessibles aux autres comptes.

### 4.2 Accueil sportif

**Description :** L'accueil est une synthèse et un point d'entrée, pas un moteur de recommandation en V1.

#### FR-4 — Synthèse d'accueil

L'utilisateur connecté voit les informations disponibles, ses parcours récents et les actions principales de création, génération et consultation.

#### FR-5 — Continuité multi-écran

L'accueil et la préparation de parcours sont utilisables dans une interface adaptative sur ordinateur et mobile.

### 4.3 Création manuelle

**Description :** L'utilisateur peut construire un parcours sans renseigner de contrainte sportive. Parcours couvert : UJ-2.

#### FR-6 — Définition du parcours

L'utilisateur peut définir un départ, une arrivée, un retour au départ, des étapes utilisateur et des points de passage.

#### FR-7 — Types de parcours

Le système représente explicitement un parcours comme boucle, aller simple ou parcours multi-étapes ; il ne suppose jamais qu'un parcours est une boucle.

#### FR-8 — Édition cartographique

L'utilisateur peut ajouter, déplacer, réordonner ou retirer des points et déplacer une portion de tracé ; le parcours est recalculé après chaque modification.

#### FR-9 — Inversion

L'utilisateur peut inverser le sens d'une boucle ou échanger le départ et l'arrivée d'un aller simple. Le système recalcule les métriques et les caractéristiques des montées qui dépendent du sens.

### 4.4 Définition d'une demande de génération

**Description :** L'interface commence avec les paramètres minimaux et révèle progressivement les options avancées. Parcours couverts : UJ-1 et UJ-3.

#### FR-10 — Entrées minimales par type

Le système permet de lancer une génération avec :

- boucle : départ et distance cible ;
- aller simple avec destination : départ et destination ;
- aller simple sans destination : départ, distance cible et direction ;
- parcours multi-étapes : départ, étapes utilisateur et arrivée.

#### FR-11 — Tolérances et préférences

L'utilisateur peut compléter la demande avec une cible ou une limite de D+, une tolérance de distance, une difficulté, une direction, une préférence de qualité routière, une préférence de nouveauté, un éloignement maximal et des caractéristiques de montée.

#### FR-12 — Types de séance

L'utilisateur peut choisir récupération, endurance, endurance vallonnée, travail de côtes, montée longue, sortie longue ou libre. Le type choisi modifie l'évaluation des dimensions pertinentes.

#### FR-13 — Ordre des étapes

Pour un parcours multi-étapes, l'utilisateur choisit entre un ordre imposé et un ordre optimisable. Toutes les étapes utilisateur restent obligatoires.

#### FR-14 — Diversité configurable

L'utilisateur peut régler la distance minimale non commune entre propositions. Pour deux parcours de longueurs différentes, la part commune est calculée par rapport au parcours le plus court. La valeur par défaut impose au moins 40 % de distance différente, soit au plus 60 % de distance commune sur ce parcours de référence.

### 4.5 Validité et politiques routières

**Description :** Les contraintes dures décident si un candidat peut être retourné. Le score ne compense jamais une violation dure.

#### FR-15 — Accès vélo

Le système exclut tout candidat contenant une voie explicitement interdite aux vélos. Une voie dont l'accès vélo n'est pas renseigné ou reste ambigu demeure admissible ; sa présence est indiquée dans la fiabilité des données et les avertissements, sans réduire directement le score global — traitement symétrique à celui du revêtement inconnu (FR-17).

#### FR-16 — Revêtement vélo de route

Le système exclut tout candidat contenant un segment explicitement connu comme terre, gravier ou autre revêtement incompatible avec le vélo de route.

#### FR-17 — Revêtement inconnu

Un segment au revêtement inconnu reste admissible. Sa longueur et sa proportion sont indiquées dans la fiabilité des données et dans les avertissements, sans réduire directement le score global.

#### FR-18 — Grands axes

Un grand axe autorisé aux vélos peut être utilisé en dernier recours. Sa longueur est fortement pénalisée dans le score et signalée à l'utilisateur.

#### FR-19 — Prudence sur la sécurité

Le produit ne qualifie jamais un parcours de « sûr » ou ne garantit sa cyclabilité réelle sur la seule base des données disponibles.

### 4.6 Recherche et génération

**Description :** Le moteur orchestre plusieurs calculs de routage, évalue les candidats et retourne uniquement les meilleurs candidats valides.

#### FR-20 — Couverture des types

Le moteur génère des boucles, des allers simples avec ou sans destination imposée et des parcours multi-étapes avec étapes utilisateur.

#### FR-21 — Propositions multiples

Le moteur vise quatre propositions valides. Il retourne moins de quatre propositions plutôt que des doublons, des parcours invalides ou des candidats artificiellement dégradés.

#### FR-22 — Résultat partiel

Quand un à trois candidats valides sont disponibles, le résultat est présenté comme partiel avec les raisons expliquant le nombre insuffisant ou les préférences non satisfaites.

#### FR-23 — Échec explicite

Quand aucun candidat valide n'est disponible, le système ne retourne aucun parcours et explique les contraintes bloquantes ainsi que les assouplissements possibles.

#### FR-24 — Diversification

Chaque paire de propositions satisfait le seuil de distance non commune demandé selon le calcul défini dans FR-14. Si ce seuil empêche d'atteindre quatre résultats, FR-22 s'applique.

#### FR-25 — Nouveauté historique

Le moteur compare chaque candidat aux parcours exportés par l'utilisateur. Les exports récents pénalisent davantage la répétition que les exports anciens.

### 4.7 Évaluation et explicabilité

**Description :** Chaque proposition distingue clairement sa qualité absolue, son adéquation à la demande, sa position et l'incertitude des données.

#### FR-26 — Score absolu

Chaque candidat reçoit un score global absolu compris entre 0 et 100. Le meilleur candidat trouvé n'obtient jamais 100 par simple normalisation relative.

#### FR-27 — Dimensions du score

Le score évalue la distance, le D+, la difficulté intrinsèque, la direction, la qualité routière, le revêtement, les caractéristiques des montées, la qualité géométrique du parcours (`RouteGeometryQuality` — recouvrement interne, allers-retours inutiles, détours artificiels ; s'applique à toutes les topologies, pas seulement aux boucles) et la nouveauté. Les pondérations sont versionnées et varient selon le type de séance. Une dimension non applicable est affichée `N/A`, reçoit un poids nul et son poids est redistribué proportionnellement entre les dimensions applicables afin de conserver un score sur 100.

#### FR-28 — Conformité indépendante

La conformité est déterminée à partir des écarts aux contraintes demandées, indépendamment du rang. Ses niveaux sont : Très proche, Proche, Compromis modéré, Compromis important et Demande partiellement satisfaite.

#### FR-29 — Rang indépendant

Les candidats sont classés par score global décroissant. Le premier rang signifie uniquement « meilleur candidat valide trouvé ».

#### FR-30 — Fiabilité des données

Chaque candidat affiche un niveau de fiabilité distinct du score, la proportion de revêtement inconnu et les autres attributs cartographiques incomplets pertinents.

#### FR-31 — Explication dimensionnelle

Pour chaque dimension, le système conserve et présente, lorsque applicable, la valeur demandée, la tolérance, la valeur réelle, l'écart, le score dimensionnel et l'état de conformité.

#### FR-32 — Comparaison

L'utilisateur peut comparer les propositions sur la carte et dans une vue synthétique utilisant les mêmes dimensions et indicateurs.

#### FR-51 — Baseline d'évaluation calibrée

Avant de considérer le moteur V1 comme prêt, l'équipe doit calibrer puis versionner les seuils de conformité, les pondérations par type de séance et la décroissance de nouveauté sur un corpus de parcours de référence approuvé. Le référentiel d'évaluation vérifie également la redistribution des poids des dimensions non applicables à chaque type de parcours.

### 4.8 Suivi de la génération

#### FR-33 — Progression visible

Le système affiche immédiatement une animation et des étapes générales de progression. Il peut afficher un tracé provisoire à condition que l'interface le distingue clairement d'un candidat validé.

#### FR-34 — Dépassement nominal

Après 15 secondes, le calcul peut continuer mais l'interface signale explicitement le dépassement.

#### FR-35 — Arrêt de sécurité

À 60 secondes, le système arrête la recherche. Il retourne les candidats déjà validés ou explique l'échec et recommande des paramètres à assouplir.

#### FR-36 — Annulation

L'utilisateur peut annuler une génération en cours.

#### FR-53 — État terminal unique

Une génération atteint exactement un état terminal. Une annulation utilisateur ou l'arrêt à 60 secondes est définitif ; tout résultat reçu ensuite est ignoré. Seuls les candidats entièrement validés avant cet état terminal peuvent être restitués.

### 4.9 Sélection, modification et réévaluation

#### FR-37 — Sélection

L'utilisateur peut ouvrir une proposition sur la carte, la sélectionner et la transformer en parcours éditable.

#### FR-38 — Conservation de la demande

Le système conserve la demande initiale avec le parcours généré afin de permettre une réévaluation ultérieure.

#### FR-39 — Réévaluation après modification

Après toute modification du tracé, le système recalcule les métriques, le score global, la conformité, la fiabilité et les écarts par rapport à la demande initiale. Le parcours est identifié comme « généré puis modifié ».

#### FR-52 — Liberté après édition manuelle

Quand une modification manuelle introduit un segment qui aurait invalidé un candidat généré, le système recalcule l'évaluation, affiche un avertissement explicite et identifie la contrainte concernée. Il laisse néanmoins l'utilisateur poursuivre l'édition, enregistrer et exporter le parcours sous sa responsabilité.

### 4.10 Analyse, enregistrement et export

#### FR-40 — Métriques du parcours

Le système affiche au minimum la distance, le D+, le D-, la durée estimée, la difficulté intrinsèque, le profil altimétrique, les montées significatives, les revêtements et les catégories routières.

#### FR-41 — Enregistrement

L'utilisateur peut nommer, annoter, étiqueter et enregistrer un parcours dans sa bibliothèque.

#### FR-42 — Export GPX

L'utilisateur peut exporter un parcours au format GPX avec son tracé, ses points de passage et ses altitudes.

#### FR-43 — Historique des exports

Le système enregistre les exports nécessaires au calcul de nouveauté pour le compte connecté.

### 4.11 Continuité de préparation et portabilité

#### FR-44 — Continuité entre modes

L'utilisateur peut passer de la création manuelle à la génération automatique, ou inversement, sans perdre les points et paramètres encore applicables au parcours en cours. Le système ne supprime aucune donnée incompatible sans confirmation de l'utilisateur.

#### FR-45 — Changement de type

L'utilisateur peut changer le type du parcours en cours. Le système conserve les données compatibles, demande toute information devenue obligatoire avant le recalcul et exige une confirmation pour toute suppression ou conversion nécessaire. Lors d'un passage de multi-étapes à boucle, les étapes sont conservées comme passages sauf choix contraire de l'utilisateur.

#### FR-46 — Calcul initial A → B

Dès qu'un départ et une destination sont définis en création manuelle, le système calcule un premier parcours sans exiger de paramètre sportif.

#### FR-47 — Résumé persistant

Pendant la préparation, un résumé des métriques essentielles et des avertissements reste accessible sur ordinateur et mobile.

#### FR-48 — Options contextuelles

Le système n'affiche que les options applicables au type de parcours et au mode de création sélectionnés.

#### FR-49 — Confirmation d'export

Après un export réussi, le système confirme le nom du fichier et permet de revenir au parcours ou de préparer un autre parcours.

#### FR-50 — Export des données du compte

L'utilisateur peut récupérer les données de son compte — parcours, demandes de génération, préférences et historique d'exports — dans un ensemble documenté de formats ouverts et lisibles par machine.

## 5. Non-objectifs de la V1

- Navigation GPS pendant la sortie.
- Enregistrement GPS en temps réel.
- Import manuel ou automatique d'activités.
- Difficulté personnalisée « Pour moi ».
- Calcul du niveau actuel, de la charge ou de la régularité du cycliste.
- Recommandation automatique de prochaine sortie et coaching.
- Choix automatique de lieux, étapes ou points d'intérêt par le moteur.
- Météo, trafic temps réel et état réel des routes.
- Applications mobiles natives.
- Export FIT ou TCX.
- Vérification d'adresse e-mail et récupération de mot de passe.
- Fonctions sociales, partage public et classement entre cyclistes.
- Couverture cartographique au-delà de la France.

## 6. Périmètre MVP

### 6.1 Inclus

- Application web adaptative multi-utilisateur avec inscription et connexion de base.
- Accueil de synthèse et bibliothèque de parcours.
- Création et édition manuelles.
- Génération intelligente des trois types de parcours.
- Sept types de séance et options avancées applicables.
- Quatre propositions cibles, diversité configurable, comparaison et explicabilité.
- Difficulté intrinsèque, profil altimétrique et analyse des montées.
- Enregistrement et export GPX.
- Export portable des données du compte.
- Déploiement auto-hébergé complet par Docker Compose.
- Données cartographiques et altimétriques limitées à la France.

## 7. Exigences non fonctionnelles

### NFR-1 — Déploiement reproductible

L'application, la base de données et les services requis de routage, cartographie et altitude doivent pouvoir être lancés localement via Docker Compose.

### NFR-2 — Indépendance

Le fonctionnement nominal ne doit dépendre d'aucun service propriétaire obligatoire. Les fournisseurs de routage, cartographie et altitude doivent rester remplaçables.

### NFR-3 — Performance de génération

Le temps nominal cible est de 15 secondes sur une configuration personnelle de référence à documenter. Aucune génération ne poursuit son calcul au-delà de 60 secondes.

### NFR-4 — Réactivité de l'interface

L'interface doit accuser réception immédiatement des actions longues et rester utilisable pendant la génération ou le recalcul.

### NFR-5 — Sécurité des mots de passe

Les mots de passe ne doivent jamais être stockés ou journalisés en clair et doivent être protégés par un mécanisme de hachage adapté aux mots de passe.

### NFR-6 — Autorisation

Toute lecture ou modification de données métier doit vérifier l'identité du compte propriétaire côté serveur.

### NFR-7 — Portabilité

Les parcours restent exportables dans un format GPX standard sans dépendance à l'application.

### NFR-8 — Explicabilité et audit

Une génération conserve la demande, les versions d'algorithmes et de paramètres, les scores dimensionnels, les avertissements et les diagnostics nécessaires à son explication.

### NFR-9 — Cohérence des calculs

Les métriques structurantes, notamment le D+, sont calculées par une méthode serveur unique et versionnée afin d'éviter les divergences entre clients.

### NFR-10 — Incertitude visible

Une donnée inconnue ne doit jamais être transformée silencieusement en donnée favorable. Son effet sur l'admissibilité, la fiabilité ou les avertissements doit suivre la politique définie dans les FR.

### NFR-11 — Observabilité

Le système journalise au minimum la durée, le statut, le nombre de candidats évalués et validés, les appels et erreurs du fournisseur de routage et la cause des échecs globaux, sans exposer de secrets ni les mots de passe.

### NFR-12 — Responsive

Les fonctions principales de UJ-1 à UJ-3 sont utilisables sur un navigateur moderne d'ordinateur et de téléphone. Les comparaisons détaillées peuvent adapter leur présentation à l'espace disponible sans masquer les avertissements critiques.

### NFR-13 — Référentiel géographique

OpenStreetMap constitue le référentiel géographique canonique de la V1. Les enrichissements éventuels ne doivent pas rendre les données métier captives d'un fournisseur propriétaire.

### NFR-14 — Logique métier déterministe

La validité, les métriques, le score, la conformité et les recommandations d'assouplissement reposent sur une logique déterministe, versionnée et testable. Une génération de texte éventuelle peut expliquer ces résultats mais ne les décide pas.

### NFR-15 — Portabilité complète

Les données propres à l'utilisateur doivent rester récupérables dans des formats ouverts, documentés et exploitables sans l'application.

### NFR-16 — Corpus de référence

Le corpus de calibrage couvre les trois types de parcours, les sept types de séance, les limites de tolérance, les demandes incompatibles, les données cartographiques inconnues et des candidats volontairement médiocres. Pour chaque cas, il conserve les décisions attendues de validité, de conformité et de classement afin de rendre le référentiel d'évaluation reproductible.

## 8. Mesures de réussite

### Mesures principales

- **SM-1 — Validité stricte :** 100 % des propositions retournées respectent les contraintes dures. Exigences associées : FR-15 à FR-19.
- **SM-2 — Résultat exploitable :** pour chaque famille de demandes réalistes du corpus V1, au moins 90 % des cas retournent une proposition valide. Les demandes volontairement impossibles sont exclues de ce taux et évaluées séparément sur la justesse et l'explicabilité de l'échec. Exigences associées : FR-20 à FR-23.
- **SM-3 — Diversité :** toute paire de propositions retournées respecte le seuil configuré ; 40 % par défaut. Exigences associées : FR-14 et FR-24.
- **SM-4 — Explicabilité :** chaque proposition présente score, conformité, rang, fiabilité et écarts réels des dimensions applicables. Exigences associées : FR-26 à FR-32.
- **SM-5 — Budget temporel :** aucune génération ne dépasse 60 secondes et tout dépassement de 15 secondes est visible. Exigences associées : FR-33 à FR-35.
- **SM-6 — Parcours complet :** un utilisateur peut générer, comparer, modifier, enregistrer et exporter un parcours GPX sans intervention technique. Valide UJ-1.
- **SM-7 — Portabilité :** un utilisateur peut récupérer les données de son compte et relire la structure exportée à partir de sa documentation. Exigence associée : FR-50.
- **SM-8 — Reproductibilité de l'évaluation :** le référentiel d'évaluation V1 reproduit les décisions attendues du corpus approuvé pour la validité, la conformité et le classement. Exigences associées : FR-51 et NFR-16.

### Contre-métriques

- **SM-C1 — Remplissage artificiel :** ne pas augmenter le nombre de propositions en relâchant une contrainte dure ou en retournant des quasi-doublons.
- **SM-C2 — Score relatif trompeur :** ne pas attribuer 100 au meilleur candidat uniquement parce qu'il est classé premier.
- **SM-C3 — Fausse certitude :** ne pas améliorer silencieusement l'évaluation lorsque des données cartographiques sont inconnues.
- **SM-C4 — Rapidité au détriment de la validité :** ne pas retourner un tracé provisoire comme résultat validé pour respecter le budget nominal.

## 9. Risques et garde-fous

- **Données cartographiques incomplètes :** distinguer strictement interdit, autorisé et inconnu ; afficher la fiabilité.
- **Explosion combinatoire :** borner le calcul et rendre les résultats partiels acceptables et explicables.
- **Qualité du D+ :** centraliser et versionner la méthode de calcul et les données d'altitude.
- **Diversité artificielle :** mesurer la distance réellement non commune, pas uniquement la forme générale.
- **Mauvaise interprétation du score :** séparer score, conformité, rang et fiabilité dans le modèle comme dans l'interface.
- **Élargissement du périmètre :** maintenir hors V1 le coaching, l'analyse des sorties et les POI générés.

## 10. Questions ouvertes

| ID | Item ouvert | Propriétaire | À résoudre avant |
|---|---|---|---|
| OQ-1 | Composition, cas réels et autorité d'approbation du corpus de calibrage | Produit | Validation du moteur V1 |
| OQ-2 | Configuration matérielle et protocole de mesure des objectifs de 15 et 60 secondes | Architecture | Tests de performance |
| OQ-3 | Fournisseur de routage et source d'altitude pour la France et Docker Compose | Architecture | Choix d'architecture détaillé |
| OQ-6 | Domaines valides des entrées et ambiguïtés restantes des parcours multi-étapes | Spécification moteur et UX | Stories de génération concernées |
| OQ-7 | Règles de concurrence pendant le recalcul et gestion des exports partiels ou échoués | Architecture et UX | Implémentation de l'édition et de l'export |
| OQ-8 | Politique de sauvegarde et de restauration d'une installation locale multi-utilisateur | Architecture | Mise en service de la V1 |
| OQ-9 | Échéance de récupération de mot de passe, suppression de compte et vérification d'e-mail | Produit | Ouverture de l'application au-delà de l'usage interne |

## 11. Dépendances documentaires

- [`spec_route_generator_latest.md`](./spec_route_generator_latest.md) est la spécification canonique du moteur. Elle couvre les allers simples, les parcours multi-étapes, les quatre propositions, les règles temporelles à 15 et 60 secondes et la table normative qui transforme les tags OpenStreetMap en états autorisé, interdit, inconnu ou dernier recours.
- [`addendum.md`](./addendum.md) conserve les mécanismes techniques, exemples de modèles et options de pondération utiles à l'architecture et à la future révision de la spécification.
