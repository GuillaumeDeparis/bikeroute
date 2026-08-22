---
name: bikeroute
status: final
updated: 2026-08-20
sources:
  - ../../../../docs/PRD.md
  - ../../../specs/spec-route-generation-engine/SPEC.md
  - ../../../../docs/spec_route_generator_latest.md
---

# bikeroute — Experience Spine

## Foundation

PWA responsive installable, connectée pour la carte, le routage, les recalculs et l’enregistrement. La préparation est optimisée pour ordinateur et tablette; les flux principaux restent utilisables sur téléphone. La V1 est en français, avec chaînes externalisées et formats localisables. Thème clair uniquement.

`DESIGN.md` est la référence visuelle; ce document gouverne comportement, architecture d’information et états. En cas de conflit, DESIGN.md et EXPERIENCE.md prévalent sur les maquettes et les wireframes.

## Inspiration & Anti-patterns

- **Komoot :** lisibilité cartographique et préparation rassurante, sans reprendre toute son identité.
- **Linear / Raycast :** hiérarchie, densité maîtrisée, panneaux et sélections propres.
- **Mapy / Organic Maps / OsmAnd :** carte centrale, terrain peu masqué.
- **Rapha :** retenue; **Van Rysel / Decathlon :** fonctionnalité accessible et non élitiste.
- **Rejeté :** compétition/feed Strava, néons et gamification Zwift, densité Garmin, fitness générique flashy, outdoor vert/brun stéréotypé, cockpit GPS automobile.
- **Direction retenue :** Sport accessible; Outdoor premium et Technical minimal sont des explorations écartées.

## Information Architecture

### Surfaces produit

| Surface | Reached from | Purpose |
|---|---|---|
| Inscription | Visiteur | Créer un compte avec identifiant et mot de passe. |
| Connexion | Visiteur / session expirée | Ouvrir une session. |
| Accueil | Connexion / marque | Synthèse sobre, accès à l’atelier et parcours récents; aucune activité agrégée, sortie ou recommandation. |
| Mes parcours | Accueil / menu utilisateur | Consulter, ouvrir et reprendre les parcours enregistrés. |
| Atelier cartographique | Accueil / parcours existant | Surface unique pour Manuel, Assisté, édition, analyse, enregistrement et export. |
| Résultats assistés | Génération terminée | Explorer jusqu’à quatre propositions sans réduire la carte. |
| Comparaison | Résultats → Comparer | Modale optionnelle; mêmes indicateurs pour toutes les propositions. |
| Export GPX | Atelier → Exporter | Confirmer le fichier exporté et permettre retour ou nouvelle préparation. |
| Exporter mes données | Menu utilisateur | Demander et récupérer les données du compte en formats documentés. |
| Menu utilisateur | En-tête | Mes parcours, Exporter mes données, Déconnexion; aucun réglage général V1. |

### Régions de l’atelier

| Région | Reached from | Purpose |
|---|---|---|
| Carte | Atelier | Fond permanent pour placer, explorer et modifier le parcours. |
| Panneau principal | Atelier | Mode, topologie, points, métriques et actions essentielles. |
| Inspecteur secondaire | Panneau principal | Options, profil, montées, revêtement, fiabilité et contraintes; un seul ouvert. |
| Bulle basse extensible | Panneau replié / bas de carte | Métriques essentielles en compact; détails et profil altimétrique en déployé. |

Sur grand écran, `{components.primary-panel}` flotte à gauche et `{components.secondary-inspector}` s’ouvre à côté. Sur tablette, l’inspecteur remplace le panneau avec retour. Sur téléphone, la carte reste plein écran avec `{components.bottom-sheet}`; les cartes de proposition défilent horizontalement.

Les surfaces Inscription, Connexion, Accueil, Mes parcours, Export GPX, Exporter mes données et Menu utilisateur sont volontairement **spine-only** : leurs contrats suffisent pour la V1 et aucune maquette supplémentaire n’est requise.

[Le wireframe de l’atelier](wireframes/flow-atelier-cartographique-2026-08-19.excalidraw) illustre la structure Manuel/Assisté, les rôles des points, les panneaux et leur adaptation responsive. [Le wireframe des résultats assistés](wireframes/flow-assiste-resultats-2026-08-19.excalidraw) illustre génération, focus sans acceptation, détail, comparaison et convergence vers l’éditeur commun. [L’écran clé Manuel](mockups/key-atelier-manuel.html) fixe la composition sur ordinateur de l’atelier, du panneau principal et de la bulle basse.

## Voice and Tone

Factuel, souple et encourageant. Expliquer ce qui est disponible, ce qui manque et quelle action peut aider, sans jargon moteur ni culpabilisation.

| Do | Don't |
|---|---|
| « 3 propositions disponibles. Vous pouvez déjà les explorer ou assouplir la distance. » | « Génération incomplète : erreur de diversification. » |
| « La recherche prend plus de temps que prévu. » | « Timeout imminent. » |
| « 6 % du revêtement n’est pas renseigné. » | « Route adaptée. » |
| « Aucun parcours ne respecte tous ces critères. Essayez d’augmenter la tolérance de distance. » | « Aucun résultat. » |
| « Mise à jour… » en gardant le dernier tracé. | Effacer le tracé pendant le recalcul. |
| « Premier candidat valide trouvé » seulement si une explication de rang est nécessaire. | « Meilleur parcours » ou « parcours sûr ». |

## Component Patterns

Les noms correspondent à `DESIGN.md.Components`.

### Global

| Component | Use | Behavioral rules |
|---|---|---|
| App header | Global | Marque vers Accueil; ouvre Account menu. Ne porte ni coaching ni métriques d’activité. |
| Primary button | Générer, Choisir, Enregistrer, Exporter | Déclenche l’action dominante; désactivé tant que les entrées indispensables manquent. |
| Secondary button | Annuler, Comparer, Voir les détails | Ne change pas implicitement le parcours choisi. |
| Status banner | Global | Accuse réception des opérations longues et présente progression, résultat partiel, inconnues, erreurs et assouplissements avec un texte actionnable. |
| Skeleton | Accueil, Mes parcours, carte | Réserve la structure pendant le chargement; disparaît sans déplacer les actions déjà utilisables. |

### Atelier

| Component | Use | Behavioral rules |
|---|---|---|
| Mode switch | Atelier | Manuel par défaut. Le changement conserve les données compatibles et demande confirmation avant suppression/conversion. |
| Primary panel | Atelier | Toujours le contexte de construction. Repliable; sa fermeture révèle Expandable metric bubble. |
| Secondary inspector | Atelier sur grand écran | Un seul à la fois; Options, Profil, Analyse et Montées réutilisent la zone. Un réglage recalcule sans masquer le panneau principal. |
| Bottom sheet | Atelier sur téléphone | Compacte, intermédiaire ou développée; Options remplace son contenu et fournit Retour au parcours. |
| Expandable metric bubble | Bas de la carte | État compact : distance, D+, durée, avertissement éventuel et petit triangle/chevron. Un clic ou toucher déploie la même bulle avec le détail des métriques et le profil altimétrique; un second clic ou toucher, ou l’action Fermer, la replie. Les valeurs gardent leur place pendant le recalcul. Le profil est une courbe continue du relief réel selon la distance, jamais une suite de paliers. |
| Contextual menu | Point sélectionné | Premier clic sans départ : crée le départ et ouvre le choix Boucle/Aller simple/Multi-étapes. Les clics suivants créent un Point de passage sans menu; sélectionner un point ouvre son menu. En Multi-étapes : Point de passage/Étape utilisateur/Destination; en Aller simple : Destination disponible. |
| Route point | Carte | Ajouter, sélectionner, déplacer, supprimer et réordonner selon rôle. Toute nouvelle entrée après le départ naît Point de passage. Les ancres techniques restent invisibles. |
| Compass control | Carte | Indique et rétablit l’orientation; ne masque pas le tracé. |
| Place search | Atelier | Recherche le départ, la destination ou un point par texte/adresse; la sélection place le point et synchronise la carte avec Reorderable point list. Le chargement, l’absence de résultat et l’erreur sont distingués. |
| Input field | Formulaires | Label persistant; validation locale au blur et à la soumission; erreur liée au champ, valeur conservée. |
| Select control | Topologie, séance, revêtement | N’affiche que les valeurs applicables; changer une valeur incompatible déclenche une confirmation de conservation/conversion. |
| Checkbox / toggle | Options et ordre | Active une préférence sans l’appliquer rétroactivement en silence; annonce libellé et état. |
| Reorderable point list | Panneau principal / liste complète | Alternative complète à la carte : ajouter par Place search, modifier, supprimer, qualifier et réordonner; synchronisation bidirectionnelle avec Route point. |
| Save form | Enregistrement | Demande nom, note facultative et étiquettes; conserve les trois champs en cas d’échec et confirme le parcours enregistré. |

### Assisté / Résultats

| Component | Use | Behavioral rules |
|---|---|---|
| Proposal card | Résultats | Jusqu’à quatre. #1 reçoit le focus initial, jamais l’acceptation. Survol ou clic met le tracé au premier plan; Voir les détails développe; seul Choisir ce parcours engage. |
| Comparison modal | Résultats | Modale centrée; sa fermeture restaure le focus et la carte. Aucun candidat n’est choisi par son ouverture. |
| Comparison table | Comparison modal | Même ordre de dimensions pour chaque proposition; en-têtes associés; sur téléphone, comparaison par blocs ou colonnes défilantes sans écraser le texte ni perdre les avertissements. |

### Compte / Données

| Component | Use | Behavioral rules |
|---|---|---|
| Account menu | Global | Mes parcours, Exporter mes données, Déconnexion uniquement. |

[L’écran clé des résultats assistés](mockups/key-assiste-resultats.html) illustre les Proposal cards et les tracés simultanés sans choix implicite. [L’écran clé de comparaison](mockups/key-comparaison.html) illustre Comparison modal et Comparison table au-dessus de la carte.

## State Patterns

### Global

| Surface | State | Treatment |
|---|---|---|
| Accueil | chargement, aucun parcours, erreur | Skeleton sobre; CTA vers Atelier; parcours récents sinon. Aucun contenu hors V1. |
| Réseau | hors ligne | Status banner : connexion requise; dernier état visible; routage, recalcul et enregistrement indisponibles. Aucun mode hors ligne promis. |

### Atelier

| Surface | State | Treatment |
|---|---|---|
| Carte | chargement | Skeleton sur la zone cartographique; panneaux disponibles quand leurs données le permettent; statut « Chargement de la carte… ». |
| Carte | erreur de tuiles/données | Status banner propose Réessayer; saisies et liste de points conservées; aucun fond vide présenté comme carte fiable. |
| Place search | chargement, saisie vide, aucun résultat, erreur | Progression dans la liste; invitation neutre si vide; « Aucun lieu trouvé » sans créer de point; Réessayer conserve la requête. |
| Atelier | aucun départ | Manuel actif; topologie non choisie; invitation à rechercher ou cliquer la carte. |
| Atelier | départ posé | Contextual menu ancré demande la topologie. |
| Atelier | édition | Dernier tracé visible; points et métriques stables. Undo restaure la dernière géométrie. |
| Atelier | point impossible à rattacher au réseau | Le point reste identifié comme non routé; Status banner propose le déplacer, modifier sa recherche ou le supprimer; aucun segment direct trompeur. |
| Atelier | recalcul | Dernier parcours conservé; valeurs touchées deviennent « recalcul… » puis montrent les nouvelles valeurs; actions incompatibles temporairement indisponibles. |
| Expandable metric bubble | recalcul, profil indisponible | Pendant le recalcul, les métriques et la courbe précédentes restent visibles avec « Mise à jour… ». Si le profil est indisponible, son emplacement l’explique sans afficher de courbe fictive. |
| Atelier | segment hors politique après édition | Avertissement nomme la contrainte; édition, enregistrement et export restent possibles sous responsabilité utilisateur. |
| Changement de topologie | données incompatibles | Présente ce qui sera conservé, converti ou supprimé; aucune perte sans confirmation; annuler restaure l’état précédent. |

### Assisté / Résultats

| Surface | State | Treatment |
|---|---|---|
| Formulaire Assisté | requis manquant, valeur invalide, combinaison incohérente | Validation locale près du champ et résumé au lancement; focus retourne au premier champ concerné; Générer reste indisponible tant que le minimum topologique manque. |
| Génération | 0–15 s | Animation et étapes générales; Annuler disponible. Tout tracé provisoire est explicitement marqué comme tel. |
| Génération | 15–60 s | « La recherche prend plus de temps que prévu »; calcul continue; Annuler reste disponible. |
| Génération | annulation | État terminal; aucun résultat tardif affiché. Retour au formulaire conservé. |
| Génération | 60 s | État terminal; uniquement candidats déjà validés, sinon échec; tout résultat tardif ignoré. |
| Résultats | quatre | Quatre cartes et tracés; #1 focalisé, rien choisi. |
| Résultats | un à trois | Résultat partiel avec raison; exploitable immédiatement; action d’assouplissement proposée. |
| Résultats | zéro | Aucun tracé validé; contraintes bloquantes et assouplissements; retour au formulaire. |
| Résultats | donnée inconnue / N/A | Proportion inconnue explicite; N/A pour dimension non applicable; aucune présentation favorable implicite. |
| Comparison modal | fermeture, données devenues obsolètes | Fermer restaure le focus sur Comparer et la proposition explorée; si un recalcul invalide le tableau, la modale signale la mise à jour et se rafraîchit avant tout choix. |

### Compte / Données

| Surface | State | Treatment |
|---|---|---|
| Inscription / Connexion | vide, validation, erreur, session expirée | Validation près du champ; message actionnable; saisie conservée hors mot de passe si approprié. |
| Mes parcours | chargement, vide, erreur | Liste ou « Aucun parcours enregistré » + Créer un parcours; reprise après erreur. |
| Account menu | session expirée | Ferme le menu, conserve le parcours local affiché et demande une reconnexion avant toute lecture ou écriture protégée. |
| Enregistrement | en cours, succès, échec | Save form et indicateur sans déplacer les actions; nom, note et étiquettes conservés à l’échec; Réessayer ou revenir à l’éditeur. Connexion requise. |
| Export GPX | en cours, succès, échec | Succès nomme le fichier et propose Retour/Nouveau; échec conserve le parcours et propose Réessayer. Aucun export partiel présenté comme réussi. |
| Exporter mes données | en cours, prêt, échec | Explique les formats; lien quand prêt; reprise possible. |

## Interaction Primitives

- Souris : clic carte pour poser, clic Route point pour ouvrir Contextual menu, glisser un Route point ou une portion de tracé pour infléchir la géométrie; hover d’une Proposal card ne choisit jamais.
- Écran tactile : toucher et glisser sont les équivalents des gestes souris; Bottom sheet se tire verticalement; les cartes de proposition défilent horizontalement sans déplacer la carte par erreur.
- La Place search, la Reorderable point list et le placement cartographique restent synchronisés; aucun raccourci de lieu personnel n’est proposé en V1.
- Premier geste Manuel : poser le départ; topologie seulement ensuite. Tous les segments entre points sont routés automatiquement.
- Boucle : le départ est l’arrivée logique. Aller simple : un point reçoit le rôle Destination. Multi-étapes : chaque lieu requis reçoit explicitement le rôle Étape utilisateur ou Destination; l’ordre est fixe ou optimisable et toutes les étapes restent obligatoires.
- Inversion : inverse la boucle ou échange départ/destination; métriques et montées sont recalculées.
- Expandable metric bubble : le clic ou le toucher sur la bulle ou son chevron alterne les états compact et déployé.
- Assisté : formulaire compact unique, options avancées repliées, champs conditionnels à la topologie. Manuel et Assisté convergent vers le même éditeur.
- Banned : paramètres algorithmiques, ancres techniques, score en Manuel, choix implicite de #1, panneaux secondaires multiples, disparition du tracé au recalcul, promesse de sécurité.

## Accessibility Floor

Le prototype demandé est fonctionnel à la souris et privilégie le rendu; navigation clavier complète et lecteur d’écran ne sont pas des critères de validation du prototype. Cette limite de prototype ne doit pas devenir une interdiction produit.

Avant production, le produit doit satisfaire ces exigences, sans les imposer comme critères de validation à la maquette souris :

- Reorderable point list et Place search fournissent une alternative aux gestes fins sur carte pour ajouter, modifier, supprimer, qualifier et réordonner les points.
- Les annonces asynchrones sont limitées et hiérarchisées : une annonce non intrusive au démarrage ou au recalcul, une au palier 15 s, une lorsque les valeurs se stabilisent; une annonce prioritaire unique pour l’état terminal à 60 s, l’échec ou l’annulation. Aucune annonce par animation ou variation intermédiaire.
- La préférence de mouvement réduit supprime les transitions et recadrages non indispensables; le recadrage survient à l’activation explicite, pas au simple hover.
- Comparison modal et Contextual menu ont un titre ou un nom et un ordre de focus logique, une fermeture explicite et un retour au déclencheur ou au point logique survivant. Le remplacement panneau/inspecteur déplace le focus vers le nouveau titre puis le restitue au retour.
- Chaque contrôle iconique possède un nom programmatique stable; une icône ambiguë reçoit aussi texte visible ou tooltip. Les métriques associent valeur et unité; les alertes critiques restent textuelles.
- Textes externalisés, libellés longs, formats localisés et zoom/reflow ne doivent ni masquer une action ni casser l’ordre logique; Comparison table adopte des blocs lisibles sur petit écran.
- Une cible tactile minimale et ses espacements doivent être décidés avant production; la zone interactive pourra dépasser l’icône visible.

Aucune norme WCAG globale, cible tactile chiffrée ou grille de breakpoints numérique n’a été décidée; ces trois points restent ouverts.

## Responsive & Platform

| Context | Behavior |
|---|---|
| Desktop large | Carte dominante; Primary panel flottant à gauche; un Secondary inspector côte à côte; Expandable metric bubble en bas; Comparison modal centrée. |
| Tablette / petit écran | Carte conservée; inspecteur remplace le panneau avec Retour au parcours; comparaison adapte ses colonnes sans masquer les avertissements. |
| Téléphone | Carte plein écran; Bottom sheet; les cartes de proposition défilent horizontalement; Exporter peut vivre dans le menu de débordement; aucune action essentielle ne dépend du survol. |
| PWA installée ou navigateur | Même contrat; connexion obligatoire pour carte dynamique, routage, recalcul et enregistrement. Pas de suivi GPS ni navigation en sortie. |

[L’écran clé téléphone](mockups/key-mobile-atelier.html) illustre la carte plein écran, Bottom sheet et Expandable metric bubble sur petit écran.

## Key Flows

### UJ-1 — Guillaume génère et exporte un parcours

1. Guillaume ouvre l’Atelier et choisit Assisté.
2. Il recherche ou place le départ, choisit Boucle, Aller simple ou Multi-étapes, puis remplit le formulaire compact; seules les options applicables apparaissent.
3. Il lance Générer. La progression apparaît immédiatement; après 15 s, le dépassement est expliqué sans interrompre la recherche.
4. Jusqu’à quatre tracés et Proposal cards apparaissent; #1 est au premier plan sans être choisi. Tout tracé provisoire reste explicitement identifié.
5. Guillaume explore les Proposal cards, ouvre des détails ou Comparison modal et distingue rang, score, conformité et fiabilité.
6. Il clique explicitement Choisir ce parcours; le résultat rejoint l’éditeur commun.
7. Il déplace un point; le dernier tracé reste visible avec « Mise à jour… ». Métriques, score, conformité, fiabilité et écarts sont recalculés, et le parcours porte l’état « Généré puis modifié ».
8. Il ouvre Save form, saisit nom, note et étiquettes, enregistre, puis exporte en GPX.
9. **Climax :** la confirmation nomme le fichier exporté et Guillaume peut revenir au parcours ou en préparer un autre.

Échec : à 60 s, seuls les candidats validés sont montrés. S’il n’y en a aucun, bikeroute explique les contraintes bloquantes et propose des critères à assouplir; aucune trace provisoire n’est exportable.

### UJ-2 — Guillaume crée un parcours manuellement

1. Guillaume ouvre l’Atelier; Manuel est actif et la carte domine.
2. Il clique la carte : le départ est créé et le Contextual menu demande la topologie.
3. Il choisit Boucle, Aller simple ou Multi-étapes.
4. Chaque clic suivant crée un Point de passage et le moteur route automatiquement entre les points; Guillaume peut aussi glisser une portion du tracé pour créer/déplacer un passage qui infléchit la géométrie.
5. Guillaume sélectionne certains points pour leur attribuer un rôle; en Aller simple il définit la Destination, en Multi-étapes une Étape utilisateur ou la Destination.
6. Il déplace un point et ajuste Options; le tracé précédent et le panneau restent en place pendant le recalcul.
7. Il déploie Expandable metric bubble pour consulter le détail des métriques et la courbe continue du profil, puis examine fiabilité et montées et inverse éventuellement le sens.
8. Il ouvre Save form, renseigne nom, note et étiquettes, puis enregistre.
9. **Climax :** depuis Mes parcours, Guillaume rouvre le parcours nommé et retrouve géométrie, points et métriques prêts à reprendre ou exporter.

Échec : un recalcul ou l’enregistrement échoue; dernier tracé, points et champs du Save form sont conservés, et Guillaume peut réessayer ou revenir à l’éditeur.

### UJ-3 — Guillaume optimise un parcours multi-étapes

1. Guillaume choisit Multi-étapes en Manuel ou Assisté après avoir défini le départ.
2. Il pose les lieux; chacun naît Point de passage, puis il qualifie explicitement les Étapes utilisateur et la Destination.
3. Il ouvre la liste complète, réordonne les étapes et choisit ordre imposé ou optimisable.
4. En Assisté, il renseigne les contraintes applicables et lance la génération; en Manuel, le recalcul est immédiat.
5. Il vérifie que toutes les étapes utilisateur sont desservies; aucune ancre technique n’est visible.
6. Il compare les variantes et choisit explicitement un parcours si le mode est Assisté.
7. **Climax :** l’éditeur commun affiche le tracé final, l’ordre retenu et les métriques recalculées avant enregistrement/export.

Échec : une étape rend la demande impossible; bikeroute nomme l’étape ou la contrainte concernée et propose d’assouplir les préférences, de modifier l’ordre ou de déplacer l’étape, sans la supprimer automatiquement.

### UJ-4 — Guillaume reprend et gère ses données

1. Guillaume s’inscrit ou se connecte.
2. Depuis Accueil, il ouvre Mes parcours, choisit un parcours et le retrouve dans l’Atelier avec ses points et métriques.
3. **Climax de reprise :** Guillaume peut immédiatement continuer l’édition sans reconstruire le parcours.
4. Il ouvre Account menu puis Exporter mes données.
5. Il lance l’export et reste sur la surface jusqu’à ce que les fichiers soient disponibles.
6. **Climax de portabilité :** il récupère un ensemble de formats ouverts accompagné de sa documentation.

Échec : la préparation de l’export échoue; la demande peut être relancée sans affecter les parcours ni la session.

## PRD Flow Coverage

| Key Flow | Requirements covered |
|---|---|
| UJ-1 | FR-10 Entrées minimales par type; FR-11 Tolérances et préférences; FR-12 Types de séance; FR-14 Diversité configurable; FR-15 Accès vélo; FR-16 Revêtement vélo de route; FR-17 Revêtement inconnu; FR-18 Grands axes; FR-19 Prudence sur la sécurité; FR-20 Couverture des types; FR-21 Propositions multiples; FR-22 Résultat partiel; FR-23 Échec explicite; FR-24 Diversification; FR-25 Nouveauté historique; FR-26 Score absolu; FR-27 Dimensions du score; FR-28 Conformité indépendante; FR-29 Rang indépendant; FR-30 Fiabilité des données; FR-31 Explication dimensionnelle; FR-32 Comparaison; FR-33 Progression visible; FR-34 Dépassement nominal; FR-35 Arrêt de sécurité; FR-36 Annulation; FR-37 Sélection; FR-38 Conservation de la demande; FR-39 Réévaluation après modification; FR-40 Métriques du parcours; FR-41 Enregistrement; FR-42 Export GPX; FR-43 Historique des exports; FR-49 Confirmation d’export; FR-51 Baseline d’évaluation calibrée; FR-52 Liberté après édition manuelle; FR-53 État terminal unique. |
| UJ-2 | FR-6 Définition du parcours; FR-7 Types de parcours; FR-8 Édition cartographique; FR-9 Inversion; FR-40 Métriques du parcours; FR-41 Enregistrement; FR-42 Export GPX; FR-46 Calcul initial A → B; FR-47 Résumé persistant. |
| UJ-3 | FR-13 Ordre des étapes; FR-20 Couverture des types; FR-24 Diversification; FR-32 Comparaison. |
| Tous les parcours de préparation | FR-44 Continuité entre modes; FR-45 Changement de type; FR-48 Options contextuelles. |
| UJ-4 | FR-1 Inscription; FR-2 Session utilisateur; FR-3 Isolation des données; FR-4 Synthèse d’accueil; FR-5 Continuité multi-écran; FR-50 Export des données du compte. |
