---
title: "Revêtements, catégories routières, montées significatives et profil altimétrique (détail)"
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'ccb2ddb3e11aeb780eb060eaa55f46c04604695f'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-bikeroute-2026-08-20/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La bulle déployée (spec-2-5, socle livré) montre distance/D+/D-/durée/difficulté mais pas revêtements, catégories routières, montées significatives, ni le profil altimétrique en courbe continue -- reliquat explicite de FR-40, tracé dans `deferred-work.md`.

**Approach:** Étendre la méthode de calcul serveur versionnée (`calculer_metriques`, NFR-9) avec un second appel Valhalla `/trace_attributes` sur le tracé déjà routé (revêtements/catégories, NFR-10) et une détection des montées significatives depuis le profil déjà disponible (mêmes points que D+/D-) ; compléter la bulle déployée avec ces sections et la courbe SVG.

## Boundaries & Constraints

**Always:**
- Revêtements/catégories routières : proportions (somme des distances de segments / distance totale du tracé), calculées par la même méthode versionnée (`METRICS_VERSION` incrémenté).
- Clé "inconnu" toujours présente dans `revetements` (même à 0), jamais repliée silencieusement dans une catégorie favorable (NFR-10).
- Montée significative : segment continu ≥500 m à pente moyenne ≥3 % (ou ≥50 m de D+ cumulé sur le segment), calculé depuis le profil (mêmes points géométrie+élévations que D+/D-).
- Profil : point-à-point sur la géométrie routée réelle (mêmes points déjà utilisés pour D+/D-), jamais un binning par paliers.
- Échec de l'extraction `/trace_attributes` traité comme `RoutingProviderError` (même 502 que le reste) -- pas de métriques partielles, cohérent avec le traitement déjà établi.
- Toujours calculé et persisté au moment du calcul du tracé, même flush que le reste des métriques (déjà en place).

**Ask First:** Aucune -- extraction via `/trace_attributes`, seuils de montée significative et rendu point-à-point du profil tranchés avec l'utilisateur avant la spec initiale (24/08/2026, voir spec-2-5 socle).

**Never:**
- Courbe altimétrique par paliers/binned -- toujours une ligne continue point à point.
- Décimation/rééchantillonnage du profil en V1 (poids réseau non traité ici, voir Design Notes).
- Paramètre sportif exposé à l'utilisateur ; recalcul de métriques côté frontend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Revêtement partiellement inconnu | 6 % du tracé sans tag `surface` OSM | `revetements["inconnu"] = 0.06`, affiché explicitement | N/A |
| Aucune montée significative | Parcours plat (<3 % partout) | `montees_significatives` vide, section absente sans erreur | N/A |
| Montée significative unique | Segment continu 800 m à pente moyenne 4 % | Une entrée (distance/dénivelé/pente) | N/A |
| Extraction attributs en échec | `/trace_attributes` indisponible/erreur | Même échec 502 que le reste des métriques | `MOTEUR_ROUTAGE_INDISPONIBLE`, réutilisé tel quel |
| Courbe altimétrique | Parcours routé avec profil disponible | Ligne SVG continue selon la distance réelle | N/A |

</frozen-after-approval>

## Code Map

- `backend/app/route_engine/domain/models.py:28-` (`RouteResult`) -- nouveau `SegmentAttribut(distance_m: float, valeur: str)` ; `surface_segments`/`road_class_segments: tuple[SegmentAttribut,...]` (défaut `()`) sur `RouteResult`.
- `backend/app/route_engine/domain/metrics.py` -- `METRICS_VERSION` → `"2"` ; `calculer_metriques` gagne `surface_segments`/`road_class_segments` en entrée et `revetements`/`categories_routieres`/`profil`/`montees_significatives` sur `RouteMetrics` (nouvelles fonctions privées : proportions par segment avec clé "inconnu", détection de montées depuis le profil déjà calculé pour D+/D-).
- `backend/app/route_engine/adapters/outbound/valhalla_provider.py:80-151` (`route`) -- nouvelle méthode privée `_attributs_voie(geometry)` : second appel `/trace_attributes` (`shape_match: "map_snap"`) après décodage de la géométrie, peuple `surface_segments`/`road_class_segments` ; mêmes garanties d'erreur (`RoutingProviderError`) que `/route`/`/locate`.
- `backend/app/route_engine/application/calculate_route.py:52-57` -- transmettre `result.surface_segments`/`road_class_segments` à `calculer_metriques`.
- `backend/app/route_engine/adapters/inbound/schemas.py:31-40` (`MetriquesResponse`) -- `revetements: dict[str, float]`, `categories_routieres: dict[str, float]`, `profil: list[PointProfilResponse]` (nouveau, `distance_m`/`elevation_m`), `montees_significatives: list[MonteeSignificativeResponse]` (nouveau, `distance_m`/`denivele_m`/`pente_moyenne`).
- `backend/app/route_engine/adapters/outbound/postgis_route_repository.py:47-55` -- sérialiser les 4 nouveaux champs dans le même JSONB `metrics`.
- `frontend/src/api/client.ts:146-231` (`Metriques`) -- 4 nouveaux champs, mapping snake→camel.
- `frontend/src/pages/Atelier.tsx:256-304` (`BulleMetriques`, section `depliee`) -- listes revêtements/catégories/montées significatives + `<svg>` courbe continue depuis `profil` (patron `mockups/key-atelier-manuel.html`/`key-mobile-atelier.html`, `.elevation path`).
- `frontend/src/pages/Atelier.css` -- styles des nouvelles listes + courbe SVG.
- `backend/tests/route_engine/test_metrics.py`, `test_valhalla_provider_contract.py`, `frontend/src/pages/Atelier.test.tsx` -- matrice I/O ci-dessus.

## Tasks & Acceptance

**Execution:**
- [x] Domaine : `SegmentAttribut` + `RouteResult.surface_segments`/`road_class_segments`
- [x] `domain/metrics.py` -- `METRICS_VERSION="2"`, proportions revêtements/catégories (clé "inconnu"), profil, détection montées significatives
- [x] `adapters/outbound/valhalla_provider.py` -- `_attributs_voie` via `/trace_attributes`
- [x] `application/calculate_route.py` -- transmettre les attributs à `calculer_metriques`
- [x] `adapters/inbound/schemas.py` -- étendre `MetriquesResponse`
- [x] `adapters/outbound/postgis_route_repository.py` -- sérialiser les nouveaux champs
- [x] `frontend/src/api/client.ts` -- étendre `Metriques`
- [x] `frontend/src/pages/Atelier.tsx`, `Atelier.css` -- sections revêtements/catégories/montées + courbe SVG dans `BulleMetriques`
- [x] `backend/tests/...`, `frontend/src/pages/Atelier.test.tsx` -- matrice I/O (revêtement inconnu, montée significative, absence de montée, échec extraction, courbe)

**Acceptance Criteria:**
- Given je déploie la bulle, when le détail s'affiche, then je vois en plus revêtements, catégories routières, montées significatives et un profil altimétrique en courbe continue selon la distance réelle.
- Given une portion de revêtement est inconnue, when je consulte les métriques, then sa proportion est indiquée explicitement, sans être transformée silencieusement en donnée favorable.

## Design Notes

- Décisions tranchées avec l'utilisateur avant la spec initiale (24/08/2026) : extraction via un second appel Valhalla `/trace_attributes` ; montée significative = segment ≥500 m à pente moyenne ≥3 % (ou ≥50 m de D+ cumulé équivalent).
- Profil = les mêmes points `(distance cumulée, élévation)` déjà utilisés pour D+/D- (mêmes vertices de géométrie routée) -- pas de rééchantillonnage à intervalle fixe. Densité dépendante de la généralisation de forme Valhalla (dense en courbe, plus clairsemée en ligne droite) ; suffisant pour une courbe "jamais par paliers" (rendu en ligne continue, pas en barres), pas nécessairement pour une esthétique lissée -- si un futur retour utilisateur demande un lissage visuel ou une décimation pour les tracés très longs, à traiter séparément (non bloquant ici, aucune AC ne l'exige).
- `/trace_attributes` : `shape_match: "map_snap"` sur la géométrie déjà décodée (le tracé est reconnu, pas une trace GPS bruitée) ; `edges[].length` (km) → mètres, `edges[].surface`/`road_class` absents traités comme "inconnu".

## Verification

**Commands:**
- `cd backend && uv run pytest -q` -- nouveaux tests passent, aucune régression
- `cd frontend && npm run test -- --run` -- nouveaux scénarios passent
- `cd frontend && npx tsc -b && npx oxlint` -- aucune erreur

**Manual checks (if no CLI):**
- Parcours routé avec dénivelé : bulle déployée affiche revêtements/catégories/montées significatives et une courbe altimétrique continue cohérente avec le relief réel.
- Parcours plat : section "Montées significatives" absente, pas d'erreur.

## Suggested Review Order

**Domaine : proportions, profil, détection de montées**

- `calculer_metriques` : point d'entrée, transmet désormais `surface_segments`/`road_class_segments` aux nouvelles fonctions de calcul.
  [`metrics.py:193`](../../backend/app/route_engine/domain/metrics.py#L193)

- `_proportions_par_segment` : proportions par distance de segment, clé "inconnu" toujours présente (NFR-10).
  [`metrics.py:86`](../../backend/app/route_engine/domain/metrics.py#L86)

- `_construire_profil`/`_detecter_montees_significatives` : mêmes points que D+/D- (aucun rééchantillonnage), segmentation des montées ≥500 m/≥3 %.
  [`metrics.py:122`](../../backend/app/route_engine/domain/metrics.py#L122)

**Adaptateur Valhalla : second appel `/trace_attributes`**

- `_attributs_voie` : `shape_match: "map_snap"` sur la géométrie déjà routée, erreurs (mapping invalide, longueur négative/booléenne) retombent sur `RoutingProviderError` (correctifs de revue).
  [`valhalla_provider.py:169`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L169)

- `_valeur_ou_inconnue` : surface/catégorie absente ou vide (après `strip()`) traitée comme "inconnu", jamais un libellé errant.
  [`valhalla_provider.py:66`](../../backend/app/route_engine/adapters/outbound/valhalla_provider.py#L66)

**Frontend : sections déployées et courbe altimétrique**

- `construireCourbeAltimetrique` : ligne SVG continue point à point, garde `>= 2` points (correctif de revue).
  [`Atelier.tsx:284`](../../frontend/src/pages/Atelier.tsx#L284)

- Courbe décorative (`aria-hidden`) doublée d'un résumé textuel masqué (min/max altitude, D+ total) pour les lecteurs d'écran (correctif de revue).
  [`Atelier.tsx:437`](../../frontend/src/pages/Atelier.tsx#L437)

- `formatPourcentage` : affichage des proportions revêtements/catégories dans la bulle déployée.
  [`Atelier.tsx:249`](../../frontend/src/pages/Atelier.tsx#L249)

**Peripherals**

- Mapping snake→camel des nouveaux champs, défensif (`?? []`) si absents de la réponse (correctif de revue).
  [`client.ts:270`](../../frontend/src/api/client.ts#L270)

- Tests couvrant la matrice I/O et les correctifs de revue (dont le test anti-inversion revêtements/catégories).
  [`test_metrics.py`](../../backend/tests/route_engine/test_metrics.py), [`test_calculate_route_application.py`](../../backend/tests/route_engine/test_calculate_route_application.py), [`client.test.ts`](../../frontend/src/api/client.test.ts), [`Atelier.test.tsx`](../../frontend/src/pages/Atelier.test.tsx)
