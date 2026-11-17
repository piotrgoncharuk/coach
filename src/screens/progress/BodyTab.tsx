import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { addDays, fmtKg, GIRTHS, goalEta, localDate, paceKgPerWeek, shortDate, weightSeries, type GirthKey } from '../../domain'
import { db } from '../../lib/db'
import { bodyMetrics, deleteBodyMetric, saveBodyMetric } from '../../lib/body'
import { Button, Card, EmptyState, Stepper } from '../../ui/components'
import type { BodyMetric } from '../../lib/models'
import { ProgressChart } from '../../ui/charts'

export function BodyTab() {
  const today = localDate()
  const data = useLiveQuery(async () => ({ rows: await bodyMetrics(), profile: await db.profiles.toCollection().first() }), [])
  const rows = data?.rows ?? []
  const weights = rows.filter((r) => r.weightKg != null).map((r) => ({ date: r.date, value: r.weightKg! }))
  const series = weightSeries(weights)
  const last = series.at(-1)
  const pace = paceKgPerWeek(weights)
  const eta = last ? goalEta(last.avg, data?.profile?.weightGoalKg ?? null, pace) : null
  const [weight, setWeight] = useState<number | null>(null)
  const [girths, setGirths] = useState<Partial<Record<GirthKey, string>>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (weight === null && last) setWeight(last.raw)
  }, [last, weight])

  const change = (days: number) => {
    if (!last) return null
    const from = series.filter((p) => p.date <= addDays(last.date, -days)).at(-1)
    return from ? Math.round((last.avg - from.avg) * 10) / 10 : null
  }
  const sign = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtKg(v)} кг`)

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="mb-2 font-semibold">Вес сегодня</h2>
        <Stepper label="Вес" value={weight ?? 80} step={0.1} min={30} max={250} unit="кг" decimals={1} onChange={setWeight} />
        <Button variant="primary" className="mt-3 w-full" onClick={() => void saveBodyMetric(today, { weightKg: weight ?? 80 }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500) })}>
          {saved ? 'Записано ✓' : 'Записать вес'}
        </Button>
        <p className="mt-2 text-xs text-fg-3">Взвешивайся утром натощак. Скачки на полкило из-за воды — нормально, смотри на среднюю линию.</p>
      </Card>

      {series.length === 0 ? (
        <EmptyState title="Взвешиваний пока нет" text="После пары записей появится график и средняя за 7 дней." />
      ) : (
        <Card>
          <div className="mb-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="Среднее 7 дн." value={`${fmtKg(last!.avg)} кг`} />
            <Stat label="За неделю" value={sign(change(7))} />
            <Stat label="Темп" value={pace === null ? '—' : `${pace > 0 ? '+' : ''}${fmtKg(pace)} кг/нед`} />
          </div>
          {series.length >= 2 && <ProgressChart unit="кг" showRaw data={series.map((p) => ({ label: shortDate(p.date), value: p.avg, raw: p.raw }))} />}
          <p className="mt-2 text-xs text-fg-3">
            Точки — взвешивания, линия — среднее за 7 дней. Темп — наклон за последние 4 недели{pace === null ? '; нужно хотя бы три взвешивания за неделю' : ''}.
            {eta ? ` До цели ${fmtKg(Math.abs(eta.remainingKg))} кг${eta.weeks ? `, при нынешнем темпе ~${eta.weeks} нед.` : ', темп сейчас в другую сторону.'}` : ' Цели по весу нет — показываю факт и динамику.'}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Обхваты, см</h2>
        <div className="grid grid-cols-2 gap-2">
          {GIRTHS.map((g) => {
            const lastVal = [...rows].reverse().find((r) => r[g.key] != null)?.[g.key]
            return (
              <label key={g.key} className="block">
                <span className="mb-1 block text-sm text-fg-2">{g.label}{lastVal != null && <span className="text-fg-3"> · было {fmtKg(lastVal)}</span>}</span>
                <input type="number" inputMode="decimal" value={girths[g.key] ?? ''} onChange={(e) => setGirths({ ...girths, [g.key]: e.currentTarget.value })}
                  className="min-h-touch w-full rounded-card border border-border bg-raised px-3" />
              </label>
            )
          })}
        </div>
        <Button className="mt-3 w-full" disabled={!Object.values(girths).some(Boolean)} onClick={() => {
          const patch = Object.fromEntries(Object.entries(girths).filter(([, v]) => v).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]))
          void saveBodyMetric(today, patch).then(() => setGirths({}))
        }}>Записать обхваты</Button>
        <GirthChanges rows={rows} />
      </Card>

      {rows.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">Записи</h2>
          <ul className="divide-y divide-border">
            {[...rows].reverse().slice(0, 12).map((r) => (
              <li key={r.id} className="flex min-h-touch items-center gap-3 text-sm">
                <span className="w-16 text-fg-3">{shortDate(r.date)}</span>
                <span className="tnum flex-1">{r.weightKg != null ? `${fmtKg(r.weightKg)} кг` : ''} {GIRTHS.filter((g) => r[g.key] != null).map((g) => `${g.label.toLowerCase()} ${fmtKg(r[g.key]!)}`).join(', ')}</span>
                <button aria-label={`Удалить запись ${shortDate(r.date)}`} className="size-touch text-fg-3" onClick={() => void deleteBodyMetric(r.id)}>✕</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function GirthChanges({ rows }: { rows: BodyMetric[] }) {
  const changes = GIRTHS.map((g) => {
    const vals = rows.filter((r) => r[g.key] != null)
    if (vals.length < 2) return null
    const d = Math.round((vals.at(-1)![g.key]! - vals[0][g.key]!) * 10) / 10
    return { label: g.label, d, since: vals[0].date }
  }).filter(Boolean) as { label: string; d: number; since: string }[]
  if (!changes.length) return null
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      {changes.map((c) => (
        <li key={c.label} className="flex justify-between"><span className="text-fg-3">{c.label}</span><span className="tnum">{c.d > 0 ? '+' : ''}{fmtKg(c.d)} с {shortDate(c.since)}</span></li>
      ))}
    </ul>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-raised px-2 py-2">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="tnum text-base font-semibold">{value}</div>
    </div>
  )
}
