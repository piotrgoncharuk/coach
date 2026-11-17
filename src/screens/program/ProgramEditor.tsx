import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildStarterProgram, describeTargets, LIMITATION_RU, type Limitation, type PlanExercise, type ProgramSnapshot } from '../../domain'
import { db } from '../../lib/db'
import { ensureExercises } from '../../lib/exerciseData'
import { activeProgram, loadSnapshot, resolveExercises, saveVersion } from '../../lib/program'
import { BackHeader } from '../../ui/BackHeader'
import { Badge, Button, Card, Field, Skeleton, Stepper } from '../../ui/components'
import { Sheet } from '../../ui/Sheet'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { formatMmSs } from '../../domain/timer'

/**
 * Редактор работает с черновиком. «Сохранить» создаёт новую версию программы,
 * прежняя остаётся в истории — к ней можно откатиться.
 */
export function ProgramEditor() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<ProgramSnapshot | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [picker, setPicker] = useState<number | null>(null)
  const [edit, setEdit] = useState<{ day: number; idx: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const program = await activeProgram()
      let snap = program && !params.get('starter') ? await loadSnapshot(program.id) : null
      if (!snap) {
        await ensureExercises()
        const profile = await db.profiles.toCollection().first()
        snap = (await resolveExercises(buildStarterProgram((profile?.limitations ?? []) as Limitation[]))).snapshot
      }
      const ex = await db.exercises.bulkGet(snap.days.flatMap((d) => d.exercises.map((e) => e.exercise)))
      setNames(new Map(ex.filter(Boolean).map((e) => [e!.id, e!.nameRu])))
      setDraft(snap)
    })()
  }, [params])

  if (!draft) return <div className="px-safe pt-16"><Skeleton className="h-64" /></div>

  const update = (fn: (d: ProgramSnapshot) => void) => setDraft((cur) => { const c = structuredClone(cur!); fn(c); return c })
  const move = (day: number, idx: number, dir: -1 | 1) => update((d) => {
    const list = d.days[day].exercises
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    ;[list[idx], list[j]] = [list[j], list[idx]]
  })

  async function saveDraft() {
    setBusy(true)
    await saveVersion(draft!)
    navigate('/program', { replace: true })
  }

  const editing = edit ? draft.days[edit.day].exercises[edit.idx] : null

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Изменить программу" />
      <div className="px-safe space-y-3">
        <Field label="Название программы" value={draft.name} onChange={(e) => { const v = e.currentTarget.value; update((d) => { d.name = v }) }} />
        {params.get('starter') && draft.notes && <p className="text-sm text-fg-3">{draft.notes}</p>}
        {draft.days.map((day, di) => (
          <Card key={di}>
            <div className="flex items-center gap-2">
              <input aria-label="Название дня" value={day.name} onChange={(e) => { const v = e.currentTarget.value; update((d) => { d.days[di].name = v }) }}
                className="min-h-touch min-w-0 flex-1 rounded-card bg-raised px-3 font-semibold" />
              <button aria-pressed={day.heavyLegs} onClick={() => update((d) => { d.days[di].heavyLegs = !d.days[di].heavyLegs })}
                className={`min-h-touch rounded-full px-3 text-sm ${day.heavyLegs ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-raised text-fg-3'}`}>
                тяжёлые ноги
              </button>
            </div>
            <ul className="mt-2 divide-y divide-border">
              {day.exercises.map((e, i) => (
                <li key={`${e.exercise}${i}`} className="flex items-center gap-1 py-1.5">
                  <button className="min-w-0 flex-1 py-1 text-left" onClick={() => setEdit({ day: di, idx: i })}>
                    <span className="block">{names.get(e.exercise) ?? e.exercise}</span>
                    <span className="block text-sm text-fg-3">{describeTargets(e)}</span>
                  </button>
                  <button aria-label="Выше" disabled={i === 0} onClick={() => move(di, i, -1)} className="size-touch text-fg-2 disabled:opacity-30">↑</button>
                  <button aria-label="Ниже" disabled={i === day.exercises.length - 1} onClick={() => move(di, i, 1)} className="size-touch text-fg-2 disabled:opacity-30">↓</button>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => setPicker(di)}>+ Упражнение</Button>
              <Button variant="ghost" onClick={() => update((d) => { d.days.splice(di, 1) })} disabled={draft.days.length <= 1}>Убрать день</Button>
            </div>
          </Card>
        ))}
        <Button className="w-full" onClick={() => update((d) => { d.days.push({ name: `День ${String.fromCharCode(65 + d.days.length)}`, heavyLegs: false, exercises: [] }) })}>+ День</Button>
        <Button variant="primary" size="action" disabled={busy} onClick={() => void saveDraft()}>Сохранить новой версией</Button>
        <p className="text-center text-xs text-fg-3">Прежняя версия останется в истории — к ней можно откатиться.</p>
      </div>

      <ExercisePicker open={picker !== null} onClose={() => setPicker(null)} onPick={(ex) => {
        setNames((m) => new Map(m).set(ex.id, ex.nameRu))
        update((d) => { d.days[picker!].exercises.push({ exercise: ex.id, sets: 3, repMin: 8, repMax: 12, rir: 2, restSec: ex.defaultRestSec ?? 120, cautious: ex.cautiousDefault }) })
        setPicker(null)
      }} />

      {edit && editing && (
        <TargetEditor value={editing} name={names.get(editing.exercise) ?? ''} onClose={() => setEdit(null)}
          onChange={(v) => update((d) => { d.days[edit.day].exercises[edit.idx] = v })}
          onRemove={() => { update((d) => { d.days[edit.day].exercises.splice(edit.idx, 1) }); setEdit(null) }} />
      )}
    </div>
  )
}

function TargetEditor({ value, name, onChange, onClose, onRemove }: {
  value: PlanExercise; name: string; onChange: (v: PlanExercise) => void; onClose: () => void; onRemove: () => void
}) {
  const set = (patch: Partial<PlanExercise>) => onChange({ ...value, ...patch })
  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="space-y-2">
        <Stepper label="Подходы" value={value.sets} step={1} min={1} max={10} onChange={(v) => set({ sets: v })} />
        <Stepper label="Повторы от" value={value.repMin} step={1} min={1} max={value.repMax} onChange={(v) => set({ repMin: v })} />
        <Stepper label="Повторы до" value={value.repMax} step={1} min={value.repMin} max={50} onChange={(v) => set({ repMax: v })} />
        <Stepper label="Запас" value={value.rir} step={1} min={0} max={4} onChange={(v) => set({ rir: v })} />
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-fg-3">Отдых</span>
          <button className="h-14 w-14 rounded-card border border-border bg-raised text-2xl" aria-label="Меньше отдыха" onClick={() => set({ restSec: Math.max(15, value.restSec - 15) })}>−</button>
          <output className="tnum flex h-14 flex-1 items-center justify-center rounded-card bg-raised text-3xl font-semibold">{formatMmSs(value.restSec)}</output>
          <button className="h-14 w-14 rounded-card border border-border bg-raised text-2xl" aria-label="Больше отдыха" onClick={() => set({ restSec: Math.min(600, value.restSec + 15) })}>+</button>
        </div>
        <button aria-pressed={!!value.cautious} onClick={() => set({ cautious: !value.cautious })}
          className={`flex min-h-touch w-full items-center justify-between rounded-card px-3 ${value.cautious ? 'bg-warn/15 text-warn' : 'bg-raised text-fg-2'}`}>
          <span>Осторожный режим</span>
          <Badge tone={value.cautious ? 'yellow' : 'neutral'}>{value.cautious ? 'вкл' : 'выкл'}</Badge>
        </button>
        <p className="text-xs text-fg-3">Шаг веса не больше 2,5 кг, запас повторов не меньше 2, без отказа. Для спины и задней поверхности бедра: {LIMITATION_RU.back.toLowerCase()}, {LIMITATION_RU.hamstring.toLowerCase()}.</p>
        <Field label="Заметка" value={value.notes ?? ''} onChange={(e) => set({ notes: e.currentTarget.value || null })} />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="danger" onClick={onRemove}>Убрать</Button>
          <Button variant="primary" onClick={onClose}>Готово</Button>
        </div>
      </div>
    </Sheet>
  )
}
