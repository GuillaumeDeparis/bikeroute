---
title: "Calcul initial d'un parcours A→B en création manuelle"
type: 'feature'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
baseline_commit: '55ee4124071e942617715eafe229cb0857ab1302'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Atelier n'a aujourd'hui aucune surface cartographique ni moteur de routage : impossible de poser un départ/une destination et d'obtenir un tracé. Le backend n'a ni PostGIS ni fournisseur de routage, le frontend n'a ni carte ni page dédiée.

**Approach:** Poser le squelette hexagonal du moteur (`route_engine` : domain/application/adapters/bootstrap), exposer un port `RoutingProvider` implémenté par un adaptateur Valhalla, activer PostGIS comme état durable des tracés, et construire une page Atelier minimale (carte + placement de point par clic ou recherche) qui déclenche le calcul automatique dès que départ et destination sont posés.

## Boundaries & Constraints

**Always:**
- Le domaine (`route_engine/domain`, `application`) reste indépendant de FastAPI/SQLAlchemy/du client Valhalla ; seuls les adaptateurs en dépendent (AD-1).
- `RoutingProvider` est un port/protocole ; aucun appel direct à Valhalla hors de son adaptateur (AD-8).
- La géométrie du tracé est persistée en PostGIS, SRID 4326 (AD-3) ; nouveaux identifiants en UUIDv7 (`uuid6.uuid7`, cf. `models/account.py`), horodatages UTC ISO-8601 (AD-11).
- Un point non rattachable au réseau reste marqué « non routé » avec un bandeau d'action ; jamais de segment direct affiché à sa place.
- Erreurs backend au format structuré existant `code/message/details/correlationId` (`errors.py` + handlers de `main.py`).
- Le calcul se déclenche automatiquement dès départ+destination posés, sans aucun paramètre sportif exposé à l'utilisateur.
- Les tests automatisés (unit/contract/integration) n'exigent pas de connexion réseau vers un vrai Valhalla : utiliser un `RoutingProvider` fake/stub et un corpus OSM minimal déterministe pour le contract test.

**Ask First:**
- Si un extrait OSM réel (au-delà du corpus de test minimal) est nécessaire pour la QA manuelle locale de Valhalla — demander quelle région utiliser avant de le télécharger/committer.

**Never:**
- Pas de typage complet du parcours (boucle/aller simple/multi-étapes) ni de son UI dédiée — Story 2.2.
- Pas d'édition du tracé après le premier calcul (déplacer/ajouter/retirer un point, infléchir une portion) — Story 2.3.
- Pas de rôle Docker Compose `worker`/file d'attente asynchrone — introduit en Epic 3 avec la génération assistée ; ce calcul reste synchrone.
- Pas de métriques/profil altimétrique détaillés — Story 2.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Premier point posé | Atelier Manuel sans point, clic carte ou sélection d'un résultat de recherche | Le point devient le départ ; le Contextual menu demande la topologie | N/A |
| Destination posée | Un départ existe déjà, second point posé | Tracé routé calculé automatiquement, sans paramètre sportif, affiché sur la carte | Si le calcul échoue (Valhalla indisponible/erreur), le dernier tracé valide reste affiché et une erreur structurée est présentée |
| Consultation du tracé | Tracé déjà calculé | Basé sur OpenStreetMap (via Valhalla), fournisseur remplaçable derrière `RoutingProvider` (NFR-2/13) | N/A |
| Point non rattachable | Point posé hors réseau routier connu | Point marqué « non routé », bandeau d'état propose déplacer/modifier/supprimer | Aucun segment direct trompeur affiché |

</frozen-after-approval>

## Code Map

- `backend/pyproject.toml` -- ajouter `geoalchemy2` (géométries PostGIS) et un client HTTP pour Valhalla (`httpx`, déjà en dev-group)
- `docker-compose.yml` -- service `db` passe à une image PostGIS (ex. `postgis/postgis:18-3.6`) ; nouveau service `valhalla` (image épinglée + corpus OSM minimal monté), suit les conventions healthcheck/depends_on existantes
- `backend/alembic/versions/` -- nouvelle migration : activer l'extension PostGIS, créer la table `routes` (id UUIDv7, account_id FK, geometry LineString SRID 4326, points, statut, created_at)
- `backend/app/db.py`, `backend/app/models/account.py:28` -- `Base`/`get_db()` et pattern UUIDv7 à reprendre pour les nouveaux modèles
- `backend/app/errors.py`, `backend/app/main.py:61-116` -- `AppError` + handlers ; nouveaux routers à monter ici
- `backend/app/routers/auth.py`, `backend/app/services/authorization.py` -- conventions `APIRouter`/`Depends(get_db)`/`response_model`, et `get_owned_or_404` réutilisable pour la ressource « parcours »
- `backend/app/route_engine/{domain,application,adapters/{inbound,outbound},bootstrap}/` -- nouveau module hexagonal (structural seed, cf. ARCHITECTURE-SPINE.md)
- `frontend/src/App.tsx` -- union `Vue` (actuellement sans routeur, cf. commentaire ligne 8-9) : ajouter le variant `atelier`
- `frontend/src/api/client.ts` -- pattern `fetch(credentials: 'include')` + `ApiError` à suivre pour `calculerParcours`/`rechercherAdresse`
- `_bmad-output/planning-artifacts/ux-designs/ux-bikeroute-2026-08-19/EXPERIENCE.md` (UX-DR10/11/17), `mockups/key-atelier-manuel.html` -- Contextual menu, Route point, Place search, états à couvrir

## Tasks & Acceptance

**Execution:**
- [x] `backend/pyproject.toml` -- ajouter `geoalchemy2` -- géométries PostGIS côté ORM
- [x] `docker-compose.yml` -- basculer `db` sur une image PostGIS, ajouter le service `valhalla` (image épinglée + corpus OSM minimal) -- AD-12, réplique locale du routage
- [x] `backend/alembic/versions/xxxx_postgis_routes.py` -- activer PostGIS, créer la table `routes` -- AD-3, état durable des tracés
- [x] `backend/app/route_engine/domain/` -- entités (point, tracé, résultat incl. segments non routés), calculs normatifs sans dépendance externe -- AD-1
- [x] `backend/app/route_engine/application/ports.py` -- protocole `RoutingProvider.route(points) -> RouteResult` -- AD-8
- [x] `backend/app/route_engine/adapters/outbound/valhalla_provider.py` -- implémente `RoutingProvider` via l'API Valhalla, isole les points non routables -- AD-8
- [x] `backend/app/route_engine/adapters/inbound/routes_router.py` -- `POST /api/routes/calculate` (départ+destination → tracé), monté dans `main.py`
- [x] `backend/app/routers/geocode.py` -- `GET /api/geocode?q=` proxy Nominatim pour la recherche d'adresse (UX-DR17)
- [x] `backend/tests/route_engine/` -- tests unitaires domaine, contract test `RoutingProvider` (fake), test d'intégration endpoint (cas heureux + point non routé)
- [x] `frontend/package.json` -- ajouter `leaflet` + `react-leaflet` (carte OSM)
- [x] `frontend/src/App.tsx` -- variant `{ nom: 'atelier' }`, point d'entrée depuis l'Accueil
- [x] `frontend/src/pages/Atelier.tsx` -- carte, placement de point (clic/recherche), menu contextuel minimal (départ → choix topologie ; destination → calcul auto), bandeau « non routé »
- [x] `frontend/src/api/client.ts` -- `calculerParcours(points)`, `rechercherAdresse(q)`
- [x] `frontend/src/pages/Atelier.test.tsx` -- couvre les 4 scénarios de la matrice I/O

**Acceptance Criteria:**
- Given l'Atelier en mode Manuel sans point posé, when je place un point (recherche ou clic carte), then il devient le départ et le Contextual menu demande la topologie.
- Given j'ai un départ, when je place une destination, then un premier tracé routé est calculé automatiquement sans paramètre sportif.
- Given le tracé est calculé, when je le consulte, then il repose sur OpenStreetMap et le fournisseur de routage reste remplaçable derrière `RoutingProvider`.
- Given un point ne peut être rattaché au réseau, when j'observe le retour du système, then il reste marqué « non routé » avec un bandeau d'action, sans segment direct trompeur.

## Spec Change Log

## Design Notes

- **Routage frontend :** on étend l'union `Vue` existante (`{ nom: 'atelier' }`) plutôt que d'introduire `react-router` — reste cohérent avec le choix déjà documenté en 1.2 (pas de dépendance de routage pour un nombre d'écrans encore limité), à réévaluer si l'Atelier a besoin d'URLs profondes.
- **Rôle `worker` :** différé à l'Epic 3. La story 2.1 est un calcul synchrone (« calcul automatiquement dès que... ») ; AD-12 vise 4 rôles au global du projet, pas dès cette story.
- **Carte :** Leaflet + `react-leaflet` retenus (léger, licence permissive, écosystème OSM mature) plutôt que MapLibre — aucun des deux n'était déjà présent dans le repo.
- **Contract `RoutingProvider` (esquisse) :**
  ```python
  class RoutingProvider(Protocol):
      def route(self, points: list[Coordinate]) -> RouteResult: ...
  # RouteResult : geometry (LineString), unrouted_points: list[Coordinate], provider, version
  ```

## Verification

**Commands:**
- `cd backend && uv run pytest` -- tests unitaires/contract/intégration du moteur de routage passent
- `cd frontend && npm run test` -- tests de `Atelier.test.tsx` passent
- `docker compose up` -- les 3 services (`db` PostGIS, `api`, `valhalla`) démarrent et passent `healthy`

**Manual checks (if no CLI):**
- Dans l'Atelier, poser un départ puis une destination : un tracé apparaît sans paramètre sportif demandé.
- Poser un point isolé (hors réseau routier du corpus de test) : bandeau « non routé » affiché, aucun segment direct.

## Suggested Review Order

**Point d'entrée**

- `calculer_parcours` orchestre les ports injectés sans jamais toucher FastAPI/SQLAlchemy/Valhalla — la couture hexagonale du moteur.
  [`calculate_route.py:25`](../../backend/app/route_engine/application/calculate_route.py#L25)

**Domaine & ports (squelette hexagonal, AD-1/AD-8)**

- `RouteResult.est_route` exige désormais ≥2 coordonnées — corrige un « tracé » à un seul point classé routé (revue post-implémentation).
  [`models.py:44`](../../backend/app/route_engine/domain/models.py#L44)
- `RoutingProvider`/`RouteRepository` : les deux protocoles que tout adaptateur implémente.
  [`ports.py:18`](../../backend/app/route_engine/application/ports.py#L18)

**Adaptateur Valhalla**

- `route()` pré-vérifie `/locate` avant `/route` — Valhalla ne désigne pas fiablement le point fautif dans une erreur `/route`.
  [`valhalla_provider.py:76`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L76)
- `_points_non_rattachables` vérifie la longueur de la réponse `/locate` avant d'apparier les points (évite un mauvais appariement silencieux, revue post-implémentation).
  [`valhalla_provider.py:112`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L112)
- `_version()` survit désormais à un `/status` au JSON invalide (revue post-implémentation).
  [`valhalla_provider.py:149`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L149)
- `_decode_polyline6` survit désormais à une `shape` tronquée (revue post-implémentation).
  [`valhalla_provider.py:28`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L28)

**HTTP entrant**

- `calculate()` compose les ports et ne laisse plus fuiter de géométrie hors statut « routed » (bug trouvé et corrigé pendant la revue).
  [`routes_router.py:39`](../../backend/app/route_engine/adapters/inbound/routes_router.py#L39) (voir aussi la garde [ligne 77](../../backend/app/route_engine/adapters/inbound/routes_router.py#L77))
- `geocode()` proxifie Nominatim et applique désormais un rate limit (revue post-implémentation).
  [`geocode.py:34`](../../backend/app/routers/geocode.py#L34) (garde [ligne 43](../../backend/app/routers/geocode.py#L43))

**Persistance PostGIS (AD-3)**

- `save()` construit le WKT `LINESTRING` et refuse désormais les géométries <2 points (revue post-implémentation).
  [`postgis_route_repository.py:31`](../../backend/app/route_engine/adapters/outbound/postgis_route_repository.py#L31)
- Table `routes` : géométrie/points/statut/fournisseur, id UUIDv7, FK en cascade.
  [`route.py:28`](../../backend/app/models/route.py#L28)

**Infra (cycle de vie, déploiement)**

- Singleton du provider Valhalla : construction paresseuse, fermeture au shutdown (revue post-implémentation).
  [`routing.py:22`](../../backend/app/route_engine/bootstrap/routing.py#L22)
- Le lifespan de l'API ferme désormais le client Valhalla à l'arrêt.
  [`main.py:60`](../../backend/app/main.py#L60) (voir [ligne 65](../../backend/app/main.py#L65))
- Stack Compose à 3 rôles actifs (`db` PostGIS, `api`, `valhalla` — le rôle `worker` reste différé à l'Epic 3).
  [`docker-compose.yml:56`](../../docker-compose.yml#L56)

**Atelier (frontend)**

- `premierPointPose` mémoïsé sur des deps primitives — corrige un recentrage de carte en boucle à chaque render (bug trouvé et corrigé pendant la revue).
  [`Atelier.tsx:107`](../../frontend/src/pages/Atelier.tsx#L107)
- `reinitialiserPoints` remplace une suppression par rôle — corrige un point « destination » orphelin bloquant durablement le recalcul auto, atteignable depuis l'AC4 (bug trouvé et corrigé pendant la revue).
  [`Atelier.tsx:133`](../../frontend/src/pages/Atelier.tsx#L133)
- `AbortController` câblé sur le calcul auto et la recherche (revue post-implémentation).
  [`Atelier.tsx:151`](../../frontend/src/pages/Atelier.tsx#L151) et [`Atelier.tsx:216`](../../frontend/src/pages/Atelier.tsx#L216)
- `App.tsx` ajoute la vue `atelier` ; le CTA de l'Accueil n'est plus désactivé.
  [`App.tsx:20`](../../frontend/src/App.tsx#L20) · [`Accueil.tsx:100`](../../frontend/src/pages/Accueil.tsx#L100)

**Client API**

- `calculerParcours`/`rechercherAdresse` traduisent snake_case → camelCase et acceptent un signal d'annulation.
  [`client.ts:164`](../../frontend/src/api/client.ts#L164) · [`client.ts:208`](../../frontend/src/api/client.ts#L208)

**Périphérique (tests, migration, bookkeeping)**

- Migration Alembic : active PostGIS, crée `routes` (index spatial explicite).
  [`20260823_0002_postgis_routes.py`](../../backend/alembic/versions/20260823_0002_postgis_routes.py)
- Suites de tests : domaine, application (fakes), contrat Valhalla (fixtures capturées sur un vrai serveur), intégration router, geocode, mapping client, composant Atelier.
  [`test_domain.py`](../../backend/tests/route_engine/test_domain.py) · [`test_valhalla_provider_contract.py`](../../backend/tests/route_engine/test_valhalla_provider_contract.py) · [`test_routes_router_integration.py`](../../backend/tests/route_engine/test_routes_router_integration.py) · [`test_geocode.py`](../../backend/tests/test_geocode.py) · [`client.test.ts`](../../frontend/src/api/client.test.ts) · [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)
- Corpus OSM synthétique et déterministe (pas d'extrait réel, cf. « Ask First »).
  [`corpus.osm.xml`](../../deploy/valhalla/corpus.osm.xml)
</content>
