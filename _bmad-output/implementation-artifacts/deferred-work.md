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

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-consulter-les-métriques-le-profil-altimétrique-et-un-résumé.md`
  summary: Lisser le profil d'élévation avant de cumuler D+/D- (`calculer_metriques`), au lieu de sommer chaque delta brut entre points consécutifs de la géométrie routée.
  evidence: Relevé en revue (blind hunter) : les échantillons SRTM/skadi bruts sont bruités à la résolution d'une polyligne dense ; sommer chaque micro-fluctuation surestime systématiquement D+/D- par rapport à un profil lissé. Pas de seuil/méthode de lissage tranché dans la spec (aucune décision "Ask First" ne le couvrait) ; nécessite un choix délibéré (seuil de delta minimal, fenêtre de lissage) plutôt qu'un correctif isolé.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-consulter-les-métriques-le-profil-altimétrique-et-un-résumé.md`
  summary: Dimensionner l'appel Valhalla `/height` (timeout dédié, chunking/décimation de la géométrie) pour les parcours longs ou à nombreux points, plutôt que de réutiliser tel quel le timeout du `RoutingProvider`.
  evidence: Relevé en revue (blind hunter) : chaque calcul de parcours routé déclenche désormais deux appels Valhalla séquentiels (routage puis élévation sur la géométrie décodée complète, potentiellement dense pour une boucle/multi-étapes longue), sans stratégie de repli si `/height` devient plus lent que `/route` sur un tracé volumineux.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: Étendre à `/trace_attributes` le même travail de dimensionnement déjà différé pour `/height` (timeout dédié, chunking de la géométrie décodée).
  evidence: Relevé en revue (blind hunter) : chaque calcul routé déclenche désormais trois appels Valhalla séquentiels (`/route`, `/height`, `/trace_attributes`), ce dernier envoyant lui aussi la géométrie décodée complète sans chunking ni discussion de taille de payload pour un tracé long/multi-étapes.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: Garantir que `revetements`/`categories_routieres` somment à 1.0 (ou documenter/tester explicitement les écarts), et couvrir le cas d'une correspondance `/trace_attributes` partielle (edges ne couvrant pas toute la distance routée).
  evidence: Relevé en revue (blind hunter + edge-case hunter) : les proportions sont calculées en divisant la longueur de chaque segment `/trace_attributes` (map-matching) par `distance_m` (haversine sur la géométrie `/route`) -- deux calculs Valhalla distincts, jamais réconciliés. Aucun test n'affirme que la somme vaut 1.0, ni ne couvre une correspondance partielle qui sous-estimerait silencieusement les proportions.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: Partager un seul sérialiseur pour la forme des métriques au lieu de la redéclarer/mapper à la main à 4 endroits (JSONB du repository, réponse du router, schémas Pydantic, mapping snake→camel de `client.ts`).
  evidence: Relevé en revue (blind hunter) : chaque nouveau champ de métrique exige 4 modifications synchronisées ; déjà source d'un risque d'inversion de champs (cf. patches appliqués sur ce même diff), qui grandira à mesure que d'autres métriques s'ajoutent.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: Prévoir un chemin de lecture rétro-compatible pour `METRICS_VERSION` avant d'exposer un futur endpoint de lecture/liste de parcours (routes persistées en v1, sans `revetements`/`categories_routieres`/`profil`/`montees_significatives`).
  evidence: Relevé en revue (blind hunter) : sans conséquence tant qu'aucun endpoint ne relit `routes.metrics` (seul `POST /api/routes/calculate` existe aujourd'hui), mais deviendra bloquant dès qu'un tel endpoint (ex. "Mes parcours", Story 2.6) sera construit sans y avoir pensé au préalable.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: La détection de montées significatives casse un segment continu sur tout delta d'élévation non strictement positif -- sensible au même bruit SRTM/skadi déjà signalé pour D+/D- (une micro-baisse peut scinder une vraie montée en deux segments individuellement sous le seuil).
  evidence: Relevé en revue (blind hunter) : interaction directe avec l'entrée déjà différée sur le lissage du profil d'élévation (spec-2-5 socle) -- cette entrée touche désormais aussi la détection de montées, pas seulement D+/D-, et un futur lissage devra couvrir les deux.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-revêtements-catégories-montées-profil-altimétrique.md`
  summary: Les pourcentages de revêtements/catégories routières affichés côté frontend sont arrondis indépendamment (`formatPourcentage`) et peuvent visiblement ne pas sommer à 100 %.
  evidence: Relevé en revue (blind hunter) : ex. trois entrées à 33,3 % affichées "33 % / 33 % / 33 %". Cosmétique (pas de donnée fausse, juste un arrondi non ajusté), mais perceptible par l'utilisateur ; une répartition du reste (plus grand reste) réglerait proprement le cas, hors scope d'un correctif isolé.

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

## Deferred from: code review of story 2.1 (2026-08-23)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-calcul-initial-d-un-parcours-a-b-en-création-manuelle.md`
  summary: Définir une stratégie de cycle de vie pour la table `routes` (lignes brouillon/éphémères vs. enregistrement explicite, purge).
  evidence: Chaque calcul auto (y compris un simple recalcul) insère une nouvelle ligne permanente ; sans dédup/nettoyage, la Story 2.3 (recalcul à chaque édition) produira une croissance non bornée bien avant qu'un utilisateur n'enregistre explicitement (Story 2.6). Nécessite une décision délibérée à trancher avec 2.3/2.6, pas un correctif isolé maintenant.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-calcul-initial-d-un-parcours-a-b-en-création-manuelle.md`
  summary: Décider d'une stratégie de service des tuiles de fond de carte (auto-hébergement/CDN) plutôt que d'appeler directement `tile.openstreetmap.org` depuis le navigateur.
  evidence: La politique d'usage des tuiles OSM déconseille cet appel direct au-delà d'un usage dev léger ; Nominatim (service OSM comparable) a déjà reçu un traitement dédié dans cette story (`nominatim_user_agent`, note "Ask First" sur les extraits réels) que les tuiles n'ont pas reçu. À trancher avant tout trafic réel/production.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-calcul-initial-d-un-parcours-a-b-en-création-manuelle.md`
  summary: Donner un retour visuel explicite quand un clic carte est ignoré (3e point posé alors que départ+destination existent déjà).
  evidence: Comportement correct pour cette story (l'édition du tracé est hors scope, Story 2.3), mais un clic silencieusement sans effet peut se lire comme un bug lors d'un test manuel. À traiter avec l'UI d'édition complète de la Story 2.3 plutôt qu'en isolation maintenant.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-éditer-un-parcours-sur-la-carte.md`
  summary: Infléchir le tracé en glissant une portion (pas un point existant) : insérer/déplacer un point via un marqueur discret au milieu de chaque segment de `points` (y compris le segment de fermeture Départ↔dernier point en Boucle).
  evidence: 4e AC de la Story 2.3 (epics.md), mécanique la plus neuve du lot (nouveau pattern de marqueurs milieu-de-segment, cas particulier Boucle) ; carvée hors de cette spec pour rester dans le budget de taille recommandé (900-1600 tokens) -- les 3 autres AC (ajouter/déplacer/supprimer-réordonner un point) livrent déjà une capacité d'édition complète sans elle.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-éditer-un-parcours-sur-la-carte.md`
  summary: Le rattachement "non routé" (`nonRoute`) associe un point à sa réponse via une clé `${lat}:${lon}` plutôt que via son `id` stable -- deux points partageant exactement les mêmes coordonnées deviennent indiscernables pour cet état.
  evidence: Convention héritée de la Story 2.1 (avant l'existence d'un `id` par point), donc pas causée par cette story ; mais le déplacement de point par glisser-déposer (2.3) rend une collision de coordonnées nettement plus atteignable qu'avant (déposer un marqueur exactement sur un autre). Probabilité réelle faible (précision flottante d'un glisser souris), mais signalée indépendamment par deux couches de revue.
## Deferred from: code review of spec-2-2-choisir-et-représenter-le-type-de-parcours.md (2026-08-25)

- Remplacer l’appariement frontend des points non routés par coordonnée par un contrat positionnel non ambigu (indices ou identifiants). Le problème existait déjà en Story 2.1 avec des coordonnées coïncidentes ; les nouvelles topologies ne fournissent toujours pas l’identité du point dans la réponse backend.
## Deferred from: code review of spec-2-5-consulter-les-métriques-le-profil-altimétrique-et-un-résumé (2026-08-25)

- Durcir la validation de la structure historique de la réponse Valhalla `/route` : types de `body`/`trip`/`legs`, nombre de legs attendu, géométries vides ou discontinues, afin de traduire toute réponse malformée en `RoutingProviderError` plutôt qu'en erreur 500 brute.

## Deferred from: code review of spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md (2026-08-26)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Aucun moyen de retirer un parcours de la bibliothèque (pas d'endpoint "unsave"/suppression, pas d'action UI correspondante).
  evidence: Aucune AC ne l'exige, mais un utilisateur qui enregistre par erreur ou veut nettoyer sa bibliothèque n'a aucun recours -- signalé par la revue blind-hunter comme une lacune fonctionnelle probable à court terme.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: `GET /api/routes` n'a ni pagination, ni filtre/recherche par nom ou étiquette, malgré des étiquettes désormais persistées.
  evidence: Non requis par les AC (bibliothèque personnelle, échelle V1 réduite), mais deviendra nécessaire dès qu'un compte accumule des dizaines de parcours enregistrés.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Pas d'index dédié pour la requête `WHERE account_id = ? AND nom IS NOT NULL ORDER BY created_at DESC` de « Mes parcours » ; pas de contrainte `CHECK` DB interdisant un `nom` vide/blanc (seul le `PATCH` applicatif le garantit aujourd'hui).
  evidence: `account_id` est déjà indexé, donc acceptable à l'échelle V1 ; mais la convention du projet (migration 0004) encode habituellement ce type d'invariant au niveau DB en défense en profondeur, pas seulement côté application.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: « Mes parcours » trie par `created_at` (date de calcul du tracé), pas par date d'enregistrement -- aucune colonne `enregistre_at`/`updated_at` n'existe, et la date n'est de toute façon jamais affichée dans la liste.
  evidence: Un parcours calculé il y a longtemps puis nommé aujourd'hui apparaîtra "ancien" dans le tri plutôt qu'en tête comme "tout juste enregistré" -- surprenant pour l'utilisateur, mais aucune AC ne spécifie de sémantique de tri et le cas (calcul puis enregistrement immédiat) reste dominant en usage normal.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Pas de déduplication/normalisation des étiquettes saisies (ex. "gravel, Gravel, gravel" persiste tel quel, avec doublon et casse incohérente) ; pas de contrôle d'unicité sur le nom d'un parcours.
  evidence: Aucune AC ne l'exige ; qualité de donnée cosmétique pour une bibliothèque personnelle, mais deux revues indépendantes (blind-hunter) l'ont relevé.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Le câblage de réouverture bout-en-bout (`App.tsx` : transition vers la vue `atelier` avec `parcoursAOuvrir`, et le `key={vue.parcoursAOuvrir?.id ?? 'nouveau'}` forçant le remontage) n'est exercé par aucun test passant par les vraies transitions d'état d'`App` -- seuls des rendus directs de `<Atelier parcoursAOuvrir=.../>` et un `onOuvrirParcours` mocké sont testés.
  evidence: Revue verification-gap : retirer ou casser le `key` compile et ne fait échouer aucun test aujourd'hui. Risque réel actuellement faible (le graphe d'appel actuel ne permet pas de rouvrir deux parcours différents sans redémonter `Atelier` via le changement de vue `mes-parcours`), mais mérite un test d'intégration `App.test.tsx` dédié pour se prémunir d'une régression future.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Un `nom` envoyé explicitement à `null`, ou dépassant `max_length` (nom/note/étiquettes), renvoie le code générique `CHAMP_REQUIS` (handler Pydantic global) plutôt que `PARAMETRES_INVALIDES` -- seuls les cas "vide"/"absent" de la matrice I/O (couverts par la vérification manuelle dans le routeur) renvoient le code documenté.
  evidence: Hors du périmètre exact de la matrice I/O gelée (qui ne couvre que "vide/absent"), et improbable en usage normal (le frontend n'envoie jamais `null` ni ne dépasse les bornes `maxLength` HTML) -- mais un appelant API direct verrait une incohérence de code d'erreur entre les différentes façons de fournir un `nom` invalide.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-enregistrer-un-parcours-dans-sa-bibliothèque.md`
  summary: Le Save form de l'Atelier ne réinitialise pas le message d'erreur d'enregistrement à chaque frappe (seulement au prochain "Enregistrer"), et ne réinitialise ni l'erreur ni la confirmation à la fermeture (×) du formulaire -- rouvrir plus tard peut réafficher un statut obsolète d'une tentative précédente.
  evidence: Cosmétique (le message reste factuellement vrai sur la dernière tentative), distinct du cas patché (confirmation obsolète après une édition qui invalide `parcoursId`, corrigé dans cette story) -- signalé par la revue edge-case-hunter.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-exporter-un-parcours-en-gpx.md`
  summary: Reconsidérer `ondelete="CASCADE"` sur `route_exports.route_id`/`account_id` une fois une fonctionnalité de suppression de parcours/compte et la nouveauté historique (Epic 3, FR-25) existantes.
  evidence: La table `route_exports` existe pour alimenter la pénalité de nouveauté d'une future génération assistée ; une cascade de suppression efface cet historique en même temps que le parcours/compte source, ce qui contredit son rôle d'historique si une suppression de parcours est un jour ajoutée. Aucune fonctionnalité de suppression n'existe encore (ni pour un parcours, ni pour un compte) : rien à corriger maintenant, à réexaminer avec Epic 3/Story 3.6 ou toute future story de suppression.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-exporter-un-parcours-en-gpx.md`
  summary: Ajouter un index sur `route_exports.route_id`.
  evidence: Seuls `account_id` et `exported_at` sont indexés ; une requête "combien de fois ce parcours a-t-il été exporté" (utile à la nouveauté historique, Epic 3) filtrerait sur `route_id`, non indexé par défaut par PostgreSQL sur une clé étrangère. Volume de données actuel trop faible pour que ce soit bloquant.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-exporter-un-parcours-en-gpx.md`
  summary: Inclure l'altitude (`<ele>`) sur les `<wpt>` du GPX exporté, pas seulement sur les `<trkpt>` du tracé.
  evidence: Le profil altimétrique n'est actuellement disponible qu'aux points de la géométrie routée, pas aux points d'entrée bruts (départ/passages/arrivée) ; certains lecteurs GPX affichent l'altitude des waypoints. Amélioration de complétude, non requise par les Boundaries de la spec ("trkpt avec élévation" ; aucune exigence équivalente sur les wpt).
