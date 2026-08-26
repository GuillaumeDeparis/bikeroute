---
title: "Inverser le sens d'un parcours"
type: 'feature'
created: '2026-08-24'
status: 'done'
review_loop_iteration: 0
baseline_commit: '4876b4a981b8a0ff6869841e2bb304274fe23e05'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un parcours Boucle ou Aller simple déjà tracé ne peut pas être exploré dans l'autre sens sans le reconstruire point par point.

**Approach:** Ajouter une action "Inverser" dans le panneau "Parcours en cours" qui réordonne `points` (Boucle : garde le Départ, inverse l'ordre des Points de passage ; Aller simple : échange Départ/Destination et inverse l'ordre des points intermédiaires) — le pipeline de recalcul existant (déclenché par tout changement de `points`) fait le reste, aucun changement backend.

## Boundaries & Constraints

**Always:**
- "Inverser" visible dans le panneau "Parcours en cours" pour Boucle (≥1 Point de passage) et Aller simple (Destination qualifiée) uniquement — jamais en Multi-étapes (hors scope des AC de cette story).
- Boucle : le Départ reste le Départ (point fixe de la boucle) ; seul l'ordre des Points de passage est inversé.
- Aller simple : Départ et Destination échangent leurs rôles ; les points de passage intermédiaires (spec-2-3) sont eux aussi inversés en ordre, en conservant leur rôle (`point_de_passage`/`etape_utilisateur`).
- Les `id` de chaque point sont conservés lors de l'inversion (réordonnancement/réattribution de rôle sur les mêmes objets, jamais de nouveaux points créés) -- `nonRoute` et toute autre donnée de point survivent tels quels jusqu'au prochain recalcul.
- Le recalcul suit automatiquement le pipeline existant (`pointsCalcul`/`cleCalcul`) : dernier tracé visible pendant "Mise à jour…", comme pour toute autre édition (spec-2-3).

**Ask First:** Aucune décision bloquante -- l'emplacement du bouton (panneau "Parcours en cours") est un choix de spec en l'absence de maquette dédiée, documenté en Design Notes.

**Never:**
- Recalcul de métriques/D+/caractéristiques de montée -- n'existent pas encore dans le code (Story 2.5 non livrée) ; cette partie des AC (epics.md) est non applicable tant que 2.5 n'est pas faite.
- Inversion en Multi-étapes -- hors scope des AC de cette story.
- Modification du backend/moteur de calcul -- topologie-agnostique, purement fonction de l'ordre des points reçus (confirmé par investigation) ; l'inversion se fait entièrement côté frontend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inverser Boucle | Boucle avec 2 Points de passage, clic "Inverser" | Départ inchangé, ordre des 2 Points de passage inversé, recalcul auto | N/A |
| Inverser Aller simple, sans point de passage | Départ+Destination, clic "Inverser" | Départ et Destination échangent leurs rôles/positions, recalcul auto | N/A |
| Inverser Aller simple, avec point de passage | Départ+Point de passage+Destination, clic "Inverser" | Ordre complet inversé (Destination→Départ, Point de passage conservé au milieu, Départ→Destination), recalcul auto | N/A |
| Bouton absent | Multi-étapes actif, ou Boucle/Aller simple incomplet | Aucun bouton "Inverser" affiché | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/pages/Atelier.tsx:159-186` -- dérivations `depart`/`destination`/`pointsDePassage`/`pointsCalcul` : aucun changement structurel, `inverserSens` ne fait que réordonner `points`
- `frontend/src/pages/Atelier.tsx:283-306` (`reordonnerPoint`) -- patron de mutation par réordonnancement à reprendre
- `frontend/src/pages/Atelier.tsx:314-338` (`supprimerPoint`) -- patron de réattribution de rôle (promotion Départ) à reprendre pour le nouveau Départ/Destination en aller simple
- `frontend/src/pages/Atelier.tsx:557-579` (panneau "Parcours en cours") -- nouveau bouton "Inverser", visibilité conditionnelle par topologie
- `frontend/src/pages/Atelier.test.tsx:510` -- nouveau `describe('Atelier — inversion du sens (spec-2-4)', ...)` en fin de fichier

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/pages/Atelier.tsx` -- ajouter `inverserSens()` : Boucle → `[depart, ...pointsDePassage.slice().reverse()]` ; Aller simple → `[...points].reverse()` avec réattribution `depart`/`destination` aux extrémités -- livre les 2 AC de la story
- [x] `frontend/src/pages/Atelier.tsx` -- bouton "Inverser" dans le panneau "Parcours en cours", visible seulement Boucle (≥1 Point de passage) / Aller simple (Destination qualifiée)
- [x] `frontend/src/pages/Atelier.test.tsx` -- couvrir la matrice I/O ci-dessus (dont la vérification de l'ordre envoyé à `calculerParcours` après inversion)
- [x] `frontend/src/pages/Atelier.css`, `Atelier.tsx` -- (patch review) le bouton "Inverser" n'avait aucune classe CSS correspondante (rendu par défaut du navigateur, incohérent avec le reste du panneau) -- classe `atelier__inverser` ajoutée, stylée comme les autres actions du panneau
- [x] `frontend/src/pages/Atelier.tsx` -- (patch review) commentaire de `inverserSens` affirmant à tort ne dépendre d'aucune fermeture du composant, alors qu'il lit encore `topologie` -- précisé (sans risque, `topologie` ne change jamais de façon concurrente à une inversion)
- [x] `frontend/src/pages/Atelier.test.tsx` -- (patch review) 3 scénarios manquants ajoutés : statut "Mise à jour…" pendant le recalcul après inversion, Aller simple à deux Points de passage (l'ordre complet est inversé, pas seulement les extrémités), et inversion appliquée deux fois de suite (retour à l'ordre initial)

### Review Findings

- [x] [Review][Patch] Garantir un recalcul après chaque inversion, y compris une Boucle avec un seul Point de passage [`frontend/src/pages/Atelier.tsx`]
- [x] [Review][Patch] Vérifier par test que l'inversion conserve les `id`, `nonRoute` et autres métadonnées des points [`frontend/src/pages/Atelier.test.tsx`]

**Acceptance Criteria:**
- Given j'ai un parcours de type Boucle, when je déclenche Inverser, then le sens de parcours est inversé (ordre des Points de passage) et le tracé est recalculé.
- Given j'ai un parcours de type Aller simple, when je déclenche Inverser, then le départ et l'arrivée sont échangés et le tracé est recalculé en conséquence.

## Design Notes

- **Emplacement du bouton :** aucune maquette ne couvre "Inverser" (recherche exhaustive dans les mockups/wireframes UX, aucun résultat) ; `EXPERIENCE.md` ne l'associe qu'à l'Expandable metric bubble (Story 2.5, inexistante). Le panneau "Parcours en cours" déjà en place est donc le seul emplacement cohérent disponible aujourd'hui.
- **Boucle vs Aller simple, deux réordonnancements différents :** la Boucle n'a pas de Destination distincte (le Départ ferme la boucle, géré à part par `pointsCalcul`) -- un `reverse()` global inverserait aussi le Départ, ce qui n'a pas de sens pour une boucle. Seuls les Points de passage sont donc inversés, le Départ reste fixe.
- **Métriques/montées non applicables :** le domaine ne calcule aujourd'hui que la géométrie (`RouteResult.geometry`) -- rien à recalculer sur ce plan tant que la Story 2.5 n'introduit pas D+/D-/profil.

## Verification

**Commands:**
- `cd frontend && npm run test` -- `Atelier.test.tsx` (nouveaux scénarios + non-régression) passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur
- Revue CR 2-4 : 6 fichiers de tests, 76 tests passés ; TypeScript, oxlint et `git diff --check` passent.

**Manual checks (if no CLI):**
- Boucle avec 2 points de passage, cliquer "Inverser" : le Départ ne bouge pas, le tracé se recalcule dans l'autre sens.
- Aller simple avec un point de passage, cliquer "Inverser" : la Destination devient le Départ et vice-versa, le tracé se recalcule.

## Suggested Review Order

- Entrée : `inverserSens`, deux branches (Boucle garde le Départ ; Aller simple échange les extrémités et réordonne le reste).
  [`Atelier.tsx:379`](../../frontend/src/pages/Atelier.tsx#L379)

- `peutInverserSens` : visibilité du bouton par topologie et complétude du parcours.
  [`Atelier.tsx:424`](../../frontend/src/pages/Atelier.tsx#L424)

- Bouton "Inverser" dans le panneau "Parcours en cours" (classe `atelier__inverser` ajoutée en revue).
  [`Atelier.tsx:641`](../../frontend/src/pages/Atelier.tsx#L641)

**Peripherals**

- Style du bouton "Inverser" (correctif de revue).
  [`Atelier.css`](../../frontend/src/pages/Atelier.css)

- Matrice I/O + 3 scénarios ajoutés en revue ("Mise à jour…", deux points de passage, inversion double).
  [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)
