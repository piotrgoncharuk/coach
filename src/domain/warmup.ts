import { DEFAULT_BAR_KG } from './plates'
import { roundToStep } from './math'

export interface WarmupSet {
  weightKg: number
  reps: number
  /** Доля от рабочего веса — показывается подписью. */
  percent: number
}

export interface WarmupOptions {
  barKg?: number
  /** Есть ли гриф: для гантелей и тренажёров первый подход «пустым грифом» не нужен. */
  hasBar?: boolean
  stepKg?: number
}

const SCHEME: { percent: number; reps: number }[] = [
  { percent: 0.4, reps: 5 },
  { percent: 0.6, reps: 3 },
  { percent: 0.8, reps: 2 },
]

/**
 * Разминочные подходы к рабочему весу. Лёгкий рабочий вес разминается одним подходом,
 * тяжёлый — по схеме 40/60/80% с убывающими повторами.
 */
export function warmupSets(workingKg: number, opts: WarmupOptions = {}): WarmupSet[] {
  const { barKg = DEFAULT_BAR_KG, hasBar = true, stepKg = 2.5 } = opts
  if (workingKg <= 0) return []

  const out: WarmupSet[] = []
  if (hasBar && workingKg > barKg * 1.4) {
    out.push({ weightKg: barKg, reps: 8, percent: Math.round((barKg / workingKg) * 100) / 100 })
  }
  for (const s of SCHEME) {
    const w = roundToStep(workingKg * s.percent, stepKg)
    if (hasBar && w <= barKg) continue
    if (w >= workingKg) continue
    if (out.some((o) => o.weightKg === w)) continue
    out.push({ weightKg: w, reps: s.reps, percent: s.percent })
  }
  if (out.length === 0) {
    out.push({ weightKg: roundToStep(workingKg * 0.5, stepKg), reps: 8, percent: 0.5 })
  }
  return out
}
