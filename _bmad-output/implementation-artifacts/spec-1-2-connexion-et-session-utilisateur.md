---
title: 'Connexion et session utilisateur'
type: 'feature'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '2f75a847f1bbe7a8d806508ab172cba4ed6e2d01'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un compte peut être créé (1.1), mais un utilisateur inscrit ne peut ni se reconnecter, ni se déconnecter, ni être averti proprement si sa session a expiré.

**Approche:** Ajouter connexion, déconnexion et une vérification de session sur le schéma `accounts`/`sessions` de 1.1, plus la coquille minimale (routage de vues, en-tête, Accueil placeholder) pour donner un endroit à "redirigé vers l'Accueil" et "Déconnexion dans le Account menu", sans anticiper le contenu réel de l'Accueil (1.4).

## Boundaries & Constraints

**Always:**
- Connexion réussie : ouvre une session (même mécanisme que l'inscription : cookie `HttpOnly`/`Secure`/`SameSite=Lax`).
- Échec de connexion (identifiant inconnu OU mot de passe faux) : message générique unique, jamais lié à un champ, identifiant conservé, mot de passe jamais conservé.
- Temps de réponse à un échec de connexion constant quelle que soit la cause (identifiant inconnu vs mot de passe faux), pour ne pas trahir par le timing ce que le message générique cache.
- Déconnexion : invalide la session en base, pas seulement le cookie.
- Une route dédiée résout l'identité depuis le cookie et rejette (401 structuré) toute session absente/inconnue/expirée ; c'est elle que le frontend utilise pour détecter une session active ou expirée.
- Aucune route métier protégée (parcours/génération/export) ici, seule l'identité/session.

**Ask First:** Aucune divergence de stack anticipée ; si une apparaît, HALT.

**Never:**
- Autorisation par propriétaire sur ressources métier (réservé 1.3, construit au-dessus de l'identité résolue ici).
- Contenu réel de l'Accueil (réservé 1.4) ; ici, placeholder identifiant + Déconnexion.
- Entrées "Mes parcours"/"Exporter mes données" du Account menu (rien à pointer avant Epic 2/5).
- Librairie de routage : un état de vue suffit pour 3 écrans (cf. Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion réussie | identifiant + mot de passe corrects | 200, session ouverte, cookie posé | N/A |
| Identifiant inconnu | identifiant absent de la base | 401, message générique, identifiant conservé | `code: IDENTIFIANTS_INVALIDES` |
| Mot de passe incorrect | identifiant connu, mauvais mot de passe | 401, même message générique | `code: IDENTIFIANTS_INVALIDES` |
| Vérification session valide | cookie référence une session non expirée | 200, identité renvoyée | N/A |
| Vérification session invalide | cookie absent, expiré, ou orphelin | 401 structuré | `code: SESSION_INVALIDE` |
| Déconnexion | cookie valide ou déjà absent | 204, session supprimée si elle existait, cookie effacé | N/A (idempotent) |

</frozen-after-approval>

## Code Map

- `backend/app/services/sessions.py` (NEW) -- extrait de `accounts.py` : `create_session`, `set_session_cookie`, `clear_session_cookie`, dépendance `get_current_account` (401 `SESSION_INVALIDE`)
- `backend/app/services/accounts.py` -- réutilise ces helpers (au lieu des lignes 104-122 dupliquées) ; ajoute `authenticate_account` (Argon2id, hachage factice si identifiant inconnu)
- `backend/app/schemas/auth.py` -- `LoginRequest`, `AccountResponse` (ex-`RegisterResponse`), `SessionResponse`
- `backend/app/routers/auth.py` -- `POST /login`, `POST /logout`, `GET /session` ; `register` migré vers `sessions.py`
- `backend/tests/test_login.py`, `test_logout.py` (NEW) -- matrices I/O ci-dessus
- `frontend/src/pages/Connexion.tsx` (+`.css`, NEW) -- même structure qu'Inscription.tsx, erreur générique non liée à un champ
- `frontend/src/pages/Accueil.tsx` (NEW) -- placeholder, vérifie la session au montage, bascule vers Connexion sur 401 sans rechargement
- `frontend/src/components/AppHeader.tsx` (NEW) -- marque + Account menu (Déconnexion seule)
- `frontend/src/App.tsx` -- état de vue (connexion/inscription/accueil) résolu via `GET /session` au montage
- `frontend/src/pages/Inscription.tsx` -- après succès, rejoint l'Accueil au lieu du message inline (cf. Design Notes)
- `frontend/src/api/client.ts` -- ajoute `login`/`logout`/`getSession`

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/services/sessions.py` -- extraire session/cookie/`get_current_account` -- socle partagé
- [x] `backend/app/services/accounts.py` -- brancher sur `sessions.py` ; ajouter `authenticate_account` à temps constant -- sécurise le message générique
- [x] `backend/app/schemas/auth.py` -- `LoginRequest`/`AccountResponse`/`SessionResponse` -- contrat des routes
- [x] `backend/app/routers/auth.py` -- `login`/`logout`/`session` -- expose au frontend
- [x] `backend/tests/test_login.py`, `test_logout.py` -- un test par ligne de matrice -- non-régression
- [x] `frontend/src/pages/Connexion.tsx` -- formulaire, erreur générique -- AC connexion
- [x] `frontend/src/pages/Accueil.tsx` -- placeholder + détection d'expiration -- AC session expirée
- [x] `frontend/src/components/AppHeader.tsx` -- Account menu + Déconnexion -- AC déconnexion
- [x] `frontend/src/App.tsx` -- état de vue via `GET /session` -- relie les 3 écrans
- [x] `frontend/src/api/client.ts` -- `login`/`logout`/`getSession` -- relie au backend

**Acceptance Criteria:**
- Given un compte valide, when identifiants corrects sur Connexion, then session ouverte et redirection vers l'Accueil.
- Given une session active sur l'Accueil, when Déconnexion dans le Account menu, then session fermée en base et retour à Connexion.
- Given une session expirée pendant l'usage de l'Accueil, when la vérification de session échoue, then retour à Connexion sans rechargement complet.

## Design Notes

- **1.2 vs 1.3 :** `get_current_account` résout *qui* est connecté ; l'autorisation par propriétaire sur une ressource précise reste entière à 1.3, au-dessus de cette identité.
- **Défense temporelle :** hachage Argon2id factice vérifié si identifiant inconnu, pour qu'aucun canal de timing ne révèle ce que le message générique cache.
- **Pas de routeur :** 3 écrans, aucune URL profonde requise ; un `useState` suffit, à réévaluer à l'atelier cartographique (Epic 2).
- **Inscription → Accueil :** évite deux expériences post-authentification différentes ; ne change rien à la matrice I/O déjà figée de 1.1.

## Verification

**Commands:**
- `cd backend && uv run pytest tests/test_login.py tests/test_logout.py tests/test_register.py` -- expected: toutes les matrices I/O passent, inscription non régressée
- `docker compose up --build` puis connexion/déconnexion manuelles dans un vrai navigateur sur `https://localhost:5173` -- expected: cookie posé puis effacé ; session expirée (réduire `SESSION_DURATION_DAYS`) ramène à Connexion sans rechargement

## Suggested Review Order

**Identité et session (backend)**

- Résout *qui* est connecté depuis le cookie ; 401 structuré si absent/inconnu/expiré — c'est la dépendance que 1.3 réutilisera pour l'autorisation par propriétaire.
  [`sessions.py:76`](../../backend/app/services/sessions.py#L76)

- Déconnexion idempotente : supprime la ligne `sessions` si elle existe, ne lève jamais.
  [`sessions.py:63`](../../backend/app/services/sessions.py#L63)

- Vérification à temps constant : hache toujours un mot de passe, y compris contre un hachage factice si l'identifiant est inconnu, pour que le timing ne trahisse pas le message générique.
  [`accounts.py:139`](../../backend/app/services/accounts.py#L139)

- Hachage factice mis en cache une seule fois (corrigé en revue : l'ancien cache par `id(settings)` était fragile).
  [`accounts.py:133`](../../backend/app/services/accounts.py#L133)

**Endpoints**

- `POST /login`, `POST /logout`, `GET /session` : trois routes qui exposent le socle ci-dessus au frontend.
  [`auth.py:62`](../../backend/app/routers/auth.py#L62)

- `GET /session` renvoie `Cache-Control: no-store` (ajouté en revue) puisqu'elle porte une identité liée à la session.
  [`auth.py:117`](../../backend/app/routers/auth.py#L117)

**Frontend : routage par session**

- Point d'entrée : résout la vue initiale (Connexion/Accueil) via `GET /session` au montage.
  [`App.tsx:22`](../../frontend/src/App.tsx#L22)

- Distingue désormais une vraie session invalide (401) d'une erreur transitoire (réseau/500) avant de forcer la déconnexion — corrigé en revue, sur les deux fichiers qui en dépendaient.
  [`App.tsx:35`](../../frontend/src/App.tsx#L35)
  [`Accueil.tsx:31`](../../frontend/src/pages/Accueil.tsx#L31)

- Détection d'expiration en cours d'usage par sondage périodique, mis en pause hors du champ visible (corrigé en revue).
  [`Accueil.tsx:71`](../../frontend/src/pages/Accueil.tsx#L71)

**Frontend : formulaires et menu compte**

- Connexion : erreur générique non liée à un champ, mot de passe jamais reconservé ; validation cliente ajoutée en revue pour les champs requis.
  [`Connexion.tsx:48`](../../frontend/src/pages/Connexion.tsx#L48)

- Menu compte : Déconnexion ne referme le menu qu'en cas de succès réel ; fermeture au clic extérieur et à Échap ajoutée en revue.
  [`AppHeader.tsx:43`](../../frontend/src/components/AppHeader.tsx#L43)

**Tests**

- Matrices I/O connexion/déconnexion, plus les cas ajoutés en revue (identifiant à espaces, casse, `Max-Age`, isolation entre sessions concurrentes, compte supprimé sous une session encore valide).
  [`test_login.py:1`](../../backend/tests/test_login.py#L1)
