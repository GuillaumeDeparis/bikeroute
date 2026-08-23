import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Atelier } from './Atelier'
import { ApiError, calculerParcours, rechercherAdresse } from '../api/client'

// `react-leaflet`/Leaflet ont besoin d'un vrai DOM avec dimensions (taille de
// tuiles, événements souris bas niveau, ...) que jsdom ne fournit pas
// fidèlement. On mocke la carte par un composant minimal qui expose les
// points/le tracé passés en props via des attributs `data-*` inspectables,
// et qui capture le gestionnaire de clic pour que les tests puissent
// simuler "poser un point sur la carte" sans dépendre du rendu Leaflet réel.
let dernierGestionnaireClic: ((event: { latlng: { lat: number; lng: number } }) => void) | undefined

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="carte">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="marqueur" data-lat={position[0]} data-lon={position[1]} />
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="trace" data-points={JSON.stringify(positions)} />
  ),
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: (handlers: { click?: (event: { latlng: { lat: number; lng: number } }) => void }) => {
    dernierGestionnaireClic = handlers.click
    return { setView: vi.fn() }
  },
}))

vi.mock('../api/client', async () => {
  const reel = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...reel, calculerParcours: vi.fn(), rechercherAdresse: vi.fn() }
})

function cliquerCarte(lat: number, lon: number) {
  // `dernierGestionnaireClic` est appelé en dehors de tout événement React
  // (c'est un rappel Leaflet, ici simulé) : `act()` garantit que le
  // `setState` déclenché par `poserPoint` est bien flush avant l'assertion
  // suivante, comme le ferait un vrai clic géré par React.
  act(() => {
    dernierGestionnaireClic?.({ latlng: { lat, lng: lon } })
  })
}

afterEach(() => {
  cleanup()
  vi.mocked(calculerParcours).mockReset()
  vi.mocked(rechercherAdresse).mockReset()
  dernierGestionnaireClic = undefined
})

describe('Atelier — matrice I/O de spec-2-1', () => {
  it('premier point posé (clic carte) : devient le départ, le menu contextuel demande la topologie', async () => {
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85)

    expect(await screen.findByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
    expect(screen.getByText(/Topologie/)).toBeInTheDocument()
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
  })

  it('premier point posé (recherche) : devient aussi le départ', async () => {
    const user = userEvent.setup()
    vi.mocked(rechercherAdresse).mockResolvedValue([{ label: 'Lyon, France', lat: 45.75, lon: 4.85 }])

    render(<Atelier onRetourAccueil={vi.fn()} />)
    await user.type(screen.getByLabelText('Rechercher une adresse'), 'Lyon')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    await user.click(await screen.findByRole('button', { name: 'Lyon, France' }))

    expect(screen.getByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
  })

  it('destination posée : calcule automatiquement un tracé routé, sans paramètre sportif', async () => {
    vi.mocked(calculerParcours).mockResolvedValue({
      id: 'r1',
      statut: 'routed',
      geometrie: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.76, lon: 4.86 },
      ],
      pointsNonRoutes: [],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
    })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    cliquerCarte(45.76, 4.86)

    await waitFor(() =>
      expect(calculerParcours).toHaveBeenCalledWith(
        [
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
        ],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    // Aucun paramètre sportif n'est envoyé : le premier argument (les
    // points) ne contient que `lat`/`lon`, rien d'autre -- le second
    // argument n'est que la plomberie d'annulation (`AbortSignal`, P13),
    // jamais un paramètre métier envoyé au calcul.
    expect(vi.mocked(calculerParcours).mock.calls[0][0]).toEqual([
      { lat: 45.75, lon: 4.85 },
      { lat: 45.76, lon: 4.86 },
    ])

    const trace = await screen.findByTestId('trace')
    expect(JSON.parse(trace.getAttribute('data-points') ?? '[]')).toEqual([
      [45.75, 4.85],
      [45.76, 4.86],
    ])
  })

  it('consultation du tracé : le tracé affiché correspond à la géométrie renvoyée par le fournisseur', async () => {
    vi.mocked(calculerParcours).mockResolvedValue({
      id: 'r2',
      statut: 'routed',
      geometrie: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.751, lon: 4.851 },
        { lat: 45.76, lon: 4.86 },
      ],
      pointsNonRoutes: [],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
    })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    cliquerCarte(45.76, 4.86)

    const trace = await screen.findByTestId('trace')
    expect(JSON.parse(trace.getAttribute('data-points') ?? '[]')).toHaveLength(3)
  })

  it('point non rattachable au réseau : reste marqué non routé, bandeau proposant de le supprimer, aucun tracé affiché', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue({
      id: 'r3',
      statut: 'non_route',
      geometrie: [],
      pointsNonRoutes: [{ lat: 46.0, lon: 6.5 }],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
    })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    cliquerCarte(46.0, 6.5)

    const bandeau = await screen.findByRole('alert')
    expect(bandeau).toHaveTextContent(/non rattachable/)
    expect(screen.queryByTestId('trace')).not.toBeInTheDocument()

    // « Supprimer » réinitialise tout le flux (P4) : retirer uniquement le
    // point non routé laisserait l'autre orphelin (cf. commentaire de
    // `reinitialiserPoints` dans Atelier.tsx) -- plus aucun marqueur après
    // le clic, pas "un de moins".
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
  })

  it('régression P4 : supprimer un départ non routé permet de reposer un nouveau départ (pas un point orphelin)', async () => {
    const user = userEvent.setup()
    // Le départ est le point non routé cette fois (pas la destination) :
    // c'est exactement le chemin qui, avant correctif, laissait `depart`
    // `undefined` pour toujours après suppression.
    vi.mocked(calculerParcours).mockResolvedValueOnce({
      id: 'r4',
      statut: 'non_route',
      geometrie: [],
      pointsNonRoutes: [{ lat: 46.0, lon: 6.5 }],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
    })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(46.0, 6.5) // départ, hors réseau
    cliquerCarte(45.76, 4.86) // destination, routable

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)

    // Reposer un point doit redevenir un départ (pas un second point
    // "destination" empilé sur l'ancien, comme avant le correctif).
    cliquerCarte(45.75, 4.85)
    expect(await screen.findByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)

    // Et le calcul automatique doit pouvoir se redéclencher normalement.
    vi.mocked(calculerParcours).mockResolvedValueOnce({
      id: 'r5',
      statut: 'routed',
      geometrie: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.76, lon: 4.86 },
      ],
      pointsNonRoutes: [],
      fournisseur: 'valhalla',
      versionFournisseur: '3.8.3',
      createdAt: '2026-08-23T00:00:00Z',
    })
    cliquerCarte(45.76, 4.86)

    const trace = await screen.findByTestId('trace')
    expect(JSON.parse(trace.getAttribute('data-points') ?? '[]')).toEqual([
      [45.75, 4.85],
      [45.76, 4.86],
    ])
  })

  it('erreur du moteur de routage : le dernier tracé valide reste affiché avec une erreur structurée', async () => {
    vi.mocked(calculerParcours).mockRejectedValue(
      new ApiError(502, {
        code: 'MOTEUR_ROUTAGE_INDISPONIBLE',
        message: 'Le moteur de routage est indisponible. Réessayez plus tard.',
        details: {},
        correlationId: 'abc',
      }),
    )

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    cliquerCarte(45.76, 4.86)

    expect(await screen.findByText(/moteur de routage est indisponible/)).toBeInTheDocument()
  })

  it('recherche sans résultat : « Aucun lieu trouvé. », sans poser de point', async () => {
    const user = userEvent.setup()
    vi.mocked(rechercherAdresse).mockResolvedValue([])

    render(<Atelier onRetourAccueil={vi.fn()} />)
    await user.type(screen.getByLabelText('Rechercher une adresse'), 'Un lieu qui n’existe pas')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('Aucun lieu trouvé.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
  })

  it('recherche en échec : erreur affichée, sans poser de point', async () => {
    const user = userEvent.setup()
    vi.mocked(rechercherAdresse).mockRejectedValue(
      new ApiError(502, {
        code: 'RECHERCHE_INDISPONIBLE',
        message: "La recherche d'adresse est indisponible. Réessayez plus tard.",
        details: {},
        correlationId: 'abc',
      }),
    )

    render(<Atelier onRetourAccueil={vi.fn()} />)
    await user.type(screen.getByLabelText('Rechercher une adresse'), 'Lyon')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText(/recherche d'adresse est indisponible/)).toBeInTheDocument()
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
  })
})
