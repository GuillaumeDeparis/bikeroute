import { useEffect } from 'react'
import { ApiError, getSession } from '../api/client'
import { Skeleton } from '../components/Skeleton'
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
      <p className="accueil__session">Connecté en tant que {identifiant}.</p>

      {/* Aucune donnée de parcours ne peut exister avant l'Epic 2 : cet état
          "aucun parcours" est donc systématique, pas un cas parmi d'autres. */}
      <section className="accueil__etat-vide">
        <h2>Aucun parcours pour l'instant</h2>
        <p>Préparez votre premier parcours dans l'Atelier cartographique.</p>
        <button type="button" className="accueil__cta" aria-disabled="true" title="Bientôt disponible">
          <span>Ouvrir l'Atelier</span>
          <span className="accueil__note">Bientôt disponible</span>
        </button>
      </section>
    </main>
  )
}

// Réserve la structure de l'Accueil pendant la résolution de session au
// démarrage de l'app (`App.tsx`, vue `resolution`) : aucune donnée réelle
// n'est simulée, seule la géométrie attendue est esquissée. Le `<h1>` de
// page est stable (indépendant de la session en cours de résolution) : il
// est rendu tel quel, sans Skeleton.
export function AccueilSkeleton() {
  return (
    <main className="accueil accueil--skeleton" aria-busy="true" aria-label="Chargement de l'Accueil">
      <h1>Accueil</h1>
      <Skeleton className="accueil__skeleton-ligne" width="12rem" height="1rem" />

      <section className="accueil__etat-vide">
        <Skeleton className="accueil__skeleton-titre" width="16rem" height="1.75rem" />
        <Skeleton className="accueil__skeleton-ligne" width="22rem" height="1rem" />
        <Skeleton className="accueil__skeleton-cta" width="10rem" height="2.75rem" />
      </section>
    </main>
  )
}
