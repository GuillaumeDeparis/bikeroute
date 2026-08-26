import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppHeader } from './AppHeader'
import { logout } from '../api/client'

// La branche succès/échec de la déconnexion, et la persistance du message
// d'erreur au-delà de la tentative qui l'a produit, n'étaient couvertes par
// aucun test (trouvé en revue de l'épic 1).
vi.mock('../api/client', () => ({ logout: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.mocked(logout).mockReset()
})

async function ouvrirMenuEtDeconnecter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'alice' }))
  await user.click(screen.getByRole('menuitem', { name: /Déconnexion/ }))
}

describe('AppHeader — Account menu', () => {
  it('une déconnexion réussie ferme le menu et notifie le parent', async () => {
    const user = userEvent.setup()
    vi.mocked(logout).mockResolvedValue(undefined)
    const onDeconnexion = vi.fn()

    render(<AppHeader identifiant="alice" onDeconnexion={onDeconnexion} />)
    await ouvrirMenuEtDeconnecter(user)

    await waitFor(() => expect(onDeconnexion).toHaveBeenCalledTimes(1))
  })

  it("une déconnexion en échec garde l'utilisateur connecté et affiche une erreur", async () => {
    const user = userEvent.setup()
    vi.mocked(logout).mockRejectedValue(new Error('réseau'))
    const onDeconnexion = vi.fn()

    render(<AppHeader identifiant="alice" onDeconnexion={onDeconnexion} />)
    await ouvrirMenuEtDeconnecter(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('La déconnexion a échoué. Réessayez.')
    expect(onDeconnexion).not.toHaveBeenCalled()
  })

  it("un message d'échec ne resurgit pas à une réouverture du menu sans rapport", async () => {
    const user = userEvent.setup()
    vi.mocked(logout).mockRejectedValue(new Error('réseau'))

    render(<AppHeader identifiant="alice" onDeconnexion={vi.fn()} />)
    await ouvrirMenuEtDeconnecter(user)
    await screen.findByRole('alert')

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'alice' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Échap referme le menu et restaure le focus sur le déclencheur', async () => {
    const user = userEvent.setup()

    render(<AppHeader identifiant="alice" onDeconnexion={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'alice' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'alice' })).toHaveFocus()
  })

  it('déplace le focus sur le premier item du menu à son ouverture', async () => {
    const user = userEvent.setup()

    render(<AppHeader identifiant="alice" onDeconnexion={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'alice' }))

    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Mes parcours/ })).toHaveFocus())
  })

  it("« Mes parcours » (story 2.6) ferme le menu et notifie le parent, sans mention « Bientôt disponible »", async () => {
    const user = userEvent.setup()
    const onOuvrirMesParcours = vi.fn()

    render(<AppHeader identifiant="alice" onDeconnexion={vi.fn()} onOuvrirMesParcours={onOuvrirMesParcours} />)
    await user.click(screen.getByRole('button', { name: 'alice' }))
    // "Exporter mes données" reste inerte (hors scope de cette story) --
    // seule l'entrée "Mes parcours" perd sa mention "Bientôt disponible".
    const itemMesParcours = screen.getByRole('menuitem', { name: 'Mes parcours' })
    expect(within(itemMesParcours).queryByText('Bientôt disponible')).not.toBeInTheDocument()

    await user.click(itemMesParcours)

    expect(onOuvrirMesParcours).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
