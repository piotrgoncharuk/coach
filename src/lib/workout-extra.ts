import { db } from './db'
import { alive, toPerformed } from './workout'
import { isSessionFailed } from '../domain'

export { alive }

/** Провал тренировки: хоть одно упражнение ниже низа диапазона повторов. */
export async function isSessionFailedFor(sessionId: string): Promise<boolean> {
  const ses = alive(await db.sessionExercises.where('sessionId').equals(sessionId).toArray())
  const sets = alive(await db.sets.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).toArray())
  return isSessionFailed(
    ses.map((s) => ({ id: s.id, exerciseId: s.exerciseId, orderIndex: s.orderIndex, supersetGroup: s.supersetGroup, repMin: s.repMin, restSec: s.restSec })),
    sets.map(toPerformed),
  )
}
