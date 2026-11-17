import { formatMmSs, type RestTimerState } from '../domain/timer'
import { useRestTimer } from './useRestTimer'
import { Button } from './components'

export function RestTimerPanel({
  state,
  onAdd,
  onSkip,
}: {
  state: RestTimerState
  onAdd: (sec: number) => void
  onSkip: () => void
}) {
  const t = useRestTimer(state)
  if (!t) return null

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-3">Отдых</div>
          <output
            className={`tnum block text-3xl font-semibold leading-none ${
              t.done ? 'text-success' : 'text-fg'
            }`}
          >
            {formatMmSs(t.left)}
          </output>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onAdd(-30)} aria-label="Минус 30 секунд">
            −30с
          </Button>
          <Button onClick={() => onAdd(30)} aria-label="Плюс 30 секунд">
            +30с
          </Button>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(t.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${t.done ? 'bg-success' : 'bg-accent'}`}
          style={{ width: `${t.fraction * 100}%` }}
        />
      </div>

      <Button variant={t.done ? 'primary' : 'secondary'} size="action" onClick={onSkip}>
        {t.done ? 'К следующему подходу' : 'Пропустить отдых'}
      </Button>
    </div>
  )
}
