import { describe, it, expect } from 'vitest'
import { weightSeries, paceKgPerWeek, goalEta } from './body'
import { dayTotals, weekAverage, ringFraction } from './nutrition'
import { e1rmByDay, lastWeeks, attendanceByWeek, weekStats, compareWeeks, type DatedSet } from './analytics'
import { toCsv, parsePastWorkouts, isExportEnvelope, IMPORT_EXAMPLE } from './transfer'
import { addDays } from './dates'

describe('вес тела', () => {
  it('скользящее среднее сглаживает скачки', () => {
    const s = weightSeries([{ date: '2026-11-01', value: 97 }, { date: '2026-11-02', value: 98.4 }, { date: '2026-11-03', value: 97.2 }])
    expect(s[1].avg).toBe(97.7)
    expect(s.map((x) => x.raw)).toEqual([97, 98.4, 97.2])
  })

  it('темп: +0,25 кг в неделю на ровных данных', () => {
    const pts = Array.from({ length: 29 }, (_, i) => ({ date: addDays('2026-10-01', i), value: 97 + (0.25 / 7) * i }))
    expect(paceKgPerWeek(pts)).toBeCloseTo(0.25, 2)
  })

  it('темп не считается по двум точкам и по данным меньше недели', () => {
    expect(paceKgPerWeek([{ date: '2026-11-01', value: 97 }, { date: '2026-11-20', value: 98 }])).toBeNull()
    expect(paceKgPerWeek([{ date: '2026-11-01', value: 97 }, { date: '2026-11-02', value: 98 }, { date: '2026-11-03', value: 98 }])).toBeNull()
  })

  it('цели нет — нет и прогноза', () => {
    expect(goalEta(97, null, 0.25)).toBeNull()
    expect(goalEta(97, 100, 0.25)).toEqual({ remainingKg: 3, weeks: 12 })
    expect(goalEta(97, 100, -0.2)).toEqual({ remainingKg: 3, weeks: null })
  })
})

describe('питание', () => {
  const e = [
    { date: '2026-11-17', name: 'Курица', kcal: 500, proteinG: 60 },
    { date: '2026-11-17', name: 'Творог', kcal: 300, proteinG: 35 },
    { date: '2026-11-15', name: 'Рис', kcal: 700, proteinG: 15 },
  ]
  it('итог дня', () => {
    expect(dayTotals(e, '2026-11-17')).toEqual({ kcal: 800, proteinG: 95, count: 2 })
  })
  it('среднее за неделю — по дням с записями', () => {
    expect(weekAverage(e, '2026-11-17')).toEqual({ kcal: 750, proteinG: 55, daysLogged: 2 })
    expect(weekAverage([], '2026-11-17').daysLogged).toBe(0)
  })
  it('кольцо не уходит за 100%', () => {
    expect(ringFraction(250, 190)).toBe(1)
    expect(ringFraction(95, 190)).toBe(0.5)
    expect(ringFraction(10, 0)).toBe(0)
  })
})

const set = (date: string, exerciseId: string, weightKg: number, reps: number, type: DatedSet['type'] = 'work'): DatedSet => ({
  id: Math.random().toString(36), date, exerciseId, setIndex: 1, weightKg, reps, rir: 2, type, performedAt: `${date}T10:00:00Z`,
})

describe('аналитика', () => {
  const muscles = { squat: { primary: ['quadriceps' as const], secondary: [] }, bench: { primary: ['chest' as const], secondary: [] } }
  const sets = [set('2026-11-10', 'squat', 80, 8), set('2026-11-10', 'squat', 85, 5), set('2026-11-17', 'squat', 90, 5), set('2026-11-17', 'bench', 60, 10), set('2026-11-17', 'squat', 40, 10, 'warmup')]

  it('лучший 1ПМ по дням без разминки', () => {
    const r = e1rmByDay(sets.filter((s) => s.exerciseId === 'squat'))
    expect(r.map((x) => x.date)).toEqual(['2026-11-10', '2026-11-17'])
    expect(r[1].value).toBeGreaterThan(r[0].value)
  })

  it('недели от старых к новым, посещаемость', () => {
    const weeks = lastWeeks('2026-11-18', 3)
    expect(weeks).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(attendanceByWeek(['2026-11-10', '2026-11-12', '2026-11-17'], weeks).map((w) => w.count)).toEqual([0, 2, 1])
  })

  it('сравнение недель', () => {
    const cur = weekStats(sets, ['2026-11-17'], muscles, '2026-11-16')
    const prev = weekStats(sets, ['2026-11-10'], muscles, '2026-11-09')
    const rows = compareWeeks(cur, prev, (g) => g)
    expect(rows.find((r) => r.label === 'Рабочие подходы')).toMatchObject({ current: 2, previous: 2, delta: 0 })
    expect(rows.find((r) => r.label === 'chest, подх.')).toMatchObject({ current: 1, previous: 0, delta: 1 })
  })
})

describe('экспорт и импорт', () => {
  it('CSV экранирует запятые, кавычки и переводы строк, начинается с BOM', () => {
    const csv = toCsv([{ label: 'Упражнение', value: (r: { n: string }) => r.n }, { label: 'Вес', value: () => 82.5 }], [{ n: 'Жим, узкий "хват"' }, { n: 'две\nстроки' }])
    expect(csv.startsWith('﻿Упражнение,Вес\r\n')).toBe(true)
    expect(csv).toContain('"Жим, узкий ""хват""",82.5')
    expect(csv).toContain('"две\nстроки",82.5')
  })

  it('узнаёт полный экспорт', () => {
    expect(isExportEnvelope({ format: 'coach-export', version: 1, tables: {} })).toBe(true)
    expect(isExportEnvelope({ sessions: [] })).toBe(false)
  })

  it('пример из подсказки разбирается без ошибок', () => {
    const r = parsePastWorkouts(IMPORT_EXAMPLE)
    expect(r.errors).toEqual([])
    expect(r.sessions[0].exercises[0].sets).toHaveLength(2)
    expect(r.sessions[0].exercises[0].sets[1]).toMatchObject({ rir: null, type: 'work' })
    expect(Date.parse(r.sessions[0].finishedAt) - Date.parse(r.sessions[0].startedAt)).toBe(60 * 60000)
  })

  it('ошибки указывают место и не роняют остальное', () => {
    const r = parsePastWorkouts({
      sessions: [
        { date: '01.10.2026', exercises: [] },
        { date: '2026-10-02', exercises: [{ exercise: 'Жим', sets: [{ weightKg: 70, reps: 0 }, { weightKg: 70, reps: 8, rir: 9 }, { weightKg: '72,5', reps: 6 }] }] },
      ],
    })
    expect(r.errors).toEqual([
      'тренировка 1: дата в формате ГГГГ-ММ-ДД обязательна',
      'тренировка 2, упражнение 1, подход 1: повторы — целое число от 1',
      'тренировка 2, упражнение 1, подход 2: запас повторов — от 0 до 4',
    ])
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0].exercises[0].sets).toEqual([{ weightKg: 72.5, reps: 6, rir: null, type: 'work' }])
  })

  it('мусор на входе — понятная ошибка', () => {
    expect(parsePastWorkouts('нет').errors[0]).toContain('sessions')
    expect(parsePastWorkouts(null).errors).toHaveLength(1)
  })
})

describe('темп на шумных данных', () => {
  it('колебания воды ±0,6 кг не сбивают темп', () => {
    const noise = [0.6, -0.4, 0.2, -0.6, 0.5, -0.2, 0.1]
    const pts = Array.from({ length: 29 }, (_, i) => ({ date: addDays('2026-10-01', i), value: 97 + (0.25 / 7) * i + noise[i % 7] }))
    expect(paceKgPerWeek(pts)!).toBeGreaterThan(0.15)
    expect(paceKgPerWeek(pts)!).toBeLessThan(0.35)
  })
})
