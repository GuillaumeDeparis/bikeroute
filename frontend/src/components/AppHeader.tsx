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

  useEffect(() => {
    if (!menuOuvert) {
      return
    }

    function handleClicExterieur(event: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target as Node)) {
        setMenuOuvert(false)
      }
    }

    function handleEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOuvert(false)
      }
    }

    document.addEventListener('click', handleClicExterieur)
    document.addEventListener('keydown', handleEchap)
    return () => {
      document.removeEventListener('click', handleClicExterieur)
      document.removeEventListener('keydown', handleEchap)
    }
  }, [menuOuvert])

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
          type="button"
          className="app-header__bouton-compte"
          aria-haspopup="true"
          aria-expanded={menuOuvert}
          onClick={() => setMenuOuvert((ouvert) => !ouvert)}
        >
          {identifiant}
        </button>
        {menuOuvert && (
          <div className="app-header__menu" role="menu">
            <button
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
