import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, META, getMeta } from './db'
import { save, setCurrentUserId } from './repo'
import {
  startSession, getActiveSessionId, recordSet, replaceExercise, finishSession, abandonSession,
  prefillFor, addExercise, toggleSupersetWithNext, deleteSet, alive,
} from './workout'
import { localDate } from '../domain'

const USER = '11111111-1111-1111-1111-111111111111'

async function seed() {
  for (const [id, primary, equipment] of [
    ['squat', ['quadriceps'], 'barbell'], ['front', ['quadriceps'], 'barbell'], ['bench', ['chest'], 'barbell'],
  ] as const) {
    await db.exercises.put({
      id, slug: id, nameRu: id, nameEn: id, primaryMuscles: [...primary], secondaryMuscles: [], equipment,
      level: null, force: null, mechanic: 'compound', category: 'strength', instructionsRu: [], instructionsEn: [],
      cuesRu: [], mistakesRu: [], imageStart: null, imageEnd: null, youtubeUrl: null, defaultRestSec: 150,
      cautiousDefault: false, isCustom: false, ownerId: null, updatedAt: '1970-01-01T00:00:00Z', deletedAt: null,
    })
  }
  const program = await save('programs', { name: 'Тест', version: 1, parentId: null, isActive: true, notes: null })
  const day = await save('programDays', { programId: program.id, orderIndex: 0, name: 'День A', focus: null, heavyLegs: true })
  await save('programExercises', { programDayId: day.id, exerciseId: 'squat', orderIndex: 0, targetSets: 3, repMin: 6, repMax: 8, targetRir: 2, restSec: 180, incrementKg: null, cautious: false, supersetGroup: null, notes: null })
  await save('programExercises', { programDayId: day.id, exerciseId: 'bench', orderIndex: 1, targetSets: 3, repMin: 6, repMax: 10, targetRir: 2, restSec: 150, incrementKg: null, cautious: false, supersetGroup: null, notes: null })
  return day.id
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(USER)
})

const exercisesOf = async (sid: string) =>
  alive(await db.sessionExercises.where('sessionId').equals(sid).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)

describe('тренировка', () => {
  it('стартует из дня программы и копирует цели', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId })
    const exs = await exercisesOf(sid)
    expect(exs.map((e) => e.exerciseId)).toEqual(['squat', 'bench'])
    expect(exs[0]).toMatchObject({ targetSets: 3, repMin: 6, repMax: 8, restSec: 180 })
  })

  it('незавершённая тренировка восстанавливается и не дублируется', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId })
    expect(await getActiveSessionId()).toBe(sid)
    expect(await startSession({ programDayId: dayId })).toBe(sid)
  })

  it('разгрузка: меньше подходов и запас не ниже 3', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId, deload: true })
    const [squat] = await exercisesOf(sid)
    expect(squat.targetSets).toBe(2)
    expect(squat.targetRir).toBe(3)
  })

  it('два футбола на неделе: у ног на подход меньше, у груди без изменений', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId, cutLegVolume: true })
    const [squat, bench] = await exercisesOf(sid)
    expect(squat.targetSets).toBe(2)
    expect(bench.targetSets).toBe(3)
  })

  it('запись подхода и рекорд по сравнению с прошлой тренировкой', async () => {
    const dayId = await seed()
    const first = await startSession({ programDayId: dayId })
    const [se1] = await exercisesOf(first)
    const r1 = await recordSet({ sessionExerciseId: se1.id, weightKg: 80, reps: 8, rir: 2, type: 'work' })
    expect(r1.records).toEqual([]) // первый раз — без ложного рекорда
    await finishSession(first, { difficulty: 7, note: null })

    const second = await startSession({ programDayId: dayId })
    const [se2] = await exercisesOf(second)
    const r2 = await recordSet({ sessionExerciseId: se2.id, weightKg: 85, reps: 6, rir: 2, type: 'work' })
    expect(r2.records.map((r) => r.kind)).toEqual(expect.arrayContaining(['weight', 'e1rm']))
    expect(r2.set.isPr).toBe(true)
    expect(await db.personalRecords.count()).toBeGreaterThan(0)
  })

  it('удаление подхода снимает его рекорды', async () => {
    const dayId = await seed()
    const a = await startSession({ programDayId: dayId })
    const [seA] = await exercisesOf(a)
    await recordSet({ sessionExerciseId: seA.id, weightKg: 80, reps: 8, rir: 2, type: 'work' })
    await finishSession(a, { difficulty: null, note: null })
    const b = await startSession({ programDayId: dayId })
    const [seB] = await exercisesOf(b)
    const { set } = await recordSet({ sessionExerciseId: seB.id, weightKg: 90, reps: 5, rir: 2, type: 'work' })
    await deleteSet(set.id)
    expect(alive(await db.personalRecords.toArray())).toHaveLength(0)
    expect((await db.sets.get(set.id))!.deletedAt).toBeTruthy() // строка осталась — мягкое удаление
  })

  it('подсказка веса из прошлой тренировки: все подходы по верху → +5 кг на ноги', async () => {
    const dayId = await seed()
    const a = await startSession({ programDayId: dayId })
    const [seA] = await exercisesOf(a)
    for (let i = 0; i < 3; i++) await recordSet({ sessionExerciseId: seA.id, weightKg: 80, reps: 8, rir: 2, type: 'work' })
    await finishSession(a, { difficulty: null, note: null })
    const b = await startSession({ programDayId: dayId })
    const [seB] = await exercisesOf(b)
    const p = await prefillFor(seB)
    expect(p.weightKg).toBe(85)
    expect(p.reps).toBe(6)
    expect(p.lastTime).toHaveLength(3)
  })

  it('внутри тренировки второй подход предзаполняется как первый', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId })
    const [se] = await exercisesOf(sid)
    await recordSet({ sessionExerciseId: se.id, weightKg: 72.5, reps: 7, rir: 1, type: 'work' })
    const p = await prefillFor(se)
    expect(p).toMatchObject({ weightKg: 72.5, reps: 7, rir: 1 })
  })

  it('замена без подходов — на месте; с подходами — следующим упражнением', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId })
    const [squat] = await exercisesOf(sid)
    expect(await replaceExercise(squat.id, 'front')).toBe(squat.id)
    expect((await db.sessionExercises.get(squat.id))!).toMatchObject({ exerciseId: 'front', substitutedFrom: 'squat' })

    await recordSet({ sessionExerciseId: squat.id, weightKg: 60, reps: 8, rir: 2, type: 'work' })
    const newId = await replaceExercise(squat.id, 'squat')
    expect(newId).not.toBe(squat.id)
    const order = (await exercisesOf(sid)).map((e) => e.exerciseId)
    expect(order).toEqual(['front', 'squat', 'bench'])
  })

  it('суперсет связывается со следующим и разрывается', async () => {
    const dayId = await seed()
    const sid = await startSession({ programDayId: dayId })
    const [a, b] = await exercisesOf(sid)
    await toggleSupersetWithNext(a.id)
    const linked = await exercisesOf(sid)
    expect(linked[0].supersetGroup).toBeTruthy()
    expect(linked[0].supersetGroup).toBe(linked[1].supersetGroup)
    await toggleSupersetWithNext(b.id)
    expect((await exercisesOf(sid)).every((e) => !e.supersetGroup)).toBe(true)
  })

  it('завершение снимает активную тренировку и отмечает день в календаре', async () => {
    const dayId = await seed()
    await save('calendarEvents', { date: localDate(), type: 'gym', programDayId: dayId, durationMin: null, intensity: null, status: 'planned', note: null })
    const sid = await startSession({ programDayId: dayId })
    await finishSession(sid, { difficulty: 8, note: 'тяжело' })
    expect(await getActiveSessionId()).toBeNull()
    expect((await db.sessions.get(sid))!).toMatchObject({ status: 'finished', difficulty: 8 })
    expect((await db.calendarEvents.toArray())[0].status).toBe('done')
  })

  it('пустая брошенная тренировка удаляется мягко, с подходами — сохраняется', async () => {
    const empty = await startSession()
    await abandonSession(empty)
    expect((await db.sessions.get(empty))!.deletedAt).toBeTruthy()

    await seed()
    const sid = await startSession()
    const se = await addExercise(sid, 'bench')
    await recordSet({ sessionExerciseId: se.id, weightKg: 60, reps: 10, rir: 2, type: 'work' })
    await abandonSession(sid)
    expect((await db.sessions.get(sid))!.status).toBe('abandoned')
    expect(await getMeta(META.activeSessionId, 'x')).toBeNull()
  })
})

describe('первый подход упражнения', () => {
  it('калибровка начинается с пустого грифа, а не с нуля', async () => {
    await seed()
    const sid = await startSession()
    const se = await addExercise(sid, 'squat')
    const p = await prefillFor(se)
    expect(p.suggestion?.outcome).toBe('calibration')
    expect(p.weightKg).toBe(20)
  })
})
