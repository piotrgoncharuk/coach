import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDate, weekDates, weekKey, WEEKDAY_SHORT } from '../../domain'
import { db, setMeta } from '../../lib/db'
import { ensureWeekPlanned } from '../../lib/calendar'
import { save, softDelete } from '../../lib/repo'
import { alive } from '../../lib/workout'
import { BackHeader } from '../../ui/BackHeader'
import { Button, Card } from '../../ui/components'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

export function WeekTemplateScreen() {
  const navigate = useNavigate()
  const profile = useLiveQuery(() => db.profiles.toCollection().first(), [])
  const [gym, setGym] = useState<number[]>([])
  const [football, setFootball] = useState<number[]>([])
  useEffect(() => {
    if (!profile) return
    setGym(profile.gymWeekdays ?? [])
    setFootball(profile.footballWeekdays ?? [])
  }, [profile])

  const toggle = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (on: boolean) => `min-h-touch w-14 rounded-full ${on ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`

  async function apply(replan: boolean) {
    if (!profile) return
    await save('profiles', { id: profile.id, gymWeekdays: gym, footballWeekdays: football })
    if (replan) {
      // перепланировать остаток текущей недели: только будущие и не сделанные события
      const today = localDate()
      for (const e of alive(await db.calendarEvents.where('date').anyOf(weekDates(today)).toArray())) {
        if (e.date >= today && e.status === 'planned') await softDelete('calendarEvents', e.id)
      }
      await setMeta(`calendar:planned:${weekKey(today)}`, false)
      await ensureWeekPlanned(today)
    }
    navigate('/program')
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Шаблон недели" />
      <div className="px-safe space-y-3">
        <h1 className="text-xl font-semibold">Шаблон недели</h1>
        <p className="text-sm text-fg-2">По нему заполняются новые недели в календаре. Дни программы расставляются так, чтобы тяжёлые ноги не попадали рядом с футболом.</p>
        <Card>
          <h2 className="mb-2 font-semibold">Зал</h2>
          <div className="flex flex-wrap gap-2">{ORDER.map((d) => <button key={d} aria-pressed={gym.includes(d)} className={chip(gym.includes(d))} onClick={() => setGym(toggle(gym, d))}>{WEEKDAY_SHORT[d]}</button>)}</div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Постоянный футбол</h2>
          <div className="flex flex-wrap gap-2">{ORDER.map((d) => <button key={d} aria-pressed={football.includes(d)} className={chip(football.includes(d))} onClick={() => setFootball(toggle(football, d))}>{WEEKDAY_SHORT[d]}</button>)}</div>
        </Card>
        <Button variant="primary" size="action" onClick={() => void apply(true)}>Сохранить и перепланировать неделю</Button>
        <Button className="w-full" onClick={() => void apply(false)}>Сохранить со следующей недели</Button>
      </div>
    </div>
  )
}
