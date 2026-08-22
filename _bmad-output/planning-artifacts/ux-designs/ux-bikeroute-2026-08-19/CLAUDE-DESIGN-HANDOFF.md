# Handoff Claude Design — bikeroute V1

## Mission

Conçois une maquette interactive, propre et visuellement aboutie de **bikeroute**, une web app responsive/PWA de préparation de parcours pour cyclistes route loisir ou loisir avancé.

Le prototype doit fonctionner à la souris. Le rendu et la cohérence visuelle priment; des animations légères et utiles sont bienvenues. Il n’est pas demandé de traiter WCAG, navigation clavier ou lecteur d’écran dans cette maquette.

Ne représente pas l’interface comme un logiciel d’ingénierie sportive. La sophistication du routage doit rester derrière la carte. L’expérience doit transmettre **contrôle, simplicité, confiance et envie de partir rouler**.

## Sources de vérité

- `docs/PRD.md`
- `_bmad-output/specs/spec-route-generation-engine/SPEC.md`
- `docs/spec_route_generator_latest.md`, compagnon de la SPEC

En cas de conflit, le PRD et la SPEC gagnent sur ce prompt; les futurs `DESIGN.md` et `EXPERIENCE.md` gagneront sur les maquettes après consolidation.

## Cible et contexte

- Cycliste route loisir ou loisir avancé.
- Usage principal avant la sortie, confort maximal sur ordinateur et tablette.
- Smartphone réellement utilisable pour consulter, ajuster rapidement et exporter.
- L’utilisateur exprime une intention simple: environ 50 km, 800 m de D+, une direction, une destination, deux villages à desservir ou une sortie vallonnée pas trop difficile.
- Promesse mentale: « Je décris la sortie que j’ai envie de faire, et l’outil m’aide à trouver un parcours cohérent. »

## Direction de conception

Crée une identité visuelle propre à bikeroute et cohérente avec le cyclisme sur route, sans reprendre automatiquement les codes d’un tableau de bord d’entraînement. Explore librement la typographie, les couleurs, les formes, la profondeur et la cartographie, mais conserve une hiérarchie calme, lisible et orientée décision.

Utilise la **progressive disclosure**: paramètres essentiels visibles; options avancées accessibles sans alourdir le premier écran. N’expose jamais les ancres techniques du moteur comme des étapes utilisateur.

## Prototype attendu

Produis une expérience reliée, pas une collection de captures. Les actions principales, onglets, panneaux, cartes de résultats, choix de topologie, réordonnancement d’étapes, sélection de proposition, édition et export doivent être manipulables à la souris avec données réalistes simulées.

Crée au minimum les surfaces et états suivants.

### 1. Connexion

- Connexion simple par identifiant et mot de passe.
- Accès à la création de compte.
- Pas de récupération de mot de passe en V1.

### 2. Accueil sobre

- Actions principales: **Créer un parcours**, **Générer un parcours**, consulter les parcours récents.
- Quelques parcours récents avec nom, distance et D+.
- Aucun coaching, recommandation, activité récente agrégée ou bouton « Ajouter une sortie ».

### 3. Création manuelle

- Carte dominante et panneau de préparation.
- Choix du départ et de la destination, ou retour au départ.
- Gestion des étapes utilisateur et points de passage.
- Ajout, déplacement, réordonnancement et suppression à la souris.
- Déplacement d’une portion du tracé.
- Mise à jour immédiate de distance, D+, durée estimée, profil altimétrique et difficulté intrinsèque.
- Dès que A et B sont définis, calculer un premier parcours sans demander de paramètre sportif.
- Pendant un recalcul, conserver le dernier tracé visible avec un indicateur clair **Mise à jour en cours**.

### 4. Génération automatique

Entrée simple initiale, par exemple:

- Départ: Domicile
- Type: Boucle
- Distance: 55 km ± 5
- D+: 800 m ± 100
- Direction: Nord-Est
- Type de sortie: Endurance vallonnée
- Action principale: **Générer**

Les options avancées peuvent inclure qualité routière, nouveauté, difficulté intrinsèque, éloignement maximal et préférences de montée.

Adapter dynamiquement les champs:

- Boucle: départ + distance minimale.
- Aller simple avec destination: A + B; masquer la direction générale propre aux boucles.
- Aller simple sans destination: départ + distance + direction.
- Parcours multi-étapes: départ + étapes utilisateur + arrivée.

Types de séance exacts: **Récupération**, **Endurance**, **Endurance vallonnée**, **Travail de côtes**, **Montée longue**, **Sortie longue**, **Libre**.

### 5. Multi-étapes

- Liste visuellement réordonnable des étapes fournies par l’utilisateur.
- Choix clair entre ordre **fixe** et **optimisable**.
- Départ et arrivée restent identifiables.
- Les ancres techniques restent invisibles.

### 6. Progression de génération

- Accusé de réception immédiat et animation légère.
- Phases formulées en langage utilisateur, sans exposer les codes moteur.
- Un tracé provisoire peut apparaître uniquement s’il est explicitement distingué d’un résultat validé.
- Après 15 secondes: signaler que la recherche prend plus de temps que prévu, tout en continuant.
- À 60 secondes: arrêt définitif.
- Annulation disponible et terminale.

### 7. Résultats et comparaison

Présenter **jusqu’à quatre propositions** valides et réellement différentes. Ne jamais promettre quatre résultats; un à trois résultats peuvent constituer un résultat partiel expliqué.

Chaque proposition doit répondre immédiatement à:

1. Est-ce que cela correspond à ma demande?
2. Est-ce que ce parcours m’intéresse?
3. Pourquoi celui-ci plutôt qu’un autre?

Exemple de contenu:

```text
Proposition #1
87 / 100
Très proche de la demande

54,2 km · 830 m D+ · 2 h 40
Difficile
76 % de routes nouvelles
6 % de revêtement inconnu

Points forts
Distance et D+ très proches de la cible.
Bonne orientation Nord-Est.

[Voir sur la carte]
```

Rendre perceptuellement distincts:

- **Rang**: seulement la position parmi les candidats valides.
- **Score global**: qualité absolue de 0 à 100; le rang 1 ne vaut pas automatiquement 100.
- **Conformité**: **Très proche**, **Proche**, **Compromis modéré**, **Compromis important**, **Demande partiellement satisfaite**.
- **Fiabilité des données**: séparée du score et de la conformité.

Prévoir une comparaison synthétique et cartographique. La comparaison peut changer de forme sur mobile, mais les avertissements critiques restent visibles.

### 8. Transparence des données

Préférer des formulations mesurables:

```text
Revêtement
91 % goudronné connu
9 % inconnu
```

à un badge vague comme « route adaptée ».

- Un revêtement inconnu est admissible, visible et réduit la fiabilité sans pénaliser directement le score.
- Un accès vélo inconnu est excluant et ne doit pas être présenté comme une simple incertitude d’un résultat valide.
- Un grand axe cyclable utilisé en dernier recours est fortement signalé.
- Ne jamais qualifier un parcours de « sûr » ni garantir sa cyclabilité réelle.

### 9. Sélection, édition et export

- Ouvrir une proposition sur la carte et la transformer en parcours éditable.
- Conserver la demande initiale.
- Après modification, recalculer métriques, score, conformité, fiabilité et écarts.
- Montrer le statut **Généré puis modifié**.
- Si une édition manuelle enfreint une règle de génération, avertir et nommer la contrainte, tout en permettant sauvegarde/export sous la responsabilité de l’utilisateur.
- Export GPX avec confirmation du nom de fichier, puis choix entre retour au parcours et création d’un nouveau parcours.

### 10. États partiels et échecs

- **Résultat partiel**: expliquer pourquoi il y a moins de quatre propositions ou quelles préférences ne sont pas satisfaites.
- **Échec**: aucun parcours trompeur; présenter les contraintes bloquantes et des paramètres que l’utilisateur peut assouplir.
- **Annulé**: état final clair, sans apparition ultérieure de résultat.
- Pendant toute opération longue, l’interface reste utilisable.

### 11. Bibliothèque

- Parcours enregistrés appartenant au compte courant.
- Recherche ou repérage simple, métriques essentielles et accès à la carte.
- Enregistrement avec nom, note et tags.

## Responsive

Conçois d’abord une composition desktop/tablette très confortable pour la carte, puis une adaptation smartphone crédible. Le mobile ne doit pas être une réduction illisible du desktop: utilise panneaux repliables, feuilles inférieures ou vues alternées si cela sert le contenu. Ne masque jamais les avertissements critiques ni le résumé persistant des métriques.

## Animations

Animations légères acceptées pour:

- transition entre préparation, progression et résultats;
- apparition et comparaison des tracés;
- ouverture/repli des options avancées;
- réordonnancement d’étapes;
- indicateur de recalcul;
- confirmation d’enregistrement ou d’export.

Éviter les animations décoratives qui ralentissent la lecture de la carte ou donnent une fausse impression de précision.

## Hors périmètre strict V1

Ne pas montrer, même désactivés ou en teaser:

- difficulté personnalisée « Pour moi »;
- activité récente agrégée et ajout/import d’une sortie;
- coaching ou prochaine sortie suggérée;
- navigation GPS et enregistrement temps réel;
- météo, trafic ou état réel des routes;
- choix automatique de POI ou d’étapes;
- fonctions sociales;
- FIT/TCX;
- application mobile native.

## Livrables demandés

1. Une maquette interactive desktop/tablette couvrant le flux complet génération → comparaison → édition → export.
2. Une adaptation smartphone des écrans clés.
3. Les états progression, dépassement 15 s, résultat partiel, échec, annulation et recalcul.
4. Une direction visuelle cohérente avec tokens réutilisables: couleurs, typographie, espacements, rayons, profondeur et composants.
5. Un court relevé des décisions visuelles et comportementales prises, ainsi que des questions non résolues.

Dépose les productions dans:

`_bmad-output/planning-artifacts/ux-designs/ux-bikeroute-2026-08-19/`

Les maquettes ou fichiers de travail peuvent aller dans `imports/`. Ne remplace pas `DESIGN.md`, `EXPERIENCE.md` ni `.memlog.md`; ils seront consolidés après revue des livrables.
