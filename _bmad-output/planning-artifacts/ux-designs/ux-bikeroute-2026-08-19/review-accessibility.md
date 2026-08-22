# Revue accessibilité — bikeroute

Date : 2026-08-20  
Périmètre : `DESIGN.md`, `EXPERIENCE.md`, memlog, wireframes et direction Sport accessible.  
Cadre : audit prospectif d’un produit consumer responsive cartographique. La maquette demandée reste fonctionnelle à la souris uniquement; clavier, lecteur d’écran et conformité normative ne sont donc **pas des bloqueurs du prototype**.

## Verdict

**Prototype souris : favorable, aucun bloqueur accessibilité dans le périmètre convenu.** Les contrats posent de bonnes bases (sens jamais porté par la couleur seule, points différenciés, libellés d’incertitude, stabilité pendant recalcul, localisation anticipée), mais ils ne sont pas encore suffisants pour guider une implémentation produit accessible.

**Produit futur : 3 risques élevés, 5 moyens, 2 faibles.** Les risques élevés concernent le contraste du CTA orange, l’absence d’alternative opérable à la manipulation cartographique et l’absence de contrat d’annonce des changements asynchrones. Ils doivent être résolus avant production, sans contraindre la validation de la maquette actuelle.

## Findings

### Élevé — Produit futur uniquement

| ID | Emplacement | Finding | Correction attendue avant production |
|---|---|---|---|
| A11Y-01 | `DESIGN.md` — `colors.accent`, `colors.on-accent`, Primary button | `#FFFFFF` sur `#F05A28` offre un contraste d’environ **3,3:1** : insuffisant pour du texte de taille normale. L’accent est aussi utilisé comme bordure de focus sur blanc, avec le même risque de contraste insuffisant pour un indicateur d’état. | Assombrir l’orange destiné aux fonds interactifs, ou employer `{colors.ink}` sur l’orange; séparer si nécessaire `accent`, `accent-interactive` et `focus-ring`, puis documenter les combinaisons autorisées. Vérifier les contrastes sur carte réelle, pas seulement sur surface blanche. |
| A11Y-02 | `EXPERIENCE.md` — Interaction Primitives, Route point, UJ-2/UJ-3 | Les tâches essentielles reposent sur clic, glisser-déposer et sélection de points sur une carte. Aucun chemin produit équivalent n’est défini pour créer, déplacer, qualifier et réordonner départ, passages, étapes et destination sans manipulation spatiale fine. | Définir avant production une liste de points entièrement opérable (ajout par recherche/adresse/coordonnées, modification, suppression, rôle, ordre et déplacement), synchronisée avec la carte. Le prototype souris peut conserver ses gestes actuels. |
| A11Y-03 | `EXPERIENCE.md` — State Patterns 0–15/15–60/60 s, recalcul, enregistrement/export | Les états temporels sont visuellement bien décrits mais aucun contrat ne précise quelles mises à jour sont annoncées, à quel moment, ni comment éviter une avalanche d’annonces pendant recalcul. Une personne qui ne voit pas le banner ou les métriques peut manquer le ralentissement à 15 s, le résultat terminal à 60 s ou un échec. | Définir des statuts annoncés de façon non intrusive pour démarrage/recalcul, palier 15 s et valeurs stabilisées; annonce prioritaire unique pour résultat terminal, échec ou annulation. Ne pas annoncer chaque étape animée ni chaque variation intermédiaire. |

### Moyen — Produit futur uniquement

| ID | Emplacement | Finding | Correction attendue avant production |
|---|---|---|---|
| A11Y-04 | `DESIGN.md` — `ink-muted`, `route-secondary`, captions; carte | `#7895A5` sur blanc est proche de **3:1** et ne convient pas à du texte courant de 12 px. Les tracés secondaires atténués risquent en outre de disparaître selon le fond OSM et la vision des couleurs. | Réserver `ink-muted` aux éléments non textuels suffisamment épais ou l’assombrir pour les captions. Spécifier halo/contour, motif ou style de ligne et identifiant numérique des tracés; tester sur plusieurs tuiles OSM et niveaux de zoom. |
| A11Y-05 | `DESIGN.md` — Proposal card, Mode switch, Route point; `EXPERIENCE.md` — focus initial | Le focus visuel est décrit essentiellement par une bordure orange et le contrat ne distingue pas clairement focus clavier, sélection explorée, tracé actif et choix accepté. | Créer des tokens et états séparés (`focus-visible`, `explored`, `selected/accepted`, `disabled`) combinant contour, forme/icône et texte. Prévoir un focus visible non masqué par panneaux, bottom sheet ou carte. |
| A11Y-06 | `EXPERIENCE.md` — Comparison modal, Contextual menu, Bottom sheet, inspector | La restauration du focus de la modale est mentionnée, mais pas son confinement, son titre accessible, sa fermeture clavier, ni la gestion du focus lors du remplacement du panneau tablette/mobile. Les menus ancrés aux points peuvent perdre leur référent après recalcul. | Avant production, préciser entrée/sortie et ordre de focus pour modale, menus, inspecteur et bottom sheet; conserver un titre programmatique, une fermeture explicite et le retour au déclencheur ou au point logique survivant. |
| A11Y-07 | `DESIGN.md` — animations; `EXPERIENCE.md` — carte recadrée au focus/survol | Les animations sont courtes et non décoratives, mais aucune variante de réduction du mouvement n’est prévue. Le recadrage automatique au survol/focus peut provoquer mouvement répété, désorientation ou perte du contexte spatial. | Respecter la préférence de mouvement réduit; supprimer ou remplacer transitions et recadrages non indispensables. Ne recadrer qu’à l’activation explicite, ou limiter fréquence/amplitude et fournir une action « Recentrer ». |
| A11Y-08 | `EXPERIENCE.md` — smartphone, cartes horizontales, bottom sheet; `DESIGN.md` — composants | Aucune taille minimale ni marge entre cibles n’est décidée. Les points cartographiques, la boussole, les poignées de sheet, Undo et menus compacts sont particulièrement exposés aux erreurs tactiles, même si le prototype est évalué à la souris. | Fixer avant production une cible tactile minimale et des espacements cohérents; agrandir la zone interactive sans grossir nécessairement l’icône. Prévoir des alternatives aux gestes de précision et empêcher le conflit swipe horizontal/drag carte/sheet. |

### Faible — Clarification de contrat

| ID | Emplacement | Finding | Correction attendue avant production |
|---|---|---|---|
| A11Y-09 | `DESIGN.md` Typography; `EXPERIENCE.md` Foundation/Comparison | L’internationalisation est anticipée, mais le contrat ne couvre pas zoom texte, reflow, sens RTL, formats D+/durée ni tableaux comparatifs étroits. Les tailles 12–13 px rendent captions et labels fragiles. | Ajouter des tests de contrat : zoom texte/reflow sans perte, libellés longs, formats localisés, unités non ambiguës, ordre logique indépendant de la position et stratégie de comparaison mobile autre qu’un tableau écrasé. |
| A11Y-10 | `DESIGN.md` — Compass control et icônes; `EXPERIENCE.md` — Metric bubble | Les icônes ambiguës doivent avoir des libellés, mais le contrat ne distingue pas nom accessible, tooltip souris et texte visible. La bulle repliée autorise des icônes simples pour des métriques/alertes potentiellement ambiguës. | Documenter pour chaque contrôle iconique un nom programmatique stable et, si ambigu, un libellé visible ou tooltip; associer valeurs et unités aux métriques. Une alerte critique mobile doit rester textuelle, comme le prévoit déjà le floor. |

## Forces observées

- La décision de prototype souris est explicitement séparée du niveau d’accessibilité du produit; elle n’est pas transformée en interdiction future.
- Couleur, rang, score, conformité, incertitude et états sémantiques sont accompagnés de texte; l’orange n’est pas présenté comme preuve de qualité ou de sécurité.
- Départ, passage, étape et destination doivent employer formes/icônes et libellés distincts, ce qui protège contre une dépendance à la couleur seule.
- Le dernier tracé et la structure des métriques restent stables pendant recalcul; les erreurs, inconnues et résultats partiels sont nommés et actionnables.
- La modale prévoit déjà une restauration du focus; mobile ne dépend pas du hover; les chaînes sont externalisées et les libellés longs anticipés.
- Les animations sont fonctionnelles, courtes et sans mouvement décoratif continu.

## Gate recommandé

La maquette peut être finalisée telle quelle dans son périmètre souris. Avant implémentation produit, intégrer au minimum A11Y-01 à A11Y-08 dans les spines ou dans des critères d’acceptation techniques, puis réaliser des essais sur fonds OSM réels, au clavier, avec lecteur d’écran, zoom/reflow et appareils tactiles.
