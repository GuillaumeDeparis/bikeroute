import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Accueil } from './Accueil'
import { getSession } from '../api/client'

// Le sondage périodique de session doit rester en pause tant que l'onglet
// est en arrière-plan, y compris au montage -- trouvé sans couverture (et
// en défaut) en revue de l'épic 1.
vi.mock('../api/client', () => ({ getSession: vi.fn() }))

function definirVisibilite(cache: boolean) {
  Object.defineProperty(document, 'hidden', { value: cache, configurable: true })
}

afterEach(() => {
  cleanup()
  vi.mocked(getSession).mockReset()
  definirVisibilite(false)
})

describe('Accueil — sondage de session lié à la visibilité de l’onglet', () => {
  it("ne sonde pas la session au montage si l'onglet est déjà en arrière-plan", async () => {
    definirVisibilite(true)
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<Accueil identifiant="alice" onSessionExpiree={vi.fn()} />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getSession).not.toHaveBeenCalled()
  })

  it("sonde la session au montage si l'onglet est au premier plan", async () => {
    definirVisibilite(false)
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<Accueil identifiant="alice" onSessionExpiree={vi.fn()} />)

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
  })

  it("reprend le sondage quand l'onglet redevient visible après un montage en arrière-plan", async () => {
    definirVisibilite(true)
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<Accueil identifiant="alice" onSessionExpiree={vi.fn()} />)
    expect(getSession).not.toHaveBeenCalled()

    definirVisibilite(false)
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
  })
})
