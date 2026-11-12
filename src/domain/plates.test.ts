import { describe, it, expect } from 'vitest'
import { platesFor, formatPerSide, DEFAULT_BAR_KG } from './plates'
import { warmupSets } from './warmup'

describe('platesFor', () => {
  it('набирает точный вес', () => {
    const r = platesFor(100)
    expect(r.achievableKg).toBe(100)
    expect(r.diffKg).toBe(0)
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }])
  })

  it('учитывает мелкие блины', () => {
    expect(platesFor(72.5).achievableKg).toBe(72.5)
    expect(formatPerSide(platesFor(72.5).perSide)).toBe('25 + 1,25')
  })

  it('цель ниже грифа отмечается отдельно', () => {
    const r = platesFor(15)
    expect(r.belowBar).toBe(true)
    expect(r.achievableKg).toBe(DEFAULT_BAR_KG)
    expect(formatPerSide(r.perSide)).toBe('только гриф')
  })

  it('недостижимый вес даёт ближайший снизу и честный недобор', () => {
    const r = platesFor(101, 20, [25, 20, 15, 10, 5])
    expect(r.achievableKg).toBe(100)
    expect(r.diffKg).toBe(-1)
  })

  it('работает с другим грифом', () => {
    expect(platesFor(50, 15).achievableKg).toBe(50)
  })
})

describe('warmupSets', () => {
  it('тяжёлый рабочий вес разминается грифом и тремя подходами', () => {
    const sets = warmupSets(100)
    expect(sets[0]).toEqual({ weightKg: 20, reps: 8, percent: 0.2 })
    expect(sets.map((s) => s.weightKg)).toEqual([20, 40, 60, 80])
  })

  it('никогда не предлагает вес выше рабочего', () => {
    for (const w of [25, 30, 40, 55, 120, 200]) {
      expect(warmupSets(w).every((s) => s.weightKg < w)).toBe(true)
    }
  })

  it('для гантелей и тренажёров не добавляет подход грифом', () => {
    const sets = warmupSets(40, { hasBar: false })
    expect(sets.some((s) => s.weightKg === 20 && s.reps === 8)).toBe(false)
    expect(sets.length).toBeGreaterThan(0)
  })

  it('лёгкий вес разминается хотя бы одним подходом', () => {
    expect(warmupSets(22).length).toBeGreaterThan(0)
  })

  it('нулевой вес не даёт разминки', () => {
    expect(warmupSets(0)).toEqual([])
  })
})
