import { addDays, weekDates, weekday } from './dates'
import { detectConflicts, type PlannedDay } from './planner'

export interface DaySlot {
  id: string
  heavyLegs: boolean
}

export interface WeekTemplate {
  gymWeekdays: number[]
  footballWeekdays: number[]
}

export interface PlanItem {
  date: string
  type: 'gym' | 'football'
  programDayId: string | null
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]))
}

/**
 * Расставить дни программы по дням зала недели так, чтобы тяжёлые ноги не
 * оказались рядом с футболом. Перебираются все порядки (дней не больше
 * четырёх-пяти, это мгновенно), побеждает порядок с наименьшим числом
 * конфликтов, при равенстве — исходный порядок A, B, C.
 */
export function planWeek(anyDate: string, template: WeekTemplate, days: DaySlot[], prevSunday?: { football: boolean }): PlanItem[] {
  const dates = weekDates(anyDate)
  const gymDates = dates.filter((d) => template.gymWeekdays.includes(weekday(d)))
  const footballDates = dates.filter((d) => template.footballWeekdays.includes(weekday(d)))
  if (days.length === 0) {
    // без программы дни зала всё равно в календаре — как свободные тренировки
    return [
      ...gymDates.map((date) => ({ date, type: 'gym' as const, programDayId: null })),
      ...footballDates.map((date) => ({ date, type: 'football' as const, programDayId: null })),
    ].sort((a, b) => a.date.localeCompare(b.date))
  }

  // если дней зала больше, чем дней программы, программа идёт по кругу
  const slots = gymDates.map((_, i) => days[i % days.length])
  const candidates = days.length <= 5 && gymDates.length <= 5 ? permutations(slots) : [slots]

  let best = slots
  let bestScore = Infinity
  for (const order of candidates) {
    const planned: PlannedDay[] = dates.map((date) => {
      const gi = gymDates.indexOf(date)
      if (gi >= 0) return { date, type: 'gym', heavyLegs: order[gi].heavyLegs }
      if (footballDates.includes(date)) return { date, type: 'football' }
      return { date, type: 'rest' }
    })
    if (prevSunday?.football) planned.unshift({ date: addDays(dates[0], -1), type: 'football' })
    const score = detectConflicts(planned, { from: dates[0], to: dates[6] }).filter((c) => c.code !== 'two_football_week').length
    if (score < bestScore) {
      best = order
      bestScore = score
    }
  }

  return [
    ...gymDates.map((date, i) => ({ date, type: 'gym' as const, programDayId: best[i].id })),
    ...footballDates.map((date) => ({ date, type: 'football' as const, programDayId: null })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export interface WeekResult {
  weekStart: string
  planned: number
  done: number
}

/**
 * Серия недель без пропусков: подряд идущие недели, где сделаны все
 * запланированные тренировки. Неделя без плана серию не рвёт и не продлевает.
 * Текущая неделя засчитывается, только когда уже закрыта целиком.
 */
export function weekStreak(weeks: WeekResult[], currentWeekStart: string): number {
  const sorted = [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  let streak = 0
  for (const w of sorted) {
    if (w.weekStart > currentWeekStart) continue
    if (w.planned === 0) continue
    const complete = w.done >= w.planned
    if (w.weekStart === currentWeekStart) {
      if (complete) streak++
      continue
    }
    if (!complete) break
    streak++
  }
  return streak
}
