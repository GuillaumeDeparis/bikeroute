# Revue Edge-Case Hunter

Chemins et conditions encore non définis dans le PRD ou son addendum :

```json
[
  {
    "location": "PRD — FR-1",
    "trigger_condition": "L'identifiant demandé existe déjà ou devient invalide après normalisation",
    "guard_snippet": "Refuser l'inscription avec une erreur non ambiguë sans révéler d'autre donnée du compte.",
    "potential_consequence": "Création incohérente, collision de comptes ou divulgation d'existence"
  },
  {
    "location": "PRD — FR-1 à FR-2",
    "trigger_condition": "Identifiants invalides répétés, session expirée ou session révoquée pendant une action",
    "guard_snippet": "Définir limitation des tentatives, expiration, révocation et retour contrôlé vers la connexion.",
    "potential_consequence": "Attaques facilitées ou perte silencieuse du travail en cours"
  },
  {
    "location": "PRD — FR-6 à FR-10",
    "trigger_condition": "Une adresse est ambiguë, introuvable ou située hors couverture France",
    "guard_snippet": "Exiger une sélection géocodée unique dans la couverture avant tout calcul.",
    "potential_consequence": "Calcul impossible ou parcours lancé depuis un lieu involontaire"
  },
  {
    "location": "PRD — FR-10 à FR-14",
    "trigger_condition": "Une distance, tolérance, pente, détour ou diversité sort de son domaine valide",
    "guard_snippet": "Définir unités, bornes inclusives et validation des valeurs nulles, négatives ou supérieures à 100 %.",
    "potential_consequence": "Demandes impossibles, scores incohérents ou calculs excessifs"
  },
  {
    "location": "PRD — FR-10",
    "trigger_condition": "Un aller simple impose une destination identique au départ",
    "guard_snippet": "Requalifier explicitement en boucle ou demander une destination distincte.",
    "potential_consequence": "Type incohérent et résultat vide ou dégénéré"
  },
  {
    "location": "PRD — FR-13; addendum §3.2",
    "trigger_condition": "Des étapes sont dupliquées, inaccessibles ou confondues avec départ ou arrivée",
    "guard_snippet": "Normaliser les points puis signaler chaque doublon ou étape inaccessible avant génération.",
    "potential_consequence": "Parcours dégénéré, étape omise ou optimisation sans solution"
  },
  {
    "location": "PRD — FR-13; addendum §3.2",
    "trigger_condition": "L'optimisation d'étapes reçoit trop d'étapes ou plusieurs ordres équivalents",
    "guard_snippet": "Fixer une limite d'étapes et une règle déterministe de départage des ordres.",
    "potential_consequence": "Explosion combinatoire ou résultats non reproductibles"
  },
  {
    "location": "PRD — FR-17, FR-27 et FR-30",
    "trigger_condition": "La dimension revêtement rencontre une proportion partiellement ou totalement inconnue",
    "guard_snippet": "Définir le score de surface sur données connues sans récompenser ni pénaliser l'inconnu.",
    "potential_consequence": "Score impossible à reproduire malgré une fiabilité séparée"
  },
  {
    "location": "PRD — FR-18",
    "trigger_condition": "Seuls des candidats avec grands axes existent, mais leur usage varie fortement",
    "guard_snippet": "Définir dernier recours, plafond admissible et règle autorisant ou rejetant ces candidats.",
    "potential_consequence": "Résultats dangereux ou sélection arbitraire de grands axes"
  },
  {
    "location": "PRD — FR-20; NFR-13",
    "trigger_condition": "Un parcours français nécessite brièvement un segment hors de France",
    "guard_snippet": "Définir si franchissements frontaliers et sorties temporaires de couverture sont interdits.",
    "potential_consequence": "Échec imprévisible près des frontières ou données partielles"
  },
  {
    "location": "PRD — FR-21 à FR-24",
    "trigger_condition": "Plusieurs ensembles de quatre candidats satisfont différemment qualité et diversité",
    "guard_snippet": "Définir l'objectif de sélection d'ensemble et son départage déterministe.",
    "potential_consequence": "Propositions instables ou perte injustifiée du meilleur candidat"
  },
  {
    "location": "PRD — FR-22 à FR-23",
    "trigger_condition": "La recherche s'épuise avant 60 secondes sans trouver quatre candidats",
    "guard_snippet": "Autoriser explicitement une fin anticipée et distinguer épuisement, timeout et erreur fournisseur.",
    "potential_consequence": "Attente inutile ou explication de résultat partiel trompeuse"
  },
  {
    "location": "PRD — FR-25 et FR-43",
    "trigger_condition": "Un même parcours est exporté plusieurs fois ou son historique est supprimé",
    "guard_snippet": "Définir déduplication, date de récence retenue et effet d'une suppression d'historique.",
    "potential_consequence": "Nouveauté artificiellement pénalisée ou recalculée de façon inattendue"
  },
  {
    "location": "PRD — FR-25 et FR-51",
    "trigger_condition": "Le compte ne possède encore aucun parcours exporté",
    "guard_snippet": "Définir et calibrer la nouveauté initiale sans historique de comparaison.",
    "potential_consequence": "Dimension absente, poids mal distribué ou score indéterminé"
  },
  {
    "location": "PRD — FR-27",
    "trigger_condition": "Toutes les dimensions deviennent non applicables après redistribution",
    "guard_snippet": "Refuser l'évaluation ou définir un score neutre explicitement non classable.",
    "potential_consequence": "Division par zéro ou score arbitraire"
  },
  {
    "location": "PRD — FR-28 et FR-51",
    "trigger_condition": "Plusieurs écarts correspondent à des niveaux de conformité différents",
    "guard_snippet": "Inclure dans la baseline l'agrégation, les priorités et les frontières inclusives.",
    "potential_consequence": "Même demande classée différemment selon l'ordre d'évaluation"
  },
  {
    "location": "PRD — FR-29 et FR-51",
    "trigger_condition": "Deux candidats obtiennent exactement le même score global",
    "guard_snippet": "Définir une règle stable de départage et l'affichage éventuel des ex aequo.",
    "potential_consequence": "Rangs non déterministes entre deux générations identiques"
  },
  {
    "location": "PRD — FR-33 à FR-36 et FR-53",
    "trigger_condition": "Le navigateur se ferme ou perd la connexion pendant la génération",
    "guard_snippet": "Définir abandon serveur, reprise par identifiant et état visible au retour.",
    "potential_consequence": "Calcul orphelin, ressources gaspillées ou résultat inaccessible"
  },
  {
    "location": "PRD — FR-34 à FR-35; NFR-3",
    "trigger_condition": "Le calcul atteint exactement 15 secondes ou exactement 60 secondes",
    "guard_snippet": "Définir horloge de référence et comparaisons inclusives pour avertissement et arrêt.",
    "potential_consequence": "Comportement divergent entre interface, serveur et tests"
  },
  {
    "location": "PRD — FR-35 et FR-53",
    "trigger_condition": "Le timeout laisse plusieurs candidats validés incompatibles avec la diversité demandée",
    "guard_snippet": "Restituer seulement un sous-ensemble pairwise valide et expliquer les candidats écartés.",
    "potential_consequence": "Violation silencieuse de FR-24 lors du résultat partiel"
  },
  {
    "location": "PRD — FR-39, FR-44 et NFR-4",
    "trigger_condition": "L'utilisateur modifie points ou mode pendant un recalcul encore actif",
    "guard_snippet": "Versionner les requêtes et rejeter toute réponse correspondant à un état obsolète.",
    "potential_consequence": "Carte et métriques décrivent des versions différentes du parcours"
  },
  {
    "location": "PRD — FR-44 à FR-45",
    "trigger_condition": "Une transition conserve des données compatibles mais sémantiquement contradictoires",
    "guard_snippet": "Énumérer par transition les conversions de destination, étapes, passages et contraintes.",
    "potential_consequence": "Réutilisation silencieuse d'une intention devenue incorrecte"
  },
  {
    "location": "PRD — FR-42 et FR-49",
    "trigger_condition": "L'export échoue, est interrompu ou rencontre un nom de fichier existant",
    "guard_snippet": "Confirmer uniquement après succès et proposer reprise, nouveau nom ou remplacement explicite.",
    "potential_consequence": "Fausse confirmation ou écrasement involontaire d'un fichier"
  },
  {
    "location": "PRD — FR-42",
    "trigger_condition": "Des altitudes ou points de passage sont absents ou partiellement inconnus",
    "guard_snippet": "Définir validation GPX, omission autorisée et avertissement avant téléchargement.",
    "potential_consequence": "GPX invalide ou altitudes présentées comme fiables à tort"
  },
  {
    "location": "PRD — FR-50; NFR-15",
    "trigger_condition": "L'export du compte est demandé pendant une génération ou modification active",
    "guard_snippet": "Définir un instantané cohérent et exclure ou marquer les opérations non finalisées.",
    "potential_consequence": "Archive incohérente ou données partiellement sérialisées"
  }
]
```
