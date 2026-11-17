/**
 * Даты в календаре — местные, а не UTC: тренировка в 23:30 по Москве
 * должна попасть в сегодняшний день, а не в завтрашний.
 */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Полдень вместо полуночи — переход на летнее время не сдвинет дату. */
export function parseLocal(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(date: string, n: number): string {
  const d = parseLocal(date)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 86_400_000)
}

/** 0 — воскресенье, 6 — суббота, как в Date#getDay. */
export function weekday(date: string): number {
  return parseLocal(date).getDay()
}

/** Неделя начинается с понедельника. */
export function startOfWeek(date: string): string {
  const wd = weekday(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

export function weekDates(date: string): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
export const WEEKDAY_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
export const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export function humanDate(date: string, withWeekday = true): string {
  const d = parseLocal(date)
  const base = `${d.getDate()} ${MONTH_GEN[d.getMonth()]}`
  return withWeekday ? `${WEEKDAY_LONG[d.getDay()]}, ${base}` : base
}

export function shortDate(date: string): string {
  const d = parseLocal(date)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

/** Ключ недели — дата её понедельника. */
export function weekKey(date: string): string {
  return startOfWeek(date)
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000))
}
