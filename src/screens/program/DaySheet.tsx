import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { humanDate, localDate } from '../../domain'
import { db } from '../../lib/db'
import { addFootball, clearDay, lastFootballDuration, lastFootballIntensity, removeEvent, setGym, setRest, updateEvent } from '../../lib/calendar'
import { activeProgram } from '../../lib/program'
import { alive, startSession } from '../../lib/workout'
import { weekFlags } from '../../lib/week'
import { Button, Stepper } from '../../ui/components'
import { Sheet } from '../../ui/Sheet'

export function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    if (!date) return null
    const events = alive(await db.calendarEvents.where('date').equals(date).toArray())
    const program = await activeProgram()
    const days = program ? alive(await db.programDays.where('programId').equals(program.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    return { events, days }
  }, [date])
  const [duration, setDuration] = useState(90)
  const [intensity, setIntensity] = useState(7)

  const football = data?.events.find((e) => e.type === 'football')
  const gym = data?.events.find((e) => e.type === 'gym')

  useEffect(() => {
    void (async () => {
      setDuration(football?.durationMin ?? (await lastFootballDuration()))
      setIntensity(football?.intensity ?? (await lastFootballIntensity()))
    })()
  }, [football?.id, date]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!date || !data) return null
  const isToday = date === localDate()

  return (
    <Sheet open onClose={onClose} title={humanDate(date)}>
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg-2">Зал</h3>
          <div className="flex flex-wrap gap-2">
            {data.days.map((d) => (
              <button key={d.id} aria-pressed={gym?.programDayId === d.id} onClick={() => void setGym(date, d.id)}
                className={`min-h-touch rounded-full px-4 ${gym?.programDayId === d.id ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>
                {d.name}{d.heavyLegs ? ' · ноги' : ''}
              </button>
            ))}
            {data.days.length === 0 && (
              <button aria-pressed={!!gym} onClick={() => void setGym(date, null)} className={`min-h-touch rounded-full px-4 ${gym ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>Тренировка</button>
            )}
          </div>
          {gym && (
            <div className="mt-2 flex gap-2">
              {isToday && gym.status !== 'done' && (
                <Button variant="primary" className="flex-1" onClick={() => void (async () => {
                  const f = await weekFlags()
                  await startSession({ programDayId: gym.programDayId, deload: f.deload, cutLegVolume: f.cutLegVolume })
                  navigate('/workout')
                })()}>Начать тренировку</Button>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => void removeEvent(gym.id)}>Убрать зал</Button>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg-2">Футбол</h3>
          <div className="space-y-2">
            <Stepper label="Минут" value={duration} step={15} min={15} max={180} onChange={setDuration} />
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-fg-3">Тяжесть 1–10</div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} aria-pressed={intensity === n} onClick={() => setIntensity(n)} aria-label={`Тяжесть ${n}`}
                    className={`tnum h-11 rounded-card text-sm ${intensity === n ? 'bg-accent font-semibold text-on-accent' : 'bg-raised text-fg-2'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant={football ? 'secondary' : 'primary'} className="flex-1" onClick={() => void addFootball(date, duration, intensity)}>
                {football ? 'Сохранить футбол' : '⚽ Добавить футбол'}
              </Button>
              {football && <Button variant="ghost" onClick={() => void removeEvent(football.id)}>Убрать</Button>}
            </div>
            {football && football.status === 'planned' && date <= localDate() && (
              <Button className="w-full" onClick={() => void updateEvent(football.id, { status: 'done', durationMin: duration, intensity })}>Сыграно</Button>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button onClick={() => { void setRest(date); onClose() }}>Отдых</Button>
          <Button variant="ghost" onClick={() => { void clearDay(date); onClose() }}>Очистить день</Button>
        </section>
      </div>
    </Sheet>
  )
}
