---
title: "Consulter les métriques et un résumé persistant (socle)"
type: 'feature'
created: '2026-08-24'
status: 'done'
review_loop_iteration: 0
baseline_commit: '6c3d2864d7b809bc2ba071d9b6c16f8e1e02b84b'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un parcours calculé n'expose aujourd'hui que sa géométrie brute (`RouteResult.geometry`) -- aucune distance, D+/D-, durée ou difficulté -- l'utilisateur ne peut donc pas juger ce qu'il s'apprête à faire.

**Approach:** Ajouter un port `ElevationProvider` (Valhalla + tuiles SRTM/skadi) et en dériver côté domaine une méthode de calcul unique et versionnée (NFR-9) pour distance/D+/D-/durée/difficulté, persistée avec le tracé et exposée par une nouvelle bulle de métriques extensible (compacte ↔ déployée) dans l'Atelier. Revêtements, catégories routières, montées significatives et profil en courbe continue sont un second morceau, déjà tracé dans `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Toute métrique provient d'une unique méthode serveur versionnée (`metrics_version`), jamais recalculée côté client -- même valeur sur tous les écrans (NFR-9).
- Métriques calculées et persistées au moment du calcul du tracé (même flush que `PostgisRouteRepository.save`), jamais recalculées à l'affichage.
- Bulle compacte : distance, D+, durée. Bulle déployée : ajoute D- et difficulté.
- Dernières métriques valides restent affichées avec "Mise à jour…" pendant un recalcul -- même patron que `trace`/`calculEnCours` (spec-2-3/2.4).
- Aucune métrique affichée pour un parcours non routé (`statut !== 'routed'`) -- même garde que `geometry` (`routes_router.py:72-77`).
- Difficulté (4 paliers, D+ rapporté à la distance en m/km) : Facile <10, Modéré 10-20, Difficile 20-35, Très difficile ≥35.
- Échec du fournisseur d'élévation traité comme `RoutingProviderError` (même réponse 502 "moteur de routage indisponible") -- pas de métriques partielles, cohérent avec le traitement déjà existant d'un échec Valhalla.

**Ask First:** Aucune -- source d'élévation (Valhalla + skadi) et barème de difficulté tranchés avec l'utilisateur en amont de cette spec (voir Design Notes).

**Never:**
- Paramètre sportif exposé à l'utilisateur.
- Recalcul de métriques côté frontend -- uniquement affichage de ce que le backend a produit.
- Revêtements, catégories routières, montées significatives, profil en courbe -- diffèrés (`deferred-work.md`) ; ne pas les préparer par anticipation dans cette story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parcours routé standard | Boucle, 2 points de passage, 300 m D+ | Bulle compacte (distance/D+/durée) ; déployée ajoute D-/difficulté | N/A |
| Fournisseur d'élévation en échec | `ElevationProvider` indisponible | Même échec 502 que le routage -- dernier tracé+métriques valides restent visibles | `MOTEUR_ROUTAGE_INDISPONIBLE`, réutilisé tel quel |
| Parcours non routé | `statut = non_route` | Aucune métrique affichée | N/A |
| Recalcul en cours | Édition d'un point (spec-2-3) | Dernières métriques valides restent visibles, "Mise à jour…" | N/A |

</frozen-after-approval>

## Code Map

- `backend/app/route_engine/domain/models.py:28-52` (`RouteResult`) + `domain/metrics.py` (nouveau) -- `duration_s` sur `RouteResult` (déjà dans `trip.summary.time`, ignoré aujourd'hui) ; `METRICS_VERSION`/`RouteMetrics`/`calculer_metriques(geometry, elevations, duration_s)` (distance, D+/D-, difficulté).
- `backend/app/route_engine/application/ports.py:18-24` -- port `ElevationProvider` (`elevations(points) -> tuple[float,...]`) + `ElevationProviderError` (même contrat que `RoutingProviderError`).
- `backend/app/route_engine/application/calculate_route.py:25-43` -- si `result.est_route`, `elevation_provider.elevations(result.geometry)` puis `calculer_metriques(...)` avant `repository.save(...)` ; `metrics=None` sinon.
- `backend/app/route_engine/adapters/outbound/valhalla_provider.py:80-128` -- lire `body["trip"]["summary"]["time"]` → `duration_s`.
- `backend/app/route_engine/adapters/outbound/valhalla_elevation_provider.py` + `bootstrap/elevation.py` (nouveaux) -- `ElevationProvider` via `/height` Valhalla, même patron (erreurs, injection client, singleton) que `valhalla_provider.py`/`bootstrap/routing.py`.
- `backend/app/route_engine/adapters/inbound/schemas.py:29-36`, `routes_router.py:39-87` -- `ParcoursResponse.metriques: MetriquesResponse | None`, construit depuis `route.metrics` (même garde que `geometry`, l.72-77) ; injecter `elevation_provider`.
- `backend/app/route_engine/adapters/outbound/postgis_route_repository.py:24-58`, `backend/app/models/route.py:36`, nouvelle révision `backend/alembic/versions/` -- colonnes `metrics: JSONB nullable`/`metrics_version: String(32) nullable`, même patron que `points`.
- `docker-compose.yml:56-85` -- tuiles d'élévation SRTM/skadi pour `valhalla` (répertoire dédié, flag `additional-data-elevation`) ; stratégie CI en Design Notes.
- `frontend/src/api/client.ts:143-198` -- `ResultatParcours.metriques?: Metriques`, mapping snake→camel.
- `frontend/src/pages/Atelier.tsx:198-200,526-592,643`, `Atelier.css` -- état `metriques` sur l'effet de calcul existant ; composant `BulleMetriques` (compact/déployé) dans le panneau, statut "Mise à jour…" partagé (l.789-794), style d'après `mockups/key-atelier-manuel.html`/`key-mobile-atelier.html` (partie résumé, sans courbe).
- `frontend/src/pages/Atelier.test.tsx` -- describe couvrant la matrice I/O ci-dessus.

## Tasks & Acceptance

**Execution:**
- [x] Domaine : `duration_s` sur `RouteResult`, nouveau `metrics.py` (`RouteMetrics`/`calculer_metriques`)
- [x] `application/ports.py` -- `ElevationProvider`/`ElevationProviderError`
- [x] `application/calculate_route.py` -- orchestrer élévation + calcul de métriques
- [x] `adapters/outbound/valhalla_provider.py` -- lire `duration_s`
- [x] `adapters/outbound/valhalla_elevation_provider.py` + `bootstrap/elevation.py` -- adaptateur/singleton `ElevationProvider`
- [x] `adapters/inbound/schemas.py`, `routes_router.py` -- exposer `metriques`
- [x] `adapters/outbound/postgis_route_repository.py`, `models/route.py`, migration Alembic -- persister les métriques
- [x] `docker-compose.yml` -- tuiles SRTM/skadi pour `valhalla`
- [x] `frontend/src/api/client.ts` -- type `Metriques` + mapping
- [x] `frontend/src/pages/Atelier.tsx`, `Atelier.css` -- composant `BulleMetriques`
- [x] `backend/tests/route_engine/...`, `frontend/src/pages/Atelier.test.tsx` -- matrice I/O (échec fournisseur, non-routé, recalcul)

**Acceptance Criteria:**
- Given un parcours calculé existe, when je consulte la bulle en état compact, then je vois distance, D+ et durée.
- Given je déploie la bulle, when le détail s'affiche, then je vois D- et difficulté en plus.
- Given le D+ (ou une autre métrique structurante) est calculé, when je compare deux affichages du même parcours, then la valeur est identique (méthode serveur unique versionnée).
- Given je navigue entre les écrans de préparation, when une métrique essentielle existe, then un résumé persistant reste accessible sur ordinateur et mobile.

## Design Notes

- Décisions tranchées avec l'utilisateur (24/08/2026) : élévation via Valhalla auto-hébergé + tuiles SRTM/skadi (pas d'API externe) ; difficulté = D+ par km, 4 paliers.
- "Avertissement éventuel" (epics.md AC1) : aucun déclencheur dans ce socle (le déclencheur naturel, proportion de revêtement inconnu/NFR-10, appartient au morceau différé). Emplacement prévu dans `BulleMetriques`, vide/masqué pour l'instant.
- CI/corpus : `corpus.osm.pbf` (Story 2.1) est synthétique, sans donnée d'élévation réelle. Même patron que l'extrait OSM réel (`deploy/valhalla/data/`, gitignored, QA locale, spec-2-1) : tuiles skadi jamais commitées ; tests unitaires (`metrics.py`) via `ElevationProvider` factice (patron `FakeRoutingProvider`) ; test de contrat Valhalla réel skip/xfail sans tuiles locales.
- `RouteMetrics` sérialisé en JSONB (patron `points`), pas en colonnes dédiées -- le morceau différé y ajoutera des champs, aucune requête SQL structurante dessus en V1.

## Verification

**Commands:**
- `cd backend && uv run pytest -q` -- nouveaux tests `metrics.py`/`calculate_route`/adaptateurs passent, aucune régression
- `cd frontend && npm run test -- --run` -- nouveaux scénarios `BulleMetriques` passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur

**Manual checks (if no CLI):**
- Parcours routé avec dénivelé : bulle compacte affiche distance/D+/durée ; déployée ajoute D-/difficulté.
- Édition d'un point sur un parcours existant : les métriques précédentes restent visibles avec "Mise à jour…" jusqu'au recalcul.

## Suggested Review Order

**Domaine : calcul unique et versionné des métriques (NFR-9)**

- `calculer_metriques` : point d'entrée du calcul normatif (distance, D+/D-, difficulté) à partir de la géométrie routée et des élévations.
  [`metrics.py:89`](../../backend/app/route_engine/domain/metrics.py#L89)

- `Difficulte`/`_difficulte_pour` : barème à 4 paliers (D+/km), typé `Literal` pour garantir le contrat API après revue.
  [`metrics.py:41`](../../backend/app/route_engine/domain/metrics.py#L41)

- `RouteMetrics`/`METRICS_VERSION` : structure versionnée persistée telle quelle, jamais recalculée à l'affichage.
  [`metrics.py:25`](../../backend/app/route_engine/domain/metrics.py#L25)

**Orchestration : port `ElevationProvider` et intégration au calcul de parcours**

- `calculer_parcours` : élévation appelée seulement si le tracé est routé, jamais pour un résultat non routé.
  [`calculate_route.py:52`](../../backend/app/route_engine/application/calculate_route.py#L52)

- Mismatch géométrie/élévations retraduit en `ElevationProviderError` (correctif de revue) pour retomber sur le même 502 que le reste.
  [`calculate_route.py:55`](../../backend/app/route_engine/application/calculate_route.py#L55)

- `ElevationProvider` (protocole) : contrat remplaçable, même patron que `RoutingProvider` (AD-8).
  [`ports.py:28`](../../backend/app/route_engine/application/ports.py#L28)

**Adaptateurs Valhalla : lecture durée + élévation (`/height`)**

- Durée lue depuis `trip.summary.time`, avec garde booléen/négatif avant conversion (correctif de revue).
  [`valhalla_provider.py:129`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L129)

- `ValhallaElevationProvider.elevations` : appel `/height`, `null`/booléen traités comme erreur fournisseur plutôt que valeur par défaut silencieuse.
  [`valhalla_elevation_provider.py:30`](../../backend/app/route_engine/adapters/outbound/valhalla_elevation_provider.py#L30)

**API : exposition et persistance**

- `MetriquesResponse`/`difficulte: Difficulte` : contrat de sortie, absent pour un parcours non routé.
  [`schemas.py:31`](../../backend/app/route_engine/adapters/inbound/schemas.py#L31)

- Injection de `elevation_provider`, même garde 502 pour `RoutingProviderError`/`ElevationProviderError`.
  [`routes_router.py:41`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L41)

- Persistance JSONB `metrics`/`metrics_version`, même patron que `points`.
  [`postgis_route_repository.py:47`](../../backend/app/route_engine/adapters/outbound/postgis_route_repository.py#L47)

**Frontend : bulle de métriques compacte/déployée**

- `BulleMetriques` : composant compact/déployé, entrée pour comprendre le rendu.
  [`Atelier.tsx:256`](../../frontend/src/pages/Atelier.tsx#L256)

- État `metriques`/`bulleMetriquesDepliee`, réinitialisés ensemble dans `reinitialiserPoints` (correctif de revue).
  [`Atelier.tsx:571`](../../frontend/src/pages/Atelier.tsx#L571)

- `Metriques`/`Difficulte`, mapping snake→camel de la réponse API.
  [`client.ts:152`](../../frontend/src/api/client.ts#L152)

**Peripherals**

- Tuiles d'élévation SRTM/skadi pour `valhalla` (répertoire gitignored, jamais commité).
  [`docker-compose.yml:74`](../../docker-compose.yml#L74)

- Migration Alembic ajoutant `metrics`/`metrics_version`.
  [`20260824_0003_route_metrics.py`](../../backend/alembic/versions/20260824_0003_route_metrics.py)

- Nouveaux tests domaine/contrat/intégration/frontend couvrant la matrice I/O et les correctifs de revue.
  [`test_metrics.py`](../../backend/tests/route_engine/test_metrics.py), [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)
