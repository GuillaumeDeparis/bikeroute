---
title: 'Accueil de synthèse et interface adaptative'
type: 'feature'
created: '2026-08-23'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '329c0b89099312c28ad15b6d804a6bd23c3ffa99'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Accueil actuel (1.2) est un placeholder minimal ("Connecté en tant que X") : pas d'état "aucun parcours" avec CTA, pas de Skeleton pendant le chargement, et le Account menu n'a que Déconnexion.

**Approche:** Habiller l'Accueil selon le contrat UX déjà approuvé (EXPERIENCE.md) : état "aucun parcours" + CTA vers l'Atelier, Skeleton sobre pendant la résolution de session, Account menu complet (Mes parcours/Exporter mes données/Déconnexion), et vérifier l'adaptabilité ordinateur/mobile. Aucune vraie donnée de parcours n'existe avant l'Epic 2 : le CTA et les deux nouvelles entrées de menu restent volontairement inertes (mêmes précédent que 1.2 pour Déconnexion seule).

## Boundaries & Constraints

**Always:**
- Accueil affiche systématiquement l'état "aucun parcours" (aucune donnée de parcours ne peut exister avant l'Epic 2) avec un CTA vers l'Atelier ; aucun contenu hors V1 (agrégats, recommandations, activité).
- Un Skeleton sobre remplace le rendu vide actuel pendant la résolution de session au chargement de l'app ; ne simule jamais de contenu réel.
- Account menu affiche toujours Mes parcours, Exporter mes données et Déconnexion, dans cet ordre.
- CTA Atelier et entrées Mes parcours/Exporter mes données : présents mais inertes (pas de route réelle), car Epic 2/5 ne sont pas livrés.
- Adaptable ordinateur ↔ mobile sans perte de fonction (NFR-12).

**Ask First:** Aucune divergence de stack anticipée ; si une apparaît, HALT.

**Never:**
- Aucun appel backend pour récupérer des parcours (rien à récupérer avant l'Epic 2).
- Aucune nouvelle route Atelier/Mes parcours réelle : le CTA et les entrées de menu restent des placeholders inertes, pas des liens morts silencieux ni des routes qui simuleraient une fonctionnalité absente.

</frozen-after-approval>

## Code Map

- `frontend/src/components/Skeleton.tsx` (+`.css`, NEW) -- primitif générique `{components.skeleton}` (DESIGN.md), réutilisable plus tard par Mes parcours/carte
- `frontend/src/App.tsx` -- pendant `{nom: 'resolution'}`, affiche le Skeleton de l'Accueil au lieu de `null`
- `frontend/src/pages/Accueil.tsx` (+`.css`) -- état "aucun parcours" + CTA Atelier inerte (bouton désactivé, note "bientôt disponible") ; conserve la logique de session existante inchangée
- `frontend/src/components/AppHeader.tsx` (+`.css`) -- ajoute Mes parcours / Exporter mes données au Account menu, inertes (`disabled`, même note) ; Déconnexion inchangée

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/Skeleton.tsx` -- composant générique réutilisable -- AC Skeleton
- [x] `frontend/src/App.tsx` -- Skeleton pendant la résolution de session -- AC Skeleton
- [x] `frontend/src/pages/Accueil.tsx` -- état "aucun parcours", CTA Atelier inerte, CSS responsive -- AC état vide, AC responsive
- [x] `frontend/src/components/AppHeader.tsx` -- Mes parcours / Exporter mes données inertes -- AC menu complet

**Acceptance Criteria:**
- Given je viens de me connecter sans parcours enregistré, when j'arrive sur l'Accueil, then je vois un état "aucun parcours" avec un CTA vers l'Atelier, sans contenu hors V1.
- Given l'accueil charge (résolution de session au démarrage de l'app), when la page s'affiche, then un Skeleton sobre réserve la structure sans simuler de contenu réel.
- Given je consulte l'Accueil, when je change de taille d'écran (ordinateur ↔ mobile), then l'interface reste utilisable et adaptative sans perte de fonction.
- Given je suis sur l'Accueil, when j'ouvre le Account menu, then j'accède à Mes parcours, Exporter mes données et Déconnexion (les deux premiers inertes tant qu'Epic 2/5 ne sont pas livrés).

## Design Notes

- **Où se produit le "chargement" :** dans l'architecture actuelle, l'Accueil n'a pas de données propres à charger (l'état "aucun parcours" est statique jusqu'à l'Epic 2) ; le seul moment de chargement réel est la résolution de session au démarrage de l'app (`App.tsx`, vue `resolution`), qui affichait `null`. C'est cette lecture de l'AC Skeleton qui est retenue ici.
- **Inerte plutôt qu'absent :** CTA et entrées de menu sans destination réelle restent visibles mais désactivés avec une note courte, plutôt qu'omis (l'AC exige qu'ils soient visibles) ou menant à une route qui n'existe pas.
- **Pas de test I/O :** story purement frontend, aucun nouvel appel backend ; pas de matrice I/O pertinente (section volontairement absente).

## Verification

**Commands:**
- `cd frontend && npx tsc -b && npm run build && npm run lint` -- expected: aucune erreur
- Navigateur (`docker compose up --build`, `https://localhost:5173`) à largeur ordinateur puis mobile (DevTools) -- expected: Skeleton visible brièvement au chargement, état "aucun parcours" avec CTA inerte, Account menu avec les 3 entrées, aucune perte de fonction en largeur réduite

## Suggested Review Order

**Accessibilité des éléments inertes (corrigé en revue, 2 tours)**

- CTA et entrées de menu inertes : `aria-disabled="true"` plutôt que `disabled` natif, pour rester focusables au clavier/lecteur d'écran (1er tour de revue).
  [`Accueil.tsx:91`](../../frontend/src/pages/Accueil.tsx#L91)
  [`AppHeader.tsx:83`](../../frontend/src/components/AppHeader.tsx#L83)

- Contraste : l'opacité globale du bouton se composait avec la couleur du texte et retombait sous le seuil AA (~2.6-2.7:1 au lieu de 4.5:1) — remplacée par des couleurs explicites sans opacité (2e correctif, après le premier tour de revue).
  [`AppHeader.css:62`](../../frontend/src/components/AppHeader.css#L62)
  [`Accueil.css:54`](../../frontend/src/pages/Accueil.css#L54)

**Sémantique de la page**

- `<h1>Accueil</h1>` stable restauré hors de l'état conditionnel ; le titre de l'état vide redescend en `<h2>` (corrigé en revue — évite l'ambiguïté du futur état "avec parcours" d'Epic 2).
  [`Accueil.tsx:83`](../../frontend/src/pages/Accueil.tsx#L83)

**Skeleton**

- Composant générique réutilisable ; repli `min-height` ajouté en revue pour qu'un appelant oubliant `width`/`height` n'obtienne pas un placeholder invisible.
  [`Skeleton.css:3`](../../frontend/src/components/Skeleton.css#L3)

- Câblé dans la résolution de session au lieu du rendu vide précédent.
  [`App.tsx:52`](../../frontend/src/App.tsx#L52)

**Menu compte**

- Séparateur visuel ajouté avant Déconnexion pour la distinguer des deux entrées inertes (corrigé en revue).
  [`AppHeader.css:95`](../../frontend/src/components/AppHeader.css#L95)
