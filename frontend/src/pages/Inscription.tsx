import { useState, type FormEvent } from 'react'
import { ApiError, registerAccount } from '../api/client'
import './Inscription.css'

// Reflète la valeur par défaut de `backend/app/config.py::password_min_length`.
// Le serveur reste la seule source de vérité : cette constante ne fait
// qu'anticiper côté client le retour serveur (validation au blur/submit,
// UX-DR18/24), elle ne remplace jamais la validation serveur.
const PASSWORD_MIN_LENGTH = 10

interface FieldErrors {
  identifiant?: string
  motDePasse?: string
  confirmationMotDePasse?: string
}

function validateIdentifiant(identifiant: string): string | undefined {
  if (!identifiant.trim()) {
    return "L'identifiant est requis."
  }
  return undefined
}

function validateMotDePasse(motDePasse: string, identifiant: string): string | undefined {
  if (!motDePasse) {
    return 'Le mot de passe est requis.'
  }
  if (motDePasse.length < PASSWORD_MIN_LENGTH || motDePasse.toLowerCase() === identifiant.toLowerCase()) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères et être différent de l'identifiant.`
  }
  return undefined
}

// Filet de sécurité purement client : un typo silencieux à la saisie
// créerait un mot de passe que l'utilisateur ne connaît pas, sans aucun
// moyen de le récupérer (aucune récupération de mot de passe en V1) --
// trouvé en revue de l'épic 1.
function validateConfirmationMotDePasse(motDePasse: string, confirmation: string): string | undefined {
  if (!confirmation) {
    return 'La confirmation du mot de passe est requise.'
  }
  if (confirmation !== motDePasse) {
    return 'Les deux mots de passe ne correspondent pas.'
  }
  return undefined
}

interface InscriptionProps {
  onInscrit: (identifiant: string) => void
  onAllerConnexion: () => void
}

export function Inscription({ onInscrit, onAllerConnexion }: InscriptionProps) {
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  function handleBlurIdentifiant() {
    setErrors((prev) => ({ ...prev, identifiant: validateIdentifiant(identifiant) }))
  }

  function handleBlurMotDePasse() {
    const error = validateMotDePasse(motDePasse, identifiant)
    setErrors((prev) => ({ ...prev, motDePasse: error }))
    // Saisie conservée hors mot de passe : un mot de passe jugé invalide
    // n'est jamais laissé affiché dans le champ.
    if (error) {
      setMotDePasse('')
      setConfirmationMotDePasse('')
    }
  }

  function handleBlurConfirmationMotDePasse() {
    const error = validateConfirmationMotDePasse(motDePasse, confirmationMotDePasse)
    setErrors((prev) => ({ ...prev, confirmationMotDePasse: error }))
    if (error) {
      setConfirmationMotDePasse('')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) {
      // Garde contre une double soumission rapide (double clic, Entrée
      // répétée) avant que le re-render de `disabled={submitting}` ne
      // désactive effectivement le bouton.
      return
    }

    const identifiantError = validateIdentifiant(identifiant)
    const motDePasseError = validateMotDePasse(motDePasse, identifiant)
    const confirmationError = validateConfirmationMotDePasse(motDePasse, confirmationMotDePasse)
    if (identifiantError || motDePasseError || confirmationError) {
      setErrors({ identifiant: identifiantError, motDePasse: motDePasseError, confirmationMotDePasse: confirmationError })
      if (motDePasseError || confirmationError) {
        setMotDePasse('')
        setConfirmationMotDePasse('')
      }
      return
    }

    setSubmitting(true)
    setErrors({})
    try {
      const result = await registerAccount({ identifiant, motDePasse })
      // Rejoint directement l'Accueil (une seule expérience post-authentification,
      // partagée avec la connexion) plutôt qu'un message inline (cf. Design Notes).
      onInscrit(result.identifiant)
    } catch (error) {
      setMotDePasse('')
      setConfirmationMotDePasse('')
      if (error instanceof ApiError) {
        const field = error.details.field
        if (error.code === 'IDENTIFIANT_INDISPONIBLE' || field === 'identifiant') {
          setErrors({ identifiant: error.message })
        } else if (error.code === 'MOT_DE_PASSE_INVALIDE' || field === 'mot_de_passe') {
          setErrors({ motDePasse: error.message })
        } else {
          setErrors({ identifiant: error.message })
        }
      } else {
        setErrors({ identifiant: "Une erreur inattendue s'est produite. Réessayez plus tard." })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="inscription">
      <h1>Créer un compte</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="champ">
          <label htmlFor="identifiant">Identifiant</label>
          <input
            id="identifiant"
            name="identifiant"
            type="text"
            autoComplete="username"
            value={identifiant}
            onChange={(event) => setIdentifiant(event.target.value)}
            onBlur={handleBlurIdentifiant}
            aria-invalid={Boolean(errors.identifiant)}
            aria-describedby={errors.identifiant ? 'identifiant-erreur' : undefined}
          />
          {errors.identifiant && (
            <p id="identifiant-erreur" className="erreur" role="alert">
              {errors.identifiant}
            </p>
          )}
        </div>

        <div className="champ">
          <label htmlFor="mot-de-passe">Mot de passe</label>
          <input
            id="mot-de-passe"
            name="mot-de-passe"
            type="password"
            autoComplete="new-password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
            onBlur={handleBlurMotDePasse}
            aria-invalid={Boolean(errors.motDePasse)}
            aria-describedby={errors.motDePasse ? 'mot-de-passe-erreur' : undefined}
          />
          {errors.motDePasse && (
            <p id="mot-de-passe-erreur" className="erreur" role="alert">
              {errors.motDePasse}
            </p>
          )}
        </div>

        <div className="champ">
          <label htmlFor="confirmation-mot-de-passe">Confirmer le mot de passe</label>
          <input
            id="confirmation-mot-de-passe"
            name="confirmation-mot-de-passe"
            type="password"
            autoComplete="new-password"
            value={confirmationMotDePasse}
            onChange={(event) => setConfirmationMotDePasse(event.target.value)}
            onBlur={handleBlurConfirmationMotDePasse}
            aria-invalid={Boolean(errors.confirmationMotDePasse)}
            aria-describedby={errors.confirmationMotDePasse ? 'confirmation-mot-de-passe-erreur' : undefined}
          />
          {errors.confirmationMotDePasse && (
            <p id="confirmation-mot-de-passe-erreur" className="erreur" role="alert">
              {errors.confirmationMotDePasse}
            </p>
          )}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Création du compte…' : 'Créer mon compte'}
        </button>
      </form>

      <p className="inscription__lien">
        Déjà un compte ?{' '}
        <button type="button" className="lien" onClick={onAllerConnexion}>
          Se connecter
        </button>
      </p>
    </main>
  )
}
