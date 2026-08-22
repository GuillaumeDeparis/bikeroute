import { useEffect } from 'react'
import { ApiError, getSession } from '../api/client'
import './Accueil.css'

// La session n'est pas glissante (cf. backend `session_duration_days`) et
// rien d'autre sur cette page n'appelle l'API entre-temps : sans ce poll
// périodique, une expiration survenant pendant que l'utilisateur reste sur
// l'Accueil ne serait jamais détectée avant un rechargement complet.
const INTERVALLE_VERIFICATION_SESSION_MS = 30_000

interface AccueilProps {
  identifiant: string
  onSessionExpiree: () => void
}

export function Accueil({ identifiant, onSessionExpiree }: AccueilProps) {
  useEffect(() => {
    let annule = false
    let intervalId: number | undefined

    async function verifierSession() {
      try {
        await getSession()
      } catch (error) {
        if (annule) {
          return
        }
        // Seule une session réellement invalide (401) doit ramener à
        // Connexion : une panne réseau/serveur transitoire ne doit pas
        // déconnecter un utilisateur dont la session est toujours valide.
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpiree()
        } else {
          console.warn('Vérification de session impossible (réessayez plus tard).', error)
        }
      }
    }

    function demarrerIntervalle() {
      if (intervalId !== undefined) {
        return
      }
      intervalId = window.setInterval(verifierSession, INTERVALLE_VERIFICATION_SESSION_MS)
    }

    function arreterIntervalle() {
      if (intervalId === undefined) {
        return
      }
      window.clearInterval(intervalId)
      intervalId = undefined
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        // Onglet en arrière-plan : inutile de sonder l'API pendant ce temps.
        arreterIntervalle()
      } else {
        // Onglet redevenu visible : vérification immédiate (la session a pu
        // expirer pendant l'absence), puis reprise du sondage régulier.
        verifierSession()
        demarrerIntervalle()
      }
    }

    // Vérification au montage (ex. onglet resté ouvert au-delà de
    // l'expiration), puis à intervalle régulier tant que l'Accueil est
    // affiché et visible.
    verifierSession()
    demarrerIntervalle()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      annule = true
      arreterIntervalle()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [onSessionExpiree])

  return (
    <main className="accueil">
      <h1>Accueil</h1>
      <p>Connecté en tant que {identifiant}.</p>
    </main>
  )
}
