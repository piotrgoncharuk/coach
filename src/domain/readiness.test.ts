import { describe, it, expect } from 'vitest'
import { computeReadiness, footballLoadPoints, READINESS_BASE } from './readiness'
import type { Checkin } from './readiness'

const neutral: Checkin = { date: '2026-11-12', sleepHours: 7.5, energy: 3, soreness: 3, stress: 3 }

describe('footballLoadPoints', () => {
  it('минуты × тяжесть, вчерашний матч считается полностью', () => {
    expect(footballLoadPoints([{ date: '2026-11-11', durationMin: 90, intensity: 7 }], '2026-11-12')).toBe(630)
  })
  it('через двое суток остаётся половина, через трое пятая часть', () => {
    expect(footballLoadPoints([{ date: '2026-11-10', durationMin: 90, intensity: 7 }], '2026-11-12')).toBe(315)
    expect(footballLoadPoints([{ date: '2026-11-09', durationMin: 90, intensity: 7 }], '2026-11-12')).toBe(126)
  })
  it('старше трёх суток и будущие матчи не учитываются', () => {
    expect(footballLoadPoints([{ date: '2026-11-01', durationMin: 90, intensity: 7 }], '2026-11-12')).toBe(0)
    expect(footballLoadPoints([{ date: '2026-11-20', durationMin: 90, intensity: 7 }], '2026-11-12')).toBe(0)
  })
})

describe('computeReadiness', () => {
  it('нейтральный чек-ин даёт базовое значение', () => {
    const r = computeReadiness(neutral)
    expect(r.score).toBe(READINESS_BASE)
    expect(r.flag).toBe('green')
  })

  it('идеальный чек-ин упирается в 100', () => {
    const r = computeReadiness({ date: '2026-11-12', sleepHours: 9, energy: 5, soreness: 1, stress: 1 })
    expect(r.score).toBe(100)
  })

  it('плохой чек-ин даёт красный и не уходит ниже нуля', () => {
    const r = computeReadiness({ date: '2026-11-12', sleepHours: 3, energy: 1, soreness: 5, stress: 5 })
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.flag).toBe('red')
  })

  it('футбол вчера снижает готовность и попадает в расшифровку', () => {
    const r = computeReadiness(neutral, [{ date: '2026-11-11', durationMin: 90, intensity: 7 }], '2026-11-12')
    expect(r.score).toBeLessThan(READINESS_BASE)
    expect(r.factors.find((f) => f.label === 'Футбол')?.delta).toBeLessThan(0)
  })

  it('без футбола фактор футбола не показывается', () => {
    expect(computeReadiness(neutral).factors.some((f) => f.label === 'Футбол')).toBe(false)
  })

  it('штраф за футбол ограничен 25 баллами', () => {
    const r = computeReadiness(neutral, [{ date: '2026-11-11', durationMin: 120, intensity: 10 }], '2026-11-12')
    expect(r.factors.find((f) => f.label === 'Футбол')?.delta).toBe(-25)
  })

  it('сумма факторов совпадает с итогом, пока нет упора в границы', () => {
    const r = computeReadiness({ date: '2026-11-12', sleepHours: 7, energy: 4, soreness: 2, stress: 3 })
    const sum = READINESS_BASE + r.factors.reduce((a, f) => a + f.delta, 0)
    expect(r.score).toBe(Math.round(sum))
  })
})
