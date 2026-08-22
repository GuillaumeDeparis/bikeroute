# Réconciliation — SPEC moteur

## Couverture

Les trois topologies de CAP-1, les deux modes de CAP-2, l’incertitude OSM de CAP-3, jusqu’à quatre propositions et la diversité de CAP-4, la séparation score/conformité/rang/fiabilité de CAP-5, les règles 15/60 secondes de CAP-6 et les résultats partiels/échecs de CAP-7 sont projetés dans les composants, états et flux.

## Divergences résolues

- Les étapes utilisateur sont explicitement qualifiées; les ancres techniques restent invisibles.
- Le rang #1 donne seulement le focus initial; `Choisir ce parcours` reste obligatoire.
- Un à trois candidats sont exploitables et expliqués; zéro candidat ouvre une résolution souple, jamais un tracé invalide.
- La classification OSM n’est pas exposée comme diagnostic moteur : l’UX montre attributs inconnus, avertissements et contraintes concernées.

## Idées qualitatives écartées

Aucune interface de calibration, table OSM, pondération, diagnostic algorithmique ou protocole de performance n’est ajoutée au produit. Les questions de matériel de mesure et d’autorité du corpus restent du ressort architecture/produit, sans bloquer les spines UX.
