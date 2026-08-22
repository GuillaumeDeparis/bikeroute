# Réconciliation — Parcours utilisateur de création et d’export

## Verdict

Le PRD et l’addendum préservent correctement l’intention centrale du parcours fourni : une expérience web responsive, progressive et explicable permettant de créer ou générer n’importe quel type de parcours, de comparer les propositions, de les modifier puis de les enregistrer et de les exporter. Les décisions prises ensuite sont bien répercutées : quatre propositions cibles, accueil sans suggestion automatique, difficulté personnalisée reportée, multi-étapes limité aux étapes utilisateur et GPX comme seul format V1.

La réconciliation révèle néanmoins plusieurs comportements UX importants qui ne sont pas encore formulés comme exigences vérifiables.

## Éléments correctement conservés

- Le terme générique « parcours » et les trois types `BOUCLE`, `ALLER_SIMPLE` et `MULTI_ETAPES` sont présents ; aucune boucle n’est supposée par défaut.
- La création manuelle et la génération automatique restent deux voies d’entrée, avec paramètres minimaux et options avancées progressives.
- Les distinctions entre étape utilisateur, point de passage et ancre technique sont conservées.
- L’inversion d’une boucle est distinguée de l’échange départ-arrivée d’un aller simple.
- Les métriques, le profil altimétrique, les montées, les revêtements et catégories routières sont couverts.
- La comparaison, l’explicabilité, le tracé provisoire, les résultats partiels et l’arrêt à 60 secondes sont couverts.
- Après édition, le score et la conformité sont recalculés contre la demande initiale.
- L’enregistrement, la bibliothèque et l’export GPX sont inclus.

## Décisions ultérieures correctement prioritaires

Les divergences suivantes ne constituent pas des pertes : elles reflètent des arbitrages explicites postérieurs au parcours initial.

- La cible est de quatre propositions, et non « jusqu’à trois ».
- L’accueil reste une synthèse et un point d’entrée, sans « prochaine sortie suggérée » en V1.
- L’indicateur personnalisé « Pour moi » est hors V1 ; seule la difficulté intrinsèque subsiste.
- La nouveauté est calculée contre les parcours exportés avec une pondération de récence, et non contre les sorties réellement effectuées.
- Le multi-étapes automatique utilise uniquement des étapes fournies par l’utilisateur ; le choix automatique de POI est reporté.
- L’export V1 est limité au GPX.

## Gaps à traiter

### 1. Continuité entre création manuelle et génération automatique — importance haute

Le parcours source exige que l’utilisateur puisse changer de mode sans perdre son travail en cours. Le PRD couvre les deux modes, mais ne garantit ni la conservation des points et contraintes compatibles, ni une confirmation lorsque la conversion implique une perte.

**Risque :** une UX conforme aux FR pourrait néanmoins effacer un départ, une destination, des étapes ou une géométrie lors du changement de mode.

**Ajout recommandé :** exiger la conservation des données compatibles lors du passage manuel ↔ automatique et une confirmation explicite avant toute suppression ou transformation irréversible.

### 2. Transitions entre types de parcours — importance haute

`FR-7` définit les types, mais les comportements de conversion décrits dans le parcours ne sont pas contractualisés : passer d’un aller simple à une boucle ajoute le départ comme arrivée ; passer d’une boucle à un aller simple exige une destination utilisable ; un multi-étapes peut revenir au départ ou finir ailleurs.

**Risque :** ambiguïtés UX et métier lors d’un changement de type, avec perte possible d’étapes ou création involontaire d’une boucle.

**Ajout recommandé :** spécifier les règles de transition entre types, la préservation des étapes et les cas nécessitant une nouvelle destination ou une confirmation.

### 3. Retour immédiat et résumé persistant pendant l’édition — importance moyenne

Le parcours source demande un premier calcul dès que départ et destination sont disponibles et un résumé toujours visible pendant la création. `FR-8` impose le recalcul après modification et `FR-40` impose les métriques, mais ni le déclenchement initial automatique ni la persistance du résumé ne sont explicites.

**Risque :** une implémentation pourrait exiger une action supplémentaire « Calculer » et reléguer les métriques dans une vue secondaire, affaiblissant la sensation de manipulation directe.

**Ajout recommandé :** demander un calcul initial automatique dès que les entrées minimales sont réunies et maintenir un résumé distance/D+/durée/difficulté accessible pendant l’édition sur desktop et mobile.

### 4. Options contextuelles selon le type de parcours — importance moyenne

Le PRD dit que l’interface révèle progressivement les options, mais ne formalise pas que seules les options applicables au type choisi doivent être proposées. Le parcours source distingue notamment direction cardinale pour une boucle ou un aller sans destination, et corridor/détour pour un A → B connu.

**Risque :** exposition de paramètres incohérents, comme une direction cardinale sur un A → B imposé, et confusion sur leur effet réel.

**Ajout recommandé :** exiger une présentation contextuelle des paramètres et masquer ou désactiver, avec explication si nécessaire, ceux qui ne s’appliquent pas au type et au scénario choisis.

### 5. Contrat d’export et confirmation — importance basse

`FR-42` garantit le contenu GPX principal, mais le parcours source prévoit aussi un nom de fichier contrôlable et une confirmation de réussite. Ces détails contribuent à la portabilité promise dans la vision.

**Risque :** téléchargements opaques, noms non exploitables ou absence de retour clair en cas de succès/échec.

**Ajout recommandé :** préciser qu’un nom de fichier pertinent est proposé et modifiable, et que l’interface confirme la réussite ou explique l’échec de l’export.

## Éléments pouvant rester au niveau UX

Les wireframes précis, le choix entre tiroir et bottom sheet sur mobile, la forme exacte du sélecteur cardinal, les libellés des boutons, le dessin du profil altimétrique et la mise en page du tableau comparatif ne nécessitent pas d’être figés dans le PRD. Ils doivent être repris dans la future spécification UX en respectant les exigences fonctionnelles et les avertissements critiques.

## Conclusion

Le parcours source est largement couvert. Les deux ajouts les plus importants concernent la continuité du travail lors d’un changement de mode et les règles de conversion entre types de parcours. Les trois autres gaps renforcent la manipulation directe, la clarté contextuelle et la qualité de l’export sans élargir le périmètre produit.
