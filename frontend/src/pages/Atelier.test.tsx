import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Atelier } from './Atelier'
import { ApiError, calculerParcours, rechercherAdresse, type ResultatParcours } from '../api/client'

// `react-leaflet`/Leaflet ont besoin d'un vrai DOM avec dimensions (taille de
// tuiles, événements souris bas niveau, ...) que jsdom ne fournit pas
// fidèlement. On mocke la carte par un composant minimal qui expose les
// points/le tracé passés en props via des attributs `data-*` inspectables,
// et qui capture le gestionnaire de clic pour que les tests puissent
// simuler "poser un point sur la carte" sans dépendre du rendu Leaflet réel.
let dernierGestionnaireClic: ((event: { latlng: { lat: number; lng: number } }) => void) | undefined
// Un marqueur `draggable` (spec-2-3) expose son gestionnaire `dragend` ici,
// indexé par sa position au moment du rendu (`lat:lon`) : assez pour
// simuler "glisser le marqueur actuellement à telle position" sans dépendre
// du rendu Leaflet réel, comme `dernierGestionnaireClic` le fait déjà pour
// les clics carte.
let gestionnairesDrag = new Map<string, (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void>()

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="carte">{children}</div>,
  TileLayer: () => null,
  Marker: ({
    position,
    draggable,
    eventHandlers,
  }: {
    position: [number, number]
    draggable?: boolean
    eventHandlers?: { dragend?: (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void }
  }) => {
    if (eventHandlers?.dragend) {
      gestionnairesDrag.set(`${position[0]}:${position[1]}`, eventHandlers.dragend)
    }
    return (
      <div
        data-testid="marqueur"
        data-lat={position[0]}
        data-lon={position[1]}
        data-draggable={draggable ? 'true' : 'false'}
      />
    )
  },
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="trace" data-points={JSON.stringify(positions)} />
  ),
  useMap: () => ({ setView: vi.fn(), getZoom: () => 13 }),
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

// Simule un glissé-déposé (spec-2-3) : `lat`/`lon` identifient le marqueur
// à son ancienne position (clé posée par le mock `Marker` ci-dessus),
// `nouveauLat`/`nouveauLon` sont la position relâchée transmise à `dragend`.
function glisserMarqueur(lat: number, lon: number, nouveauLat: number, nouveauLon: number) {
  const gestionnaire = gestionnairesDrag.get(`${lat}:${lon}`)
  if (!gestionnaire) {
    throw new Error(`Aucun marqueur draggable trouvé à ${lat}:${lon}`)
  }
  act(() => {
    gestionnaire({ target: { getLatLng: () => ({ lat: nouveauLat, lng: nouveauLon }) } })
  })
}

afterEach(() => {
  cleanup()
  vi.mocked(calculerParcours).mockReset()
  vi.mocked(rechercherAdresse).mockReset()
  dernierGestionnaireClic = undefined
  gestionnairesDrag.clear()
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

  it('résultat de recherche choisi : focalise la carte sans poser de point (UX-DR17)', async () => {
    const user = userEvent.setup()
    vi.mocked(rechercherAdresse).mockResolvedValue([{ label: 'Lyon, France', lat: 45.75, lon: 4.85 }])

    render(<Atelier onRetourAccueil={vi.fn()} />)
    await user.type(screen.getByLabelText('Rechercher une adresse'), 'Lyon')
    await user.click(screen.getByRole('button', { name: 'Rechercher' }))
    await user.click(await screen.findByRole('button', { name: 'Lyon, France' }))

    // Aucun point posé, aucun menu de topologie -- seule la carte se
    // recentre (non observable via le mock `useMap`, cf. commentaire du
    // mock). Le champ et les résultats se referment tout de même.
    expect(screen.queryByRole('region', { name: 'Choix de la topologie' })).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
    expect(screen.getByLabelText('Rechercher une adresse')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Lyon, France' })).not.toBeInTheDocument()

    // Il reste à l'utilisateur de cliquer sur la carte pour poser le départ.
    cliquerCarte(45.75, 4.85)
    expect(await screen.findByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
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

    it('3e point posé après la destination : inséré comme Point de passage juste avant elle, recalcul auto (spec-2-3)', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours)
        .mockResolvedValueOnce(RESULTAT_ROUTE_DEFAUT)
        .mockResolvedValueOnce({
          ...RESULTAT_ROUTE_DEFAUT,
          id: 'r2',
          geometrie: [
            { lat: 45.75, lon: 4.85 },
            { lat: 46.0, lon: 6.0 },
            { lat: 45.76, lon: 4.86 },
          ],
        })

      render(<Atelier onRetourAccueil={vi.fn()} />)
      cliquerCarte(45.75, 4.85)
      await user.click(screen.getByRole('button', { name: 'Aller simple' }))
      cliquerCarte(45.76, 4.86)
      await screen.findByTestId('trace')
      cliquerCarte(46.0, 6.0)

      expect(screen.getAllByTestId('marqueur')).toHaveLength(3)
      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(items[0]).toHaveTextContent('Départ')
      expect(items[1]).toHaveTextContent('Point de passage')
      expect(items[2]).toHaveTextContent('Destination')

      await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))
      expect(vi.mocked(calculerParcours).mock.calls[1][0]).toEqual([
        { lat: 45.75, lon: 4.85 },
        { lat: 46.0, lon: 6.0 },
        { lat: 45.76, lon: 4.86 },
      ])
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

    it('destination qualifiée : calcule avec tous les points dans l’ordre ; point posé ensuite inséré avant elle (spec-2-3)', async () => {
      const user = userEvent.setup()
      vi.mocked(calculerParcours)
        .mockResolvedValueOnce({
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
        .mockResolvedValueOnce({
          id: 'multi-2',
          statut: 'routed',
          geometrie: [
            { lat: 45.75, lon: 4.85 },
            { lat: 45.76, lon: 4.86 },
            { lat: 46.0, lon: 6.0 },
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
      expect(within(items[1]).queryByRole('button', { name: /Étape utilisateur|Destination/ })).not.toBeInTheDocument()

      cliquerCarte(45.77, 4.87) // point de passage n°2 : devient le dernier point posé
      items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(items[2]).toHaveTextContent('Point de passage')
      expect(within(items[2]).getByRole('button', { name: 'Destination' })).toBeInTheDocument()
      // Le point n°1, déjà qualifié, ne récupère pas de sélecteur.
      expect(within(items[1]).queryByRole('button', { name: /Étape utilisateur|Destination/ })).not.toBeInTheDocument()

      await user.click(within(items[2]).getByRole('button', { name: 'Destination' }))

      await waitFor(() =>
        expect(vi.mocked(calculerParcours).mock.calls[0][0]).toEqual([
          { lat: 45.75, lon: 4.85 },
          { lat: 45.76, lon: 4.86 },
          { lat: 45.77, lon: 4.87 },
        ]),
      )

      // Un point posé une fois la Destination qualifiée s'insère comme
      // Point de passage juste avant elle (spec-2-3, "ajout après un tracé
      // déjà posé"), pas ignoré comme avant cette story.
      await screen.findByTestId('trace')
      cliquerCarte(46.0, 6.0)
      expect(screen.getAllByTestId('marqueur')).toHaveLength(4)
      items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(4)
      expect(items[2]).toHaveTextContent('Point de passage')
      expect(items[3]).toHaveTextContent('Destination')

      await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))
      expect(vi.mocked(calculerParcours).mock.calls[1][0]).toEqual([
        { lat: 45.75, lon: 4.85 },
        { lat: 45.76, lon: 4.86 },
        { lat: 46.0, lon: 6.0 },
        { lat: 45.77, lon: 4.87 },
      ])
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

describe('Atelier — édition d’un parcours déjà posé (spec-2-3)', () => {
  it('déplacement d’un point existant (marqueur draggable) : position mise à jour, recalcul auto, dernier tracé visible pendant "Mise à jour…"', async () => {
    const user = userEvent.setup()
    let resoudreDeuxiemeCalcul: ((valeur: ResultatParcours) => void) | undefined
    vi.mocked(calculerParcours)
      .mockResolvedValueOnce(RESULTAT_ROUTE_DEFAUT)
      .mockImplementationOnce(
        () =>
          new Promise<ResultatParcours>((resolve) => {
            resoudreDeuxiemeCalcul = resolve
          }),
      )

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')

    glisserMarqueur(45.76, 4.86, 45.9, 4.95)

    // Le tracé précédent ne disparaît jamais pendant un recalcul (Banned
    // UX, cf. Boundaries) et le statut annonce "Mise à jour…", pas "Calcul
    // du parcours…" (réservé au tout premier calcul, NFR-4).
    expect(screen.getByTestId('trace')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Mise à jour…')
    expect(screen.getAllByTestId('marqueur').some((marqueur) => marqueur.getAttribute('data-lat') === '45.9')).toBe(
      true,
    )

    resoudreDeuxiemeCalcul?.({
      ...RESULTAT_ROUTE_DEFAUT,
      id: 'd2',
      geometrie: [
        { lat: 45.75, lon: 4.85 },
        { lat: 45.9, lon: 4.95 },
      ],
    })

    await waitFor(() =>
      expect(vi.mocked(calculerParcours).mock.calls[1][0]).toEqual([
        { lat: 45.75, lon: 4.85 },
        { lat: 45.9, lon: 4.95 },
      ]),
    )
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('échec du recalcul après déplacement : le dernier tracé valide reste affiché (comportement 2.1)', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours)
      .mockResolvedValueOnce(RESULTAT_ROUTE_DEFAUT)
      .mockRejectedValueOnce(
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
    await screen.findByTestId('trace')

    glisserMarqueur(45.76, 4.86, 45.9, 4.95)

    expect(await screen.findByText(/moteur de routage est indisponible/)).toBeInTheDocument()
    expect(screen.getByTestId('trace')).toBeInTheDocument()
  })

  it('suppression du Départ (autres points présents) : le point suivant devient Départ, recalcul suit les règles déjà en place', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Départ')
    await user.click(within(items[0]).getByRole('button', { name: 'Supprimer ce point' }))

    // Le point restant (ex-Destination) devient le nouveau Départ à sa
    // position d'origine ; plus de Destination donc plus de calcul déclenché
    // (« le calcul suit les règles déjà en place », cf. Boundaries).
    const nouveauxItems = screen.getAllByRole('listitem')
    expect(nouveauxItems).toHaveLength(1)
    expect(nouveauxItems[0]).toHaveTextContent('Départ')
    const marqueurs = screen.getAllByTestId('marqueur')
    expect(marqueurs).toHaveLength(1)
    expect(marqueurs[0]).toHaveAttribute('data-lat', '45.76')
    expect(calculerParcours).toHaveBeenCalledTimes(1) // un seul calcul, avant la suppression

    // Le nouveau Départ reste éditable normalement : un point posé ensuite
    // redevient une Destination (topologie déjà choisie, inchangée).
    cliquerCarte(46.0, 6.0)
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))
  })

  it('suppression du Départ, seul point restant : retour à l’état vide (équivalent reset complet)', async () => {
    const user = userEvent.setup()
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    await user.click(within(items[0]).getByRole('button', { name: 'Supprimer ce point' }))

    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Parcours en cours' })).not.toBeInTheDocument()

    // Retour à l'état initial : reposer un point redevient un Départ, avec
    // le choix de topologie de nouveau imposé.
    cliquerCarte(45.8, 4.9)
    expect(await screen.findByRole('region', { name: 'Choix de la topologie' })).toBeInTheDocument()
  })

  it('suppression d’un point qui n’est pas le Départ : simplement retiré, liste et carte synchronisées, recalcul', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    let items = screen.getAllByRole('listitem')
    await user.click(within(items[1]).getByRole('button', { name: 'Destination' }))
    await screen.findByTestId('trace')
    cliquerCarte(46.9, 5.0) // waypoint inséré avant la Destination (spec-2-3)
    // Le point posé déclenche lui-même un recalcul (spec-2-3) : on attend
    // qu'il ait eu lieu avant de compter les appels liés à la suppression.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(2))

    items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(within(items[1]).getByRole('button', { name: 'Supprimer ce point' }))

    const nouveauxItems = screen.getAllByRole('listitem')
    expect(nouveauxItems).toHaveLength(2)
    expect(nouveauxItems[0]).toHaveTextContent('Départ')
    expect(nouveauxItems[1]).toHaveTextContent('Destination')
    expect(screen.getAllByTestId('marqueur')).toHaveLength(2)

    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.75, lon: 4.85 },
      { lat: 45.76, lon: 4.86 },
    ])
  })

  it('réordonnancement (boutons ↑/↓) : ordre mis à jour dans les points, jamais sur Départ ni Destination, recalcul', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    let items = screen.getAllByRole('listitem')
    await user.click(within(items[1]).getByRole('button', { name: 'Étape utilisateur' }))

    cliquerCarte(45.77, 4.87) // point de passage n°2, dernier point posé
    items = screen.getAllByRole('listitem')
    await user.click(within(items[2]).getByRole('button', { name: 'Destination' }))
    await screen.findByTestId('trace')

    // Un point posé une fois la Destination qualifiée s'insère juste avant
    // elle (spec-2-3) : ordre attendu Départ, Étape utilisateur, Point de
    // passage, Destination.
    cliquerCarte(45.78, 4.88)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4))

    items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[1]).toHaveTextContent('Étape utilisateur')
    expect(items[2]).toHaveTextContent('Point de passage')
    expect(items[3]).toHaveTextContent('Destination')

    // Départ et Destination n'ont jamais de boutons ↑/↓ (positions fixes).
    expect(within(items[0]).queryByRole('button', { name: /Monter|Descendre/ })).not.toBeInTheDocument()
    expect(within(items[3]).queryByRole('button', { name: /Monter|Descendre/ })).not.toBeInTheDocument()

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length

    // Fait remonter le Point de passage (index 2) au-dessus de l'Étape
    // utilisateur (index 1).
    await user.click(within(items[2]).getByRole('button', { name: 'Monter' }))

    const nouveauxItems = screen.getAllByRole('listitem')
    expect(nouveauxItems[1]).toHaveTextContent('Point de passage')
    expect(nouveauxItems[2]).toHaveTextContent('Étape utilisateur')

    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.75, lon: 4.85 },
      { lat: 45.78, lon: 4.88 },
      { lat: 45.76, lon: 4.86 },
      { lat: 45.77, lon: 4.87 },
    ])
  })

  it('réordonnancement : le bouton "Monter" sur le premier Point de passage est un no-op (jamais devant le Départ)', async () => {
    const user = userEvent.setup()
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1

    const items = screen.getAllByRole('listitem')
    await user.click(within(items[1]).getByRole('button', { name: 'Monter' }))

    const memeItems = screen.getAllByRole('listitem')
    expect(memeItems[0]).toHaveTextContent('Départ')
    expect(memeItems[1]).toHaveTextContent('Point de passage')
  })

  it('premier calcul : le statut affiche "Calcul du parcours…", jamais "Mise à jour…" (NFR-4)', async () => {
    const user = userEvent.setup()
    let resoudrePremierCalcul: ((valeur: ResultatParcours) => void) | undefined
    vi.mocked(calculerParcours).mockImplementationOnce(
      () =>
        new Promise<ResultatParcours>((resolve) => {
          resoudrePremierCalcul = resolve
        }),
    )

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination : déclenche le tout premier calcul

    expect(await screen.findByRole('status')).toHaveTextContent('Calcul du parcours…')

    resoudrePremierCalcul?.(RESULTAT_ROUTE_DEFAUT)
    await screen.findByTestId('trace')
  })

  it('suppression de la Destination (aller simple, un point de passage déjà inséré) : le tracé obsolète disparaît, le clic suivant re-qualifie une nouvelle Destination', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')
    cliquerCarte(45.8, 4.9) // point de passage inséré avant la Destination (spec-2-3)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))

    let items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Point de passage')
    expect(items[2]).toHaveTextContent('Destination')
    await user.click(within(items[2]).getByRole('button', { name: 'Supprimer ce point' }))

    // Plus de Destination qualifiée : le dernier tracé (qui décrivait des
    // points qui n'existent plus) ne doit jamais rester affiché tel quel.
    items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items.some((item) => item.textContent?.includes('Destination'))).toBe(false)
    await waitFor(() => expect(screen.queryByTestId('trace')).not.toBeInTheDocument())

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    cliquerCarte(45.9, 5.0) // ne doit plus être ignoré : re-qualifie une Destination

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    const nouveauxItems = screen.getAllByRole('listitem')
    expect(nouveauxItems[2]).toHaveTextContent('Destination')
    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    await screen.findByTestId('trace')
  })
})
