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
  /** move — на свободный день, swap — поменять местами с днём без тяжёлых ног. */
  action: 'move' | 'swap' | null
  suggestion: string
}

const DAY_MS = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00.000Z`)
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Правило планировщика: тяжёлая работа на ноги не ставится за день до футбола
 * и на следующий день после него. При двух футболах за неделю объём ног снижается.
 */
export function detectConflicts(days: PlannedDay[], range?: { from: string; to: string; notBefore?: string }): Conflict[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const inRange = (d: string) => !range || (d >= range.from && d <= range.to)
  // футбол соседних недель влияет на границы (вс → пн), но в счёт «двух за неделю» не идёт
  const footballSet = new Set(days.filter((d) => d.type === 'football').map((d) => d.date))
  const football = [...footballSet].filter(inRange).sort()
  const conflicts: Conflict[] = []

  for (const day of days) {
    if (day.type !== 'gym' || !day.heavyLegs || !inRange(day.date)) continue
    const ms = toMs(day.date)
    const next = toDate(ms + DAY_MS)
    const prev = toDate(ms - DAY_MS)

    const fix = () => findFix(day.date, days.filter((d) => inRange(d.date) && (!range?.notBefore || d.date >= range.notBefore)), footballSet, byDate)
    if (footballSet.has(next)) {
      const f = fix()
      conflicts.push({
        code: 'legs_before_football',
        date: day.date,
        message: `Тяжёлые ноги ${human(day.date)}, а ${human(next)} футбол. Ноги не успеют восстановиться.`,
        ...f,
        suggestion: f.action ? 'Перенеси день ног дальше от футбола.' : 'Свободного дня на неделе нет: сними тяжёлые ноги с этого дня или снизь объём.',
      })
    }
    if (footballSet.has(prev)) {
      const f = fix()
      conflicts.push({
        code: 'legs_after_football',
        date: day.date,
        message: `Футбол ${human(prev)}, а ${human(day.date)} тяжёлые ноги. Мышцы ещё не восстановились.`,
        ...f,
        suggestion: f.action ? 'Сдвинь день ног подальше от футбола.' : 'Свободного дня на неделе нет: поставь сюда верх тела или снизь объём ног.',
      })
    }
  }

  if (football.length >= 2) {
    conflicts.push({
      code: 'two_football_week',
      date: football[0],
      message: `За неделю два футбола (${football.map(human).join(' и ')}). Объём ног в зале стоит снизить.`,
      suggestedDate: null,
      action: null,
      suggestion: 'Тренировки на ноги на этой неделе пойдут на подход короче — приложение сделает это само.',
    })
  }

  return conflicts
}

/**
 * Как снять конфликт: ближайший свободный день, где тяжёлые ноги не соседствуют
 * с футболом. Если такого нет — обмен с днём зала без тяжёлых ног, который
 * тоже стоит не рядом с футболом. Дни передаются уже без прошедших.
 */
function findFix(
  from: string,
  days: PlannedDay[],
  footballSet: Set<string>,
  byDate: Map<string, PlannedDay>,
): { suggestedDate: string | null; action: 'move' | 'swap' | null } {
  const ok = (date: string) => {
    if (footballSet.has(date)) return false
    const ms = toMs(date)
    return !footballSet.has(toDate(ms + DAY_MS)) && !footballSet.has(toDate(ms - DAY_MS))
  }
  const near = (a: string, b: string) => Math.abs(toMs(a) - toMs(from)) - Math.abs(toMs(b) - toMs(from))
  const free = days
    .map((d) => d.date)
    .filter((date) => date !== from && ok(date) && byDate.get(date)?.type !== 'gym')
    .sort(near)
  if (free[0]) return { suggestedDate: free[0], action: 'move' }
  const swap = days
    .filter((d) => d.date !== from && d.type === 'gym' && !d.heavyLegs && ok(d.date))
    .map((d) => d.date)
    .sort(near)
  if (swap[0]) return { suggestedDate: swap[0], action: 'swap' }
  return { suggestedDate: null, action: null }
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
function human(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
}

/** Во сколько раз урезать объём ног при двух футболах за неделю. */
export const LEG_VOLUME_CUT_ON_TWO_FOOTBALL = 0.7
