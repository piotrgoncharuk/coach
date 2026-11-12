import { describe, it, expect } from 'vitest'
import { detectConflicts } from './planner'
import type { PlannedDay } from './planner'

// воскресенье 15 ноября 2026 — футбол
const week: PlannedDay[] = [
  { date: '2026-11-09', type: 'rest' },
  { date: '2026-11-10', type: 'gym', heavyLegs: true },
  { date: '2026-11-11', type: 'rest' },
  { date: '2026-11-12', type: 'gym' },
  { date: '2026-11-13', type: 'rest' },
  { date: '2026-11-14', type: 'gym' },
  { date: '2026-11-15', type: 'football' },
]

describe('detectConflicts', () => {
  it('чистая неделя без конфликтов', () => {
    expect(detectConflicts(week)).toEqual([])
  })

  it('тяжёлые ноги за день до футбола — конфликт с предложением переноса', () => {
    const days = week.map((d) => (d.date === '2026-11-14' ? { ...d, heavyLegs: true } : d))
    const c = detectConflicts(days)
    expect(c).toHaveLength(1)
    expect(c[0].code).toBe('legs_before_football')
    expect(c[0].suggestedDate).not.toBeNull()
    expect(c[0].suggestedDate).not.toBe('2026-11-15')
  })

  it('тяжёлые ноги на следующий день после футбола — конфликт', () => {
    const days: PlannedDay[] = [
      { date: '2026-11-15', type: 'football' },
      { date: '2026-11-16', type: 'gym', heavyLegs: true },
      { date: '2026-11-18', type: 'gym' },
    ]
    const c = detectConflicts(days)
    expect(c.map((x) => x.code)).toContain('legs_after_football')
  })

  it('два футбола за неделю — предупреждение о снижении объёма ног', () => {
    const days = week.map((d) => (d.date === '2026-11-11' ? { ...d, type: 'football' as const } : d))
    const codes = detectConflicts(days).map((c) => c.code)
    expect(codes).toContain('two_football_week')
  })

  it('перенос не предлагается в день, который сам конфликтует с футболом', () => {
    const days = week.map((d) => (d.date === '2026-11-14' ? { ...d, heavyLegs: true } : d))
    const c = detectConflicts(days)
    const suggested = c[0].suggestedDate!
    expect(['2026-11-14', '2026-11-15', '2026-11-16']).not.toContain(suggested)
  })

  it('пустая неделя не ломает расчёт', () => {
    expect(detectConflicts([])).toEqual([])
  })
})
