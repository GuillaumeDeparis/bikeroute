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

export interface PointCoordonnee {
  lat: number
  lon: number
}

/** 4 paliers de difficulté (D+ rapporté à la distance, m/km) tranchés avec
 * l'utilisateur -- cf. Design Notes de la spec-2-5 : jamais recalculés côté
 * client, uniquement la valeur déjà produite par le backend. */
export type Difficulte = 'facile' | 'modere' | 'difficile' | 'tres_difficile'

/** Un point du profil altimétrique -- point-à-point sur la géométrie routée
 * réelle (mêmes points que D+/D-, jamais un binning par paliers). */
export interface PointProfil {
  distanceM: number
  elevationM: number
}

/** Un segment continu de montée jugé significatif côté backend (≥500 m à
 * ≥3 % de pente moyenne, ou ≥50 m de D+ cumulé -- cf. Design Notes de la
 * spec-2-5). `penteMoyenne` en pourcentage (ex. `4.2` pour 4,2 %). */
export interface MonteeSignificative {
  distanceM: number
  deniveleM: number
  penteMoyenne: number
}

/** Métriques d'un parcours routé (spec-2-5) : une unique méthode serveur
 * versionnée (`version`), jamais recalculée côté client -- même valeur sur
 * tous les écrans (NFR-9). `undefined` sur `ResultatParcours` pour un
 * parcours non routé (même garde que `geometrie` vide, cf. matrice I/O). */
export interface Metriques {
  version: string
  distanceM: number
  denivelePositifM: number
  deniveleNegatifM: number
  dureeS: number
  difficulte: Difficulte
  /** Proportions (0..1) par valeur de revêtement -- clé "inconnu" toujours
   * présente, même à `0`, jamais repliée silencieusement dans une valeur
   * favorable (NFR-10). */
  revetements: Record<string, number>
  categoriesRoutieres: Record<string, number>
  /** Courbe altimétrique continue (jamais par paliers) : mêmes points que
   * D+/D-, densité dépendante de la géométrie routée. */
  profil: PointProfil[]
  monteesSignificatives: MonteeSignificative[]
}

export interface ResultatParcours {
  id: string
  statut: 'routed' | 'non_route'
  geometrie: PointCoordonnee[]
  pointsNonRoutes: PointCoordonnee[]
  fournisseur: string
  versionFournisseur: string
  createdAt: string
  metriques?: Metriques
  /** Marqueur de bibliothèque (spec-2-6) : `undefined`/`[]` tant que le
   * parcours n'a jamais été enregistré -- toujours absent sur le résultat de
   * `calculerParcours` (jamais renseigné par `/calculate`). */
  nom?: string
  note?: string
  // Optionnel côté type (pas seulement runtime, même patron que `profil`/
  // `monteesSignificatives` de `Metriques` ci-dessus) : `mapResultatParcours`
  // les défend déjà par `?? []`, un appelant qui construit lui-même un
  // `ResultatParcours` (tests, fixtures) n'a donc pas à les répéter partout.
  etiquettes?: string[]
  /** Points d'entrée bruts (départ/passages/destination), tels que persistés
   * -- utilisés uniquement pour reconstruire la topologie à la réouverture
   * (spec-2-6, Design Notes) ; toujours vide sur le résultat de
   * `calculerParcours` (l'appelant connaît déjà ses propres points), peuplé
   * par `obtenirParcours`/`enregistrerParcours`. */
  points?: PointCoordonnee[]
}

/** Forme brute (snake_case) de `ParcoursResponse` côté backend -- partagée
 * par `calculerParcours`/`enregistrerParcours`/`obtenirParcours` pour ne pas
 * dupliquer trois fois le mapping snake_case -> camelCase ci-dessous. */
interface ParcoursReponseBrute {
  id: string
  statut: 'routed' | 'non_route'
  geometry: PointCoordonnee[]
  unrouted_points: PointCoordonnee[]
  provider: string
  provider_version: string
  created_at: string
  metriques: {
    version: string
    distance_m: number
    denivele_positif_m: number
    denivele_negatif_m: number
    duree_s: number
    difficulte: Difficulte
    revetements: Record<string, number>
    categories_routieres: Record<string, number>
    // Optionnels côté type (pas seulement runtime, revue post-
    // implémentation) : une réponse qui omettrait ces champs (dérive de
    // contrat/déploiement) ne doit jamais faire échouer le mapping --
    // défendu par `?? []` ci-dessous.
    profil?: { distance_m: number; elevation_m: number }[]
    montees_significatives?: { distance_m: number; denivele_m: number; pente_moyenne: number }[]
  } | null
  nom?: string | null
  note?: string | null
  etiquettes?: string[]
  points?: PointCoordonnee[]
}

function mapMetriques(metriques: ParcoursReponseBrute['metriques']): Metriques | undefined {
  if (!metriques) {
    return undefined
  }
  return {
    version: metriques.version,
    distanceM: metriques.distance_m,
    denivelePositifM: metriques.denivele_positif_m,
    deniveleNegatifM: metriques.denivele_negatif_m,
    dureeS: metriques.duree_s,
    difficulte: metriques.difficulte,
    revetements: metriques.revetements,
    categoriesRoutieres: metriques.categories_routieres,
    // `?? []` (revue post-implémentation) : une réponse qui omettrait
    // ces champs (dérive de contrat/déploiement backend/frontend) ne
    // doit jamais faire échouer tout le calcul de parcours avec un
    // `TypeError` sur `.map(...)` d'`undefined`.
    profil: (metriques.profil ?? []).map((point) => ({
      distanceM: point.distance_m,
      elevationM: point.elevation_m,
    })),
    monteesSignificatives: (metriques.montees_significatives ?? []).map((montee) => ({
      distanceM: montee.distance_m,
      deniveleM: montee.denivele_m,
      penteMoyenne: montee.pente_moyenne,
    })),
  }
}

function mapResultatParcours(data: ParcoursReponseBrute): ResultatParcours {
  return {
    id: data.id,
    statut: data.statut,
    geometrie: data.geometry,
    pointsNonRoutes: data.unrouted_points,
    fournisseur: data.provider,
    versionFournisseur: data.provider_version,
    createdAt: data.created_at,
    metriques: mapMetriques(data.metriques),
    nom: data.nom ?? undefined,
    note: data.note ?? undefined,
    etiquettes: data.etiquettes ?? [],
    points: data.points ?? [],
  }
}

export interface OptionsRequete {
  /** Permet à l'appelant d'annuler une requête déjà en vol (nouveau point
   * posé, nouvelle recherche, démontage) -- jamais d'appel bloqué en
   * arrière-plan une fois son résultat devenu obsolète. */
  signal?: AbortSignal
}

/** Calcule automatiquement le tracé sur la liste de points ordonnée fournie
 * par l'appelant (au moins deux : topologie -- boucle/aller simple/multi-
 * étapes -- résolue côté frontend, cf. spec-2-2 ; la boucle envoie le départ
 * répété en dernier point). Un point non rattachable au réseau routier connu
 * ne lève pas : il ressort dans `pointsNonRoutes`, avec `geometrie` vide
 * (jamais de segment direct de repli, cf. matrice I/O). */
export async function calculerParcours(
  points: PointCoordonnee[],
  options?: OptionsRequete,
): Promise<ResultatParcours> {
  const response = await fetch('/api/routes/calculate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: options?.signal,
  })

  if (response.status === 201) {
    return mapResultatParcours((await response.json()) as ParcoursReponseBrute)
  }

  throw await toApiError(response)
}

export interface EnregistrerParcoursPayload {
  nom: string
  note?: string
  etiquettes?: string[]
}

/** Pose un `nom` (marqueur de bibliothèque, spec-2-6) sur un parcours déjà
 * calculé (`statut === 'routed'`) -- `PATCH` pur sur la ligne `routes`
 * existante, ne recalcule jamais rien. */
export async function enregistrerParcours(id: string, payload: EnregistrerParcoursPayload): Promise<ResultatParcours> {
  const response = await fetch(`/api/routes/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: payload.nom, note: payload.note, etiquettes: payload.etiquettes ?? [] }),
  })

  if (response.status === 200) {
    return mapResultatParcours((await response.json()) as ParcoursReponseBrute)
  }

  throw await toApiError(response)
}

export interface ParcoursResume {
  id: string
  nom: string
  note?: string
  etiquettes: string[]
  distanceM?: number
  denivelePositifM?: number
  dureeS?: number
  difficulte?: Difficulte
  createdAt: string
}

/** Liste « Mes parcours » (spec-2-6) : uniquement les parcours nommés du
 * compte connecté, les plus récents d'abord -- jamais les parcours calculés
 * mais non enregistrés (`nom` nul), qui restent des lignes orphelines. */
export async function listerParcours(): Promise<ParcoursResume[]> {
  const response = await fetch('/api/routes', { method: 'GET', credentials: 'include' })

  if (response.status === 200) {
    const data = (await response.json()) as {
      id: string
      nom: string
      note: string | null
      etiquettes: string[]
      distance_m: number | null
      denivele_positif_m: number | null
      duree_s: number | null
      difficulte: Difficulte | null
      created_at: string
    }[]
    return data.map((ligne) => ({
      id: ligne.id,
      nom: ligne.nom,
      note: ligne.note ?? undefined,
      etiquettes: ligne.etiquettes ?? [],
      distanceM: ligne.distance_m ?? undefined,
      denivelePositifM: ligne.denivele_positif_m ?? undefined,
      dureeS: ligne.duree_s ?? undefined,
      difficulte: ligne.difficulte ?? undefined,
      createdAt: ligne.created_at,
    }))
  }

  throw await toApiError(response)
}

/** Réouverture d'un parcours enregistré (spec-2-6) : recharge points/tracé/
 * métriques déjà persistés, aucun nouvel appel au moteur de routage. */
export async function obtenirParcours(id: string): Promise<ResultatParcours> {
  const response = await fetch(`/api/routes/${id}`, { method: 'GET', credentials: 'include' })

  if (response.status === 200) {
    return mapResultatParcours((await response.json()) as ParcoursReponseBrute)
  }

  throw await toApiError(response)
}

export interface ResultatExport {
  blob: Blob
  nomFichier: string
}

/** Extrait le nom de fichier depuis l'en-tête `Content-Disposition:
 * attachment; filename="..."` posé par le backend -- retombe sur un nom
 * générique si l'en-tête est absent/mal formé (jamais de téléchargement
 * sans nom exploitable, cf. matrice I/O de la spec-2-7). */
function nomFichierDepuisContentDisposition(entete: string | null): string {
  const correspondance = entete?.match(/filename="([^"]*)"/)
  return correspondance?.[1] || 'parcours.gpx'
}

/** Génère et télécharge le GPX d'un parcours déjà calculé (`statut ===
 * 'routed'`, spec-2-7) -- relit le tracé/le profil déjà persistés côté
 * backend, ne recalcule jamais rien. Chaque export réussi est journalisé
 * côté backend dans l'historique du compte connecté. */
export async function exporterParcours(id: string): Promise<ResultatExport> {
  const response = await fetch(`/api/routes/${id}/export`, {
    method: 'POST',
    credentials: 'include',
  })

  if (response.status === 200) {
    const blob = await response.blob()
    const nomFichier = nomFichierDepuisContentDisposition(response.headers.get('Content-Disposition'))
    return { blob, nomFichier }
  }

  throw await toApiError(response)
}

export interface ResultatAdresse {
  label: string
  lat: number
  lon: number
}

/** Recherche d'adresse (Place search, UX-DR17), proxyée côté serveur vers
 * Nominatim -- le frontend n'appelle jamais l'API externe directement. */
export async function rechercherAdresse(q: string, options?: OptionsRequete): Promise<ResultatAdresse[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    credentials: 'include',
    signal: options?.signal,
  })

  if (response.status === 200) {
    return (await response.json()) as ResultatAdresse[]
  }

  throw await toApiError(response)
}
