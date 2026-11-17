import { describe, it, expect } from 'vitest'
import { addDays, startOfWeek, weekDates, weekday, daysBetween, humanDate, localDate } from './dates'

describe('даты', () => {
  it('местная дата не уезжает в UTC', () => {
    expect(localDate(new Date(2026, 10, 17, 23, 45))).toBe('2026-11-17')
  })
  it('сложение дней через границу месяца и года', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('неделя с понедельника, воскресенье — последний день', () => {
    expect(startOfWeek('2026-11-17')).toBe('2026-11-16') // вторник → понедельник
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16') // воскресенье
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16')
    expect(weekDates('2026-11-19')).toHaveLength(7)
    expect(weekDates('2026-11-19')[6]).toBe('2026-11-22')
  })
  it('день недели и расстояние', () => {
    expect(weekday('2026-11-22')).toBe(0)
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7)
  })
  it('по-русски', () => {
    expect(humanDate('2026-11-17')).toBe('вторник, 17 ноября')
  })
})
