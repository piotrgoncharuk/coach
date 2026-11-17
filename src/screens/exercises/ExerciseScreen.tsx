import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { epley1RM, fmtKg, shortDate, localDate } from '../../domain'
import { MUSCLE_RU, EQUIPMENT_RU, type Equipment, type Muscle } from '../../domain/types'
import { db } from '../../lib/db'
import { deleteCustomExercise, savePref, useExercise, usePref } from '../../lib/exercises'
import { exerciseSets } from '../../lib/workout'
import { Badge, Button, Card, EmptyState, Skeleton } from '../../ui/components'
import { ExerciseImage } from '../../ui/ExerciseImage'
import { MuscleMap } from '../../ui/MuscleMap'
import { ProgressChart } from '../../ui/charts'
import { Confirm } from '../../ui/Sheet'
import { BackHeader } from '../../ui/BackHeader'
import { VideoBlock } from './VideoBlock'
import { formatMmSs } from '../../domain/timer'

export function ExerciseScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ex = useExercise(id)
  const pref = usePref(id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEn, setShowEn] = useState(false)

  const history = useLiveQuery(async () => {
    if (!id) return []
    const sets = (await exerciseSets(id)).filter((s) => s.type !== 'warmup')
    const byDay = new Map<string, typeof sets>()
    for (const s of sets) {
      const d = localDate(new Date(s.performedAt))
      byDay.set(d, [...(byDay.get(d) ?? []), s])
    }
    return [...byDay.entries()].map(([date, list]) => ({
      date, sets: list, best: Math.max(...list.map((s) => epley1RM(s.weightKg, s.reps, s.rir))),
    }))
  }, [id])

  const records = useLiveQuery(async () => (id ? (await db.personalRecords.where('exerciseId').equals(id).toArray()).filter((r) => !r.deletedAt) : []), [id])
  const bestByKind = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of records ?? []) out[r.kind] = Math.max(out[r.kind] ?? 0, r.value)
    return out
  }, [records])

  if (ex === undefined) return <div className="px-safe pt-safe space-y-3 pt-16"><Skeleton className="h-56" /><Skeleton className="h-24" /></div>
  if (ex === null) return <div className="px-safe pt-safe pt-16"><EmptyState title="Упражнение не найдено" action={<Button onClick={() => navigate('/exercises')}>К списку</Button>} /></div>

  const videoUrl = pref?.youtubeUrl ?? ex.youtubeUrl
  const rest = pref?.restSec ?? ex.defaultRestSec ?? 120
  const instructions = ex.instructionsRu.length ? ex.instructionsRu : ex.instructionsEn

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title={ex.nameRu} />
      <div className="px-safe space-y-3">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{ex.nameRu}</h1>
          {ex.nameEn && <p className="text-sm text-fg-3">{ex.nameEn}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{EQUIPMENT_RU[(ex.equipment ?? 'other') as Equipment] ?? ex.equipment}</Badge>
            {ex.cautiousDefault && <Badge tone="yellow">осторожно: поясница или бедро</Badge>}
            {ex.isCustom && <Badge tone="accent">своё упражнение</Badge>}
          </div>
        </div>

        {(ex.imageStart || ex.imageEnd) && (
          <div className="grid grid-cols-2 gap-2">
            {[ex.imageStart, ex.imageEnd].filter(Boolean).map((p, i) => (
              <figure key={p} className="overflow-hidden rounded-card border border-border">
                <ExerciseImage path={p} alt={`${ex.nameRu}: ${i === 0 ? 'начало' : 'конец'} движения`} className="aspect-square w-full" eager />
                <figcaption className="bg-surface py-1 text-center text-xs text-fg-3">{i === 0 ? 'начало' : 'конец'}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Видео техники</h2>
          <VideoBlock exerciseId={ex.id} nameRu={ex.nameRu} nameEn={ex.nameEn} url={videoUrl} />
        </Card>

        {(ex.cuesRu.length > 0 || ex.mistakesRu.length > 0) && (
          <Card>
            {ex.cuesRu.length > 0 && (
              <>
                <h2 className="mb-2 font-semibold">Главное в технике</h2>
                <ul className="space-y-1.5">
                  {ex.cuesRu.map((c) => <li key={c} className="flex gap-2 text-sm"><span className="text-success" aria-hidden>✓</span>{c}</li>)}
                </ul>
              </>
            )}
            {ex.mistakesRu.length > 0 && (
              <>
                <h2 className="mb-2 mt-4 font-semibold">Частые ошибки</h2>
                <ul className="space-y-1.5">
                  {ex.mistakesRu.map((c) => <li key={c} className="flex gap-2 text-sm"><span className="text-danger" aria-hidden>✕</span>{c}</li>)}
                </ul>
              </>
            )}
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Мышцы</h2>
          <div className="flex justify-center"><MuscleMap primary={ex.primaryMuscles} secondary={ex.secondaryMuscles} /></div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ex.primaryMuscles.map((m) => <Badge key={m} tone="accent">{MUSCLE_RU[m as Muscle] ?? m}</Badge>)}
            {ex.secondaryMuscles.map((m) => <Badge key={m}>{MUSCLE_RU[m as Muscle] ?? m}</Badge>)}
          </div>
        </Card>

        {instructions.length > 0 && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Как выполнять</h2>
              {ex.instructionsRu.length > 0 && ex.instructionsEn.length > 0 && (
                <button className="min-h-touch px-2 text-sm text-fg-3" onClick={() => setShowEn((v) => !v)}>{showEn ? 'по-русски' : 'оригинал'}</button>
              )}
            </div>
            {ex.instructionsRu.length === 0 && (
              <p className="mb-2 text-xs text-fg-3">Перевода этой инструкции пока нет — показываю оригинал на английском.</p>
            )}
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg-2">
              {(showEn ? ex.instructionsEn : instructions).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Мои настройки</h2>
          <label className="block">
            <span className="mb-1 block text-sm text-fg-2">Заметка: тренажёр, хват, сиденье</span>
            <textarea
              key={pref?.id ?? 'new'}
              defaultValue={pref?.note ?? ''}
              rows={2}
              placeholder="Например: сиденье на 4, хват на ширине плеч"
              onBlur={(e) => void savePref(ex.id, { note: e.currentTarget.value.trim() || null })}
              className="w-full rounded-card border border-border bg-raised px-3 py-2 placeholder:text-fg-3"
            />
          </label>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-fg-2">Отдых после подхода</span>
            <div className="flex items-center gap-2">
              <button aria-label="Меньше отдыха" className="size-touch rounded-card bg-raised text-lg" onClick={() => void savePref(ex.id, { restSec: Math.max(30, rest - 15) })}>−</button>
              <output className="tnum w-14 text-center text-lg">{formatMmSs(rest)}</output>
              <button aria-label="Больше отдыха" className="size-touch rounded-card bg-raised text-lg" onClick={() => void savePref(ex.id, { restSec: Math.min(600, rest + 15) })}>+</button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Моя история</h2>
          {!history || history.length === 0 ? (
            <p className="text-sm text-fg-3">Подходов пока нет. После первой тренировки здесь появится график расчётного 1ПМ.</p>
          ) : (
            <>
              {(bestByKind.weight || bestByKind.e1rm) && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Stat label="Рекорд веса" value={bestByKind.weight ? `${fmtKg(bestByKind.weight)} кг` : '—'} />
                  <Stat label="Лучший 1ПМ" value={`${fmtKg(Math.max(bestByKind.e1rm ?? 0, ...history.map((h) => h.best)))} кг`} />
                </div>
              )}
              {history.length >= 2 && <ProgressChart unit="кг" data={history.map((h) => ({ label: shortDate(h.date), value: h.best }))} />}
              <ul className="mt-2 divide-y divide-border">
                {[...history].reverse().slice(0, 8).map((h) => (
                  <li key={h.date} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="text-fg-3">{shortDate(h.date)}</span>
                    <span className="tnum flex-1 text-right">
                      {h.sets.map((s) => `${fmtKg(s.weightKg)}×${s.reps}`).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {ex.isCustom && (
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => navigate(`/exercises/${ex.id}/edit`)}>Изменить</Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>Удалить</Button>
          </div>
        )}
      </div>
      <Confirm
        open={confirmDelete}
        title="Удалить упражнение?"
        text="Оно пропадёт из справочника. Подходы, уже записанные с ним, останутся в истории."
        confirm="Удалить"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { void deleteCustomExercise(ex.id).then(() => navigate('/exercises')) }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-raised px-3 py-2">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="tnum text-lg font-semibold">{value}</div>
    </div>
  )
}
