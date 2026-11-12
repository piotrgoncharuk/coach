import type { PerformedSet } from './types'
import { round1 } from './math'

/**
 * Расчётный одноповторный максимум по формуле Эпли: 1ПМ = вес × (1 + повторы / 30).
 *
 * Запас повторов (RIR) учитывается как недоделанные повторы: подход 100×5 с RIR 2
 * считается как 100×7, потому что два повтора ещё оставались. При одном
 * эффективном повторе формула Эпли завышает результат, поэтому возвращаем вес как есть.
 */
export function epley1RM(weightKg: number, reps: number, rir: number | null = null): number {
  if (weightKg <= 0 || reps <= 0) return 0
  const effectiveReps = reps + (rir ?? 0)
  if (effectiveReps <= 1) return round1(weightKg)
  return round1(weightKg * (1 + effectiveReps / 30))
}

/** Обратная задача: какой вес нужен, чтобы сделать N повторов при известном 1ПМ. */
export function weightForReps(oneRepMaxKg: number, reps: number): number {
  if (oneRepMaxKg <= 0 || reps <= 0) return 0
  return round1(oneRepMaxKg / (1 + reps / 30))
}

/** Лучший расчётный 1ПМ среди подходов (разминочные не считаются). */
export function best1RM(sets: PerformedSet[]): { value: number; set: PerformedSet | null } {
  let best = 0
  let bestSet: PerformedSet | null = null
  for (const s of sets) {
    if (s.type === 'warmup') continue
    const v = epley1RM(s.weightKg, s.reps, s.rir)
    if (v > best) {
      best = v
      bestSet = s
    }
  }
  return { value: round1(best), set: bestSet }
}
