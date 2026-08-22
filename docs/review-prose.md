# Revue éditoriale — Prose

Ce PRD et son addendum existent pour permettre aux responsables produit, UX et architecture de comprendre la décision V1 et de la transformer en travail vérifiable.

Le texte adopte volontairement une voix normative, concise et technique. Les identifiants FR/NFR, les termes métier définis dans le glossaire et les exemples concrets sont à préserver. Les corrections ci-dessous visent uniquement la clarté, la grammaire et la cohérence terminologique dans la structure retenue.

| Pass | Original Text | Revised Text | Changes |
| --- | --- | --- | --- |
| prose | PRD §2 — « La cible initiale est un cycliste sur route, loisir ou loisir avancé » | « La cible initiale est un cycliste sur route de niveau loisir ou loisir avancé » | Corrige l'ellipse grammaticale sans modifier la cible. |
| prose | PRD §1 — « produire des parcours vélo de route crédibles selon la distance, le dénivelé, la difficulté, la direction, la qualité routière, le profil des montées et la nouveauté recherchés » | « produire des parcours vélo de route crédibles au regard de la distance, du dénivelé, de la difficulté, de la direction, de la qualité routière, du profil des montées et de la nouveauté recherchés » | Rend explicite la relation entre crédibilité et critères ; conserve la liste intacte. |
| prose | PRD UJ-1 — « Si aucun candidat valide n'est disponible après une minute » | « Si aucun candidat valide n'est disponible après 60 secondes » | Aligne l'unité sur FR-35, NFR-3 et les critères de test. |
| prose | PRD §4.3 et §4.4 — « Réalise UJ-2. » / « Réalise UJ-1 et UJ-3. » | « Parcours couvert : UJ-2. » / « Parcours couverts : UJ-1 et UJ-3. » | Remplace deux fragments sans sujet par des libellés cohérents et faciles à balayer. |
| prose | PRD FR-9 — « les métriques et les montées dépendant du sens » | « les métriques et les caractéristiques des montées qui dépendent du sens » | Corrige l'attachement ambigu du participe et précise ce qui est recalculé. |
| prose | PRD FR-44 — « Le système ne supprime silencieusement aucune donnée incompatible et demande confirmation avant son retrait. » | « Le système ne supprime aucune donnée incompatible sans confirmation de l'utilisateur. » | Supprime une négation lourde et un référent singulier ambigu. |
| prose | PRD FR-45 — « demande explicitement toute information devenue obligatoire avant recalcul et fait confirmer toute suppression ou conversion nécessaire » | « demande toute information devenue obligatoire avant le recalcul et exige une confirmation pour toute suppression ou conversion nécessaire » | Corrige la tournure « fait confirmer » et ajoute l'article manquant. |
| prose | PRD FR-33 — « Il peut afficher un tracé provisoire à condition de le distinguer clairement d'un candidat validé. » | « Il peut afficher un tracé provisoire à condition que l'interface le distingue clairement d'un candidat validé. » | Élimine l'ambiguïté sur l'acteur responsable de la distinction visuelle. |
| prose | PRD FR-51, NFR-16, SM-8 et addendum §2 — « baseline » | « référentiel d'évaluation » | Remplace l'anglicisme non défini par un terme français unique ; appliquer aux quatre occurrences. |
| prose | PRD Synthèse, §0, FR-5, NFR-12 et périmètre — « application/interface web responsive » | Première occurrence : « application web adaptative (responsive) » ; suivantes : « application » ou « interface adaptative » | Définit une fois le terme technique puis emploie le français recommandé. |
| prose | PRD NFR-9 — « une méthode backend unique et versionnée » | « une méthode serveur unique et versionnée » | Remplace un anglicisme évitable sans changer la séparation client-serveur. |
| prose | PRD FR-51, NFR-16, questions ouvertes et addendum §2 — « calibration » | « calibrage » | Uniformise le nom d'action en français ; conserver « calibrer » lorsqu'il est déjà employé comme verbe. |
| prose | Addendum §3.3 — « le moteur choisit un point d'arrivée sous distance et direction » | « le moteur choisit un point d'arrivée selon les contraintes de distance et de direction » | Corrige une construction elliptique qui gêne la compréhension. |
| prose | PRD SM-1 à SM-8 — « Valide FR-… » | « Exigences associées : FR-… » | Évite l'ambiguïté : une mesure ne valide pas automatiquement une exigence, elle lui est associée. |
| prose | PRD §11 — « la politique de temps 15/60 secondes » | « les règles temporelles à 15 et 60 secondes » | Remplace une formulation compacte mais peu naturelle par une expression immédiatement compréhensible. |
| prose | Addendum §1 — « Chaque dimension devrait conserver la valeur réelle en plus de son score » | Consider: « Chaque dimension conserve la valeur réelle en plus de son score » ? | Le reste du document est normatif ; retirer le conditionnel seulement si cette phrase exprime bien une décision acquise. |

## Synthèse

16 corrections regroupées sont recommandées. Elles préservent la voix normative et le contenu produit ; aucune ne modifie la structure, les exigences ou les décisions.
