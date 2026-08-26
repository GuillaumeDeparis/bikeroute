import { useEffect, useState } from 'react'
import { ApiError, listerParcours, obtenirParcours, type ParcoursResume, type ResultatParcours } from '../api/client'
import { formatDenivele, formatDistance, formatDuree, libelleDifficulte } from './Atelier.format'
import './MesParcours.css'

interface MesParcoursProps {
  onRetourAccueil: () => void
  /** Créer un nouveau parcours (état vide, cf. matrice I/O de la spec-2-6)
   * -- ouvre l'Atelier sans aucun préchargement, comme depuis l'Accueil. */
  onCreerParcours: () => void
  /** Réouverture d'un parcours choisi (spec-2-6) : la réponse complète du
   * `GET /api/routes/{id}` est transmise telle quelle, l'appelant (App.tsx)
   * la relaie à l'Atelier -- cette surface ne connaît rien de l'Atelier. */
  onOuvrirParcours: (parcours: ResultatParcours) => void
  onSessionExpiree?: () => void
}

type Etat = { statut: 'chargement' } | { statut: 'erreur'; message: string } | { statut: 'prete'; parcours: ParcoursResume[] }

/** « Mes parcours » (spec-2-6) : liste, ouvre et retrouve les parcours
 * enregistrés -- surface spine-only (UX-DR24), contrat textuel seulement,
 * aucune maquette dédiée requise (Design Notes de la spec). */
export function MesParcours({ onRetourAccueil, onCreerParcours, onOuvrirParcours, onSessionExpiree }: MesParcoursProps) {
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' })
  // Incrémenté par "Réessayer" (état erreur) pour redéclencher le
  // chargement -- même patron que `App.tsx` (vue `resolution-erreur`). L'état
  // "chargement" est reposé par le clic lui-même (pas au sommet de l'effet
  // ci-dessous, cf. `reessayer`) : un `setState` synchrone en tête d'effet
  // déclencherait un rendu en cascade évitable.
  const [tentative, setTentative] = useState(0)
  const [idEnOuverture, setIdEnOuverture] = useState<string | undefined>(undefined)
  const [erreurOuverture, setErreurOuverture] = useState<string | undefined>(undefined)

  function reessayer() {
    setEtat({ statut: 'chargement' })
    setTentative((valeur) => valeur + 1)
  }

  useEffect(() => {
    let annule = false
    listerParcours()
      .then((parcours) => {
        if (!annule) {
          setEtat({ statut: 'prete', parcours })
        }
      })
      .catch((error: unknown) => {
        if (annule) {
          return
        }
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpiree?.()
          return
        }
        setEtat({
          statut: 'erreur',
          message:
            error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
        })
      })
    return () => {
      annule = true
    }
  }, [tentative, onSessionExpiree])

  async function ouvrir(id: string) {
    if (idEnOuverture) {
      return
    }
    setIdEnOuverture(id)
    setErreurOuverture(undefined)
    try {
      const parcours = await obtenirParcours(id)
      onOuvrirParcours(parcours)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpiree?.()
        return
      }
      setErreurOuverture(
        error instanceof ApiError ? error.message : "Une erreur inattendue s'est produite. Réessayez plus tard.",
      )
    } finally {
      setIdEnOuverture(undefined)
    }
  }

  return (
    <main className="mes-parcours">
      <div className="mes-parcours__entete">
        <h1>Mes parcours</h1>
        <button type="button" className="mes-parcours__retour" onClick={onRetourAccueil}>
          ‹ Accueil
        </button>
      </div>

      {etat.statut === 'chargement' && <p role="status">Chargement de vos parcours…</p>}

      {etat.statut === 'erreur' && (
        <div className="mes-parcours__erreur" role="alert">
          <p>{etat.message}</p>
          <button type="button" onClick={reessayer}>
            Réessayer
          </button>
        </div>
      )}

      {etat.statut === 'prete' && etat.parcours.length === 0 && (
        <div className="mes-parcours__vide">
          <p>Aucun parcours enregistré.</p>
          <button type="button" className="mes-parcours__cta" onClick={onCreerParcours}>
            Créer un parcours
          </button>
        </div>
      )}

      {etat.statut === 'prete' && etat.parcours.length > 0 && (
        <>
          {erreurOuverture && (
            <p role="alert" className="mes-parcours__erreur-ouverture">
              {erreurOuverture}
            </p>
          )}
          <ul className="mes-parcours__liste">
            {etat.parcours.map((parcours) => (
              <li key={parcours.id} className="mes-parcours__item">
                <button
                  type="button"
                  className="mes-parcours__ouvrir"
                  onClick={() => ouvrir(parcours.id)}
                  disabled={idEnOuverture !== undefined}
                >
                  <span className="mes-parcours__nom">
                    {idEnOuverture === parcours.id ? 'Ouverture…' : parcours.nom}
                  </span>
                  {parcours.note && <span className="mes-parcours__note">{parcours.note}</span>}
                  <span className="mes-parcours__metriques">
                    {parcours.distanceM !== undefined && <span>{formatDistance(parcours.distanceM)}</span>}
                    {parcours.denivelePositifM !== undefined && <span>{formatDenivele(parcours.denivelePositifM)} D+</span>}
                    {parcours.dureeS !== undefined && <span>{formatDuree(parcours.dureeS)}</span>}
                    {parcours.difficulte && <span>{libelleDifficulte(parcours.difficulte)}</span>}
                  </span>
                  {parcours.etiquettes.length > 0 && (
                    <span className="mes-parcours__etiquettes">
                      {parcours.etiquettes.map((etiquette) => (
                        <span key={etiquette} className="mes-parcours__etiquette">
                          {etiquette}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
