import { movingAverage, round1 } from './math'
import { daysBetween } from './dates'

export interface WeightPoint {
  date: string
  value: number
}

/** Сырые точки и скользящее среднее за 7 дней — чтобы вода и соль не пугали. */
export function weightSeries(points: WeightPoint[]): { date: string; raw: number; avg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const ma = movingAverage(sorted, 7)
  return sorted.map((p, i) => ({ date: p.date, raw: p.value, avg: ma[i].value }))
}

/**
 * Фактический темп, кг в неделю: наклон прямой по сырым взвешиваниям за
 * последние N дней (метод наименьших квадратов). Регрессия сама гасит шум;
 * по скользящему среднему считать нельзя — в начале ряда оно отстаёт и
 * занижает наклон. Нужна хотя бы неделя данных и три точки.
 */
export function paceKgPerWeek(points: WeightPoint[], windowDays = 28): number | null {
  const series = weightSeries(points)
  if (series.length < 3) return null
  const last = series[series.length - 1].date
  const recent = series.filter((p) => daysBetween(p.date, last) <= windowDays)
  if (recent.length < 3 || daysBetween(recent[0].date, last) < 7) return null
  const xs = recent.map((p) => daysBetween(recent[0].date, p.date))
  const ys = recent.map((p) => p.raw)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return round1((num / den) * 7 * 100) / 100
}

/** Если цель по весу задана — сколько осталось и сколько недель при текущем темпе. */
export function goalEta(currentAvg: number, goalKg: number | null, pace: number | null): { remainingKg: number; weeks: number | null } | null {
  if (goalKg == null) return null
  const remainingKg = round1(goalKg - currentAvg)
  if (pace == null || pace === 0 || Math.sign(pace) !== Math.sign(remainingKg)) return { remainingKg, weeks: null }
  return { remainingKg, weeks: Math.round(Math.abs(remainingKg / pace)) }
}

export const GIRTHS = [
  { key: 'chestCm', label: 'Грудь' },
  { key: 'waistCm', label: 'Талия' },
  { key: 'hipsCm', label: 'Бёдра' },
  { key: 'bicepsCm', label: 'Бицепс' },
  { key: 'thighCm', label: 'Бедро' },
  { key: 'neckCm', label: 'Шея' },
] as const
export type GirthKey = (typeof GIRTHS)[number]['key']
