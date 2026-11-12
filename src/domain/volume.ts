import type { MuscleGroup, Muscle, PerformedSet } from './types'
import { MUSCLE_GROUPS, MUSCLE_TO_GROUP } from './types'
import { round1 } from './math'

export interface ExerciseMuscles {
  primary: Muscle[]
  secondary: Muscle[]
}

/** Вклад подхода: основная мышца — целый подход, вспомогательная — половина. */
export const SECONDARY_WEIGHT = 0.5

export type VolumeByGroup = Record<MuscleGroup, number>

function emptyVolume(): VolumeByGroup {
  return MUSCLE_GROUPS.reduce((acc, g) => ({ ...acc, [g]: 0 }), {} as VolumeByGroup)
}

/**
 * Недельный объём в подходах по группам мышц. Разминочные подходы не считаются.
 * Группа упражнения берётся из карты мышц; упражнение без карты пропускается.
 */
export function weeklyVolume(
  sets: PerformedSet[],
  muscles: Record<string, ExerciseMuscles>,
): VolumeByGroup {
  const out = emptyVolume()
  for (const s of sets) {
    if (s.type === 'warmup') continue
    const m = muscles[s.exerciseId]
    if (!m) continue
    const groups = new Set<MuscleGroup>()
    for (const p of m.primary) groups.add(MUSCLE_TO_GROUP[p])
    for (const g of groups) out[g] += 1
    const secondaryGroups = new Set<MuscleGroup>()
    for (const sec of m.secondary) {
      const g = MUSCLE_TO_GROUP[sec]
      if (!groups.has(g)) secondaryGroups.add(g)
    }
    for (const g of secondaryGroups) out[g] += SECONDARY_WEIGHT
  }
  for (const g of MUSCLE_GROUPS) out[g] = round1(out[g])
  return out
}

/** Тоннаж: сумма вес × повторы по рабочим подходам. */
export function tonnage(sets: PerformedSet[]): number {
  return Math.round(
    sets.filter((s) => s.type !== 'warmup').reduce((a, s) => a + s.weightKg * s.reps, 0),
  )
}

/** Ориентиры недельного объёма на группу: ниже — мало, выше — скорее всего перебор. */
export const VOLUME_TARGET: Record<MuscleGroup, { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 10, max: 22 },
  shoulders: { min: 8, max: 18 },
  arms: { min: 6, max: 18 },
  legs: { min: 10, max: 20 },
  core: { min: 4, max: 12 },
}
