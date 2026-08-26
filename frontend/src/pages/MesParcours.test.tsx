import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MesParcours } from './MesParcours'
import { ApiError, listerParcours, obtenirParcours, type ParcoursResume, type ResultatParcours } from '../api/client'

vi.mock('../api/client', async () => {
  const reel = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...reel, listerParcours: vi.fn(), obtenirParcours: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.mocked(listerParcours).mockReset()
  vi.mocked(obtenirParcours).mockReset()
})

const PARCOURS_RESUME: ParcoursResume = {
  id: 'p1',
  nom: 'Boucle du dimanche',
  note: 'Belle vue au sommet',
  etiquettes: ['gravel', 'weekend'],
  distanceM: 12345,
  denivelePositifM: 210,
  dureeS: 3620,
  difficulte: 'modere',
  createdAt: '2026-08-23T00:00:00Z',
}

function fournirErreurApi(status: number, code: string, message: string): ApiError {
  return new ApiError(status, { code, message, details: {}, correlationId: 'test' })
}

describe('MesParcours — chargement/vide/erreur (spec-2-6, UX-DR27)', () => {
  it('affiche un statut de chargement pendant la récupération de la liste', () => {
    vi.mocked(listerParcours).mockReturnValue(new Promise(() => {}))

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Chargement de vos parcours…')
  })

  it("liste vide : « Aucun parcours enregistré » avec un CTA « Créer un parcours »", async () => {
    const user = userEvent.setup()
    vi.mocked(listerParcours).mockResolvedValue([])
    const onCreerParcours = vi.fn()

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={onCreerParcours} onOuvrirParcours={vi.fn()} />)

    expect(await screen.findByText('Aucun parcours enregistré.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Créer un parcours' }))
    expect(onCreerParcours).toHaveBeenCalledTimes(1)
  })

  it('erreur réseau/serveur : message affiché, Réessayer relance le chargement', async () => {
    const user = userEvent.setup()
    vi.mocked(listerParcours)
      .mockRejectedValueOnce(fournirErreurApi(500, 'ERREUR_INATTENDUE', 'Panne serveur simulée.'))
      .mockResolvedValueOnce([PARCOURS_RESUME])

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Panne serveur simulée.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('Boucle du dimanche')).toBeInTheDocument()
    expect(listerParcours).toHaveBeenCalledTimes(2)
  })

  it('401 à la liste : notifie la session expirée plutôt que d’afficher une erreur générique', async () => {
    vi.mocked(listerParcours).mockRejectedValue(fournirErreurApi(401, 'SESSION_INVALIDE', 'Session expirée.'))
    const onSessionExpiree = vi.fn()

    render(
      <MesParcours
        onRetourAccueil={vi.fn()}
        onCreerParcours={vi.fn()}
        onOuvrirParcours={vi.fn()}
        onSessionExpiree={onSessionExpiree}
      />,
    )

    await waitFor(() => expect(onSessionExpiree).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('MesParcours — liste et réouverture (spec-2-6)', () => {
  it('affiche nom/note/étiquettes/métriques de chaque parcours enregistré', async () => {
    vi.mocked(listerParcours).mockResolvedValue([PARCOURS_RESUME])

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={vi.fn()} />)

    const item = await screen.findByRole('button', { name: /Boucle du dimanche/ })
    expect(within(item).getByText('Belle vue au sommet')).toBeInTheDocument()
    expect(within(item).getByText('gravel')).toBeInTheDocument()
    expect(within(item).getByText('weekend')).toBeInTheDocument()
    expect(within(item).getByText('12,3 km')).toBeInTheDocument()
    expect(within(item).getByText('210 m D+')).toBeInTheDocument()
    expect(within(item).getByText('1 h 00')).toBeInTheDocument()
    expect(within(item).getByText('Modéré')).toBeInTheDocument()
  })

  it('clic sur une entrée : réouvre le parcours choisi (GET /api/routes/{id}, aucun nouvel appel de calcul)', async () => {
    const user = userEvent.setup()
    vi.mocked(listerParcours).mockResolvedValue([PARCOURS_RESUME])
    const parcoursComplet: ResultatParcours = {
      id: 'p1',
      statut: 'routed',
      geometrie: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.76, lon: 4.86 },
      ],
      pointsNonRoutes: [],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
      nom: 'Boucle du dimanche',
      etiquettes: ['gravel', 'weekend'],
      points: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.76, lon: 4.86 },
      ],
    }
    vi.mocked(obtenirParcours).mockResolvedValue(parcoursComplet)
    const onOuvrirParcours = vi.fn()

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={onOuvrirParcours} />)

    await user.click(await screen.findByRole('button', { name: /Boucle du dimanche/ }))

    await waitFor(() => expect(obtenirParcours).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onOuvrirParcours).toHaveBeenCalledWith(parcoursComplet))
  })

  it("ignore une réponse de détail arrivée après avoir quitté Mes parcours", async () => {
    const user = userEvent.setup()
    let resoudreOuverture: ((valeur: ResultatParcours) => void) | undefined
    vi.mocked(listerParcours).mockResolvedValue([PARCOURS_RESUME])
    vi.mocked(obtenirParcours).mockImplementation(
      () =>
        new Promise((resolve) => {
          resoudreOuverture = resolve
        }),
    )
    const onOuvrirParcours = vi.fn()

    const vue = render(
      <MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={onOuvrirParcours} />,
    )
    await user.click(await screen.findByRole('button', { name: /Boucle du dimanche/ }))
    vue.unmount()

    await act(async () => {
      resoudreOuverture?.({
        id: 'p1',
        statut: 'routed',
        geometrie: [],
        pointsNonRoutes: [],
        fournisseur: 'valhalla',
        versionFournisseur: '3.8.3',
        createdAt: '2026-08-23T00:00:00Z',
      })
    })
    expect(onOuvrirParcours).not.toHaveBeenCalled()
  })

  it('échec à la réouverture : message affiché, la liste reste consultable', async () => {
    const user = userEvent.setup()
    vi.mocked(listerParcours).mockResolvedValue([PARCOURS_RESUME])
    vi.mocked(obtenirParcours).mockRejectedValue(fournirErreurApi(500, 'ERREUR_INATTENDUE', 'Panne simulée.'))

    render(<MesParcours onRetourAccueil={vi.fn()} onCreerParcours={vi.fn()} onOuvrirParcours={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Boucle du dimanche/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Panne simulée.')
    expect(screen.getByRole('button', { name: /Boucle du dimanche/ })).toBeInTheDocument()
  })
})

describe('MesParcours — navigation', () => {
  it('« Accueil » déclenche le retour', async () => {
    const user = userEvent.setup()
    vi.mocked(listerParcours).mockResolvedValue([])
    const onRetourAccueil = vi.fn()

    render(<MesParcours onRetourAccueil={onRetourAccueil} onCreerParcours={vi.fn()} onOuvrirParcours={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Accueil/ }))

    expect(onRetourAccueil).toHaveBeenCalledTimes(1)
  })
})
