import { describe, it, expect } from 'vitest'
import { weeklyVolume, tonnage, SECONDARY_WEIGHT } from './volume'
import type { PerformedSet, SetType } from './types'

const mk = (exerciseId: string, type: SetType = 'work', weightKg = 100, reps = 5): PerformedSet => ({
  id: Math.random().toString(36).slice(2), exerciseId, setIndex: 1, weightKg, reps,
  rir: 2, type, performedAt: '2026-11-12T10:00:00.000Z',
})

const muscles = {
  squat: { primary: ['quadriceps' as const], secondary: ['glutes' as const, 'lower back' as const] },
  bench: { primary: ['chest' as const], secondary: ['triceps' as const, 'shoulders' as const] },
}

describe('weeklyVolume', () => {
  it('основная мышца даёт подход, вспомогательная — половину', () => {
    const v = weeklyVolume([mk('bench')], muscles)
    expect(v.chest).toBe(1)
    expect(v.arms).toBe(SECONDARY_WEIGHT)
    expect(v.shoulders).toBe(SECONDARY_WEIGHT)
  })

  it('не двоит группу, если основная и вспомогательная мышцы в одной группе', () => {
    // приседания: квадрицепс основной, ягодицы и поясница вспомогательные →
    // ноги считаются один раз как основная, спина получает половину
    const v = weeklyVolume([mk('squat')], muscles)
    expect(v.legs).toBe(1)
    expect(v.back).toBe(SECONDARY_WEIGHT)
  })

  it('разминочные подходы не считаются', () => {
    const v = weeklyVolume([mk('bench', 'warmup'), mk('bench')], muscles)
    expect(v.chest).toBe(1)
  })

  it('дропы и подходы до отказа считаются', () => {
    const v = weeklyVolume([mk('bench', 'drop'), mk('bench', 'failure')], muscles)
    expect(v.chest).toBe(2)
  })

  it('неизвестное упражнение пропускается, а не ломает расчёт', () => {
    const v = weeklyVolume([mk('ghost')], muscles)
    expect(v.chest).toBe(0)
    expect(v.legs).toBe(0)
  })
})

describe('tonnage', () => {
  it('сумма вес × повторы без разминки', () => {
    expect(tonnage([mk('squat', 'work', 100, 5), mk('squat', 'warmup', 60, 10)])).toBe(500)
  })
})
