import { db } from './db'
import { save } from './repo'
import { alive } from './workout'
import { addDays, computeReadiness, type Checkin, type FootballLoad, type ReadinessResult } from '../domain'
import type { ReadinessCheckin } from './models'

export async function footballLoads(date: string): Promise<FootballLoad[]> {
  const days = [0, 1, 2, 3].map((i) => addDays(date, -i))
  return alive(await db.calendarEvents.where('date').anyOf(days).toArray())
    .filter((e) => e.type === 'football' && e.date <= date && (e.status === 'done' || e.date < date))
    .map((e) => ({ date: e.date, durationMin: e.durationMin ?? 90, intensity: e.intensity ?? 7 }))
}

/** Утренний чек-ин: считается сразу, балл и цвет сохраняются для тренера. */
export async function saveCheckin(c: Checkin): Promise<{ row: ReadinessCheckin; result: ReadinessResult }> {
  const result = computeReadiness(c, await footballLoads(c.date), c.date)
  const existing = alive(await db.readinessCheckins.where('date').equals(c.date).toArray())[0]
  const row = await save('readinessCheckins', {
    id: existing?.id, date: c.date, sleepHours: c.sleepHours, energy: c.energy, soreness: c.soreness, stress: c.stress,
    score: result.score, flag: result.flag,
  })
  return { row, result }
}

export async function readinessFor(date: string): Promise<{ row: ReadinessCheckin; result: ReadinessResult } | null> {
  const row = alive(await db.readinessCheckins.where('date').equals(date).toArray())[0]
  if (!row) return null
  return { row, result: computeReadiness(row, await footballLoads(date), date) }
}

export async function lastCheckin(): Promise<ReadinessCheckin | undefined> {
  return alive(await db.readinessCheckins.toArray()).sort((a, b) => b.date.localeCompare(a.date))[0]
}
