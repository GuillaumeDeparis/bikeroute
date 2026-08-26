---
title: 'Exporter un parcours en GPX'
type: 'feature'
created: '2026-08-26'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '6d4e7e674cd3c80c59bd4a9959e4a1e52524a7f7'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un parcours calculé reste enfermé dans bikeroute : impossible de le charger sur un GPS ou une autre application (NFR-7), et rien n'alimente l'historique nécessaire à la nouveauté de la future génération assistée (FR-25, Epic 3).

**Approach:** Nouvel endpoint `POST /api/routes/{id}/export` qui génère un GPX 1.1 (tracé, altitudes, points de passage) depuis la géométrie/le profil déjà persistés, journalise l'export dans une nouvelle table d'historique, et le frontend déclenche le téléchargement puis confirme le nom du fichier.

## Boundaries & Constraints

**Always:**
- Export possible uniquement sur un parcours `statut == routed` (même garde que `PATCH` d'enregistrement) ; jamais de nouvel appel Valhalla.
- Le GPX inclut le tracé complet en `trkpt` avec élévation (géométrie + `metrics.profil`, même longueur/ordre déjà garantie) et chaque point d'entrée en `wpt`, rôle déduit par position (premier = Départ, dernier = Arrivée, intermédiaires = Point de passage N — même convention que les Design Notes de spec-2-6 pour la réouverture).
- Chaque export réussi (2xx) crée une ligne dans une nouvelle table `route_exports` (`id`, `route_id`, `account_id`, `exported_at`) ; jamais de ligne pour un export en échec.
- L'export n'exige pas que le parcours soit nommé (`nom` peut être nul) — seul un tracé calculé est requis.
- Nom de fichier dérivé de `nom` (slug ASCII) si présent, sinon générique — jamais vide ni non téléchargeable.

**Ask First:** si le GPX stdlib (`xml.etree.ElementTree`) s'avère insuffisant (ex. besoin d'extensions GPX non triviales), HALT avant d'ajouter une dépendance externe (`gpxpy`) plutôt que de l'ajouter silencieusement.

**Never:**
- Jamais d'export partiel présenté comme réussi ; en cas d'échec, le parcours reste intact et un réessai est proposé.
- Jamais de dépendance à l'application pour exploiter le fichier exporté (NFR-7) — GPX 1.1 standard, aucune extension propriétaire requise pour le lire.
- Pas de traitement asynchrone/queue : génération et téléchargement synchrones dans la même requête (même patron que `calculate`/`PATCH`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export réussi | `route_id` routé, appartient au compte | 200, GPX en corps de réponse, `Content-Disposition` avec nom de fichier, ligne `route_exports` créée | N/A |
| Parcours non routé | `route_id` avec `statut = non_route` | 422 `PARCOURS_NON_PRET` | Parcours conservé, réessai proposé côté UI |
| Parcours d'un autre compte / inexistant | `route_id` étranger | 404, indiscernable des deux cas (`get_owned_or_404`) | Comme spec-1-3 |
| Nom absent | `nom` NULL | Fichier nommé génériquement (`parcours.gpx`) | N/A |
| Échec réseau/serveur | requête échoue | Aucun téléchargement déclenché, parcours conservé | Réessayer proposé, formulaire non perdu |

</frozen-after-approval>

## Code Map

- `backend/alembic/versions/20260826_0006_route_exports.py` (NEW) -- table `route_exports(id, route_id FK routes ON DELETE CASCADE, account_id FK accounts ON DELETE CASCADE index, exported_at timestamptz index)`, patron de `20260826_0005_route_naming.py`.
- `backend/app/models/route_export.py` (NEW) -- modèle SQLAlchemy `RouteExport`, même patron que `backend/app/models/route.py`.
- `backend/alembic/env.py:14` -- ajouter `route_export` à l'import `from app.models import account, route, session` pour l'autogenerate.
- `backend/app/route_engine/domain/gpx.py` (NEW) -- fonction pure `construire_gpx(nom: str | None, points_entree: tuple[Coordinate, ...], geometry: tuple[Coordinate, ...], profil: tuple[PointProfil, ...]) -> str`, GPX 1.1 via `xml.etree.ElementTree` (échappement XML natif, aucune dépendance ajoutée) ; rôles `wpt` déduits par position.
- `backend/app/route_engine/adapters/inbound/routes_router.py` -- nouvelle route `POST /{route_id}/export` : `get_owned_or_404`, 422 `PARCOURS_NON_PRET` si non routé (même garde que `enregistrer:249-`), construit le GPX via `_geometrie_en_points` (ligne ~177) + `model.metrics["profil"]` + `model.points["input"]`, insère `RouteExport`, `db.commit()`, retourne `fastapi.Response(content=gpx, media_type="application/gpx+xml", headers={"Content-Disposition": ...})`.
- `frontend/src/api/client.ts:333-` (à côté de `enregistrerParcours`) -- nouvelle fonction `exporterParcours(id): Promise<{blob: Blob; nomFichier: string}>`, lit `Content-Disposition` pour le nom de fichier.
- `frontend/src/pages/Atelier.tsx:1199-` (zone `atelier__enregistrement-zone`, patron du Save form existant) -- bouton « Exporter » (actif dès `parcoursId` défini, comme « Enregistrer »), états `exportEnCours`/`erreurExport`/`confirmationExport{nomFichier}`, déclenche le téléchargement via `URL.createObjectURL` + `<a>` temporaire, confirmation avec « Revenir » (ferme la confirmation) et « Nouveau parcours » (réutilise `reinitialiserPoints`, ligne 745).
- `frontend/src/pages/Atelier.css` -- styles de la confirmation d'export (réutilise les classes `atelier__confirmation`/`atelier__erreur` existantes).
- `backend/tests/route_engine/test_routes_router_integration.py` -- matrice I/O ci-dessus (export réussi = GPX bien formé + ligne d'historique, non routé, autre compte).
- `backend/tests/route_engine/test_gpx.py` (NEW) -- tests unitaires purs de `construire_gpx` (échappement d'un nom contenant `&`/`<`, élévation par point, waypoints par rôle).
- `frontend/src/pages/Atelier.test.tsx` -- bouton Exporter, téléchargement déclenché, confirmation affichée, échec réseau conserve le parcours.

## Tasks & Acceptance

**Execution:**
- [x] `backend/alembic/versions/20260826_0006_route_exports.py` -- migration `route_exports`
- [x] `backend/app/models/route_export.py` -- modèle `RouteExport`
- [x] `backend/alembic/env.py` -- import du nouveau modèle
- [x] `backend/app/route_engine/domain/gpx.py` -- `construire_gpx` + tests unitaires purs
- [x] `backend/app/route_engine/adapters/inbound/routes_router.py` -- `POST /{route_id}/export`
- [x] `frontend/src/api/client.ts` -- `exporterParcours`
- [x] `frontend/src/pages/Atelier.tsx`, `Atelier.css` -- bouton Exporter, téléchargement, confirmation
- [x] `backend/tests/...`, `frontend/src/pages/Atelier.test.tsx` -- matrice I/O ci-dessus

**Acceptance Criteria:**
- Given un parcours calculé, when je déclenche Exporter, then un fichier GPX standard est généré avec tracé, points de passage et altitudes, exploitable sans dépendance à l'application.
- Given l'export réussit, when la confirmation s'affiche, then le nom du fichier exporté est confirmé et je peux revenir au parcours ou préparer un autre parcours.
- Given l'export échoue, when je consulte le résultat, then le parcours est conservé et Réessayer est proposé, aucun export partiel n'est présenté comme réussi.
- Given un export réussit, when le système l'enregistre, then il est ajouté à l'historique des exports du compte connecté.

## Spec Change Log

## Design Notes

- GPX généré via `xml.etree.ElementTree` (stdlib) plutôt qu'une dépendance (`gpxpy`) : le format visé (wpt/trk/trkpt) est simple, et l'échappement XML — seul vrai risque via le `nom` utilisateur — est géré nativement.
- Élévation par point de trace : `metrics.profil[i].elevation_m` a la même longueur/ordre que `geometry` (garanti par `calculer_metriques`, `domain/metrics.py:218`) — aucun recalcul, aucun resampling.
- Nom de fichier : slug ASCII de `nom` (translittéré, espaces → tirets) + `.gpx`, ou `parcours.gpx` si `nom` est nul — jamais de caractères non-ASCII bruts dans `Content-Disposition` (RFC 6266).

## Verification

**Commands:**
- `cd backend && uv run pytest -q` -- nouveaux tests passent, aucune régression
- `cd frontend && npm run test -- --run` -- nouveaux scénarios passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur

**Manual checks (if no CLI):**
- Calculer un parcours, l'exporter sans l'avoir enregistré : fichier GPX téléchargé, ouvrable dans un lecteur GPX (ex. gpx.studio), contient tracé, altitudes et waypoints.
- Exporter deux fois le même parcours : deux lignes dans `route_exports`.

## Suggested Review Order

**Génération GPX (domaine pur)**

- Entrée : assemble `wpt`/`trk`/`trkpt` via `ElementTree` (échappement XML natif), aucune dépendance ajoutée.
  [`gpx.py:55`](../../backend/app/route_engine/domain/gpx.py#L55)

- Notation à virgule fixe plutôt que `str()` brut : évite une notation scientifique invalide près de 0° (méridien de Greenwich).
  [`gpx.py:22`](../../backend/app/route_engine/domain/gpx.py#L22)

- Rôle du waypoint déduit par position (jamais persisté) ; une boucle réutilise "Arrivée" pour le point de départ répété.
  [`gpx.py:40`](../../backend/app/route_engine/domain/gpx.py#L40)

**Endpoint HTTP et garde-fous**

- `POST /{route_id}/export` : même garde `statut == routed` que `enregistrer`, construit le GPX depuis le tracé déjà persisté, journalise l'export.
  [`routes_router.py:297`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L297)

- Accès défensif à `metrics["profil"]` + refus contrôlé (422) si un parcours legacy (pré-story-2.5) n'a pas de profil complet, plutôt qu'un 500 non documenté.
  [`routes_router.py:324`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L324)

- Nom de fichier : slug ASCII de `nom`, retombe sur un nom générique si vide ou non translittérable.
  [`routes_router.py:276`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L276)

**Historique des exports (persistance)**

- Modèle `RouteExport` : une ligne par export réussi, alimentera la nouveauté historique de la génération assistée (Epic 3).
  [`route_export.py:22`](../../backend/app/models/route_export.py#L22)

- Migration créant `route_exports`, FK `route_id`/`account_id` en cascade.
  [`20260826_0006_route_exports.py:22`](../../backend/alembic/versions/20260826_0006_route_exports.py#L22)

**Intégration frontend**

- `lancerExport` : déclenche le téléchargement via un `<a download>` temporaire, seul mécanisme fiable pour un `Blob` déjà en mémoire.
  [`Atelier.tsx:1017`](../../frontend/src/pages/Atelier.tsx#L1017)

- Zone Exporter/confirmation, patron du Save form existant (spec-2-6) sans formulaire.
  [`Atelier.tsx:1352`](../../frontend/src/pages/Atelier.tsx#L1352)

- `exporterParcours` : lit le nom de fichier depuis `Content-Disposition`.
  [`client.ts:424`](../../frontend/src/api/client.ts#L424)

- Extraction du nom de fichier, avec repli générique si l'en-tête est absent/mal formé.
  [`client.ts:415`](../../frontend/src/api/client.ts#L415)

**Tests**

- Matrice I/O backend : succès, sans nom, non routé, autre compte, id inexistant, sans authentification, export répété.
  [`test_routes_router_integration.py:546`](../../backend/tests/route_engine/test_routes_router_integration.py#L546)

- Régression du patch : parcours legacy sans profil → 422 contrôlé, jamais journalisé.
  [`test_routes_router_integration.py:634`](../../backend/tests/route_engine/test_routes_router_integration.py#L634)

- Tests purs de `construire_gpx` : échappement XML, ordre des élévations, rôles par position.
  [`test_gpx.py:17`](../../backend/tests/route_engine/test_gpx.py#L17)

- Scénarios UI : export réussi, Revenir, Nouveau parcours, échec réseau, parcours non routé.
  [`Atelier.test.tsx:1900`](../../frontend/src/pages/Atelier.test.tsx#L1900)
