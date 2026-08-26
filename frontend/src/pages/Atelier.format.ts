import type { Difficulte } from '../api/client'

// Formatage partagé des métriques (spec-2-5/2-6) : dans un module dédié (pas
// exporté depuis `Atelier.tsx` lui-même, cf. `Atelier.inversion.ts` pour le
// même patron côté topologie) -- `MesParcours.tsx` réutilise ces fonctions
// telles quelles pour ne pas dupliquer le formatage, sans faire de
// `Atelier.tsx` un module mixte composant+utilitaires (Fast Refresh).

/** "54,2 km" -- un chiffre après la virgule, séparateur français (cf.
 * mockups/key-atelier-manuel.html). */
export function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/** "830 m" -- D+/D-, arrondis au mètre le plus proche (pas de décimale : une
 * précision centimétrique n'aurait aucun sens pour un dénivelé cyclable). */
export function formatDenivele(deniveleM: number): string {
  return `${Math.round(deniveleM)} m`
}

/** "2 h 40" (ou "40 min" sous l'heure) -- même registre que les mockups,
 * jamais de secondes affichées (pas assez signifiant pour une durée
 * cyclable). */
export function formatDuree(dureeS: number): string {
  // Plancher à 0 : défense en profondeur si le backend émettait un jour une
  // durée négative (ne devrait jamais arriver, `duration_s` y est validé
  // strictement positive côté Valhalla, cf. `valhalla_provider.py`) --
  // jamais une durée négative affichée à l'écran.
  const minutesTotales = Math.max(0, Math.round(dureeS / 60))
  const heures = Math.floor(minutesTotales / 60)
  const minutes = minutesTotales % 60
  if (heures === 0) {
    return `${minutes} min`
  }
  return `${heures} h ${String(minutes).padStart(2, '0')}`
}

/** `difficulte` typé `Difficulte` (4 valeurs garanties par le contrat
 * backend, cf. `Literal` de `MetriquesResponse.difficulte`) -- le
 * `default` ci-dessous reste un filet défensif si le backend émettait
 * malgré tout une valeur imprévue (contrat rompu/version divergente),
 * plutôt que de laisser passer un `undefined` silencieux à l'affichage. */
export function libelleDifficulte(difficulte: Difficulte): string {
  switch (difficulte) {
    case 'facile':
      return 'Facile'
    case 'modere':
      return 'Modéré'
    case 'difficile':
      return 'Difficile'
    case 'tres_difficile':
      return 'Très difficile'
    default:
      return difficulte
  }
}
