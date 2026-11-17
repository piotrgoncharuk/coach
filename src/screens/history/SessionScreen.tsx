import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fmtKg, humanDate, minutesBetween } from '../../domain'
import { db } from '../../lib/db'
import { loadSession } from '../../lib/history'
import type { SetRow } from '../../lib/models'
import { softDelete } from '../../lib/repo'
import { Badge, Button, Card, EmptyState, Skeleton } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'
import { Confirm } from '../../ui/Sheet'
import { SetEditor } from '../workout/WorkoutScreen'

export function SessionScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [edit, setEdit] = useState<SetRow | null>(null)
  const [confirm, setConfirm] = useState(false)
  const data = useLiveQuery(async () => {
    await db.sets.count()
    return id ? loadSession(id) : null
  }, [id])

  if (data === undefined) return <div className="px-safe pt-16"><Skeleton className="h-64" /></div>
  if (data === null) return <div className="px-safe pt-16"><EmptyState title="Тренировка не найдена" action={<Button onClick={() => navigate('/history')}>К истории</Button>} /></div>

  const { session, blocks } = data
  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Тренировка" />
      <div className="px-safe space-y-3">
        <div>
          <h1 className="text-xl font-semibold first-letter:uppercase">{humanDate(session.date)}</h1>
          <p className="text-sm text-fg-3">
            {data.dayName ?? 'Свободная тренировка'} · {minutesBetween(session.startedAt, session.finishedAt ?? session.startedAt)} мин
            {session.difficulty ? ` · сложность ${session.difficulty}/10` : ''}
          </p>
          {session.note && <p className="mt-2 rounded-card bg-raised px-3 py-2 text-sm">{session.note}</p>}
        </div>
        {blocks.map(({ se, exercise, sets }) => (
          <Card key={se.id}>
            <button onClick={() => exercise && navigate(`/exercises/${exercise.id}`)} className="text-left font-semibold">{exercise?.nameRu ?? 'Упражнение'}</button>
            {se.substitutedFrom && <p className="text-xs text-fg-3">замена</p>}
            {sets.length === 0 ? (
              <p className="mt-1 text-sm text-fg-3">Подходов нет</p>
            ) : (
              <ul className="mt-1">
                {sets.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setEdit(s)} className="flex min-h-touch w-full items-center gap-3 text-left">
                      <span className="w-5 text-sm text-fg-3">{s.setIndex}</span>
                      <span className="tnum flex-1">{fmtKg(s.weightKg)} кг × {s.reps}</span>
                      {s.rir !== null && s.type !== 'warmup' && <Badge>запас {s.rir}</Badge>}
                      {s.type === 'warmup' && <Badge>разминка</Badge>}
                      {s.isPr && <Badge tone="record">рекорд</Badge>}
                    </button>
                    {s.note && <p className="-mt-2 mb-1 pl-8 text-xs text-fg-3">{s.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
        <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}>Удалить тренировку</Button>
      </div>
      <SetEditor set={edit} onClose={() => setEdit(null)} />
      <Confirm open={confirm} title="Удалить тренировку?" danger confirm="Удалить"
        text="Тренировка пропадёт из истории и графиков. Запись остаётся в базе с меткой удаления — её можно восстановить из экспорта."
        onClose={() => setConfirm(false)} onConfirm={() => void softDelete('sessions', session.id).then(() => navigate('/history', { replace: true }))} />
    </div>
  )
}
