import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { save, setCurrentUserId } from './repo'
import { buildExport, buildCsv, importJson } from './transfer'
import { addFood, repeatDay, saveMeal, savedMeals } from './nutrition'
import { saveBodyMetric } from './body'
import { saveCheckin } from './readiness'
import { alive } from './workout'

const USER = '11111111-1111-1111-1111-111111111111'

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(USER)
  for (const [id, ru, en] of [['squat', 'Приседания со штангой', 'Barbell Squat'], ['bench', 'Жим штанги лёжа', 'Bench Press']]) {
    await db.exercises.put({
      id, slug: id === 'squat' ? 'Barbell_Squat' : 'Bench', nameRu: ru, nameEn: en, primaryMuscles: ['quadriceps'], secondaryMuscles: [], equipment: 'barbell',
      level: null, force: null, mechanic: null, category: 'strength', instructionsRu: [], instructionsEn: [], cuesRu: [], mistakesRu: [],
      imageStart: null, imageEnd: null, youtubeUrl: null, defaultRestSec: 120, cautiousDefault: false, isCustom: false, ownerId: null,
      updatedAt: '1970-01-01T00:00:00Z', deletedAt: null,
    })
  }
})

describe('импорт прошлых тренировок', () => {
  it('находит упражнения по-русски, по-английски и по id базы, игнорируя ё и регистр', async () => {
    const r = await importJson(JSON.stringify({ sessions: [{ date: '2026-10-01', exercises: [
      { exercise: 'приседания со штангой', sets: [{ weightKg: 80, reps: 8 }] },
      { exercise: 'BENCH PRESS', sets: [{ weightKg: 60, reps: 10, rir: 2 }] },
      { exercise: 'Barbell_Squat', sets: [{ weightKg: 85, reps: 5 }] },
    ] }] }))
    expect(r.errors).toEqual([])
    expect(r.added).toBe(1)
    expect(alive(await db.sets.toArray())).toHaveLength(3)
    expect((await db.sessions.toArray())[0]).toMatchObject({ date: '2026-10-01', status: 'finished' })
  })

  it('незнакомое упражнение — ничего не импортируется, а список неизвестных виден', async () => {
    const r = await importJson(JSON.stringify({ sessions: [{ date: '2026-10-01', exercises: [{ exercise: 'Тяга бревна', sets: [{ weightKg: 50, reps: 5 }] }] }] }))
    expect(r.unknownExercises).toEqual(['Тяга бревна'])
    expect(await db.sessions.count()).toBe(0)
  })

  it('битый JSON — понятная ошибка', async () => {
    expect((await importJson('{ sessions: ')).errors[0]).toContain('не JSON')
  })
})

describe('полная копия', () => {
  it('экспорт → очистка → импорт возвращает всё, свежие локальные правки не перетираются', async () => {
    await saveBodyMetric('2026-11-10', { weightKg: 97 })
    await addFood('2026-11-10', 'Курица', 500, 60)
    const session = await save('sessions', { date: '2026-11-10', startedAt: '2026-11-10T10:00:00Z', finishedAt: '2026-11-10T11:00:00Z', programDayId: null, status: 'finished', difficulty: 7, note: 'старое' })
    const backup = await buildExport()
    expect(backup.tables.exercises).toHaveLength(0) // общий справочник не выгружается

    // локально сессию поправили позже копии
    await new Promise((r) => setTimeout(r, 5))
    await save('sessions', { id: session.id, note: 'новое' })
    await db.bodyMetrics.clear()

    const r = await importJson(JSON.stringify(backup))
    expect(r.kind).toBe('backup')
    expect(alive(await db.bodyMetrics.toArray())[0].weightKg).toBe(97)
    expect((await db.sessions.get(session.id))!.note).toBe('новое')
    // восстановленная строка сохранила своё время правки, а не получила сегодняшнее
    const restored = alive(await db.bodyMetrics.toArray())[0]
    expect(restored.updatedAt).toBe((backup.tables.bodyMetrics[0] as { updatedAt: string }).updatedAt)
  })

  it('CSV подходов с русскими названиями и 1ПМ', async () => {
    const se = await save('sessionExercises', { sessionId: 's', exerciseId: 'squat', orderIndex: 0, substitutedFrom: null, supersetGroup: null, targetSets: 3, repMin: 6, repMax: 8, targetRir: 2, restSec: 120, note: null })
    await save('sets', { sessionExerciseId: se.id, exerciseId: 'squat', setIndex: 1, weightKg: 100, reps: 5, rir: 0, type: 'work', e1rm: null, isPr: true, performedAt: '2026-11-10T10:05:00Z', note: 'тяжело, но чисто' })
    const csv = await buildCsv('sets')
    expect(csv).toContain('Приседания со штангой,Barbell Squat,1,100,5,0,work,116.7,да,"тяжело, но чисто"')
  })
})

describe('питание и чек-ин', () => {
  it('«повторить вчерашнее» копирует записи и считает использование блюд', async () => {
    const meal = await saveMeal('Творог', 300, 35)
    await addFood('2026-11-16', 'Творог', 300, 35, meal.id)
    await addFood('2026-11-16', 'Рис', 700, 15)
    expect(await repeatDay('2026-11-16', '2026-11-17')).toBe(2)
    expect(alive(await db.nutritionEntries.where('date').equals('2026-11-17').toArray())).toHaveLength(2)
    expect((await savedMeals())[0]).toMatchObject({ name: 'Творог', useCount: 2 })
  })

  it('сохранённое блюдо с тем же названием обновляется, а не дублируется', async () => {
    await saveMeal('Творог', 300, 35)
    await saveMeal('творог', 320, 36)
    expect(await savedMeals()).toHaveLength(1)
  })

  it('чек-ин учитывает вчерашний футбол и хранит балл', async () => {
    await save('calendarEvents', { date: '2026-11-16', type: 'football', programDayId: null, durationMin: 90, intensity: 8, status: 'done', note: null })
    const { result, row } = await saveCheckin({ date: '2026-11-17', sleepHours: 7.5, energy: 3, soreness: 3, stress: 3 })
    expect(result.factors.some((f) => f.label === 'Футбол')).toBe(true)
    expect(row.score).toBe(result.score)
    expect(row.score).toBeLessThan(75)
  })

  it('повторный чек-ин за день обновляет запись', async () => {
    await saveCheckin({ date: '2026-11-17', sleepHours: 6, energy: 2, soreness: 3, stress: 3 })
    await saveCheckin({ date: '2026-11-17', sleepHours: 8, energy: 4, soreness: 2, stress: 2 })
    expect(alive(await db.readinessCheckins.toArray())).toHaveLength(1)
  })
})
