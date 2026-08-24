import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { ApiError, calculerParcours, rechercherAdresse, type PointCoordonnee, type ResultatAdresse } from '../api/client'
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

type Role = 'depart' | 'point_de_passage' | 'etape_utilisateur' | 'destination'

/** Boucle : pas de Destination, chaque point posé après le départ est un
 * Point de passage, fermeture par répétition du départ en fin de liste.
 * Aller simple : comportement 2.1 inchangé. Multi-étapes : chaque point naît
 * Point de passage puis se qualifie une fois via le sélecteur inline (cf.
 * Design Notes de la spec). */
type Topologie = 'boucle' | 'aller_simple' | 'multi_etapes'

interface PointAtelier {
  // Identifiant stable (pas le seul `role`, partagé par plusieurs Points de
  // passage en boucle/multi-étapes) -- clé React et bandeau non-routé.
  id: string
  role: Role
  lat: number
  lon: number
  nonRoute: boolean
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

interface AtelierProps {
  onRetourAccueil: () => void
}

export function Atelier({ onRetourAccueil }: AtelierProps) {
  const [points, setPoints] = useState<PointAtelier[]>([])
  // Choix imposé par le Contextual menu dès le départ posé -- jamais de
  // valeur par défaut implicite (cf. Boundaries de la spec-2-2).
  const [topologie, setTopologie] = useState<Topologie | undefined>(undefined)
  const [trace, setTrace] = useState<PointCoordonnee[]>([])
  const [calculEnCours, setCalculEnCours] = useState(false)
  const [erreurCalcul, setErreurCalcul] = useState<string | undefined>(undefined)

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
      if (topologie === 'boucle') {
        // Jamais de Destination en boucle ; aucun verrouillage, chaque clic
        // ajoute un Point de passage (cf. Boundaries).
        return [...precedent, { id: crypto.randomUUID(), role: 'point_de_passage', lat, lon, nonRoute: false }]
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
        })
      }
      // Multi-étapes : tant qu'aucune Destination n'est qualifiée, chaque
      // clic ajoute un Point de passage en fin de liste ; une fois
      // qualifiée, le nouveau point s'insère juste avant elle (même règle
      // que l'aller simple ci-dessus, spec-2-3).
      const destinationDejaQualifiee = precedent.some((point) => point.role === 'destination')
      if (!destinationDejaQualifiee) {
        return [...precedent, { id: crypto.randomUUID(), role: 'point_de_passage', lat, lon, nonRoute: false }]
      }
      return insererAvantDernier(precedent, {
        id: crypto.randomUUID(),
        role: 'point_de_passage',
        lat,
        lon,
        nonRoute: false,
      })
    })
  }

  // Qualifie le dernier point posé en Multi-étapes (sélecteur inline, une
  // seule fois -- pas de ré-édition ultérieure, cf. Design Notes).
  function qualifierDernierPoint(role: 'etape_utilisateur' | 'destination') {
    setPoints((precedent) => {
      if (precedent.length === 0) {
        return precedent
      }
      const dernierIndex = precedent.length - 1
      return precedent.map((point, index) => (index === dernierIndex ? { ...point, role } : point))
    })
  }

  // Déplacement d'un point existant (marqueur `draggable`, cf. `dragend`
  // sur `Marker` plus bas) : seules `lat`/`lon` changent, le reste (rôle,
  // `nonRoute`) est laissé tel quel -- le recalcul déclenché juste après
  // rafraîchira `nonRoute` avec la nouvelle position (cf. matrice I/O).
  function deplacerPoint(id: string, lat: number, lon: number) {
    setPoints((precedent) => precedent.map((point) => (point.id === id ? { ...point, lat, lon } : point)))
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
        return [{ ...nouveauDepart, role: 'depart' }, ...suite]
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
    setErreurCalcul(undefined)
  }

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
      setErreurCalcul(undefined)
      return
    }
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
        const nonRoutes = new Set(resultat.pointsNonRoutes.map((point) => `${point.lat}:${point.lon}`))
        setPoints((precedent) =>
          precedent.map((point) => ({ ...point, nonRoute: nonRoutes.has(`${point.lat}:${point.lon}`) })),
        )
        // Un point non routé signale l'absence de tracé exploitable : jamais
        // de segment direct de repli affiché à sa place (cf. matrice I/O).
        setTrace(resultat.statut === 'routed' ? resultat.geometrie : [])
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
        if (error instanceof ApiError) {
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
  }, [cleCalcul])

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
      setErreurRecherche(
        error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
      )
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

            {/* > 0, pas > 1 : le Départ seul doit rester supprimable via son
                propre bouton (retour à l'état vide, cf. Design Notes
                spec-2-3), pas seulement une fois un second point posé. */}
            {points.length > 0 && (
              <ul className="atelier__points">
                {points.map((point) => {
                  // Réordonnancement jamais sur Départ ni Destination
                  // (positions fixes, cf. Boundaries) -- boutons ↑/↓
                  // affichés uniquement pour les autres rôles.
                  const peutReordonner = point.role !== 'depart' && point.role !== 'destination'
                  return (
                    <li key={point.id}>
                      {libelleRole(point.role)}
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
                      <span className="atelier__actions" role="group" aria-label="Actions sur ce point">
                        {peutReordonner && (
                          <>
                            <button type="button" onClick={() => reordonnerPoint(point.id, -1)} aria-label="Monter">
                              ↑
                            </button>
                            <button type="button" onClick={() => reordonnerPoint(point.id, 1)} aria-label="Descendre">
                              ↓
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="atelier__actions-supprimer"
                          onClick={() => supprimerPoint(point.id)}
                          aria-label="Supprimer ce point"
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
          {points.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lon]}
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
