# Revue adversariale — Architecture Spine du moteur de parcours

## Verdict

**CHANGES REQUIRED.** La spine fixe correctement le paradigme et plusieurs invariants métier, mais elle ne suffit pas encore à empêcher des implémentations indépendantes incompatibles sur les chemins les plus risqués : reprise concurrente des jobs, origine et portée de la deadline, sémantique canonique des réponses fournisseur, et contrat des écritures multi-objets. Ces lacunes peuvent casser CAP-3, CAP-4, CAP-6 ou CAP-7 alors que chaque unité affirme respecter tous les AD.

## Findings

### ADV-1 — Le bail de job n'est pas clôturé par un jeton de fencing

- **Sévérité : critique**
- **AD concernés :** AD-4, AD-5, AD-9
- **Paire incompatible qui respecte la spine :**
  - Le worker A réclame un job avec un bail de 30 secondes, renouvelle périodiquement, puis subit une pause de processus de 40 secondes. À son réveil, il continue parce qu'il détient toujours en mémoire le même `generationId`.
  - Le worker B a réclamé entre-temps le bail expiré, incrémenté `attempt`, et génère d'autres candidats pour le même `generationId` et le même seed.
  - Tous deux utilisent un verrou non bloquant au claim, un bail, un compteur de tentatives et le CAS terminal imposés. Avant la terminalité, tous deux peuvent pourtant écrire progression et candidats : le simple test « état non terminal » d'AD-5 ne distingue pas le propriétaire courant du propriétaire périmé.
- **Incompatibilité produite :** doublons ou mélange de candidats issus de deux tentatives, progression régressive, raisons de rejet agrégées deux fois, et résultat dépendant de l'ordre des commits. Le CAS terminal n'empêche que deux terminalisations, pas deux exécutions actives.
- **Correction attendue dans la spine :** imposer un jeton de fencing monotone par claim (`attempt` ou `leaseEpoch`) et exiger ce jeton dans **chaque** mutation liée à l'exécution — candidats, diagnostics, progression, renouvellement et terminalisation. Définir également l'idempotence des écritures et la règle de reprise : nouvelle tentative remplace-t-elle les artefacts non terminaux de l'ancienne, ou les conserve-t-elle dans un espace de tentative séparé ?

### ADV-2 — La deadline n'a ni origine canonique ni sémantique inter-processus

- **Sévérité : critique**
- **AD concernés :** AD-4, AD-6, AD-11
- **Paire incompatible qui respecte la spine :**
  - L'API persiste `createdAt` en UTC; le worker A commence le budget de 60 secondes au commit de la requête, considérant l'attente en file comme faisant partie du délai observable.
  - Le worker B calcule sa « deadline absolue avec une horloge monotone » au moment du claim, considérant que seules les opérations du worker sont bornées. Après reprise, il crée une nouvelle deadline monotone de 60 secondes, puisqu'une valeur monotone n'est ni portable entre processus ni persistable comme instant UTC.
  - Les deux propagent ensuite correctement leur budget restant et refusent de démarrer un travail sans budget.
- **Incompatibilité produite :** une même requête peut terminer à 60 secondes après acceptation, à 60 secondes après claim, ou à 60 secondes par tentative. CAP-6 et le signal de succès « aucun calcul ne continue après 60 secondes » n'ont plus une interprétation unique. Le seuil visible de 15 secondes souffre du même problème.
- **Correction attendue dans la spine :** nommer l'événement origine (`acceptedAt`/commit API, sauf décision contraire), persister une deadline murale UTC immuable pour coordination et dériver localement un budget monotone à chaque processus à partir de celle-ci. Préciser que les retries ne réinitialisent jamais les seuils. Définir ce que « arrêt » exige d'un appel distant : timeout client borné, annulation locale, rejet de toute réponse tardive; ne pas prétendre pouvoir interrompre le calcul interne d'un fournisseur distant.

### ADV-3 — Les DTO « canoniques » ne fixent pas les sémantiques indispensables du routage

- **Sévérité : majeure**
- **AD concernés :** AD-2, AD-7, AD-8, AD-10, AD-11
- **Paire incompatible qui respecte la spine :**
  - L'adaptateur de routage A retourne une polyligne simplifiée, les points demandés après snapping, les distances calculées par le fournisseur et des attributs OSM déjà fusionnés par segment.
  - L'adaptateur B retourne une géométrie détaillée, conserve séparément points demandés et points accrochés, recalcule les distances géodésiques et associe les attributs aux arêtes sources.
  - Les deux retournent un « DTO canonique », du SRID 4326 et des mètres; le domaine garde bien validation et métriques normatives.
- **Incompatibilité produite :** validation segmentaire, préservation des étapes, distance commune et score divergent selon la densité de géométrie, les règles de snapping, l'origine des distances et le rattachement des attributs. Un remplacement de fournisseur peut modifier les résultats sans changement du bundle normatif et rendre l'audit d'AD-10 insuffisant.
- **Correction attendue dans la spine :** fixer le contrat sémantique minimal des ports : géométrie non simplifiée ou tolérance versionnée; ordre, identité et distinction `userWaypoint`/`technicalAnchor`; coordonnées demandées et snapées; seuil et échec de snapping; provenance/version des données; segmentation et identifiants stables des arêtes; source de vérité pour longueur et altitude; catégories d'erreur (`no_route`, données absentes, transitoire, définitive); règles d'arrondi et de normalisation. Le schéma détaillé peut rester dans un contrat de port versionné, mais la spine doit en imposer l'autorité et la compatibilité.

### ADV-4 — Le propriétaire des transactions est nommé, mais leur frontière ne l'est pas

- **Sévérité : majeure**
- **AD concernés :** AD-3, AD-5, AD-9
- **Paire incompatible qui respecte la spine :**
  - L'orchestrateur A appelle une commande par candidat : insert candidat, mise à jour progression et outbox sont atomiques ensemble.
  - L'orchestrateur B utilise trois commandes transactionnelles séparées : persistance du candidat, progression, puis événement d'outbox. Chacune est bien une commande applicative transactionnelle et la diffusion se fait bien après commit.
- **Incompatibilité produite :** crash entre transactions donnant candidat sans progression/outbox, événement sans vue de lecture à jour, ou terminalisation entre l'insert et sa publication. Les consommateurs peuvent aussi appliquer les événements dans un ordre différent, aucun numéro de séquence ni clé de déduplication n'étant imposé.
- **Correction attendue dans la spine :** définir l'unité atomique minimale : mutation métier + transition/progression correspondante + enregistrement outbox dans la même transaction. Imposer pour chaque événement une identité idempotente et une séquence monotone par génération; préciser l'ordre de projection et la politique de consommation au-moins-une-fois. Clarifier si « seul le dépôt de génération effectue les CAS » signifie aussi qu'il coordonne les écritures de candidats et diagnostics, ou si une unité de travail applicative possède cette transaction.

### ADV-5 — Les retries et erreurs fournisseur peuvent changer l'issue métier

- **Sévérité : majeure**
- **AD concernés :** AD-4, AD-6, AD-7, AD-8, AD-10
- **Paire incompatible qui respecte la spine :**
  - L'adaptateur A retente deux fois tout timeout Valhalla avec backoff, puis classe l'absence de réponse comme échec technique global.
  - L'adaptateur B ne retente pas afin de préserver le budget, classe le timeout comme rejet du candidat et poursuit les autres candidats.
  - Tous deux propagent le budget restant, gardent Valhalla non normatif et incrémentent un compteur de tentative du job.
- **Incompatibilité produite :** avec les mêmes seed, requête et bundle, l'un peut produire `FAILED`, l'autre `PARTIAL`; l'ordre des candidats explorés et le budget consommé changent aussi. L'audit enregistre les durées et résultats, mais aucun contrat ne permet d'affirmer quelle conduite est conforme.
- **Correction attendue dans la spine :** séparer tentative de job et tentative d'appel, fixer une taxonomie d'erreurs transitoires/définitives/métier, un plafond de retries, un backoff déterministe, la condition « budget suffisant » et l'effet de chaque classe sur candidat versus génération. Persister les tentatives et réponses utiles à la reproductibilité; déclarer explicitement quelles nondéterminismes externes empêchent une reproduction bit-à-bit.

## Conclusion de gate

La spine peut devenir convergente sans absorber les schémas complets : cinq invariants supplémentaires, ou des amendements ciblés aux AD-4/5/6/8/9, suffiraient à fermer ces divergences. ADV-1 et ADV-2 sont bloquants avant implémentation du worker; ADV-3 doit être fermé avant de publier les contrats de ports; ADV-4 et ADV-5 avant les tests d'intégration et de reprise.
