import { db, getMeta, META, setMeta } from './db'
import { save, softDelete, currentUserId } from './repo'
import type { SessionExercise, SetRow, WorkoutSession, Exercise, ProgramExercise } from './models'
import {
  detectRecords, epley1RM, localDate, suggestNextLoad, type PerformedSet, type ProgressionResult,
  type RecordHit, type SetType, MUSCLE_TO_GROUP, type Muscle,
} from '../domain'
import { DELOAD_PRESET } from '../domain/deload'
import type { RestTimerState } from '../domain/timer'

export const alive = <T extends { deletedAt?: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

export function toPerformed(s: SetRow): PerformedSet {
  return {
    id: s.id, exerciseId: s.exerciseId, setIndex: s.setIndex, weightKg: s.weightKg, reps: s.reps,
    rir: s.rir, type: s.type, performedAt: s.performedAt, note: s.note,
  }
}

// ─── активная тренировка ────────────────────────────────────────────────────
/** Незавершённая тренировка переживает закрытие приложения: её id лежит в локальной базе. */
export async function getActiveSessionId(): Promise<string | null> {
  const id = await getMeta<string | null>(META.activeSessionId, null)
  if (!id) return null
  const s = await db.sessions.get(id)
  if (!s || s.deletedAt || s.status !== 'active') {
    await setMeta(META.activeSessionId, null)
    return null
  }
  return id
}

export interface StartOptions {
  programDayId?: string | null
  /** Неделя разгрузки: меньше подходов, вес ниже, запас повторов больше. */
  deload?: boolean
  /** Два футбола на неделе: объём тяжёлых упражнений на ноги снижается. */
  cutLegVolume?: boolean
}

export async function startSession(opts: StartOptions = {}): Promise<string> {
  const active = await getActiveSessionId()
  if (active) return active

  const userId = await currentUserId()
  const now = new Date().toISOString()
  const session = await save('sessions', {
    userId, date: localDate(), startedAt: now, finishedAt: null,
    programDayId: opts.programDayId ?? null, status: 'active', difficulty: null, note: null,
  })

  if (opts.programDayId) {
    const planned = alive(await db.programExercises.where('programDayId').equals(opts.programDayId).toArray())
      .sort((a, b) => a.orderIndex - b.orderIndex)
    const exMap = new Map((await db.exercises.bulkGet(planned.map((p) => p.exerciseId))).filter(Boolean).map((e) => [e!.id, e!]))
    for (const p of planned) {
      await save('sessionExercises', fromPlan(session.id, p, exMap.get(p.exerciseId), opts))
    }
  }

  await setMeta(META.activeSessionId, session.id)
  await setMeta(META.rest, null)
  return session.id
}

function fromPlan(sessionId: string, p: ProgramExercise, ex: Exercise | undefined, opts: StartOptions): Partial<SessionExercise> {
  let sets = p.targetSets
  let rir = p.targetRir
  const notes: string[] = []
  const isLegs = ex?.primaryMuscles.some((m) => MUSCLE_TO_GROUP[m as Muscle] === 'legs')
  if (opts.deload) {
    sets = Math.max(1, Math.round(sets * DELOAD_PRESET.setsMultiplier))
    rir = Math.max(rir, DELOAD_PRESET.minRir)
    notes.push('разгрузка: меньше подходов, вес на 10% ниже')
  } else if (opts.cutLegVolume && isLegs) {
    sets = Math.max(1, sets - 1)
    notes.push('два футбола на неделе: на подход меньше')
  }
  return {
    sessionId, exerciseId: p.exerciseId, orderIndex: p.orderIndex, substitutedFrom: null,
    supersetGroup: p.supersetGroup, targetSets: sets, repMin: p.repMin, repMax: p.repMax,
    targetRir: rir, restSec: p.restSec, note: [p.notes, ...notes].filter(Boolean).join(' · ') || null,
  }
}

// ─── упражнения в тренировке ────────────────────────────────────────────────
export async function addExercise(sessionId: string, exerciseId: string): Promise<SessionExercise> {
  const exs = alive(await db.sessionExercises.where('sessionId').equals(sessionId).toArray())
  const ex = await db.exercises.get(exerciseId)
  const pref = (await db.userExercisePrefs.where('exerciseId').equals(exerciseId).toArray()).find((p) => !p.deletedAt)
  return save('sessionExercises', {
    sessionId, exerciseId, orderIndex: exs.length ? Math.max(...exs.map((e) => e.orderIndex)) + 1 : 0,
    substitutedFrom: null, supersetGroup: null, targetSets: 3, repMin: 8, repMax: 12, targetRir: 2,
    restSec: pref?.restSec ?? ex?.defaultRestSec ?? 120, note: null,
  })
}

/**
 * Замена на аналог. Если подходов ещё нет — упражнение меняется на месте с теми же
 * целями. Если подходы уже записаны, они остаются за старым упражнением, а аналог
 * встаёт следующим — история не переписывается задним числом.
 */
export async function replaceExercise(seId: string, newExerciseId: string): Promise<string> {
  const se = await db.sessionExercises.get(seId)
  if (!se) throw new Error('Упражнение не найдено')
  const done = alive(await db.sets.where('sessionExerciseId').equals(seId).toArray())
  if (done.length === 0) {
    await save('sessionExercises', { id: seId, exerciseId: newExerciseId, substitutedFrom: se.substitutedFrom ?? se.exerciseId })
    return seId
  }
  const siblings = alive(await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray())
  for (const s of siblings) {
    if (s.orderIndex > se.orderIndex) await save('sessionExercises', { id: s.id, orderIndex: s.orderIndex + 1 })
  }
  const created = await save('sessionExercises', {
    ...se, id: undefined, exerciseId: newExerciseId, orderIndex: se.orderIndex + 1,
    substitutedFrom: se.exerciseId, serverUpdatedAt: null,
  })
  return created.id
}

export async function removeExercise(seId: string): Promise<void> {
  await softDelete('sessionExercises', seId)
}

/** Связать упражнение со следующим в суперсет или разорвать связь. */
export async function toggleSupersetWithNext(seId: string): Promise<void> {
  const se = await db.sessionExercises.get(seId)
  if (!se) return
  const all = alive(await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
  const idx = all.findIndex((e) => e.id === seId)
  const next = all[idx + 1]
  if (se.supersetGroup) {
    const group = se.supersetGroup
    for (const e of all.filter((x) => x.supersetGroup === group)) await save('sessionExercises', { id: e.id, supersetGroup: null })
    return
  }
  if (!next) return
  const group = next.supersetGroup ?? `S${Date.now().toString(36)}`
  await save('sessionExercises', { id: se.id, supersetGroup: group })
  await save('sessionExercises', { id: next.id, supersetGroup: group })
}

// ─── подходы ────────────────────────────────────────────────────────────────
export async function exerciseSets(exerciseId: string): Promise<SetRow[]> {
  return alive(await db.sets.where('exerciseId').equals(exerciseId).toArray()).sort((a, b) => a.performedAt.localeCompare(b.performedAt))
}

/** Подходы прошлых тренировок, сгруппированные по тренировке, от новых к старым. */
export async function previousSessionsSets(exerciseId: string, excludeSessionId: string | null): Promise<SetRow[][]> {
  const sets = await exerciseSets(exerciseId)
  const seIds = [...new Set(sets.map((s) => s.sessionExerciseId))]
  const ses = await db.sessionExercises.bulkGet(seIds)
  const sessionBySe = new Map(ses.filter(Boolean).map((s) => [s!.id, s!.sessionId]))
  const bySession = new Map<string, SetRow[]>()
  for (const s of sets) {
    const sid = sessionBySe.get(s.sessionExerciseId)
    if (!sid || sid === excludeSessionId) continue
    bySession.set(sid, [...(bySession.get(sid) ?? []), s])
  }
  return [...bySession.values()].sort((a, b) => b[0].performedAt.localeCompare(a[0].performedAt))
}

export interface Prefill {
  weightKg: number
  reps: number
  rir: number
  suggestion: ProgressionResult | null
  lastTime: SetRow[]
}

/**
 * Предзаполнение подхода. Внутри тренировки — как прошлый подход этого упражнения.
 * Для первого подхода — подсказка двойной прогрессии из прошлых тренировок.
 */
export async function prefillFor(se: SessionExercise, deload = false): Promise<Prefill> {
  const ex = await db.exercises.get(se.exerciseId)
  const history = await previousSessionsSets(se.exerciseId, se.sessionId)
  const lastTime = history[0] ?? []
  const target = {
    exerciseId: se.exerciseId, sets: se.targetSets ?? 3, repMin: se.repMin ?? 8, repMax: se.repMax ?? 12,
    rir: se.targetRir ?? 2, restSec: se.restSec ?? 120, cautious: ex?.cautiousDefault ?? false,
  }
  const plan = await planned(se)
  if (plan) {
    target.cautious = plan.cautious
    if (plan.incrementKg) Object.assign(target, { incrementKg: plan.incrementKg })
  }
  const group = ex?.primaryMuscles.map((m) => MUSCLE_TO_GROUP[m as Muscle]).find(Boolean)
  const suggestion = suggestNextLoad({
    target, lastSets: lastTime.map(toPerformed), prevSets: (history[1] ?? []).map(toPerformed),
    equipment: (ex?.equipment ?? undefined) as never, group,
  })

  const done = alive(await db.sets.where('sessionExerciseId').equals(se.id).toArray()).sort((a, b) => a.setIndex - b.setIndex)
  const lastHere = done.filter((s) => s.type !== 'warmup').at(-1)
  if (lastHere) return { weightKg: lastHere.weightKg, reps: lastHere.reps, rir: lastHere.rir ?? target.rir, suggestion, lastTime }

  // первый раз: с пустого грифа или лёгкого снаряда, а не с нуля
  let weight = suggestion.weightKg ?? startingWeight(ex?.equipment ?? null)
  if (deload && weight) weight = Math.round((weight * DELOAD_PRESET.weightMultiplier) / 2.5) * 2.5
  return { weightKg: weight, reps: suggestion.repTarget, rir: suggestion.rir, suggestion, lastTime }
}

/** Стартовый вес калибровки: пустой гриф, лёгкие гантели, лёгкий блин в тренажёре. */
export function startingWeight(equipment: string | null): number {
  switch (equipment) {
    case 'barbell': return 20
    case 'e-z curl bar': return 10
    case 'dumbbell': return 10
    case 'kettlebells': return 12
    case 'cable': return 15
    case 'machine': return 20
    default: return 0
  }
}

async function planned(se: SessionExercise): Promise<ProgramExercise | null> {
  const session = await db.sessions.get(se.sessionId)
  if (!session?.programDayId) return null
  const rows = alive(await db.programExercises.where('programDayId').equals(session.programDayId).toArray())
  return rows.find((r) => r.exerciseId === (se.substitutedFrom ?? se.exerciseId)) ?? null
}

export interface RecordSetInput {
  sessionExerciseId: string
  weightKg: number
  reps: number
  rir: number | null
  type: SetType
  note?: string | null
}

export async function recordSet(input: RecordSetInput): Promise<{ set: SetRow; records: RecordHit[] }> {
  const se = await db.sessionExercises.get(input.sessionExerciseId)
  if (!se) throw new Error('Упражнение тренировки не найдено')
  const existing = alive(await db.sets.where('sessionExerciseId').equals(se.id).toArray())
  const history = (await exerciseSets(se.exerciseId)).map(toPerformed)
  const draft: PerformedSet = {
    id: 'new', exerciseId: se.exerciseId, setIndex: existing.length + 1, weightKg: input.weightKg,
    reps: input.reps, rir: input.rir, type: input.type, performedAt: new Date().toISOString(),
  }
  const records = detectRecords(draft, history)
  const set = await save('sets', {
    sessionExerciseId: se.id, exerciseId: se.exerciseId, setIndex: draft.setIndex, weightKg: input.weightKg,
    reps: input.reps, rir: input.rir, type: input.type, e1rm: input.type === 'warmup' ? null : epley1RM(input.weightKg, input.reps, input.rir),
    isPr: records.length > 0, performedAt: draft.performedAt, note: input.note ?? null,
  })
  for (const r of records) {
    await save('personalRecords', {
      exerciseId: se.exerciseId, kind: r.kind, value: r.value, weightKg: input.weightKg, reps: input.reps,
      setId: set.id, achievedAt: set.performedAt,
    })
  }
  return { set, records }
}

export async function updateSet(id: string, patch: Partial<Pick<SetRow, 'weightKg' | 'reps' | 'rir' | 'type' | 'note'>>): Promise<void> {
  const cur = await db.sets.get(id)
  if (!cur) return
  const next = { ...cur, ...patch }
  await save('sets', { id, ...patch, e1rm: next.type === 'warmup' ? null : epley1RM(next.weightKg, next.reps, next.rir) })
}

export async function deleteSet(id: string): Promise<void> {
  await softDelete('sets', id)
  for (const pr of await db.personalRecords.toArray()) if (pr.setId === id && !pr.deletedAt) await softDelete('personalRecords', pr.id)
}

// ─── отдых ──────────────────────────────────────────────────────────────────
export async function startRest(durationSec: number): Promise<RestTimerState> {
  const state = { startedAt: new Date().toISOString(), durationSec }
  await setMeta(META.rest, state)
  return state
}

export async function stopRest(): Promise<void> {
  await setMeta(META.rest, null)
}

// ─── завершение ─────────────────────────────────────────────────────────────
export async function finishSession(sessionId: string, opts: { difficulty: number | null; note: string | null }): Promise<WorkoutSession> {
  const s = await save('sessions', { id: sessionId, status: 'finished', finishedAt: new Date().toISOString(), difficulty: opts.difficulty, note: opts.note })
  await setMeta(META.activeSessionId, null)
  await setMeta(META.rest, null)
  const ev = (await db.calendarEvents.where('date').equals(s.date).toArray()).find((e) => e.type === 'gym' && !e.deletedAt && e.status === 'planned')
  if (ev) await save('calendarEvents', { id: ev.id, status: 'done' })
  return s
}

export async function abandonSession(sessionId: string): Promise<void> {
  const sets = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  const hasSets = (await Promise.all(sets.map((se) => db.sets.where('sessionExerciseId').equals(se.id).count()))).some((n) => n > 0)
  // пустую тренировку удаляем мягко, с подходами — сохраняем как прерванную
  if (hasSets) await save('sessions', { id: sessionId, status: 'abandoned', finishedAt: new Date().toISOString() })
  else await softDelete('sessions', sessionId)
  await setMeta(META.activeSessionId, null)
  await setMeta(META.rest, null)
}
