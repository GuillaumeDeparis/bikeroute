/** Appels à l'API BikeRoute. Toujours `credentials: 'include'` pour que le
 * cookie de session (posé par le backend) soit envoyé/reçu par le navigateur. */

export interface RegisterPayload {
  identifiant: string
  motDePasse: string
}

export interface LoginPayload {
  identifiant: string
  motDePasse: string
}

export interface AccountResult {
  id: string
  identifiant: string
  createdAt: string
}

export interface SessionResult {
  identifiant: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details: Record<string, unknown>
  correlationId: string
}

/** Erreur applicative structurée renvoyée par l'API (`code`/`message`/`details`/`correlationId`). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>
  readonly correlationId: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.details = body.details
    this.correlationId = body.correlationId
  }
}

/** Le corps ressemble-t-il à une erreur applicative structurée ? (`details`
 * et `correlationId` restent optionnels ici : on les complète par défaut.) */
function hasErrorCodeAndMessage(body: unknown): body is Pick<ApiErrorBody, 'code' | 'message'> {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Partial<ApiErrorBody>).code === 'string' &&
    typeof (body as Partial<ApiErrorBody>).message === 'string'
  )
}

/** Construit l'`ApiError` à lever pour une réponse en échec, y compris
 * quand le corps n'est pas un JSON d'erreur structuré (ex. 500 imprévu). */
async function toApiError(response: Response): Promise<ApiError> {
  const parsedBody = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null
  const body: ApiErrorBody = hasErrorCodeAndMessage(parsedBody)
    ? { details: {}, correlationId: '', ...parsedBody }
    : {
        code: 'ERREUR_INATTENDUE',
        message: "Une erreur inattendue s'est produite. Réessayez plus tard.",
        details: {},
        correlationId: '',
      }
  return new ApiError(response.status, body)
}

function toAccountResult(data: { id: string; identifiant: string; created_at: string }): AccountResult {
  return { id: data.id, identifiant: data.identifiant, createdAt: data.created_at }
}

export async function registerAccount({ identifiant, motDePasse }: RegisterPayload): Promise<AccountResult> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
  })

  if (response.status === 201) {
    return toAccountResult(await response.json())
  }

  throw await toApiError(response)
}

/** Échec (identifiant inconnu OU mot de passe faux) : toujours 401 avec le
 * même message générique, jamais lié à un champ (cf. matrice I/O spec-1-2). */
export async function login({ identifiant, motDePasse }: LoginPayload): Promise<AccountResult> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
  })

  if (response.status === 200) {
    return toAccountResult(await response.json())
  }

  throw await toApiError(response)
}

/** Idempotent côté backend (204 même sans cookie / cookie déjà invalide). */
export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })

  if (response.status !== 204) {
    throw await toApiError(response)
  }
}

/** Résout l'identité depuis le cookie de session, ou lève `ApiError` (401
 * `SESSION_INVALIDE`) si absent/inconnu/expiré : c'est cet appel que le
 * frontend utilise pour détecter une session active ou expirée. */
export async function getSession(): Promise<SessionResult> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
  })

  if (response.status === 200) {
    const data = (await response.json()) as { identifiant: string }
    return { identifiant: data.identifiant }
  }

  throw await toApiError(response)
}
