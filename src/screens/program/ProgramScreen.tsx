import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { describeTargets } from '../../domain'
import { db } from '../../lib/db'
import { deloadSuggestion, startDeloadThisWeek } from '../../lib/calendar'
import { activeProgram, loadSnapshot } from '../../lib/program'
import { Badge, Button, Card, EmptyState, Screen, SkeletonList } from '../../ui/components'
import { SyncBadge } from '../../ui/SyncBadge'
import { WeekCalendar } from './WeekCalendar'
import { ProposalsInbox } from './ProposalsInbox'

export function ProgramScreen() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    await db.programExercises.count()
    const program = await activeProgram()
    const snapshot = program ? await loadSnapshot(program.id) : null
    const names = new Map((await db.exercises.bulkGet(snapshot?.days.flatMap((d) => d.exercises.map((e) => e.exercise)) ?? [])).filter(Boolean).map((e) => [e!.id, e!.nameRu]))
    return { program, snapshot, names }
  }, [])
  const deload = useLiveQuery(() => deloadSuggestion(), [])

  return (
    <Screen title="Программа" action={<SyncBadge />}>
      <ProposalsInbox />

      {deload?.suggest && (
        <Card className={deload.urgency === 'strong' ? 'border-warn' : ''}>
          <div className="text-xs uppercase tracking-wide text-warn">Разгрузочная неделя</div>
          <p className="mt-1 text-sm">{deload.reason}</p>
          <p className="mt-1 text-xs text-fg-3">Неделю работаешь с теми же упражнениями: подходов меньше на 40%, вес на 10% ниже, запас повторов не меньше трёх.</p>
          <Button variant="primary" className="mt-3 w-full" onClick={() => void startDeloadThisWeek()}>Разгрузиться на этой неделе</Button>
        </Card>
      )}

      <WeekCalendar />

      {!data ? (
        <SkeletonList rows={3} />
      ) : !data.program || !data.snapshot ? (
        <EmptyState title="Программы пока нет" text="Собери стартовую «Всё тело ×3» с учётом ограничений или тренируйся свободно."
          action={<Button variant="primary" className="w-full" onClick={() => navigate('/program/edit?starter=1')}>Собрать программу</Button>} />
      ) : (
        <>
          <div className="flex items-baseline justify-between pt-1">
            <h2 className="text-lg font-semibold">{data.snapshot.name}</h2>
            <span className="text-sm text-fg-3">версия {data.program.version}</span>
          </div>
          {data.snapshot.notes && <p className="-mt-2 text-sm text-fg-3">{data.snapshot.notes}</p>}
          {data.snapshot.days.map((d, i) => (
            <Card key={i}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold">{d.name}</h3>
                {d.focus && <span className="text-sm text-fg-3">{d.focus}</span>}
                {d.heavyLegs && <Badge tone="accent">тяжёлые ноги</Badge>}
              </div>
              <ul className="divide-y divide-border">
                {d.exercises.map((e, j) => (
                  <li key={j}>
                    <button onClick={() => navigate(`/exercises/${e.exercise}`)} className="flex w-full items-start gap-2 py-2 text-left">
                      <span className="w-5 shrink-0 text-sm text-fg-3">{j + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block">{data.names.get(e.exercise) ?? 'Упражнение'}</span>
                        <span className="block text-sm text-fg-3">{describeTargets(e)}</span>
                        {e.notes && <span className="block text-xs text-fg-3">{e.notes}</span>}
                      </span>
                      {e.cautious && <Badge tone="yellow">осторожно</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => navigate('/program/edit')}>Изменить</Button>
            <Button onClick={() => navigate('/program/versions')}>Версии</Button>
            <Button onClick={() => navigate('/program/week')}>Шаблон недели</Button>
            <Button onClick={() => navigate('/videos')}>Видео</Button>
          </div>
        </>
      )}
    </Screen>
  )
}
