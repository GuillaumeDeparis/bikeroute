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

/** Recentre la carte quand un nouveau point est posé, sans forcer de zoom
 * une fois que l'utilisateur a déjà pu ajuster la vue (uniquement au premier
 * point, pour ne pas lui arracher la carte des mains ensuite). */
function RecentrageInitial({ centre }: { centre: [number, number] | null }) {
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
  if (depart && topologie === 'aller_simple' && destination) {
    pointsCalcul = [depart, destination]
  } else if (depart && topologie === 'boucle' && pointsDePassage.length > 0) {
    // Fermeture de boucle par simple répétition du départ en fin de liste
    // (aucun itinéraire de retour "intelligent" recherché, cf. Never).
    pointsCalcul = [...points, depart]
  } else if (depart && topologie === 'multi_etapes' && destination) {
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
      if (topologie === 'aller_simple') {
        // Comportement 2.1 conservé : 2e point = Destination, 3e ignoré.
        if (precedent.length === 1) {
          return [...precedent, { id: crypto.randomUUID(), role: 'destination', lat, lon, nonRoute: false }]
        }
        return precedent
      }
      if (topologie === 'boucle') {
        // Jamais de Destination en boucle ; aucun verrouillage, chaque clic
        // ajoute un Point de passage (cf. Boundaries).
        return [...precedent, { id: crypto.randomUUID(), role: 'point_de_passage', lat, lon, nonRoute: false }]
      }
      // Multi-étapes : verrouillage dès qu'une Destination est qualifiée
      // (même règle que le 3e point de l'aller simple, cf. Design Notes).
      const destinationDejaQualifiee = precedent.some((point) => point.role === 'destination')
      if (destinationDejaQualifiee) {
        return precedent
      }
      return [...precedent, { id: crypto.randomUUID(), role: 'point_de_passage', lat, lon, nonRoute: false }]
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

  // Toujours une réinitialisation complète, jamais un filtrage partiel :
  // retirer uniquement le départ laisserait un point orphelin `destination`
  // sans départ, et le clic suivant (branche `precedent.length === 1` de
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

  function choisirResultatRecherche(resultat: ResultatAdresse) {
    poserPoint(resultat.lat, resultat.lon)
    setRecherche('')
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

            {points.length > 1 && (
              <ul className="atelier__points">
                {points.map((point) => (
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {calculEnCours && (
          <p role="status" className="atelier__statut">
            Calcul du parcours…
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
          {points.map((point) => (
            <Marker key={point.id} position={[point.lat, point.lon]} />
          ))}
          {trace.length > 0 && <Polyline positions={trace.map((point) => [point.lat, point.lon])} />}
        </MapContainer>
      </div>
    </main>
  )
}
