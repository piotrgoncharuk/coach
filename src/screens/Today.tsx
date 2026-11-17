import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { humanDate, localDate, minutesBetween, weekKey } from '../domain'
import { db, META } from '../lib/db'
import { addFootball, currentStreak, ensureWeekPlanned, loadWeek, updateEvent } from '../lib/calendar'
import { activeProgram } from '../lib/program'
import { alive, startSession } from '../lib/workout'
import { weekFlags } from '../lib/week'
import { Badge, Button, Card, Screen } from '../ui/components'
import { SyncBadge } from '../ui/SyncBadge'
import { TodayExtras } from './TodayExtras'

export function TodayScreen() {
  const navigate = useNavigate()
  const today = localDate()

  useEffect(() => {
    void ensureWeekPlanned(today)
  }, [today])

  const data = useLiveQuery(async () => {
    const id = (await db.meta.get(META.activeSessionId))?.value as string | null
    const s = id ? await db.sessions.get(id) : undefined
    const active = s && s.status === 'active' && !s.deletedAt ? s : null
    const events = alive(await db.calendarEvents.where('date').equals(today).toArray())
    const gym = events.find((e) => e.type === 'gym')
    const football = events.find((e) => e.type === 'football')
    const day = gym?.programDayId ? await db.programDays.get(gym.programDayId) : undefined
    const count = day ? alive(await db.programExercises.where('programDayId').equals(day.id).toArray()).length : 0
    const doneToday = alive(await db.sessions.where('date').equals(today).toArray()).filter((x) => x.status === 'finished')
    const week = await loadWeek(today)
    const profile = await db.profiles.toCollection().first()
    const program = await activeProgram()
    return {
      active, gym, football, day, count, doneToday, conflicts: week.conflicts,
      streak: await currentStreak(), deload: !!profile?.deloadStart && profile.deloadStart === weekKey(today),
      name: profile?.displayName ?? '', hasProgram: !!program,
    }
  }, [today])

  async function start() {
    const f = await weekFlags()
    await startSession({ programDayId: data?.gym?.programDayId ?? null, deload: f.deload, cutLegVolume: f.cutLegVolume })
    navigate('/workout')
  }

  return (
    <Screen title={data?.name ? `Привет, ${data.name}` : 'Сегодня'} action={<SyncBadge />}>
      <div className="-mt-1 flex items-center justify-between">
        <p className="text-sm text-fg-3 first-letter:uppercase">{humanDate(today)}</p>
        {!!data?.streak && <Badge tone="accent">серия: {data.streak} нед. без пропусков</Badge>}
      </div>

      {data?.active ? (
        <Card className="border-accent">
          <div className="text-xs uppercase tracking-wide text-accent">Тренировка идёт</div>
          <div className="mt-0.5 text-lg font-semibold">{minutesBetween(data.active.startedAt, new Date().toISOString())} мин</div>
          <Button variant="primary" size="action" className="mt-3" onClick={() => navigate('/workout')}>Продолжить тренировку</Button>
        </Card>
      ) : data?.gym ? (
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-fg-3">Сегодня зал{data.deload ? ' · разгрузка' : ''}</div>
              <div className="mt-0.5 text-lg font-semibold">{data.day?.name ?? 'Тренировка'}{data.day?.focus ? ` — ${data.day.focus.toLowerCase()}` : ''}</div>
              {data.day && <div className="text-sm text-fg-2">{data.count} упражнений{data.day.heavyLegs ? ' · тяжёлые ноги' : ''}</div>}
            </div>
            {data.gym.status === 'done' && <Badge tone="green">сделано</Badge>}
          </div>
          {data.gym.status !== 'done' && <Button variant="primary" size="action" className="mt-3" onClick={() => void start()}>Начать тренировку</Button>}
        </Card>
      ) : (
        <Card>
          <div className="text-xs uppercase tracking-wide text-fg-3">{data?.football ? 'Сегодня футбол' : 'Сегодня отдых'}</div>
          <div className="mt-0.5 text-lg font-semibold">{data?.doneToday.length ? 'Тренировка сделана' : data?.football ? 'Тренировки в зале нет' : 'Восстанавливайся'}</div>
          <Button size="action" className="mt-3" onClick={() => navigate('/workout')}>Всё равно потренироваться</Button>
        </Card>
      )}

      {data?.football ? (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">⚽ Футбол</div>
              <div className="text-sm text-fg-3">{data.football.durationMin} мин · тяжесть {data.football.intensity}/10</div>
            </div>
            {data.football.status === 'done'
              ? <Badge tone="green">сыграно</Badge>
              : <Button onClick={() => void updateEvent(data.football!.id, { status: 'done' })}>Сыграно</Button>}
          </div>
        </Card>
      ) : (
        <Button className="w-full" onClick={() => void addFootball(today)}>⚽ Сегодня был футбол</Button>
      )}

      {data && data.conflicts.length > 0 && (
        <button onClick={() => navigate('/program')} className="w-full rounded-card border border-warn/40 bg-warn/10 p-3 text-left text-sm">
          <span className="font-semibold text-warn">На неделе конфликт с футболом.</span> <span className="text-fg-2">{data.conflicts[0].message} Открыть календарь →</span>
        </button>
      )}

      <TodayExtras />

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => navigate('/history')}>История</Button>
        <Button onClick={() => navigate('/program')}>{data?.hasProgram ? 'Календарь' : 'Программа'}</Button>
      </div>
    </Screen>
  )
}
