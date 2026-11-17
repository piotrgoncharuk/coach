import { db } from './db'
import { alive } from './workout'
import { localDate, weekDates, weekKey } from '../domain'

/** Что сегодня меняет тренировку: разгрузка и два футбола на неделе. */
export async function weekFlags(date = localDate()): Promise<{ deload: boolean; cutLegVolume: boolean; footballCount: number }> {
  const profile = await db.profiles.toCollection().first()
  const days = weekDates(date)
  const events = alive(await db.calendarEvents.where('date').anyOf(days).toArray())
  const footballCount = events.filter((e) => e.type === 'football').length
  return {
    deload: !!profile?.deloadStart && profile.deloadStart === weekKey(date),
    cutLegVolume: footballCount >= 2,
    footballCount,
  }
}
