import { useEffect, useState } from 'react'
import { ApiError, getSession, type ResultatParcours } from './api/client'
import { AppHeader } from './components/AppHeader'
import { Accueil, AccueilSkeleton } from './pages/Accueil'
import { Atelier } from './pages/Atelier'
import { Connexion } from './pages/Connexion'
import { Inscription } from './pages/Inscription'
import { MesParcours } from './pages/MesParcours'

// Pas de librairie de routage : encore peu d'écrans, aucune URL profonde
// requise (cf. Design Notes de spec-1-2) -- réévalué à l'introduction de
// l'Atelier (Story 2.1) : toujours pas d'URL profonde nécessaire (un seul
// point d'entrée, depuis l'Accueil), donc pas encore de bascule vers
// `react-router` (cf. Design Notes de spec-2-1).
type Vue =
  | { nom: 'resolution' }
  | { nom: 'resolution-erreur' }
  | { nom: 'connexion'; messageExpiration?: string }
  | { nom: 'inscription' }
  | { nom: 'accueil'; identifiant: string }
  // `parcoursAOuvrir` (spec-2-6) : présent seulement en provenance de « Mes
  // parcours » (réouverture) -- absent pour un nouveau parcours (Accueil ou
  // « Mes parcours » vide, cf. `MesParcours.tsx`).
  | { nom: 'atelier'; identifiant: string; parcoursAOuvrir?: ResultatParcours }
  | { nom: 'mes-parcours'; identifiant: string }

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
        <AppHeader
          identifiant={vue.identifiant}
          onDeconnexion={() => setVue({ nom: 'connexion' })}
          onOuvrirMesParcours={() => setVue({ nom: 'mes-parcours', identifiant: vue.identifiant })}
        />
        <Accueil
          identifiant={vue.identifiant}
          onOuvrirAtelier={() => setVue({ nom: 'atelier', identifiant: vue.identifiant })}
          onOuvrirMesParcours={() => setVue({ nom: 'mes-parcours', identifiant: vue.identifiant })}
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

  if (vue.nom === 'atelier') {
    return (
      <>
        <AppHeader
          identifiant={vue.identifiant}
          onDeconnexion={() => setVue({ nom: 'connexion' })}
          onOuvrirMesParcours={() => setVue({ nom: 'mes-parcours', identifiant: vue.identifiant })}
        />
        <Atelier
          // Remonte le composant à chaque nouveau parcours réouvert (ou
          // repli sur un nouveau parcours vierge, spec-2-6) : les
          // initialiseurs paresseux de l'Atelier (points/trace/métriques/
          // parcoursId préchargés) ne s'exécutent qu'au montage.
          key={vue.parcoursAOuvrir?.id ?? 'nouveau'}
          onRetourAccueil={() => setVue({ nom: 'accueil', identifiant: vue.identifiant })}
          onSessionExpiree={() =>
            setVue({
              nom: 'connexion',
              messageExpiration: 'Votre session a expiré. Reconnectez-vous pour continuer.',
            })
          }
          parcoursAOuvrir={vue.parcoursAOuvrir}
        />
      </>
    )
  }

  if (vue.nom === 'mes-parcours') {
    return (
      <>
        <AppHeader
          identifiant={vue.identifiant}
          onDeconnexion={() => setVue({ nom: 'connexion' })}
          onOuvrirMesParcours={() => setVue({ nom: 'mes-parcours', identifiant: vue.identifiant })}
        />
        <MesParcours
          onRetourAccueil={() => setVue({ nom: 'accueil', identifiant: vue.identifiant })}
          onCreerParcours={() => setVue({ nom: 'atelier', identifiant: vue.identifiant })}
          onOuvrirParcours={(parcours) =>
            setVue({ nom: 'atelier', identifiant: vue.identifiant, parcoursAOuvrir: parcours })
          }
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
