- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Ajouter une limitation de débit (rate limiting) sur les endpoints d'authentification, dont `POST /api/auth/register`.
  evidence: Sans limite, l'endpoint peut être utilisé pour créer des comptes en masse ou pour sonder quels identifiants sont déjà pris (la réponse 409 est un oracle de disponibilité). Hors périmètre de la Story 1.1 ; concerne aussi Connexion (1.2), donc à traiter une fois ces endpoints réunis.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Envisager de hacher les jetons de session à la place de stocker l'identifiant de session (UUIDv7) en clair comme valeur du cookie porteur.
  evidence: Aujourd'hui, `sessions.id` sert à la fois de clé primaire et de jeton porteur transmis au navigateur ; une fuite de la table `sessions` (sauvegarde, réplique, faille ailleurs) donnerait des jetons valides immédiatement exploitables. Amélioration de défense en profondeur, pas un défaut bloquant (entropie UUIDv7 suffisante contre le brute-force) ; naturel à traiter avec le reste du mécanisme de session en Story 1.2/1.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Mettre en place une CI (lint + tests backend et frontend) pour le dépôt.
  evidence: Aucune configuration CI n'existe ; c'est une préoccupation transverse à tout le projet, pas spécifique à cette story, mais la revue l'a relevée à répétition faute d'un autre endroit où la tracer.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Ajouter une suite de tests automatisés côté frontend (Vitest/Testing Library) pour `Inscription.tsx` et `client.ts`.
  evidence: Le backend a une couverture de tests par ligne de la matrice I/O ; la logique équivalente côté client (validation, mapping des erreurs par champ) n'a aucune couverture automatisée, alors qu'elle porte une partie du contrat utilisateur (UX-DR18/24). Devenu plus pressant après la Story 1.2 : le routage de session dans `App.tsx` (accueil vs connexion selon `GET /session`) et la détection d'expiration par sondage dans `Accueil.tsx` — deux mécanismes centraux de cette story — sont eux aussi entièrement non couverts.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-connexion-et-session-utilisateur.md`
  summary: Purger périodiquement les lignes `sessions` expirées (et orphelines) au lieu de les laisser s'accumuler indéfiniment.
  evidence: `get_current_account` traite une session expirée comme invalide (401) mais ne supprime jamais la ligne correspondante ; aucun job de nettoyage n'existe. Sans purge, la table `sessions` croît sans borne avec des lignes mortes.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-connexion-et-session-utilisateur.md`
  summary: Ajouter des en-têtes de sécurité transverses (ex. `X-Frame-Options`/`frame-ancestors`) à l'API.
  evidence: Aucun en-tête anti-clickjacking n'est configuré dans `main.py` ; devient plus pertinent depuis que l'app expose une action destructrice en un clic (Déconnexion) dans le Account menu. Concerne toute l'API, pas une route en particulier.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-isolation-des-données-par-compte.md`
  summary: Ajouter un endpoint "révoquer toutes mes autres sessions" en complément de `GET/DELETE /api/auth/sessions`.
  evidence: Complément standard pour la récupération après compromission de compte ; aucune surface UX ne le prévoit encore, donc pas construit maintenant, mais la donnée (liste des sessions) existe déjà depuis cette story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-isolation-des-données-par-compte.md`
  summary: Enrichir `SessionListItem` d'un indice d'appareil (user-agent, IP approximative) pour distinguer les sessions listées.
  evidence: Aujourd'hui un utilisateur avec plusieurs sessions actives ne peut pas savoir laquelle est laquelle avant de révoquer. À concevoir délibérément plutôt qu'en ajoutant une capture d'IP/UA par défaut, car AD-10 (minimisation des journaux) demande de ne pas collecter ce type de donnée sans raison explicite.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Ajouter un README racine documentant `docker compose up`, la migration Alembic hors Docker, et l'acceptation du certificat auto-signé du frontend en local.
  evidence: Rien ne documente ces étapes ; actuellement récupérable en lisant le code/spec, mais deviendra nécessaire dès qu'un deuxième contributeur rejoint le projet.

## Deferred from: code review of épic 1 (2026-08-23)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Normaliser Unicode (NFC/NFKC) l'identifiant et le mot de passe avant comparaison/hachage.
  evidence: Sans normalisation, deux saisies visuellement identiques mais composées différemment (accents combinants vs précomposés) seraient traitées comme des valeurs distinctes — source réelle mais rare de "mon mot de passe ne marche pas". Deferred : edge case Unicode peu fréquent, à revisiter avec un futur travail d'internationalisation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Ajouter un `server_default` en base pour `id`/`created_at`/`expires_at` sur `accounts`/`sessions` plutôt que de dépendre uniquement des défauts côté ORM.
  evidence: Un futur insert SQL brut (script de seed, correctif manuel) violerait les contraintes NOT NULL. Deferred : un `server_default` naïf pour `id` (ex. `gen_random_uuid()`) produirait un UUIDv4 et violerait la contrainte Always "UUIDv7" ; l'app maîtrise aujourd'hui tous les chemins d'écriture via l'ORM, donc pas urgent.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Exposer la politique de longueur de mot de passe (`PASSWORD_MIN_LENGTH`/`MAX_LENGTH`) via un endpoint plutôt que de la dupliquer en dur dans `frontend/src/pages/Inscription.tsx`.
  evidence: Si l'env var backend change, le frontend dérive silencieusement sans qu'un redéploiement le corrige forcément. Deferred : risque faible (le seuil change rarement) ; exposer un endpoint dédié est disproportionné pour cet épic — le serveur reste de toute façon la source de vérité.
