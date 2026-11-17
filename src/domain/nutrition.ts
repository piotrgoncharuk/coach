import { addDays } from './dates'

export interface FoodEntry {
  date: string
  name: string
  kcal: number
  proteinG: number
}

export function dayTotals(entries: FoodEntry[], date: string): { kcal: number; proteinG: number; count: number } {
  const day = entries.filter((e) => e.date === date)
  return {
    kcal: Math.round(day.reduce((a, e) => a + e.kcal, 0)),
    proteinG: Math.round(day.reduce((a, e) => a + e.proteinG, 0)),
    count: day.length,
  }
}

/**
 * Среднее за неделю по дням, когда что-то записано. Пустой день — скорее
 * забыл записать, чем не ел; в среднее он не идёт, но число дней видно.
 */
export function weekAverage(entries: FoodEntry[], endDate: string, days = 7): { kcal: number; proteinG: number; daysLogged: number } {
  const totals = Array.from({ length: days }, (_, i) => dayTotals(entries, addDays(endDate, -i))).filter((t) => t.count > 0)
  if (totals.length === 0) return { kcal: 0, proteinG: 0, daysLogged: 0 }
  return {
    kcal: Math.round(totals.reduce((a, t) => a + t.kcal, 0) / totals.length),
    proteinG: Math.round(totals.reduce((a, t) => a + t.proteinG, 0) / totals.length),
    daysLogged: totals.length,
  }
}

/** Доля цели 0–1 для кольца; перебор показывается отдельно. */
export function ringFraction(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(1, Math.max(0, value / target))
}
