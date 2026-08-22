/** Appels à l'API BikeRoute. Toujours `credentials: 'include'` pour que le
 * cookie de session (posé par le backend) soit envoyé/reçu par le navigateur. */

export interface RegisterPayload {
  identifiant: string
  motDePasse: string
}

export interface RegisterResult {
  id: string
  identifiant: string
  createdAt: string
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

export async function registerAccount({ identifiant, motDePasse }: RegisterPayload): Promise<RegisterResult> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
  })

  if (response.status === 201) {
    const data = (await response.json()) as { id: string; identifiant: string; created_at: string }
    return { id: data.id, identifiant: data.identifiant, createdAt: data.created_at }
  }

  if (response.status === 409 || response.status === 422) {
    const body = (await response.json()) as ApiErrorBody
    throw new ApiError(response.status, body)
  }

  const parsedBody = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null
  const body: ApiErrorBody = hasErrorCodeAndMessage(parsedBody)
    ? { details: {}, correlationId: '', ...parsedBody }
    : {
        code: 'ERREUR_INATTENDUE',
        message: "Une erreur inattendue s'est produite. Réessayez plus tard.",
        details: {},
        correlationId: '',
      }
  throw new ApiError(response.status, body)
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
