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
  evidence: Le backend a une couverture de tests par ligne de la matrice I/O ; la logique équivalente côté client (validation, mapping des erreurs par champ) n'a aucune couverture automatisée, alors qu'elle porte une partie du contrat utilisateur (UX-DR18/24).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-inscription-d-un-nouveau-compte.md`
  summary: Ajouter un README racine documentant `docker compose up`, la migration Alembic hors Docker, et l'acceptation du certificat auto-signé du frontend en local.
  evidence: Rien ne documente ces étapes ; actuellement récupérable en lisant le code/spec, mais deviendra nécessaire dès qu'un deuxième contributeur rejoint le projet.
