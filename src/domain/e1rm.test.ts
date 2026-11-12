import { describe, it, expect } from 'vitest'
import { epley1RM, weightForReps, best1RM } from './e1rm'
import type { PerformedSet } from './types'

const set = (p: Partial<PerformedSet>): PerformedSet => ({
  id: 'x', exerciseId: 'e', setIndex: 1, weightKg: 100, reps: 5, rir: null,
  type: 'work', performedAt: '2026-11-12T10:00:00.000Z', ...p,
})

describe('epley1RM', () => {
  it('считает по формуле Эпли', () => {
    expect(epley1RM(100, 5)).toBe(116.7)
    expect(epley1RM(80, 10)).toBe(106.7)
  })

  it('учитывает запас повторов как недоделанные повторы', () => {
    expect(epley1RM(100, 5, 2)).toBe(epley1RM(100, 7))
    expect(epley1RM(100, 5, 0)).toBe(epley1RM(100, 5))
  })

  it('не завышает результат при одном эффективном повторе', () => {
    expect(epley1RM(140, 1, 0)).toBe(140)
    expect(epley1RM(140, 1)).toBe(140)
  })

  it('возвращает ноль на мусорных данных', () => {
    expect(epley1RM(0, 5)).toBe(0)
    expect(epley1RM(100, 0)).toBe(0)
    expect(epley1RM(-50, 5)).toBe(0)
  })

  it('обратная функция согласована с прямой', () => {
    const oneRm = epley1RM(100, 5)
    expect(weightForReps(oneRm, 5)).toBeCloseTo(100, 1)
  })
})

describe('best1RM', () => {
  it('выбирает лучший рабочий подход и игнорирует разминку', () => {
    const sets = [
      set({ id: 'a', weightKg: 60, reps: 10, type: 'warmup' }),
      set({ id: 'b', weightKg: 100, reps: 5 }),
      set({ id: 'c', weightKg: 95, reps: 8 }),
    ]
    const res = best1RM(sets)
    expect(res.set?.id).toBe('c')
    expect(res.value).toBe(epley1RM(95, 8))
  })

  it('пустой список даёт ноль', () => {
    expect(best1RM([])).toEqual({ value: 0, set: null })
  })
})
