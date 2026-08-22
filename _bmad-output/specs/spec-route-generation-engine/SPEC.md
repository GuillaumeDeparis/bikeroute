---
id: SPEC-route-generation-engine
companions:
  - ../../../docs/spec_route_generator_latest.md
  - ../../../docs/PRD.md
sources: []
---

> **Contrat canonique.** Cette SPEC et les fichiers de `companions:` forment le contrat complet et validé de ce qui doit être construit, testé et vérifié.

# Moteur de génération de parcours vélo

## Why

Les cyclistes sur route doivent pouvoir obtenir rapidement des parcours crédibles, explicables et éditables pour une boucle, un aller A → B ou un trajet multi-étapes, sans qu’un score masque une violation dure ni que des résultats semblables donnent une illusion de choix.

## Capabilities

- **CAP-1**
  - **intent:** Le moteur traite les boucles, les allers simples avec destination imposée ou générée et les parcours multi-étapes à ordre fixe ou optimisable.
  - **success:** Les tests conservent les extrémités, desservent toutes les étapes utilisateur et ne les confondent jamais avec les ancres techniques.
- **CAP-2**
  - **intent:** Le moteur route un parcours manuel ou génère automatiquement des candidats sous contraintes.
  - **success:** Chaque mode retourne une géométrie analysée sans modifier les points utilisateur non autorisés.
- **CAP-3**
  - **intent:** Le moteur valide chaque segment avant scoring selon les contraintes dures et la classification OpenStreetMap versionnée.
  - **success:** Toutes les propositions respectent les contraintes dures et chaque état OSM — interdit, inconnu, autorisé ou dernier recours — produit l’effet normatif défini dans la spécification détaillée.
- **CAP-4**
  - **intent:** Le moteur vise quatre propositions valides respectant par paire le seuil de diversité demandé.
  - **success:** Avec le seuil par défaut, chaque paire possède au moins 40 % de distance non commune mesurée contre le parcours le plus court; le moteur retourne moins de quatre résultats plutôt que relâcher le seuil, dupliquer ou invalider.
- **CAP-5**
  - **intent:** Chaque proposition distingue qualité absolue, adéquation à la demande, position relative et incertitude des données.
  - **success:** Score absolu, conformité, rang, fiabilité, écarts et compromis sont présents, versionnés et testables sans normalisation relative du meilleur candidat à 100.
- **CAP-6**
  - **intent:** La génération expose sa progression et applique des limites temporelles observables et définitives.
  - **success:** Le dépassement de 15 secondes est signalé; à 60 secondes un seul état terminal est atteint, seuls les candidats déjà validés sont rendus et les résultats tardifs sont ignorés.
- **CAP-7**
  - **intent:** Le moteur rend explicites les résultats incomplets et les échecs.
  - **success:** Un à trois candidats valides donnent `PARTIAL` avec raisons; aucun candidat valide donne `FAILED` avec contraintes bloquantes et assouplissements possibles.

## Constraints

- OpenStreetMap est le référentiel géographique canonique de la V1; classification, scoring, conformité, similarité et métriques sont déterministes, versionnés et testables.
- La V1 couvre la France, sans service propriétaire obligatoire; les fournisseurs de routage et d’altitude restent remplaçables.
- Une contrainte dure n’est jamais compensée par le score ni relâchée pour remplir quatre propositions.

## Non-goals

- Navigation ou enregistrement GPS en temps réel.
- Choix automatique d’étapes fonctionnelles ou de points d’intérêt.
- Coaching, recommandation sportive et analyse médicale ou physiologique.
- Garantie de sécurité ou de cyclabilité réelle fondée sur les seules données cartographiques.

## Success signal

Sur le corpus V1 approuvé, 100 % des propositions retournées respectent les contraintes dures, au moins 90 % des demandes réalistes produisent un parcours valide, chaque paire respecte le seuil de diversité configuré, tout dépassement de 15 secondes est visible et aucun calcul ne continue après 60 secondes.

## Open Questions

- Quel matériel et quel protocole normatifs servent à mesurer les objectifs de 15 et 60 secondes ?
- Quelle autorité approuve le corpus de calibrage et ses cas réels ?
