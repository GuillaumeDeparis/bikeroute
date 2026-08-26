import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    render(<Accueil identifiant="alice" onOuvrirAtelier={vi.fn()} onSessionExpiree={vi.fn()} />)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getSession).not.toHaveBeenCalled()
  })

  it("sonde la session au montage si l'onglet est au premier plan", async () => {
    definirVisibilite(false)
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<Accueil identifiant="alice" onOuvrirAtelier={vi.fn()} onSessionExpiree={vi.fn()} />)

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
  })

  it("reprend le sondage quand l'onglet redevient visible après un montage en arrière-plan", async () => {
    definirVisibilite(true)
    vi.mocked(getSession).mockResolvedValue({ identifiant: 'alice' })

    render(<Accueil identifiant="alice" onOuvrirAtelier={vi.fn()} onSessionExpiree={vi.fn()} />)
    expect(getSession).not.toHaveBeenCalled()

    definirVisibilite(false)
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
  })
})

describe('Accueil — ouverture de l’Atelier (Story 2.1)', () => {
  it("le CTA « Ouvrir l'Atelier » est actif et déclenche la navigation", async () => {
    definirVisibilite(true) // évite tout appel réseau parasite via le sondage de session dans ce test
    const user = userEvent.setup()
    const onOuvrirAtelier = vi.fn()

    render(<Accueil identifiant="alice" onOuvrirAtelier={onOuvrirAtelier} onSessionExpiree={vi.fn()} />)
    const cta = screen.getByRole('button', { name: "Ouvrir l'Atelier" })
    expect(cta).not.toHaveAttribute('aria-disabled')

    await user.click(cta)

    expect(onOuvrirAtelier).toHaveBeenCalledTimes(1)
  })
})

describe('Accueil — lien vers Mes parcours (Story 2.6)', () => {
  it("le lien « Voir Mes parcours » déclenche la navigation", async () => {
    definirVisibilite(true)
    const user = userEvent.setup()
    const onOuvrirMesParcours = vi.fn()

    render(
      <Accueil
        identifiant="alice"
        onOuvrirAtelier={vi.fn()}
        onOuvrirMesParcours={onOuvrirMesParcours}
        onSessionExpiree={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Voir Mes parcours' }))

    expect(onOuvrirMesParcours).toHaveBeenCalledTimes(1)
  })
})
