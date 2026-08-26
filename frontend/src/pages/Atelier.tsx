import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import {
  ApiError,
  calculerParcours,
  enregistrerParcours,
  exporterParcours,
  rechercherAdresse,
  type Metriques,
  type PointCoordonnee,
  type PointProfil,
  type ResultatAdresse,
  type ResultatParcours,
} from '../api/client'
import { formatDenivele, formatDistance, formatDuree, libelleDifficulte } from './Atelier.format'
import { construirePointsDepuisParcours, inverserPoints, type PointAtelier, type Role, type Topologie } from './Atelier.inversion'
import './Atelier.css'

// Bundler (Vite) : les icônes par défaut de Leaflet pointent vers des chemins
// relatifs résolus depuis le HTML, pas depuis le module -- sans ce correctif
// (recommandé par react-leaflet), les marqueurs s'affichent sans icône.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })

// Aucun point posé au premier chargement : centre de repli neutre (France
// métropolitaine) jusqu'à ce qu'un point existe -- pas de géolocalisation en
// V1 (hors scope de la spec-2-1).
const CENTRE_PAR_DEFAUT: [number, number] = [46.6, 2.4]
const ZOOM_PAR_DEFAUT = 6
const ZOOM_SUR_POINT = 13
const MAX_POINTS_CALCUL = 50

/** Numéro à attribuer à un nouveau Point de passage/Étape utilisateur :
 * toujours strictement supérieur à tout numéro déjà utilisé, jamais réutilisé
 * après une suppression (cf. `PointAtelier.numero`) -- une numérotation qui
 * "recule" après une suppression serait tout aussi perturbante qu'une
 * renumérotation au réordonnancement. */
function prochainNumeroDisponible(points: PointAtelier[]): number {
  return Math.max(0, ...points.map((point) => point.numero ?? 0)) + 1
}

function libelleRole(role: Role): string {
  switch (role) {
    case 'depart':
      return 'Départ'
    case 'point_de_passage':
      return 'Point de passage'
    case 'etape_utilisateur':
      return 'Étape utilisateur'
    case 'destination':
      return 'Destination'
  }
}

function libellePointAccessible(point: PointAtelier): string {
  const numero = point.numero !== undefined ? ` ${point.numero}` : ''
  return `${libelleRole(point.role)}${numero}`
}

// Cache module-level (pas de useMemo, plusieurs points/positions dans une
// boucle .map()) : sans lui, `icôneNumerotee` recréait un nouvel objet
// `L.DivIcon` à chaque rendu, ce qui poussait react-leaflet à appeler
// `marker.setIcon(...)` sur un `Marker` `draggable` à chaque re-rendu --
// combinaison connue pour faire planter Leaflet (`_leaflet_events` sur un
// `obj` devenu `undefined`, cf. https://github.com/Leaflet/Leaflet/issues
// -- l'échange d'icône réinitialise le binding interne de Draggable). Un
// même numéro réutilise toujours la même instance, tant que l'app tourne.
const cacheIconesNumerotees = new Map<number, L.DivIcon>()

/** Icône numérotée (punaise, comme l'icône Leaflet par défaut -- pas un
 * simple badge rond) pour un Point de passage/Étape utilisateur : Départ et
 * Destination gardent l'icône Leaflet par défaut (un seul de chacun, déjà
 * identifiable par son rôle) -- seuls les points de passage, potentiellement
 * multiples, ont besoin d'un numéro pour rester distinguables sur la carte,
 * en cohérence avec la liste. Ancrée par sa pointe (bas-centre), comme
 * l'icône par défaut, pour rester alignée sur le point réel une fois posée. */
function icôneNumerotee(numero: number): L.DivIcon {
  const enCache = cacheIconesNumerotees.get(numero)
  if (enCache) {
    return enCache
  }
  const svg = `
    <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z"
        fill="#2a6f4d"
        stroke="#fff"
        stroke-width="1.5"
      />
      <circle cx="15" cy="15" r="10" fill="#fff" />
      <text x="15" y="20" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif" fill="#2a6f4d">${numero}</text>
    </svg>
  `
  const icone = L.divIcon({
    html: svg,
    className: 'atelier__marqueur-icone',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  })
  cacheIconesNumerotees.set(numero, icone)
  return icone
}

function libelleTopologie(topologie: Topologie): string {
  switch (topologie) {
    case 'boucle':
      return 'Boucle'
    case 'aller_simple':
      return 'Aller simple'
    case 'multi_etapes':
      return 'Multi-étapes'
  }
}

/** Une requête annulée volontairement (nouveau point posé avant la fin du
 * calcul précédent, nouvelle recherche avant la fin de la précédente, ou
 * démontage) n'est jamais une erreur à afficher -- ni `fetch` (`AbortError`
 * natif) ni un polyfill ne partagent forcément la même classe d'erreur, d'où
 * la vérification par nom plutôt que par `instanceof`. */
function estErreurAnnulation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
}

/** Insère `nouveauPoint` juste avant le dernier élément de `points` (la
 * Destination, qui reste toujours dernière -- cf. spec-2-3, "ajout après un
 * tracé déjà posé"). Partagé par les branches aller_simple et multi_etapes
 * de `poserPoint`, seules topologies pouvant porter une Destination. */
function insererAvantDernier(points: PointAtelier[], nouveauPoint: PointAtelier): PointAtelier[] {
  const dernierIndex = points.length - 1
  return [...points.slice(0, dernierIndex), nouveauPoint, points[dernierIndex]]
}

/** Composant sans rendu : relaie les clics carte au parent via
 * `useMapEvents` (l'unique façon, avec react-leaflet, d'écouter les
 * événements d'une `MapContainer` déjà montée). */
function EcouteurClicCarte({ onClic }: { onClic: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      onClic(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

/** Recentre la carte quand le premier point est posé, sans jamais changer le
 * niveau de zoom : l'utilisateur a pu zoomer précisément avant de cliquer,
 * et se retrouver dézoomé de force juste après serait contre-productif. */
function RecentrageInitial({ centre }: { centre: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (centre) {
      map.setView(centre, map.getZoom())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre])
  return null
}

/** Recentre la carte sur un lieu choisi via la recherche (spec-2-1 UX-DR17),
 * sans jamais poser de point : contrairement au clic carte, la recherche ne
 * fait que "focaliser" -- c'est à l'utilisateur de cliquer ensuite pour
 * positionner le point à l'endroit exact qu'il souhaite. Zoom fixe (pas de
 * préservation comme `RecentrageInitial`) : une recherche peut amener sur un
 * lieu sans rapport avec la vue actuelle, contrairement à un point déjà
 * regardé de près avant d'être posé. */
function RecentrageRecherche({ centre }: { centre: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (centre) {
      map.setView(centre, ZOOM_SUR_POINT)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre])
  return null
}

/** Ajuste la vue sur l'étendue complète d'un parcours réouvert depuis « Mes
 * parcours » (spec-2-6) : contrairement à `RecentrageInitial` (qui préserve
 * le zoom courant pour un point posé à la main), une réouverture démarre
 * sans aucune vue pertinente -- le zoom par défaut ne montre presque jamais
 * le tracé entier. Ne s'exécute qu'une fois au montage (délibérément sans
 * dépendance : l'Atelier est remonté à chaque réouverture via la `key`
 * d'`App.tsx`, jamais réutilisé pour un autre parcours). `maxZoom` plafonné
 * à `ZOOM_SUR_POINT` : un très court tracé (deux points proches) ne doit pas
 * zoomer plus près qu'un simple résultat de recherche. */
function RecentrageParcoursOuvert({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: ZOOM_SUR_POINT })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** "42 %" -- proportion (0..1) de revêtement/catégorie routière, arrondie au
 * pourcent le plus proche (pas de décimale, cf. registre de `formatDenivele`). */
function formatPourcentage(proportion: number): string {
  return `${Math.round(proportion * 100)} %`
}

/** "4,2 %" -- pente moyenne d'une montée significative, déjà en pourcentage
 * côté backend (`MonteeSignificative.penteMoyenne`), jamais recalculée ici. */
function formatPente(penteMoyenne: number): string {
  return `${penteMoyenne.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

/** Valeur brute backend (tag OSM/Valhalla, ex. `"paved"`, `"residential"`,
 * `"inconnu"`) -> libellé affichable : première lettre capitalisée,
 * soulignés remplacés par des espaces. Aucune traduction dédiée par valeur
 * (liste ouverte, dépend de Valhalla/OSM) -- un affichage brut mais lisible
 * reste préférable à une table de correspondance forcément incomplète. */
function libelleCle(cle: string): string {
  const lisible = cle.replace(/_/g, ' ')
  return lisible.charAt(0).toUpperCase() + lisible.slice(1)
}

/** Liste triée par proportion décroissante -- "inconnu" toujours présent
 * dans `proportions` (NFR-10, cf. backend `domain/metrics.py`), affiché à sa
 * place dans le tri comme n'importe quelle autre valeur, jamais mis en avant
 * ni caché. */
function trierProportions(proportions: Record<string, number>): [string, number][] {
  return Object.entries(proportions).sort(([, a], [, b]) => b - a)
}

/** Construit l'attribut `d` d'un `<path>` SVG reliant chaque point du profil
 * par un segment de droite (`M`/`L`) -- une ligne continue point-à-point sur
 * la géométrie routée réelle, jamais un binning par paliers (cf. Boundaries
 * de la spec-2-5 : "Never" -- courbe par paliers/binned). `largeur`/`hauteur`
 * définissent le repère du `viewBox` (cf. `atelier__profil-courbe` en CSS,
 * `preserveAspectRatio="none"` -- la mise à l'échelle réelle est laissée au
 * SVG, ce chemin reste exprimé dans un repère fixe). */
function construireCourbeAltimetrique(profil: PointProfil[], largeur: number, hauteur: number): string {
  if (profil.length === 0) {
    return ''
  }
  const distanceMaxM = profil[profil.length - 1].distanceM
  const { min: elevationMinM, max: elevationMaxM } = extremaProfil(profil)
  const amplitudeM = elevationMaxM - elevationMinM

  function x(distanceM: number): number {
    return distanceMaxM > 0 ? (distanceM / distanceMaxM) * largeur : 0
  }
  // Élévation la plus basse en bas (`hauteur`), la plus haute en haut (`0`)
  // -- axe SVG inversé par rapport à l'axe cartésien habituel. Amplitude
  // nulle (parcours parfaitement plat) : ligne médiane, jamais de division
  // par zéro.
  function y(elevationM: number): number {
    if (amplitudeM <= 0) {
      return hauteur / 2
    }
    return hauteur - ((elevationM - elevationMinM) / amplitudeM) * hauteur
  }

  return profil
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.distanceM).toFixed(1)} ${y(point.elevationM).toFixed(1)}`)
    .join(' ')
}

function extremaProfil(profil: PointProfil[]): { min: number; max: number } {
  return profil.reduce(
    (extrema, point) => ({
      min: Math.min(extrema.min, point.elevationM),
      max: Math.max(extrema.max, point.elevationM),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  )
}

/** Résumé textuel du profil pour lecteur d'écran (revue post-implémentation,
 * spec-2-5) : la courbe SVG ci-dessous est décorative (`aria-hidden`) --
 * contrairement aux listes texte adjacentes (revêtements/montées), elle ne
 * transmet aucune donnée par elle-même à un lecteur d'écran. Le D+ total
 * réutilise `metriques.denivelePositifM` (jamais recalculé ici, cf.
 * Boundaries) ; seules les altitudes min/max, dérivées pour l'affichage,
 * sont calculées ici. */
function resumeProfilPourLecteurEcran(profil: PointProfil[], denivelePositifM: number): string {
  const extrema = extremaProfil(profil)
  const min = Math.round(extrema.min)
  const max = Math.round(extrema.max)
  return `Altitude minimale ${min} m, altitude maximale ${max} m, dénivelé positif total ${formatDenivele(denivelePositifM)}.`
}

/** Bulle de métriques extensible (compacte ↔ déployée, spec-2-5) : compacte
 * = distance/D+/durée ; déployée ajoute D-/difficulté, puis (complément
 * spec-2-5) revêtements/catégories routières, montées significatives et la
 * courbe altimétrique continue (cf. Boundaries des deux specs). Un unique
 * composant, jamais recalculé -- affiche tel quel ce que le backend a
 * produit (`metriques`), sans logique métier ici. Persistante dans le
 * panneau (déjà accessible ordinateur/mobile via le layout responsive
 * existant, cf. Atelier.css) : ne se démonte jamais tant qu'un parcours routé
 * existe, y compris pendant "Mise à jour…" (mêmes dernières valeurs
 * affichées, cf. matrice I/O -- le composant ne sait rien du recalcul en
 * cours, c'est l'appelant qui continue de lui passer les dernières
 * métriques valides). */
function BulleMetriques({
  metriques,
  depliee,
  onBasculer,
}: {
  metriques: Metriques
  depliee: boolean
  onBasculer: () => void
}) {
  return (
    <div className="atelier__metriques" role="region" aria-label="Métriques du parcours">
      <button
        type="button"
        className="atelier__metriques-bascule"
        onClick={onBasculer}
        aria-expanded={depliee}
      >
        <span>Résumé du parcours</span>
        <span aria-hidden="true">{depliee ? '▴' : '▾'}</span>
      </button>
      <div className="atelier__metriques-grille">
        <div className="atelier__metrique">
          <b>{formatDistance(metriques.distanceM)}</b>
          <span>Distance</span>
        </div>
        <div className="atelier__metrique">
          <b>{formatDenivele(metriques.denivelePositifM)}</b>
          <span>D+</span>
        </div>
        <div className="atelier__metrique">
          <b>{formatDuree(metriques.dureeS)}</b>
          <span>Durée</span>
        </div>
        {depliee && (
          <>
            <div className="atelier__metrique">
              <b>{formatDenivele(metriques.deniveleNegatifM)}</b>
              <span>D-</span>
            </div>
            <div className="atelier__metrique">
              <b>{libelleDifficulte(metriques.difficulte)}</b>
              <span>Difficulté</span>
            </div>
          </>
        )}
      </div>

      {depliee && (
        <div className="atelier__metriques-detail">
          <div className="atelier__attributs-voie" role="group" aria-label="Revêtements">
            <p className="atelier__section-titre">Revêtements</p>
            <ul>
              {trierProportions(metriques.revetements).map(([cle, proportion]) => (
                <li key={cle}>
                  <span>{libelleCle(cle)}</span>
                  <span>{formatPourcentage(proportion)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="atelier__attributs-voie" role="group" aria-label="Catégories routières">
            <p className="atelier__section-titre">Catégories routières</p>
            <ul>
              {trierProportions(metriques.categoriesRoutieres).map(([cle, proportion]) => (
                <li key={cle}>
                  <span>{libelleCle(cle)}</span>
                  <span>{formatPourcentage(proportion)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Absente sans erreur sur un parcours plat -- jamais une liste
              vide affichée (cf. matrice I/O). */}
          {metriques.monteesSignificatives.length > 0 && (
            <div className="atelier__attributs-voie" role="group" aria-label="Montées significatives">
              <p className="atelier__section-titre">Montées significatives</p>
              <ul>
                {metriques.monteesSignificatives.map((montee, index) => (
                  <li key={index}>
                    {formatDistance(montee.distanceM)} · {formatDenivele(montee.deniveleM)} ·{' '}
                    {formatPente(montee.penteMoyenne)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* `>= 2` (pas seulement "non vide") : un profil à un seul point
              ne produit qu'une commande `M` sans `L` -- un chemin SVG
              invisible (revue post-implémentation). */}
          {metriques.profil.length >= 2 && (
            <div className="atelier__profil" role="group" aria-label="Profil altimétrique">
              <p className="atelier__section-titre">Profil altimétrique</p>
              {/* Équivalent textuel exploitable par un lecteur d'écran (la
                  courbe SVG ci-dessous est purement décorative, `aria-
                  hidden`) -- même exigence que les listes texte adjacentes. */}
              <span className="atelier__sr-only">
                {resumeProfilPourLecteurEcran(metriques.profil, metriques.denivelePositifM)}
              </span>
              <svg
                className="atelier__profil-courbe"
                viewBox="0 0 600 64"
                preserveAspectRatio="none"
                aria-hidden="true"
                data-testid="atelier-profil-svg"
              >
                <path d={construireCourbeAltimetrique(metriques.profil, 600, 64)} />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface AtelierProps {
  onRetourAccueil: () => void
  onSessionExpiree?: () => void
  /** Parcours réouvert depuis « Mes parcours » (spec-2-6) : précharge points/
   * trace/métriques/topologie/nom/note/étiquettes, sans aucun nouvel appel
   * Valhalla (Boundaries de la spec) -- la réouverture délègue entièrement à
   * l'Atelier existant (Design Notes). L'appelant remonte le composant (via
   * une `key` dédiée, cf. `App.tsx`) pour rouvrir un autre parcours : cette
   * prop n'est donc lue qu'au montage, jamais réagie à un changement. */
  parcoursAOuvrir?: ResultatParcours
}

export function Atelier({ onRetourAccueil, onSessionExpiree, parcoursAOuvrir }: AtelierProps) {
  // Reconstruction pure (spec-2-6, Design Notes) : lue seulement par les
  // initialiseurs paresseux des `useState` ci-dessous (jamais recalculée
  // après le montage, `parcoursAOuvrir` restant stable pour la durée de vie
  // du composant, cf. commentaire de la prop).
  const parcoursPrecharge = parcoursAOuvrir ? construirePointsDepuisParcours(parcoursAOuvrir.points ?? []) : undefined

  const [points, setPoints] = useState<PointAtelier[]>(() => parcoursPrecharge?.points ?? [])
  // Choix imposé par le Contextual menu dès le départ posé -- jamais de
  // valeur par défaut implicite (cf. Boundaries de la spec-2-2). Préchargée
  // depuis un parcours réouvert (spec-2-6).
  const [topologie, setTopologie] = useState<Topologie | undefined>(() => parcoursPrecharge?.topologie)
  const [trace, setTrace] = useState<PointCoordonnee[]>(() => parcoursAOuvrir?.geometrie ?? [])
  const [calculEnCours, setCalculEnCours] = useState(false)
  // Une inversion est une intention de recalcul même si les coordonnées
  // restent identiques (Boucle à un seul passage ou points superposés).
  const [revisionInversion, setRevisionInversion] = useState(0)
  const [erreurCalcul, setErreurCalcul] = useState<string | undefined>(undefined)
  // Dernières métriques valides (spec-2-5) : suit exactement le même patron
  // que `trace` -- ni effacées pendant un recalcul ("Mise à jour…" les
  // laisse affichées), ni jamais présentes hors statut "routed" (mêmes
  // points de mise à jour que `trace` ci-dessous, jamais un état séparé qui
  // pourrait diverger).
  const [metriques, setMetriques] = useState<Metriques | undefined>(() => parcoursAOuvrir?.metriques)
  const [bulleMetriquesDepliee, setBulleMetriquesDepliee] = useState(false)

  // Identité du parcours persisté correspondant au tracé actuellement
  // affiché (spec-2-6) : capturée depuis `resultat.id` après chaque calcul
  // routé réussi, remise à `undefined` dès qu'une édition relance un calcul
  // (cf. l'effet de calcul ci-dessous) -- cible du `PATCH` d'enregistrement,
  // jamais utilisée pour du rendu au-delà de conditionner ce bouton.
  const [parcoursId, setParcoursId] = useState<string | undefined>(() => parcoursAOuvrir?.id)
  // Valeur courante accessible depuis les continuations asynchrones : une
  // sauvegarde lancée avant une édition ne doit pas confirmer le nouveau
  // tracé lorsque sa réponse arrive plus tard.
  const parcoursIdRef = useRef(parcoursId)
  parcoursIdRef.current = parcoursId
  // Réouverture (spec-2-6) : le tout premier passage de l'effet de calcul
  // ci-dessous doit être ignoré -- trace/métriques/parcoursId viennent déjà
  // de la persistance (initialiseurs paresseux ci-dessus), aucun nouvel
  // appel Valhalla au montage (Boundaries de la spec). Un seul coup : toute
  // édition suivante repasse par le chemin normal.
  const ignorerPremierCalculRef = useRef(parcoursAOuvrir !== undefined)

  // Save form (spec-2-6, UX-DR22) : nom/note/étiquettes préchargés depuis un
  // parcours réouvert, sinon vides pour un nouveau calcul -- jamais effacés
  // à un échec d'enregistrement (les trois champs restent conservés pour
  // réessayer, cf. matrice I/O de la spec).
  const [saveFormOuvert, setSaveFormOuvert] = useState(false)
  const [nomSaisie, setNomSaisie] = useState(() => parcoursAOuvrir?.nom ?? '')
  const [noteSaisie, setNoteSaisie] = useState(() => parcoursAOuvrir?.note ?? '')
  const [etiquettesSaisie, setEtiquettesSaisie] = useState(() => (parcoursAOuvrir?.etiquettes ?? []).join(', '))
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false)
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | undefined>(undefined)
  const [confirmationEnregistrement, setConfirmationEnregistrement] = useState(false)

  // Export GPX (spec-2-7) : `parcoursId` sert aussi de cible ici (même
  // garde que « Enregistrer », actif dès qu'un parcours routé est persisté).
  // `confirmationExport` porte le nom de fichier confirmé -- distinct d'un
  // simple booléen pour pouvoir l'afficher sans le redemander au backend.
  const [exportEnCours, setExportEnCours] = useState(false)
  const [erreurExport, setErreurExport] = useState<string | undefined>(undefined)
  const [confirmationExport, setConfirmationExport] = useState<{ nomFichier: string } | undefined>(undefined)

  const [recherche, setRecherche] = useState('')
  const [rechercheEnCours, setRechercheEnCours] = useState(false)
  const [erreurRecherche, setErreurRecherche] = useState<string | undefined>(undefined)
  const [resultatsRecherche, setResultatsRecherche] = useState<ResultatAdresse[] | undefined>(undefined)
  // Lieu choisi via la recherche, à focaliser sur la carte (jamais posé
  // automatiquement en point, cf. `choisirResultatRecherche`).
  const [focusRecherche, setFocusRecherche] = useState<[number, number] | null>(null)
  // Réf (pas de state) : sert uniquement à annuler une requête déjà en vol,
  // jamais lue pour du rendu.
  const rechercheControleurRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      rechercheControleurRef.current?.abort()
    }
  }, [])

  const depart = points.find((point) => point.role === 'depart')
  const destination = points.find((point) => point.role === 'destination')
  const pointsDePassage = points.filter(
    (point) => point.role === 'point_de_passage' || point.role === 'etape_utilisateur',
  )
  // Dernier point posé : seul celui-là porte le sélecteur inline de
  // qualification en Multi-étapes ("pas de ré-édition ultérieure", Design
  // Notes) -- et seulement tant qu'aucune Destination n'est déjà qualifiée
  // (verrouillage post-Destination).
  const dernierPoint = points[points.length - 1]
  const peutQualifierDernierPoint =
    topologie === 'multi_etapes' && !destination && dernierPoint !== undefined && dernierPoint.role === 'point_de_passage'
  // La fermeture d'une boucle ajoute le Départ une seconde fois au payload :
  // elle ne peut donc contenir que 49 points visibles, contre 50 pour les
  // autres topologies (borne du schéma HTTP).
  const limitePointsAtteinte =
    (topologie === 'boucle' && points.length >= MAX_POINTS_CALCUL - 1) ||
    (topologie !== undefined && topologie !== 'boucle' && points.length >= MAX_POINTS_CALCUL)

  // Liste ordonnée de points à envoyer au moteur de calcul, propre à chaque
  // topologie (le moteur reste topologie-agnostique, cf. Design Notes) :
  // `undefined` tant que la topologie n'a pas assez de points pour calculer.
  let pointsCalcul: PointAtelier[] | undefined
  if (depart && topologie === 'boucle' && pointsDePassage.length > 0) {
    // Fermeture de boucle par simple répétition du départ en fin de liste
    // (aucun itinéraire de retour "intelligent" recherché, cf. Never).
    pointsCalcul = [...points, depart]
  } else if (depart && (topologie === 'aller_simple' || topologie === 'multi_etapes') && destination) {
    // `points` déjà dans l'ordre Départ → Points de passage → Destination :
    // depuis spec-2-3, un aller simple peut aussi porter des Points de
    // passage insérés après coup, d'où l'alignement sur la même dérivation
    // que multi_etapes (auparavant `[depart, destination]` seul).
    pointsCalcul = points
  }

  // Mémoïsé sur des dépendances primitives (lat/lon, pas l'objet `points[0]`
  // lui-même) : `points.find(...)`/un tableau littéral recréerait une
  // nouvelle référence à chaque render, ce qui redéclencherait l'effet de
  // `RecentrageInitial` (et donc un recentrage/zoom intempestif de la carte)
  // à chaque frappe dans la recherche ou changement de `calculEnCours`, pas
  // seulement quand un point est réellement posé.
  const premierLat = points[0]?.lat
  const premierLon = points[0]?.lon
  const premierPointPose = useMemo<[number, number] | null>(
    () => (premierLat !== undefined && premierLon !== undefined ? [premierLat, premierLon] : null),
    [premierLat, premierLon],
  )

  function poserPoint(lat: number, lon: number) {
    setErreurRecherche(undefined)
    setResultatsRecherche(undefined)
    setPoints((precedent) => {
      if (precedent.length === 0) {
        return [{ id: crypto.randomUUID(), role: 'depart', lat, lon, nonRoute: false }]
      }
      // Départ posé, topologie pas encore choisie : le Contextual menu
      // l'impose avant tout point supplémentaire (jamais de valeur par
      // défaut implicite, cf. Boundaries).
      if (!topologie) {
        return precedent
      }
      const maximumVisible = topologie === 'boucle' ? MAX_POINTS_CALCUL - 1 : MAX_POINTS_CALCUL
      if (precedent.length >= maximumVisible) {
        return precedent
      }
      if (topologie === 'boucle') {
        // Jamais de Destination en boucle ; aucun verrouillage, chaque clic
        // ajoute un Point de passage (cf. Boundaries).
        return [
          ...precedent,
          {
            id: crypto.randomUUID(),
            role: 'point_de_passage',
            lat,
            lon,
            nonRoute: false,
            numero: prochainNumeroDisponible(precedent),
          },
        ]
      }
      if (topologie === 'aller_simple') {
        // Comportement 2.1 conservé : tant qu'aucune Destination n'existe,
        // le point posé le devient. Vérifié par présence du rôle (pas par
        // longueur) : une Destination supprimée via la liste (spec-2-3)
        // laisse une topologie aller_simple sans Destination, et le clic
        // suivant doit pouvoir en re-qualifier une plutôt que rester bloqué.
        const destinationExistante = precedent.some((point) => point.role === 'destination')
        if (!destinationExistante) {
          return [...precedent, { id: crypto.randomUUID(), role: 'destination', lat, lon, nonRoute: false }]
        }
        // Destination déjà qualifiée : le nouveau point s'insère comme
        // Point de passage juste avant elle (spec-2-3, "ajout après un
        // tracé déjà posé" -- avant cette story, ce clic était ignoré).
        return insererAvantDernier(precedent, {
          id: crypto.randomUUID(),
          role: 'point_de_passage',
          lat,
          lon,
          nonRoute: false,
          numero: prochainNumeroDisponible(precedent),
        })
      }
      // Multi-étapes : tant qu'aucune Destination n'est qualifiée, chaque
      // clic ajoute un Point de passage en fin de liste ; une fois
      // qualifiée, le nouveau point s'insère juste avant elle (même règle
      // que l'aller simple ci-dessus, spec-2-3).
      const destinationDejaQualifiee = precedent.some((point) => point.role === 'destination')
      if (!destinationDejaQualifiee) {
        return [
          ...precedent,
          {
            id: crypto.randomUUID(),
            role: 'point_de_passage',
            lat,
            lon,
            nonRoute: false,
            numero: prochainNumeroDisponible(precedent),
          },
        ]
      }
      return insererAvantDernier(precedent, {
        id: crypto.randomUUID(),
        role: 'point_de_passage',
        lat,
        lon,
        nonRoute: false,
        numero: prochainNumeroDisponible(precedent),
      })
    })
  }

  // Qualifie le dernier point posé en Multi-étapes (sélecteur inline, une
  // seule fois -- pas de ré-édition ultérieure, cf. Design Notes).
  function qualifierDernierPoint(role: 'etape_utilisateur' | 'destination') {
    setPoints((precedent) => {
      const dernier = precedent.at(-1)
      if (
        topologie !== 'multi_etapes' ||
        destination !== undefined ||
        dernier === undefined ||
        dernier.role !== 'point_de_passage'
      ) {
        return precedent
      }
      const dernierIndex = precedent.length - 1
      return precedent.map((point, index) =>
        // Destination n'affiche jamais de numéro (rôle déjà unique) ; Étape
        // utilisateur garde celui attribué à la création du point.
        index === dernierIndex ? { ...point, role, numero: role === 'destination' ? undefined : point.numero } : point,
      )
    })
  }

  // Déplacement d'un point existant (marqueur `draggable`, cf. `dragend`
  // sur `Marker` plus bas) : seules `lat`/`lon` changent, le reste (rôle,
  // `nonRoute`) est laissé tel quel -- le recalcul déclenché juste après
  // rafraîchira `nonRoute` avec la nouvelle position (cf. matrice I/O).
  function deplacerPoint(id: string, lat: number, lon: number) {
    setPoints((precedent) =>
      precedent.map((point) => (point.id === id ? { ...point, lat, lon, nonRoute: false } : point)),
    )
  }

  // Réordonnancement par boutons ↑ (`decalage: -1`) / ↓ (`decalage: +1`),
  // jamais sur Départ ni Destination (positions fixes, cf. Boundaries) :
  // le garde-fou porte à la fois sur le point déplacé et sur son voisin, ce
  // qui bloque naturellement tout échange avec le Départ (index 0) ou la
  // Destination (toujours dernière) sans connaître leur position à l'avance.
  function reordonnerPoint(id: string, decalage: -1 | 1) {
    setPoints((precedent) => {
      const index = precedent.findIndex((point) => point.id === id)
      if (index === -1) {
        return precedent
      }
      const cible = precedent[index]
      if (cible.role === 'depart' || cible.role === 'destination') {
        return precedent
      }
      const nouvelIndex = index + decalage
      if (nouvelIndex < 0 || nouvelIndex >= precedent.length) {
        return precedent
      }
      const voisin = precedent[nouvelIndex]
      if (voisin.role === 'depart' || voisin.role === 'destination') {
        return precedent
      }
      const copie = [...precedent]
      copie[index] = voisin
      copie[nouvelIndex] = cible
      return copie
    })
  }

  // Suppression via la liste (cf. Boundaries) : supprimer le Départ promeut
  // le point suivant au rôle Départ (mêmes lat/lon, cf. Design Notes) ; sans
  // second point, retour à l'état initial complet -- équivalent à
  // `reinitialiserPoints` (même risque de point orphelin que documenté sur
  // cette fonction si on filtrait `depart` sans réattribuer le rôle). Toute
  // autre ligne est simplement retirée.
  function supprimerPoint(id: string) {
    // Forme fonctionnelle (comme les autres mutateurs ci-dessus) : deux
    // suppressions déclenchées avant un re-rendu ne doivent jamais lire le
    // même `points` obsolète, sous peine que la seconde écrase le résultat
    // de la première (un point "supprimé" réapparaîtrait silencieusement).
    // Retour à `[]` calculé ici (jamais via une relecture de `points` après
    // coup, qui serait tout aussi obsolète) : l'effet ci-dessous, qui réagit
    // à `points.length`, s'occupe de réinitialiser topologie/trace/erreur en
    // conséquence dès que ce `[]` est effectivement commité.
    setPoints((precedent) => {
      const cible = precedent.find((point) => point.id === id)
      if (!cible) {
        return precedent
      }
      if (cible.role === 'depart') {
        const reste = precedent.filter((point) => point.id !== id)
        if (reste.length === 0) {
          return []
        }
        const [nouveauDepart, ...suite] = reste
        // Départ n'affiche jamais de numéro (rôle déjà unique) : effacé si
        // le point promu en portait un (ex-Point de passage).
        return [{ ...nouveauDepart, role: 'depart', numero: undefined }, ...suite]
      }
      return precedent.filter((point) => point.id !== id)
    })
  }

  // Filet de sécurité pour `supprimerPoint` (Départ supprimé sans point
  // restant) : réagit à l'état `points` réellement commité, jamais à une
  // fermeture capturée au moment du clic -- correct même si deux
  // suppressions se chevauchent avant un re-rendu (cf. commentaire ci-dessus).
  // `reinitialiserPoints` réapplique aussi `setPoints([])`, mais c'est un
  // no-op sur un tableau déjà vide.
  useEffect(() => {
    if (points.length === 0) {
      setTopologie(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length])

  // Toujours une réinitialisation complète, jamais un filtrage partiel :
  // retirer uniquement le départ laisserait un point orphelin `destination`
  // sans départ, et le clic suivant (branche `destinationExistante` de
  // `poserPoint`) le rejouerait en un second point `destination` -- deux
  // marqueurs partageant la même clé, plus aucun départ possible, et l'effet
  // de calcul auto (qui exige `depart` ET `destination`) durablement bloqué.
  function reinitialiserPoints() {
    setPoints([])
    setTopologie(undefined)
    setTrace([])
    setMetriques(undefined)
    // Un nouveau parcours repart toujours bulle repliée -- l'état déployé
    // du précédent parcours n'a plus de sens une fois ses métriques
    // effacées ci-dessus.
    setBulleMetriquesDepliee(false)
    setErreurCalcul(undefined)
    setCalculEnCours(false)
    // Repart aussi à vide côté enregistrement (spec-2-6) : plus aucun
    // parcours persisté ne correspond à un plan tout juste réinitialisé.
    setParcoursId(undefined)
    setSaveFormOuvert(false)
    setNomSaisie('')
    setNoteSaisie('')
    setEtiquettesSaisie('')
    setEnregistrementEnCours(false)
    setErreurEnregistrement(undefined)
    setConfirmationEnregistrement(false)
    // Repart aussi à vide côté export (spec-2-7) : plus aucun parcours
    // persisté à exporter une fois le plan réinitialisé -- utilisé par
    // l'action « Nouveau parcours » de la confirmation d'export elle-même.
    setExportEnCours(false)
    setErreurExport(undefined)
    setConfirmationExport(undefined)
  }

  // Inversion du sens de parcours (spec-2-4) : Boucle et Aller simple
  // uniquement, jamais Multi-étapes (hors scope des AC de cette story, cf.
  // Boundaries). Forme fonctionnelle pour le contenu des points, comme les
  // autres mutateurs ci-dessus : dérive `departActuel`/`pointsDePassageActuels`/
  // `destinationActuelle` de `precedent`, jamais des closures `depart`/
  // `pointsDePassage`/`destination` du corps du composant, pour rester
  // correct même si deux inversions (ou une inversion et une autre édition)
  // sont déclenchées avant un re-rendu -- seul le branchement par topologie
  // lit encore `topologie` (closure), sans risque : contrairement à `points`,
  // rien dans ce composant ne mute la topologie active en dehors d'un choix
  // explicite de l'utilisateur ou d'un reset complet.
  // Les `id` de chaque point sont conservés -- seuls l'ordre et, en aller
  // simple, le rôle des deux extrémités changent (cf. Boundaries).
  function inverserSens() {
    if (!topologie) return
    setPoints((precedent) => inverserPoints(precedent, topologie))
    setRevisionInversion((precedente) => precedente + 1)
  }

  // Bouton "Inverser" visible seulement Boucle (≥1 Point de passage) / Aller
  // simple (Destination qualifiée) -- jamais Multi-étapes ni topologie
  // incomplète (cf. matrice I/O, "Bouton absent").
  const peutInverserSens =
    (topologie === 'boucle' && pointsDePassage.length > 0) || (topologie === 'aller_simple' && destination !== undefined)

  // Signature primitive de `pointsCalcul` (jamais l'objet/tableau lui-même,
  // recréé à chaque render) : seule une valeur qui change réellement doit
  // redéclencher l'effet, comme pour `premierPointPose` ci-dessus.
  const cleCalcul = pointsCalcul?.map((point) => `${point.lat}:${point.lon}`).join('|')

  // Calcul déclenché automatiquement dès que la topologie active a assez de
  // points qualifiés (cf. `pointsCalcul` ci-dessus), sans aucun paramètre
  // sportif (cf. Boundaries de la spec).
  useEffect(() => {
    if (!pointsCalcul) {
      // Une édition (suppression de la Destination, par ex.) peut rendre la
      // topologie active incomplète sans jamais vider `points` -- le dernier
      // tracé calculé décrirait alors des points qui n'existent plus sur la
      // carte. Ne rien faire ici le laisserait affiché indéfiniment.
      setTrace((precedent) => (precedent.length > 0 ? [] : precedent))
      setMetriques(undefined)
      setErreurCalcul(undefined)
      setCalculEnCours(false)
      setParcoursId(undefined)
      setConfirmationExport(undefined)
      setErreurExport(undefined)
      return
    }
    if (ignorerPremierCalculRef.current) {
      // Parcours préchargé (réouverture, spec-2-6) : trace/métriques/
      // parcoursId viennent déjà de la persistance -- ne consomme ce
      // court-circuit qu'une seule fois, au tout premier passage.
      ignorerPremierCalculRef.current = false
      return
    }
    // Toute édition qui relance ce calcul invalide immédiatement le
    // `parcoursId` courant (spec-2-6, Design Notes) : le tracé/les
    // métriques affichés restent ceux d'avant (patron `trace` ci-dessus),
    // mais rien ne doit pouvoir être enregistré tant que le nouveau calcul
    // n'a pas abouti à son tour. Une confirmation/erreur d'enregistrement
    // affichée avant cette édition ne décrit plus le tracé courant -- sans
    // ce reset, "Parcours enregistré." resterait affiché à côté d'un bouton
    // "Enregistrer" redevenu désactivé, laissant croire à tort que la
    // dernière édition est déjà sauvegardée (revue de code post-implémentation).
    setParcoursId(undefined)
    setConfirmationEnregistrement(false)
    setErreurEnregistrement(undefined)
    // Même raisonnement côté export (spec-2-7) : une confirmation/erreur
    // d'export affichée avant cette édition ne décrit plus le tracé courant.
    setConfirmationExport(undefined)
    setErreurExport(undefined)
    const aEnvoyer = pointsCalcul
    let annule = false
    // Un point posé de nouveau (ou le démontage) avant la fin de ce calcul
    // annule la requête en vol côté réseau, pas seulement côté affichage :
    // sans ça, un recalcul déjà obsolète continuait quand même à solliciter
    // Valhalla pour rien (aggrave aussi le risque de débit côté Nominatim,
    // même préoccupation que sur la recherche ci-dessous).
    const controleur = new AbortController()

    async function lancerCalcul(points: PointAtelier[]) {
      setCalculEnCours(true)
      setErreurCalcul(undefined)
      try {
        const resultat = await calculerParcours(
          points.map((point) => ({ lat: point.lat, lon: point.lon })),
          { signal: controleur.signal },
        )
        if (annule) {
          return
        }
        if (resultat.statut === 'non_route' && resultat.pointsNonRoutes.length === 0) {
          throw new Error("Réponse de calcul incohérente : aucun point non routé n'est identifié.")
        }
        const nonRoutes = new Set(resultat.pointsNonRoutes.map((point) => `${point.lat}:${point.lon}`))
        setPoints((precedent) =>
          precedent.map((point) => ({ ...point, nonRoute: nonRoutes.has(`${point.lat}:${point.lon}`) })),
        )
        // Un point non routé signale l'absence de tracé exploitable : jamais
        // de segment direct de repli affiché à sa place (cf. matrice I/O).
        setTrace(resultat.statut === 'routed' ? resultat.geometrie : [])
        // Même garde : aucune métrique affichée hors statut "routed" (cf.
        // matrice I/O de la spec-2-5).
        setMetriques(resultat.statut === 'routed' ? resultat.metriques : undefined)
        // Même garde (spec-2-6) : seul un parcours routé est enregistrable
        // (Boundaries de la spec), `parcoursId` reste `undefined` sinon --
        // le bouton "Enregistrer" y reste alors désactivé.
        setParcoursId(resultat.statut === 'routed' ? resultat.id : undefined)
      } catch (error) {
        if (annule) {
          return
        }
        if (estErreurAnnulation(error)) {
          return
        }
        // Le dernier tracé valide (`trace`) n'est jamais effacé ici : un
        // échec de recalcul ne doit pas faire disparaître un tracé affiché
        // avec succès juste avant (cf. matrice I/O).
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpiree?.()
        } else if (error instanceof ApiError) {
          setErreurCalcul(error.message)
        } else {
          setErreurCalcul("Une erreur inattendue s'est produite. Réessayez plus tard.")
        }
      } finally {
        if (!annule) {
          setCalculEnCours(false)
        }
      }
    }

    lancerCalcul(aEnvoyer)

    return () => {
      annule = true
      controleur.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleCalcul, revisionInversion])

  async function lancerRecherche(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requete = recherche.trim()
    if (!requete || rechercheEnCours) {
      return
    }
    // Une recherche déjà en vol (ne devrait pas arriver avec le bouton
    // désactivé pendant `rechercheEnCours`, mais reste possible au
    // démontage) est annulée avant d'en lancer une nouvelle : jamais deux
    // requêtes Nominatim concurrentes pour la même recherche.
    rechercheControleurRef.current?.abort()
    const controleur = new AbortController()
    rechercheControleurRef.current = controleur

    setRechercheEnCours(true)
    setErreurRecherche(undefined)
    try {
      const resultats = await rechercherAdresse(requete, { signal: controleur.signal })
      setResultatsRecherche(resultats)
    } catch (error) {
      if (estErreurAnnulation(error)) {
        return
      }
      setResultatsRecherche(undefined)
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpiree?.()
      } else {
        setErreurRecherche(
          error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
        )
      }
    } finally {
      if (!controleur.signal.aborted) {
        setRechercheEnCours(false)
      }
    }
  }

  // Recherche = focaliser la carte sur le lieu trouvé, jamais poser un point
  // à sa place (UX-DR17) : à l'utilisateur de cliquer ensuite pour placer le
  // point exactement où il le souhaite, la recherche n'étant qu'un moyen de
  // s'y rendre rapidement.
  function choisirResultatRecherche(resultat: ResultatAdresse) {
    setErreurRecherche(undefined)
    setResultatsRecherche(undefined)
    setRecherche('')
    setFocusRecherche([resultat.lat, resultat.lon])
  }

  // Enregistrement dans la bibliothèque (spec-2-6, UX-DR22) : `PATCH` sur le
  // parcours courant identifié par `parcoursId` -- ne recalcule jamais rien.
  // Nom/note/étiquettes restent affichés tels quels après l'appel, succès
  // comme échec (cf. matrice I/O : "nom, note et étiquettes sont conservés
  // et je peux réessayer").
  async function soumettreEnregistrement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!parcoursId || enregistrementEnCours) {
      return
    }
    const idEnregistre = parcoursId
    const nom = nomSaisie.trim()
    if (!nom) {
      setErreurEnregistrement('Le nom est obligatoire pour enregistrer le parcours.')
      return
    }
    const etiquettes = etiquettesSaisie
      .split(',')
      .map((etiquette) => etiquette.trim())
      .filter((etiquette) => etiquette.length > 0)
    setEnregistrementEnCours(true)
    setErreurEnregistrement(undefined)
    try {
      await enregistrerParcours(idEnregistre, { nom, note: noteSaisie.trim() || undefined, etiquettes })
      if (parcoursIdRef.current === idEnregistre) {
        setConfirmationEnregistrement(true)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpiree?.()
        return
      }
      if (parcoursIdRef.current === idEnregistre) {
        setErreurEnregistrement(
          error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
        )
      }
    } finally {
      setEnregistrementEnCours(false)
    }
  }

  // Export GPX (spec-2-7) : `POST /api/routes/{id}/export` relit le tracé/le
  // profil déjà persistés, ne recalcule jamais rien -- même garde que
  // `soumettreEnregistrement` ci-dessus (`parcoursId` défini). Le
  // téléchargement est déclenché ici, côté client, via un lien `<a
  // download>` temporaire : c'est le seul mécanisme fiable pour faire
  // télécharger un `Blob` déjà en mémoire sans navigation ni requête réseau
  // supplémentaire.
  async function lancerExport() {
    if (!parcoursId || exportEnCours) {
      return
    }
    const idExporte = parcoursId
    setExportEnCours(true)
    setErreurExport(undefined)
    try {
      const { blob, nomFichier } = await exporterParcours(idExporte)
      // Le parcours a pu être édité/réinitialisé pendant la requête :
      // ne jamais télécharger ni confirmer l'ancien tracé dans la nouvelle
      // vue. Le backend conserve normalement l'historique de la requête qui
      // a bien abouti, mais sa réponse devenue obsolète est ignorée ici.
      if (parcoursIdRef.current !== idExporte) {
        return
      }
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = nomFichier
      try {
        document.body.appendChild(lien)
        lien.click()
      } finally {
        lien.remove()
        // Le clic ne garantit pas que tous les navigateurs ont déjà
        // consommé le Blob. La révocation au prochain tour de boucle garde
        // l'URL assez longtemps tout en assurant son nettoyage.
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      setConfirmationExport({ nomFichier })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpiree?.()
        return
      }
      // Aucun téléchargement déclenché, le parcours reste intact (cf.
      // matrice I/O : "Réessayer proposé, formulaire non perdu").
      setErreurExport(
        error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
      )
    } finally {
      setExportEnCours(false)
    }
  }

  const pointsNonRoutes = points.filter((point) => point.nonRoute)

  return (
    <main className="atelier">
      <div className="atelier__panneau">
        <div className="atelier__entete">
          <h1>Atelier</h1>
          <button type="button" className="atelier__retour" onClick={onRetourAccueil}>
            ‹ Accueil
          </button>
        </div>

        <form className="atelier__recherche" onSubmit={lancerRecherche}>
          <label htmlFor="atelier-recherche">Rechercher une adresse</label>
          <div className="atelier__recherche-ligne">
            <input
              id="atelier-recherche"
              type="text"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Adresse, ville, lieu-dit…"
            />
            <button type="submit" disabled={rechercheEnCours}>
              {rechercheEnCours ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>
          {erreurRecherche && (
            <p role="alert" className="atelier__erreur">
              {erreurRecherche}
            </p>
          )}
          {resultatsRecherche && resultatsRecherche.length === 0 && <p>Aucun lieu trouvé.</p>}
          {resultatsRecherche && resultatsRecherche.length > 0 && (
            <ul className="atelier__resultats">
              {resultatsRecherche.map((resultat) => (
                <li key={`${resultat.lat}-${resultat.lon}`}>
                  <button type="button" onClick={() => choisirResultatRecherche(resultat)}>
                    {resultat.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Départ posé, topologie pas encore choisie : le Contextual menu
            l'impose avant tout autre point (jamais de valeur par défaut
            implicite, cf. Boundaries). */}
        {depart && !topologie && (
          <div className="atelier__menu-contextuel" role="region" aria-label="Choix de la topologie">
            <p>Départ posé.</p>
            <p className="atelier__topologie">Topologie</p>
            <p>Choisissez une topologie avant de poser un autre point :</p>
            <div className="atelier__topologie-choix" role="group" aria-label="Topologie">
              <button type="button" onClick={() => setTopologie('boucle')}>
                Boucle
              </button>
              <button type="button" onClick={() => setTopologie('aller_simple')}>
                Aller simple
              </button>
              <button type="button" onClick={() => setTopologie('multi_etapes')}>
                Multi-étapes
              </button>
            </div>
            <button type="button" className="atelier__actions-supprimer" onClick={() => supprimerPoint(depart.id)}>
              Supprimer le Départ
            </button>
          </div>
        )}

        {/* Topologie choisie : le menu de choix se ferme, remplacé par le
            statut de la topologie active -- seuls les rôles applicables à
            cette topologie sont affichés (cf. matrice I/O). */}
        {depart && topologie && (
          <div className="atelier__menu-contextuel" role="region" aria-label="Parcours en cours">
            <p className="atelier__topologie">
              Topologie : <strong>{libelleTopologie(topologie)}</strong>
            </p>
            {topologie === 'boucle' && (
              <p>
                Chaque point posé devient un Point de passage ; le départ ferme la boucle automatiquement au calcul.
              </p>
            )}
            {topologie === 'aller_simple' && !destination && (
              <p>Placez une destination sur la carte ou via la recherche pour calculer le tracé.</p>
            )}
            {topologie === 'multi_etapes' && !destination && (
              <p>
                Placez des points de passage, puis qualifiez l'un d'eux « Destination » pour déclencher le calcul.
              </p>
            )}
            {limitePointsAtteinte && (
              <p role="status">Limite de {MAX_POINTS_CALCUL} points atteinte pour ce parcours.</p>
            )}

            {/* Boucle (≥1 Point de passage) / Aller simple (Destination
                qualifiée) uniquement -- jamais Multi-étapes, hors scope des
                AC de cette story (spec-2-4). */}
            {peutInverserSens && (
              <button type="button" className="atelier__inverser" onClick={inverserSens}>
                Inverser
              </button>
            )}

            {/* > 0, pas > 1 : le Départ seul doit rester supprimable via son
                propre bouton (retour à l'état vide, cf. Design Notes
                spec-2-3), pas seulement une fois un second point posé. */}
            {points.length > 0 && (
              <ul className="atelier__points">
                {points.map((point, index) => {
                  // Réordonnancement jamais sur Départ ni Destination
                  // (positions fixes, cf. Boundaries) -- boutons ↑/↓
                  // affichés uniquement pour les autres rôles.
                  const peutReordonner = point.role !== 'depart' && point.role !== 'destination'
                  const voisinPrecedent = points[index - 1]
                  const voisinSuivant = points[index + 1]
                  const peutMonter =
                    peutReordonner &&
                    voisinPrecedent !== undefined &&
                    voisinPrecedent.role !== 'depart' &&
                    voisinPrecedent.role !== 'destination'
                  const peutDescendre =
                    peutReordonner &&
                    voisinSuivant !== undefined &&
                    voisinSuivant.role !== 'depart' &&
                    voisinSuivant.role !== 'destination'
                  const libellePoint = libellePointAccessible(point)
                  return (
                    <li key={point.id}>
                      {libelleRole(point.role)}
                      {point.numero !== undefined && ` ${point.numero}`}
                      {peutQualifierDernierPoint && point.id === dernierPoint.id && (
                        <span className="atelier__qualification" role="group" aria-label="Qualifier ce point">
                          <button type="button" onClick={() => qualifierDernierPoint('etape_utilisateur')}>
                            Étape utilisateur
                          </button>
                          <button type="button" onClick={() => qualifierDernierPoint('destination')}>
                            Destination
                          </button>
                        </span>
                      )}
                      <span className="atelier__actions" role="group" aria-label={`Actions sur ${libellePoint}`}>
                        {peutReordonner && (
                          <>
                            <button
                              type="button"
                              onClick={() => reordonnerPoint(point.id, -1)}
                              aria-label={`Monter ${libellePoint}`}
                              disabled={!peutMonter}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => reordonnerPoint(point.id, 1)}
                              aria-label={`Descendre ${libellePoint}`}
                              disabled={!peutDescendre}
                            >
                              ↓
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="atelier__actions-supprimer"
                          onClick={() => supprimerPoint(point.id)}
                          aria-label={`Supprimer ${libellePoint}`}
                        >
                          Supprimer
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {calculEnCours && (
          <p role="status" className="atelier__statut">
            {/* "Calcul du parcours…" réservé au tout premier calcul ; dès
                qu'un tracé est déjà affiché, un recalcul (édition) affiche
                "Mise à jour…" à la place (cf. Boundaries, NFR-4). */}
            {trace.length > 0 ? 'Mise à jour…' : 'Calcul du parcours…'}
          </p>
        )}

        {erreurCalcul && (
          <p role="alert" className="atelier__erreur">
            {erreurCalcul}
          </p>
        )}

        {/* Résumé persistant (AC4) : accessible tant qu'un parcours routé
            existe, y compris pendant un recalcul ("Mise à jour…" ci-dessus
            reste affiché en même temps, jamais de métrique effacée pendant
            l'attente -- cf. Boundaries de la spec-2-5). */}
        {metriques && (
          <BulleMetriques
            metriques={metriques}
            depliee={bulleMetriquesDepliee}
            onBasculer={() => setBulleMetriquesDepliee((precedent) => !precedent)}
          />
        )}

        {/* Enregistrement dans la bibliothèque (spec-2-6, UX-DR22) : visible
            dès qu'un tracé est affiché, désactivé tant qu'aucun parcours
            persisté ne correspond exactement au tracé courant (recalcul en
            cours ou tracé non routé, cf. `parcoursId` ci-dessus). */}
        {trace.length > 0 && (
          <div className="atelier__enregistrement-zone">
            {!saveFormOuvert && (
              <button
                type="button"
                className="atelier__ouvrir-enregistrement"
                onClick={() => {
                  setErreurEnregistrement(undefined)
                  setConfirmationEnregistrement(false)
                  setSaveFormOuvert(true)
                }}
                disabled={parcoursId === undefined}
              >
                Enregistrer
              </button>
            )}

            {saveFormOuvert && (
              <form
                className="atelier__enregistrement"
                onSubmit={soumettreEnregistrement}
                aria-label="Enregistrer le parcours"
              >
                <div className="atelier__enregistrement-entete">
                  <p className="atelier__section-titre">Enregistrer dans ma bibliothèque</p>
                  <button
                    type="button"
                    className="atelier__enregistrement-fermer"
                    onClick={() => {
                      setErreurEnregistrement(undefined)
                      setConfirmationEnregistrement(false)
                      setSaveFormOuvert(false)
                    }}
                    aria-label="Fermer le formulaire d'enregistrement"
                  >
                    ×
                  </button>
                </div>

                <label htmlFor="atelier-nom">Nom</label>
                <input
                  id="atelier-nom"
                  type="text"
                  value={nomSaisie}
                  maxLength={200}
                  required
                  onChange={(event) => {
                    setNomSaisie(event.target.value)
                    setErreurEnregistrement(undefined)
                    setConfirmationEnregistrement(false)
                  }}
                />

                <label htmlFor="atelier-note">Note (facultative)</label>
                <textarea
                  id="atelier-note"
                  value={noteSaisie}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => {
                    setNoteSaisie(event.target.value)
                    setErreurEnregistrement(undefined)
                    setConfirmationEnregistrement(false)
                  }}
                />

                <label htmlFor="atelier-etiquettes">Étiquettes (séparées par des virgules)</label>
                <input
                  id="atelier-etiquettes"
                  type="text"
                  value={etiquettesSaisie}
                  placeholder="ex. gravel, weekend"
                  onChange={(event) => {
                    setEtiquettesSaisie(event.target.value)
                    setErreurEnregistrement(undefined)
                    setConfirmationEnregistrement(false)
                  }}
                />

                {erreurEnregistrement && (
                  <p role="alert" className="atelier__erreur">
                    {erreurEnregistrement}
                  </p>
                )}
                {confirmationEnregistrement && (
                  <p role="status" className="atelier__confirmation">
                    Parcours enregistré.
                  </p>
                )}

                <button type="submit" disabled={enregistrementEnCours || parcoursId === undefined}>
                  {enregistrementEnCours ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Export GPX (spec-2-7) : visible dès qu'un tracé est affiché,
            actif dès `parcoursId` défini -- même garde que « Enregistrer »
            ci-dessus, un GPX se génère depuis un parcours persisté. Aucun
            formulaire (contrairement au Save form) : l'export n'a besoin
            d'aucune saisie, un clic suffit à déclencher le téléchargement. */}
        {trace.length > 0 && (
          <div className="atelier__export-zone">
            {!confirmationExport && (
              <button
                type="button"
                className="atelier__exporter"
                onClick={lancerExport}
                disabled={exportEnCours || parcoursId === undefined}
              >
                {exportEnCours ? 'Export…' : erreurExport ? 'Réessayer' : 'Exporter'}
              </button>
            )}

            {erreurExport && (
              <p role="alert" className="atelier__erreur">
                {erreurExport}
              </p>
            )}

            {confirmationExport && (
              <div className="atelier__confirmation-export">
                <p role="status" className="atelier__confirmation">
                  Fichier « {confirmationExport.nomFichier} » exporté.
                </p>
                <div className="atelier__confirmation-export-actions">
                  {/* « Revenir » referme simplement la confirmation, sans
                      toucher au tracé/aux persistances (AC2 de la spec). */}
                  <button type="button" onClick={() => setConfirmationExport(undefined)}>
                    Revenir
                  </button>
                  <button type="button" onClick={reinitialiserPoints}>
                    Nouveau parcours
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {pointsNonRoutes.length > 0 && (
          <div className="atelier__bandeau-non-route" role="alert">
            <p>Point{pointsNonRoutes.length > 1 ? 's' : ''} non rattachable{pointsNonRoutes.length > 1 ? 's' : ''} au réseau routier connu.</p>
            <ul>
              {pointsNonRoutes.map((point) => (
                <li key={point.id}>{libelleRole(point.role)}</li>
              ))}
            </ul>
            {/* Une seule action, jamais une par point : retirer uniquement le
                point non routé laisserait l'autre orphelin (cf. commentaire
                de `reinitialiserPoints`) -- reposer les deux points après
                suppression est le seul chemin de correction sûr en V1. */}
            <p className="atelier__non-route-conseil">
              Supprimez les points posés pour recommencer, puis reposez-les ailleurs sur la carte ou via la recherche.
            </p>
            <button type="button" onClick={reinitialiserPoints}>
              Supprimer
            </button>
          </div>
        )}
      </div>

      <div className="atelier__carte-conteneur">
        <MapContainer center={CENTRE_PAR_DEFAUT} zoom={ZOOM_PAR_DEFAUT} className="atelier__carte">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <EcouteurClicCarte onClic={poserPoint} />
          <RecentrageInitial centre={premierPointPose} />
          <RecentrageRecherche centre={focusRecherche} />
          {parcoursAOuvrir && (
            <RecentrageParcoursOuvert
              points={(parcoursAOuvrir.geometrie ?? []).map((point) => [point.lat, point.lon])}
            />
          )}
          {points.map((point) => (
            <Marker
              // `numero` inclus dans la clé (pas seulement `point.id`) :
              // force React à démonter/remonter le marqueur plutôt que de
              // laisser react-leaflet appeler `setIcon(...)` en place sur un
              // `Marker` `draggable` quand le point change de rôle (numéro
              // qui apparaît/disparaît, cf. `icôneNumerotee`) -- l'échange
              // d'icône en place sur un marqueur déplaçable est justement ce
              // qui plantait Leaflet.
              key={`${point.id}:${point.numero ?? 'defaut'}`}
              position={[point.lat, point.lon]}
              // Prop `icon` totalement omise (jamais `icon={undefined}`)
              // quand il n'y a pas de numéro : Leaflet fusionne les options
              // du marqueur par `for...in` (`L.Util.setOptions`), donc une
              // valeur `undefined` explicite masque quand même l'icône par
              // défaut héritée du prototype -- `this.options.icon` devient
              // littéralement `undefined`, d'où le crash `createIcon` sur
              // `undefined` pour Départ/Destination.
              {...(point.numero !== undefined ? { icon: icôneNumerotee(point.numero) } : {})}
              draggable
              eventHandlers={{
                // Patron `Marker draggable` natif de react-leaflet (cf.
                // Design Notes) : `dragend` porte la position finale sur
                // `event.target` (le marqueur Leaflet lui-même), pas sur
                // l'événement -- pas de `useState` intermédiaire, la nouvelle
                // position est lue directement depuis l'instance.
                dragend: (event) => {
                  const { lat, lng } = (event.target as L.Marker).getLatLng()
                  deplacerPoint(point.id, lat, lng)
                },
              }}
            />
          ))}
          {trace.length > 0 && <Polyline positions={trace.map((point) => [point.lat, point.lon])} />}
        </MapContainer>
      </div>
    </main>
  )
}
