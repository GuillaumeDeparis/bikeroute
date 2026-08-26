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
