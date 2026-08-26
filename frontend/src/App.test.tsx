import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { ApiError, calculerParcours, getSession, listerParcours, obtenirParcours } from './api/client'

// La résolution de session au démarrage (`App.tsx`) doit distinguer "pas de
// session" (401, normal pour un visiteur non connecté) d'une panne réseau
// transitoire (tout autre échec) : trouvé sans couverture en revue de
// l'épic 1, ce fichier couvre les deux branches.
vi.mock('./api/client', async () => {
  const reel = await vi.importActual<typeof import('./api/client')>('./api/client')
  return {
    ...reel,
    getSession: vi.fn(),
    listerParcours: vi.fn(),
    obtenirParcours: vi.fn(),
    calculerParcours: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.mocked(getSession).mockReset()
  vi.mocked(listerParcours).mockReset()
  vi.mocked(obtenirParcours).mockReset()
  vi.mocked(calculerParcours).mockReset()
})

describe('App — résolution de session au démarrage', () => {
  it('affiche Connexion quand la session est réellement absente (401)', async () => {
    vi.mocked(getSession).mockRejectedValue(
      new ApiError(401, { code: 'SESSION_INVALIDE', message: 'Session invalide.', details: {}, correlationId: '' }),
    )

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it("affiche un état d'erreur avec un bouton Réessayer sur une panne transitoire (pas 401)", async () => {
    vi.mocked(getSession).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de vérifier votre session/)
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('Réessayer relance la vérification et rejoint l’Accueil si elle réussit ensuite', async () => {
    const user = userEvent.setup()
    vi.mocked(getSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText(/Connecté en tant que alice/)).toBeInTheDocument()
  })

  it('affiche directement Accueil quand une session valide existe déjà', async () => {
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'bob' })

    render(<App />)

    expect(await screen.findByText(/Connecté en tant que bob/)).toBeInTheDocument()
  })

  it('rouvre depuis Mes parcours un Atelier préchargé sans recalculer le tracé', async () => {
    const user = userEvent.setup()
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })
    vi.mocked(listerParcours).mockResolvedValue([
      {
        id: 'route-26',
        nom: 'Boucle du dimanche',
        note: undefined,
        etiquettes: ['weekend'],
        distanceM: 12_300,
        denivelePositifM: 240,
        dureeS: 3_600,
        difficulte: 'modere',
        createdAt: '2026-08-26T08:00:00Z',
      },
    ])
    vi.mocked(obtenirParcours).mockResolvedValue({
      id: 'route-26',
      statut: 'routed',
      geometrie: [
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      ],
      pointsNonRoutes: [],
      fournisseur: 'valhalla',
      versionFournisseur: '3.5',
      createdAt: '2026-08-26T08:00:00Z',
      metriques: {
        version: '3',
        distanceM: 12_300,
        denivelePositifM: 240,
        deniveleNegatifM: 240,
        dureeS: 3_600,
        difficulte: 'modere',
        revetements: { pave: 1 },
        categoriesRoutieres: { secondaire: 1 },
        profil: [],
        monteesSignificatives: [],
      },
      nom: 'Boucle du dimanche',
      note: undefined,
      etiquettes: ['weekend'],
      points: [
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      ],
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Voir Mes parcours' }))
    await user.click(await screen.findByRole('button', { name: /Boucle du dimanche/ }))

    expect(await screen.findByRole('heading', { name: 'Atelier' })).toBeInTheDocument()
    expect(screen.getByText('12,3 km')).toBeInTheDocument()
    expect(obtenirParcours).toHaveBeenCalledWith('route-26')
    expect(calculerParcours).not.toHaveBeenCalled()
  })
})
