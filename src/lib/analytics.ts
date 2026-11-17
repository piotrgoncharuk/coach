import { db } from './db'
import { alive } from './workout'
import { localDate, type DatedSet, type ExerciseMuscles, type Muscle } from '../domain'
import type { Exercise } from './models'

export interface AnalyticsData {
  sets: DatedSet[]
  sessionDates: string[]
  muscles: Record<string, ExerciseMuscles>
  exercises: Map<string, Exercise>
}

/** Всё для аналитики одним проходом: подходы с датами тренировок и карта мышц. */
export async function loadAnalytics(): Promise<AnalyticsData> {
  const sessions = alive(await db.sessions.toArray()).filter((s) => s.status !== 'active')
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]))
  const ses = alive(await db.sessionExercises.toArray()).filter((se) => dateBySession.has(se.sessionId))
  const dateBySe = new Map(ses.map((se) => [se.id, dateBySession.get(se.sessionId)!]))
  const sets: DatedSet[] = alive(await db.sets.toArray())
    .filter((s) => dateBySe.has(s.sessionExerciseId))
    .map((s) => ({
      id: s.id, exerciseId: s.exerciseId, setIndex: s.setIndex, weightKg: s.weightKg, reps: s.reps, rir: s.rir,
      type: s.type, performedAt: s.performedAt, date: dateBySe.get(s.sessionExerciseId) ?? localDate(new Date(s.performedAt)),
    }))
  const exList = (await db.exercises.bulkGet([...new Set(sets.map((s) => s.exerciseId))])).filter(Boolean) as Exercise[]
  return {
    sets,
    sessionDates: sessions.filter((s) => s.status === 'finished').map((s) => s.date),
    muscles: Object.fromEntries(exList.map((e) => [e.id, { primary: e.primaryMuscles as Muscle[], secondary: e.secondaryMuscles as Muscle[] }])),
    exercises: new Map(exList.map((e) => [e.id, e])),
  }
}
