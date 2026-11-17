import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { addDays, dateWithCase, humanDate, localDate, shortDate, weekday, WEEKDAY_SHORT, weekKey } from '../../domain'
import { db } from '../../lib/db'
import { ensureWeekPlanned, loadWeek, moveGym } from '../../lib/calendar'
import { Button, Card, Skeleton } from '../../ui/components'
import { DaySheet } from './DaySheet'

/** Недельный календарь: зал, футбол, отдых. Касание дня — правка. */
export function WeekCalendar() {
  const [anchor, setAnchor] = useState(localDate())
  const [openDate, setOpenDate] = useState<string | null>(null)
  const today = localDate()

  useEffect(() => {
    void ensureWeekPlanned(anchor)
  }, [anchor])

  const week = useLiveQuery(async () => {
    await db.calendarEvents.count()
    await db.programDays.count()
    return loadWeek(anchor)
  }, [anchor])

  const start = weekKey(anchor)
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <button aria-label="Прошлая неделя" onClick={() => setAnchor(addDays(start, -7))} className="flex size-touch items-center justify-center text-fg-2">‹</button>
        <div className="text-center">
          <div className="font-semibold">{start === weekKey(today) ? 'Эта неделя' : `${shortDate(start)} — ${shortDate(addDays(start, 6))}`}</div>
          {start !== weekKey(today) && <button className="text-xs text-accent" onClick={() => setAnchor(today)}>к текущей</button>}
        </div>
        <button aria-label="Следующая неделя" onClick={() => setAnchor(addDays(start, 7))} className="flex size-touch items-center justify-center text-fg-2">›</button>
      </div>

      {!week ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {week.days.map(({ date, events }) => {
            const gym = events.find((e) => e.type === 'gym')
            const foot = events.find((e) => e.type === 'football')
            const day = gym?.programDayId ? week.dayNames.get(gym.programDayId) : undefined
            const letter = day?.name.replace(/^День\s*/, '') ?? (gym ? 'З' : '')
            const isToday = date === today
            const past = date < today
            const label = `${humanDate(date)}: ${[gym ? `зал ${day?.name ?? ''}` : '', foot ? 'футбол' : '', !gym && !foot ? 'отдых' : ''].filter(Boolean).join(', ')}`
            return (
              <button key={date} onClick={() => setOpenDate(date)} aria-label={label}
                className={`flex min-h-[4.5rem] flex-col items-center gap-0.5 rounded-card py-1.5 ${isToday ? 'bg-raised ring-1 ring-accent' : past ? 'ring-1 ring-border' : 'bg-raised'}`}>
                <span className="text-[11px] text-fg-3">{WEEKDAY_SHORT[weekday(date)]}</span>
                <span className="tnum text-sm">{Number(date.slice(8))}</span>
                <span className="flex h-6 items-center gap-0.5 text-sm font-semibold">
                  {gym && <span className={gym.status === 'done' ? 'text-success' : 'text-accent'}>{letter}{gym.status === 'done' ? '✓' : ''}</span>}
                  {foot && <span aria-hidden>⚽</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {week && week.conflicts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {week.conflicts.map((c) => (
            <li key={`${c.code}${c.date}`} className="rounded-card border border-warn/40 bg-warn/10 p-3 text-sm">
              <p className="text-fg">{c.message}</p>
              <p className="mt-1 text-fg-2">{c.suggestion}</p>
              {c.suggestedDate && (
                <Button className="mt-2 w-full" onClick={() => void moveGym(c.date, c.suggestedDate!)}>
                  {c.action === 'swap' ? `Поменять местами с ${dateWithCase(c.suggestedDate, 'ins')}` : `Перенести на ${dateWithCase(c.suggestedDate, 'acc')}`}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <DaySheet date={openDate} onClose={() => setOpenDate(null)} />
    </Card>
  )
}
