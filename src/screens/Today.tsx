import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Screen } from '../ui/components'
import { SyncBadge } from '../ui/SyncBadge'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function today(): string {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function TodayScreen() {
  const navigate = useNavigate()

  return (
    <Screen title="Сегодня" action={<SyncBadge />}>
      <p className="-mt-1 text-sm text-fg-3 first-letter:uppercase">{today()}</p>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-3">План на сегодня</div>
            <div className="mt-0.5 text-lg font-semibold">Зал · День A — всё тело</div>
            <div className="text-sm text-fg-2">5 упражнений · примерно 55 минут</div>
          </div>
          <Badge tone="accent">этап 3</Badge>
        </div>
        <Button variant="primary" size="action" className="mt-4" onClick={() => navigate('/workout')}>
          Начать тренировку
        </Button>
        <p className="mt-2 text-center text-xs text-fg-3">
          Пока это макет экрана тренировки на согласование
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs uppercase tracking-wide text-fg-3">Готовность</div>
          <div className="tnum mt-1 text-2xl font-semibold text-fg-3">—</div>
          <p className="text-xs text-fg-3">после утреннего чек-ина</p>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-fg-3">Белок за день</div>
          <div className="tnum mt-1 text-2xl font-semibold text-fg-3">—</div>
          <p className="text-xs text-fg-3">цель 190 г</p>
        </Card>
      </div>

      <EmptyState
        title="Заметок тренера пока нет"
        text="Тренер начнёт писать сюда, когда подключим его к данным на пятом этапе."
      />
    </Screen>
  )
}
