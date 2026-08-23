import { useEffect, useState } from 'react'
import { ApiError, getSession } from './api/client'
import { AppHeader } from './components/AppHeader'
import { Accueil, AccueilSkeleton } from './pages/Accueil'
import { Connexion } from './pages/Connexion'
import { Inscription } from './pages/Inscription'

// Pas de librairie de routage : 3 écrans, aucune URL profonde requise (cf.
// Design Notes de spec-1-2) ; à réévaluer à l'atelier cartographique (Epic 2).
type Vue =
  | { nom: 'resolution' }
  | { nom: 'resolution-erreur' }
  | { nom: 'connexion'; messageExpiration?: string }
  | { nom: 'inscription' }
  | { nom: 'accueil'; identifiant: string }

function App() {
  const [vue, setVue] = useState<Vue>({ nom: 'resolution' })
  // Incrémenté par le bouton "Réessayer" de la vue `resolution-erreur` pour
  // redéclencher la vérification de session (cf. tableau de dépendances de
  // l'effet ci-dessous).
  const [tentative, setTentative] = useState(0)

  useEffect(() => {
    let annule = false

    getSession()
      .then((session) => {
        if (!annule) {
          setVue({ nom: 'accueil', identifiant: session.identifiant })
        }
      })
      .catch((error: unknown) => {
        if (annule) {
          return
        }
        // Seule une session réellement invalide (401) doit mener à
        // Connexion : une panne réseau/serveur transitoire ne doit pas être
        // interprétée comme "pas de session".
        if (error instanceof ApiError && error.status === 401) {
          setVue({ nom: 'connexion' })
        } else {
          // Panne réseau/serveur transitoire au démarrage : proposer une
          // nouvelle tentative plutôt que de rester bloqué indéfiniment sur
          // le Skeleton sans aucun recours (trouvé en revue de l'épic 1).
          console.warn('Vérification de session impossible (réessayez plus tard).', error)
          setVue({ nom: 'resolution-erreur' })
        }
      })

    return () => {
      annule = true
    }
  }, [tentative])

  if (vue.nom === 'resolution') {
    // Résolution de la session en cours : Skeleton sobre de l'Accueil
    // plutôt qu'un Connexion/Accueil incorrect qui clignoterait à l'écran,
    // et plutôt qu'un rendu vide qui ferait sauter la mise en page à
    // l'arrivée du résultat.
    return <AccueilSkeleton />
  }

  if (vue.nom === 'resolution-erreur') {
    return (
      <main className="app-erreur-resolution" role="alert">
        <p>Impossible de vérifier votre session. Vérifiez votre connexion puis réessayez.</p>
        <button
          type="button"
          onClick={() => {
            setVue({ nom: 'resolution' })
            setTentative((valeur) => valeur + 1)
          }}
        >
          Réessayer
        </button>
      </main>
    )
  }

  if (vue.nom === 'accueil') {
    return (
      <>
        <AppHeader identifiant={vue.identifiant} onDeconnexion={() => setVue({ nom: 'connexion' })} />
        <Accueil
          identifiant={vue.identifiant}
          onSessionExpiree={() =>
            setVue({
              nom: 'connexion',
              messageExpiration: 'Votre session a expiré. Reconnectez-vous pour continuer.',
            })
          }
        />
      </>
    )
  }

  if (vue.nom === 'inscription') {
    return (
      <Inscription
        onInscrit={(identifiant) => setVue({ nom: 'accueil', identifiant })}
        onAllerConnexion={() => setVue({ nom: 'connexion' })}
      />
    )
  }

  return (
    <Connexion
      messageExpiration={vue.messageExpiration}
      onConnecte={(identifiant) => setVue({ nom: 'accueil', identifiant })}
      onAllerInscription={() => setVue({ nom: 'inscription' })}
    />
  )
}

export default App
