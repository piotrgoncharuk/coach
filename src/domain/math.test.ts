import { describe, it, expect } from 'vitest'
import { roundToStep, floorToStep, clamp, movingAverage, round1 } from './math'

describe('округление веса', () => {
  it('до ближайшего шага 2,5 кг', () => {
    expect(roundToStep(81.3)).toBe(82.5)
    expect(roundToStep(81)).toBe(80)
    expect(roundToStep(100)).toBe(100)
  })
  it('вниз до шага', () => {
    expect(floorToStep(72)).toBe(70)
    expect(floorToStep(72.5)).toBe(72.5)
  })
  it('шаг 0 означает «без округления»', () => {
    expect(roundToStep(81.37, 0)).toBe(81.4)
  })
  it('clamp держит границы', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(round1(2.349)).toBe(2.3)
  })
})

describe('скользящее среднее за 7 дней', () => {
  it('первая точка равна себе, дальше сглаживает', () => {
    const points = [
      { date: '2026-11-01', value: 97 },
      { date: '2026-11-02', value: 98 },
      { date: '2026-11-03', value: 96 },
    ]
    const ma = movingAverage(points)
    expect(ma[0].value).toBe(97)
    expect(ma[1].value).toBe(97.5)
    expect(ma[2].value).toBe(97)
  })

  it('точки старше окна не учитываются', () => {
    const points = [
      { date: '2026-11-01', value: 90 },
      { date: '2026-11-20', value: 100 },
    ]
    expect(movingAverage(points)[1].value).toBe(100)
  })

  it('сортирует входные данные сама и не падает на пустом списке', () => {
    const ma = movingAverage([
      { date: '2026-11-03', value: 96 },
      { date: '2026-11-01', value: 97 },
    ])
    expect(ma[0].date).toBe('2026-11-01')
    expect(movingAverage([])).toEqual([])
  })
})
