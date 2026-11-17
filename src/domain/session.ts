import { MUSCLE_TO_GROUP, MUSCLE_GROUPS, type Muscle, type MuscleGroup, type PerformedSet } from './types'
import { tonnage } from './volume'

export interface SessionExerciseLite {
  id: string
  exerciseId: string
  orderIndex: number
  supersetGroup: string | null
  repMin: number | null
  restSec: number | null
}

export interface SessionSummary {
  durationMin: number
  tonnageKg: number
  workSets: number
  setsByGroup: Record<MuscleGroup, number>
  exercises: number
}

/** Итог тренировки: длительность, тоннаж, рабочие подходы по группам мышц. */
export function summarizeSession(
  sets: PerformedSet[],
  primaryByExercise: Record<string, string[]>,
  startedAt: string,
  finishedAt: string,
): SessionSummary {
  const setsByGroup = MUSCLE_GROUPS.reduce((a, g) => ({ ...a, [g]: 0 }), {} as Record<MuscleGroup, number>)
  const work = sets.filter((s) => s.type !== 'warmup')
  for (const s of work) {
    const groups = new Set((primaryByExercise[s.exerciseId] ?? []).map((m) => MUSCLE_TO_GROUP[m as Muscle]).filter(Boolean))
    for (const g of groups) setsByGroup[g] += 1
  }
  const ms = Date.parse(finishedAt) - Date.parse(startedAt)
  return {
    durationMin: Math.max(0, Math.round(ms / 60000)),
    tonnageKg: tonnage(sets),
    workSets: work.length,
    setsByGroup,
    exercises: new Set(sets.map((s) => s.exerciseId)).size,
  }
}

/**
 * Куда идти после записи подхода. В суперсете — к следующему упражнению группы
 * без отдыха; отдых начинается только после последнего упражнения круга.
 */
export function afterSet(
  exercises: SessionExerciseLite[],
  currentId: string,
): { nextId: string; startRest: boolean } {
  const sorted = [...exercises].sort((a, b) => a.orderIndex - b.orderIndex)
  const cur = sorted.find((e) => e.id === currentId)
  if (!cur || !cur.supersetGroup) return { nextId: currentId, startRest: true }
  const group = sorted.filter((e) => e.supersetGroup === cur.supersetGroup)
  const idx = group.findIndex((e) => e.id === currentId)
  if (idx < group.length - 1) return { nextId: group[idx + 1].id, startRest: false }
  return { nextId: group[0].id, startRest: true }
}

/** Провальная тренировка: хоть одно упражнение не добрало низ диапазона повторов. */
export function isSessionFailed(exercises: SessionExerciseLite[], sets: PerformedSet[]): boolean {
  for (const ex of exercises) {
    if (!ex.repMin) continue
    const work = sets.filter((s) => s.exerciseId === ex.exerciseId && (s.type === 'work' || s.type === 'failure'))
    if (work.some((s) => s.reps < (ex.repMin as number))) return true
  }
  return false
}
