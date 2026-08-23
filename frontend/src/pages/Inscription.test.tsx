import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inscription } from './Inscription'
import { registerAccount } from '../api/client'

// Confirmation du mot de passe ajoutée en revue de l'épic 1 : un typo
// silencieux à l'inscription créerait un mot de passe inconnu de
// l'utilisateur, sans recours possible (pas de récupération en V1).
vi.mock('../api/client', () => ({ registerAccount: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.mocked(registerAccount).mockReset()
})

describe('Inscription — confirmation du mot de passe', () => {
  it('bloque la soumission si les deux mots de passe diffèrent', async () => {
    const user = userEvent.setup()
    const onInscrit = vi.fn()

    render(<Inscription onInscrit={onInscrit} onAllerConnexion={vi.fn()} />)

    // `fireEvent.change` (plutôt que `user.type`) pour renseigner les trois
    // champs sans déclencher leur `onBlur` respectif entre chacun : on veut
    // isoler la validation faite par `handleSubmit` lui-même, pas celle,
    // déjà couverte ailleurs, qui s'exécute au blur d'un champ.
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'un-mot-de-passe-solide' } })
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'un-mot-de-passe-different' },
    })
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect(await screen.findByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(registerAccount).not.toHaveBeenCalled()
    expect(onInscrit).not.toHaveBeenCalled()
  })

  it('autorise la soumission quand les deux mots de passe correspondent', async () => {
    const user = userEvent.setup()
    vi.mocked(registerAccount).mockResolvedValue({ id: '1', identifiant: 'alice', createdAt: '2026-01-01' })
    const onInscrit = vi.fn()

    render(<Inscription onInscrit={onInscrit} onAllerConnexion={vi.fn()} />)

    await user.type(screen.getByLabelText('Identifiant'), 'alice')
    await user.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-solide')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'un-mot-de-passe-solide')
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    await waitFor(() => expect(onInscrit).toHaveBeenCalledWith('alice'))
  })
})
