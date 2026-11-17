import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { humanDate, MONTH_GEN } from '../../domain'
import { db } from '../../lib/db'
import { loadHistory } from '../../lib/history'
import { Badge, Button, EmptyState, SkeletonList } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'

export function HistoryScreen() {
  const navigate = useNavigate()
  const cards = useLiveQuery(async () => {
    await db.sessions.count() // подписка на изменения
    return loadHistory()
  }, [])

  const byMonth = new Map<string, NonNullable<typeof cards>>()
  for (const c of cards ?? []) {
    const key = c.session.date.slice(0, 7)
    byMonth.set(key, [...(byMonth.get(key) ?? []), c])
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="История тренировок" />
      <div className="px-safe space-y-4">
        <h1 className="text-xl font-semibold">История</h1>
        {!cards ? (
          <SkeletonList rows={4} />
        ) : cards.length === 0 ? (
          <EmptyState title="Тренировок пока нет" text="Первая появится здесь сразу после сохранения."
            action={<Button variant="primary" className="w-full" onClick={() => navigate('/workout')}>Начать тренировку</Button>} />
        ) : (
          [...byMonth.entries()].map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-1 text-sm text-fg-3">{monthTitle(month)} · {list.length}</h2>
              <ul className="divide-y divide-border rounded-card border border-border bg-surface">
                {list.map((c) => (
                  <li key={c.session.id}>
                    <button onClick={() => navigate(`/history/${c.session.id}`)} className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold first-letter:uppercase">{humanDate(c.session.date)}</span>
                          {c.hasPr && <Badge tone="record">рекорд</Badge>}
                          {c.session.status === 'abandoned' && <Badge tone="yellow">прервана</Badge>}
                        </div>
                        <div className="tnum text-sm text-fg-3">
                          {c.dayName ?? 'Свободная'} · {c.summary.durationMin} мин · {c.summary.workSets} подх. · {(c.summary.tonnageKg / 1000).toFixed(1).replace('.', ',')} т
                        </div>
                      </div>
                      {c.session.difficulty && <span className="tnum text-sm text-fg-2">{c.session.difficulty}/10</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const name = MONTH_GEN[m - 1]
  const nominative: Record<string, string> = { января: 'Январь', февраля: 'Февраль', марта: 'Март', апреля: 'Апрель', мая: 'Май', июня: 'Июнь', июля: 'Июль', августа: 'Август', сентября: 'Сентябрь', октября: 'Октябрь', ноября: 'Ноябрь', декабря: 'Декабрь' }
  return `${nominative[name]} ${y}`
}
