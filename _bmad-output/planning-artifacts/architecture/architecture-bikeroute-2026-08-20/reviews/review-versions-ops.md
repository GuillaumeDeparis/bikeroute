# Revue versions & exploitation

**Cible :** `ARCHITECTURE-SPINE.md`  
**Date de vérification :** 2026-08-20  
**Verdict :** **CHANGES REQUIRED** — le socle est cohérent, mais trois versions épinglées ne sont plus les correctifs courants et deux invariants de sûreté d'exécution/d'intégrité restent implicites.

## 1. Vérification des technologies nommées

| Technologie engagée | Version de la spine | Réalité au 2026-08-20 | Verdict | Source primaire |
| --- | --- | --- | --- | --- |
| Python | 3.14.7 | 3.14.7, publiée le 2026-08-05 et dernière Python 3 stable affichée | Courante et compatible avec FastAPI déclaré (`Python >=3.10`) | [Python 3.14.7](https://www.python.org/downloads/release/python-3147/) |
| FastAPI | 0.136.3 | Version réelle, publiée le 2026-05-23, compatible Python 3.14, mais PyPI signale 0.141.1 du 2026-07-29 comme version plus récente | **Obsolète comme pin « courant »**; conserver seulement si le pin est intentionnel et documenté/testé | [FastAPI 0.136.3 sur PyPI](https://pypi.org/project/fastapi/0.136.3/) |
| PostgreSQL | 18.4 | 18.4 est le correctif courant de la branche 18, supportée jusqu'en 2030 | Courante; le correctif contient aussi des corrections de sécurité, donc le pin exact est pertinent | [Politique et versions PostgreSQL](https://www.postgresql.org/support/versioning/), [notes 18.4](https://www.postgresql.org/docs/release/18.4/) |
| PostGIS | 3.6.3 | Version réelle et compatible PostgreSQL 12–18, mais 3.6.4 est sortie le 2026-06-08 avec correctifs, dont une vulnérabilité FlatGeobuf | **À relever vers 3.6.4** sauf justification de compatibilité | [Notes de version PostGIS](https://postgis.net/docs/release_notes.html), [manuel 3.6.3](https://postgis.net/stuff/postgis-3.6.3-en.pdf) |
| Valhalla | 3.7.0 | Version réelle du 2026-04-28, mais 3.8.3 est la dernière release (2026-07-24); 3.8.2 corrige notamment une régression de configuration introduite en 3.7.0 | **À relever vers 3.8.3** ou documenter/tester explicitement le maintien en 3.7.0 | [releases Valhalla](https://github.com/valhalla/valhalla/releases), [release 3.7.0](https://github.com/valhalla/valhalla/releases/tag/3.7.0) |
| Docker Compose | spécification courante sans champ `version` | La propriété racine `version` est obsolète et Compose valide toujours avec le schéma le plus récent | Correct, mais ce n'est pas un pin reproductible du binaire Compose | [Docker Compose — `version` et `name`](https://docs.docker.com/reference/compose-file/version-and-name/) |

### Conclusion versions

La table ne doit pas confondre **version choisie** et **dernière version courante**. Pour un build reproductible, épingler les images par digest et les dépendances Python dans un lockfile; pour la maintenance, définir une politique de correctifs. En l'état, remplacer au minimum FastAPI `0.136.3`, PostGIS `3.6.3` et Valhalla `3.7.0`, ou consigner une exception vérifiée pour chacun. La compatibilité fonctionnelle du triplet Python/FastAPI et PostgreSQL/PostGIS est plausible et couverte par les métadonnées amont; la compatibilité bout-en-bout avec Valhalla doit rester un test d'intégration du projet.

## 2. Trous opérationnels et d'intégrité

### F-1 — Critique : le bail de job n'empêche pas les écritures d'un worker devenu obsolète

AD-4 prévoit un bail et AD-5 protège uniquement le passage terminal. Après expiration du bail, un second worker peut réclamer le job tandis que le premier continue à écrire des candidats/progressions dans un état encore `RUNNING`. Le même seed ne garantit ni l'absence de doublons ni l'identité des réponses fournisseur.

**Correction attendue :** faire du `claim/attempt` un jeton de fencing monotone (ou identifiant d'exécution) exigé dans chaque écriture de candidat, progression et terminalité; renouveler le bail conditionnellement à ce jeton; imposer des contraintes d'unicité/idempotence au niveau PostgreSQL. Cela complète AD-4/AD-5 sans choisir le schéma détaillé.

### F-2 — Majeur : « reproductible » n'immobilise pas la donnée Valhalla/OSM

AD-7 fige les politiques et AD-10 conserve le « fournisseur », mais une même requête, le même seed et Valhalla `3.x` peuvent produire un autre parcours avec des tuiles OSM, une configuration de costing ou des données d'altitude différentes. Le bundle de versions normatives ne dit pas explicitement qui possède les identifiants immuables de ces jeux de données.

**Correction attendue :** inclure dans le snapshot de génération le digest de l'image Valhalla, le digest/version du jeu de tuiles OSM, la configuration de costing et la version/source d'altitude; définir soit leur immutabilité pendant l'exécution, soit la persistance des DTO fournisseur suffisants à l'audit. Sans cela, renommer la garantie en « audit explicable » plutôt que « reproductible ».

### F-3 — Majeur : la sémantique de livraison et de rétention de l'outbox est absente

AD-9 impose une publication après commit mais ne fixe pas l'invariant qui évite perte ou duplication lors d'un crash entre publication et acquittement. Les consommateurs et la purge peuvent diverger entre implémentations.

**Correction attendue :** fixer une livraison **au moins une fois**, un `eventId` stable, des consommateurs idempotents, un claim/lease avec fencing, et une purge seulement après acquittement ou horizon de rétention mesuré. La progression peut être coalescée, jamais la terminalité.

### F-4 — Majeur : les données géographiques durables n'ont ni rétention ni frontière d'accès

AD-10 minimise les logs, mais AD-3/AD-10 persistent requêtes et géométries, potentiellement très révélatrices, sans durée de conservation, suppression corrélée, chiffrement/contrôle d'accès ou séparation des diagnostics. Le report de sauvegarde/HA est acceptable à cette altitude; l'absence d'une règle de cycle de vie des données possédées par cette feature ne l'est pas.

**Correction attendue :** ajouter un invariant de classification, accès au moindre privilège, rétention/purge atomique des générations-candidats-géométries-outbox, et chiffrement via le socle de déploiement; différer uniquement les durées exactes avec une condition de décision avant mise en service.

### F-5 — Modéré : images « versionnées » et migrations ne suffisent pas à garantir des environnements identiques

AD-12 parle des mêmes images en développement, test et production, sans exiger digest immuable, manifest multi-architecture, migrations monotones ni vérification des extensions PostgreSQL. Un tag peut dériver et une migration partielle peut casser les CAS/contraintes d'intégrité.

**Correction attendue :** digests d'images et lockfile, migrations à propriétaire unique avant démarrage des writers, vérification au boot de `server_version`, `postgis_full_version()` et schéma attendu, stratégie d'échec/rollback compatible avec les données. Les procédures de backup/restauration peuvent rester différées comme indiqué.

## Verdict synthétique

Les décisions d'exploitation fondamentales sont présentes (PostgreSQL source de vérité, CAS terminal, deadline, outbox, observabilité), mais la spine ne peut pas être finalisée comme contrat convergent avant correction de **F-1**, clarification de **F-2/F-3**, et mise à jour ou justification formelle des trois pins dépassés. **F-4/F-5** doivent au minimum devenir des invariants ou des `Deferred` assortis d'une condition « avant mise en service ».
