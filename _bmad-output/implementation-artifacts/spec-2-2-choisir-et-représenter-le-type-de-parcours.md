---
title: "Choisir et représenter le type de parcours"
type: 'feature'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'cd7da5cf5ac7f65ccec31ed770c54634a959712e'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Atelier manuel (Story 2.1) ne connaît qu'un aller simple implicite à 2 points ; l'utilisateur ne peut ni choisir explicitement une topologie (Boucle/Aller simple/Multi-étapes) ni qualifier le rôle des points au-delà de départ/destination.

**Approach:** Le Contextual menu impose un choix de topologie dès le départ posé ; chaque topologie pilote ensuite le rôle des points posés (Point de passage par défaut, qualification Étape utilisateur/Destination en Multi-étapes) et le calcul, qui reste le moteur de tracé existant (déjà capable de N points ordonnés) — seule la borne `max_length=2` de la requête HTTP est levée.

## Boundaries & Constraints

**Always:**
- Départ posé → le Contextual menu impose Boucle/Aller simple/Multi-étapes avant tout autre point (jamais de topologie implicite/par défaut).
- Boucle : aucune Destination ; chaque point suivant est Point de passage ; le calcul (dès ≥1 point de passage) envoie au moteur la liste ordonnée + le départ répété en dernier point, pour fermer la boucle.
- Aller simple : comportement de 2.1 conservé — le 2e point posé devient Destination, calcul immédiat, 3e point ignoré.
- Multi-étapes : chaque point posé après le départ naît Point de passage ; un petit sélecteur inline (sur le point qui vient d'être posé) permet de le qualifier Étape utilisateur ou Destination ; le calcul se déclenche dès qu'une Destination est qualifiée, et aucun point supplémentaire n'est accepté ensuite (même règle de verrouillage que l'aller simple).
- Chaque `PointAtelier` porte un identifiant stable unique (jamais le seul `role`, partagé par plusieurs Points de passage) utilisé comme clé React et pour le bandeau non-routé.
- Le panneau principal n'affiche le libellé/rôle des points que pour la topologie active.

**Never:**
- Déplacer, réordonner ou retirer un point individuel après sa pose — Story 2.3 ; seul le reset complet (`reinitialiserPoints`) existant reste disponible.
- Changer de topologie après le premier point supplémentaire posé — nécessiterait une conversion/confirmation (UX-DR19) hors scope ; reset complet requis.
- Inversion boucle/aller simple — Story 2.4.
- Persistance backend de la topologie/du rôle par point (colonne dédiée) — le calcul reste topologie-agnostique côté moteur (liste de points ordonnée) ; à réévaluer en Story 2.6 (enregistrement) si nécessaire.
- Recherche d'un itinéraire de retour "intelligent" pour la boucle — fermeture par simple répétition du point de départ en fin de liste.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Choix Boucle | Départ posé, sélection "Boucle" | Menu se ferme, prochains clics = Points de passage, aucune Destination proposée | N/A |
| Boucle avec 1 point de passage | Boucle active, 1 point posé après le départ | Tracé calculé départ→point→départ | Point non routé → bandeau existant |
| Choix Multi-étapes | Départ posé, sélection "Multi-étapes" | Prochains clics = Point de passage, sélecteur de rôle inline affiché sur le dernier point posé | N/A |
| Destination qualifiée en Multi-étapes | ≥1 point de passage posé, un point qualifié "Destination" | Calcul déclenché avec tous les points dans l'ordre ; points suivants ignorés | Échec calcul → dernier tracé valide conservé (comportement 2.1) |
| Aller simple (régression) | Départ + 2e point | Comportement identique à 2.1 (Destination auto, calcul immédiat) | Point non routé → bandeau existant |

</frozen-after-approval>

## Code Map

- `backend/app/route_engine/adapters/inbound/schemas.py:20` -- `CalculerParcoursRequest.points` : lever `max_length=2` (ex. `max_length=50`), `min_length=2` conservé
- `backend/app/route_engine/application/calculate_route.py:36-37` -- déjà sans borne haute, aucune modification nécessaire
- `backend/tests/route_engine/test_routes_router_integration.py`, `test_calculate_route_application.py` -- ajouter un cas >2 points (boucle/multi-étapes fermées) pour couvrir la borne levée
- `frontend/src/pages/Atelier.tsx:24-31` -- `Role` étendu (`depart`/`point_de_passage`/`etape_utilisateur`/`destination`), `PointAtelier` gagne un `id` stable (`crypto.randomUUID()`), nouvel état `topologie`
- `frontend/src/pages/Atelier.tsx:112-129` -- `poserPoint` : branchement par `topologie` (boucle/aller_simple/multi_etapes) au lieu de la logique fixe à 2 points
- `frontend/src/pages/Atelier.tsx:141-207` -- effet de calcul : dépendances et payload étendus à la liste ordonnée de points (dernier point = départ répété si boucle)
- `frontend/src/pages/Atelier.tsx:289-304` -- Contextual menu : remplacer la ligne statique "Aller simple" par le `<select>`/boutons Boucle/Aller simple/Multi-étapes (UX-DR19, mockup `key-atelier-manuel.html:42-43`) + sélecteur de rôle inline en Multi-étapes
- `frontend/src/pages/Atelier.tsx:345-350` -- `Marker key={point.role}` → `key={point.id}`
- `frontend/src/api/client.ts:160-198` -- `calculerParcours` : commentaire "exactement deux points" à mettre à jour, signature déjà `PointCoordonnee[]` (inchangée)
- `frontend/src/pages/Atelier.test.tsx` -- nouveaux scénarios de la matrice I/O ci-dessus, en plus des scénarios 2.1 existants (non-régression)
- `backend/app/route_engine/adapters/outbound/valhalla_provider.py:105-110` -- (patch review) `route()` ne lisait que `trip.legs[0].shape` ; N>2 points produisent N-1 legs côté Valhalla, tronquant la géométrie au premier segment -- concaténer tous les legs (en dédupliquant le point de jonction partagé)

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/route_engine/adapters/inbound/schemas.py` -- lever `max_length=2` sur `CalculerParcoursRequest.points` -- débloque les topologies à N points
- [x] `backend/tests/route_engine/` -- test d'intégration avec >2 points -- couvre la borne levée
- [x] `backend/app/route_engine/adapters/outbound/valhalla_provider.py` -- concaténer tous les `legs` de la réponse Valhalla au lieu de ne garder que `legs[0]` -- sans ce correctif, une Boucle/Multi-étapes réelle (N>2 points) renvoyait un tracé tronqué à son premier segment malgré un statut "routed" (trouvé en revue verification-gap, non prévu par le Code Map initial) ; couvert par `test_route_plus_de_deux_points_concatene_tous_les_legs` dans `test_valhalla_provider_contract.py`
- [x] `frontend/src/pages/Atelier.tsx` -- ajouter le choix de topologie au Contextual menu, étendre `Role`/`PointAtelier` (id stable), brancher `poserPoint` et le calcul par topologie, sélecteur de rôle inline en Multi-étapes -- livre les 4 AC de la story
- [x] `frontend/src/api/client.ts` -- mettre à jour le commentaire obsolète sur la limite à 2 points
- [x] `frontend/src/pages/Atelier.test.tsx` -- couvrir la matrice I/O ci-dessus + non-régression aller simple

**Acceptance Criteria:**
- Given je viens de poser mon départ, when le Contextual menu s'ouvre, then je choisis explicitement Boucle, Aller simple ou Multi-étapes.
- Given j'ai choisi Boucle, when je consulte le parcours, then le départ est aussi l'arrivée logique, sans Destination distincte demandée.
- Given j'ai choisi Multi-étapes, when j'ajoute des points suivants, then chaque lieu peut être qualifié Étape utilisateur ou Destination, distinct des Points de passage.
- Given une topologie est sélectionnée, when je consulte le panneau principal, then seules les options/rôles applicables à cette topologie sont affichés.

## Design Notes

- **Qualification de rôle en Multi-étapes :** au lieu d'un menu de sélection de point complet (différé Story 2.3), le rôle se choisit une seule fois, immédiatement après la pose du point (petit sélecteur inline 2 options : Étape utilisateur / Destination ; par défaut Point de passage tant que non qualifié) — pas de ré-édition ultérieure.
- **Fermeture de boucle :** aucune notion de topologie côté backend ; le frontend envoie simplement `[...points, points[0]]` au moteur existant, qui route déjà n'importe quelle liste ordonnée.
- **Verrouillage post-Destination :** en Multi-étapes comme en Aller simple, un point posé après la Destination qualifiée est ignoré (même précédent que le 3e point de 2.1) — évite une UI de réordonnancement dans cette story.

## Verification

**Commands:**
- `cd backend && uv run pytest` -- tests moteur de routage (dont le nouveau cas >2 points) passent
- `cd frontend && npm run test` -- `Atelier.test.tsx` (nouveaux scénarios + non-régression 2.1) passent

**Manual checks (if no CLI):**
- Poser un départ, choisir Boucle, poser 1 point de passage : tracé fermé départ→point→départ affiché.
- Poser un départ, choisir Multi-étapes, poser 2 points de passage puis qualifier le dernier Destination : tracé calculé sur les 4 points dans l'ordre.
- Poser un départ, choisir Aller simple, poser 1 destination : comportement identique à avant (régression).

## Suggested Review Order

**Choix de topologie (Atelier)**

- Entrée : nouveaux types de rôle/topologie et `PointAtelier.id` stable (clé React, plus `role` seul).
  [`Atelier.tsx:24`](../../frontend/src/pages/Atelier.tsx#L24)

- `poserPoint` branche désormais par topologie au lieu de la logique fixe à 2 points de 2.1.
  [`Atelier.tsx:169`](../../frontend/src/pages/Atelier.tsx#L169)

- Dérivation de `pointsCalcul` par topologie (fermeture de boucle par répétition du départ).
  [`Atelier.tsx:145`](../../frontend/src/pages/Atelier.tsx#L145)

- Qualification inline d'un point en Multi-étapes, une seule fois (pas de ré-édition).
  [`Atelier.tsx:206`](../../frontend/src/pages/Atelier.tsx#L206)

- Contextual menu : choix de topologie puis affichage propre à la topologie active.
  [`Atelier.tsx:386`](../../frontend/src/pages/Atelier.tsx#L386)

**Correctif géométrie multi-legs (trouvé en revue, hors Code Map initial)**

- `route()` ne lisait que `legs[0]` ; N>2 points produisent N-1 legs Valhalla, tronquant le tracé.
  [`valhalla_provider.py:106`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L106)

- Concaténation de tous les legs, sans dupliquer le point de jonction partagé.
  [`valhalla_provider.py:119`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L119)

**Backend : borne à N points**

- `max_length` levé de 2 à 50 sur la requête de calcul.
  [`schemas.py:21`](../../backend/app/route_engine/adapters/inbound/schemas.py#L21)

**Peripherals**

- Nouveaux scénarios de la matrice I/O (Boucle, Multi-étapes) + non-régression Aller simple.
  [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)

- Test de contrat couvrant le correctif multi-legs.
  [`test_valhalla_provider_contract.py`](../../backend/tests/route_engine/test_valhalla_provider_contract.py)

- Cas >2 points côté application et intégration HTTP.
  [`test_calculate_route_application.py`](../../backend/tests/route_engine/test_calculate_route_application.py), [`test_routes_router_integration.py`](../../backend/tests/route_engine/test_routes_router_integration.py)
