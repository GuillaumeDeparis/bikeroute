---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - docs/PRD.md
  - _bmad-output/specs/spec-route-generation-engine/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/SOLUTION-DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bikeroute-2026-08-19/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bikeroute-2026-08-19/EXPERIENCE.md
---

# bikeroute - Epic Breakdown

## Overview

Ce document découpe en epics et stories exploitables les exigences du PRD (`docs/PRD.md`), de la SPEC du moteur de génération (`SPEC-route-generation-engine`), de l'architecture (`ARCHITECTURE-SPINE.md` + `SOLUTION-DESIGN.md`) et du contrat UX (`DESIGN.md` + `EXPERIENCE.md`).

## Requirements Inventory

### Functional Requirements

**4.1 Comptes et accès**
- FR-1 — Inscription : un visiteur peut créer librement un compte avec un identifiant et un mot de passe.
- FR-2 — Session utilisateur : un utilisateur peut se connecter, conserver une session sécurisée et se déconnecter.
- FR-3 — Isolation des données : demandes, parcours, exports et préférences sont rattachés au compte connecté et inaccessibles aux autres comptes.

**4.2 Accueil sportif**
- FR-4 — Synthèse d'accueil : l'utilisateur connecté voit les informations disponibles, ses parcours récents et les actions principales de création, génération et consultation.
- FR-5 — Continuité multi-écran : l'accueil et la préparation de parcours sont utilisables dans une interface adaptative sur ordinateur et mobile.

**4.3 Création manuelle** (UJ-2)
- FR-6 — Définition du parcours : l'utilisateur peut définir un départ, une arrivée, un retour au départ, des étapes utilisateur et des points de passage.
- FR-7 — Types de parcours : le système représente explicitement un parcours comme boucle, aller simple ou parcours multi-étapes ; il ne suppose jamais qu'un parcours est une boucle.
- FR-8 — Édition cartographique : l'utilisateur peut ajouter, déplacer, réordonner ou retirer des points et déplacer une portion de tracé ; le parcours est recalculé après chaque modification.
- FR-9 — Inversion : l'utilisateur peut inverser le sens d'une boucle ou échanger le départ et l'arrivée d'un aller simple ; le système recalcule métriques et caractéristiques de montées.

**4.4 Définition d'une demande de génération** (UJ-1, UJ-3)
- FR-10 — Entrées minimales par type : boucle (départ + distance cible) ; aller simple avec destination (départ + destination) ; aller simple sans destination (départ + distance cible + direction) ; multi-étapes (départ + étapes utilisateur + arrivée).
- FR-11 — Tolérances et préférences : cible/limite de D+, tolérance de distance, difficulté, direction, préférence de qualité routière, préférence de nouveauté, éloignement maximal, caractéristiques de montée.
- FR-12 — Types de séance : récupération, endurance, endurance vallonnée, travail de côtes, montée longue, sortie longue, libre — modifie l'évaluation des dimensions pertinentes.
- FR-13 — Ordre des étapes : pour un multi-étapes, choix entre ordre imposé et ordre optimisable ; toutes les étapes utilisateur restent obligatoires.
- FR-14 — Diversité configurable : réglage de la distance minimale non commune entre propositions ; part commune calculée par rapport au parcours le plus court ; défaut = au moins 40 % de distance différente (au plus 60 % commune sur le parcours de référence).

**4.5 Validité et politiques routières**
- FR-15 — Accès vélo : exclusion de tout candidat contenant une voie explicitement interdite aux vélos. Une voie d'accès vélo inconnu ou non renseigné reste admissible, avec fiabilité réduite et avertissement — traitement symétrique au revêtement inconnu (FR-17). _(corrigé le 2026-08-21 : la version initiale excluait aussi l'accès inconnu, incohérente avec FR-17 — cf. spec_route_generator_latest.md et addendum.md mis à jour en conséquence)_
- FR-16 — Revêtement vélo de route : exclusion de tout candidat contenant un segment explicitement terre/gravier/revêtement incompatible.
- FR-17 — Revêtement inconnu : un segment au revêtement inconnu reste admissible ; sa longueur/proportion figure dans la fiabilité des données et les avertissements, sans réduire directement le score.
- FR-18 — Grands axes : un grand axe autorisé aux vélos peut être utilisé en dernier recours ; sa longueur est fortement pénalisée dans le score et signalée.
- FR-19 — Prudence sur la sécurité : le produit ne qualifie jamais un parcours de « sûr » ni ne garantit sa cyclabilité réelle sur la seule base des données disponibles.

**4.6 Recherche et génération**
- FR-20 — Couverture des types : le moteur génère boucles, allers simples (avec/sans destination imposée) et multi-étapes avec étapes utilisateur.
- FR-21 — Propositions multiples : le moteur vise 4 propositions valides ; retourne moins de 4 plutôt que des doublons, invalides ou candidats artificiellement dégradés.
- FR-22 — Résultat partiel : 1 à 3 candidats valides → résultat présenté comme partiel avec raisons.
- FR-23 — Échec explicite : 0 candidat valide → aucun parcours retourné, contraintes bloquantes et assouplissements possibles expliqués.
- FR-24 — Diversification : chaque paire de propositions respecte le seuil de distance non commune (FR-14) ; si le seuil empêche 4 résultats, FR-22 s'applique.
- FR-25 — Nouveauté historique : comparaison de chaque candidat aux parcours exportés par l'utilisateur ; les exports récents pénalisent davantage la répétition.

**4.7 Évaluation et explicabilité**
- FR-26 — Score absolu : chaque candidat reçoit un score global absolu 0–100 ; le meilleur candidat trouvé n'obtient jamais 100 par simple normalisation relative.
- FR-27 — Dimensions du score : distance, D+, difficulté intrinsèque, direction, qualité routière, revêtement, caractéristiques des montées, qualité géométrique du parcours (`RouteGeometryQuality`, s'applique à toutes les topologies — pas uniquement aux boucles), nouveauté ; pondérations versionnées variant par type de séance ; dimension non applicable = `N/A`, poids nul redistribué proportionnellement entre dimensions applicables. _(corrigé le 2026-08-21 : la version initiale disait « qualité de boucle », terminologie obsolète — la spec moteur avait déjà renommé la dimension en `RouteGeometryQuality` précisément pour ne plus la lier implicitement au modèle boucle)_
- FR-28 — Conformité indépendante : déterminée à partir des écarts aux contraintes, indépendamment du rang ; niveaux = Très proche, Proche, Compromis modéré, Compromis important, Demande partiellement satisfaite.
- FR-29 — Rang indépendant : classement par score décroissant ; le rang 1 signifie uniquement « meilleur candidat valide trouvé ».
- FR-30 — Fiabilité des données : niveau de fiabilité distinct du score, proportion de revêtement inconnu et autres attributs incomplets pertinents.
- FR-31 — Explication dimensionnelle : par dimension, valeur demandée, tolérance, valeur réelle, écart, score dimensionnel et état de conformité.
- FR-32 — Comparaison : comparaison des propositions sur la carte et dans une vue synthétique utilisant les mêmes dimensions/indicateurs.
- FR-51 — Baseline d'évaluation calibrée : avant V1 prête, calibrer et versionner seuils de conformité, pondérations par type de séance et décroissance de nouveauté sur un corpus de référence approuvé ; vérifier la redistribution des poids des dimensions non applicables.

**4.8 Suivi de la génération**
- FR-33 — Progression visible : animation immédiate et étapes générales de progression ; tracé provisoire éventuel clairement distingué d'un candidat validé.
- FR-34 — Dépassement nominal : après 15 s, le calcul peut continuer mais l'interface signale explicitement le dépassement.
- FR-35 — Arrêt de sécurité : à 60 s, arrêt de la recherche ; retour des candidats déjà validés ou explication de l'échec + paramètres à assouplir.
- FR-36 — Annulation : l'utilisateur peut annuler une génération en cours.
- FR-53 — État terminal unique : une génération atteint exactement un état terminal (annulation ou 60 s = définitif) ; tout résultat reçu ensuite est ignoré ; seuls les candidats entièrement validés avant l'état terminal peuvent être restitués.

**4.9 Sélection, modification et réévaluation**
- FR-37 — Sélection : l'utilisateur peut ouvrir une proposition sur la carte, la sélectionner et la transformer en parcours éditable.
- FR-38 — Conservation de la demande : la demande initiale est conservée avec le parcours généré pour permettre une réévaluation ultérieure.
- FR-39 — Réévaluation après modification : après toute modification du tracé, recalcul des métriques, score, conformité, fiabilité et écarts ; le parcours est identifié « généré puis modifié ».
- FR-52 — Liberté après édition manuelle : si une modification manuelle invaliderait un candidat généré, recalcul de l'évaluation + avertissement explicite nommant la contrainte, mais l'utilisateur peut poursuivre l'édition, enregistrer et exporter sous sa responsabilité.

**4.10 Analyse, enregistrement et export**
- FR-40 — Métriques du parcours : au minimum distance, D+, D-, durée estimée, difficulté intrinsèque, profil altimétrique, montées significatives, revêtements, catégories routières.
- FR-41 — Enregistrement : nommer, annoter, étiqueter et enregistrer un parcours dans sa bibliothèque.
- FR-42 — Export GPX : export au format GPX avec tracé, points de passage et altitudes.
- FR-43 — Historique des exports : enregistrement des exports nécessaires au calcul de nouveauté pour le compte connecté.

**4.11 Continuité de préparation et portabilité**
- FR-44 — Continuité entre modes : passage manuel ↔ génération automatique sans perte des points/paramètres encore applicables ; aucune suppression de donnée incompatible sans confirmation.
- FR-45 — Changement de type : conservation des données compatibles, information obligatoire demandée avant recalcul, confirmation exigée pour toute suppression/conversion ; multi-étapes → boucle conserve les étapes comme passages sauf choix contraire.
- FR-46 — Calcul initial A → B : dès départ + destination définis en création manuelle, calcul d'un premier parcours sans paramètre sportif.
- FR-47 — Résumé persistant : résumé des métriques essentielles et avertissements accessible en permanence sur ordinateur et mobile.
- FR-48 — Options contextuelles : n'affiche que les options applicables au type de parcours et au mode de création sélectionnés.
- FR-49 — Confirmation d'export : après export réussi, confirmation du nom de fichier + retour au parcours ou nouvelle préparation.
- FR-50 — Export des données du compte : récupération des données du compte (parcours, demandes, préférences, historique d'exports) dans un ensemble documenté de formats ouverts et lisibles par machine.

### NonFunctional Requirements

- NFR-1 — Déploiement reproductible : application, base de données et services de routage/cartographie/altitude lançables localement via Docker Compose.
- NFR-2 — Indépendance : aucun service propriétaire obligatoire ; fournisseurs de routage/cartographie/altitude remplaçables.
- NFR-3 — Performance de génération : temps nominal cible 15 s sur configuration personnelle de référence ; aucune génération au-delà de 60 s.
- NFR-4 — Réactivité de l'interface : accusé de réception immédiat des actions longues, interface utilisable pendant génération/recalcul.
- NFR-5 — Sécurité des mots de passe : jamais stockés/journalisés en clair, hachage adapté aux mots de passe.
- NFR-6 — Autorisation : toute lecture/modification de données métier vérifie l'identité du compte propriétaire côté serveur.
- NFR-7 — Portabilité : parcours exportables en GPX standard sans dépendance à l'application.
- NFR-8 — Explicabilité et audit : conservation de la demande, versions d'algorithmes/paramètres, scores dimensionnels, avertissements, diagnostics.
- NFR-9 — Cohérence des calculs : métriques structurantes (D+) calculées par une méthode serveur unique et versionnée.
- NFR-10 — Incertitude visible : une donnée inconnue n'est jamais transformée silencieusement en donnée favorable.
- NFR-11 — Observabilité : journalisation minimale de durée, statut, candidats évalués/validés, appels/erreurs du fournisseur de routage, cause des échecs globaux, sans secrets ni mots de passe.
- NFR-12 — Responsive : UJ-1 à UJ-3 utilisables sur navigateur moderne ordinateur/téléphone ; comparaisons détaillées adaptables sans masquer les avertissements critiques.
- NFR-13 — Référentiel géographique : OpenStreetMap = référentiel canonique V1 ; enrichissements ne rendent pas les données captives d'un fournisseur propriétaire.
- NFR-14 — Logique métier déterministe : validité, métriques, score, conformité, assouplissements reposent sur une logique déterministe, versionnée, testable ; toute génération de texte explique sans décider.
- NFR-15 — Portabilité complète : données utilisateur récupérables dans des formats ouverts, documentés, exploitables sans l'application.
- NFR-16 — Corpus de référence : couvre les 3 types de parcours, les 7 types de séance, les limites de tolérance, les demandes incompatibles, les données inconnues, des candidats volontairement médiocres, avec décisions attendues de validité/conformité/classement.

### Additional Requirements

**Stack et squelette imposés (impacte Epic 1 / Story 1) :**
- Stack V1 : Python 3.14.7, FastAPI 0.141.1, PostgreSQL 18.4, PostGIS 3.6.4, Valhalla 3.8.3, Docker Compose (spécification courante, sans champ `version`). `[ASSUMPTION]` à valider mais à utiliser comme socle.
- Squelette structurel à scaffolder : `route_engine/domain/`, `route_engine/application/`, `route_engine/adapters/inbound/`, `route_engine/adapters/outbound/`, `route_engine/bootstrap/` ; `tests/unit/`, `tests/contract/`, `tests/integration/`, `tests/corpus/` ; `deploy/compose/`.

**Invariants d'architecture à respecter dans toutes les stories du moteur :**
- AD-1 — Cœur indépendant des technologies : le domaine et ses tests n'importent ni FastAPI, ni ORM, ni client Valhalla ; adaptateurs → dépendent des ports et du noyau, jamais l'inverse.
- AD-2 — Pipeline normatif à portes irréversibles : `normaliser → planifier → router → enrichir → valider → mesurer/évaluer → optimiser → diversifier → sélectionner/expliquer` ; toute mutation crée une nouvelle révision et réinjecte avant `router` ; seuls des artefacts calculés sur une géométrie entièrement validée sont sélectionnables.
- AD-3 — PostgreSQL/PostGIS propriétaire de l'état durable : générations, candidats, géométries SRID 4326, bundles de politiques, diagnostics, transitions ; aucun cache/fournisseur n'est source de vérité métier.
- AD-4 — File transactionnelle PostgreSQL `[ASSUMPTION]` : création génération+job en transaction ; claim atomique avec `leaseEpoch` monotone ; écritures/prolongations exigent l'epoch courant + identité idempotente `generationId/attempt/candidate`.
- AD-5 — Terminalité atomique : compare-and-set autorisant exactement un passage non-terminal → `COMPLETED|PARTIAL|FAILED|CANCELLED` ; toute écriture après état terminal échoue.
- AD-6 — Deadline propagée : `acceptedAt`/`hardDeadlineAt` UTC immuables fixés au commit ; budget monotone local jamais réinitialisé ; franchissement de 15 s persisté/publié une fois ; réponses après 60 s rejetées.
- AD-7 — Politiques immuables par génération : bundle immuable (versions normatives, retries/backoff, digests tuiles OSM/costing/altitude) résolu une seule fois au démarrage.
- AD-8 — Fournisseurs remplaçables et non normatifs : `RoutingProvider` et `ElevationProvider` = ports distincts, contrats versionnés ; Valhalla est l'adaptateur initial mais validation/score/similarité/explications restent dans le domaine.
- AD-9 — Mutations par commandes, diffusion après commit : mutation + progression + événement outbox en une transaction ; livraison au-moins-une-fois, `eventId` stable, séquence monotone par génération, consommateurs idempotents ; progression coalesçable mais jamais la terminalité.
- AD-10 — Audit reproductible et minimisation des journaux : seed, requêtes, versions, fournisseur, résultats, rejets agrégés, durées conservés ; logs structurés sans coordonnées brutes ni payloads complets par défaut.
- AD-11 — Unités et identifiants canoniques : UUIDv7 pour nouveaux identifiants externes, UTC ISO-8601, mètres, secondes, degrés, SRID 4326 ; conversions uniquement aux frontières.
- AD-13 — Identité, propriété et historique : identité issue du principal authentifié (jamais du payload) ; création/lecture/annulation/historique autorisés côté serveur par propriétaire ; `HistoryPort` fournit un snapshot figé excluant la génération courante.
- AD-14 — Erreurs et tentatives fournisseur déterministes : taxonomie d'erreurs, retries, backoff déterministe, budget minimal et effet sur candidat/génération fixés dans le bundle ; tentative d'appel ≠ tentative de job, toutes deux auditées.

**Déploiement (impacte les stories d'infrastructure) :**
- AD-12 — Topologie V1 : Docker Compose avec 4 rôles (API, worker, PostgreSQL/PostGIS, Valhalla), images épinglées par digest, dépendances lockées, migrateur unique avant les writers, healthchecks (API HTTP, base/schéma/extensions, réclamation d'un job, fournisseur).

**Conventions transverses (à vérifier dans chaque story d'implémentation) :**
- Nommage : types métier au singulier, commandes à l'impératif, événements au passé, ports suffixés `Port`, adaptateurs suffixés par technologie.
- Contrats : DTO d'entrée/sortie versionnés, enums inconnus rejetés, erreurs applicatives `code/message/details/correlationId`.
- État : seul le dépôt de génération effectue les compare-and-set ; aucun adaptateur ne modifie directement une entité.
- Déterminisme : tri total explicite pour tout classement ; seed persisté ; horloge/UUID/fournisseurs injectés.
- Configuration : paramètres normatifs en bundles versionnés ; secrets/paramètres opérationnels en variables d'environnement.
- Tests : tests de domaine sans infrastructure ; tests de contrat par port ; tests d'intégration PostGIS/Valhalla ; corpus normatif en non-régression.

**Éléments explicitement différés (ne pas construire en V1, ne pas fermer la porte) :**
AD-15 (durées de rétention géodonnées à fixer avant mise en service), remplacement de la file PostgreSQL par un broker, matériel/protocole exact des budgets 15/60 s, autorité/composition du corpus de calibrage, sauvegarde/restauration de l'installation, compatibilité expand/contract API-worker, règles UX de concurrence édition/export (hors moteur), réplication/HA, navigation temps réel/GPS/POI générés/coaching (hors V1, nouvelle SPEC requise).

### UX Design Requirements

**Fondations visuelles**
- UX-DR1 — Système de tokens : implémenter la palette complète (canvas, map-land, surface, surface-subtle, ink, ink-secondary, ink-muted, border, accent, accent-interactive, on-accent, focus-ring, route-secondary, positive, info-surface, warning, warning-surface, danger, danger-surface, scrim), la typographie (title/heading/body/label/metric/score/caption), les rayons (sm/md/lg/xl/full) et l'échelle d'espacement (4/8/12/16/20/24/32 + panel-gap/map-inset/mobile-margin) comme tokens réutilisables ; libellés français externalisés, tolérants aux traductions plus longues.

**Composants (contrat visuel DESIGN.md + règles comportementales EXPERIENCE.md)**
- UX-DR2 — App header : marque compacte vers Accueil, ouvre Account menu, aucune métrique sportive.
- UX-DR3 — Primary button : une action dominante par contexte (Générer/Choisir/Enregistrer/Exporter), désactivé tant que les entrées indispensables manquent.
- UX-DR4 — Secondary button : actions réversibles/complémentaires (Annuler/Comparer/Voir les détails), ne change jamais implicitement le parcours choisi.
- UX-DR5 — Mode switch Manuel/Assisté : Manuel par défaut ; changement conserve les données compatibles et demande confirmation avant suppression/conversion.
- UX-DR6 — Primary panel : contexte de construction permanent, repliable ; sa fermeture révèle Expandable metric bubble.
- UX-DR7 — Secondary inspector : un seul ouvert à la fois (Options/Profil/Analyse/Montées) ; un réglage recalcule sans masquer le panneau principal.
- UX-DR8 — Bottom sheet (téléphone) : états compacte/intermédiaire/développée ; Options remplace son contenu et fournit un retour au parcours.
- UX-DR9 — Expandable metric bubble : compact (distance, D+, durée, avertissement, chevron) ↔ déployé (détail des métriques + profil altimétrique en courbe continue, jamais paliers) ; toggle par clic/toucher ; valeurs stables pendant recalcul avec « Mise à jour… ».
- UX-DR10 — Contextual menu : 1er clic sans départ crée le départ + ouvre le choix de topologie ; clics suivants créent un Point de passage sans menu ; sélectionner un point ouvre son menu (rôles selon topologie : Point de passage/Étape utilisateur/Destination).
- UX-DR11 — Route point : formes/icônes distinctes par rôle (départ/passage/étape/destination) + libellé ; ajouter/sélectionner/déplacer/supprimer/réordonner ; toute entrée après le départ naît Point de passage ; ancres techniques toujours invisibles.
- UX-DR12 — Compass control : indique/rétablit l'orientation sans masquer le tracé.
- UX-DR13 — Proposal card : jusqu'à 4 ; #1 a le focus initial mais jamais l'acceptation implicite ; survol/clic met le tracé au premier plan ; « Voir les détails » développe ; seul « Choisir ce parcours » engage ; aucun traitement « recommandé ».
- UX-DR14 — Status banner : accuse réception des opérations longues ; présente progression/résultat partiel/inconnues/erreurs/assouplissements avec texte actionnable conforme au Voice & Tone (UX-DR26).
- UX-DR15 — Comparison modal + Comparison table : modale centrée, fermeture restaure focus/carte, aucun choix implicite à l'ouverture ; mêmes dimensions/ordre par proposition ; téléphone = blocs/colonnes défilantes sans masquer les avertissements ; rafraîchissement explicite si un recalcul invalide le tableau.
- UX-DR16 — Account menu : Mes parcours / Exporter mes données / Déconnexion uniquement, aucun réglage général en V1.
- UX-DR17 — Place search : recherche texte/adresse pour départ/destination/point ; résultats superposés sans masquer le point visé ; états chargement/saisie vide/aucun résultat/erreur distingués (« Aucun lieu trouvé » sans créer de point, Réessayer conserve la requête) ; synchronisation bidirectionnelle avec Reorderable point list et la carte.
- UX-DR18 — Input field : label persistant, validation locale au blur et à la soumission, erreur liée au champ sans saut de largeur, valeur conservée.
- UX-DR19 — Select control : n'affiche que les valeurs applicables (topologie/séance/revêtement) ; valeur incompatible → confirmation de conservation/conversion.
- UX-DR20 — Checkbox/toggle : état visible par forme + texte + marque (jamais couleur seule) ; active une préférence sans l'appliquer rétroactivement en silence.
- UX-DR21 — Reorderable point list : alternative complète à la carte (ajout via Place search, modification, suppression, qualification de rôle, réordonnancement) ; synchronisation bidirectionnelle avec Route point ; sert d'alternative accessible aux gestes fins sur carte.
- UX-DR22 — Save form : nom + note facultative + étiquettes dans une surface unique ; conserve les trois champs en cas d'échec ; confirme le parcours enregistré.
- UX-DR23 — Skeleton : réserve la structure attendue (Accueil, Mes parcours, carte) sans simuler de contenu réel ; disparaît sans déplacer les actions déjà utilisables.

**Architecture d'information et responsive**
- UX-DR24 — Surfaces spine-only (contrat textuel suffisant, pas de maquette requise) : Inscription, Connexion, Accueil, Mes parcours, Export GPX, Exporter mes données, Menu utilisateur — cf. table « Surfaces produit » d'EXPERIENCE.md pour le contenu attendu de chacune.
- UX-DR25 — Atelier cartographique : surface unique (Manuel + Assisté + édition + analyse + enregistrement + export) avec régions Carte / Panneau principal / Inspecteur secondaire / Bulle basse extensible ; responsive — desktop large (panneau flottant + inspecteur côte à côte + bulle basse + comparaison centrée), tablette (inspecteur remplace le panneau avec retour), téléphone (carte plein écran + bottom sheet + cartes de proposition en défilement horizontal), PWA installable avec connexion obligatoire pour carte dynamique/routage/recalcul/enregistrement.

**Contenu et comportement transverses**
- UX-DR26 — Voix et ton : tous les textes système suivent les formulations factuelles/actionnables d'EXPERIENCE.md (ex. « 3 propositions disponibles… » plutôt que « Génération incomplète : erreur de diversification » ; jamais « Meilleur parcours » ni « parcours sûr »).
- UX-DR27 — États à couvrir explicitement par surface (voir table complète « State Patterns » d'EXPERIENCE.md) : Accueil (chargement/aucun parcours/erreur) ; réseau hors-ligne ; carte (chargement/erreur tuiles) ; Place search (chargement/vide/aucun résultat/erreur) ; Atelier (aucun départ/départ posé/édition/point non routé/recalcul/segment hors politique/changement de topologie avec données incompatibles) ; formulaire Assisté (requis manquant/valeur invalide/combinaison incohérente) ; génération (0–15 s/15–60 s/annulation/60 s) ; résultats (quatre/un à trois/zéro/donnée inconnue) ; comparaison (fermeture/données obsolètes) ; Inscription/Connexion (vide/validation/erreur/session expirée) ; Mes parcours (chargement/vide/erreur) ; Account menu (session expirée) ; Enregistrement (en cours/succès/échec) ; Export GPX (en cours/succès/échec) ; Exporter mes données (en cours/prêt/échec).
- UX-DR28 — Patterns interdits (Banned) : aucun paramètre algorithmique exposé, aucune ancre technique visible, aucun score affiché en Manuel, aucun choix implicite de #1, jamais plus d'un panneau secondaire ouvert, le tracé ne disparaît jamais pendant un recalcul, aucune promesse de sécurité/cyclabilité.
- UX-DR29 — Socle d'accessibilité pré-production (non requis pour valider le prototype souris, mais requis avant mise en production — à tracker sur des stories dédiées) : alternative gestes fins via Reorderable point list + Place search (UX-DR17/21) ; hiérarchie d'annonces asynchrones limitée (démarrage/recalcul non intrusif, palier 15 s, stabilisation des valeurs, une annonce prioritaire unique pour l'état terminal/échec/annulation) ; préférence de mouvement réduit supprimant transitions/recadrages non indispensables ; gestion de focus pour Comparison modal et Contextual menu (titre/nom, ordre logique, fermeture explicite, retour au déclencheur) ; nom programmatique stable par contrôle iconique + texte/tooltip pour icônes ambiguës ; textes externalisés/zoom/reflow sans casser l'ordre logique ni masquer une action ; cible tactile minimale et espacements à définir avant production (point ouvert, cf. Questions ouvertes).

### FR Coverage Map

FR-1: Epic 1 - Inscription
FR-2: Epic 1 - Session utilisateur
FR-3: Epic 1 - Isolation des données
FR-4: Epic 1 - Synthèse d'accueil
FR-5: Epic 1 - Continuité multi-écran
FR-6: Epic 2 - Définition du parcours (manuel)
FR-7: Epic 2 - Types de parcours
FR-8: Epic 2 - Édition cartographique
FR-9: Epic 2 - Inversion
FR-40: Epic 2 - Métriques du parcours
FR-41: Epic 2 - Enregistrement
FR-42: Epic 2 - Export GPX
FR-43: Epic 2 - Historique des exports
FR-46: Epic 2 - Calcul initial A → B
FR-47: Epic 2 - Résumé persistant
FR-48: Epic 2 - Options contextuelles
FR-49: Epic 2 - Confirmation d'export
FR-10: Epic 3 - Entrées minimales par type
FR-11: Epic 3 - Tolérances et préférences
FR-12: Epic 3 - Types de séance
FR-13: Epic 3 - Ordre des étapes
FR-14: Epic 3 - Diversité configurable
FR-15: Epic 3 - Accès vélo
FR-16: Epic 3 - Revêtement vélo de route
FR-17: Epic 3 - Revêtement inconnu
FR-18: Epic 3 - Grands axes
FR-19: Epic 3 - Prudence sur la sécurité
FR-20: Epic 3 - Couverture des types
FR-21: Epic 3 - Propositions multiples
FR-22: Epic 3 - Résultat partiel
FR-23: Epic 3 - Échec explicite
FR-24: Epic 3 - Diversification
FR-25: Epic 3 - Nouveauté historique
FR-26: Epic 3 - Score absolu
FR-27: Epic 3 - Dimensions du score
FR-28: Epic 3 - Conformité indépendante
FR-29: Epic 3 - Rang indépendant
FR-30: Epic 3 - Fiabilité des données
FR-31: Epic 3 - Explication dimensionnelle
FR-32: Epic 3 - Comparaison
FR-33: Epic 3 - Progression visible
FR-34: Epic 3 - Dépassement nominal
FR-35: Epic 3 - Arrêt de sécurité
FR-36: Epic 3 - Annulation
FR-51: Epic 3 - Baseline d'évaluation calibrée
FR-53: Epic 3 - État terminal unique
FR-37: Epic 4 - Sélection
FR-38: Epic 4 - Conservation de la demande
FR-39: Epic 4 - Réévaluation après modification
FR-52: Epic 4 - Liberté après édition manuelle
FR-44: Epic 4 - Continuité entre modes
FR-45: Epic 4 - Changement de type
FR-50: Epic 5 - Export des données du compte

**NFR par epic (indicatif) :** Epic 1 → NFR-5, NFR-6, NFR-12 · Epic 2 → NFR-1, NFR-2, NFR-4, NFR-7, NFR-9, NFR-10, NFR-13 · Epic 3 → NFR-3, NFR-8, NFR-11, NFR-14, NFR-16 · Epic 4 → (consomme NFR-10/NFR-14 déjà en place) · Epic 5 → NFR-15.

## Epic List

### Epic 1: Comptes, connexion et accueil
Un visiteur peut créer un compte, se connecter/déconnecter en toute sécurité, et un utilisateur connecté arrive sur un accueil de synthèse (même vide) dans une interface adaptative ordinateur/mobile. Pose le socle Docker Compose minimal (API + PostgreSQL), l'authentification, l'isolation des données par compte et la coquille responsive (header, menu compte).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Implementation Notes:** NFR-5 (hachage mots de passe), NFR-6 (autorisation serveur), AD-13 (identité issue du principal authentifié). UX : Inscription/Connexion/Accueil/Menu utilisateur en spine-only (UX-DR24), App header (UX-DR2), Account menu (UX-DR16 — les entrées Mes parcours/Exporter mes données peuvent rester vides tant que Epic 2/5 ne sont pas livrés), Skeleton (UX-DR23).

### Epic 2: Atelier manuel — création, édition, enregistrement et export
Un utilisateur peut construire un parcours entièrement à la main (boucle, aller simple, multi-étapes), l'éditer sur la carte ou via la liste de points, consulter ses métriques et son profil, l'enregistrer dans sa bibliothèque (Mes parcours) et l'exporter en GPX — sans jamais renseigner de paramètre sportif. Livre un planificateur de parcours manuel complet et autonome (UJ-2).
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-40, FR-41, FR-42, FR-43, FR-46, FR-47, FR-48, FR-49
**Implementation Notes:** Introduit le squelette hexagonal (`route_engine/domain,application,adapters,bootstrap`), les ports `RoutingProvider`/`ElevationProvider` (AD-8), PostGIS comme source d'état (AD-3), calcul D+ serveur unique et versionné (NFR-9), Docker Compose 4 rôles (AD-12). UX : Atelier cartographique en mode Manuel (UX-DR25), Route point/Contextual menu/Reorderable point list/Expandable metric bubble/Save form (UX-DR9 à UX-DR22 pertinents), Voice & Tone (UX-DR26), états Atelier de EXPERIENCE.md (UX-DR27, sous-ensemble manuel).

### Epic 3: Génération assistée et résultats explicables
Un utilisateur peut définir une demande de génération (boucle, aller simple, multi-étapes) avec contraintes et préférences, lancer une recherche qui respecte strictement les politiques routières, suit une progression visible et des limites temporelles (15 s/60 s), puis explorer jusqu'à 4 propositions diversifiées, chacune avec score absolu, conformité, rang, fiabilité et explication dimensionnelle, comparables entre elles. Livre la proposition de valeur centrale du produit (UJ-1, cœur de UJ-3) en lecture/exploration — la sélection et l'édition sont couvertes par l'Epic 4.
**FRs covered:** FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-51, FR-53
**Implementation Notes:** Épic la plus dense — pipeline complet AD-2 (normaliser→...→sélectionner/expliquer), AD-4 (file transactionnelle + `leaseEpoch`), AD-5 (terminalité atomique CAS), AD-6 (deadline propagée), AD-7 (bundles de politiques immuables), AD-9 (outbox), AD-10 (audit), AD-14 (erreurs/retries déterministes), NFR-16 (corpus de calibrage). UX : Résultats assistés (Proposal card UX-DR13, Status banner UX-DR14, Comparison modal/table UX-DR15), formulaire Assisté et ses états (UX-DR27).
**⚠️ Jalon technique interne, pas une release démontrable seule :** Epic 3 est standalone au sens dépendance (aucun epic suivant requis pour fonctionner), mais le contrat UX (Key Flow UJ-1 d'EXPERIENCE.md) ne s'arrête jamais à « consulter des propositions » — le parcours utilisateur n'a de sens que jusqu'à l'export (Epic 4). Ne pas démontrer ou shipper Epic 3 isolément comme un incrément utilisateur ; le regrouper avec Epic 4 pour toute démo ou release visible.

### Epic 4: Sélection, réévaluation et continuité entre modes
Un utilisateur peut sélectionner explicitement une proposition générée pour la transformer en parcours éditable dans l'atelier commun (Epic 2), la modifier avec recalcul automatique du score/conformité/fiabilité, continuer à éditer même si une modification enfreint une politique routière (sous responsabilité, avec avertissement), et passer librement entre création manuelle et génération assistée sans perdre les données compatibles. Complète UJ-1 de bout en bout et fiabilise UJ-3.
**FRs covered:** FR-37, FR-38, FR-39, FR-52, FR-44, FR-45
**Implementation Notes:** Dépend de l'atelier (Epic 2) et du moteur de génération (Epic 3) ; consomme le moteur de politiques/validation construit en Epic 3 pour détecter un segment « hors politique » après édition manuelle (FR-52). AD-2 (nouvelle révision à chaque mutation), AD-9 (mutation par commande). UX : convergence Résultats → Atelier, bannière d'avertissement post-édition, confirmation de conservation/conversion au changement de type/mode (UX-DR5, UX-DR19).

### Epic 5: Export et portabilité des données du compte
Un utilisateur peut récupérer l'ensemble des données de son compte — parcours, demandes de génération, préférences et historique d'exports — dans un jeu documenté de formats ouverts et lisibles par machine, depuis le menu utilisateur.
**FRs covered:** FR-50
**Implementation Notes:** NFR-15 (portabilité complète). Dépend des données produites par Epic 1 à 4 pour avoir un contenu réel à exporter. UX : surface « Exporter mes données » (spine-only, UX-DR24), états en cours/prêt/échec (UX-DR27).

---

## Epic 1: Comptes, connexion et accueil

Un visiteur peut créer un compte, se connecter/déconnecter en toute sécurité, et un utilisateur connecté arrive sur un accueil de synthèse (même vide) dans une interface adaptative ordinateur/mobile.

### Story 1.1: Inscription d'un nouveau compte

As a visiteur,
I want créer un compte avec un identifiant et un mot de passe,
So that je peux accéder à mes propres parcours et demandes de génération.

**Acceptance Criteria:**

**Given** je suis un visiteur non connecté sur la page Inscription
**When** je saisis un identifiant disponible et un mot de passe valide puis je valide
**Then** un compte est créé et je suis connecté avec une session sécurisée
**And** mon mot de passe est stocké haché, jamais en clair (NFR-5)

**Given** je choisis un identifiant déjà utilisé
**When** je valide le formulaire
**Then** une erreur liée au champ identifiant s'affiche, ma saisie est conservée hors mot de passe

**Given** un champ requis est vide ou le mot de passe est trop faible
**When** je valide le formulaire
**Then** une validation locale au blur et à la soumission signale l'erreur liée au champ (UX-DR18)

_Réfs : FR-1, NFR-5, UX-DR18/24/27_

### Story 1.2: Connexion et session utilisateur

As a utilisateur inscrit,
I want me connecter et me déconnecter en gardant une session sécurisée,
So that je retrouve mon espace personnel en sécurité et je peux le quitter proprement.

**Acceptance Criteria:**

**Given** j'ai un compte valide
**When** je saisis mes identifiants corrects sur Connexion
**Then** une session sécurisée s'ouvre et je suis redirigé vers l'Accueil

**Given** je saisis un identifiant ou mot de passe incorrect
**When** je valide
**Then** un message d'erreur actionnable s'affiche sans révéler lequel des deux champs est fautif, identifiant conservé (pas le mot de passe)

**Given** ma session a expiré pendant l'usage de l'application
**When** j'effectue une action nécessitant une session active
**Then** je suis invité à me reconnecter sans perdre l'état local visible

**Given** je suis connecté
**When** je choisis Déconnexion dans le Account menu
**Then** ma session est fermée et je suis ramené à Connexion

_Réfs : FR-2, NFR-6, UX-DR16/18/27_

### Story 1.3: Isolation des données par compte

As a utilisateur connecté,
I want que mes données (demandes, parcours, exports, préférences) ne soient accessibles qu'à moi,
So that je peux faire confiance à l'application pour la confidentialité de mes préparations.

**Acceptance Criteria:**

**Given** je suis authentifié
**When** j'appelle une opération de lecture ou d'écriture sur une ressource métier
**Then** l'identité utilisée est celle du principal authentifié côté serveur, jamais une valeur fournie par le client (AD-13)

**Given** une ressource métier appartient à un autre compte
**When** je tente d'y accéder avec mon compte
**Then** l'accès est refusé côté serveur, quel que soit ce qu'affiche l'interface

**Given** je ne suis pas authentifié
**When** je tente d'accéder à une ressource métier protégée
**Then** l'accès est refusé et je suis invité à me connecter

_Réfs : FR-3, NFR-6, AD-13 — établit le mécanisme d'autorisation que les Epics 2 à 5 réutiliseront pour leurs propres ressources (routes, générations, exports)._

### Story 1.4: Accueil de synthèse et interface adaptative

As a utilisateur connecté,
I want voir un accueil de synthèse utilisable sur ordinateur comme sur mobile,
So that je comprends rapidement mon état et j'accède aux actions principales, où que je sois.

**Acceptance Criteria:**

**Given** je viens de me connecter sans parcours enregistré
**When** j'arrive sur l'Accueil
**Then** je vois un état "aucun parcours" avec un CTA vers l'Atelier, sans contenu hors V1 (agrégats, recommandations)

**Given** l'accueil charge
**When** la page s'affiche
**Then** un Skeleton sobre réserve la structure sans simuler de contenu réel (UX-DR23)

**Given** je consulte l'Accueil
**When** je change de taille d'écran (ordinateur ↔ mobile)
**Then** l'interface reste utilisable et adaptative sans perte de fonction (NFR-12)

**Given** je suis sur l'Accueil
**When** j'ouvre le menu utilisateur
**Then** j'accède à Mes parcours, Exporter mes données et Déconnexion (les deux premiers pouvant rester vides tant qu'Epic 2/5 ne sont pas livrés)

_Réfs : FR-4, FR-5 (portion Accueil), NFR-12, UX-DR2/16/23/24_

---

## Epic 2: Atelier manuel — création, édition, enregistrement et export

Un utilisateur peut construire un parcours entièrement à la main (boucle, aller simple, multi-étapes), l'éditer sur la carte ou via la liste de points, consulter ses métriques et son profil, l'enregistrer dans sa bibliothèque et l'exporter en GPX — sans jamais renseigner de paramètre sportif. Livre un planificateur de parcours manuel complet et autonome (UJ-2).

### Story 2.1: Calcul initial d'un parcours A→B en création manuelle

As a utilisateur connecté,
I want que le système calcule automatiquement un premier parcours dès que je place un départ et une destination,
So that j'obtiens immédiatement un tracé exploitable sans renseigner de paramètre sportif.

**Acceptance Criteria:**

**Given** l'Atelier en mode Manuel sans point posé
**When** je place un point (recherche ou clic carte)
**Then** il devient le départ et le Contextual menu demande la topologie

**Given** j'ai un départ
**When** je place une destination
**Then** un premier tracé routé est calculé automatiquement, sans paramètre sportif

**Given** le tracé est calculé
**When** je consulte le résultat
**Then** OpenStreetMap est le référentiel géographique canonique et le fournisseur de routage/altitude reste remplaçable derrière ses ports (NFR-2, NFR-13)

**Given** un point ne peut être rattaché au réseau
**When** j'observe le retour du système
**Then** il reste identifié "non routé", le Status banner propose de le déplacer/modifier/supprimer — aucun segment direct trompeur

_Réfs : FR-46, FR-6, NFR-1/2/13, UX-DR10/11/17_
_Notes d'implémentation : établit le squelette hexagonal (domain/application/adapters/bootstrap), les ports RoutingProvider/ElevationProvider (AD-8), PostGIS SRID 4326 comme état durable (AD-3), Docker Compose 4 rôles (AD-12) — socle technique de tout l'Atelier._

### Story 2.2: Choisir et représenter le type de parcours

As a utilisateur connecté,
I want définir mon parcours comme une boucle, un aller simple ou un parcours multi-étapes,
So that le système sait exactement ce que je veux construire et ne me montre que les actions pertinentes.

**Acceptance Criteria:**

**Given** je viens de poser mon départ
**When** le Contextual menu s'ouvre
**Then** je choisis explicitement Boucle, Aller simple ou Multi-étapes — le système ne suppose jamais qu'un parcours est une boucle

**Given** j'ai choisi Boucle
**When** je consulte le parcours
**Then** le départ est aussi l'arrivée logique, aucune destination distincte n'est demandée

**Given** j'ai choisi Multi-étapes
**When** j'ajoute des points suivants
**Then** chaque lieu requis peut être qualifié explicitement Étape utilisateur ou Destination, distinct des Points de passage

**Given** un type de parcours est sélectionné
**When** je consulte le panneau principal
**Then** seules les options applicables à ce type et à ce mode sont affichées

_Réfs : FR-6, FR-7, FR-48, UX-DR10/11/19_

### Story 2.3: Éditer un parcours sur la carte

As a utilisateur connecté,
I want ajouter, déplacer, réordonner ou retirer des points, et infléchir une portion de tracé,
So that j'affine mon parcours jusqu'à ce qu'il corresponde à ce que je veux.

**Acceptance Criteria:**

**Given** un parcours existe avec au moins un point
**When** j'ajoute un nouveau point après le départ
**Then** il naît Point de passage et le parcours est recalculé automatiquement

**Given** je glisse un Route point existant vers une nouvelle position
**When** je relâche
**Then** sa position est mise à jour, le tracé est recalculé, et le dernier tracé reste visible pendant le recalcul (« Mise à jour… », NFR-4)

**Given** je glisse une portion du tracé (pas un point existant)
**When** je relâche
**Then** un point est créé/déplacé pour infléchir la géométrie à cet endroit

**Given** je supprime ou réordonne un point
**When** l'action est confirmée
**Then** le parcours est recalculé et la Reorderable point list reste synchronisée bidirectionnellement avec la carte

_Réfs : FR-8, NFR-4, UX-DR9/11/21_

### Story 2.4: Inverser le sens d'un parcours

As a utilisateur connecté,
I want inverser le sens d'une boucle ou échanger le départ et l'arrivée d'un aller simple,
So that j'explore le parcours dans l'autre sens sans le reconstruire.

**Acceptance Criteria:**

**Given** j'ai un parcours de type Boucle
**When** je déclenche Inverser
**Then** le sens de parcours est inversé et les métriques/caractéristiques de montées dépendant du sens sont recalculées

**Given** j'ai un parcours de type Aller simple
**When** je déclenche Inverser
**Then** le départ et l'arrivée sont échangés et le tracé, les métriques et les montées sont recalculés en conséquence

_Réfs : FR-9_

### Story 2.5: Consulter les métriques, le profil altimétrique et un résumé persistant

As a utilisateur connecté,
I want consulter à tout moment la distance, le D+/D-, la durée estimée, la difficulté, le profil altimétrique, les montées significatives, les revêtements et les catégories routières de mon parcours,
So that je comprends ce que je m'apprête à faire, même en cours de préparation.

**Acceptance Criteria:**

**Given** un parcours calculé existe
**When** je consulte l'Expandable metric bubble en état compact
**Then** je vois distance, D+, durée et un avertissement éventuel

**Given** je déploie l'Expandable metric bubble
**When** le détail s'affiche
**Then** je vois D-, difficulté intrinsèque, revêtements, catégories routières, montées significatives, et un profil altimétrique en courbe continue selon la distance réelle (jamais par paliers)

**Given** le D+ ou une autre métrique structurante est calculé
**When** je compare deux affichages du même parcours (ordinateur, mobile)
**Then** la valeur est identique car calculée par une méthode serveur unique et versionnée (NFR-9)

**Given** une portion de revêtement est inconnue
**When** je consulte les métriques
**Then** sa proportion est indiquée explicitement, sans être transformée silencieusement en donnée favorable (NFR-10)

**Given** je navigue entre les écrans de préparation
**When** une métrique essentielle ou un avertissement existe
**Then** un résumé persistant reste accessible sur ordinateur et mobile

_Réfs : FR-40, FR-47, NFR-9/10, UX-DR9_

### Story 2.6: Enregistrer un parcours dans sa bibliothèque

As a utilisateur connecté,
I want nommer, annoter, étiqueter et enregistrer mon parcours,
So that je le retrouve plus tard dans Mes parcours sans le reconstruire.

**Acceptance Criteria:**

**Given** j'ai un parcours prêt (au moins un tracé calculé)
**When** j'ouvre Save form et je saisis un nom (obligatoire), une note (facultative) et des étiquettes
**Then** le parcours est enregistré dans ma bibliothèque et une confirmation s'affiche

**Given** l'enregistrement échoue (erreur réseau/serveur)
**When** je consulte le formulaire
**Then** nom, note et étiquettes sont conservés et je peux réessayer ou revenir à l'éditeur

**Given** je retourne plus tard sur Mes parcours
**When** je choisis un parcours enregistré
**Then** je le retrouve dans l'Atelier avec ses points et métriques prêts à reprendre

_Réfs : FR-41, UX-DR22_

### Story 2.7: Exporter un parcours en GPX

As a utilisateur connecté,
I want exporter mon parcours au format GPX avec son tracé, ses points de passage et ses altitudes,
So that je peux l'utiliser sur mon GPS ou une application compatible, indépendamment de bikeroute.

**Acceptance Criteria:**

**Given** j'ai un parcours calculé
**When** je déclenche Exporter
**Then** un fichier GPX standard est généré avec tracé, points de passage et altitudes, exploitable sans dépendance à l'application (NFR-7)

**Given** l'export réussit
**When** la confirmation s'affiche
**Then** le nom du fichier exporté est confirmé et je peux revenir au parcours ou préparer un autre parcours

**Given** l'export échoue
**When** je consulte le résultat
**Then** le parcours est conservé et Réessayer est proposé, aucun export partiel n'est présenté comme réussi

**Given** un export réussit
**When** le système l'enregistre
**Then** il est ajouté à l'historique des exports du compte connecté, nécessaire au calcul de nouveauté d'une future génération assistée

_Réfs : FR-42, FR-43, FR-49, NFR-7_

---

## Epic 3: Génération assistée et résultats explicables

Un utilisateur peut définir une demande de génération (boucle, aller simple, multi-étapes) avec contraintes et préférences, lancer une recherche qui respecte strictement les politiques routières, suit une progression visible et des limites temporelles (15 s/60 s), puis explorer jusqu'à 4 propositions diversifiées, chacune avec score absolu, conformité, rang, fiabilité et explication dimensionnelle, comparables entre elles. Livre la proposition de valeur centrale du produit (UJ-1, cœur de UJ-3) en lecture/exploration — la sélection et l'édition sont couvertes par l'Epic 4.

**⚠️ Jalon technique interne, pas une release démontrable seule :** Epic 3 est standalone au sens dépendance (aucun epic suivant requis pour fonctionner), mais le contrat UX (Key Flow UJ-1 d'EXPERIENCE.md) ne s'arrête jamais à « consulter des propositions » — le parcours utilisateur n'a de sens que jusqu'à l'export (Epic 4). Ne pas démontrer ou shipper Epic 3 isolément comme un incrément utilisateur ; le regrouper avec Epic 4 pour toute démo ou release visible.

### Story 3.1: Lancer une génération boucle minimale et obtenir un candidat valide

As a utilisateur connecté,
I want lancer une génération de boucle avec juste un départ et une distance cible et obtenir un candidat qui respecte les politiques routières dures,
So that j'obtiens un parcours crédible sans configurer quoi que ce soit.

**Acceptance Criteria:**

**Given** je suis dans l'Atelier en mode Assisté
**When** je saisis un départ et une distance cible pour une boucle
**Then** une demande de génération est créée et traitée de façon asynchrone

**Given** un segment est explicitement interdit aux vélos (`bicycle=no`, `access=private` sans autorisation vélo, etc.)
**Then** tout candidat le contenant est exclu

**Given** un segment n'a pas de tag d'accès vélo exploitable ou une valeur ambiguë
**Then** il reste admissible ; sa présence est indiquée dans la fiabilité des données et un avertissement `ACCESS_UNKNOWN`, sans réduire directement le score global — même traitement que le revêtement inconnu

**Given** un segment est en terre/gravier/revêtement incompatible avec le vélo de route
**Then** tout candidat le contenant est exclu

**Given** un segment a un revêtement inconnu
**Then** il reste admissible, sa longueur/proportion figure dans la fiabilité des données et les avertissements, sans réduire directement le score

**Given** un grand axe autorisé aux vélos est utilisé en dernier recours
**Then** sa longueur est fortement pénalisée dans le score et signalée à l'utilisateur

**Given** un candidat est retourné
**Then** l'interface ne le qualifie jamais de « sûr » ni ne garantit sa cyclabilité réelle sur la seule base des données disponibles

_Réfs : FR-10 (boucle), FR-15, FR-16, FR-17, FR-18, FR-19_
_Notes d'implémentation : établit le pipeline AD-2 (normaliser→planifier→router→enrichir→valider), la classification OSM versionnée en bundle immuable (AD-7), le worker asynchrone (AD-4)._

### Story 3.2: Suivre la progression, les délais et l'annulation d'une génération

As a utilisateur connecté,
I want voir la progression de ma génération, être prévenu si elle prend plus de temps que prévu, et pouvoir l'annuler,
So that je garde le contrôle sans jamais me demander si l'application a planté.

**Acceptance Criteria:**

**Given** je lance une génération
**When** la recherche démarre
**Then** une animation et des étapes générales de progression s'affichent immédiatement, tout tracé provisoire étant clairement distingué d'un candidat validé

**Given** le calcul dépasse 15 secondes
**When** je consulte l'interface
**Then** le dépassement est signalé explicitement sans que la recherche soit interrompue

**Given** le calcul atteint 60 secondes
**When** la limite est franchie
**Then** la recherche s'arrête ; les candidats déjà validés sont retournés, ou l'échec est expliqué avec des paramètres à assouplir

**Given** une génération est en cours
**When** je clique Annuler
**Then** elle s'arrête définitivement et aucun résultat tardif n'est ensuite affiché

**Given** une génération atteint un état terminal (annulation ou 60 s)
**When** un résultat arrive après cet instant
**Then** il est ignoré ; seuls les candidats entièrement validés avant l'état terminal peuvent être restitués

_Réfs : FR-33, FR-34, FR-35, FR-36, FR-53, NFR-3_
_Notes d'implémentation : AD-5 (terminalité atomique par compare-and-set), AD-6 (deadline propagée immuable), AD-9 (mutation par commande + outbox de progression)._

### Story 3.3: Étendre la génération aux allers simples et multi-étapes avec tolérances et préférences

As a utilisateur connecté,
I want définir un aller simple (avec ou sans destination) ou un parcours multi-étapes, et affiner ma demande avec tolérances, difficulté, direction, type de séance et ordre des étapes,
So that le moteur cherche exactement ce que je veux.

**Acceptance Criteria:**

**Given** je choisis Aller simple avec destination
**When** je lance la génération
**Then** départ et destination suffisent pour lancer

**Given** je choisis Aller simple sans destination
**When** je lance la génération
**Then** départ, distance cible et direction suffisent

**Given** je choisis Multi-étapes
**When** je lance la génération
**Then** départ, étapes utilisateur et arrivée suffisent, toutes les étapes utilisateur restant obligatoires

**Given** je complète ma demande
**When** j'ouvre les options avancées
**Then** je peux ajouter une cible ou limite de D+, une tolérance de distance, une difficulté, une direction, une préférence de qualité routière, une préférence de nouveauté, un éloignement maximal et des caractéristiques de montée

**Given** je choisis un type de séance (récupération, endurance, endurance vallonnée, travail de côtes, montée longue, sortie longue, libre)
**When** la génération s'exécute
**Then** l'évaluation des dimensions pertinentes en tient compte

**Given** un multi-étapes
**When** je choisis un ordre imposé ou optimisable
**Then** le système respecte mon choix, toutes les étapes utilisateur restant obligatoires

_Réfs : FR-10 (complet), FR-11, FR-12, FR-13_

### Story 3.4: Cibler jusqu'à 4 propositions diversifiées

As a utilisateur connecté,
I want que le moteur cherche jusqu'à 4 propositions réellement différentes,
So that je puisse comparer de vraies alternatives et non des quasi-doublons.

**Acceptance Criteria:**

**Given** une demande de génération
**When** le moteur cherche
**Then** il couvre boucles, allers simples (avec ou sans destination imposée) et multi-étapes avec étapes utilisateur

**Given** le moteur cherche des candidats
**When** la recherche se termine
**Then** il vise quatre propositions valides et retourne moins de quatre plutôt que des doublons, des candidats invalides ou artificiellement dégradés

**Given** je règle la distance minimale non commune entre propositions
**When** deux parcours de longueurs différentes sont comparés
**Then** la part commune est calculée par rapport au parcours le plus court, avec une valeur par défaut de 40 % de distance différente

**Given** deux propositions sont retournées
**When** je consulte les résultats
**Then** chaque paire respecte le seuil de diversité configuré, sinon le résultat est traité comme partiel

_Réfs : FR-14, FR-20, FR-21, FR-24_

### Story 3.5: Résultats partiels et échecs explicites

As a utilisateur connecté,
I want comprendre pourquoi je reçois moins de quatre propositions ou aucune,
So that je sache quoi assouplir plutôt que de rester face à un résultat muet.

**Acceptance Criteria:**

**Given** un à trois candidats valides sont trouvés
**When** la génération se termine
**Then** le résultat est présenté comme partiel avec les raisons expliquant le nombre insuffisant ou les préférences non satisfaites

**Given** aucun candidat valide n'est trouvé
**When** la génération se termine
**Then** aucun parcours n'est retourné ; les contraintes bloquantes sont expliquées ainsi que les assouplissements possibles

_Réfs : FR-22, FR-23, UX-DR14_

### Story 3.6: Nouveauté par rapport à l'historique des exports

As a utilisateur connecté,
I want que le moteur évite de me re-proposer des parcours trop proches de ceux que j'ai déjà exportés récemment,
So that je découvre de nouveaux itinéraires.

**Acceptance Criteria:**

**Given** j'ai des exports antérieurs (historique constitué en Epic 2)
**When** une génération produit des candidats
**Then** chacun est comparé aux parcours déjà exportés par l'utilisateur, les exports récents pénalisant davantage la répétition que les exports anciens

_Réfs : FR-25_

### Story 3.7: Score absolu et dimensions pondérées

As a utilisateur connecté,
I want que chaque proposition reçoive un score global absolu et détaillé par dimension,
So that je comprenne objectivement sa qualité, indépendamment des autres propositions trouvées.

**Acceptance Criteria:**

**Given** un candidat valide
**When** il est évalué
**Then** il reçoit un score global absolu entre 0 et 100 ; le meilleur candidat trouvé n'obtient jamais 100 par simple normalisation relative

**Given** le score est calculé
**When** je consulte ses dimensions
**Then** il évalue distance, D+, difficulté intrinsèque, direction, qualité routière, revêtement, caractéristiques des montées, qualité géométrique du parcours (`RouteGeometryQuality` — recouvrement interne, allers-retours inutiles, détours artificiels, cohérence de la géométrie ; s'applique à toutes les topologies) et nouveauté, avec des pondérations versionnées variant selon le type de séance

**Given** une dimension n'est pas applicable au type de parcours
**When** le score est calculé
**Then** elle affiche `N/A`, reçoit un poids nul redistribué proportionnellement entre les dimensions applicables afin de conserver un score sur 100

_Réfs : FR-26, FR-27, NFR-14_

### Story 3.8: Conformité, rang et fiabilité des données

As a utilisateur connecté,
I want distinguer la conformité d'une proposition à ma demande, son rang parmi les autres, et la fiabilité des données utilisées,
So that je ne confonds pas « premier du classement » avec « excellent » ou « données fiables ».

**Acceptance Criteria:**

**Given** un candidat
**When** sa conformité est déterminée
**Then** elle reflète les écarts aux contraintes demandées, indépendamment du rang, avec les niveaux Très proche, Proche, Compromis modéré, Compromis important, Demande partiellement satisfaite

**Given** plusieurs candidats valides
**When** ils sont classés
**Then** ils le sont par score global décroissant, le rang 1 signifiant uniquement « meilleur candidat valide trouvé »

**Given** un candidat
**When** je consulte sa fiabilité
**Then** il affiche un niveau de fiabilité distinct du score, la proportion de revêtement inconnu et les autres attributs cartographiques incomplets pertinents

_Réfs : FR-28, FR-29, FR-30, NFR-14_

### Story 3.9: Explication dimensionnelle et comparaison des propositions

As a utilisateur connecté,
I want voir le détail de chaque dimension et comparer plusieurs propositions côte à côte,
So that je choisisse en connaissance de cause.

**Acceptance Criteria:**

**Given** une proposition
**When** j'ouvre son détail
**Then** pour chaque dimension applicable, la valeur demandée, la tolérance, la valeur réelle, l'écart, le score dimensionnel et l'état de conformité sont conservés et présentés

**Given** plusieurs propositions
**When** j'ouvre la comparaison
**Then** je les compare sur la carte et dans une vue synthétique utilisant les mêmes dimensions et indicateurs, via Comparison modal/table

_Réfs : FR-31, FR-32, NFR-8, UX-DR13/14/15_

### Story 3.10: Calibrer et versionner la baseline d'évaluation

As a product owner,
I want calibrer et versionner les seuils de conformité, les pondérations par type de séance et la décroissance de nouveauté sur un corpus de référence approuvé,
So that le moteur V1 soit objectivement prêt avant mise en service.

**Acceptance Criteria:**

**Given** un corpus de référence couvrant les trois types de parcours, les sept types de séance, les limites de tolérance, les demandes incompatibles, les données cartographiques inconnues et des candidats volontairement médiocres
**When** le corpus est constitué
**Then** chaque cas conserve les décisions attendues de validité, de conformité et de classement

**Given** le corpus est exécuté contre le moteur
**When** les résultats sont comparés aux décisions attendues
**Then** ils les reproduisent, y compris la redistribution des poids des dimensions non applicables par type de parcours

_Réfs : FR-51, NFR-16_
_Note : jalon d'ingénierie/qualité plutôt que capacité utilisateur directe — conditionne la mise en service V1 du moteur._

---

## Epic 4: Sélection, réévaluation et continuité entre modes

Un utilisateur peut sélectionner explicitement une proposition générée pour la transformer en parcours éditable dans l'atelier commun (Epic 2), la modifier avec recalcul automatique du score/conformité/fiabilité, continuer à éditer même si une modification enfreint une politique routière (sous responsabilité, avec avertissement), et passer librement entre création manuelle et génération assistée sans perdre les données compatibles. Complète UJ-1 de bout en bout et fiabilise UJ-3.

### Story 4.1: Sélectionner une proposition et la transformer en parcours éditable

As a utilisateur connecté,
I want ouvrir une proposition générée sur la carte, la sélectionner explicitement et la transformer en parcours éditable dans l'atelier commun,
So that je peux ensuite l'affiner comme n'importe quel parcours manuel.

**Acceptance Criteria:**

**Given** des résultats assistés affichés
**When** je survole ou ouvre les détails d'une proposition
**Then** rien n'est engagé implicitement — seul « Choisir ce parcours » sélectionne (#1 n'a que le focus initial, jamais l'acceptation)

**Given** je choisis une proposition
**When** la sélection est confirmée
**Then** elle devient un parcours éditable dans l'Atelier, réutilisant les capacités d'édition de l'Epic 2

**Given** le parcours devient éditable
**When** je consulte son historique
**Then** la demande initiale (contraintes, tolérances, préférences) est conservée avec lui pour permettre une réévaluation ultérieure

_Réfs : FR-37, FR-38, UX-DR13_

### Story 4.2: Réévaluer après modification d'un parcours généré

As a utilisateur connecté,
I want que toute modification manuelle d'un parcours généré recalcule son évaluation,
So that je vois toujours l'état réel de mon parcours par rapport à ma demande initiale.

**Acceptance Criteria:**

**Given** un parcours généré est modifié via les outils d'édition (Epic 2)
**When** la modification est appliquée
**Then** métriques, score global, conformité, fiabilité et écarts par rapport à la demande initiale sont recalculés

**Given** la modification est appliquée
**When** je consulte le parcours
**Then** il est identifié comme « généré puis modifié »

_Réfs : FR-39_

### Story 4.3: Liberté après une édition manuelle hors politique

As a utilisateur connecté,
I want pouvoir continuer d'éditer, enregistrer et exporter un parcours généré même si ma modification enfreint une politique routière, à condition d'être averti,
So that je garde le contrôle final sur mon parcours sous ma responsabilité.

**Acceptance Criteria:**

**Given** une modification manuelle introduit un segment qui aurait invalidé le candidat généré
**When** le système le détecte
**Then** il recalcule l'évaluation et affiche un avertissement explicite nommant la contrainte concernée

**Given** l'avertissement est affiché
**When** je poursuis
**Then** je peux continuer l'édition, enregistrer et exporter le parcours sous ma responsabilité, sans blocage

_Réfs : FR-52 — consomme le moteur de politiques construit en Story 3.1_

### Story 4.4: Continuité entre création manuelle et génération assistée

As a utilisateur connecté,
I want passer de la création manuelle à la génération assistée ou inversement sans perdre les points et paramètres encore applicables,
So that je ne recommence jamais de zéro par accident.

**Acceptance Criteria:**

**Given** je bascule Manuel → Assisté ou inversement
**When** le changement de mode s'applique
**Then** les points et paramètres encore applicables au parcours en cours sont conservés

**Given** le changement de mode rendrait une donnée incompatible
**When** le système détecte l'incompatibilité
**Then** elle n'est jamais supprimée sans confirmation explicite de l'utilisateur

_Réfs : FR-44, UX-DR5_

### Story 4.5: Changer le type de parcours en cours

As a utilisateur connecté,
I want changer le type de mon parcours en cours (boucle ↔ aller simple ↔ multi-étapes),
So that j'ajuste ma préparation sans repartir de zéro.

**Acceptance Criteria:**

**Given** je change de type
**When** le changement s'applique
**Then** les données compatibles sont conservées, toute information devenue obligatoire est demandée avant le recalcul

**Given** le changement nécessite une suppression ou conversion
**When** je confirme
**Then** une confirmation explicite est exigée avant d'agir

**Given** je passe de multi-étapes à boucle
**When** le changement s'applique
**Then** les étapes sont conservées comme points de passage, sauf choix contraire de l'utilisateur

_Réfs : FR-45, UX-DR19_

---

## Epic 5: Export et portabilité des données du compte

Un utilisateur peut récupérer l'ensemble des données de son compte — parcours, demandes de génération, préférences et historique d'exports — dans un jeu documenté de formats ouverts et lisibles par machine, depuis le menu utilisateur.

### Story 5.1: Exporter les données de mon compte

As a utilisateur connecté,
I want demander et récupérer l'ensemble de mes données de compte dans des formats ouverts et documentés,
So that je reste propriétaire de mes données indépendamment de bikeroute.

**Acceptance Criteria:**

**Given** je suis connecté
**When** j'ouvre « Exporter mes données » depuis le menu utilisateur et je lance la demande
**Then** le système prépare un export couvrant parcours, demandes de génération, préférences et historique d'exports

**Given** l'export est prêt
**When** je consulte la surface
**Then** un lien de téléchargement est disponible, accompagné d'une documentation des formats utilisés

**Given** l'export échoue ou est encore en préparation
**When** je consulte la surface
**Then** l'état (en cours/prêt/échec) est explicite et une reprise est possible

**Given** les données sont téléchargées
**When** je les inspecte avec leur documentation
**Then** elles sont dans des formats ouverts et lisibles par machine, exploitables sans l'application

_Réfs : FR-50, NFR-15, UX-DR24/27_
