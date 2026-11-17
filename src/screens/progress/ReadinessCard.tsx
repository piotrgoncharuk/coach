import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { localDate, READINESS_ADVICE, fmtKg } from '../../domain'
import { db } from '../../lib/db'
import { lastCheckin, readinessFor, saveCheckin } from '../../lib/readiness'
import { Badge, Button, Card, Stepper } from '../../ui/components'
import { Scale } from '../../ui/Ring'

const FLAG = { green: { tone: 'green', text: 'Зелёный' }, yellow: { tone: 'yellow', text: 'Жёлтый' }, red: { tone: 'red', text: 'Красный' } } as const

/** Утренний чек-ин и готовность с открытой формулой. */
export function ReadinessCard({ compact = false }: { compact?: boolean }) {
  const today = localDate()
  const data = useLiveQuery(async () => {
    await db.readinessCheckins.count()
    await db.calendarEvents.count()
    return { today: await readinessFor(today), last: await lastCheckin() }
  }, [today])
  const [editing, setEditing] = useState(false)
  const [sleep, setSleep] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [soreness, setSoreness] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [showFormula, setShowFormula] = useState(false)

  if (!data) return null
  const sleepValue = sleep ?? data.last?.sleepHours ?? 7.5

  if (data.today && !editing) {
    const { result } = data.today
    const flag = FLAG[result.flag]
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-fg-3">Готовность</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="tnum text-3xl font-semibold">{result.score}</span>
              <Badge tone={flag.tone}>{flag.text}</Badge>
            </div>
          </div>
          <Button variant="ghost" onClick={() => setEditing(true)}>Изменить</Button>
        </div>
        <p className="mt-2 text-sm text-fg-2">{READINESS_ADVICE[result.flag]}</p>
        <button className="mt-2 min-h-touch text-sm text-accent" onClick={() => setShowFormula((v) => !v)} aria-expanded={showFormula}>
          {showFormula ? 'Скрыть расчёт' : 'Как посчитано'}
        </button>
        {showFormula && (
          <div className="mt-1 rounded-card bg-raised p-3 text-sm">
            <p className="mb-2 text-fg-2">{result.formula}</p>
            <ul className="space-y-1">
              <li className="flex justify-between"><span className="text-fg-3">База</span><span className="tnum">75</span></li>
              {result.factors.map((f) => (
                <li key={f.label} className="flex justify-between gap-2">
                  <span className="text-fg-3">{f.label} <span className="text-xs">({f.detail})</span></span>
                  <span className={`tnum ${f.delta > 0 ? 'text-success' : f.delta < 0 ? 'text-danger' : ''}`}>{f.delta > 0 ? '+' : ''}{fmtKg(f.delta)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>Итог, от 0 до 100</span><span className="tnum">{result.score}</span></li>
            </ul>
            <p className="mt-2 text-xs text-fg-3">Зелёный — от 75, жёлтый — 50–74, красный — ниже 50.</p>
          </div>
        )}
      </Card>
    )
  }

  const ready = energy !== null && soreness !== null && stress !== null
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Утренний чек-ин</h2>
        <span className="text-xs text-fg-3">10 секунд</span>
      </div>
      <div className="space-y-3">
        <Stepper label="Сон, ч" value={sleepValue} step={0.5} min={0} max={14} decimals={1} onChange={setSleep} />
        <Scale label="Энергия" value={energy} onChange={setEnergy} low="нет сил" high="бодр" />
        {!compact || energy !== null ? <Scale label="Мышцы болят" value={soreness} onChange={setSoreness} low="не болят" high="сильно" /> : null}
        {!compact || soreness !== null ? <Scale label="Стресс" value={stress} onChange={setStress} low="спокоен" high="высокий" /> : null}
        <Button variant="primary" className="w-full" disabled={!ready} onClick={() => void saveCheckin({ date: today, sleepHours: sleepValue, energy: energy!, soreness: soreness!, stress: stress! }).then(() => setEditing(false))}>
          Посчитать готовность
        </Button>
      </div>
    </Card>
  )
}
