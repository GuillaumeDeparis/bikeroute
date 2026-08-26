---
title: "Enregistrer un parcours dans sa bibliothèque"
type: 'feature'
created: '2026-08-26'
status: 'done'
review_loop_iteration: 0
baseline_commit: '0bd48eca7f5b518bab2f2fad87cd18cefd779fb5'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chaque calcul de tracé insère déjà une ligne permanente dans `routes`, mais rien ne permet de la nommer/annoter/étiqueter pour la retrouver dans « Mes parcours » -- `nom`/`note`/`étiquettes` n'existent pas en base, et aucun endpoint ne liste ou ne rouvre un parcours (FR-41, UX-DR22).

**Approach:** « Enregistrer » = poser un `nom` (marqueur de bibliothèque) sur la ligne `routes` déjà calculée via `PATCH /api/routes/{id}` -- pas de nouvelle table ni de statut de cycle de vie. Ajouter `GET /api/routes` (liste des lignes nommées) et `GET /api/routes/{id}` (réouverture), puis la surface « Mes parcours » et le Save form côté Atelier.

## Boundaries & Constraints

**Always:**
- Un parcours est « dans ma bibliothèque » ssi `nom` est non vide ; `note`/`étiquettes` restent facultatifs.
- Seul un parcours `statut == routed` (au moins un tracé calculé) peut être enregistré, jamais `non_route`.
- Ownership vérifiée via `authorization.get_owned_or_404` (404 uniforme, jamais 403 -- convention spec-1-3).
- Échec d'enregistrement (réseau/serveur/validation) : nom/note/étiquettes restent dans le formulaire pour réessayer.
- Réouverture depuis « Mes parcours » charge points/tracé/métriques déjà persistés -- aucun nouvel appel Valhalla.
- Lecture de `metrics` (JSONB) défensive (`.get()`) : un parcours calculé avant la story 2.5 (détail) n'a pas `revetements`/`profil`/`montees_significatives` -- jamais d'erreur 500, champs absents = vides.

**Ask First:** Aucune -- modèle de persistance (nom = marqueur de bibliothèque, `PATCH` sur la ligne existante plutôt qu'un nouveau statut) tranché avec l'utilisateur avant la spec (26/08/2026).

**Never:**
- Nouvelle table ou nouveau statut de cycle de vie (brouillon/purge des calculs non enregistrés) -- hors scope, aucune AC ne l'exige.
- Reconstruction exacte des rôles de points à la réouverture (étape vs point de passage intermédiaire) -- seuls départ/destination et la topologie (boucle si premier == dernier point) sont fiables depuis les points bruts persistés.
- Édition du tracé depuis « Mes parcours » -- la réouverture délègue entièrement à l'Atelier existant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enregistrement réussi | parcours `routed`, nom="Boucle du dimanche" | 200, nom/note/étiquettes persistés, confirmation affichée | N/A |
| Nom vide/absent | `nom=""` | 422, formulaire conserve note/étiquettes déjà saisies | `PARAMETRES_INVALIDES` |
| Parcours non routé | `statut=non_route` | 422, enregistrement refusé | `PARCOURS_NON_PRET` |
| Échec réseau/serveur à l'enregistrement | erreur 5xx/timeout | nom/note/étiquettes conservés, réessai proposé | message générique, aucune perte de saisie |
| Parcours d'un autre compte | id appartenant à un autre compte | 404 identique à un id inexistant | `RESSOURCE_INTROUVABLE` |
| Métriques d'un ancien parcours (version < 3) | JSONB sans `revetements`/`profil` | réouverture affiche les métriques disponibles, reste vide | N/A |
| Réouverture d'un parcours enregistré | clic sur une entrée de « Mes parcours » | Atelier rouvert avec points, tracé, métriques prêts | N/A |
| Liste vide | aucun parcours nommé pour le compte | « Aucun parcours enregistré » + CTA Créer un parcours | N/A |

</frozen-after-approval>

## Code Map

- `backend/alembic/versions/20260826_0005_route_naming.py` (NEW) -- ajoute `nom` (String, nullable), `note` (Text, nullable), `etiquettes` (JSONB, nullable) à `routes`.
- `backend/app/models/route.py:54-` (`Route`) -- colonnes `nom: str | None`, `note: str | None`, `etiquettes: list[str] | None`.
- `backend/app/route_engine/adapters/inbound/schemas.py` -- `EnregistrerParcoursRequest{nom: str(min_length=1,max_length=200), note: str|None(max_length=2000), etiquettes: list[str](max_length=20)}` ; `ParcoursResponse` gagne `nom`/`note`/`etiquettes`/`points: list[PointResponse]=[]` (nouveau, requis pour la réouverture -- vide sur `/calculate`) ; nouveau `ParcoursResumeResponse{id,nom,note,etiquettes,distance_m,denivele_positif_m,duree_s,difficulte,created_at}`.
- `backend/app/route_engine/adapters/inbound/routes_router.py:35-` -- `PATCH /api/routes/{route_id}` (`get_owned_or_404`, 422 `PARCOURS_NON_PRET` si `statut != routed`, sinon assigne nom/note/étiquettes + `db.commit()`) ; `GET /api/routes` (lignes `nom IS NOT NULL` du compte, tri `created_at desc` → `ParcoursResumeResponse`) ; `GET /api/routes/{route_id}` (`get_owned_or_404`, nouvelle fonction privée `_metriques_response_depuis_json(metrics: dict) -> MetriquesResponse` avec lecture défensive `.get()`, distincte du chemin `/calculate` qui reste inchangé).
- `backend/app/services/authorization.py:21` (`get_owned_or_404`) -- réutilisé tel quel (aucune modification).
- `frontend/src/api/client.ts:210-` -- `enregistrerParcours(id, {nom, note, etiquettes})` (PATCH), `listerParcours()` (GET liste), `obtenirParcours(id)` (GET détail) ; extraire le mapping snake→camel des métriques dans une fonction partagée avec `calculerParcours` pour ne pas le dupliquer trois fois.
- `frontend/src/pages/Atelier.tsx:451-,908-` -- état `parcoursId` (capturé depuis `resultat.id` après chaque calcul réussi, remis à `undefined` à la prochaine édition) ; bouton « Enregistrer » (actif seulement si `trace.length > 0`) ouvrant un Save form nom/note/étiquettes en une seule surface (UX-DR22) ; prop optionnelle pour précharger points/trace/métriques/topologie/nom/note/étiquettes depuis un parcours réouvert (topologie déduite : boucle si premier point == dernier, sinon aller_simple à 2 points ou multi_etapes).
- `frontend/src/pages/Atelier.css` -- styles du Save form.
- `frontend/src/pages/MesParcours.tsx` (NEW) -- liste « Mes parcours » (chargement/vide/erreur, UX-DR27), clic sur une entrée → réouverture dans l'Atelier.
- `frontend/src/pages/MesParcours.css` (NEW) -- styles minimaux, cohérents avec `Accueil.css`.
- `frontend/src/App.tsx:14-20,86-119` -- nouvelle vue `{ nom: 'mes-parcours'; identifiant }`, câblée depuis `AppHeader`/`Accueil`.
- `frontend/src/components/AppHeader.tsx:112-119` -- entrée « Mes parcours » du menu compte : retire `aria-disabled`/« Bientôt disponible », devient un lien fonctionnel (prop `onOuvrirMesParcours`).
- `frontend/src/pages/Accueil.tsx:93-103` -- le commentaire « avant l'Epic 5 » est erroné (Mes parcours est Epic 2/2.6, cf. epics.md:181/256) ; état vide devient un lien vers « Mes parcours ».
- `backend/tests/route_engine/test_routes_router_integration.py` -- matrice I/O ci-dessus (PATCH/GET liste/GET détail).
- `frontend/src/pages/MesParcours.test.tsx` (NEW), extensions `frontend/src/pages/Atelier.test.tsx` -- Save form + réouverture.

## Tasks & Acceptance

**Execution:**
- [x] `backend/alembic/versions/20260826_0005_route_naming.py` -- migration `nom`/`note`/`etiquettes`
- [x] `backend/app/models/route.py` -- colonnes correspondantes
- [x] `backend/app/route_engine/adapters/inbound/schemas.py` -- `EnregistrerParcoursRequest`, `ParcoursResponse` étendu, `ParcoursResumeResponse`
- [x] `backend/app/route_engine/adapters/inbound/routes_router.py` -- `PATCH /api/routes/{id}`, `GET /api/routes`, `GET /api/routes/{id}`
- [x] `frontend/src/api/client.ts` -- `enregistrerParcours`, `listerParcours`, `obtenirParcours`
- [x] `frontend/src/pages/Atelier.tsx`, `Atelier.css` -- `parcoursId`, Save form, préchargement depuis réouverture
- [x] `frontend/src/pages/MesParcours.tsx`, `MesParcours.css` -- liste + états chargement/vide/erreur
- [x] `frontend/src/App.tsx`, `AppHeader.tsx`, `Accueil.tsx` -- câblage de la vue « Mes parcours »
- [x] `backend/tests/...`, `frontend/src/pages/MesParcours.test.tsx`, `Atelier.test.tsx` -- matrice I/O ci-dessus

**Acceptance Criteria:**
- Given un parcours prêt (au moins un tracé calculé), when j'ouvre le Save form et saisis un nom (obligatoire), une note et des étiquettes facultatives, then le parcours est enregistré dans ma bibliothèque et une confirmation s'affiche.
- Given l'enregistrement échoue (réseau/serveur), when je consulte le formulaire, then nom, note et étiquettes sont conservés et je peux réessayer ou revenir à l'éditeur.
- Given je retourne plus tard sur « Mes parcours », when je choisis un parcours enregistré, then je le retrouve dans l'Atelier avec ses points et métriques prêts à reprendre.

## Design Notes

- Un calcul non enregistré (`nom` nul) reste une ligne `routes` orpheline, comme aujourd'hui -- aucune purge/TTL en V1 (déjà le comportement actuel, non aggravé par cette story).
- Topologie à la réouverture déduite des points bruts, pas stockée : `points.input[0] == points.input[-1]` (longueur ≥ 3) → boucle (dernier point dupliqué retiré de la liste affichée) ; 2 points → aller simple ; sinon multi-étapes. Rôles intermédiaires tous `point_de_passage` -- la distinction `etape_utilisateur` (spec-2-3) est un libellé UI non persisté, sans impact sur le calcul.
- « Mes parcours » est spine-only (UX-DR24) : contenu textuel (liste/nom/note/étiquettes/métriques clés), pas de maquette dédiée requise.

## Verification

**Commands:**
- `cd backend && uv run pytest -q` -- nouveaux tests passent, aucune régression
- `cd frontend && npm run test -- --run` -- nouveaux scénarios passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur

**Manual checks (if no CLI):**
- Calculer un parcours, l'enregistrer avec nom/note/étiquettes, le retrouver dans Mes parcours puis le rouvrir dans l'Atelier avec le même tracé et les mêmes métriques.
- Tenter d'enregistrer un parcours `non_route` : refusé (422).

## Suggested Review Order

**Modèle de persistance (entrée)**

- Nom = marqueur de bibliothèque : colonnes nullables ajoutées sur `routes`, décision structurante de toute la story.
  [`route_naming.py:1`](../../backend/alembic/versions/20260826_0005_route_naming.py#L1)

- Colonnes SQLAlchemy correspondantes, `etiquettes` en JSONB comme `points`/`metrics`.
  [`route.py:73`](../../backend/app/models/route.py#L73)

**Endpoints backend**

- `PATCH` : ownership via `get_owned_or_404` avant toute validation, refus `PARCOURS_NON_PRET` si non routé.
  [`routes_router.py:233`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L233)

- `GET` liste : uniquement les lignes nommées du compte, plus récentes d'abord.
  [`routes_router.py:276`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L276)

- `GET` détail : réouverture, aucun nouvel appel Valhalla, géométrie relue via `ST_AsGeoJSON`.
  [`routes_router.py:317`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L317)

- Lecture défensive du JSONB `metrics` : un parcours calculé avant la story 2.5 (détail) ne doit jamais crasher.
  [`routes_router.py:140`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L140)

- `nom` volontairement sans `Field(min_length=1)` pour distinguer `PARAMETRES_INVALIDES` du `CHAMP_REQUIS` générique.
  [`schemas.py:98`](../../backend/app/route_engine/adapters/inbound/schemas.py#L98)

- Étiquette individuelle bornée (non vide après trim, 50 caractères) -- correctif de revue, ferme une brèche de validation API directe.
  [`schemas.py:22`](../../backend/app/route_engine/adapters/inbound/schemas.py#L22)

**Frontend : client API**

- Mapping snake→camel partagé (`mapResultatParcours`/`mapMetriques`) pour ne pas le dupliquer trois fois.
  [`client.ts:275`](../../frontend/src/api/client.ts#L275)

- `enregistrerParcours`/`listerParcours`/`obtenirParcours` : les trois nouveaux appels PATCH/GET.
  [`client.ts:333`](../../frontend/src/api/client.ts#L333)

**Frontend : Atelier -- Save form et réouverture**

- Reconstruction pure de la topologie depuis les points bruts persistés (boucle si premier == dernier point).
  [`Atelier.inversion.ts:29`](../../frontend/src/pages/Atelier.inversion.ts#L29)

- `parcoursId` : identité du parcours persisté correspondant au tracé affiché, invalidée à chaque nouvelle édition.
  [`Atelier.tsx:442`](../../frontend/src/pages/Atelier.tsx#L442)

- Court-circuit à un seul coup : aucun appel Valhalla au montage pour un parcours réouvert.
  [`Atelier.tsx:794`](../../frontend/src/pages/Atelier.tsx#L794)

- Enregistrement : nom/note/étiquettes conservés à l'échec, confirmation obsolète effacée par le correctif de revue.
  [`Atelier.tsx:937`](../../frontend/src/pages/Atelier.tsx#L937)

- Save form (UX-DR22) : une seule surface, désactivée tant qu'aucun parcours persisté ne correspond au tracé courant.
  [`Atelier.tsx:1180`](../../frontend/src/pages/Atelier.tsx#L1180)

**Frontend : « Mes parcours » et navigation**

- Nouvelle surface spine-only (UX-DR24) : chargement/vide/erreur, réouverture délègue entièrement à l'Atelier.
  [`MesParcours.tsx:1`](../../frontend/src/pages/MesParcours.tsx#L1)

- `key` sur `Atelier` forçant un remontage à chaque parcours réouvert (les initialiseurs paresseux ne s'exécutent qu'au montage).
  [`App.tsx:127`](../../frontend/src/App.tsx#L127)

- Entrée « Mes parcours » du menu compte, désormais fonctionnelle (était inerte, spec-1-4).
  [`AppHeader.tsx:116`](../../frontend/src/components/AppHeader.tsx#L116)

**Peripherals**

- Correctif de revue : dédoublonnage etiquettes/validation, testé côté rejet vide et trop long.
  [`test_routes_router_integration.py`](../../backend/tests/route_engine/test_routes_router_integration.py)

- Correctif de revue : mapping réel des trois nouvelles fonctions client exercé contre un `fetch` stubbé.
  [`client.test.ts`](../../frontend/src/api/client.test.ts)

- Correctif de revue : confirmation d'enregistrement obsolète après édition, testée explicitement.
  [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)

- `MesParcours.test.tsx`, `AppHeader.test.tsx`, `Accueil.test.tsx` -- matrice I/O et câblage de navigation.
