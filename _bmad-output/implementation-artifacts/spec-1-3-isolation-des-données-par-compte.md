---
title: 'Isolation des données par compte'
type: 'feature'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '48ccd1cc4cf4bcce9ea73387ec40919a4e9b1717'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-13 exige que toute ressource métier soit lue/écrite via l'identité du principal authentifié et refusée entre comptes — mais aucune ressource métier n'existe encore (parcours/génération/export arrivent en Epic 2+), donc ce mécanisme générique n'est ni construit ni prouvé.

**Approche:** Construire le mécanisme d'autorisation par propriétaire comme utilitaire réutilisable (à adopter tel quel par les Epics 2-5), et le prouver par un vrai cas d'usage backend existant : lister ses sessions actives et en révoquer une par id. Aucune nouvelle surface UI : ni EXPERIENCE.md ni DESIGN.md ne prévoient d'écran de gestion des sessions.

## Boundaries & Constraints

**Always:**
- Identité de toute opération = `get_current_account`/cookie de session, jamais une valeur client (payload, query param).
- Ressource scopée par compte (ex. `sessions`) : accès refusé en 404 (jamais 403) si elle appartient à un autre compte — pas d'oracle d'existence entre comptes.
- Non authentifié sur route protégée → 401 `SESSION_INVALIDE` existant, inchangé.
- Vérification de propriété = utilitaire générique (un module, une fonction), pas un cas spécial des sessions — Epics 2-5 doivent pouvoir l'importer tel quel.

**Ask First:** Aucune divergence de stack anticipée ; si une apparaît, HALT.

**Never:**
- Aucune ressource métier fictive (parcours, génération) n'est créée ici pour "avoir quelque chose à protéger" : la démonstration passe par les sessions, déjà réelles depuis 1.2.
- Aucun changement frontend : pas d'écran "Mes sessions" (hors périmètre UX approuvé).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lister ses sessions actives | authentifié, ≥1 session active | 200, liste des sessions du compte, `current: true` sur celle du cookie | N/A |
| Révoquer une autre de ses sessions | authentifié, id d'une session du même compte | 204, session supprimée, autres sessions du compte inchangées | N/A |
| Révoquer sa session courante | authentifié, id = session du cookie | 204, session supprimée et cookie effacé | N/A |
| Révoquer une session d'un autre compte | authentifié, id appartenant à un autre compte | 404, rien supprimé | `code: RESSOURCE_INTROUVABLE` |
| Révoquer un id inexistant | authentifié, id qui n'existe pas | même 404 que ci-dessus (pas d'oracle) | `code: RESSOURCE_INTROUVABLE` |
| Non authentifié | cookie absent/invalide sur `GET`/`DELETE /sessions` | 401 structuré (comportement 1.2 inchangé) | `code: SESSION_INVALIDE` |

</frozen-after-approval>

## Code Map

- `backend/app/services/authorization.py` (NEW) -- `get_owned_or_404(db, model, resource_id, account_id)` générique (`select(model).where(model.id == resource_id, model.account_id == account_id)`, 404 `RESSOURCE_INTROUVABLE` sinon) -- le mécanisme que 2-5 réutiliseront
- `backend/app/services/sessions.py` -- extrait `resolve_current_session(request, db, settings) -> SessionModel` ; `get_current_account` devient un simple wrapper dessus ; ajoute `list_active_sessions(db, account_id)`
- `backend/app/schemas/auth.py` -- `SessionListItem` (id, created_at, expires_at, current)
- `backend/app/routers/auth.py` -- `GET /sessions`, `DELETE /sessions/{session_id}` (utilise `authorization.get_owned_or_404`)
- `backend/tests/test_sessions_authorization.py` (NEW) -- couvre la matrice I/O ci-dessus, avec deux comptes distincts pour prouver le refus inter-comptes

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/services/authorization.py` -- `get_owned_or_404` générique -- socle réutilisable par Epic 2-5
- [x] `backend/app/services/sessions.py` -- extraire `resolve_current_session`, ajouter `list_active_sessions` -- expose la session courante et la liste sans dupliquer la résolution du cookie
- [x] `backend/app/schemas/auth.py` -- `SessionListItem` -- contrat de `GET /sessions`
- [x] `backend/app/routers/auth.py` -- `GET /sessions`, `DELETE /sessions/{session_id}` -- expose le mécanisme, prouve les 3 AC
- [x] `backend/tests/test_sessions_authorization.py` -- un test par ligne de matrice, dont refus inter-comptes -- non-régression du mécanisme central

**Acceptance Criteria:**
- Given je suis authentifié, when j'appelle une opération sur une ressource métier (ici une session), then l'identité utilisée est celle du principal authentifié côté serveur, jamais une valeur du client.
- Given une ressource appartient à un autre compte, when je tente d'y accéder avec le mien, then l'accès est refusé côté serveur (404), quelle que soit la requête envoyée.
- Given je ne suis pas authentifié, when je tente d'accéder à une ressource protégée, then l'accès est refusé (401) et je suis invité à me connecter (comportement 1.2 réutilisé sans changement).

## Design Notes

- **404 pas 403 :** un 403 confirmerait l'existence de la ressource chez un autre compte (oracle) ; 404 traite "n'existe pas" et "pas à vous" identiquement.
- **Sessions comme vecteur de preuve :** seule donnée réelle déjà scopée par compte avant l'Epic 2 ; évite d'inventer une ressource fictive.
- **Aucun frontend :** aucune surface "Mes sessions" dans EXPERIENCE.md/DESIGN.md ; en ajouter une serait plus de dérive de périmètre que l'endpoint lui-même.

## Verification

**Commands:**
- `cd backend && uv run pytest tests/test_sessions_authorization.py tests/test_login.py tests/test_logout.py tests/test_register.py` -- expected: matrice I/O passe, rien de régressé sur 1.1/1.2
- `docker compose up --build` puis, avec deux comptes distincts (curl, cookies séparés) : lister ses sessions, révoquer sa propre session (204), tenter de révoquer une session de l'autre compte (404) -- expected: comportement exact de la matrice

## Suggested Review Order

**Le mécanisme générique**

- Cœur de la story : 404 (jamais 403) si la ressource n'existe pas ou appartient à un autre compte — le seul contrat qu'Epic 2-5 devront respecter en l'important tel quel.
  [`authorization.py:21`](../../backend/app/services/authorization.py#L21)

**Identité et session courante**

- Extrait de `get_current_account` : résout la session depuis le cookie sans dupliquer la validation, réutilisé par les deux nouvelles routes pour connaître "laquelle est la session courante".
  [`sessions.py:76`](../../backend/app/services/sessions.py#L76)

- Liste des sessions actives, tri stable ajouté en revue (départage par id quand `created_at` coïncide).
  [`sessions.py:117`](../../backend/app/services/sessions.py#L117)

**Endpoints**

- `GET /sessions` : applique le mécanisme générique en lecture, marque la session courante.
  [`auth.py:142`](../../backend/app/routers/auth.py#L142)

- `DELETE /sessions/{id}` : applique le mécanisme générique en écriture ; capture l'id avant suppression et délègue à `invalidate_session` (corrigé en revue — un seul chemin de suppression pour tout le module, plus la même primitive que `logout`).
  [`auth.py:173`](../../backend/app/routers/auth.py#L173)

**Tests : preuve des 3 AC**

- Refus inter-comptes sans oracle (404 identique, ressource inexistante ou appartenant à un autre compte).
  [`test_sessions_authorization.py:181`](../../backend/tests/test_sessions_authorization.py#L181)

- Non authentifié refusé (401), y compris cookie syntaxiquement invalide sur les deux routes — asymétrie de couverture comblée en revue.
  [`test_sessions_authorization.py:253`](../../backend/tests/test_sessions_authorization.py#L253)

- Sessions expirées exclues de la liste, ordre "plus récente d'abord" vérifié positionnellement — deux trous de vérification comblés en revue.
  [`test_sessions_authorization.py:73`](../../backend/tests/test_sessions_authorization.py#L73)
