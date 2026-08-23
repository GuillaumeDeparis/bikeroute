import './Skeleton.css'

interface SkeletonProps {
  /** Largeur CSS (ex. '100%', '8rem'). */
  width?: string
  /** Hauteur CSS (ex. '1rem', '2.5rem'). */
  height?: string
  className?: string
}

// Primitif générique `{components.skeleton}` (DESIGN.md) : réserve la
// géométrie attendue d'un élément sans simuler de contenu réel. Réutilisable
// tel quel par toute surface qui aura un état de chargement (Mes parcours,
// carte, ...).
export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <div
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
