---
title: 'Solution design — moteur de génération de parcours vélo V1'
audience: 'Développeurs et architectes applicatifs'
status: final
updated: '2026-08-20'
---

# Solution design — moteur de génération de parcours vélo V1

## Synthèse

Le moteur est un service Python organisé en architecture hexagonale. FastAPI reçoit les commandes et expose l'état. Un worker distinct exécute les générations. PostgreSQL/PostGIS stocke l'état, les géométries et la file transactionnelle. Valhalla fournit initialement le routage et l'altitude derrière deux ports remplaçables. Le cœur métier reste déterministe et indépendant de ces technologies.

La décision structurante est de traiter une génération comme un workflow durable, non comme une requête HTTP longue. Cela rend compatibles l'accusé de réception immédiat, la progression, l'annulation, l'arrêt définitif à 60 secondes et l'audit reproductible.

## Frontières applicatives

| Frontière | Responsabilité | Ne décide jamais |
| --- | --- | --- |
| API | Authentifier, accepter, exposer l'état, demander l'annulation | Validité, score, classement |
| Worker | Réclamer, budgéter et orchestrer une génération | Règles OSM ou formules métier |
| Domaine | Normaliser, valider, mesurer, scorer, diversifier, expliquer | SQL, HTTP, format Valhalla |
| PostgreSQL/PostGIS | Persister, verrouiller, comparer spatialement | Politique d'admissibilité |
| Valhalla | Produire chemin et échantillons d'altitude | Résultat final ou score normatif |

## Hypothèses à valider

- `[ASSUMPTION]` Python 3.14 et FastAPI conviennent comme starter du backend moteur.
- `[ASSUMPTION]` Une file PostgreSQL suffit au débit et au déploiement mono-hôte de la V1.
- `[ASSUMPTION]` Valhalla 3.8.3 satisfait les besoins initiaux de routage vélo et d'altitude pour la France après validation sur le corpus.
- `[ASSUMPTION]` Quatre services Docker Compose constituent l'enveloppe opérationnelle du moteur V1.

## Flux de bout en bout

1. L'API authentifie l'appel, valide la forme de la commande et crée dans une transaction la génération `PENDING`, sa requête normalisée, ses versions, son seed et son job.
2. Le worker réclame le job avec un jeton d'exclusion (`fencing token`), passe la génération à `ACTIVE` et calcule son budget monotone à partir de l'échéance UTC fixée lors du commit d'acceptation.
3. Le pipeline génère des plans/ancres, appelle les ports de routage et d'altitude avec le budget restant, enrichit chaque géométrie puis applique les contraintes dures.
4. Seuls les candidats valides sont mesurés, scorés et comparés. La sélection finale impose la diversité paire à paire.
5. Chaque progression durable est enregistrée dans la transaction métier, puis diffusée après le commit par l'outbox avec une garantie de livraison au moins une fois. Les événements sont séquencés et idempotents.
6. Le premier événement reçu — achèvement, annulation ou échéance — déclenche une transition atomique vers l'unique état terminal. Toute arrivée tardive est rejetée.

## Concurrence et reprise

Le job utilise un bail et une valeur `leaseEpoch` monotone. Après un crash, un worker peut réclamer un bail expiré tout en conservant le `generationId`, le seed, le bundle et l'échéance. Chaque écriture exige la valeur `leaseEpoch` courante et une identité idempotente. Un worker dont le bail est périmé ne peut donc plus écrire. La terminalité repose sur un `compare-and-set` : une génération terminale n'accepte plus de candidat, de progression ou de nouvelle finalisation.

La file PostgreSQL est une hypothèse V1 délibérée. Elle garde la transaction « génération + job » atomique et évite Redis/RabbitMQ. Elle devra être remplacée si les tests mettent en évidence une contention, si plusieurs hôtes doivent se répartir les jobs ou si les garanties opérationnelles requises dépassent celles d'un déploiement mono-hôte.

## Reproductibilité

Au démarrage, chaque génération résout une seule fois son bundle de politiques : classification OSM, scoring, conformité, D+, détection des montées, similarité, retries et paramètres techniques. Le système persiste les versions, le seed, les digests des tuiles OSM, de costing et d'altitude, ainsi que le snapshot d'historique. Un tri total avec critères de départage explicites élimine les classements dépendant de l'ordre de retour des appels concurrents.

Le corpus de référence teste le domaine sans fournisseur. Des tests de contrat imposent ensuite la même sémantique à chaque adaptateur de routage et d'altitude; les tests d'intégration couvrent les opérations PostGIS et une image Valhalla figée.

## Exploitation V1

Docker Compose démarre l'API, le worker, PostgreSQL/PostGIS et Valhalla. Les images sont épinglées par digest et les dépendances Python par lockfile; un migrateur unique précède les writers. Seuls les secrets, les limites de ressources, la configuration et les volumes varient selon l'environnement. Les contrôles d'état vérifient l'API HTTP, la base de données, le schéma et ses extensions, la réclamation d'un job et le fournisseur.

Les logs JSON contiennent `correlationId`, `generationId`, statut, versions, durées, compteurs et codes d'erreur. Les coordonnées et les payloads complets ne sont pas journalisés par défaut. Ils restent dans les données métier, dont l'accès exige l'autorisation du propriétaire.

## Questions avant mise en production

- Fixer le matériel et le protocole normatifs pour les budgets de 15 et 60 secondes.
- Nommer l'autorité d'approbation et figer le corpus de calibrage.
- Valider Valhalla sur les cas OSM français, les règles vélo de route, le D+ et les performances.
- Trancher sauvegarde/restauration dans l'architecture applicative globale.
