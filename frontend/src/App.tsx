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
  | { nom: 'connexion' }
  | { nom: 'inscription' }
  | { nom: 'accueil'; identifiant: string }

function App() {
  const [vue, setVue] = useState<Vue>({ nom: 'resolution' })

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
          console.warn('Vérification de session impossible (réessayez plus tard).', error)
        }
      })

    return () => {
      annule = true
    }
  }, [])

  if (vue.nom === 'resolution') {
    // Résolution de la session en cours : Skeleton sobre de l'Accueil
    // plutôt qu'un Connexion/Accueil incorrect qui clignoterait à l'écran,
    // et plutôt qu'un rendu vide qui ferait sauter la mise en page à
    // l'arrivée du résultat.
    return <AccueilSkeleton />
  }

  if (vue.nom === 'accueil') {
    return (
      <>
        <AppHeader identifiant={vue.identifiant} onDeconnexion={() => setVue({ nom: 'connexion' })} />
        <Accueil identifiant={vue.identifiant} onSessionExpiree={() => setVue({ nom: 'connexion' })} />
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
      onConnecte={(identifiant) => setVue({ nom: 'accueil', identifiant })}
      onAllerInscription={() => setVue({ nom: 'inscription' })}
    />
  )
}

export default App
