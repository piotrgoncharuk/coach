import { useLiveQuery } from 'dexie-react-hooks'
import { db, META } from '../../lib/db'
import type { Exercise, SessionExercise, SetRow, WorkoutSession } from '../../lib/models'
import type { RestTimerState } from '../../domain/timer'
import { alive } from '../../lib/workout'

export interface ActiveWorkout {
  session: WorkoutSession
  exercises: SessionExercise[]
  sets: SetRow[]
  catalog: Map<string, Exercise>
  rest: RestTimerState | null
  currentId: string | null
}

/** Всё состояние тренировки читается из локальной базы — переживает закрытие приложения. */
export function useActiveWorkout(): ActiveWorkout | null | undefined {
  return useLiveQuery(async () => {
    const id = (await db.meta.get(META.activeSessionId))?.value as string | null
    if (!id) return null
    const session = await db.sessions.get(id)
    if (!session || session.deletedAt || session.status !== 'active') return null
    const exercises = alive(await db.sessionExercises.where('sessionId').equals(id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
    const seIds = exercises.map((e) => e.id)
    const sets = alive(await db.sets.where('sessionExerciseId').anyOf(seIds).toArray()).sort((a, b) => a.performedAt.localeCompare(b.performedAt))
    const ex = await db.exercises.bulkGet([...new Set(exercises.map((e) => e.exerciseId))])
    const rest = ((await db.meta.get(META.rest))?.value as RestTimerState | null) ?? null
    const saved = (await db.meta.get(META.currentExercise))?.value as string | null
    const currentId = exercises.some((e) => e.id === saved) ? saved : (exercises[0]?.id ?? null)
    return { session, exercises, sets, catalog: new Map(ex.filter(Boolean).map((e) => [e!.id, e!])), rest, currentId }
  }, [])
}
