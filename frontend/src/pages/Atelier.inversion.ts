export type Role = 'depart' | 'point_de_passage' | 'etape_utilisateur' | 'destination'

/** Boucle : pas de Destination, fermeture par répétition du départ.
 * Aller simple : Départ et Destination distincts. Multi-étapes : les points
 * intermédiaires peuvent être qualifiés par l'utilisateur. */
export type Topologie = 'boucle' | 'aller_simple' | 'multi_etapes'

export interface PointAtelier {
  // Identifiant stable : clé React et identité dans le bandeau non routé.
  id: string
  role: Role
  lat: number
  lon: number
  nonRoute: boolean
  // Numéro stable des passages/étapes, jamais recalculé lors d'un changement
  // d'ordre ; absent pour les deux extrémités.
  numero?: number
}

/** Reconstruit `points`/`topologie` depuis les points bruts d'entrée
 * persistés (`ResultatParcours.points`, spec-2-6) à la réouverture d'un
 * parcours enregistré : boucle si le premier point == le dernier (longueur
 * >= 3, dernier point dupliqué retiré de la liste affichée) ; aller simple à
 * 2 points ; multi-étapes sinon. Rôles intermédiaires tous
 * `point_de_passage` -- la distinction `etape_utilisateur` est un libellé UI
 * non persisté (Design Notes de la spec-2-6), jamais reconstruite à
 * l'identique. Fonction pure : aucun `id`/numéro n'est stable d'un appel à
 * l'autre, seulement utilisée une fois, au montage de l'Atelier réouvert. */
export function construirePointsDepuisParcours(pointsBruts: { lat: number; lon: number }[]): {
  points: PointAtelier[]
  topologie: Topologie
} {
  if (pointsBruts.length === 0) {
    return { points: [], topologie: 'aller_simple' }
  }
  const premier = pointsBruts[0]
  const dernier = pointsBruts[pointsBruts.length - 1]
  const estBoucle = pointsBruts.length >= 3 && premier.lat === dernier.lat && premier.lon === dernier.lon
  const visibles = estBoucle ? pointsBruts.slice(0, -1) : pointsBruts
  const topologie: Topologie = estBoucle ? 'boucle' : visibles.length === 2 ? 'aller_simple' : 'multi_etapes'

  let numero = 1
  const points: PointAtelier[] = visibles.map((point, index) => {
    if (index === 0) {
      return { id: crypto.randomUUID(), role: 'depart', lat: point.lat, lon: point.lon, nonRoute: false }
    }
    if (!estBoucle && index === visibles.length - 1) {
      return { id: crypto.randomUUID(), role: 'destination', lat: point.lat, lon: point.lon, nonRoute: false }
    }
    return {
      id: crypto.randomUUID(),
      role: 'point_de_passage',
      lat: point.lat,
      lon: point.lon,
      nonRoute: false,
      numero: numero++,
    }
  })

  return { points, topologie }
}

export function inverserPoints(points: PointAtelier[], topologie: Topologie): PointAtelier[] {
  if (topologie === 'boucle') {
    const depart = points.find((point) => point.role === 'depart')
    const passages = points.filter(
      (point) => point.role === 'point_de_passage' || point.role === 'etape_utilisateur',
    )
    return depart && passages.length > 0 ? [depart, ...passages.slice().reverse()] : points
  }
  if (topologie === 'aller_simple' && points.some((point) => point.role === 'destination')) {
    const inverse = [...points].reverse()
    const dernierIndex = inverse.length - 1
    return inverse.map((point, index) => {
      if (index === 0) return { ...point, role: 'depart', numero: undefined }
      if (index === dernierIndex) return { ...point, role: 'destination', numero: undefined }
      return point
    })
  }
  return points
}
