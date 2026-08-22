# Epic 1 Context: Comptes, connexion et accueil

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Poser le socle du produit : un visiteur peut créer un compte et se connecter/déconnecter en toute sécurité, chaque compte ne voit et ne modifie que ses propres données, et un utilisateur connecté arrive sur un accueil de synthèse (même sans parcours) utilisable aussi bien sur ordinateur que sur mobile. Cet epic établit aussi la coquille applicative partagée (en-tête, menu compte) et le mécanisme d'autorisation que les epics suivants (atelier manuel, génération assistée, export) réutiliseront tel quel pour protéger leurs propres ressources.

## Stories

- Story 1.1 : Inscription d'un nouveau compte
- Story 1.2 : Connexion et session utilisateur
- Story 1.3 : Isolation des données par compte
- Story 1.4 : Accueil de synthèse et interface adaptative

## Requirements & Constraints

- Un visiteur crée librement un compte avec un identifiant et un mot de passe ; identifiant déjà pris → erreur liée au champ, saisie conservée (hors mot de passe).
- Un utilisateur inscrit peut ouvrir une session sécurisée, la conserver pendant l'usage, et se déconnecter explicitement depuis le menu compte ; une session expirée invite à se reconnecter sans perdre l'état local visible.
- Un échec de connexion (identifiant ou mot de passe incorrect) affiche un message actionnable sans révéler lequel des deux champs est fautif.
- Toute demande, tout parcours, export ou préférence est rattaché au compte connecté et strictement inaccessible aux autres comptes, y compris si l'interface laissait entrevoir autre chose.
- Un accès sans authentification à une ressource métier protégée est refusé et invite à se connecter.
- L'utilisateur connecté voit à l'accueil un état de synthèse (parcours récents, actions principales de création/génération/consultation) même sans aucun parcours enregistré ; pas de contenu hors V1 (agrégats, recommandations, activité).
- L'accueil et la préparation de parcours restent pleinement utilisables en changeant de taille d'écran (ordinateur ↔ mobile), sans perte de fonction.
- Les mots de passe ne sont jamais stockés ni journalisés en clair ; hachage adapté aux mots de passe.
- Toute lecture ou modification de donnée métier vérifie l'identité du compte propriétaire côté serveur.

## Technical Decisions

- Socle imposé pour cet epic : Python 3.14.7, FastAPI 0.141.1, PostgreSQL 18.4 (`[ASSUMPTION]` à valider mais à utiliser comme point de départ) ; Docker Compose minimal pour cet epic (rôles API + PostgreSQL uniquement — les rôles worker/Valhalla/PostGIS et le squelette hexagonal du moteur sont introduits à partir de l'Epic 2).
- L'identité utilisée pour toute opération vient exclusivement du principal authentifié côté serveur, jamais d'une valeur fournie par le client ; c'est ce mécanisme d'autorisation par propriétaire qui doit être posé ici car les epics suivants l'appliqueront tel quel à leurs propres ressources (parcours, générations, exports).
- Erreurs applicatives exposées sous une forme structurée `code`/`message`/`details`/`correlationId` (convention transverse au produit, à respecter dès l'authentification).
- Identifiants externes nouvellement créés en UUIDv7, horodatages en UTC ISO-8601 (convention transverse, applicable aux comptes et sessions).
- Secrets et paramètres opérationnels (ex. clé de session, configuration de hachage) passés par variables d'environnement, jamais en dur.

## UX & Interaction Patterns

- Surfaces Inscription, Connexion, Accueil et Menu utilisateur sont volontairement spine-only : leur contrat textuel suffit, aucune maquette n'est requise.
- App header : marque compacte qui ramène à l'Accueil et ouvre le menu compte ; ne porte jamais de métrique sportive.
- Account menu : contient uniquement Mes parcours, Exporter mes données et Déconnexion, aucun réglage général en V1 ; les deux premières entrées peuvent rester vides tant que les Epics 2 et 5 ne sont pas livrés.
- Input field : label persistant, validation locale au blur et à la soumission, erreur liée au champ sans provoquer de saut de largeur, valeur conservée après erreur.
- Skeleton : réserve la structure attendue de l'Accueil pendant le chargement sans simuler de contenu réel, et disparaît sans déplacer les actions déjà utilisables.
- Voix et ton : messages factuels et actionnables (ex. erreur de connexion qui explique quoi faire sans désigner de coupable entre les deux champs).
- États à couvrir explicitement : Accueil (chargement / aucun parcours / erreur) ; Inscription/Connexion (vide / validation / erreur / session expirée) ; Account menu (session expirée — ferme le menu, conserve l'état local visible, exige une reconnexion avant toute lecture/écriture protégée).

## Cross-Story Dependencies

- Story 1.2 (connexion) suppose qu'un compte existe déjà, créé via Story 1.1.
- Story 1.3 établit le mécanisme d'autorisation par propriétaire (identité serveur, jamais le payload) que les Epics 2 à 5 réutiliseront pour leurs propres ressources (routes, générations, exports) — à concevoir ici de façon générique, pas comme un cas spécial des comptes.
- Story 1.4 : les entrées Mes parcours et Exporter mes données du menu compte peuvent rester vides/placeholder jusqu'à ce que l'Epic 2 (atelier manuel) et l'Epic 5 (export des données) livrent un contenu réel.
