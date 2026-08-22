# Réconciliation — PRD exploratoire d'origine

## Verdict

Le nouveau PRD préserve correctement la preuve produit décidée pendant la relecture : génération intelligente explicable, création manuelle, trois types de parcours, contraintes routières prudentes, comparaison, édition et export GPX. La matière sportive et de coaching a été consciemment reportée plutôt que perdue. Trois éléments transverses de l'ancien PRD méritent toutefois d'être réintroduits ou clarifiés avant finalisation.

## Écarts importants

### 1. Le rôle d'OpenStreetMap comme référentiel principal n'est plus affirmé

Le journal conserve la décision selon laquelle OpenStreetMap est le référentiel géographique principal, tandis que routage, altitude et géocodage passent par des abstractions remplaçables. Le nouveau PRD ne conserve que la remplaçabilité des fournisseurs (`NFR-2`) et l'addendum ne mentionne OSM qu'incidemment dans la politique d'accès vélo.

Cette omission change potentiellement le contrat de données et l'interprétation des attributs routiers. Si cette décision reste valable, elle devrait être conservée dans l'addendum ou dans la future spécification moteur. Si la V1 veut laisser le référentiel entièrement ouvert, l'abandon d'OSM comme source principale devrait être consigné explicitement.

### 2. La portabilité s'est rétrécie des « données utilisateur » aux seuls parcours GPX

L'ancien PRD posait comme principe que les données utilisateur restent exportables. Le nouveau `NFR-7` garantit seulement l'export des parcours en GPX. Dans une V1 désormais multi-utilisateur, les demandes de génération, préférences, métadonnées, bibliothèque et historique des exports constituent aussi des données utilisateur.

Il faut soit restaurer une exigence générale de portabilité des données du compte, soit acter que la V1 ne promet que la portabilité des tracés. Ce point rejoint la question ouverte sur la sauvegarde et la restauration, sans s'y confondre.

### 3. Le principe « données structurées déterministes avant explication générative » n'est pas préservé explicitement

Le journal conserve la décision qu'un moteur déterministe produit les données structurées avant toute explication éventuelle par un agent génératif. Le coaching est correctement hors V1, mais ce garde-fou architectural et produit n'apparaît ni dans le PRD ni clairement dans l'addendum.

Il reste pertinent pour empêcher qu'une future couche conversationnelle invente scores, conformité ou diagnostics. Il devrait au minimum être conservé comme principe d'évolution dans l'addendum.

## Contradictions ou ambiguïtés

### Référence documentaire introuvable

Le PRD référence à plusieurs reprises `docs/spec_route_generator.md`, mais le dossier contient actuellement `spec_route_generator_v1.md` et `spec_route_generator_latest.md`. La dépendance documentaire est donc ambiguë tant que le fichier canonique n'est pas désigné ou renommé.

### Formulation du score global

Le glossaire définit le score comme une « qualité relative [...] indépendamment des autres candidats ». Le corps du PRD exige à juste titre un score absolu non normalisé. Remplacer « qualité relative » par « adéquation absolue à la demande » éviterait une contradiction sémantique.

## Éléments correctement reportés

- La vision recentrée sur la génération intelligente, explicable et éditable est fidèle aux arbitrages de la relecture.
- La cible cycliste route loisir ou avancé, la simplicité progressive, le web responsive et l'absence d'équipement sophistiqué obligatoire sont reflétés par les entrées minimales et le parcours manuel sans contrainte sportive.
- La création manuelle, le recalcul, les inversions, le profil, les montées et les métriques continues sont couverts par `FR-6` à `FR-9` et `FR-40`.
- Les trois types de parcours, les étapes utilisateur, les ancres techniques et l'ordre optimisable sont couverts dans le PRD et détaillés dans l'addendum.
- Le score par type de séance, la récence de la nouveauté, la similarité par segments, le D+ backend unique et le versionnement des calculs sont repris par `FR-25`, `FR-27`, `NFR-8` et `NFR-9`.
- La séparation entre difficulté intrinsèque et personnalisée est préservée : l'intrinsèque reste en V1 et la personnalisation est explicitement reportée.
- Les abstractions de fournisseurs et l'indépendance propriétaire sont reprises dans `NFR-1` et `NFR-2`; l'addendum conserve la distinction entre routage élémentaire et orchestration par le générateur.
- Navigation, enregistrement GPS, imports, météo, trafic, coaching, analyse sportive, applications natives et fonctions sociales sont explicitement reportés, conformément au recentrage validé.
- Les choix techniques détaillés, modèles et algorithmes ont été correctement déplacés vers l'addendum ou la future spécification au lieu d'alourdir le contrat produit.

## Conclusion de réconciliation

Aucune capacité V1 validée pendant la séance n'a été perdue. Les corrections recommandées portent sur deux principes hérités — référentiel OSM et déterminisme des explications —, sur la portée exacte de la portabilité, et sur deux ambiguïtés éditoriales faciles à corriger.
