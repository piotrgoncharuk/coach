import { describe, it, expect } from 'vitest'
import { suggestNextLoad, mainWorkingWeight, defaultIncrementKg, plural } from './progression'
import type { ExerciseTarget, PerformedSet, SetType } from './types'

const target: ExerciseTarget = {
  exerciseId: 'squat', sets: 3, repMin: 6, repMax: 8, rir: 2, restSec: 180,
}

const mk = (weightKg: number, reps: number, rir: number | null = 2, type: SetType = 'work'): PerformedSet => ({
  id: Math.random().toString(36).slice(2), exerciseId: 'squat', setIndex: 1,
  weightKg, reps, rir, type, performedAt: '2026-11-10T10:00:00.000Z',
})

describe('mainWorkingWeight', () => {
  it('берёт самый частый вес, игнорируя разминку', () => {
    expect(mainWorkingWeight([mk(40, 10, null, 'warmup'), mk(80, 8), mk(80, 7), mk(85, 5)])).toBe(80)
  })
  it('при равенстве выбирает больший вес', () => {
    expect(mainWorkingWeight([mk(80, 8), mk(85, 8)])).toBe(85)
  })
  it('без рабочих подходов возвращает null', () => {
    expect(mainWorkingWeight([mk(40, 10, null, 'warmup')])).toBeNull()
  })
})

describe('suggestNextLoad — калибровка', () => {
  it('без истории просит подобрать вес и не выдумывает цифру', () => {
    const r = suggestNextLoad({ target, lastSets: [] })
    expect(r.outcome).toBe('calibration')
    expect(r.weightKg).toBeNull()
    expect(r.repTarget).toBe(6)
    expect(r.reason).toContain('запас 2')
  })
})

describe('suggestNextLoad — двойная прогрессия', () => {
  it('добрал верх диапазона во всех подходах → плюс вес, повторы к низу', () => {
    const r = suggestNextLoad({
      target, equipment: 'barbell', group: 'legs',
      lastSets: [mk(80, 8), mk(80, 8), mk(80, 8)],
    })
    expect(r.outcome).toBe('add_weight')
    expect(r.weightKg).toBe(85)
    expect(r.repTarget).toBe(6)
  })

  it('в диапазоне, но не верх → вес тот же, цель на повтор больше', () => {
    const r = suggestNextLoad({ target, lastSets: [mk(80, 7), mk(80, 6), mk(80, 6)] })
    expect(r.outcome).toBe('add_reps')
    expect(r.weightKg).toBe(80)
    expect(r.repTarget).toBe(8)
  })

  it('не прибавляет вес, если подходов сделано меньше плана', () => {
    const r = suggestNextLoad({ target, lastSets: [mk(80, 8), mk(80, 8)] })
    expect(r.outcome).toBe('add_reps')
    expect(r.weightKg).toBe(80)
  })

  it('большой запас повторов удваивает шаг', () => {
    const r = suggestNextLoad({
      target, equipment: 'barbell', group: 'legs',
      lastSets: [mk(80, 8, 4), mk(80, 8, 4), mk(80, 8, 4)],
    })
    expect(r.incrementKg).toBe(10)
    expect(r.weightKg).toBe(90)
  })

  it('провал ниже диапазона → повторяем вес', () => {
    const r = suggestNextLoad({ target, lastSets: [mk(80, 5), mk(80, 4), mk(80, 4)] })
    expect(r.outcome).toBe('hold')
    expect(r.weightKg).toBe(80)
  })

  it('два провала подряд → откат на 10% вниз до шага 2,5 кг', () => {
    const r = suggestNextLoad({
      target,
      lastSets: [mk(80, 5), mk(80, 4), mk(80, 4)],
      prevSets: [mk(80, 5), mk(80, 5), mk(80, 3)],
    })
    expect(r.outcome).toBe('back_off')
    expect(r.weightKg).toBe(70) // 80 − 10% = 72, вниз до шага 2,5 кг
  })
})

describe('suggestNextLoad — осторожный режим', () => {
  const cautious: ExerciseTarget = { ...target, exerciseId: 'leg-curl', cautious: true, rir: 1, incrementKg: 5 }

  it('держит запас повторов не ниже 2 и шаг не больше 2,5 кг', () => {
    const r = suggestNextLoad({
      target: cautious, equipment: 'machine', group: 'legs',
      lastSets: [mk(40, 8, 3), mk(40, 8, 3), mk(40, 8, 3)],
    })
    expect(r.rir).toBe(2)
    expect(r.incrementKg).toBe(2.5)
    expect(r.weightKg).toBe(42.5)
  })

  it('не прибавляет вес после подхода в упор', () => {
    const r = suggestNextLoad({
      target: cautious, equipment: 'machine', group: 'legs',
      lastSets: [mk(40, 8, 0), mk(40, 8, 1), mk(40, 8, 0)],
    })
    expect(r.outcome).toBe('hold')
    expect(r.weightKg).toBe(40)
    expect(r.reason).toContain('в упор')
  })

  it('никогда не удваивает шаг, даже при большом запасе', () => {
    const r = suggestNextLoad({
      target: cautious, equipment: 'machine', group: 'legs',
      lastSets: [mk(40, 8, 4), mk(40, 8, 4), mk(40, 8, 4)],
    })
    expect(r.incrementKg).toBe(2.5)
  })
})

describe('defaultIncrementKg', () => {
  it('штанга на ноги и тренажёры шагают по 5 кг, остальное по 2,5', () => {
    expect(defaultIncrementKg('barbell', 'legs')).toBe(5)
    expect(defaultIncrementKg('machine', 'chest')).toBe(5)
    expect(defaultIncrementKg('barbell', 'chest')).toBe(2.5)
    expect(defaultIncrementKg('dumbbell', 'arms')).toBe(2.5)
    expect(defaultIncrementKg()).toBe(2.5)
  })
})

describe('склонение числительных в подсказках', () => {
  it('подходы и повторы склоняются по-русски', () => {
    const sets: [string, string, string] = ['подход', 'подхода', 'подходов']
    expect([1, 2, 3, 4, 5, 11, 21, 22, 25].map((n) => `${n} ${plural(n, sets)}`)).toEqual([
      '1 подход', '2 подхода', '3 подхода', '4 подхода', '5 подходов',
      '11 подходов', '21 подход', '22 подхода', '25 подходов',
    ])
  })

  it('подсказка после закрытого диапазона читается без ошибок', () => {
    const r = suggestNextLoad({
      target, equipment: 'barbell', group: 'legs',
      lastSets: [mk(80, 8), mk(80, 8), mk(80, 8)],
    })
    expect(r.reason).toContain('Все 3 подхода по 8')
    expect(r.reason).not.toContain('.5')
  })
})
