# Spine Pair Review — bikeroute

## Overall verdict

La paire forme une base cohérente et directement exploitable pour l’atelier cartographique, les trois topologies, la génération 15/60 secondes et la comparaison sans recommandation implicite. Elle reste toutefois **thin** comme contrat de réalisation complet : plusieurs contrôles structurants n’ont pas de double contrat visuel/comportemental, des états essentiels de carte et de recherche manquent, et quelques exigences PRD sont déclarées couvertes sans que leur interaction soit réellement spécifiée.

## 1. Flow coverage — adequate

Les trois UJ du PRD sont repris verbatim sous forme de parcours numérotés avec Guillaume, un climax et un chemin d’échec. Les FR-1 à FR-53 sont toutes citées dans la matrice de couverture, mais certaines citations dépassent le comportement effectivement engagé par les flux.

### Findings

- **[high]** UJ-1 revendique FR-39, mais après modification le flux ne spécifie que le recalcul des métriques : il ne rend pas obligatoire le recalcul du score, de la conformité, de la fiabilité et des écarts, ni l’identification « généré puis modifié » (`EXPERIENCE.md`, UJ-1 étapes 7–8 et PRD Flow Coverage). *Fix:* ajouter ces sorties et l’étiquette d’origine modifiée au climax d’édition d’une proposition.
- **[high]** UJ-2 revendique FR-8 et FR-41 sans définir le geste « déplacer une portion du tracé » ni le moment où nom, annotation et étiquettes sont saisis; seuls les points déplacés et l’action Enregistrer apparaissent (`EXPERIENCE.md`, UJ-2 étapes 4–8; State Patterns → Enregistrement). *Fix:* engager le geste de déformation du tracé et une interaction d’enregistrement avec ces trois champs, succès et reprise d’échec.
- **[medium]** Flow 4 regroupe inscription, session, bibliothèque et export de données, mais ne donne aucun climax propre à l’ouverture/reprise d’un parcours; l’export du compte absorbe l’objectif de gestion de bibliothèque (`EXPERIENCE.md`, Flow 4). *Fix:* séparer ou expliciter un climax de reprise de parcours avant le sous-flux d’export de compte.

## 2. Token completeness — adequate

Tous les tokens YAML et toutes les références `{path.to.token}` relevés se résolvent; les couleurs sont des hexadécimaux, les types suivent le schéma et le thème clair est cohérent. Les combinaisons de contraste porteuses sont nommées, mais leur seuil n’est pas contractualisé.

### Findings

- **[medium]** « doit rester lisible » n’est pas une cible de contraste testable, notamment pour `{colors.on-accent}` sur `{colors.accent}` utilisé par les CTA (`DESIGN.md`, Colors et `components.primary-button`). *Fix:* fixer un ratio minimal ou réserver cette combinaison à une taille/ graisse qui atteint le seuil choisi, puis consigner la valeur vérifiée.

## 3. Component coverage — thin

Les seize composants nommés dans les deux tables principales ont bien un contrat visuel et comportemental correspondant. Le parcours et les états utilisent néanmoins plusieurs composants indispensables qui ne figurent dans aucune des deux tables.

### Findings

- **[high]** Les contrôles fondamentaux — recherche de lieu, champs de formulaire, choix/select, cases à cocher, liste réordonnable de points et formulaire d’enregistrement — n’ont ni tokens/composants dans `DESIGN.md.Components`, ni lignes comportementales dans `EXPERIENCE.md.Component Patterns` (`EXPERIENCE.md`, Interaction Primitives, UJ-1 étapes 2–3, UJ-3 étape 3, State Patterns → Enregistrement). *Fix:* nommer ces composants une fois et leur donner des contrats visuel et comportemental symétriques.
- **[medium]** `Skeleton` et `Banner` sont employés comme composants alors que seul `Status banner` est contractualisé et qu’aucun Skeleton ne l’est (`EXPERIENCE.md`, State Patterns → Accueil et Atelier hors ligne). *Fix:* remplacer `Banner` par le nom canonique `Status banner` et ajouter Skeleton aux deux spines, ou décrire ces termes comme traitements non composants.
- **[medium]** La comparaison exige un tableau localisable, mais le tableau comparatif n’a pas de composant propre définissant colonnes, débordement, focus de ligne/colonne et adaptation mobile (`EXPERIENCE.md`, Comparison modal et Responsive & Platform). *Fix:* ajouter `Comparison table` aux deux contrats ou intégrer explicitement son anatomie au composant Comparison modal.

## 4. State coverage — thin

Les états métier distinctifs sont solides : départ absent/posé, recalcul conservant le tracé, hors ligne, génération 0–15/15–60/terminal, résultats 0–4, inconnues, enregistrement et exports. La carte et les saisies qui rendent ces états accessibles ne couvrent pas leurs propres échecs.

### Findings

- **[high]** Aucun état ne couvre le chargement ou l’échec du fond de carte, une recherche de lieu vide/en cours/sans résultat, ou un point impossible à rattacher au réseau routable (`EXPERIENCE.md`, Information Architecture → Atelier; State Patterns → Atelier). *Fix:* ajouter ces états en conservant les entrées utilisateur et en proposant déplacement, nouvelle recherche ou réessai.
- **[medium]** Le formulaire Assisté n’a pas d’état explicite pour champs requis manquants, valeur invalide, combinaison incohérente ou changement de topologie rendant des données incompatibles; seule la désactivation générique du Primary button est définie (`EXPERIENCE.md`, Component Patterns → Primary button et Mode switch). *Fix:* spécifier validation locale, message, conservation/conversion et retour au champ concerné.
- **[low]** Les surfaces `Comparaison` et `Menu utilisateur` n’ont aucun état de fermeture involontaire, session expirée ou données devenues obsolètes pendant leur ouverture (`EXPERIENCE.md`, IA et State Patterns). *Fix:* ajouter le traitement seulement si ces cas peuvent survenir dans l’architecture retenue.

## 5. Visual reference coverage — strong

Aucun fichier n’existe dans `mockups/`, `wireframes/` ou `imports/`; il n’y a donc aucun artefact promu orphelin. Les deux wireframes de travail et la direction visuelle retenue sont liés inline à leur section pertinente, avec la règle « les spines gagnent » énoncée une seule fois par spine.

### Findings

Aucun.

## 6. Bloat & overspecification — adequate

Les spines restent centrées sur les décisions UX et évitent les paramètres algorithmiques. La matrice FR détaillée est longue, mais elle fournit une traçabilité utile; son problème principal est l’exactitude de quelques revendications, traité en section 1, plutôt que son volume.

### Findings

- **[low]** Certaines phrases répètent la même règle de dominance cartographique et de convergence Manuel/Assisté dans Foundation, IA, Component Patterns, Interaction Primitives et les flux (`EXPERIENCE.md`). *Fix:* conserver la loi une fois dans Foundation/IA et laisser les autres sections préciser uniquement leur delta comportemental.

## 7. Inheritance discipline — adequate

Les cinq références `sources` des deux frontmatters se résolvent sur disque; les noms UJ et FR sont repris du PRD, les noms principaux de composants concordent et toutes les références EXPERIENCE → DESIGN se résolvent. Quelques noms secondaires divergent toutefois du vocabulaire canonique.

### Findings

- **[medium]** `Account menu`, `Contextual menu`, `Proposal card`, `Metric bubble` et `Banner` alternent anglais, casse et nom canonique selon IA, tableaux et prose; `Banner` ne correspond à aucun composant (`EXPERIENCE.md`, IA, Component Patterns, State Patterns). *Fix:* choisir un nom exact par composant et le réutiliser partout, y compris dans les libellés de surfaces.
- **[low]** La troisième source d’`EXPERIENCE.md` se résout mais passe par un chemin avec remontée interne (`../../../specs/.../../../../docs/...`), ce qui fragilise la lecture et les déplacements (`EXPERIENCE.md`, frontmatter). *Fix:* utiliser le chemin direct relatif `../../../../docs/spec_route_generator_latest.md`.

## 8. Shape fit — strong

`DESIGN.md` respecte l’ordre canonique intégral. `EXPERIENCE.md` contient toutes les sections obligatoires, ainsi que Responsive & Platform et Inspiration & Anti-patterns, toutes deux déclenchées par le multi-surface et les références explicites. Les sections ajoutées (PRD Flow Coverage) servent la traçabilité downstream.

### Findings

Aucun.

## Mechanical notes

- Frontmatters présents; les deux spines restent `status: draft`, cohérent avec une validation avant finalisation.
- Toutes les références `{colors.*}`, `{typography.*}`, `{rounded.*}`, `{spacing.*}` et `{components.*}` se résolvent.
- Toutes les sources déclarées existent; le chemin direct recommandé en section 7 est une question de robustesse, pas un lien cassé.
- Aucun fichier dans `imports/`, `mockups/` ou `wireframes/`; les cinq fichiers de `.working/` ont été contrôlés. Les deux directions non retenues restent correctement non normatives.
- Aucun bloc Mermaid; aucune syntaxe Mermaid à valider.
- Comptes : **0 critical · 4 high · 6 medium · 3 low**.
