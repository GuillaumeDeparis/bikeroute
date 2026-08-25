import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculerParcours, rechercherAdresse } from './client'

// `Atelier.test.tsx` mocke tout `../api/client` : le mapping snake_case
// (réponse backend) -> camelCase (`ResultatParcours`/`ResultatAdresse`) n'y
// est donc jamais réellement exécuté. Ces tests stubent `global.fetch`
// directement pour l'exercer pour de vrai, champ par champ -- un swap entre
// deux champs tous deux typés `string` (ex. `provider`/`provider_version`)
// ne serait pas détecté par TypeScript, seulement par une assertion sur des
// valeurs distinctes comme ci-dessous.
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('calculerParcours — mapping snake_case -> camelCase', () => {
  it('mappe chaque champ individuellement, sans confondre provider/provider_version', async () => {
    const fetchMock = stubFetch(201, {
      id: 'route-id-123',
      statut: 'routed',
      geometry: [
        { lat: 45.0, lon: 5.0 },
        { lat: 45.005, lon: 5.005 },
      ],
      unrouted_points: [{ lat: 46.0, lon: 6.5 }],
      provider: 'valhalla',
      provider_version: '3.8.3',
      created_at: '2026-08-23T00:00:00Z',
      // Valeurs distinctes exprès sur chaque champ (spec-2-5, revue post-
      // implémentation) : ce test est le seul à exercer le vrai mapping
      // `client.ts` (`Atelier.test.tsx` mocke tout le module) -- sans lui,
      // un swap `revetements`/`categories_routieres` (deux
      // `Record<string, number>`, indétectable par le typage) ou des champs
      // `profil`/`montees_significatives` mélangés passeraient inaperçus.
      metriques: {
        version: '2',
        distance_m: 12345,
        denivele_positif_m: 210,
        denivele_negatif_m: 180,
        duree_s: 3620,
        difficulte: 'modere',
        revetements: { asphalte: 0.7, inconnu: 0.3 },
        categories_routieres: { residential: 0.9, cycleway: 0.1 },
        profil: [
          { distance_m: 0, elevation_m: 100 },
          { distance_m: 500, elevation_m: 150 },
        ],
        montees_significatives: [{ distance_m: 800, denivele_m: 60, pente_moyenne: 7.5 }],
      },
    })

    const resultat = await calculerParcours([
      { lat: 45.0, lon: 5.0 },
      { lat: 45.005, lon: 5.005 },
    ])

    expect(resultat.id).toBe('route-id-123')
    expect(resultat.statut).toBe('routed')
    expect(resultat.geometrie).toEqual([
      { lat: 45.0, lon: 5.0 },
      { lat: 45.005, lon: 5.005 },
    ])
    expect(resultat.pointsNonRoutes).toEqual([{ lat: 46.0, lon: 6.5 }])
    // Valeurs distinctes exprès : un swap `provider`/`provider_version`
    // (deux `string`, indétectable par le typage) romprait ces assertions.
    expect(resultat.fournisseur).toBe('valhalla')
    expect(resultat.versionFournisseur).toBe('3.8.3')
    expect(resultat.createdAt).toBe('2026-08-23T00:00:00Z')

    expect(resultat.metriques?.version).toBe('2')
    expect(resultat.metriques?.distanceM).toBe(12345)
    // Valeurs distinctes exprès : un swap `denivele_positif_m`/
    // `denivele_negatif_m` romprait ces deux assertions.
    expect(resultat.metriques?.denivelePositifM).toBe(210)
    expect(resultat.metriques?.deniveleNegatifM).toBe(180)
    expect(resultat.metriques?.dureeS).toBe(3620)
    expect(resultat.metriques?.difficulte).toBe('modere')
    // Valeurs et clés distinctes exprès : un swap `revetements`/
    // `categories_routieres` romprait ces deux assertions (clés différentes,
    // pas seulement des valeurs).
    expect(resultat.metriques?.revetements).toEqual({ asphalte: 0.7, inconnu: 0.3 })
    expect(resultat.metriques?.categoriesRoutieres).toEqual({ residential: 0.9, cycleway: 0.1 })
    expect(resultat.metriques?.profil).toEqual([
      { distanceM: 0, elevationM: 100 },
      { distanceM: 500, elevationM: 150 },
    ])
    expect(resultat.metriques?.monteesSignificatives).toEqual([{ distanceM: 800, deniveleM: 60, penteMoyenne: 7.5 }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/routes/calculate')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(init.body as string)).toEqual({
      points: [
        { lat: 45.0, lon: 5.0 },
        { lat: 45.005, lon: 5.005 },
      ],
    })
  })

  it('métriques sans `profil`/`montees_significatives` (dérive de contrat) : mappe en tableaux vides, sans lever', async () => {
    stubFetch(201, {
      id: 'route-id-456',
      statut: 'routed',
      geometry: [],
      unrouted_points: [],
      provider: 'valhalla',
      provider_version: '3.8.3',
      created_at: '2026-08-23T00:00:00Z',
      metriques: {
        version: '2',
        distance_m: 100,
        denivele_positif_m: 0,
        denivele_negatif_m: 0,
        duree_s: 10,
        difficulte: 'facile',
        revetements: { inconnu: 0 },
        categories_routieres: { inconnu: 0 },
        // `profil`/`montees_significatives` volontairement absents.
      },
    })

    const resultat = await calculerParcours([
      { lat: 45.0, lon: 5.0 },
      { lat: 45.001, lon: 5.001 },
    ])

    expect(resultat.metriques?.profil).toEqual([])
    expect(resultat.metriques?.monteesSignificatives).toEqual([])
  })

  it('propage un `AbortSignal` fourni par l’appelant', async () => {
    const fetchMock = stubFetch(201, {
      id: 'r',
      statut: 'routed',
      geometry: [],
      unrouted_points: [],
      provider: 'valhalla',
      provider_version: '3.8.3',
      created_at: '2026-08-23T00:00:00Z',
    })
    const controleur = new AbortController()

    await calculerParcours([], { signal: controleur.signal })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBe(controleur.signal)
  })
})

describe('rechercherAdresse — mapping de la réponse `GET /api/geocode`', () => {
  it('renvoie les résultats tels que renvoyés par le proxy geocode', async () => {
    const fetchMock = stubFetch(200, [
      { label: 'Paris, France', lat: 48.8566, lon: 2.3522 },
      { label: 'Paris, Texas, États-Unis', lat: 33.6609, lon: -95.5555 },
    ])

    const resultats = await rechercherAdresse('Paris')

    expect(resultats).toEqual([
      { label: 'Paris, France', lat: 48.8566, lon: 2.3522 },
      { label: 'Paris, Texas, États-Unis', lat: 33.6609, lon: -95.5555 },
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/geocode?q=Paris')
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
  })

  it('encode la requête dans l’URL', async () => {
    stubFetch(200, [])

    await rechercherAdresse('rue de la Paix & Cie')

    const fetchMock = vi.mocked(fetch)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/geocode?q=${encodeURIComponent('rue de la Paix & Cie')}`)
  })
})
