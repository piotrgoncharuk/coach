import { MUSCLE_TO_GROUP, type Muscle, type MuscleGroup } from './types'

/** Поиск без оглядки на регистр, «ё» и знаки препинания. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'()\-_/.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SearchableExercise {
  id: string
  slug: string | null
  nameRu: string
  nameEn: string | null
  primaryMuscles: string[]
  equipment: string | null
  category: string | null
  isCustom?: boolean
  deletedAt?: string | null
}

export interface ExerciseFilter {
  query?: string
  groups?: MuscleGroup[]
  equipment?: string[]
  /** Только силовые: без растяжки, кардио, плиометрики и стронгмена. */
  strengthOnly?: boolean
}

const STRENGTH = new Set(['strength', 'powerlifting', 'olympic weightlifting'])

function groupsOf(ex: SearchableExercise): Set<MuscleGroup> {
  return new Set(ex.primaryMuscles.map((m) => MUSCLE_TO_GROUP[m as Muscle]).filter(Boolean))
}

/**
 * Совпадение по всем словам запроса — в русском названии, английском или id базы.
 * Очки: начало русского названия выше всего, свои упражнения чуть выше общих.
 */
export function scoreMatch(query: string, ex: SearchableExercise): number {
  const q = normalize(query)
  if (!q) return 1
  const ru = normalize(ex.nameRu)
  const en = normalize(`${ex.nameEn ?? ''} ${ex.slug ?? ''}`)
  const words = q.split(' ')
  if (!words.every((w) => ru.includes(w) || en.includes(w))) return 0
  let score = 10
  if (ru.startsWith(q)) score += 50
  else if (ru.includes(q)) score += 25
  else if (en.startsWith(q)) score += 20
  if (words.every((w) => ru.includes(w))) score += 10
  if (ex.isCustom) score += 5
  return score
}

export function filterExercises<T extends SearchableExercise>(list: T[], f: ExerciseFilter): T[] {
  const scored: { ex: T; score: number }[] = []
  for (const ex of list) {
    if (ex.deletedAt) continue
    if (f.strengthOnly && !ex.isCustom && !STRENGTH.has(ex.category ?? '')) continue
    if (f.equipment?.length && !f.equipment.includes(ex.equipment ?? 'other')) continue
    if (f.groups?.length) {
      const g = groupsOf(ex)
      if (!f.groups.some((x) => g.has(x))) continue
    }
    const score = scoreMatch(f.query ?? '', ex)
    if (score > 0) scored.push({ ex, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.ex.nameRu.localeCompare(b.ex.nameRu, 'ru'))
    .map((s) => s.ex)
}
