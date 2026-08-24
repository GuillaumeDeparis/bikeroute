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
    icon,
  }: {
    position: [number, number]
    draggable?: boolean
    eventHandlers?: { dragend?: (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void }
    // `L.DivIcon` réel (icône numérotée, cf. `icôneNumerotee`) : seul
    // `options.html` nous intéresse ici, pour vérifier le numéro affiché
    // sans dépendre du rendu Leaflet réel.
    icon?: { options: { html: string } }
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
      >
        {icon && <span data-testid="marqueur-numero" dangerouslySetInnerHTML={{ __html: icon.options.html }} />}
      </div>
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

const METRIQUES_DEFAUT = {
  version: '1',
  distanceM: 12345,
  denivelePositifM: 210,
  deniveleNegatifM: 180,
  dureeS: 3620,
  difficulte: 'modere' as const,
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

      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(2)
      expect(items[1]).toHaveTextContent('Point de passage 1')
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

describe('Atelier — inversion du sens (spec-2-4)', () => {
  it('Boucle avec 2 Points de passage : « Inverser » garde le Départ, inverse l’ordre des Points de passage, recalcule', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    cliquerCarte(45.77, 4.87) // point de passage n°2
    await screen.findByTestId('trace')

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Inverser' }))

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[1]).toHaveTextContent('Point de passage')
    expect(items[2]).toHaveTextContent('Point de passage')
    // Le Départ n'a pas bougé (toujours 45.75/4.85), seul l'ordre des deux
    // Points de passage est inversé.
    expect(screen.getAllByTestId('marqueur')[0]).toHaveAttribute('data-lat', '45.75')

    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.75, lon: 4.85 },
      { lat: 45.77, lon: 4.87 },
      { lat: 45.76, lon: 4.86 },
      { lat: 45.75, lon: 4.85 }, // fermeture de boucle par répétition du départ
    ])
  })

  it('Aller simple sans point de passage : « Inverser » échange Départ et Destination, recalcule', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Inverser' }))

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[1]).toHaveTextContent('Destination')
    // Les positions ont bien été échangées : le nouveau Départ est
    // l'ancienne Destination et inversement.
    const marqueurs = screen.getAllByTestId('marqueur')
    expect(marqueurs[0]).toHaveAttribute('data-lat', '45.76')
    expect(marqueurs[1]).toHaveAttribute('data-lat', '45.75')

    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.76, lon: 4.86 },
      { lat: 45.75, lon: 4.85 },
    ])
  })

  it('Aller simple avec un point de passage : « Inverser » inverse tout l’ordre, le Point de passage reste au milieu, recalcule', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')
    cliquerCarte(46.0, 6.0) // point de passage inséré avant la Destination (spec-2-3)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Inverser' }))

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[1]).toHaveTextContent('Point de passage')
    expect(items[2]).toHaveTextContent('Destination')

    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.76, lon: 4.86 }, // ex-Destination, nouveau Départ
      { lat: 46.0, lon: 6.0 }, // Point de passage, conservé au milieu
      { lat: 45.75, lon: 4.85 }, // ex-Départ, nouvelle Destination
    ])
  })

  it('Bouton « Inverser » absent en Multi-étapes, ou pour une Boucle/un Aller simple incomplet', async () => {
    const user = userEvent.setup()
    render(<Atelier onRetourAccueil={vi.fn()} />)

    // Boucle sans Point de passage : incomplet, pas de bouton.
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    expect(screen.queryByRole('button', { name: 'Inverser' })).not.toBeInTheDocument()

    cliquerCarte(45.76, 4.86) // point de passage n°1 : la Boucle devient complète
    expect(screen.getByRole('button', { name: 'Inverser' })).toBeInTheDocument()

    // Suppression du Point de passage (seul point restant après le Départ) :
    // la Boucle redevient incomplète, le bouton disparaît.
    let items = screen.getAllByRole('listitem')
    await user.click(within(items[1]).getByRole('button', { name: 'Supprimer ce point' }))
    expect(screen.getAllByTestId('marqueur')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Inverser' })).not.toBeInTheDocument()

    // Retour à l'état vide, puis Aller simple sans Destination : incomplet.
    items = screen.getAllByRole('listitem')
    await user.click(within(items[0]).getByRole('button', { name: 'Supprimer ce point' }))
    expect(screen.queryAllByTestId('marqueur')).toHaveLength(0)

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    expect(screen.queryByRole('button', { name: 'Inverser' })).not.toBeInTheDocument()

    // Retour à l'état vide, puis Multi-étapes avec une Destination qualifiée :
    // hors scope de cette story, jamais de bouton même une fois complet.
    items = screen.getAllByRole('listitem')
    await user.click(within(items[0]).getByRole('button', { name: 'Supprimer ce point' }))

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    const itemsMultiEtapes = screen.getAllByRole('listitem')
    await user.click(within(itemsMultiEtapes[1]).getByRole('button', { name: 'Destination' }))
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Destination')
    expect(screen.queryByRole('button', { name: 'Inverser' })).not.toBeInTheDocument()
  })

  it('inversion (Boucle) : le statut affiche "Mise à jour…" pendant le recalcul, le tracé précédent reste affiché', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1 -- déclenche déjà un calcul
    cliquerCarte(45.77, 4.87) // point de passage n°2 -- et un second
    await screen.findByTestId('trace')
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))

    // Seul le calcul déclenché par "Inverser" (pas ceux de la pose des
    // points ci-dessus) doit rester en attente pour observer le statut.
    let resoudreCalculInversion: ((valeur: ResultatParcours) => void) | undefined
    vi.mocked(calculerParcours).mockImplementationOnce(
      () =>
        new Promise<ResultatParcours>((resolve) => {
          resoudreCalculInversion = resolve
        }),
    )

    await user.click(screen.getByRole('button', { name: 'Inverser' }))

    // Comme pour toute autre édition (spec-2-3) : jamais "Calcul du
    // parcours…" (réservé au tout premier calcul) une fois un tracé déjà
    // affiché, et le tracé précédent ne disparaît jamais pendant le recalcul.
    expect(screen.getByTestId('trace')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Mise à jour…')

    resoudreCalculInversion?.(RESULTAT_ROUTE_DEFAUT)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('Aller simple avec deux points de passage : « Inverser » inverse tout l’ordre, les deux Points de passage aussi', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86) // destination
    await screen.findByTestId('trace')
    cliquerCarte(46.0, 6.0) // point de passage n°1, inséré avant la Destination
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(2))
    cliquerCarte(46.5, 6.5) // point de passage n°2, inséré avant la Destination
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4))
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(3))

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Inverser' }))

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[1]).toHaveTextContent('Point de passage')
    expect(items[2]).toHaveTextContent('Point de passage')
    expect(items[3]).toHaveTextContent('Destination')

    // L'ordre complet est inversé, pas seulement les deux extrémités : les
    // deux Points de passage intermédiaires échangent aussi leur position.
    await waitFor(() => expect(vi.mocked(calculerParcours).mock.calls.length).toBe(nombreCalculsAvant + 1))
    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.76, lon: 4.86 }, // ex-Destination, nouveau Départ
      { lat: 46.5, lon: 6.5 }, // ex-2e point de passage, maintenant 1er
      { lat: 46.0, lon: 6.0 }, // ex-1er point de passage, maintenant 2e
      { lat: 45.75, lon: 4.85 }, // ex-Départ, nouvelle Destination
    ])
  })

  it('inversion appliquée deux fois (Boucle) : revient à l’ordre initial', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue(RESULTAT_ROUTE_DEFAUT)

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    cliquerCarte(45.77, 4.87) // point de passage n°2
    await screen.findByTestId('trace')

    const nombreCalculsAvant = vi.mocked(calculerParcours).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Inverser' }))
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(nombreCalculsAvant + 1))
    await user.click(screen.getByRole('button', { name: 'Inverser' }))
    await waitFor(() => expect(calculerParcours).toHaveBeenCalledTimes(nombreCalculsAvant + 2))

    expect(vi.mocked(calculerParcours).mock.calls.at(-1)?.[0]).toEqual([
      { lat: 45.75, lon: 4.85 },
      { lat: 45.76, lon: 4.86 },
      { lat: 45.77, lon: 4.87 },
      { lat: 45.75, lon: 4.85 },
    ])
  })
})

describe('Atelier — bulle de métriques (spec-2-5)', () => {
  it('parcours routé : la bulle compacte affiche distance, D+ et durée', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86)

    const bulle = await screen.findByRole('region', { name: 'Métriques du parcours' })
    expect(within(bulle).getByText('12,3 km')).toBeInTheDocument()
    expect(within(bulle).getByText('210 m')).toBeInTheDocument()
    expect(within(bulle).getByText('1 h 00')).toBeInTheDocument()
    // Repliée par défaut : D- et difficulté pas encore affichés.
    expect(within(bulle).queryByText('180 m')).not.toBeInTheDocument()
    expect(within(bulle).queryByText('Modéré')).not.toBeInTheDocument()
  })

  it('bulle déployée : ajoute D- et difficulté', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86)
    const bulle = await screen.findByRole('region', { name: 'Métriques du parcours' })

    await user.click(within(bulle).getByRole('button', { name: /Résumé du parcours/ }))

    expect(within(bulle).getByText('180 m')).toBeInTheDocument()
    expect(within(bulle).getByText('Modéré')).toBeInTheDocument()
    // Toujours visibles également (compact + déployé, jamais remplacés).
    expect(within(bulle).getByText('12,3 km')).toBeInTheDocument()
  })

  it('parcours non routé : aucune bulle de métriques affichée', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours).mockResolvedValue({
      id: 'r-non-route',
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

    await screen.findByRole('alert')
    expect(screen.queryByRole('region', { name: 'Métriques du parcours' })).not.toBeInTheDocument()
  })

  it('recalcul en cours (édition d’un point) : les dernières métriques valides restent affichées avec "Mise à jour…"', async () => {
    const user = userEvent.setup()
    let resoudreDeuxiemeCalcul: ((valeur: ResultatParcours) => void) | undefined
    vi.mocked(calculerParcours)
      .mockResolvedValueOnce({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })
      .mockImplementationOnce(
        () =>
          new Promise<ResultatParcours>((resolve) => {
            resoudreDeuxiemeCalcul = resolve
          }),
      )

    render(<Atelier onRetourAccueil={vi.fn()} />)
    cliquerCarte(45.75, 4.85)
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86)
    await screen.findByRole('region', { name: 'Métriques du parcours' })

    glisserMarqueur(45.76, 4.86, 45.9, 4.95)

    expect(await screen.findByRole('status')).toHaveTextContent('Mise à jour…')
    const bulle = screen.getByRole('region', { name: 'Métriques du parcours' })
    expect(within(bulle).getByText('12,3 km')).toBeInTheDocument()

    resoudreDeuxiemeCalcul?.({
      ...RESULTAT_ROUTE_DEFAUT,
      id: 'd2',
      metriques: { ...METRIQUES_DEFAUT, distanceM: 15000 },
    })

    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Métriques du parcours' })).getByText('15,0 km')).toBeInTheDocument())
  })

  it('échec du fournisseur (routage ou élévation) : les dernières métriques valides restent affichées, même erreur structurée que le routage', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours)
      .mockResolvedValueOnce({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })
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
    await screen.findByRole('region', { name: 'Métriques du parcours' })

    glisserMarqueur(45.76, 4.86, 45.9, 4.95)

    expect(await screen.findByText(/moteur de routage est indisponible/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Métriques du parcours' })).toBeInTheDocument()
  })

  it('nouveau parcours après une réinitialisation complète : la bulle repart toujours repliée, même si le précédent parcours était déployé', async () => {
    const user = userEvent.setup()
    vi.mocked(calculerParcours)
      .mockResolvedValueOnce({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })
      .mockResolvedValueOnce({
        id: 'r-non-route',
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
    cliquerCarte(45.76, 4.86)
    const bulle = await screen.findByRole('region', { name: 'Métriques du parcours' })
    await user.click(within(bulle).getByRole('button', { name: /Résumé du parcours/ }))
    expect(within(bulle).getByText('Modéré')).toBeInTheDocument()

    // Édition menant à un point non routé, puis réinitialisation complète
    // (bouton « Supprimer » du bandeau, P4) : points/topologie/trace/
    // métriques repartent à zéro.
    glisserMarqueur(45.76, 4.86, 46.0, 6.5)
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    expect(screen.queryByRole('region', { name: 'Métriques du parcours' })).not.toBeInTheDocument()

    // Nouveau parcours routé : la bulle réapparaît, mais compacte -- son
    // état déployé du précédent parcours n'a pas survécu à la réinitialisation.
    vi.mocked(calculerParcours).mockResolvedValueOnce({ ...RESULTAT_ROUTE_DEFAUT, metriques: METRIQUES_DEFAUT })
    cliquerCarte(45.75, 4.85)
    await user.click(screen.getByRole('button', { name: 'Aller simple' }))
    cliquerCarte(45.76, 4.86)

    const nouvelleBulle = await screen.findByRole('region', { name: 'Métriques du parcours' })
    expect(within(nouvelleBulle).getByText('12,3 km')).toBeInTheDocument()
    expect(within(nouvelleBulle).queryByText('Modéré')).not.toBeInTheDocument()
  })
})

describe('Atelier — numérotation des points de passage', () => {
  it('plusieurs Points de passage sont numérotés dans leur ordre, sur la carte comme dans la liste ; Départ/Destination ne le sont pas', async () => {
    const user = userEvent.setup()
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Multi-étapes' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    let items = screen.getAllByRole('listitem')
    await user.click(within(items[1]).getByRole('button', { name: 'Étape utilisateur' }))
    cliquerCarte(45.77, 4.87) // point de passage n°2
    items = screen.getAllByRole('listitem')
    await user.click(within(items[2]).getByRole('button', { name: 'Destination' }))

    items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    // Numérotés dans l'ordre du parcours, quel que soit leur rôle exact
    // (Étape utilisateur ou Point de passage) -- jamais le Départ/la
    // Destination, uniques et déjà identifiables par leur rôle seul.
    expect(items[0]).toHaveTextContent('Départ')
    expect(items[0]).not.toHaveTextContent(/\d/)
    expect(items[1]).toHaveTextContent('Étape utilisateur 1')
    expect(items[2]).toHaveTextContent('Destination')
    expect(items[2]).not.toHaveTextContent(/\d/)

    const marqueurs = screen.getAllByTestId('marqueur')
    expect(marqueurs).toHaveLength(3)
    expect(within(marqueurs[0]).queryByTestId('marqueur-numero')).not.toBeInTheDocument() // Départ
    expect(within(marqueurs[1]).getByTestId('marqueur-numero')).toHaveTextContent('1')
    expect(within(marqueurs[2]).queryByTestId('marqueur-numero')).not.toBeInTheDocument() // Destination
  })

  it('réordonner deux Points de passage garde leur numéro respectif (pas un recalcul par position)', async () => {
    const user = userEvent.setup()
    render(<Atelier onRetourAccueil={vi.fn()} />)

    cliquerCarte(45.75, 4.85) // départ
    await user.click(screen.getByRole('button', { name: 'Boucle' }))
    cliquerCarte(45.76, 4.86) // point de passage n°1
    cliquerCarte(45.77, 4.87) // point de passage n°2

    let items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Point de passage 1')
    expect(items[2]).toHaveTextContent('Point de passage 2')

    // Fait remonter le 2e point de passage au-dessus du 1er : seul l'ordre
    // change, chaque point garde le numéro qui lui a été attribué à sa
    // création (pas de renumérotation 1/2 par position).
    await user.click(within(items[2]).getByRole('button', { name: 'Monter' }))

    items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Point de passage 2')
    expect(items[2]).toHaveTextContent('Point de passage 1')

    const marqueurs = screen.getAllByTestId('marqueur')
    expect(within(marqueurs[1]).getByTestId('marqueur-numero')).toHaveTextContent('2')
    expect(within(marqueurs[2]).getByTestId('marqueur-numero')).toHaveTextContent('1')
  })
})
