import { EQUIPMENT_RU, MUSCLE_RU, type Equipment, type Muscle } from '../domain/types'
import type { Exercise } from './models'

/** «квадрицепс · штанга» — подпись упражнения в списках. */
export function exerciseSubtitle(ex: Exercise): string {
  const muscles = ex.primaryMuscles.map((m) => MUSCLE_RU[m as Muscle] ?? m).join(', ')
  const eq = EQUIPMENT_RU[(ex.equipment ?? 'other') as Equipment] ?? ex.equipment
  return [muscles, eq].filter(Boolean).join(' · ')
}
