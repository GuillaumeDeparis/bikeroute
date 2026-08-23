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

type Role = 'depart' | 'destination'

interface PointAtelier {
  role: Role
  lat: number
  lon: number
  nonRoute: boolean
}

function libelleRole(role: Role): string {
  return role === 'depart' ? 'Départ' : 'Destination'
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
        return [{ role: 'depart', lat, lon, nonRoute: false }]
      }
      if (precedent.length === 1) {
        return [...precedent, { role: 'destination', lat, lon, nonRoute: false }]
      }
      // Boucle/multi-étapes hors scope (Story 2.2) : un 3e point est ignoré.
      return precedent
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
    setTrace([])
    setErreurCalcul(undefined)
  }

  // Calcul déclenché automatiquement dès que départ + destination sont
  // posés, sans aucun paramètre sportif (cf. Boundaries de la spec).
  useEffect(() => {
    if (!depart || !destination) {
      return
    }
    let annule = false
    // Un point posé de nouveau (ou le démontage) avant la fin de ce calcul
    // annule la requête en vol côté réseau, pas seulement côté affichage :
    // sans ça, un recalcul déjà obsolète continuait quand même à solliciter
    // Valhalla pour rien (aggrave aussi le risque de débit côté Nominatim,
    // même préoccupation que sur la recherche ci-dessous).
    const controleur = new AbortController()

    async function lancerCalcul(depart: PointAtelier, destination: PointAtelier) {
      setCalculEnCours(true)
      setErreurCalcul(undefined)
      try {
        const resultat = await calculerParcours(
          [
            { lat: depart.lat, lon: depart.lon },
            { lat: destination.lat, lon: destination.lon },
          ],
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

    lancerCalcul(depart, destination)

    return () => {
      annule = true
      controleur.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart?.lat, depart?.lon, destination?.lat, destination?.lon])

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

        {depart && !destination && (
          <div className="atelier__menu-contextuel" role="region" aria-label="Choix de la topologie">
            <p>Départ posé.</p>
            {/* Le choix complet de topologie (boucle/aller simple/multi-étapes)
                est hors scope de cette story (Story 2.2) : on se contente ici
                de le nommer, sans UI de sélection dédiée. */}
            <p className="atelier__topologie">
              Topologie : <strong>Aller simple</strong> (autres topologies bientôt disponibles)
            </p>
            <p>Placez une destination sur la carte ou via la recherche pour calculer le tracé.</p>
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
                <li key={point.role}>{libelleRole(point.role)}</li>
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
            <Marker key={point.role} position={[point.lat, point.lon]} />
          ))}
          {trace.length > 0 && <Polyline positions={trace.map((point) => [point.lat, point.lon])} />}
        </MapContainer>
      </div>
    </main>
  )
}
