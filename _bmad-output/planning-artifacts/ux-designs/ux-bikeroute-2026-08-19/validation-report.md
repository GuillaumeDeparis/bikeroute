# Rapport de validation UX — bikeroute

- **DESIGN.md :** `DESIGN.md`
- **EXPERIENCE.md :** `EXPERIENCE.md`
- **Exécuté le :** 2026-08-20

## Synthèse

La paire forme une base cohérente pour l’atelier cartographique, les trois topologies, la génération 15/60 secondes et la comparaison sans recommandation implicite. Elle reste trop mince pour une implémentation complète sur plusieurs contrôles et états essentiels.

La maquette souris n’a aucun bloqueur d’accessibilité dans son périmètre convenu. Pour le futur produit, les priorités sont le contraste de l’accent orange, une alternative aux manipulations cartographiques fines et l’annonce maîtrisée des recalculs et états temporels.

## Verdicts par catégorie

- Flow coverage — **adequate**
- Token completeness — **adequate**
- Component coverage — **thin**
- State coverage — **thin**
- Visual reference coverage — **strong**
- Bloat & overspecification — **adequate**
- Inheritance discipline — **adequate**
- Shape fit — **strong**

## Findings par sévérité

### Critique (0)

Aucun.

### Élevé (7)

- **Flux UJ-1 :** après édition d’une proposition, engager le recalcul du score, de la conformité, de la fiabilité et des écarts, ainsi que l’état « Généré puis modifié ».
- **Flux UJ-2 :** définir le déplacement d’une portion et l’enregistrement avec nom, note et tags, y compris reprise d’échec.
- **Composants :** contractualiser recherche de lieu, champs, choix, cases, liste réordonnable et formulaire d’enregistrement dans les deux spines.
- **États carte et recherche :** couvrir fond de carte indisponible, recherche en cours/vide/sans résultat et point non routable.
- **A11Y-01 :** blanc sur orange `#F05A28` ≈ 3,3:1; assombrir l’accent interactif ou employer une encre sombre.
- **A11Y-02 :** avant production, fournir dans la liste des points une alternative complète aux manipulations spatiales fines.
- **A11Y-03 :** avant production, annoncer sans bruit le recalcul, le palier 15 s et l’état terminal 60 s.

### Moyen (11)

- Séparer le climax de reprise de parcours de l’export des données du compte.
- Fixer une cible de contraste testable pour les combinaisons porteuses.
- Canoniser `Status banner` et contractualiser `Skeleton`.
- Contractualiser le tableau comparatif et son adaptation mobile.
- Définir les validations du formulaire Assisté et les changements de topologie incompatibles.
- Uniformiser les noms de composants et simplifier le chemin de source de la spec détaillée.
- **A11Y-04 :** renforcer les textes atténués et différencier les tracés autrement que par la couleur.
- **A11Y-05 :** distinguer focus, proposition explorée et parcours accepté.
- **A11Y-06 :** définir la gestion future du focus pour modale, menus, inspecteur et bottom sheet.
- **A11Y-07 :** prévoir réduction des mouvements et limiter le recadrage automatique.
- **A11Y-08 :** fixer avant production des cibles tactiles et éviter les conflits de gestes mobile.

### Faible (5)

- Réduire la répétition de la règle de dominance cartographique.
- Couvrir session expirée ou données obsolètes uniquement si l’architecture le permet.
- Employer le chemin direct vers `docs/spec_route_generator_latest.md`.
- **A11Y-09 :** tester zoom/reflow, libellés longs, unités localisées et comparaison mobile.
- **A11Y-10 :** donner aux contrôles iconiques un nom stable et un libellé/tooltip si ambigu.

## Fichiers reviewers

- `review-rubric.md`
- `review-accessibility.md`
