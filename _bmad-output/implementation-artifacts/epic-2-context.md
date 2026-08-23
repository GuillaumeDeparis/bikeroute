# Epic 2 Context: Atelier manuel — création, édition, enregistrement et export

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un utilisateur connecté peut construire un parcours entièrement à la main — boucle, aller simple ou multi-étapes —, l'éditer sur la carte ou via une liste de points, consulter à tout moment ses métriques et son profil altimétrique, l'enregistrer dans sa bibliothèque (Mes parcours) et l'exporter en GPX, sans jamais renseigner de paramètre sportif. Cet epic livre un planificateur manuel complet et autonome, et pose le squelette technique du moteur (hexagonal, ports de routage/altitude, PostGIS, Docker Compose complet) que la génération assistée (Epic 3) et la sélection/réévaluation (Epic 4) réutiliseront.

## Stories

- Story 2.1 : Calcul initial d'un parcours A→B en création manuelle
- Story 2.2 : Choisir et représenter le type de parcours
- Story 2.3 : Éditer un parcours sur la carte
- Story 2.4 : Inverser le sens d'un parcours
- Story 2.5 : Consulter les métriques, le profil altimétrique et un résumé persistant
- Story 2.6 : Enregistrer un parcours dans sa bibliothèque
- Story 2.7 : Exporter un parcours en GPX

## Requirements & Constraints

- Dès qu'un départ et une destination sont posés en mode Manuel, un premier tracé routé est calculé automatiquement, sans paramètre sportif.
- Le parcours est explicitement typé Boucle, Aller simple ou Multi-étapes (jamais supposé boucle par défaut) ; seules les options pertinentes pour ce type sont affichées.
- Ajouter, déplacer, réordonner, retirer des points ou infléchir une portion de tracé déclenche un recalcul ; le dernier tracé valide reste visible pendant ce recalcul.
- Inverser un parcours retourne le sens d'une boucle ou échange départ/arrivée d'un aller simple, avec recalcul des métriques et des montées.
- Un point non rattachable au réseau routier reste identifié « non routé », sans segment direct trompeur à sa place.
- Métriques minimales toujours accessibles : distance, D+, D-, durée estimée, difficulté, profil altimétrique en courbe continue (jamais par paliers), montées significatives, revêtements, catégories routières — via un résumé persistant sur ordinateur et mobile.
- Un revêtement inconnu est signalé en proportion explicite, jamais transformé silencieusement en donnée favorable.
- Enregistrer exige un nom (obligatoire), accepte note et étiquettes facultatives ; un échec conserve les trois champs pour réessayer.
- L'export GPX (tracé, points de passage, altitudes) reste exploitable sans dépendance à l'application ; succès = nom de fichier confirmé, échec = parcours conservé et réessai proposé, jamais d'export partiel présenté comme réussi. Chaque export réussi alimente l'historique des exports du compte (utile à la nouveauté de la future génération assistée).
- OpenStreetMap est le référentiel géographique canonique ; fournisseurs de routage/altitude remplaçables. L'interface reste réactive pendant tout recalcul.

## Technical Decisions

- Établit le squelette hexagonal du moteur (`route_engine/domain,application,adapters,bootstrap`) : domaine indépendant de FastAPI/ORM/client de routage, adaptateurs dépendants des ports uniquement.
- Routage et altitude consommés via deux ports remplaçables (`RoutingProvider`, `ElevationProvider`) ; validation et calculs normatifs restent dans le domaine.
- PostgreSQL/PostGIS est la source de vérité de l'état durable (parcours, géométries SRID 4326) ; aucun cache ne fait autorité métier.
- Le D+ et les autres métriques structurantes utilisent une méthode serveur unique et versionnée (valeur identique sur tous les écrans).
- Toute mutation d'un point ou du tracé produit une géométrie recalculée avant présentation ; seul un tracé entièrement valide est affiché comme parcours courant.
- Conventions transverses : UUIDv7, horodatages UTC ISO-8601, unités canoniques (mètres, secondes, degrés, SRID 4326), erreurs structurées `code/message/details/correlationId`.
- Déploiement : Docker Compose passe à quatre rôles (API, worker, PostgreSQL/PostGIS, Valhalla), images épinglées et migrateur unique avant les writers.

## UX & Interaction Patterns

- Atelier cartographique = surface unique (carte + panneau principal flottant + inspecteur secondaire + bulle basse extensible), Manuel actif par défaut ; inspecteur remplace le panneau sur tablette, bottom sheet plein écran sur téléphone.
- Contextual menu : premier clic sans départ crée le départ et ouvre le choix de topologie ; clics suivants créent un Point de passage sans menu ; sélectionner un point ouvre son menu de rôle.
- Route point : formes/icônes distinctes par rôle (départ/passage/étape/destination) + libellé ; toute entrée après le départ naît Point de passage ; ancres techniques toujours invisibles.
- Reorderable point list : alternative complète à la carte (ajout, modification, suppression, rôle, réordonnancement), synchronisée bidirectionnellement avec elle.
- Expandable metric bubble : compact (distance/D+/durée/avertissement) ↔ déployé (détail + profil continu) ; valeurs stables pendant recalcul, affichées avec « Mise à jour… ».
- Save form : nom, note facultative et étiquettes dans une surface unique ; conserve les champs en cas d'échec, confirme l'enregistrement.
- Ton factuel et actionnable, sans jargon technique ni promesse de sécurité/cyclabilité ; interdit en Manuel : paramètre algorithmique exposé, ancre technique visible, score affiché, tracé qui disparaît pendant un recalcul.
- États à couvrir : aucun départ / départ posé / édition / point non routé / recalcul / changement de topologie avec données incompatibles (confirmation requise) ; Enregistrement et Export GPX (en cours/succès/échec).

## Cross-Story Dependencies

- Story 2.1 pose le socle technique (squelette, ports, PostGIS, Docker Compose 4 rôles) réutilisé par toutes les stories suivantes.
- Story 2.2 (typage) conditionne le comportement de Story 2.3 (édition) et 2.4 (inversion), différent par topologie.
- Story 2.5 (métriques/profil) dépend des recalculs produits par 2.1, 2.3 et 2.4.
- Story 2.6 (enregistrement) et 2.7 (export) supposent un tracé déjà calculé.
- Story 2.7 alimente l'historique des exports, consommé par la nouveauté historique de la génération assistée (Epic 3, FR-25).
- L'éditeur construit ici (carte, panneau, inspecteur, bulle basse) est l'éditeur commun réutilisé tel quel par l'Epic 4 pour la sélection et la réévaluation d'un parcours généré.
