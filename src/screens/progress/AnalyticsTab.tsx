import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  attendanceByWeek, compareWeeks, e1rmByDay, fmtKg, lastWeeks, localDate, MUSCLE_GROUP_RU, MUSCLE_GROUPS, RECORD_RU, shortDate,
  volumeByWeek, VOLUME_TARGET, weekKey, weekStats, addDays, type MuscleGroup,
} from '../../domain'
import { db } from '../../lib/db'
import { loadAnalytics } from '../../lib/analytics'
import { alive } from '../../lib/workout'
import { BarsChart, ProgressChart } from '../../ui/charts'
import { Card, EmptyState, SkeletonList } from '../../ui/components'
import { DataCard } from './DataCard'
import type { Exercise } from '../../lib/models'

function useAnalyticsData() {
  return useLiveQuery(async () => {
    await db.sets.count()
    const a = await loadAnalytics()
    const prs = alive(await db.personalRecords.toArray())
    return { ...a, prs }
  }, [])
}

export function AnalyticsTab() {
  const today = localDate()
  const data = useAnalyticsData()
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [group, setGroup] = useState<MuscleGroup>('legs')

  const byUse = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const s of data.sets) if (s.type !== 'warmup') counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => data.exercises.get(id)!).filter(Boolean)
  }, [data])

  // карточка данных всегда на одном месте дерева: после импорта экран
  // перестраивается, и иначе она пересоздалась бы вместе с отчётом об импорте
  if (!data) return <div className="space-y-3"><SkeletonList rows={3} /><DataCard /></div>
  if (data.sets.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState title="Графикам нужны тренировки" text="После первых тренировок здесь появятся 1ПМ по упражнениям, объём по мышцам, посещаемость и рекорды." />
        <DataCard />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Charts data={data} today={today} byUse={byUse} exerciseId={exerciseId} setExerciseId={setExerciseId} group={group} setGroup={setGroup} />
      <DataCard />
    </div>
  )
}

function Charts({ data, today, byUse, exerciseId, setExerciseId, group, setGroup }: {
  data: NonNullable<ReturnType<typeof useAnalyticsData>>; today: string; byUse: Exercise[]
  exerciseId: string | null; setExerciseId: (v: string) => void; group: MuscleGroup; setGroup: (g: MuscleGroup) => void
}) {

  const selected = exerciseId ?? byUse[0]?.id
  const e1 = e1rmByDay(data.sets.filter((s) => s.exerciseId === selected))
  const weeks = lastWeeks(today, 8)
  const vol = volumeByWeek(data.sets, data.muscles, weeks)
  const att = attendanceByWeek(data.sessionDates, lastWeeks(today, 12))
  const cur = weekStats(data.sets, data.sessionDates, data.muscles, weekKey(today))
  const prev = weekStats(data.sets, data.sessionDates, data.muscles, addDays(weekKey(today), -7))
  const cmp = compareWeeks(cur, prev, (g) => MUSCLE_GROUP_RU[g])

  const bestRecords = new Map<string, { weight?: number; e1rm?: number; date: string }>()
  for (const r of data.prs) {
    const cur = bestRecords.get(r.exerciseId) ?? { date: r.achievedAt }
    if (r.kind === 'weight' && r.value > (cur.weight ?? 0)) Object.assign(cur, { weight: r.value, date: r.achievedAt })
    if (r.kind === 'e1rm' && r.value > (cur.e1rm ?? 0)) cur.e1rm = r.value
    bestRecords.set(r.exerciseId, cur)
  }

  return (
    <>
      <Card>
        <h2 className="mb-2 font-semibold">Расчётный 1ПМ</h2>
        <select aria-label="Упражнение" value={selected} onChange={(e) => setExerciseId(e.currentTarget.value)}
          className="mb-2 min-h-touch w-full rounded-card border border-border bg-raised px-3">
          {byUse.map((e) => <option key={e.id} value={e.id}>{e.nameRu}</option>)}
        </select>
        {e1.length >= 2 ? (
          <ProgressChart unit="кг" data={e1.map((p) => ({ label: shortDate(p.date), value: p.value }))} />
        ) : (
          <p className="text-sm text-fg-3">Нужно хотя бы две тренировки с этим упражнением. Сейчас: {e1[0] ? `${fmtKg(e1[0].value)} кг` : '—'}.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Объём по мышцам, 8 недель</h2>
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1">
          {MUSCLE_GROUPS.map((g) => (
            <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}
              className={`h-9 shrink-0 rounded-full px-3 text-sm ${group === g ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>{MUSCLE_GROUP_RU[g]}</button>
          ))}
        </div>
        <BarsChart unit="подх." band={VOLUME_TARGET[group]} data={vol.map((w) => ({ label: shortDate(w.week), value: w.volume[group] }))} />
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Посещаемость, тренировок в неделю</h2>
        <BarsChart unit="трен." data={att.map((w) => ({ label: shortDate(w.week), value: w.count }))} />
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Эта неделя против прошлой</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-fg-3"><th className="py-1 font-normal"></th><th className="font-normal">прошлая</th><th className="font-normal">эта</th><th className="text-right font-normal">±</th></tr></thead>
          <tbody>
            {cmp.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="py-2">{r.label}</td>
                <td className="tnum text-fg-3">{fmtKg(r.previous)}</td>
                <td className="tnum">{fmtKg(r.current)}</td>
                <td className={`tnum text-right ${r.delta > 0 ? 'text-success' : r.delta < 0 ? 'text-danger' : 'text-fg-3'}`}>{r.delta > 0 ? '+' : ''}{fmtKg(r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Рекорды</h2>
        {bestRecords.size === 0 ? (
          <p className="text-sm text-fg-3">Рекорды отмечаются со второй тренировки упражнения.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...bestRecords.entries()].map(([id, r]) => (
              <li key={id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">{data.exercises.get(id)?.nameRu ?? '—'}</span>
                <span className="tnum text-right">{r.weight ? `${RECORD_RU.weight} ${fmtKg(r.weight)} кг` : ''}{r.weight && r.e1rm ? ' · ' : ''}{r.e1rm ? `1ПМ ${fmtKg(r.e1rm)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
