# PRD Quality Review — Application de préparation et génération intelligente de parcours vélo

## Overall verdict

Le PRD est **fort et décision-ready pour engager l’UX, l’architecture et le découpage**, avec des prérequis moteur désormais explicites, attribués et ordonnés avant implémentation ou validation. Aucun défaut critique ou élevé ne subsiste ; les points restants portent surtout sur des contrats de recette à préciser dans les spécifications aval déjà identifiées.

## Decision-readiness — strong

La synthèse exécutive expose immédiatement le pari V1, ses garde-fous, son seuil de succès et ses prérequis. Les décisions structurantes sont nettes : trois formes de parcours, quatre propositions cibles, séparation validité/score/conformité/rang/fiabilité, résultats partiels, édition manuelle sous responsabilité et arrêt terminal unique (§1, FR-15 à FR-39, FR-51 à FR-53).

Les neuf questions ouvertes ne sont plus des inconnues flottantes : chacune possède un propriétaire et un jalon de résolution (§10). Les arbitrages entre preuve V1 et fonctionnalités reportées sont visibles dans §5–6.

### Findings

Aucun finding substantiel.

## Substance over theater — strong

La vision est spécifique au produit : parcours vélo de route prudents, explicables, diversifiés et auto-hébergés (§1). Les NFR sont directement liés aux risques réels — Docker Compose, OSM, France, calcul déterministe, plafond temporel, audit et portabilité (§7). Les trois parcours utilisateur commandent des capacités distinctes et ne servent pas de décoration (§2.2).

### Findings

- **low** Le contenu minimal de l’accueil reste peu borné (§4.2 FR-4) — « informations disponibles » et « actions principales » ne séparent pas l’obligatoire du discrétionnaire. *Fix:* fixer ces blocs dans la spécification UX avant la recette de l’accueil.

## Strategic coherence — strong

La thèse — produire plusieurs parcours valides, différents et explicables plutôt qu’un tracé opaque — relie vision, fonctionnalités, mesures et contre-métriques (§1, §4, §8). SM-2 fixe désormais une preuve quantifiée par famille de demandes réalistes et isole les cas volontairement impossibles. Les fonctionnalités différées sont cohérentes avec une V1 centrée sur la préparation jusqu’à l’export (§5–6).

### Findings

Aucun finding substantiel.

## Done-ness clarity — adequate

Les comportements déterminants sont testables : validité stricte, seuil et dénominateur de diversité, résultat partiel, dimensions non applicables, délais 15/60 secondes, état terminal, transitions avec confirmation, édition invalidante sous avertissement et contenu GPX. FR-51, NFR-16 et SM-8 définissent un gate de calibrage reproductible plutôt que de présenter des pondérations exploratoires comme acquises.

Le PRD identifie correctement plusieurs détails comme prérequis de spécification avant implémentation (§10–11). Cette délégation est saine, mais ces contrats devront être effectivement livrés pour que les stories moteur soient done-ready.

### Findings

- **medium** La difficulté intrinsèque et les montées significatives n’ont pas encore de définition normative (§4.7 FR-27 ; §4.10 FR-40) — Elles affectent score, conformité et affichage sans formule ni référence documentaire précise. *Fix:* les intégrer au référentiel de calibrage ou à une spécification métrique versionnée avec cas limites.
- **medium** La sécurité de l’authentification reste exprimée au niveau principe (§4.1 FR-1 à FR-3 ; §7 NFR-5/6) — Le stockage et l’autorisation sont couverts, mais les politiques de session, limitation des tentatives et exigences minimales de mot de passe ne sont pas bornées. *Fix:* fixer un profil de sécurité V1 dans l’architecture et ses critères de test.
- **medium** Le contrat d’export complet du compte reste incomplet (§4.11 FR-50 ; §7 NFR-15 ; §8 SM-7) — Les catégories sont nommées, mais pas le manifeste, les schémas ni le versionnement permettant une recette stable. *Fix:* imposer dans l’architecture un manifeste et des schémas versionnés documentés.
- **low** La réactivité conserve un adjectif non mesuré (§7 NFR-4) — « immédiatement » et « rester utilisable » ne fixent aucun seuil d’accusé de réception ou de blocage de l’interface. *Fix:* définir des budgets UX mesurables pour le feedback et les interactions autorisées pendant le calcul.

## Scope honesty — strong

Les non-objectifs sont explicites (§5), le périmètre inclus est court et cohérent (§6), et les dépendances non encore livrées sont annoncées dès la synthèse puis attribuées dans §10–11. FR-52 clarifie utilement la frontière entre les contraintes du moteur génératif et la liberté de l’éditeur manuel.

### Findings

- **medium** Le cycle de vie du compte reste une décision postérieure alors que l’inscription libre est en V1 (§4.1 ; OQ-9) — La suppression de compte est nommée, mais sans politique provisoire de conservation ou moyen administratif. *Fix:* consigner explicitement la suppression comme non-objectif V1 et définir la politique de conservation applicable jusque-là.

## Downstream usability — strong

Le glossaire est stable, chaque parcours a un protagoniste nommé, et les FR, UJ, SM, NFR et OQ sont identifiables et source-extractibles. Les dépendances documentaires précisent la table OSM attendue et les questions ouvertes attribuent les détails restants à UX, architecture ou spécification moteur (§10–11).

### Findings

- **medium** UJ-2 et UJ-3 n’ont pas de mesure bout en bout équivalente à SM-6 (§2.2 ; §8) — Les exigences associées sont testables isolément, mais la création manuelle et l’optimisation multi-étapes n’ont pas de verdict de parcours complet. *Fix:* étendre SM-6 aux trois UJ ou ajouter deux scénarios d’acceptation bout en bout.

## Shape fit — strong

La forme convient à un produit web multi-utilisateur qui alimente UX, architecture et stories : trois parcours fonctionnellement distincts, exigences regroupées par capacité, non-objectifs visibles, mesures liées à la thèse et addendum réservé aux mécanismes. Le niveau de détail est proportionné aux risques du moteur, des données et de l’auto-hébergement.

### Findings

Aucun finding substantiel.

## Mechanical notes

- FR-1 à FR-53 sont uniques et sans lacune numérique, bien que FR-51 à FR-53 soient placées dans leurs sections sémantiques plutôt qu’en ordre strict ; ce choix améliore la lecture sans casser les références.
- UJ-1 à UJ-3, SM-1 à SM-8, SM-C1 à SM-C4 et OQ-1 à OQ-9 sont continus et sans doublon visible.
- Les renvois vers `spec_route_generator.md` et `addendum.md` sont cohérents et les fichiers existent.
- Aucun tag `[ASSUMPTION]` ni `[NOTE FOR PM]` n’est présent ; aucun index d’hypothèses n’est requis. Les éléments réellement ouverts sont regroupés, attribués et jalonnés en §10.
- Chaque UJ porte Guillaume comme protagoniste nommé. Les noms techniques restent confinés à l’addendum tandis que le vocabulaire produit reste stable dans le PRD.
