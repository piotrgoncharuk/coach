import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { humanDate, localDate, minutesBetween } from '../domain'
import { db, META } from '../lib/db'
import { Button, Card, EmptyState, Screen } from '../ui/components'
import { SyncBadge } from '../ui/SyncBadge'

export function TodayScreen() {
  const navigate = useNavigate()
  const active = useLiveQuery(async () => {
    const id = (await db.meta.get(META.activeSessionId))?.value as string | null
    const s = id ? await db.sessions.get(id) : undefined
    return s && s.status === 'active' && !s.deletedAt ? s : null
  }, [])

  return (
    <Screen title="Сегодня" action={<SyncBadge />}>
      <p className="-mt-1 text-sm text-fg-3 first-letter:uppercase">{humanDate(localDate())}</p>

      {active ? (
        <Card className="border-accent">
          <div className="text-xs uppercase tracking-wide text-accent">Тренировка идёт</div>
          <div className="mt-0.5 text-lg font-semibold">{minutesBetween(active.startedAt, new Date().toISOString())} мин</div>
          <Button variant="primary" size="action" className="mt-3" onClick={() => navigate('/workout')}>Продолжить тренировку</Button>
        </Card>
      ) : (
        <Card>
          <div className="text-xs uppercase tracking-wide text-fg-3">Зал</div>
          <div className="mt-0.5 text-lg font-semibold">Готов к тренировке?</div>
          <Button variant="primary" size="action" className="mt-3" onClick={() => navigate('/workout')}>Начать тренировку</Button>
        </Card>
      )}

      <Button className="w-full" onClick={() => navigate('/history')}>История тренировок</Button>

      <EmptyState title="Заметок тренера пока нет" text="Тренер начнёт писать сюда, когда подключим его к данным." />
    </Screen>
  )
}
