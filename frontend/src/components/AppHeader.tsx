import { useEffect, useRef, useState } from 'react'
import { logout } from '../api/client'
import './AppHeader.css'

interface AppHeaderProps {
  identifiant: string
  onDeconnexion: () => void
}

// Marque + Account menu complet (Mes parcours / Exporter mes données /
// Déconnexion). Les deux premières entrées restent inertes : elles n'ont
// rien à pointer avant Epic 2/5, mais doivent être visibles (cf. AC menu
// complet de spec-1-4) plutôt qu'omises ou menant à une route inexistante.
export function AppHeader({ identifiant, onDeconnexion }: AppHeaderProps) {
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | undefined>(undefined)
  const conteneurRef = useRef<HTMLDivElement>(null)
  const boutonCompteRef = useRef<HTMLButtonElement>(null)
  const premierItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOuvert) {
      return
    }

    // Focus déplacé dans le menu à l'ouverture (première entrée), pour un
    // usage clavier/lecteur d'écran correct (trouvé en revue de l'épic 1).
    premierItemRef.current?.focus()

    function fermerEtEffacerErreur() {
      setMenuOuvert(false)
      // Un message d'échec de déconnexion ne doit pas resurgir à une
      // réouverture ultérieure sans rapport avec la tentative qui l'a
      // produit (trouvé en revue de l'épic 1).
      setErreur(undefined)
    }

    function handleClicExterieur(event: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target as Node)) {
        fermerEtEffacerErreur()
      }
    }

    function handleEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        fermerEtEffacerErreur()
        // Échap ne déplace pas le focus lui-même (contrairement à un clic
        // extérieur, qui atterrit naturellement où l'utilisateur a cliqué) :
        // on le restaure explicitement sur le déclencheur du menu.
        boutonCompteRef.current?.focus()
      }
    }

    document.addEventListener('click', handleClicExterieur)
    document.addEventListener('keydown', handleEchap)
    return () => {
      document.removeEventListener('click', handleClicExterieur)
      document.removeEventListener('keydown', handleEchap)
    }
  }, [menuOuvert])

  function handleToggleMenu() {
    if (menuOuvert) {
      setErreur(undefined)
    }
    setMenuOuvert((ouvert) => !ouvert)
  }

  async function handleDeconnexion() {
    if (deconnexionEnCours) {
      return
    }
    setDeconnexionEnCours(true)
    setErreur(undefined)
    try {
      await logout()
      // Seul un succès effectif ferme le menu et fait revenir à Connexion :
      // un échec (réseau, ...) laisserait sinon l'UI afficher "déconnecté"
      // alors que la session serveur (et le cookie) restent valides.
      setMenuOuvert(false)
      onDeconnexion()
    } catch {
      setErreur('La déconnexion a échoué. Réessayez.')
    } finally {
      setDeconnexionEnCours(false)
    }
  }

  return (
    <header className="app-header">
      <span className="app-header__marque">BikeRoute</span>
      <div className="app-header__compte" ref={conteneurRef}>
        <button
          ref={boutonCompteRef}
          type="button"
          className="app-header__bouton-compte"
          aria-haspopup="true"
          aria-expanded={menuOuvert}
          onClick={handleToggleMenu}
        >
          {identifiant}
        </button>
        {menuOuvert && (
          <div className="app-header__menu" role="menu">
            <button
              ref={premierItemRef}
              type="button"
              role="menuitem"
              className="app-header__item-inerte"
              aria-disabled="true"
              title="Bientôt disponible"
            >
              <span>Mes parcours</span>
              <span className="app-header__note">Bientôt disponible</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="app-header__item-inerte"
              aria-disabled="true"
              title="Bientôt disponible"
            >
              <span>Exporter mes données</span>
              <span className="app-header__note">Bientôt disponible</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="app-header__deconnexion"
              disabled={deconnexionEnCours}
              onClick={handleDeconnexion}
            >
              {deconnexionEnCours ? 'Déconnexion…' : 'Déconnexion'}
            </button>
            {erreur && (
              <p className="app-header__erreur" role="alert">
                {erreur}
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
