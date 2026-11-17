import type { SearchableExercise } from './search'

export interface AlternativeCandidate extends SearchableExercise {
  secondaryMuscles: string[]
  mechanic: string | null
}

export interface Alternative<T> {
  exercise: T
  score: number
  sameEquipment: boolean
  /** Почему предложено — показывается под названием. */
  reason: string
}

const STRENGTH = new Set(['strength', 'powerlifting'])

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sa = new Set(a)
  const inter = b.filter((x) => sa.has(x)).length
  return inter / (sa.size + b.length - inter)
}

/**
 * Аналоги для замены: та же основная мышечная группа, похожее оборудование
 * и тот же тип движения. Растяжка, кардио и олимпийские движения не предлагаются.
 */
export function findAlternatives<T extends AlternativeCandidate>(
  target: T,
  all: T[],
  opts: { sameEquipmentOnly?: boolean; limit?: number } = {},
): Alternative<T>[] {
  const { sameEquipmentOnly = false, limit = 15 } = opts
  const out: Alternative<T>[] = []

  for (const ex of all) {
    if (ex.id === target.id || ex.deletedAt) continue
    if (!ex.isCustom && !STRENGTH.has(ex.category ?? '')) continue
    const primary = jaccard(target.primaryMuscles, ex.primaryMuscles)
    if (primary === 0) continue
    const sameEquipment = (ex.equipment ?? 'other') === (target.equipment ?? 'other')
    if (sameEquipmentOnly && !sameEquipment) continue

    let score = primary * 60
    score += jaccard(target.secondaryMuscles, ex.secondaryMuscles) * 15
    if (sameEquipment) score += 15
    if (ex.mechanic && ex.mechanic === target.mechanic) score += 10

    const reason = [
      primary === 1 ? 'те же мышцы' : 'похожие мышцы',
      sameEquipment ? 'то же оборудование' : null,
    ]
      .filter(Boolean)
      .join(', ')
    out.push({ exercise: ex, score, sameEquipment, reason })
  }

  return out
    .sort((a, b) => b.score - a.score || a.exercise.nameRu.localeCompare(b.exercise.nameRu, 'ru'))
    .slice(0, limit)
}
