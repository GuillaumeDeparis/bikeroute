---
name: bikeroute — Sport accessible
description: Système visuel clair, cartographique et sportif pour préparer un parcours sans intimidation ni codes compétitifs.
status: final
updated: 2026-08-20
sources:
  - ../../../../docs/PRD.md
  - ../../../specs/spec-route-generation-engine/SPEC.md
colors:
  canvas: '#EEF3F6'
  map-land: '#E8EFF3'
  surface: '#FFFFFF'
  surface-subtle: '#F7FAFB'
  ink: '#17324D'
  ink-secondary: '#4A6478'
  ink-muted: '#5F7888'
  border: '#CBD8DF'
  accent: '#F05A28'
  accent-interactive: '#C94718'
  on-accent: '#FFFFFF'
  focus-ring: '#17324D'
  route-secondary: '#7895A5'
  positive: '#287A5D'
  info-surface: '#E5F1F7'
  warning: '#A45A00'
  warning-surface: '#FFF2D8'
  danger: '#B42318'
  danger-surface: '#FEECEB'
  scrim: '#17324D99'
typography:
  title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: '-0.01em'
  heading:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 20px
    fontWeight: '750'
    lineHeight: '1.3'
  body:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '650'
    lineHeight: '1.35'
  metric:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '750'
    lineHeight: '1.25'
  score:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 25px
    fontWeight: '800'
    lineHeight: '1.1'
  caption:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 8px
  md: 12px
  lg: 18px
  xl: 24px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  panel-gap: 12px
  map-inset: 20px
  mobile-margin: 12px
components:
  app-header:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
  primary-button:
    background: '{colors.accent-interactive}'
    foreground: '{colors.on-accent}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  secondary-button:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    radius: '{rounded.md}'
  mode-switch:
    background: '{colors.canvas}'
    selected-background: '{colors.ink}'
    selected-foreground: '{colors.surface}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  primary-panel:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.xl}'
    shadow: '0 14px 38px #17324D22'
  secondary-inspector:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.lg}'
    shadow: '0 12px 30px #17324D22'
  bottom-sheet:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.xl}'
    shadow: '0 -12px 30px #17324D22'
  expandable-metric-bubble:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.full}'
    shadow: '0 8px 24px #17324D22'
    expanded-radius: '{rounded.lg}'
    profile-stroke: '{colors.accent}'
    profile-fill: '{colors.info-surface}'
  contextual-menu:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  route-point:
    fill: '{colors.surface}'
    stroke: '{colors.ink}'
    active-stroke: '{colors.accent}'
  compass-control:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.full}'
    shadow: '0 6px 18px #17324D22'
  proposal-card:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-border: '{colors.accent}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.lg}'
  status-banner:
    background: '{colors.info-surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.md}'
  comparison-modal:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.lg}'
    scrim: '{colors.scrim}'
    focus-ring: '{colors.focus-ring}'
  account-menu:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  place-search:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  input-field:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  select-control:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
    radius: '{rounded.md}'
  checkbox-toggle:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    selected: '{colors.accent-interactive}'
    focus-ring: '{colors.focus-ring}'
  reorderable-point-list:
    background: '{colors.surface-subtle}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    radius: '{rounded.md}'
  save-form:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    radius: '{rounded.lg}'
  skeleton:
    background: '{colors.canvas}'
    shimmer: '{colors.surface-subtle}'
    radius: '{rounded.sm}'
  comparison-table:
    background: '{colors.surface}'
    foreground: '{colors.ink}'
    border: '{colors.border}'
    focus-ring: '{colors.focus-ring}'
---

## Brand & Style

bikeroute est un outil de préparation sportive accessible : direct, robuste et accueillant. La carte porte la sophistication; les panneaux restent simples. L’orange donne de l’énergie au tracé actif, aux actions principales et aux sélections, sans évoquer compétition, classement social ou performance personnelle.

Le thème est clair uniquement. [La direction Sport accessible](mockups/direction-sport-accessible.html) illustre la palette claire, les formes généreuses, l’accent orange contenu et la carte dominante.

## Colors

- `{colors.canvas}`, `{colors.surface}` et `{colors.surface-subtle}` organisent les couches sans transformer l’atelier en dashboard.
- `{colors.ink}` fournit la structure; `{colors.ink-secondary}` et `{colors.ink-muted}` portent explications et données secondaires.
- `{colors.accent}` conserve l’orange Sport accessible sur les tracés et accents non textuels. `{colors.accent-interactive}` est sa variante assombrie pour boutons et sélections portant du texte; elle ne signifie ni succès, ni fiabilité, ni recommandation.
- `{colors.ink-muted}` atteint 4,64:1 sur blanc pour les petits textes. Les tracés non focalisés utilisent `{colors.route-secondary}` avec halo ou motif et identifiant numérique, puis une opacité testée sur plusieurs fonds OSM. Rang, score et conformité ne sont jamais différenciés par une hiérarchie chromatique trompeuse.
- `{colors.positive}`, `{colors.warning}` et `{colors.danger}` sont réservés aux états sémantiques avec libellé; la couleur seule ne porte jamais le sens.
- Combinaisons à préserver : `{colors.on-accent}` sur `{colors.accent-interactive}` atteint **4,77:1**; `{colors.ink}` sur `{colors.surface}` et `{colors.focus-ring}` sur les surfaces claires structurent texte et focus; `{colors.warning}` sur `{colors.warning-surface}` et `{colors.danger}` sur `{colors.danger-surface}` restent réservés aux messages associés. `{colors.accent}` ne reçoit aucun texte blanc. Les contrastes doivent aussi être vérifiés sur plusieurs fonds OSM réels.

## Typography

La famille système évite une dépendance de fonte et reste nette sur ordinateur, tablette et téléphone. `{typography.title}` et `{typography.heading}` structurent; `{typography.body}` porte les explications; `{typography.metric}` aligne distance, D+ et durée; `{typography.score}` est réservé au score absolu des propositions. Les unités restent attachées à leur valeur.

Les libellés sont français en V1 mais externalisés. Les composants acceptent des libellés traduits plus longs et les valeurs localisées sans troncature porteuse de sens.

## Layout & Spacing

La carte remplit le viewport. Sur écran large, `{components.primary-panel}` flotte à gauche avec `{spacing.map-inset}`; un seul `{components.secondary-inspector}` peut s’ouvrir à côté avec `{spacing.panel-gap}`. Le panneau principal peut se replier entièrement; `{components.expandable-metric-bubble}` reste alors en bas de la carte.

Sur tablette, l’inspecteur remplace temporairement le contenu du panneau. Sur téléphone, `{components.bottom-sheet}` monte depuis le bas sur une carte plein écran. Le rythme suit 4/8/12/16/20/24/32 px; les zones cartographiques restent plus vastes que l’ensemble des panneaux.

## Elevation & Depth

La carte est le niveau zéro. Panneaux, menus et cartes de propositions utilisent des ombres ambiantes bleu-encre à faible opacité. La modale de comparaison est la seule couche avec scrim. Une animation courte et douce peut accompagner ouverture, fermeture, focus de proposition et recalcul; aucun mouvement décoratif continu.

## Shapes

Les formes généreuses distinguent bikeroute d’un outil d’ingénierie : contrôles à `{rounded.md}`, cartes et inspecteurs à `{rounded.lg}`, panneau principal et bottom sheet à `{rounded.xl}`. Les pills `{rounded.full}` sont réservées aux bulles compactes et contrôles circulaires, pas à toutes les données.

## Components

| Component | Visual contract |
|---|---|
| App header | `{components.app-header}`; marque compacte, aucune métrique sportive. |
| Primary button | `{components.primary-button}`; orange interactif contrasté, une action dominante par contexte. |
| Secondary button | `{components.secondary-button}`; actions réversibles ou complémentaires. |
| Mode switch | `{components.mode-switch}`; Manuel/Assisté, sélection nette sans deux couleurs d’accent. |
| Primary panel | `{components.primary-panel}`; compact, flottant à gauche, repliable. |
| Secondary inspector | `{components.secondary-inspector}`; complète le panneau principal sans recopier ses métriques. |
| Bottom sheet | `{components.bottom-sheet}`; même hiérarchie que le panneau, adaptée au téléphone. |
| Expandable metric bubble | `{components.expandable-metric-bubble}`; compacte, allongée et pleinement arrondie avec distance, D+, durée et petit triangle/chevron. Déployée, elle adopte `{rounded.lg}`, révèle le détail des métriques et un profil altimétrique tracé en courbe continue sur l’axe de distance; jamais de paliers. |
| Contextual menu | `{components.contextual-menu}`; ancré au point sélectionné, options de rôle explicites. |
| Route point | `{components.route-point}`; départ, passage, étape et destination ont des formes/icônes distinctes, renforcées par un libellé. |
| Compass control | `{components.compass-control}`; contrôle discret au-dessus de la carte. |
| Proposal card | `{components.proposal-card}`; focus orange, rang discret, score et conformité typographiquement distincts. Aucun traitement « recommandé ». |
| Status banner | `{components.status-banner}`; progression, résultat partiel, inconnues et assouplissements avec texte. |
| Comparison modal | `{components.comparison-modal}`; tableau centré au-dessus de la carte, sans remplacer la sélection courante. |
| Account menu | `{components.account-menu}`; menu discret, sans surface de réglages générale. |
| Place search | `{components.place-search}`; recherche compacte avec résultats superposés sans masquer le point visé. |
| Input field | `{components.input-field}`; label persistant, aide et erreur sans saut de largeur. |
| Select control | `{components.select-control}`; valeur et chevron explicites, largeur adaptée aux traductions. |
| Checkbox / toggle | `{components.checkbox-toggle}`; état visible par forme, texte et marque, jamais couleur seule. |
| Reorderable point list | `{components.reorderable-point-list}`; rôles et poignées distincts, lignes assez hautes pour des libellés localisés. |
| Save form | `{components.save-form}`; nom, note et étiquettes dans une surface unique. |
| Skeleton | `{components.skeleton}`; reprend la géométrie attendue sans simuler de contenu réel. |
| Comparison table | `{components.comparison-table}`; en-têtes persistants, colonnes lisibles et débordement contenu dans Comparison modal. |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Réserver l’orange au tracé actif, CTA et sélection. | Employer l’orange comme preuve de qualité, de sécurité ou de recommandation. |
| Garder la carte visuellement dominante. | Empiler contrôles flottants, inspecteurs ou métriques. |
| Montrer les inconnues avec chiffres et libellés. | Remplacer l’incertitude par un badge vague. |
| Conserver rang, score et conformité perceptuellement distincts. | Faire paraître la proposition #1 excellente parce qu’elle est première. |
| Utiliser une micro-animation fonctionnelle courte. | Employer néons, gradients flashy, anneaux, badges ou célébrations. |
| Donner une présence sportive claire et non élitiste. | Évoquer feed social, compétition, cockpit Garmin ou GPS automobile. |
