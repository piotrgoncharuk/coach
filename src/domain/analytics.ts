import { epley1RM } from './e1rm'
import { addDays, weekKey } from './dates'
import { MUSCLE_GROUPS, type MuscleGroup, type PerformedSet } from './types'
import { tonnage, weeklyVolume, type ExerciseMuscles, type VolumeByGroup } from './volume'

export interface DatedSet extends PerformedSet {
  date: string
}

/** Лучший расчётный 1ПМ за каждый день — для графика по упражнению. */
export function e1rmByDay(sets: DatedSet[]): { date: string; value: number }[] {
  const best = new Map<string, number>()
  for (const s of sets) {
    if (s.type === 'warmup') continue
    const v = epley1RM(s.weightKg, s.reps, s.rir)
    best.set(s.date, Math.max(best.get(s.date) ?? 0, v))
  }
  return [...best.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }))
}

/** Последние N недель (ключ — понедельник), от старых к новым. */
export function lastWeeks(today: string, n: number): string[] {
  const cur = weekKey(today)
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)))
}

export function volumeByWeek(sets: DatedSet[], muscles: Record<string, ExerciseMuscles>, weeks: string[]): { week: string; volume: VolumeByGroup }[] {
  return weeks.map((w) => ({ week: w, volume: weeklyVolume(sets.filter((s) => weekKey(s.date) === w), muscles) }))
}

export function attendanceByWeek(sessionDates: string[], weeks: string[]): { week: string; count: number }[] {
  return weeks.map((w) => ({ week: w, count: sessionDates.filter((d) => weekKey(d) === w).length }))
}

export interface WeekStats {
  sessions: number
  workSets: number
  tonnageKg: number
  volume: VolumeByGroup
}

export function weekStats(sets: DatedSet[], sessionDates: string[], muscles: Record<string, ExerciseMuscles>, week: string): WeekStats {
  const inWeek = sets.filter((s) => weekKey(s.date) === week)
  return {
    sessions: sessionDates.filter((d) => weekKey(d) === week).length,
    workSets: inWeek.filter((s) => s.type !== 'warmup').length,
    tonnageKg: tonnage(inWeek),
    volume: weeklyVolume(inWeek, muscles),
  }
}

export interface Comparison {
  label: string
  current: number
  previous: number
  delta: number
}

/** Эта неделя против прошлой: тренировки, подходы, тоннаж, объём по группам. */
export function compareWeeks(cur: WeekStats, prev: WeekStats, groupLabel: (g: MuscleGroup) => string): Comparison[] {
  const row = (label: string, a: number, b: number) => ({ label, current: a, previous: b, delta: Math.round((a - b) * 10) / 10 })
  return [
    row('Тренировки', cur.sessions, prev.sessions),
    row('Рабочие подходы', cur.workSets, prev.workSets),
    row('Тоннаж, кг', cur.tonnageKg, prev.tonnageKg),
    ...MUSCLE_GROUPS.filter((g) => cur.volume[g] || prev.volume[g]).map((g) => row(`${groupLabel(g)}, подх.`, cur.volume[g], prev.volume[g])),
  ]
}
