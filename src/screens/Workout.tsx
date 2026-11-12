import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, ChipRow, Stepper } from '../ui/components'
import { RestTimerPanel } from '../ui/RestTimer'
import { IconClose, IconPlus } from '../ui/icons'
import { epley1RM, fmtKg, formatPerSide, platesFor, suggestNextLoad, warmupSets } from '../domain'
import type { PerformedSet, SetType } from '../domain/types'
import type { RestTimerState } from '../domain/timer'
import { unlockSound } from '../lib/sound'

/* ────────────────────────────────────────────────────────────────────────────
   Этап 1 — макет экрана тренировки на согласование.
   Данные взяты из заготовки, подсказка веса и калькулятор блинов считаются
   настоящими функциями. На Этапе 2 экран подключается к локальной базе.
   ──────────────────────────────────────────────────────────────────────────── */

const LAST_TIME: PerformedSet[] = [
  { id: 'l1', exerciseId: 'squat', setIndex: 1, weightKg: 80, reps: 8, rir: 2, type: 'work', performedAt: '2026-11-05T18:12:00.000Z' },
  { id: 'l2', exerciseId: 'squat', setIndex: 2, weightKg: 80, reps: 8, rir: 1, type: 'work', performedAt: '2026-11-05T18:16:00.000Z' },
  { id: 'l3', exerciseId: 'squat', setIndex: 3, weightKg: 80, reps: 8, rir: 1, type: 'work', performedAt: '2026-11-05T18:20:00.000Z' },
]

const TARGET = { exerciseId: 'squat', sets: 3, repMin: 6, repMax: 8, rir: 2, restSec: 150 }

const SET_TYPES: { value: SetType; label: string }[] = [
  { value: 'warmup', label: 'Разминка' },
  { value: 'work', label: 'Рабочий' },
  { value: 'drop', label: 'Дроп' },
  { value: 'failure', label: 'До отказа' },
]

export function WorkoutScreen() {
  const navigate = useNavigate()
  const suggestion = useMemo(
    () => suggestNextLoad({ target: TARGET, lastSets: LAST_TIME, equipment: 'barbell', group: 'legs' }),
    [],
  )

  const [weight, setWeight] = useState(suggestion.weightKg ?? 60)
  const [reps, setReps] = useState(suggestion.repTarget)
  const [rir, setRir] = useState(suggestion.rir)
  const [type, setType] = useState<SetType>('work')
  const [done, setDone] = useState<PerformedSet[]>([])
  const [rest, setRest] = useState<RestTimerState | null>(null)
  const [flash, setFlash] = useState(false)

  const plates = platesFor(weight)
  const warmup = warmupSets(weight)
  const bestPrev = Math.max(...LAST_TIME.map((s) => epley1RM(s.weightKg, s.reps, s.rir)))
  const thisE1rm = epley1RM(weight, reps, rir)
  const isPr = thisE1rm > bestPrev && type !== 'warmup'

  function recordSet() {
    unlockSound() // звук разрешается настоящим касанием, иначе iOS его не даст
    setDone((prev) => [
      ...prev,
      {
        id: `s${prev.length + 1}`,
        exerciseId: 'squat',
        setIndex: prev.length + 1,
        weightKg: weight,
        reps,
        rir,
        type,
        performedAt: new Date().toISOString(),
      },
    ])
    setFlash(true)
    setTimeout(() => setFlash(false), 700)
    if (type !== 'warmup') setRest({ startedAt: new Date().toISOString(), durationSec: TARGET.restSec })
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* шапка */}
      <header className="pt-safe px-safe shrink-0 border-b border-border">
        <div className="flex min-h-touch items-center justify-between py-2">
          <button onClick={() => navigate('/')} aria-label="Закрыть тренировку" className="-ml-2 flex size-touch items-center justify-center text-fg-2">
            <IconClose />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold">День A · Всё тело</div>
            <div className="text-xs text-fg-3">Упражнение 1 из 5 · 12:04</div>
          </div>
          <Button variant="ghost" onClick={() => navigate('/')}>
            Завершить
          </Button>
        </div>
      </header>

      {/* прокручиваемая часть */}
      <main className="px-safe min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-3">
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex gap-3">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-card bg-raised text-xs text-fg-3">
              фото
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">Приседания со штангой</h2>
              <p className="text-sm text-fg-2">
                3 × 6–8 · запас 2 · отдых 2:30
              </p>
              <p className="mt-1 text-sm text-fg-3">
                Прошлый раз: 80 кг × 8, 8, 8
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-card bg-accent-soft p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-accent">Подсказка</span>
              <span className="tnum text-lg font-semibold text-accent">{fmtKg(suggestion.weightKg ?? 0)} кг × {suggestion.repTarget}</span>
            </div>
            <p className="mt-0.5 text-sm text-fg-2">{suggestion.reason}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            <span>
              <span className="text-fg-3">Блины на сторону: </span>
              {formatPerSide(plates.perSide)}
            </span>
            <span>
              <span className="text-fg-3">Разминка: </span>
              {warmup.map((w) => `${fmtKg(w.weightKg)}×${w.reps}`).join(' · ')}
            </span>
          </div>
        </div>

        {/* записанные подходы */}
        <div className="rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm text-fg-3">
            <span>Подходы</span>
            <span>{done.filter((s) => s.type !== 'warmup').length} из {TARGET.sets}</span>
          </div>
          {done.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-3">
              Ещё ни одного подхода. Вес и повторы уже подставлены — нажми «Записать подход».
            </p>
          ) : (
            <ul>
              {done.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <span className="w-5 text-sm text-fg-3">{s.setIndex}</span>
                  <span className="tnum flex-1 text-base">
                    {fmtKg(s.weightKg)} кг × {s.reps}
                  </span>
                  {s.rir !== null && <Badge>запас {s.rir}</Badge>}
                  {s.type === 'warmup' && <Badge>разминка</Badge>}
                  {epley1RM(s.weightKg, s.reps, s.rir) > bestPrev && s.type !== 'warmup' && (
                    <Badge tone="record">рекорд</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button className="flex min-h-touch w-full items-center justify-center gap-2 rounded-card border border-dashed border-border text-sm text-fg-2">
          <IconPlus width={18} height={18} /> Заменить упражнение
        </button>
      </main>

      {/* нижняя треть: редактор подхода или таймер отдыха */}
      <section className="pb-safe px-safe shrink-0 border-t border-border bg-surface pt-3 shadow-[var(--shadow-sheet)]">
        {rest ? (
          <RestTimerPanel
            state={rest}
            onAdd={(sec) => setRest((r) => (r ? { ...r, durationSec: Math.max(0, r.durationSec + sec) } : r))}
            onSkip={() => setRest(null)}
          />
        ) : (
          <div className="space-y-2">
            <Stepper label="Вес" value={weight} step={2.5} min={0} max={400} unit="кг" decimals={1} onChange={setWeight} />
            <Stepper label="Повторы" value={reps} step={1} min={1} max={50} onChange={setReps} />

            <ChipRow
              label="Запас"
              value={rir}
              onChange={setRir}
              options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            />
            <ChipRow label="Тип" value={type} onChange={setType} options={SET_TYPES} />

            <div className="flex items-center justify-between px-0.5 text-xs">
              <span className="text-fg-3">
                Расчётный 1ПМ <span className="tnum text-fg-2">{fmtKg(thisE1rm)} кг</span>
              </span>
              {isPr && <Badge tone="record">будет рекорд</Badge>}
            </div>

            <Button
              variant="primary"
              size="action"
              onClick={recordSet}
              className={flash ? 'animate-pop' : ''}
            >
              Записать подход
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
