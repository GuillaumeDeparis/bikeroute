---
title: 'Inscription d''un nouveau compte'
type: 'feature'
created: '2026-08-22'
status: 'done'
review_loop_iteration: 1
context: []
baseline_commit: 'NO_VCS'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le projet est vierge de tout code : aucun visiteur ne peut créer de compte, donc personne ne peut accéder à ses futurs parcours et générations.

**Approche:** Bootstrapper le socle applicatif (API FastAPI + PostgreSQL, SPA React) et livrer l'inscription de bout en bout : formulaire Inscription → création du compte avec mot de passe haché → session sécurisée ouverte immédiatement. Cette story pose aussi le schéma `accounts`/`sessions` que les Stories 1.2 et 1.3 réutiliseront tel quel.

## Boundaries & Constraints

**Always:**
- Mot de passe haché avec Argon2id avant toute persistance ; jamais stocké ni journalisé en clair (NFR-5).
- Identifiant unique en comparaison insensible à la casse ; un identifiant déjà pris renvoie une erreur liée au champ `identifiant`, la valeur saisie de l'identifiant est renvoyée au client, jamais le mot de passe.
- À l'inscription réussie, une session est ouverte immédiatement (cookie `HttpOnly`, `Secure`, `SameSite=Lax` référençant une ligne `sessions` en base) — pas de double étape inscription puis connexion.
- Erreurs applicatives au format structuré `code`/`message`/`details`/`correlationId`.
- Identifiants externes (compte, session) en UUIDv7 ; horodatages en UTC ISO-8601.
- Secrets (clé de session, DSN PostgreSQL) fournis par variables d'environnement, jamais en dur.

**Ask First:** Aucune décision supplémentaire anticipée ; si une divergence de stack apparaît (ex. driver PostgreSQL indisponible pour Python 3.14.7), HALT et demander.

**Never:**
- Vérification d'e-mail, récupération de mot de passe, suppression de compte (OQ-9, hors V1).
- Validation de format e-mail sur l'identifiant : c'est une chaîne libre, pas une adresse.
- Mécanisme de dépendance d'autorisation générique (`get_current_account` protégeant des routes tierces) : réservé à la Story 1.3.
- Hexagonal/ports-adapters pour ce module : introduit à partir de l'Epic 2 pour le moteur, pas ici.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription réussie | identifiant disponible, mot de passe valide | 201, compte créé, cookie de session posé, réponse sans mot de passe | N/A |
| Identifiant pris | identifiant déjà en base (casse quelconque) | 409, erreur liée au champ `identifiant`, valeur conservée | `code: IDENTIFIANT_INDISPONIBLE` |
| Champ requis vide | identifiant ou mot de passe vide | 422, erreur liée au champ concerné | `code: CHAMP_REQUIS` |
| Mot de passe trop faible | mot de passe < 10 caractères ou identique à l'identifiant | 422, erreur liée au champ `mot de passe`, identifiant conservé | `code: MOT_DE_PASSE_INVALIDE` |

</frozen-after-approval>

## Code Map

Projet vierge (aucun code applicatif existant, seulement `docs/` et `_bmad*`) — cette story crée le squelette :

- `backend/pyproject.toml` -- projet `uv`, deps FastAPI 0.141.1, SQLAlchemy 2.x, psycopg 3, alembic, argon2-cffi, pytest
- `backend/app/main.py` -- app FastAPI, montage du router auth
- `backend/app/db.py` -- engine/session SQLAlchemy, lecture DSN depuis env
- `backend/app/models/account.py` -- table `accounts` (id UUIDv7, identifiant unique ci-insensible, password_hash, created_at)
- `backend/app/models/session.py` -- table `sessions` (id UUIDv7, account_id FK, created_at, expires_at)
- `backend/app/schemas/auth.py` -- Pydantic `RegisterRequest`/`RegisterResponse`, erreur structurée commune
- `backend/app/services/accounts.py` -- hachage Argon2id, création compte + session, détection doublon
- `backend/app/routers/auth.py` -- `POST /api/auth/register`
- `backend/alembic/` -- migration initiale `accounts` + `sessions`
- `backend/tests/test_register.py` -- couvre la matrice I/O ci-dessus
- `backend/app/config.py` -- tunables centralisés (durée de session, longueurs min/max du mot de passe) lus depuis l'environnement, pour rester ajustables sans toucher au code
- `frontend/package.json`, `frontend/vite.config.ts` -- SPA React + TypeScript ; le serveur de dev Vite sert en HTTPS via un certificat auto-signé (ex. plugin `@vitejs/plugin-basic-ssl`) — l'origine vue par le navigateur doit être `https://` pour que le cookie `Secure` du backend soit conservé (les navigateurs rejettent silencieusement un cookie `Secure` sur une origine `http://`, y compris en local ; voir Design Notes)
- `frontend/src/pages/Inscription.tsx` -- formulaire (UX-DR18/24 : validation au blur et à la soumission, erreur liée au champ, saisie conservée hors mot de passe)
- `frontend/src/api/client.ts` -- appel `POST /api/auth/register`, `credentials: 'include'`
- `docker-compose.yml` -- services `api`, `db` (PostgreSQL 18.4), `frontend` (Vite dev en HTTPS, proxy `/api` vers `api`)

## Tasks & Acceptance

**Execution:**
- [x] `backend/pyproject.toml` -- initialiser le projet `uv` et ses dépendances -- socle requis avant tout code backend
- [x] `backend/app/config.py` -- centraliser durée de session et longueurs min/max du mot de passe via variables d'environnement -- évite les valeurs en dur éparpillées, ajustable sans redéploiement de code
- [x] `backend/app/db.py` -- connexion SQLAlchemy paramétrée par variable d'environnement -- NFR-1, secrets hors code
- [x] `backend/app/models/account.py`, `backend/app/models/session.py` -- déclarer les tables -- schéma réutilisé par 1.2/1.3
- [x] `backend/alembic/` -- migration initiale -- rend le schéma applicable via Docker Compose
- [x] `backend/app/services/accounts.py` -- hachage Argon2id, création compte+session, détection identifiant pris (ci-insensible) -- cœur métier de l'AC
- [x] `backend/app/schemas/auth.py`, `backend/app/routers/auth.py` -- endpoint `POST /api/auth/register`, pose le cookie de session, erreurs structurées -- expose le comportement au frontend
- [x] `backend/tests/test_register.py` -- un test par ligne de la matrice I/O -- garantit la non-régression
- [x] `frontend/vite.config.ts` -- activer HTTPS sur le serveur de dev Vite (certificat auto-signé) -- condition nécessaire pour qu'un vrai navigateur conserve le cookie `Secure` posé par le backend (voir Design Notes)
- [x] `frontend/src/pages/Inscription.tsx` -- formulaire avec validation au blur/submit, erreur par champ, saisie conservée hors mot de passe -- UX-DR18/24
- [x] `frontend/src/api/client.ts` -- appel API avec gestion des codes 201/409/422 -- relie formulaire et backend
- [x] `docker-compose.yml` -- services `api`+`db`+`frontend` -- NFR-1, déploiement reproductible

**Acceptance Criteria:**
- Given un visiteur non connecté sur la page Inscription, when il saisit un identifiant disponible et un mot de passe valide puis valide, then un compte est créé, une session sécurisée est ouverte, et il arrive authentifié sans étape de connexion séparée.
- Given `docker compose up`, when les trois services démarrent et que le certificat auto-signé du frontend est accepté une première fois par le navigateur, then la page Inscription est accessible et l'inscription fonctionne de bout en bout — y compris la persistance réelle du cookie de session dans un vrai navigateur — sans configuration manuelle supplémentaire.

## Spec Change Log

- **Finding (bad_spec, review_loop_iteration 1) :** revue triple (blind-hunter, edge-case-hunter, verification-gap) sur la première implémentation. Le cookie de session posé avec `Secure=True` (conforme à l'`Always` gelé) est silencieusement rejeté par tout vrai navigateur car l'environnement `docker-compose` sert le frontend et l'API en HTTP pur — aucun TLS nulle part. La vérification par `curl` du premier essai ne pouvait pas révéler ce défaut (curl n'applique pas la règle navigateur "Secure exige HTTPS"). Résultat : l'AC "je suis connecté avec une session sécurisée" échouait silencieusement dans le scénario même décrit par la section Verification (`docker compose up` + test manuel via le frontend).
  **Amendé :** Code Map (+`backend/app/config.py`, HTTPS sur le serveur de dev Vite), Tasks & Acceptance (+2 tâches, AC2 précise le certificat auto-signé), Design Notes (note HTTPS-en-local), Verification (test manuel explicitement fait dans un vrai navigateur, pas `curl`, avec vérification DevTools du cookie).
  **État connu-mauvais évité :** relâcher ou rendre conditionnel l'attribut `Secure` du cookie pour "faire marcher" le dev local — rejeté : cela aurait affaibli une invariante gelée pour contourner un problème d'environnement, alors que la vraie cause est l'absence de TLS côté navigateur, pas l'exigence `Secure` elle-même.
  **KEEP :** l'architecture back-end (modèles `accounts`/`sessions`, hachage Argon2id, endpoint `POST /api/auth/register`, format d'erreur structuré, migration Alembic), la structure du composant `Inscription.tsx` et sa gestion d'erreurs par champ, et la couverture de tests par ligne de la matrice I/O ont toutes été jugées saines par la revue — à préserver telles quelles dans la re-dérivation, seul l'ajout HTTPS/config ci-dessus doit changer le comportement observable.

## Design Notes

- **Session vs JWT :** table `sessions` + cookie opaque choisie plutôt qu'un JWT stateless, car la déconnexion explicite (Story 1.2/FR-2) doit invalider réellement la session — un JWT stateless ne se révoque pas sans registre additionnel, ce qui aurait dupliqué l'effort.
- **Durée de session :** défaut 14 jours non glissant, ajustable sans impact de schéma ; ni le PRD ni l'architecture ne fixent de valeur.
- **Politique de mot de passe :** minimum 10 caractères + différent de l'identifiant ; le PRD ne fixe pas de règle, ce seuil est un point de départ documenté ici plutôt que dans le code, pour rester ajustable.
- **HTTPS en local (KEEP — ne pas relâcher `Secure`) :** un cookie `Secure` posé sur une origine `http://` est silencieusement ignoré par tout navigateur réel (RFC 6265bis), même en local — vérifiable seulement dans un vrai navigateur, jamais via `curl`, qui n'applique pas cette règle. La contrainte `Always: cookie Secure` reste donc telle quelle sans exception ; c'est l'origine vue par le navigateur qui doit devenir `https://`. Solution : terminer le TLS au niveau du serveur de dev Vite (ex. `@vitejs/plugin-basic-ssl`, certificat auto-signé) — le trajet interne Vite→`api` peut rester en HTTP sur le réseau Docker, seule l'origine `https://localhost:5173` vue par le navigateur compte pour la politique `Secure`. Le backend n'a besoin d'aucun changement pour cette correction.

## Verification

**Commands:**
- `cd backend && uv run pytest tests/test_register.py` -- expected: tous les cas de la matrice I/O passent
- `docker compose up --build` puis inscription manuelle via le frontend, dans un vrai navigateur (pas `curl`) sur `https://localhost:5173`, en acceptant le certificat auto-signé -- expected: compte visible en base, cookie de session `Secure` réellement conservé par le navigateur (vérifier dans les DevTools, onglet Application/Storage → Cookies), pas de mot de passe en clair dans les logs

## Suggested Review Order

**Cœur métier : identité, mot de passe, session**

- Point d'entrée : valide les champs, normalise l'identifiant, hache le mot de passe et ouvre la session — c'est ici que vivent toutes les règles de la matrice I/O.
  [`accounts.py:61`](../../backend/app/services/accounts.py#L61)

- Identifiant trimé avant toute comparaison/écriture — corrige un doublon invisible (`" alice"` vs `"alice"`) trouvé en revue.
  [`accounts.py:75`](../../backend/app/services/accounts.py#L75)

- Comparaison mot de passe/identifiant passée en insensible à la casse, alignée sur l'unicité de l'identifiant.
  [`accounts.py:91`](../../backend/app/services/accounts.py#L91)

- Garde-fou de longueur d'identifiant ajoutée après revue, avant tout accès base.
  [`accounts.py:77`](../../backend/app/services/accounts.py#L77)

- Paramètres Argon2id désormais explicites et pilotés par la config plutôt que par les défauts de la librairie.
  [`accounts.py:104`](../../backend/app/services/accounts.py#L104)

**Contrat d'erreur structuré et cookie de session**

- Pose le cookie `HttpOnly`/`Secure`/`SameSite=Lax` — invariante gelée, non relâchée malgré le HTTP local (voir Design Notes).
  [`auth.py:44`](../../backend/app/routers/auth.py#L44)

- Handler générique ajouté après revue : toute exception non prévue renvoie désormais le même format structuré que le reste de l'API.
  [`main.py:47`](../../backend/app/main.py#L47)

- Handler de validation FastAPI, gardé contre un `loc` vide (trouvé en revue) pour ne jamais lever une 500 sur une erreur qui devrait être une 422 structurée.
  [`main.py:34`](../../backend/app/main.py#L34)

**HTTPS en dev local (correctif de spec, review_loop_iteration 1)**

- Active un certificat auto-signé sur le serveur de dev Vite — condition nécessaire pour qu'un vrai navigateur conserve un cookie `Secure`, sans jamais relâcher cette exigence côté backend.
  [`vite.config.ts:10`](../../frontend/vite.config.ts#L10)

**Schéma de données**

- Modèle `accounts` : longueur d'identifiant désormais explicite et partagée avec la validation applicative.
  [`account.py:18`](../../backend/app/models/account.py#L18)

- Modèle `sessions` : ligne référencée par le cookie, porte l'expiration non glissante.
  [`session.py:16`](../../backend/app/models/session.py#L16)

**Frontend : formulaire et client API**

- Formulaire d'inscription : validation au blur/submit, erreur liée au champ, mot de passe jamais reconservé après erreur.
  [`Inscription.tsx:54`](../../frontend/src/pages/Inscription.tsx#L54)

- Garde anti-double-soumission ajoutée après revue.
  [`Inscription.tsx:54`](../../frontend/src/pages/Inscription.tsx#L54)

- Client API : tente désormais de lire le corps d'erreur structuré réel avant de retomber sur un message générique.
  [`client.ts:38`](../../frontend/src/api/client.ts#L38)

**Configuration et infra**

- Tunables centralisés (durée de session, longueurs de mot de passe, coûts Argon2id) avec validation croisée au démarrage.
  [`config.py:16`](../../backend/app/config.py#L16)

- Healthcheck Postgres corrigé (trouvé en re-vérification) : `pg_isready` remontait "healthy" avant que la base applicative n'existe réellement.
  [`docker-compose.yml:22`](../../docker-compose.yml#L22)

- Exclusion de `node_modules` du bind mount pour ne pas écraser l'installation hôte avec le build Linux/Alpine du conteneur.
  [`docker-compose.yml:56`](../../docker-compose.yml#L56)

**Tests (matrice I/O + trous de vérification comblés en revue)**

- Suite de tests couvrant chaque ligne de la matrice I/O plus les cas ajoutés en revue (course d'unicité, payload malformé, identifiant blanc/trop long, durée de session).
  [`test_register.py:1`](../../backend/tests/test_register.py#L1)
