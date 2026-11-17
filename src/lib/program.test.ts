import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './db'
import { save, setCurrentUserId } from './repo'
import { createStarterProgram, loadSnapshot, saveVersion, rollbackTo, listVersions, activeProgram } from './program'
import { ensureWeekPlanned, loadWeek, addFootball, moveGym, currentStreak, deloadSuggestion, startDeloadThisWeek } from './calendar'
import { alive } from './workout'
import { buildStarterProgram, weekKey } from '../domain'

const USER = '11111111-1111-1111-1111-111111111111'

async function seedExercises() {
  const slugs = buildStarterProgram(['back', 'hamstring']).days.flatMap((d) => d.exercises.map((e) => e.exercise))
  for (const slug of [...new Set([...slugs, 'Plank'])]) {
    await db.exercises.put({
      id: `uuid-${slug}`, slug, nameRu: slug, nameEn: slug, primaryMuscles: ['quadriceps'], secondaryMuscles: [], equipment: 'barbell',
      level: null, force: null, mechanic: null, category: 'strength', instructionsRu: [], instructionsEn: [], cuesRu: [], mistakesRu: [],
      imageStart: null, imageEnd: null, youtubeUrl: null, defaultRestSec: 120, cautiousDefault: false, isCustom: false, ownerId: null,
      updatedAt: '1970-01-01T00:00:00Z', deletedAt: null,
    })
  }
}

beforeEach(async () => {
  vi.useRealTimers()
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(USER)
  await seedExercises()
})

describe('программа и версии', () => {
  it('стартовая программа сохраняется с UUID упражнений вместо slug', async () => {
    const p = await createStarterProgram(['back', 'hamstring'])
    const snap = (await loadSnapshot(p.id))!
    expect(snap.days).toHaveLength(3)
    expect(snap.days[0].exercises[0].exercise).toBe('uuid-Barbell_Squat')
    expect(snap.days[1].exercises[0]).toMatchObject({ exercise: 'uuid-Romanian_Deadlift', cautious: true, rir: 3 })
  })

  it('правка — новая версия, прежняя остаётся неактивной', async () => {
    const v1 = await createStarterProgram([])
    const snap = (await loadSnapshot(v1.id))!
    snap.days[0].exercises[0].sets = 4
    const v2 = await saveVersion(snap)
    expect(v2.version).toBe(2)
    expect((await activeProgram())!.id).toBe(v2.id)
    expect((await db.programs.get(v1.id))!.isActive).toBe(false)
    expect((await loadSnapshot(v1.id))!.days[0].exercises[0].sets).toBe(3)
  })

  it('откат создаёт новую версию из старой — история не теряется', async () => {
    const v1 = await createStarterProgram([])
    const snap = (await loadSnapshot(v1.id))!
    snap.days[0].exercises.pop()
    await saveVersion(snap)
    const v3 = await rollbackTo(v1.id)
    expect(v3.version).toBe(3)
    expect(v3.parentId).toBe(v1.id)
    expect((await listVersions()).map((v) => v.version)).toEqual([3, 2, 1])
    expect((await loadSnapshot(v3.id))!.days[0].exercises).toHaveLength((await loadSnapshot(v1.id))!.days[0].exercises.length)
  })

  it('запланированные тренировки переезжают на дни новой версии', async () => {
    const v1 = await createStarterProgram([])
    const dayA = alive(await db.programDays.where('programId').equals(v1.id).toArray()).find((d) => d.orderIndex === 0)!
    await save('calendarEvents', { date: '2099-01-05', type: 'gym', programDayId: dayA.id, status: 'planned', durationMin: null, intensity: null, note: null })
    const v2 = await saveVersion((await loadSnapshot(v1.id))!)
    const newA = alive(await db.programDays.where('programId').equals(v2.id).toArray()).find((d) => d.orderIndex === 0)!
    expect((await db.calendarEvents.toArray())[0].programDayId).toBe(newA.id)
  })
})

describe('календарь', () => {
  async function petr() {
    await db.profiles.put({
      id: USER, displayName: 'Пётр', heightCm: 193, birthDate: null, kcalTarget: 3000, proteinTarget: 190, weightGoalKg: null,
      weightRateKgWeek: null, theme: 'dark', restSecDefault: 120, limitations: ['back', 'hamstring'], onboardedAt: '2026-11-16T00:00:00Z',
      gymWeekdays: [2, 4, 6], footballWeekdays: [0], deloadStart: null, updatedAt: '2026-11-16T00:00:00Z',
    })
    await createStarterProgram(['back', 'hamstring'])
  }

  it('неделя заполняется из шаблона без конфликтов и только один раз', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 9), toFake: ['Date'] })
    await petr()
    await ensureWeekPlanned('2026-11-16')
    const w = await loadWeek('2026-11-16')
    const kinds = w.days.map((d) => d.events.map((e) => e.type).join('+') || '—')
    expect(kinds).toEqual(['—', 'gym', '—', 'gym', '—', 'gym', 'football'])
    expect(w.conflicts).toEqual([])
    const sat = w.days[5].events[0]
    expect(w.dayNames.get(sat.programDayId!)!.heavyLegs).toBe(false)

    // очистили день руками — повторное открытие недели его не вернёт
    for (const e of w.days[1].events) await save('calendarEvents', { id: e.id, deletedAt: new Date().toISOString() })
    await ensureWeekPlanned('2026-11-16')
    expect((await loadWeek('2026-11-16')).days[1].events).toEqual([])
  })

  it('второй футбол на неделе: предупреждение о снижении объёма ног', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 9), toFake: ['Date'] })
    await petr()
    await ensureWeekPlanned('2026-11-16')
    await addFootball('2026-11-18', 60, 6)
    expect((await loadWeek('2026-11-16')).conflicts.map((c) => c.code)).toContain('two_football_week')
  })

  it('футбол накануне дня ног — конфликт, и перенос его снимает', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 9), toFake: ['Date'] })
    await petr()
    await ensureWeekPlanned('2026-11-16')
    await addFootball('2026-11-16') // понедельник, а во вторник день A с тяжёлыми ногами
    const before = await loadWeek('2026-11-16')
    const c = before.conflicts.find((x) => x.code === 'legs_after_football')!
    expect(c).toBeDefined()
    expect(c.suggestedDate).toBe('2026-11-18')
    await moveGym(c.date, c.suggestedDate!)
    const after = await loadWeek('2026-11-16')
    expect(after.conflicts.filter((x) => x.code !== 'two_football_week')).toEqual([])
  })

  it('футбол одним касанием берёт длительность и тяжесть прошлого раза', async () => {
    await addFootball('2026-11-08', 75, 8)
    const ev = await addFootball('2026-11-15')
    expect(ev).toMatchObject({ durationMin: 75, intensity: 8 })
  })

  it('серия недель и разгрузка', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 9), toFake: ['Date'] })
    for (const date of ['2026-11-03', '2026-11-10']) {
      await save('calendarEvents', { date, type: 'gym', programDayId: null, status: 'done', durationMin: null, intensity: null, note: null })
      await save('sessions', { date, startedAt: `${date}T10:00:00Z`, finishedAt: `${date}T11:00:00Z`, programDayId: null, status: 'finished', difficulty: 7, note: null })
    }
    expect(await currentStreak()).toBe(2)

    await save('sessions', { date: '2026-09-01', startedAt: '2026-09-01T10:00:00Z', finishedAt: '2026-09-01T11:00:00Z', programDayId: null, status: 'finished', difficulty: 7, note: null })
    await db.profiles.put({ id: USER, displayName: '', heightCm: null, birthDate: null, kcalTarget: 3000, proteinTarget: 190, weightGoalKg: null, weightRateKgWeek: null, theme: 'dark', restSecDefault: 120, limitations: [], onboardedAt: null, gymWeekdays: [], footballWeekdays: [], deloadStart: null, updatedAt: '2026-01-01T00:00:00Z' })
    const s = await deloadSuggestion()
    expect(s.suggest).toBe(true)
    expect(s.urgency).toBe('strong')
    await startDeloadThisWeek()
    expect((await db.profiles.get(USER))!.deloadStart).toBe(weekKey('2026-11-16'))
    expect((await deloadSuggestion()).suggest).toBe(false)
  })
})
