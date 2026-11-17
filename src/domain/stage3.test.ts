import { describe, it, expect } from 'vitest'
import { buildStarterProgram, diffSnapshots, describeTargets, type ProgramSnapshot } from './program'
import { planWeek, weekStreak } from './calendar'
import { detectConflicts } from './planner'

const slugs = (p: ProgramSnapshot) => p.days.map((d) => d.exercises.map((e) => e.exercise))

describe('стартовая программа', () => {
  it('три дня на всё тело, ноги в двух днях, третий — без тяжёлых ног', () => {
    const p = buildStarterProgram()
    expect(p.days).toHaveLength(3)
    expect(p.days.map((d) => d.heavyLegs)).toEqual([true, true, false])
    expect(slugs(p)[0]).toContain('Barbell_Squat')
  })

  it('без ограничений осторожный режим не включается', () => {
    const p = buildStarterProgram()
    const curls = p.days[0].exercises.find((e) => e.exercise === 'Lying_Leg_Curls')!
    expect(curls.cautious).toBe(false)
  })

  it('надрыв бедра: сгибания ног и румынская тяга — осторожно, запас 3 у тяги, шаг 2,5', () => {
    const p = buildStarterProgram(['hamstring'])
    const curls = p.days[0].exercises.find((e) => e.exercise === 'Lying_Leg_Curls')!
    const rdl = p.days[1].exercises.find((e) => e.exercise === 'Romanian_Deadlift')!
    expect(curls.cautious).toBe(true)
    expect(rdl).toMatchObject({ cautious: true, rir: 3, incrementKg: 2.5 })
  })

  it('спина: присед и гиперэкстензия осторожно, в программе нет становой и тяги в наклоне', () => {
    const p = buildStarterProgram(['back'])
    const all = slugs(p).flat()
    expect(all).not.toContain('Barbell_Deadlift')
    expect(all).not.toContain('Bent_Over_Barbell_Row')
    expect(p.days[0].exercises[0]).toMatchObject({ exercise: 'Barbell_Squat', cautious: true })
    expect(p.days[1].exercises.find((e) => e.exercise === 'Hyperextensions_Back_Extensions')!.cautious).toBe(true)
  })

  it('колени: гоблет вместо приседа со штангой, жим ногами вместо выпадов', () => {
    const all = slugs(buildStarterProgram(['knees'])).flat()
    expect(all).toContain('Goblet_Squat')
    expect(all).not.toContain('Barbell_Squat')
    expect(all).toContain('Leg_Press')
    expect(all).not.toContain('Split_Squat_with_Dumbbells')
  })

  it('плечи: без брусьев', () => {
    expect(slugs(buildStarterProgram(['shoulders'])).flat()).not.toContain('Parallel_Bar_Dip')
  })
})

describe('сравнение версий программы', () => {
  const name = (id: string) => id
  it('видит добавленные, убранные и изменённые упражнения', () => {
    const a = buildStarterProgram()
    const b: ProgramSnapshot = structuredClone(a)
    b.days[0].exercises[0].sets = 4
    b.days[0].exercises.splice(4, 1) // убрали махи
    b.days[2].exercises.push({ exercise: 'Plank', sets: 3, repMin: 30, repMax: 60, rir: 2, restSec: 60 })
    const d = diffSnapshots(a, b, name)
    expect(d).toContainEqual(expect.objectContaining({ kind: 'changed', exercise: 'Barbell_Squat', before: expect.stringContaining('3 ×'), after: expect.stringContaining('4 ×') }))
    expect(d).toContainEqual(expect.objectContaining({ kind: 'removed', exercise: 'Side_Lateral_Raise' }))
    expect(d).toContainEqual(expect.objectContaining({ kind: 'added', exercise: 'Plank', day: 'День C' }))
  })
  it('одинаковые снимки — без разницы', () => {
    const a = buildStarterProgram()
    expect(diffSnapshots(a, structuredClone(a), name)).toEqual([])
  })
  it('перестановка упражнений заметна', () => {
    const a = buildStarterProgram()
    const b = structuredClone(a)
    b.days[1].exercises.reverse()
    expect(diffSnapshots(a, b, name).some((x) => x.after === 'новый порядок упражнений')).toBe(true)
  })
  it('цели описываются по-русски', () => {
    expect(describeTargets({ exercise: 'x', sets: 3, repMin: 6, repMax: 8, rir: 2, restSec: 150, cautious: true })).toBe('3 × 6–8 · запас 2 · отдых 2,5 мин · осторожно')
  })
})

const DAYS = [
  { id: 'A', heavyLegs: true },
  { id: 'B', heavyLegs: true },
  { id: 'C', heavyLegs: false },
]

describe('расстановка недели', () => {
  it('Пётр: зал вт/чт/сб, футбол вс → C встаёт в субботу, ноги во вторник и четверг', () => {
    const plan = planWeek('2026-11-18', { gymWeekdays: [2, 4, 6], footballWeekdays: [0] }, DAYS)
    expect(plan).toEqual([
      { date: '2026-11-17', type: 'gym', programDayId: 'A' },
      { date: '2026-11-19', type: 'gym', programDayId: 'B' },
      { date: '2026-11-21', type: 'gym', programDayId: 'C' },
      { date: '2026-11-22', type: 'football', programDayId: null },
    ])
  })

  it('зал пн/ср/пт при футболе в вс прошлой недели: понедельник без тяжёлых ног', () => {
    const plan = planWeek('2026-11-18', { gymWeekdays: [1, 3, 5], footballWeekdays: [0] }, DAYS, { football: true })
    expect(plan.find((p) => p.date === '2026-11-16')!.programDayId).toBe('C')
  })

  it('без программы дни зала ставятся свободными тренировками', () => {
    expect(planWeek('2026-11-18', { gymWeekdays: [2], footballWeekdays: [0] }, [])).toEqual([
      { date: '2026-11-17', type: 'gym', programDayId: null },
      { date: '2026-11-22', type: 'football', programDayId: null },
    ])
  })

  it('дней зала больше, чем дней программы — программа идёт по кругу', () => {
    const plan = planWeek('2026-11-18', { gymWeekdays: [1, 2, 4, 5], footballWeekdays: [] }, DAYS).filter((p) => p.type === 'gym')
    expect(plan).toHaveLength(4)
  })
})

describe('конфликты на стыке недель', () => {
  it('футбол в воскресенье и тяжёлые ноги в понедельник следующей недели — конфликт', () => {
    const c = detectConflicts(
      [{ date: '2026-11-22', type: 'football' }, { date: '2026-11-23', type: 'gym', heavyLegs: true }],
      { from: '2026-11-23', to: '2026-11-29' },
    )
    expect(c.map((x) => x.code)).toEqual(['legs_after_football'])
  })

  it('футбол прошлой недели не засчитывается во «второй футбол за неделю»', () => {
    const c = detectConflicts(
      [{ date: '2026-11-22', type: 'football' }, { date: '2026-11-29', type: 'football' }],
      { from: '2026-11-23', to: '2026-11-29' },
    )
    expect(c.map((x) => x.code)).not.toContain('two_football_week')
  })

  it('перенос предлагается только на свободный день, не на другой зал', () => {
    const c = detectConflicts([
      { date: '2026-11-16', type: 'rest' }, { date: '2026-11-17', type: 'gym' },
      { date: '2026-11-18', type: 'rest' }, { date: '2026-11-19', type: 'gym' },
      { date: '2026-11-20', type: 'rest' }, { date: '2026-11-21', type: 'gym', heavyLegs: true },
      { date: '2026-11-22', type: 'football' },
    ])
    expect(['2026-11-17', '2026-11-19']).not.toContain(c[0].suggestedDate)
    expect(c[0].suggestedDate).toBe('2026-11-20')
  })
})

describe('серия недель без пропусков', () => {
  it('считает подряд закрытые недели и не рвётся на неделе без плана', () => {
    expect(weekStreak([
      { weekStart: '2026-11-16', planned: 3, done: 1 }, // текущая, не закрыта — не считается и не рвёт
      { weekStart: '2026-11-09', planned: 3, done: 3 },
      { weekStart: '2026-11-02', planned: 0, done: 0 },
      { weekStart: '2026-10-26', planned: 3, done: 3 },
      { weekStart: '2026-10-19', planned: 3, done: 2 },
      { weekStart: '2026-10-12', planned: 3, done: 3 },
    ], '2026-11-16')).toBe(2)
  })
  it('закрытая текущая неделя добавляется', () => {
    expect(weekStreak([{ weekStart: '2026-11-16', planned: 2, done: 2 }, { weekStart: '2026-11-09', planned: 3, done: 3 }], '2026-11-16')).toBe(2)
  })
  it('пусто — ноль', () => {
    expect(weekStreak([], '2026-11-16')).toBe(0)
  })
})

describe('как снимается конфликт', () => {
  it('перенос не предлагается на прошедший день', () => {
    const c = detectConflicts([
      { date: '2026-11-16', type: 'rest' }, { date: '2026-11-17', type: 'gym', heavyLegs: true },
      { date: '2026-11-18', type: 'football' }, { date: '2026-11-19', type: 'rest' },
    ], { from: '2026-11-16', to: '2026-11-22', notBefore: '2026-11-17' })
    expect(c[0].suggestedDate).not.toBe('2026-11-16')
  })

  it('обмен выбирается, когда переносить некуда', () => {
    const c = detectConflicts([
      { date: '2026-11-16', type: 'gym', heavyLegs: true }, { date: '2026-11-17', type: 'football' },
      { date: '2026-11-18', type: 'gym', heavyLegs: true }, { date: '2026-11-19', type: 'gym', heavyLegs: false },
      { date: '2026-11-20', type: 'gym', heavyLegs: false }, { date: '2026-11-21', type: 'gym', heavyLegs: false },
      { date: '2026-11-22', type: 'gym', heavyLegs: false },
    ], { from: '2026-11-16', to: '2026-11-22' })
    const after = c.find((x) => x.code === 'legs_after_football')!
    expect(after).toMatchObject({ action: 'swap', suggestedDate: '2026-11-19' })
  })

  it('совсем некуда — честно без кнопки', () => {
    const c = detectConflicts([
      { date: '2026-11-16', type: 'football' }, { date: '2026-11-17', type: 'gym', heavyLegs: true }, { date: '2026-11-18', type: 'football' },
    ], { from: '2026-11-16', to: '2026-11-18' })
    expect(c.filter((x) => x.code !== 'two_football_week').every((x) => x.action === null && x.suggestedDate === null)).toBe(true)
  })
})
