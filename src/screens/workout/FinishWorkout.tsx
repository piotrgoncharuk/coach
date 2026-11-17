import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { fmtKg, summarizeSession, MUSCLE_GROUP_RU, MUSCLE_GROUPS, RECORD_RU } from '../../domain'
import { db } from '../../lib/db'
import { alive, finishSession, toPerformed } from '../../lib/workout'
import { Badge, Button, Card, Skeleton } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'
import { useActiveWorkout } from './useActiveWorkout'

/** Итог тренировки и оценка сложности перед сохранением. */
export function FinishWorkout() {
  const navigate = useNavigate()
  const w = useActiveWorkout()
  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const records = useLiveQuery(async () => {
    if (!w) return []
    const ids = new Set(w.sets.map((s) => s.id))
    return alive(await db.personalRecords.toArray()).filter((r) => r.setId && ids.has(r.setId))
  }, [w?.sets.length])

  if (w === undefined) return <div className="px-safe pt-16"><Skeleton className="h-64" /></div>
  if (w === null) return <Navigate to="/" replace />

  const primary = Object.fromEntries([...w.catalog.values()].map((e) => [e.id, e.primaryMuscles]))
  const sum = summarizeSession(w.sets.map(toPerformed), primary, w.session.startedAt, new Date().toISOString())

  async function save() {
    setBusy(true)
    await finishSession(w!.session.id, { difficulty, note: note.trim() || null })
    navigate(`/history/${w!.session.id}`, { replace: true })
  }

  return (
    <div className="min-h-dvh bg-bg pb-10">
      <BackHeader title="Итог тренировки" />
      <div className="px-safe space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Время" value={`${sum.durationMin} мин`} />
          <Tile label="Подходы" value={String(sum.workSets)} />
          <Tile label="Тоннаж" value={`${(sum.tonnageKg / 1000).toFixed(1).replace('.', ',')} т`} />
        </div>

        <Card>
          <h2 className="mb-2 font-semibold">Подходы по группам мышц</h2>
          <ul className="space-y-1.5">
            {MUSCLE_GROUPS.filter((g) => sum.setsByGroup[g] > 0).map((g) => (
              <li key={g} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-fg-2">{MUSCLE_GROUP_RU[g]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (sum.setsByGroup[g] / Math.max(...Object.values(sum.setsByGroup))) * 100)}%` }} />
                </div>
                <span className="tnum w-6 text-right">{sum.setsByGroup[g]}</span>
              </li>
            ))}
            {sum.workSets === 0 && <li className="text-sm text-fg-3">Рабочих подходов нет.</li>}
          </ul>
        </Card>

        {records && records.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Рекорды</h2>
            <ul className="space-y-1">
              {records.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>{w.catalog.get(r.exerciseId)?.nameRu}</span>
                  <Badge tone="record">{RECORD_RU[r.kind]} {fmtKg(r.value)}{r.kind === 'reps' ? '' : ' кг'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">Насколько было тяжело?</h2>
          <p className="mb-2 text-xs text-fg-3">1 — легко, 10 — на пределе</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} aria-pressed={difficulty === n} onClick={() => setDifficulty(n)}
                className={`tnum h-12 rounded-card text-lg ${difficulty === n ? 'bg-accent font-semibold text-black' : 'bg-raised text-fg-2'}`}>{n}</button>
            ))}
          </div>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="Заметка о тренировке"
            className="mt-3 w-full rounded-card border border-border bg-raised px-3 py-2 placeholder:text-fg-3" />
        </Card>

        <Button variant="primary" size="action" disabled={busy} onClick={() => void save()}>Сохранить тренировку</Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate('/workout')}>Вернуться к тренировке</Button>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="tnum text-lg font-semibold">{value}</div>
    </div>
  )
}
