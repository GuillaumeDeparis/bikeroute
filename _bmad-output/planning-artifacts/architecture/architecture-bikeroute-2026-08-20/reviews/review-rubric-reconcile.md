# Revue rubric + réconciliation des sources

## Verdict

**À corriger avant finalisation.** La spine est concise, structurante et couvre l'essentiel des CAP-1 à CAP-7, mais deux divergences de contrat importantes subsistent (cycle de mutation des candidats et statuts publics), et la propriété des données d'historique utilisateur reste assez ouverte pour produire des implémentations incompatibles.

## Contrôles mécaniques

- Identifiants `AD-1` à `AD-12` uniques et ordonnés.
- Chaque décision possède `Binds`, `Prevents` et `Rule`.
- Aucun commentaire de template ni placeholder visible.
- Les technologies nommées ont une version, à l'exception volontaire de Docker Compose qui référence la spécification courante.
- Le lint officiel n'a pas pu être exécuté dans l'environnement de revue : `uv` n'est pas installé (`command not found`). Ce point doit être rejoué par le parent avant finalisation.

## Findings critiques et hauts

### HIGH-1 — La mutation/optimisation d'un candidat n'est pas enfermée dans une nouvelle boucle de validation

**Sources.** La spécification détaillée place `CandidateOptimizer` après l'évaluation/scoring et définit des mutations topologiques. La SPEC canonique exige que 100 % des propositions retournées respectent les contraintes dures et qu'aucun score ne masque une violation. La spine AD-2 impose un pipeline linéaire `... valider → mesurer/évaluer → diversifier → sélectionner/expliquer`, sans étape de mutation ni règle disant qu'une géométrie mutée doit être reroutée, ré-enrichie et revalidée avant tout scoring/sélection.

**Risque de divergence.** Une unité peut considérer l'optimisation comme une transformation du candidat déjà validé, tandis qu'une autre la traite comme la création d'un nouveau candidat. La première peut sélectionner une géométrie dont les contraintes dures et métriques correspondent à la version antérieure.

**Disposition recommandée : autofix.** Étendre AD-2 avec une règle de provenance/version de géométrie : toute mutation invalide routage, enrichissements, validation, métriques et score précédents, et réinjecte le candidat avant `router`; seuls les artefacts calculés sur l'empreinte exacte de la géométrie sélectionnée sont admissibles.

### HIGH-2 — Le modèle d'état de la spine contredit le contrat détaillé exposé

**Sources.** La spécification détaillée définit les statuts `PENDING`, `SAMPLING`, `GENERATING`, `ROUTING`, `ANALYZING`, `OPTIMIZING`, `SELECTING`, puis les quatre terminaux. La spine et son diagramme exposent uniquement `PENDING → RUNNING → terminal`, alors que la convention annonce des DTO versionnés et que CAP-6 exige une progression observable.

**Risque de divergence.** L'API, le worker et les projections peuvent choisir soit l'enum détaillé, soit le statut synthétique `RUNNING`. Le client et les tests contractuels n'ont alors pas un vocabulaire stable; la progression peut devenir un pourcentage, une phase, ou un simple booléen selon l'unité.

**Disposition recommandée : discuter puis autofix.** Décider explicitement si les phases détaillées sont le contrat public canonique. Si oui, remplacer `RUNNING` dans la seed et fixer les transitions autorisées; sinon, déclarer les phases internes et définir leur projection stable vers un statut public et un champ de progression séparé. La terminalité AD-5 peut rester inchangée.

### HIGH-3 — La propriété et la cohérence de l'historique utilisateur ne sont pas fixées

**Sources.** La spécification détaillée fait de la nouveauté une comparaison avec `COMPLETED_RIDE`, `SAVED_ROUTE` et `GENERATED_ROUTE`, pondérée par ancienneté, avec fenêtre configurable. La spine mentionne l'historique seulement implicitement sous CAP-5; AD-3 ne cite pas l'historique parmi les données durables, AD-7 ne fixe pas le snapshot/référentiel historique d'une génération, et AD-8 ne définit aucun port d'historique.

**Risque de divergence.** Deux unités peuvent lire des magasins distincts, inclure ou exclure la génération courante, observer un historique qui change pendant le traitement, ou matérialiser des géométries et pondérations incompatibles. Cela casse déterminisme, reproductibilité et isolement par utilisateur.

**Disposition recommandée : autofix.** Ajouter à une AD existante ou nouvelle : un propriétaire unique de l'historique, un `HistoryPort` canonique scoppé par `userId`, la frontière transactionnelle/snapshot de lecture, et l'identité/version de ce snapshot dans l'audit de génération. Fixer aussi que les candidats de la génération courante relèvent de la diversité, pas de la nouveauté historique, sauf politique versionnée explicite.

### HIGH-4 — La frontière d'autorisation des données géographiques utilisateur est silencieuse

**Sources.** Le contrat d'entrée contient `userId`; l'API permet consultation et annulation par `generationId`; historique, requêtes et géométries sont persistés. AD-10 minimise les logs mais aucune règle ne fixe l'origine de l'identité, l'autorisation de lecture/annulation, ni l'isolement des historiques.

**Risque de divergence.** Un adaptateur peut faire confiance au `userId` du payload tandis qu'un autre utilise une identité authentifiée. Une consultation par identifiant peut alors exposer parcours, étapes ou historique d'un autre utilisateur.

**Disposition recommandée : discuter.** Si l'authentification appartient à l'application parente, inscrire cette dépendance dans `Deferred` avec une condition bloquante avant exposition de l'API, et imposer au port entrant une identité de principal distincte du payload. Sinon, ajouter une AD d'autorisation par propriétaire pour création, lecture et annulation.

## Findings moyens et bas

### MEDIUM-1 — Le diagramme de dépendances rend le domaine dépendant des ports

Le diagramme contient `DOMAIN --> PORTS`, alors qu'AD-1 dit que l'application orchestre et que les adaptateurs dépendent des ports et du noyau. Dans une architecture hexagonale où les ports sont placés sous `application/`, cette flèche autorise une dépendance du domaine pur vers la couche application. **Autofix :** supprimer la flèche ou placer explicitement les ports requis par le domaine dans le domaine lui-même et aligner la seed.

### MEDIUM-2 — La reprise par bail ne définit pas l'idempotence des écritures intermédiaires

AD-4 garantit le même `generationId` et seed, AD-5 protège seulement le terminal. Elle ne fixe pas de clé/idempotence pour candidats, appels logiques, diagnostics et événements d'outbox après expiration d'un bail. Deux workers peuvent donc dupliquer des candidats ou métriques avant le compare-and-set terminal. **Autofix :** fixer une identité déterministe de tentative/candidat et des upserts ou contraintes uniques pour toutes les écritures rejouables.

### MEDIUM-3 — Le signal nominal de 15 secondes n'est pas rendu explicitement observable

AD-6 traite surtout la deadline dure. La source exige qu'à 15 secondes le dépassement soit signalé à l'interface et enregistré dans les diagnostics; AD-9 parle de progression, AD-10 de diagnostics sans garantir `NOMINAL_TIME_EXCEEDED`. **Autofix :** ajouter à AD-6 une transition/alerte persistée et publiée une seule fois au franchissement du budget nominal.

### MEDIUM-4 — La stratégie de migration et compatibilité des données versionnées est absente

La spine fixe PostgreSQL comme source de vérité et de nombreux bundles/DTO versionnés, mais ne décide ni ne diffère migrations de schéma, compatibilité de lecture des générations anciennes et politique de retrait des versions. C'est une dimension opérationnelle qui peut diverger entre API et worker lors d'un déploiement. **Déférer avec condition :** avant le premier déploiement contenant API et worker de versions différentes, fixer migrations expand/contract et fenêtre de compatibilité.

### LOW-1 — Les non-objectifs principaux ne sont pas explicitement protégés par une frontière

La spine ne rappelle pas que navigation temps réel, GPS, POI/étapes automatiques, coaching et garantie de sécurité restent hors moteur. La carte CAP limite déjà fortement le scope, donc le risque est faible, mais `GeneratedDestinationStrategy` pourrait être confondu avec génération d'étapes fonctionnelles. **Autofix léger :** ajouter les non-objectifs au `Deferred` ou une ligne de frontière, notamment « aucune étape fonctionnelle générée en V1 ».

## Couverture des capacités

| Capacité | Couverture | Observation |
| --- | --- | --- |
| CAP-1 topologies | Bonne | Stratégies laissées au code; invariant étapes utilisateur/anchors surtout porté par la source, pas explicitement par une AD. |
| CAP-2 manuel/automatique | Bonne | Le non-déplacement des points utilisateur gagnerait à apparaître dans AD-2. |
| CAP-3 validation OSM | Bonne | AD-2, AD-7 et AD-8 fixent les bons propriétaires. |
| CAP-4 diversité | Bonne | Seuil et algorithme relèvent correctement du bundle; pas de relaxation couvert par AD-2. |
| CAP-5 évaluation/explication | Partielle | Audit couvert; historique utilisateur insuffisamment architecturé (HIGH-3). |
| CAP-6 progression/temps | Partielle | Deadline forte; phases publiques et signal nominal ambigus (HIGH-2, MEDIUM-3). |
| CAP-7 partiel/échec | Bonne | Terminalité et résultats validés sont fixés. |

## Évaluation synthétique de la good-spine checklist

- **Vrais points de divergence :** majorité couverte; mutation, états publics et historique manquent.
- **Règles exécutables :** généralement oui; AD-2 reste insuffisante après mutation.
- **Deferred sûr :** la sauvegarde/restauration est correctement différée avant mise en service; la sécurité/autorisation ne l'est pas.
- **Technologies actuelles :** versions présentes, mais leur actualité n'a pas été revérifiée dans cette revue hors ligne.
- **Ratification brownfield :** non évaluée faute de sweep code demandé; aucune contradiction source évidente hors états.
- **Couverture de la SPEC :** forte, avec les lacunes détaillées ci-dessus.
- **Spine parente :** aucune spine parente déclarée.
- **Dimensions d'altitude :** déploiement, environnements, infra et opérations sont au moins décidés/différés; sécurité, évolution de schéma et propriété de l'historique restent silencieuses.

