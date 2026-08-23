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
