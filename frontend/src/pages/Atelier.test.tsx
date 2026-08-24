import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

const RESULTAT_ROUTE_DEFAUT = {
  id: 'r1',
  statut: 'routed' as const,
  geometrie: [
    { lat: 45.75, lon: 4.85 },
    { lat: 45.76, lon: 4.86 },
  ],
  pointsNonRoutes: [],
  fournisseur: 'valhalla',
  versionFournisseur: '3.8.3',
  createdAt: '2026-08-23T00:00:00Z',
}

describe('Atelier — matrice I/O de spec-2-2 (topologie), non-régression 2.1', () => {
  it('premier point posé (clic carte) : devient le départ, le menu contextuel impose le choix de topologie', async () => {
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85)

    const menu = await screen.findByRole('region', { name: 'Choix de la topologie' })
    expect(menu).toBeInTheDocument()
    expect(screen.getByText(/Topologie/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boucle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aller simple' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Multi-étapes' })).toBeInTheDocument()
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
  })

  it('premier point posé (recherche) : devient aussi le départ, menu de choix de topologie affiché', async () => {
    const user = userEvent.setup()
    vi.mocked(rechercherAdresse).mockResolvedValue([{ label: 'Lyon, France', lat: 45.75, lon: 4.85 }])

    render(<Atelier onRetourAccueil={vi.fn()} />)
    await user.type(screen.getByLabelText('Rechercher une adresse'), 'Lyon')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    await user.click(await screen.findByRole('button', { name: 'Lyon, France' }))

    expect(screen.getByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
  })

  it('un point posé avant le choix de topologie est ignoré (jamais de valeur par défaut implicite)', async () => {
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85) // départ
    cliquerCarte(45.76, 4.86) // ignoré : topologie pas encore choisie

    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
    expect(calculerParcours).not.toHaveBeenCalled()
  })

  describe('Aller simple (régression 2.1)', () => {
    it('2e point posé après le choix « Aller simple » : calcule automatiquement un tracé routé, sans paramètre sportif', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

      render(<Atelier onRetourAccueil={vi.fn()} />)
      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
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
      // points) ne contient que `lat`/`lon`, rien d'autre.
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

    it('3e point posé après la destination : ignoré (verrouillage, comportement 2.1)', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

      render(<Atelier onRetourAccueil={vi.fn()} />)
      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(45.76, 4.86)
      await screen.findByTestId('trace')
      cliquerCarte(46.0, 6.0)

      expect(screen.getAllByTestId('marqueur')).toHaveLength(2)
      expect(calculerParcours).toHaveBeenCalledTimes(1)
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
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(46.0, 6.5)

      const bandeau = await screen.findByRole('alert')
      expect(bandeau).toHaveTextContent(/non rattachable/)
      expect(screen.queryByTestId('trace')).not.toBeInTheDocument()

      // « Supprimer » réinitialise tout le flux (P4, y compris la
      // topologie) : plus aucun marqueur ni menu contextuel après le clic.
      await user.click(screen.getByRole('button', { name: 'Supprimer' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
      expect(screen.queryByRole('region', { name: 'Choix de la topologie' })).not.toBeInTheDocument()
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
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(45.76, 4.86) // destination, routable

      await screen.findByRole('alert')
      await user.click(screen.getByRole('button', { name: 'Supprimer' }))
      expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)

      // Reposer un point doit redevenir un départ, avec un nouveau choix de
      // topologie imposé (pas un second point "destination" empilé).
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
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(45.76, 4.86)

      const trace = await screen.findByTestId('trace')
      expect(JSON.parse(trace.getAttribute('data-points') ?? '[]')).toEqual([
        [45.75, 4.85],
        [45.76, 4.86],
      ])
    })

    it('erreur du moteur de routage : le dernier tracé valide reste affiché avec une erreur structurée', async () => {
      const user = userEvent.setup()
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
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(45.76, 4.86)

      expect(await screen.findByText(/moteur de routage est indisponible/)).toBeInTheDocument()
    })
  })

  describe('Boucle', () => {
    it('choix Boucle : le menu de choix se ferme, les clics suivants posent des points de passage, aucune destination proposée', async () => {
      const user = userEvent.setup()
      render(<Atelier onRetourAccueil={vi.fn()} />)

      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Boucle' }))
      expect(screen.queryByRole('region', { name: 'Choix de la topologie' })).not.toBeInTheDocument()

      cliquerCarte(45.76, 4.86)

      expect(screen.getByText('Point de passage')).toBeInTheDocument()
      expect(screen.queryByText('Destination')).not.toBeInTheDocument()
    })

    it('1 point de passage posé : calcule un tracé fermé départ→point→départ', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours).mockResolvedValue({
        id: 'boucle-1',
        statut: 'routed',
        geometrie: [
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
          { lat: 45.75, lon: 4.85 },
        ],
        pointsNonRoutes: [],
        fournisseur: 'valhalla',
        versionFournisseur: '3.8.3',
        createdAt: '2026-08-23T00:00:00Z',
      })

      render(<Atelier onRetourAccueil={vi.fn()} />)
      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Boucle' }))
      cliquerCarte(45.76, 4.86)

      await waitFor(() =>
        expect(vi.mocked(calculerParcours).mock.calls[0][0]).toEqual([
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
          { lat: 45.75, lon: 4.85 },
        ]),
      )

      const trace = await screen.findByTestId('trace')
      expect(JSON.parse(trace.getAttribute('data-points') ?? '[]')).toHaveLength(3)
    })
  })

  describe('Multi-étapes', () => {
    it('choix Multi-étapes : les clics suivants posent des points de passage, sélecteur de rôle inline sur le dernier point posé', async () => {
      const user = userEvent.setup()
      render(<Atelier onRetourAccueil={vi.fn()} />)

      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
      cliquerCarte(45.76, 4.86)

      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(2) // départ + point de passage n°1
      expect(items[1]).toHaveTextContent('Point de passage')
      expect(within(items[1]).getByRole('button', { name: 'Étape utilisateur' })).toBeInTheDocument()
      expect(within(items[1]).getByRole('button', { name: 'Destination' })).toBeInTheDocument()
      expect(calculerParcours).not.toHaveBeenCalled()
    })

    it('destination qualifiée : calcule avec tous les points dans l’ordre ; points suivants ignorés', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours).mockResolvedValue({
        id: 'multi-1',
        statut: 'routed',
        geometrie: [
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
          { lat: 45.77, lon: 4.87 },
        ],
        pointsNonRoutes: [],
        fournisseur: 'valhalla',
        versionFournisseur: '3.8.3',
        createdAt: '2026-08-23T00:00:00Z',
      })

      render(<Atelier onRetourAccueil={vi.fn()} />)
      cliquerCarte(45.75, 4.85) // départ
      await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
      cliquerCarte(45.76, 4.86) // point de passage n°1

      let items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(2)

      // Qualifier le 1er point de passage "Étape utilisateur" : pas de
      // calcul déclenché, pas de ré-édition ultérieure -- son sélecteur ne
      // réapparaît jamais, y compris une fois qu'il n'est plus le dernier
      // point posé.
      await user.click(within(items[1]).getByRole('button', { name: 'Étape utilisateur' }))
      expect(calculerParcours).not.toHaveBeenCalled()
      items = screen.getAllByRole('listitem')
      expect(items[1]).toHaveTextContent('Étape utilisateur')
      expect(within(items[1]).queryByRole('button')).not.toBeInTheDocument()

      cliquerCarte(45.77, 4.87) // point de passage n°2 : devient le dernier point posé
      items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(items[2]).toHaveTextContent('Point de passage')
      expect(within(items[2]).getByRole('button', { name: 'Destination' })).toBeInTheDocument()
      // Le point n°1, déjà qualifié, ne récupère pas de sélecteur.
      expect(within(items[1]).queryByRole('button')).not.toBeInTheDocument()

      await user.click(within(items[2]).getByRole('button', { name: 'Destination' }))

      await waitFor(() =>
        expect(vi.mocked(calculerParcours).mock.calls[0][0]).toEqual([
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
          { lat: 45.77, lon: 4.87 },
        ]),
      )

      // Verrouillage post-Destination (même précédent que l'aller simple) :
      // un point posé ensuite est ignoré.
      await screen.findByTestId('trace')
      cliquerCarte(46.0, 6.0)
      expect(screen.getAllByTestId('marqueur')).toHaveLength(3)
      expect(calculerParcours).toHaveBeenCalledTimes(1)
    })
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
