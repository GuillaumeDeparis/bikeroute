---
title: "Éditer un parcours sur la carte"
type: 'feature'
created: '2026-08-24'
status: 'done'
review_loop_iteration: 0
baseline_commit: '05b5383deae0be98694c9137fcc68551337399be'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis 2.1/2.2, un parcours posé ne peut plus être modifié : la seule action possible est un reset complet (`reinitialiserPoints`). L'utilisateur ne peut ni ajouter un point après un tracé déjà posé, ni déplacer, supprimer ou réordonner un point existant.

**Approach:** Étendre `poserPoint` (ajout après un tracé déjà posé) et ajouter `deplacerPoint`/`supprimerPoint`/`reordonnerPoint`, tous opérant sur le même état `points` déjà partagé par la carte et la liste. Déplacement de point réutilise le patron `Marker draggable` natif de react-leaflet ; le réordonnancement passe par des boutons ↑/↓ plutôt qu'un drag-and-drop de liste. L'inflexion de segment (glisser une portion du tracé) est différée (cf. `deferred-work.md`).

## Boundaries & Constraints

**Always:**
- Ajouter un point une fois le parcours déjà posé : Boucle → nouveau Point de passage en fin de liste. Aller simple/Multi-étapes **avec** Destination déjà qualifiée → inséré comme Point de passage juste avant la Destination (qui reste toujours dernière). Aller simple/Multi-étapes **sans** Destination → comportement 2.1/2.2 inchangé.
- Déplacer un point existant : `Marker draggable` + `dragend` met à jour sa position et déclenche le recalcul déjà automatique ; le dernier tracé reste affiché pendant le recalcul (jamais de disparition, Banned UX).
- Supprimer via la liste : supprimer le Départ promeut le point suivant au rôle Départ, ou revient à l'état vide (topologie réinitialisée) si c'était l'unique point ; tout autre point est simplement retiré ; le calcul suit les règles déjà en place (pas de calcul tant que la topologie n'a pas assez de points qualifiés).
- Réordonner : boutons ↑/↓ par ligne, jamais sur Départ ni Destination (positions fixes).
- Statut : "Mise à jour…" quand un tracé est déjà affiché (`trace.length > 0`) pendant le recalcul, "Calcul du parcours…" réservé au tout premier calcul.

**Ask First:** Aucune décision bloquante identifiée — les règles d'insertion/promotion ci-dessus couvrent les cas de la matrice I/O.

**Never:**
- Infléchir le tracé en glissant une portion (pas un point existant) — différé, cf. `deferred-work.md`.
- Édition de la géométrie brute retournée par Valhalla (`trace`) — toute mutation opère sur la liste `points`.
- Nouvelle dépendance d'édition de carte (`leaflet-geoman`, `leaflet-editable`, etc.) — pattern maison `Marker draggable` uniquement (aucune lib de ce type dans `package.json`, cf. investigation).
- Drag-and-drop natif dans la liste de points pour réordonner — boutons ↑/↓ (plus simple, plus testable).
- Changement de topologie après coup — reste réservé au reset complet (`reinitialiserPoints`, spec-2-2).
- Bulle de métriques (distance/D+/durée) — Story 2.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ajout après destination (Aller simple) | Départ+Destination déjà posés, nouveau clic carte | Point de passage inséré avant la Destination, recalcul auto | N/A |
| Ajout après destination qualifiée (Multi-étapes) | Départ+point(s)+Destination qualifiée, nouveau clic carte | Point de passage inséré avant la Destination, recalcul auto | N/A |
| Déplacement d'un point | Glisser un Route point vers une nouvelle position | Position mise à jour, recalcul, tracé précédent visible ("Mise à jour…") | Échec calcul → dernier tracé valide conservé (comportement 2.1) |
| Suppression du Départ (autres points présents) | Clic "Supprimer" sur la ligne Départ | Le point suivant devient Départ, recalcul | N/A |
| Réordonnancement | Clic ↑/↓ sur un Point de passage | Ordre mis à jour dans `points`, carte et liste synchronisées, recalcul | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/pages/Atelier.tsx:169-202` (`poserPoint`) -- ajouter la branche "insertion avant Destination" pour aller_simple/multi_etapes quand une Destination existe déjà (actuellement : point ignoré)
- `frontend/src/pages/Atelier.tsx:206-214` (`qualifierDernierPoint`) -- patron de mutation ciblée par `id` à reprendre pour `deplacerPoint`
- `frontend/src/pages/Atelier.tsx:222-227` (`reinitialiserPoints`) -- inchangé, reste le reset complet ; nouvelle fonction `supprimerPoint(id)` à ajouter à côté (promotion du Départ si besoin)
- `frontend/src/pages/Atelier.tsx:145-154` (`pointsCalcul`) -- aucun changement structurel : se redéclenche déjà sur toute mutation de `points`
- `frontend/src/pages/Atelier.tsx:427-445` (liste de points) -- ajouter par ligne : bouton supprimer, boutons ↑/↓ (sauf Départ/Destination)
- `frontend/src/pages/Atelier.tsx:451` -- texte "Calcul du parcours…" → conditionnel selon `trace.length > 0`
- `frontend/src/pages/Atelier.tsx:483-496` (`Marker`) -- gagne `draggable` + `eventHandlers={{ dragend }}`
- `frontend/src/pages/Atelier.css` -- style des boutons ↑/↓/supprimer de la liste
- `frontend/src/pages/Atelier.test.tsx:16-30` (mock `react-leaflet`) -- étendre le mock `Marker` pour exposer `draggable`/`eventHandlers.dragend` par marqueur (actuellement seul `onClick` de la carte est capturé)
- `frontend/src/pages/Atelier.test.tsx` -- nouveau bloc de tests pour la matrice I/O ci-dessus

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/pages/Atelier.tsx` -- étendre `poserPoint` (insertion avant Destination si déjà qualifiée) -- livre l'AC "ajouter après un tracé existant"
- [x] `frontend/src/pages/Atelier.tsx` -- ajouter `deplacerPoint(id, lat, lon)`, brancher `Marker draggable`/`dragend` -- livre l'AC "déplacer un point"
- [x] `frontend/src/pages/Atelier.tsx` -- ajouter `supprimerPoint(id)` (promotion du Départ si besoin) et boutons supprimer/↑/↓ dans la liste -- livre l'AC "supprimer/réordonner" ; ajoute aussi `reordonnerPoint(id, décalage)` (non listée séparément dans le Code Map mais nécessaire à l'AC), et relâche la garde d'affichage de la liste de `points.length > 1` à `> 0` pour que le Départ seul reste supprimable (Design Notes : "sans second point, retour à l'état initial")
- [x] `frontend/src/pages/Atelier.tsx` -- texte de statut conditionnel "Mise à jour…"/"Calcul du parcours…" -- livre NFR-4
- [x] `frontend/src/pages/Atelier.tsx` -- `pointsCalcul` (aller_simple) aligné sur la dérivation `points` déjà utilisée par multi_etapes (au lieu de `[depart, destination]` seul), pour que les Points de passage insérés après coup en aller simple soient bien envoyés au moteur de calcul -- non listé dans le Code Map d'origine ("aucun changement structurel") mais nécessaire : sans cet ajustement, un point inséré entre Départ et Destination en aller simple n'aurait jamais été transmis à `calculerParcours`
- [x] `frontend/src/pages/Atelier.test.tsx` -- étendre le mock `react-leaflet` (drag) et couvrir la matrice I/O ci-dessus + non-régression 2.1/2.2 ; les deux tests de verrouillage post-Destination de 2.1/2.2 ("3e point ignoré", "point posé après verrouillage Multi-étapes ignoré") sont réécrits pour refléter le nouveau comportement d'insertion (le verrouillage qu'ils vérifiaient est précisément ce que cette story remplace)
- [x] `frontend/src/pages/Atelier.tsx` -- (patch review) `supprimerPoint` lisait/écrivait via la fermeture `points` au lieu de la forme fonctionnelle `setPoints(prev => ...)` utilisée par tous les autres mutateurs -- deux suppressions déclenchées avant un re-rendu pouvaient s'écraser l'une l'autre ; réécrite en forme fonctionnelle, avec un nouvel effet réagissant à `points.length === 0` pour réinitialiser la topologie (jamais de lecture différée d'une fermeture obsolète)
- [x] `frontend/src/pages/Atelier.tsx` -- (patch review) l'effet de calcul ne faisait rien quand une édition rendait `pointsCalcul` obsolète (ex: suppression de la Destination) -- le dernier tracé restait affiché indéfiniment alors qu'il ne correspondait plus à aucun point sur la carte (reproduit en revue) ; il efface désormais `trace`/`erreurCalcul` dans ce cas
- [x] `frontend/src/pages/Atelier.tsx` -- (patch review) classe CSS `atelier__actions-deplacer` posée sur les boutons ↑/↓ sans règle correspondante dans `Atelier.css` (classe morte) -- retirée
- [x] `frontend/src/pages/Atelier.tsx` -- (patch review) commentaire de `reinitialiserPoints` référençant encore la branche `precedent.length === 1` de `poserPoint`, remplacée par `destinationExistante` dès la story 2.3 -- mis à jour
- [x] `frontend/src/pages/Atelier.test.tsx` -- (patch review) deux scénarios manquants ajoutés : texte "Calcul du parcours…" du tout premier calcul (jusque-là jamais asserté), et suppression de la Destination en aller simple avec un point de passage déjà inséré (le clic suivant doit re-qualifier une nouvelle Destination plutôt que rester bloqué -- comportement déjà codé mais non couvert)

**Acceptance Criteria:**
- Given un parcours existe avec au moins un point, when j'ajoute un nouveau point après le départ, then il naît Point de passage et le parcours est recalculé automatiquement.
- Given je glisse un Route point existant vers une nouvelle position, when je relâche, then sa position est mise à jour, le tracé est recalculé, et le dernier tracé reste visible pendant le recalcul ("Mise à jour…").
- Given je supprime ou réordonne un point, when l'action est confirmée, then le parcours est recalculé et la liste de points reste synchronisée avec la carte.

## Design Notes

- **Inflexion de segment différée** (`deferred-work.md`) : mécanique la plus neuve du lot (marqueurs milieu-de-segment, cas particulier de fermeture en Boucle) ; les 3 AC retenues livrent déjà une capacité d'édition complète sans elle.
- **Pourquoi pas de lib d'édition de carte :** `leaflet-geoman`/`leaflet-editable` imposeraient une API impérative hors du modèle react-leaflet déjà en place, un reskin visuel, et une testabilité dégradée (le mock actuel de `react-leaflet` ne couvre pas une lib montée directement sur l'instance Leaflet).
- **Synchronisation carte↔liste :** déjà acquise structurellement -- carte et liste lisent le même état `points` ; aucune plomberie de synchronisation dédiée à écrire, seulement s'assurer que toute nouvelle action (ajout/déplacement/suppression/réordonnancement) passe par `setPoints`.
- **Suppression du Départ :** promeut `points[1]` (s'il existe) au rôle `depart`, conservant ses `lat`/`lon` ; sans second point, retour à l'état initial (`points: []`, `topologie: undefined`), équivalent à `reinitialiserPoints`.
- **Réordonnancement via boutons plutôt que drag de liste :** satisfait "réordonner" sans introduire un second paradigme de glissé-déposé, plus simple à tester (clic déterministe vs. simulation de drag DOM).

## Verification

**Commands:**
- `cd frontend && npm run test` -- `Atelier.test.tsx` (nouveaux scénarios + non-régression 2.1/2.2) passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur

**Manual checks (if no CLI):**
- Poser un aller simple (départ+destination), reposer un point : inséré comme Point de passage avant la Destination, tracé recalculé.
- Glisser un point existant vers une nouvelle position : tracé recalculé, ancien tracé visible pendant "Mise à jour…".
- Supprimer le Départ (parcours à 3+ points) : le point suivant devient Départ.

## Suggested Review Order

### Review Findings

- [x] [Review][Decision] Rendre le déplacement d’un point utilisable sans dispositif de pointage — résolu : la V1 assume explicitement le glisser souris/tactile comme unique interaction de déplacement ; aucune alternative clavier n’est ajoutée dans cette story.
- [x] [Review][Patch] Remettre `calculEnCours` à faux lorsqu’une édition annule le calcul et rend le parcours incomplet ou vide [frontend/src/pages/Atelier.tsx:353]
- [x] [Review][Patch] Permettre de supprimer le Départ seul avant même le choix d’une topologie [frontend/src/pages/Atelier.tsx:530]
- [x] [Review][Patch] Invalider l’ancien état `nonRoute` dès qu’un point est déplacé [frontend/src/pages/Atelier.tsx:253]
- [x] [Review][Patch] Masquer ou désactiver les actions Monter/Descendre impossibles aux bornes fixes [frontend/src/pages/Atelier.tsx:572]
- [x] [Review][Patch] Donner aux actions de liste des noms accessibles identifiant le point ciblé [frontend/src/pages/Atelier.tsx:572]
- [x] [Review][Patch] Autoriser le retour à la ligne des commandes d’édition sur panneau étroit [frontend/src/pages/Atelier.css:177]
- [x] [Review][Patch] Tester l’annulation d’un calcul en vol suivie d’une suppression ou d’un reset [frontend/src/pages/Atelier.test.tsx:726]
- [x] [Review][Patch] Tester la suppression du Départ seul avant choix de topologie [frontend/src/pages/Atelier.test.tsx:604]
- [x] [Review][Patch] Couvrir le déplacement d’un point non routé et l’échec de son recalcul [frontend/src/pages/Atelier.test.tsx:537]
- [x] [Review][Patch] Exercer le réordonnancement Descendre et vérifier l’ordre transmis au calcul [frontend/src/pages/Atelier.test.tsx:659]

**Ajouter après un tracé existant**

- Entrée : `insererAvantDernier`, utilitaire d'insertion partagé aller_simple/multi_etapes.
  [`Atelier.tsx:80`](../../frontend/src/pages/Atelier.tsx#L80)

- `poserPoint` : insertion avant la Destination une fois qu'elle est qualifiée (avant cette story, ce clic était ignoré).
  [`Atelier.tsx:180`](../../frontend/src/pages/Atelier.tsx#L180)

**Déplacer / réordonner un point**

- `deplacerPoint`, branché sur `Marker draggable`/`dragend`.
  [`Atelier.tsx:253`](../../frontend/src/pages/Atelier.tsx#L253)

- `reordonnerPoint` : garde-fou sur le point déplacé et son voisin, bloque tout échange avec Départ/Destination.
  [`Atelier.tsx:262`](../../frontend/src/pages/Atelier.tsx#L262)

- Rendu `Marker` : `draggable` + `eventHandlers.dragend`.
  [`Atelier.tsx:646`](../../frontend/src/pages/Atelier.tsx#L646)

**Supprimer un point (dont le correctif de revue)**

- `supprimerPoint`, forme fonctionnelle (corrigé en revue : lisait la fermeture `points`).
  [`Atelier.tsx:293`](../../frontend/src/pages/Atelier.tsx#L293)

- Effet de filet de sécurité : réinitialise la topologie quand `points` devient vide.
  [`Atelier.tsx:325`](../../frontend/src/pages/Atelier.tsx#L325)

- Effet de calcul : efface le tracé/l'erreur obsolètes quand une édition rend `pointsCalcul` incomplet (corrigé en revue, régression reproduite).
  [`Atelier.tsx:353`](../../frontend/src/pages/Atelier.tsx#L353)

**Statut de recalcul (NFR-4)**

- "Mise à jour…" vs "Calcul du parcours…" selon qu'un tracé est déjà affiché.
  [`Atelier.tsx:605`](../../frontend/src/pages/Atelier.tsx#L605)

**Peripherals**

- Boutons ↑/↓/Supprimer par ligne de la liste de points.
  [`Atelier.tsx:572`](../../frontend/src/pages/Atelier.tsx#L572)

- Styles des actions de liste.
  [`Atelier.css`](../../frontend/src/pages/Atelier.css)

- Mock `react-leaflet` étendu (drag) + nouveaux scénarios (matrice I/O, dont les 2 ajoutés en revue).
  [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)
