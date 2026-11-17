import { db } from './db'
import { alive, toPerformed } from './workout'
import { summarizeSession, type SessionSummary } from '../domain'
import type { Exercise, SessionExercise, SetRow, WorkoutSession } from './models'

export interface SessionCard {
  session: WorkoutSession
  dayName: string | null
  summary: SessionSummary
  hasPr: boolean
}

/** Список прошедших тренировок с итогами — для истории и аналитики. */
export async function loadHistory(limit = 200): Promise<SessionCard[]> {
  const sessions = alive(await db.sessions.toArray())
    .filter((s) => s.status !== 'active')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
  const ids = sessions.map((s) => s.id)
  const ses = alive(await db.sessionExercises.where('sessionId').anyOf(ids).toArray())
  const sets = alive(await db.sets.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).toArray())
  const exercises = await db.exercises.bulkGet([...new Set(ses.map((s) => s.exerciseId))])
  const primary = Object.fromEntries(exercises.filter(Boolean).map((e) => [e!.id, e!.primaryMuscles]))
  const days = await db.programDays.bulkGet([...new Set(sessions.map((s) => s.programDayId).filter(Boolean) as string[])])
  const dayName = new Map(days.filter(Boolean).map((d) => [d!.id, d!.name]))
  const seBySession = new Map<string, Set<string>>()
  for (const se of ses) seBySession.set(se.sessionId, (seBySession.get(se.sessionId) ?? new Set()).add(se.id))

  return sessions.map((session) => {
    const own = sets.filter((s) => seBySession.get(session.id)?.has(s.sessionExerciseId))
    return {
      session,
      dayName: session.programDayId ? (dayName.get(session.programDayId) ?? null) : null,
      summary: summarizeSession(own.map(toPerformed), primary, session.startedAt, session.finishedAt ?? session.startedAt),
      hasPr: own.some((s) => s.isPr),
    }
  })
}

export interface SessionDetail {
  session: WorkoutSession
  blocks: { se: SessionExercise; exercise: Exercise | undefined; sets: SetRow[] }[]
  dayName: string | null
}

export async function loadSession(id: string): Promise<SessionDetail | null> {
  const session = await db.sessions.get(id)
  if (!session || session.deletedAt) return null
  const ses = alive(await db.sessionExercises.where('sessionId').equals(id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
  const sets = alive(await db.sets.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).toArray())
  const ex = await db.exercises.bulkGet(ses.map((s) => s.exerciseId))
  const day = session.programDayId ? await db.programDays.get(session.programDayId) : undefined
  return {
    session,
    dayName: day?.name ?? null,
    blocks: ses.map((se, i) => ({ se, exercise: ex[i], sets: sets.filter((s) => s.sessionExerciseId === se.id).sort((a, b) => a.setIndex - b.setIndex) })),
  }
}
