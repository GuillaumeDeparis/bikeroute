import { useState, type FormEvent } from 'react'
import { ApiError, login } from '../api/client'
import './Connexion.css'

interface FieldErrors {
  identifiant?: string
  motDePasse?: string
}

function validateIdentifiant(identifiant: string): string | undefined {
  if (!identifiant.trim()) {
    return "L'identifiant est requis."
  }
  return undefined
}

function validateMotDePasse(motDePasse: string): string | undefined {
  if (!motDePasse) {
    return 'Le mot de passe est requis.'
  }
  return undefined
}

interface ConnexionProps {
  onConnecte: (identifiant: string) => void
  onAllerInscription: () => void
  /** Motif d'un retour automatique à Connexion (ex. session expirée),
   * distinct d'un échec de soumission du formulaire (`erreur` ci-dessous). */
  messageExpiration?: string
}

export function Connexion({ onConnecte, onAllerInscription, messageExpiration }: ConnexionProps) {
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  // Échec de connexion : un seul message générique, jamais lié à un champ
  // (identifiant inconnu OU mot de passe faux -- cf. matrice I/O spec-1-2).
  // Distinct de `fieldErrors`, qui ne couvre que la validation purement
  // cliente des champs requis, avant tout appel réseau.
  const [erreur, setErreur] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  function handleBlurIdentifiant() {
    setFieldErrors((prev) => ({ ...prev, identifiant: validateIdentifiant(identifiant) }))
  }

  function handleBlurMotDePasse() {
    setFieldErrors((prev) => ({ ...prev, motDePasse: validateMotDePasse(motDePasse) }))
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
    const motDePasseError = validateMotDePasse(motDePasse)
    if (identifiantError || motDePasseError) {
      setFieldErrors({ identifiant: identifiantError, motDePasse: motDePasseError })
      return
    }

    setSubmitting(true)
    setFieldErrors({})
    setErreur(undefined)
    try {
      const result = await login({ identifiant, motDePasse })
      onConnecte(result.identifiant)
    } catch (error) {
      // Identifiant inconnu OU mot de passe faux : un seul message
      // générique, jamais lié à un champ. Le mot de passe n'est jamais
      // conservé après un échec ; l'identifiant, si.
      setMotDePasse('')
      if (error instanceof ApiError && error.code === 'IDENTIFIANTS_INVALIDES') {
        setErreur(error.message)
      } else {
        setErreur("Une erreur inattendue s'est produite. Réessayez plus tard.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="connexion">
      <h1>Se connecter</h1>
      {!erreur && messageExpiration && (
        <p className="connexion__info" role="status">
          {messageExpiration}
        </p>
      )}
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
            aria-invalid={Boolean(fieldErrors.identifiant)}
            aria-describedby={fieldErrors.identifiant ? 'identifiant-erreur' : undefined}
          />
          {fieldErrors.identifiant && (
            <p id="identifiant-erreur" className="erreur" role="alert">
              {fieldErrors.identifiant}
            </p>
          )}
        </div>

        <div className="champ">
          <label htmlFor="mot-de-passe">Mot de passe</label>
          <input
            id="mot-de-passe"
            name="mot-de-passe"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
            onBlur={handleBlurMotDePasse}
            aria-invalid={Boolean(fieldErrors.motDePasse)}
            aria-describedby={fieldErrors.motDePasse ? 'mot-de-passe-erreur' : undefined}
          />
          {fieldErrors.motDePasse && (
            <p id="mot-de-passe-erreur" className="erreur" role="alert">
              {fieldErrors.motDePasse}
            </p>
          )}
        </div>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p className="connexion__lien">
        Pas encore de compte ?{' '}
        <button type="button" className="lien" onClick={onAllerInscription}>
          Créer un compte
        </button>
      </p>
    </main>
  )
}
