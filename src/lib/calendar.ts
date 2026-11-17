import { db, getMeta, setMeta } from './db'
import { save, softDelete } from './repo'
import { alive, isSessionFailedFor } from './workout-extra'
import { activeProgram } from './program'
import {
  addDays, deloadCheck, detectConflicts, localDate, planWeek, weekDates, weekKey, weekStreak,
  type Conflict, type DeloadResult, type PlannedDay,
} from '../domain'
import type { CalendarEvent, ProgramDay } from './models'

const plannedKey = (weekStart: string) => `calendar:planned:${weekStart}`

/**
 * Неделя заполняется из шаблона (дни зала и футбола) один раз — при первом
 * открытии. Если потом день очистили руками, он пустым и останется.
 * Прошедшие недели не заполняются задним числом.
 */
export async function ensureWeekPlanned(date: string): Promise<void> {
  const start = weekKey(date)
  if (start < weekKey(localDate())) return
  if (await getMeta(plannedKey(start), false)) return
  const profile = await db.profiles.toCollection().first()
  if (!profile || (!profile.gymWeekdays?.length && !profile.footballWeekdays?.length)) return

  const dates = weekDates(date)
  const existing = alive(await db.calendarEvents.where('date').anyOf(dates).toArray())
  if (existing.length === 0) {
    const program = await activeProgram()
    const days = program ? alive(await db.programDays.where('programId').equals(program.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    const prevSun = addDays(dates[0], -1)
    const prevFootball = alive(await db.calendarEvents.where('date').equals(prevSun).toArray()).some((e) => e.type === 'football')
    const plan = planWeek(date, { gymWeekdays: profile.gymWeekdays, footballWeekdays: profile.footballWeekdays }, days.map((d) => ({ id: d.id, heavyLegs: d.heavyLegs })), { football: prevFootball || profile.footballWeekdays.includes(0) })
    const today = localDate()
    for (const p of plan) {
      if (p.date < today) continue
      await save('calendarEvents', {
        date: p.date, type: p.type, programDayId: p.programDayId, status: 'planned', note: null,
        durationMin: p.type === 'football' ? await lastFootballDuration() : null,
        intensity: p.type === 'football' ? await lastFootballIntensity() : null,
      })
    }
  }
  await setMeta(plannedKey(start), true)
}

export interface WeekDay {
  date: string
  events: CalendarEvent[]
}

export interface WeekView {
  days: WeekDay[]
  conflicts: Conflict[]
  dayNames: Map<string, ProgramDay>
}

export async function loadWeek(date: string): Promise<WeekView> {
  const dates = weekDates(date)
  const window = [addDays(dates[0], -1), ...dates, addDays(dates[6], 1)]
  const events = alive(await db.calendarEvents.where('date').anyOf(window).toArray())
  const dayIds = [...new Set(events.map((e) => e.programDayId).filter(Boolean) as string[])]
  const days = (await db.programDays.bulkGet(dayIds)).filter(Boolean) as ProgramDay[]
  const dayNames = new Map(days.map((d) => [d.id, d]))

  const planned: PlannedDay[] = window.map((d) => {
    const evs = events.filter((e) => e.date === d)
    if (evs.some((e) => e.type === 'football')) return { date: d, type: 'football' }
    const gym = evs.find((e) => e.type === 'gym')
    if (gym) return { date: d, type: 'gym', heavyLegs: gym.programDayId ? !!dayNames.get(gym.programDayId)?.heavyLegs : false }
    return { date: d, type: 'rest' }
  })

  return {
    days: dates.map((d) => ({ date: d, events: events.filter((e) => e.date === d).sort((a, b) => a.type.localeCompare(b.type)) })),
    conflicts: detectConflicts(planned, { from: dates[0], to: dates[6], notBefore: localDate() }),
    dayNames,
  }
}

async function lastFootball(): Promise<CalendarEvent | undefined> {
  return alive(await db.calendarEvents.where('type').equals('football').toArray()).sort((a, b) => b.date.localeCompare(a.date))[0]
}
export async function lastFootballDuration() { return (await lastFootball())?.durationMin ?? 90 }
export async function lastFootballIntensity() { return (await lastFootball())?.intensity ?? 7 }

/** Футбол одним касанием: длительность и тяжесть — как в прошлый раз. */
export async function addFootball(date: string, durationMin?: number, intensity?: number): Promise<CalendarEvent> {
  const existing = alive(await db.calendarEvents.where('date').equals(date).toArray()).find((e) => e.type === 'football')
  return save('calendarEvents', {
    id: existing?.id, date, type: 'football', programDayId: null, note: null,
    durationMin: durationMin ?? (await lastFootballDuration()), intensity: intensity ?? (await lastFootballIntensity()),
    status: date <= localDate() ? 'done' : 'planned',
  })
}

export async function setGym(date: string, programDayId: string | null): Promise<void> {
  const evs = alive(await db.calendarEvents.where('date').equals(date).toArray())
  const gym = evs.find((e) => e.type === 'gym')
  await save('calendarEvents', { id: gym?.id, date, type: 'gym', programDayId, durationMin: null, intensity: null, status: gym?.status ?? 'planned', note: null })
  for (const r of evs.filter((e) => e.type === 'rest')) await softDelete('calendarEvents', r.id)
}

export async function setRest(date: string): Promise<void> {
  const evs = alive(await db.calendarEvents.where('date').equals(date).toArray())
  for (const e of evs) await softDelete('calendarEvents', e.id)
  await save('calendarEvents', { date, type: 'rest', programDayId: null, durationMin: null, intensity: null, status: 'planned', note: null })
}

export async function clearDay(date: string): Promise<void> {
  for (const e of alive(await db.calendarEvents.where('date').equals(date).toArray())) await softDelete('calendarEvents', e.id)
}

export async function removeEvent(id: string): Promise<void> {
  await softDelete('calendarEvents', id)
}

/**
 * Применить предложенную перестановку. Если в целевой день уже стоит зал —
 * дни меняются местами, иначе тренировка просто переезжает.
 */
export async function moveGym(fromDate: string, toDate: string): Promise<void> {
  const gym = alive(await db.calendarEvents.where('date').equals(fromDate).toArray()).find((e) => e.type === 'gym')
  if (!gym) return
  const target = alive(await db.calendarEvents.where('date').equals(toDate).toArray())
  for (const t of target.filter((e) => e.type === 'rest')) await softDelete('calendarEvents', t.id)
  const other = target.find((e) => e.type === 'gym')
  if (other) await save('calendarEvents', { id: other.id, date: fromDate })
  await save('calendarEvents', { id: gym.id, date: toDate })
}

export async function updateEvent(id: string, patch: Partial<Pick<CalendarEvent, 'durationMin' | 'intensity' | 'status' | 'note'>>): Promise<void> {
  await save('calendarEvents', { id, ...patch })
}

// ─── серия и разгрузка ──────────────────────────────────────────────────────
export async function currentStreak(): Promise<number> {
  const events = alive(await db.calendarEvents.toArray()).filter((e) => e.type === 'gym')
  const sessions = alive(await db.sessions.toArray()).filter((s) => s.status === 'finished')
  const byWeek = new Map<string, { planned: number; done: number }>()
  for (const e of events) {
    const k = weekKey(e.date)
    const w = byWeek.get(k) ?? { planned: 0, done: 0 }
    w.planned++
    byWeek.set(k, w)
  }
  // тренировка засчитывается неделе, даже если сделана в другой день недели
  for (const s of sessions) {
    const w = byWeek.get(weekKey(s.date))
    if (w) w.done++
  }
  return weekStreak([...byWeek.entries()].map(([weekStart, v]) => ({ weekStart, ...v })), weekKey(localDate()))
}

export async function deloadSuggestion(): Promise<DeloadResult & { weeksSinceDeload: number }> {
  const profile = await db.profiles.toCollection().first()
  const sessions = alive(await db.sessions.toArray()).filter((s) => s.status === 'finished').sort((a, b) => b.date.localeCompare(a.date))
  if (sessions.length === 0) return { suggest: false, urgency: 'none', reason: 'Тренировок ещё нет.', weeksSinceDeload: 0 }
  const since = profile?.deloadStart ? addDays(profile.deloadStart, 7) : sessions[sessions.length - 1].date
  const weeksSinceDeload = Math.max(0, Math.floor((Date.parse(localDate()) - Date.parse(since)) / (7 * 86_400_000)))
  const recent = await Promise.all(sessions.slice(0, 3).map((s) => isSessionFailedFor(s.id)))
  const inDeload = !!profile?.deloadStart && profile.deloadStart === weekKey(localDate())
  if (inDeload) return { suggest: false, urgency: 'none', reason: 'Идёт разгрузочная неделя.', weeksSinceDeload: 0 }
  return { ...deloadCheck({ weeksSinceDeload, recentSessionsFailed: recent }), weeksSinceDeload }
}

export async function startDeloadThisWeek(): Promise<void> {
  const profile = await db.profiles.toCollection().first()
  if (profile) await save('profiles', { id: profile.id, deloadStart: weekKey(localDate()) })
}
