import { epley1RM } from './e1rm'
import type { PerformedSet } from './types'

export type RecordKind = 'weight' | 'reps' | 'e1rm'

export interface RecordHit {
  kind: RecordKind
  value: number
  previous: number
}

/**
 * Личные рекорды для нового подхода по сравнению с историей упражнения:
 *  • вес — больше любого прежнего рабочего веса;
 *  • повторы — больше повторов, чем когда-либо с этим весом или тяжелее;
 *  • расчётный 1ПМ — выше любого прежнего.
 *
 * Разминка рекордом не считается. Самый первый подход упражнения тоже:
 * иначе каждое новое упражнение сыпало бы ложными рекордами.
 */
export function detectRecords(set: PerformedSet, history: PerformedSet[]): RecordHit[] {
  if (set.type === 'warmup' || set.weightKg < 0 || set.reps <= 0) return []
  const prev = history.filter((s) => s.id !== set.id && s.type !== 'warmup' && s.reps > 0)
  if (prev.length === 0) return []

  const hits: RecordHit[] = []

  const maxWeight = Math.max(...prev.map((s) => s.weightKg))
  if (set.weightKg > maxWeight) hits.push({ kind: 'weight', value: set.weightKg, previous: maxWeight })

  const heavier = prev.filter((s) => s.weightKg >= set.weightKg)
  if (heavier.length) {
    const maxReps = Math.max(...heavier.map((s) => s.reps))
    if (set.reps > maxReps) hits.push({ kind: 'reps', value: set.reps, previous: maxReps })
  }

  const e1 = epley1RM(set.weightKg, set.reps, set.rir)
  const maxE1 = Math.max(...prev.map((s) => epley1RM(s.weightKg, s.reps, s.rir)))
  if (e1 > maxE1) hits.push({ kind: 'e1rm', value: e1, previous: maxE1 })

  return hits
}

export const RECORD_RU: Record<RecordKind, string> = {
  weight: 'вес',
  reps: 'повторы',
  e1rm: 'расчётный 1ПМ',
}
