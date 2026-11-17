import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/db'
import { alive, startSession } from '../../lib/workout'
import { weekFlags } from '../../lib/week'
import { Badge, Button, Card } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'
import { localDate } from '../../domain'

/** Тренировка не начата: выбрать день программы или начать пустую. */
export function StartWorkout() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const program = alive(await db.programs.toArray()).find((p) => p.isActive)
    const days = program ? alive(await db.programDays.where('programId').equals(program.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    const counts = await Promise.all(days.map(async (d) => alive(await db.programExercises.where('programDayId').equals(d.id).toArray()).length))
    const today = alive(await db.calendarEvents.where('date').equals(localDate()).toArray()).find((e) => e.type === 'gym')
    return { days: days.map((d, i) => ({ ...d, count: counts[i] })), plannedDayId: today?.programDayId ?? null }
  }, [])

  async function start(programDayId: string | null) {
    const flags = await weekFlags()
    await startSession({ programDayId, deload: flags.deload, cutLegVolume: flags.cutLegVolume })
    navigate('/workout', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <BackHeader title="Начать тренировку" />
      <div className="px-safe space-y-3">
        <h1 className="text-xl font-semibold">Какая тренировка?</h1>
        {data?.days.map((d) => (
          <Card key={d.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{d.name}</span>
                  {d.id === data.plannedDayId && <Badge tone="accent">по плану сегодня</Badge>}
                </div>
                <div className="text-sm text-fg-3">{d.count} упражнений{d.heavyLegs ? ' · тяжёлые ноги' : ''}</div>
              </div>
              <Button variant={d.id === data.plannedDayId ? 'primary' : 'secondary'} onClick={() => void start(d.id)}>Начать</Button>
            </div>
          </Card>
        ))}
        <Button size="action" onClick={() => void start(null)}>Пустая тренировка</Button>
        {data && data.days.length === 0 && (
          <p className="text-center text-sm text-fg-3">Программы пока нет — упражнения добавишь по ходу тренировки.</p>
        )}
      </div>
    </div>
  )
}
