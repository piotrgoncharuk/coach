import type { DayType } from './types'

export interface PlannedDay {
  /** ISO-дата YYYY-MM-DD. */
  date: string
  type: DayType
  /** День содержит тяжёлую работу на ноги. */
  heavyLegs?: boolean
  label?: string
}

export type ConflictCode = 'legs_before_football' | 'legs_after_football' | 'two_football_week'

export interface Conflict {
  code: ConflictCode
  date: string
  message: string
  /** Куда предлагаем переставить. null — переставлять некуда, нужно снижать объём. */
  suggestedDate: string | null
  suggestion: string
}

const DAY_MS = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00.000Z`)
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Правило планировщика: тяжёлая работа на ноги не ставится за день до футбола
 * и на следующий день после него. При двух футболах за неделю объём ног снижается.
 */
export function detectConflicts(days: PlannedDay[]): Conflict[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const football = days.filter((d) => d.type === 'football').map((d) => d.date)
  const footballSet = new Set(football)
  const conflicts: Conflict[] = []

  for (const day of days) {
    if (day.type !== 'gym' || !day.heavyLegs) continue
    const ms = toMs(day.date)
    const next = toDate(ms + DAY_MS)
    const prev = toDate(ms - DAY_MS)

    if (footballSet.has(next)) {
      conflicts.push({
        code: 'legs_before_football',
        date: day.date,
        message: `Тяжёлые ноги ${human(day.date)}, а ${human(next)} футбол. Ноги не успеют восстановиться.`,
        suggestedDate: findFreeSlot(day.date, days, footballSet, byDate),
        suggestion: 'Перенеси день ног дальше от футбола или убери тяжёлые ноги из этого дня.',
      })
    }
    if (footballSet.has(prev)) {
      conflicts.push({
        code: 'legs_after_football',
        date: day.date,
        message: `Футбол ${human(prev)}, а ${human(day.date)} тяжёлые ноги. Мышцы ещё не восстановились.`,
        suggestedDate: findFreeSlot(day.date, days, footballSet, byDate),
        suggestion: 'Сдвинь день ног на сутки позже или поставь верх тела.',
      })
    }
  }

  if (football.length >= 2) {
    conflicts.push({
      code: 'two_football_week',
      date: football[0],
      message: `За неделю два футбола (${football.map(human).join(' и ')}). Объём ног в зале стоит снизить.`,
      suggestedDate: null,
      suggestion: 'Убери один рабочий подход с каждого тяжёлого упражнения на ноги.',
    })
  }

  return conflicts
}

/** Ближайший день в пределах недели, куда тяжёлые ноги встанут без конфликта. */
function findFreeSlot(
  from: string,
  days: PlannedDay[],
  footballSet: Set<string>,
  byDate: Map<string, PlannedDay>,
): string | null {
  const candidates = days
    .map((d) => d.date)
    .filter((date) => {
      if (footballSet.has(date)) return false
      const ms = toMs(date)
      if (footballSet.has(toDate(ms + DAY_MS))) return false
      if (footballSet.has(toDate(ms - DAY_MS))) return false
      const day = byDate.get(date)
      return !(day && day.type === 'gym' && day.heavyLegs && date !== from)
    })
    .sort((a, b) => Math.abs(toMs(a) - toMs(from)) - Math.abs(toMs(b) - toMs(from)))
  return candidates.find((d) => d !== from) ?? null
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
function human(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** Во сколько раз урезать объём ног при двух футболах за неделю. */
export const LEG_VOLUME_CUT_ON_TWO_FOOTBALL = 0.7
