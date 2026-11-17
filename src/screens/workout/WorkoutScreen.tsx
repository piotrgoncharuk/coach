import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  afterSet, epley1RM, fmtKg, formatPerSide, minutesBetween, platesFor, warmupSets, weekKey, localDate,
  RECORD_RU, type RecordHit, type SetType,
} from '../../domain'
import { db, META, setMeta } from '../../lib/db'
import type { SessionExercise, SetRow } from '../../lib/models'
import {
  addExercise, deleteSet, prefillFor, recordSet, removeExercise, replaceExercise, startRest, stopRest,
  toggleSupersetWithNext, updateSet, abandonSession, type Prefill,
} from '../../lib/workout'
import { keepScreenAwake, releaseScreen } from '../../lib/wakelock'
import { unlockSound } from '../../lib/sound'
import { Badge, Button, ChipRow, EmptyState, Field, Skeleton, Stepper } from '../../ui/components'
import { ExerciseImage } from '../../ui/ExerciseImage'
import { RestTimerPanel } from '../../ui/RestTimer'
import { Confirm, Sheet } from '../../ui/Sheet'
import { IconClose, IconPlus } from '../../ui/icons'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { useActiveWorkout } from './useActiveWorkout'
import { StartWorkout } from './StartWorkout'
import { formatMmSs } from '../../domain/timer'

const SET_TYPES: { value: SetType; label: string }[] = [
  { value: 'work', label: 'Рабочий' },
  { value: 'warmup', label: 'Разминка' },
  { value: 'drop', label: 'Дроп' },
  { value: 'failure', label: 'До отказа' },
]

export function WorkoutScreen() {
  const w = useActiveWorkout()
  if (w === undefined) return <div className="px-safe pt-safe space-y-3 pt-16"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
  if (w === null) return <StartWorkout />
  return <ActiveWorkoutView w={w} />
}

function ActiveWorkoutView({ w }: { w: NonNullable<ReturnType<typeof useActiveWorkout>> }) {
  const navigate = useNavigate()
  const { session, exercises, sets, catalog, rest } = w
  const current = exercises.find((e) => e.id === w.currentId) ?? null
  const ex = current ? catalog.get(current.exerciseId) : undefined
  const profile = useLiveQuery(() => db.profiles.toCollection().first(), [])
  const deload = !!profile?.deloadStart && profile.deloadStart === weekKey(localDate())

  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(8)
  const [rir, setRir] = useState(2)
  const [type, setType] = useState<SetType>('work')
  const [note, setNote] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [toast, setToast] = useState<RecordHit[] | null>(null)
  const [picker, setPicker] = useState<'add' | 'replace' | null>(null)
  const [menu, setMenu] = useState(false)
  const [noteSheet, setNoteSheet] = useState(false)
  const [editSet, setEditSet] = useState<SetRow | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [, tick] = useState(0)

  const setsHere = useMemo(() => sets.filter((s) => s.sessionExerciseId === current?.id), [sets, current?.id])
  const workDone = setsHere.filter((s) => s.type !== 'warmup').length

  // экран не гаснет, пока идёт тренировка
  useEffect(() => {
    void keepScreenAwake()
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => { clearInterval(t); void releaseScreen() }
  }, [])

  // предзаполнение при смене упражнения и после каждого подхода
  useEffect(() => {
    if (!current) return
    let cancelled = false
    void prefillFor(current, deload).then((p) => {
      if (cancelled) return
      setPrefill(p)
      setWeight(p.weightKg)
      setReps(p.reps)
      setRir(p.rir)
      setType((t) => (t === 'warmup' ? 'warmup' : 'work'))
    })
    return () => { cancelled = true }
  }, [current?.id, setsHere.length, deload]) // eslint-disable-line react-hooks/exhaustive-deps

  async function record() {
    if (!current) return
    unlockSound() // звук на iOS разрешается только из касания
    const res = await recordSet({ sessionExerciseId: current.id, weightKg: weight, reps, rir, type, note })
    setNote(null)
    setFlash(true)
    setTimeout(() => setFlash(false), 600)
    if (res.records.length) {
      setToast(res.records)
      setTimeout(() => setToast(null), 3500)
    }
    if (type === 'warmup') return
    const nav = afterSet(exercises, current.id)
    if (nav.nextId !== current.id) await setMeta(META.currentExercise, nav.nextId)
    if (nav.startRest) await startRest(current.restSec ?? ex?.defaultRestSec ?? 120)
  }

  const select = (id: string) => void setMeta(META.currentExercise, id)
  const plates = platesFor(weight)
  const warmups = ex?.equipment === 'barbell' || ex?.equipment === 'dumbbell' ? warmupSets(weight, { hasBar: ex?.equipment === 'barbell' }) : []
  const bestPrev = prefill?.lastTime.length ? Math.max(...prefill.lastTime.filter((s) => s.type !== 'warmup').map((s) => epley1RM(s.weightKg, s.reps, s.rir)), 0) : 0
  const e1 = epley1RM(weight, reps, rir)
  const elapsed = minutesBetween(session.startedAt, new Date().toISOString())
  const dayName = useLiveQuery(async () => (session.programDayId ? (await db.programDays.get(session.programDayId))?.name : null), [session.programDayId])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="pt-safe px-safe shrink-0 border-b border-border">
        <div className="flex min-h-touch items-center justify-between gap-2 py-1">
          <button onClick={() => navigate('/')} aria-label="Свернуть тренировку" className="-ml-2 flex size-touch items-center justify-center text-fg-2">
            <IconClose />
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-semibold">{dayName ?? 'Тренировка'}{deload ? ' · разгрузка' : ''}</div>
            <div className="tnum text-xs text-fg-3">{elapsed} мин · {sets.filter((s) => s.type !== 'warmup').length} подх.</div>
          </div>
          <Button variant="ghost" onClick={() => navigate('/workout/finish')}>Завершить</Button>
        </div>
        {exercises.length > 0 && (
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2" aria-label="Упражнения тренировки">
            {exercises.map((e, i) => {
              const done = sets.filter((s) => s.sessionExerciseId === e.id && s.type !== 'warmup').length
              const full = e.targetSets ? done >= e.targetSets : false
              const active = e.id === current?.id
              return (
                <button key={e.id} onClick={() => select(e.id)} aria-current={active}
                  className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${active ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : full ? 'bg-success/15 text-success' : 'bg-raised text-fg-2'}`}>
                  {e.supersetGroup && <span aria-label="суперсет">⇄</span>}
                  <span className="max-w-32 truncate">{i + 1}. {catalog.get(e.exerciseId)?.nameRu ?? '…'}</span>
                  <span className="tnum text-xs">{done}/{e.targetSets ?? '–'}</span>
                </button>
              )
            })}
            <button onClick={() => setPicker('add')} aria-label="Добавить упражнение" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-fg-2"><IconPlus width={18} height={18} /></button>
          </nav>
        )}
      </header>

      <main className="px-safe min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-3">
        {!current || !ex ? (
          <EmptyState title="Упражнений пока нет" text="Добавь первое — вес и повторы подставятся из прошлых тренировок."
            action={<Button variant="primary" className="w-full" onClick={() => setPicker('add')}>Добавить упражнение</Button>} />
        ) : (
          <>
            <div className="rounded-card border border-border bg-surface p-4">
              <div className="flex gap-3">
                <button onClick={() => navigate(`/exercises/${ex.id}`)} aria-label={`Карточка: ${ex.nameRu}`}>
                  <ExerciseImage path={ex.imageStart} alt={ex.nameRu} className="size-16 shrink-0 rounded-card" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold leading-tight">{ex.nameRu}</h2>
                  <p className="text-sm text-fg-2">
                    {current.targetSets ?? 3} × {current.repMin ?? 8}–{current.repMax ?? 12} · запас {current.targetRir ?? 2} · отдых {formatMmSs(current.restSec ?? 120)}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-3">
                    {prefill?.lastTime.length
                      ? `Прошлый раз: ${prefill.lastTime.filter((s) => s.type !== 'warmup').map((s) => `${fmtKg(s.weightKg)}×${s.reps}`).join(', ')}`
                      : 'Первый раз — подбери рабочий вес'}
                  </p>
                </div>
                <button onClick={() => setMenu(true)} aria-label="Действия с упражнением" className="-mr-2 flex size-touch shrink-0 items-center justify-center text-fg-2">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
              </div>
              {current.note && <p className="mt-2 rounded-card bg-raised px-3 py-2 text-sm text-fg-2">{current.note}</p>}
              {prefill?.suggestion && workDone === 0 && (
                <div className="mt-3 rounded-card bg-accent-soft p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs uppercase tracking-wide text-accent">Подсказка</span>
                    {prefill.suggestion.weightKg !== null && (
                      <span className="tnum text-lg font-semibold text-accent">{fmtKg(deload ? prefill.weightKg : prefill.suggestion.weightKg)} кг × {prefill.suggestion.repTarget}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-fg-2">{deload ? 'Разгрузочная неделя: вес на 10% ниже. ' : ''}{prefill.suggestion.reason}</p>
                </div>
              )}
              {weight > 0 && ex.equipment === 'barbell' && (
                <p className="mt-3 text-sm text-fg-2"><span className="text-fg-3">Блины на сторону: </span>{formatPerSide(plates.perSide)}{plates.diffKg !== 0 && !plates.belowBar ? ` (${plates.diffKg > 0 ? '+' : ''}${fmtKg(plates.diffKg)} кг)` : ''}</p>
              )}
              {warmups.length > 0 && workDone === 0 && (
                <div className="mt-2">
                  <span className="text-xs text-fg-3">Разминка — нажми, чтобы подставить:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {warmups.map((w) => (
                      <button key={w.weightKg} onClick={() => { setWeight(w.weightKg); setReps(w.reps); setType('warmup') }}
                        className="tnum h-10 rounded-full bg-raised px-3 text-sm">{fmtKg(w.weightKg)}×{w.reps}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-card border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm text-fg-3">
                <span>Подходы</span>
                <span className="tnum">{workDone} из {current.targetSets ?? '–'}</span>
              </div>
              {setsHere.length === 0 ? (
                <p className="px-4 py-5 text-center text-sm text-fg-3">Вес и повторы уже подставлены — нажми «Записать подход».</p>
              ) : (
                <ul>
                  {setsHere.map((s, i) => (
                    <li key={s.id}>
                      <button onClick={() => setEditSet(s)} className="flex min-h-touch w-full items-center gap-3 border-b border-border px-4 py-2 text-left last:border-0">
                        <span className="w-5 text-sm text-fg-3">{i + 1}</span>
                        <span className="tnum flex-1">{fmtKg(s.weightKg)} кг × {s.reps}</span>
                        {s.rir !== null && s.type !== 'warmup' && <Badge>запас {s.rir}</Badge>}
                        {s.type !== 'work' && <Badge>{SET_TYPES.find((t) => t.value === s.type)?.label.toLowerCase()}</Badge>}
                        {s.isPr && <Badge tone="record">рекорд</Badge>}
                        {s.note && <span aria-label="есть заметка" className="text-fg-3">✎</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

      {toast && (
        <div role="status" className="animate-pop pointer-events-none fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-30 rounded-card bg-record px-4 py-3 text-center font-semibold text-on-accent shadow-lg">
          Рекорд: {toast.map((r) => `${RECORD_RU[r.kind]} ${fmtKg(r.value)}${r.kind === 'reps' ? '' : ' кг'}`).join(' · ')}
        </div>
      )}

      {current && ex && (
        <section className="pb-safe px-safe shrink-0 border-t border-border bg-surface pt-3 shadow-[var(--shadow-sheet)]">
          {rest ? (
            <RestTimerPanel
              state={rest}
              onAdd={(sec) => void setMeta(META.rest, { ...rest, durationSec: Math.max(0, rest.durationSec + sec) })}
              onSkip={() => void stopRest()}
            />
          ) : (
            <div className="space-y-2">
              <Stepper label="Вес" value={weight} step={2.5} min={0} max={500} unit="кг" decimals={1} onChange={setWeight} />
              <Stepper label="Повторы" value={reps} step={1} min={1} max={100} onChange={setReps} />
              <ChipRow label="Запас" value={rir} onChange={setRir} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
              <ChipRow label="Тип" value={type} onChange={setType} options={SET_TYPES} />
              <div className="flex items-center justify-between px-0.5 text-xs">
                <button onClick={() => setNoteSheet(true)} className="min-h-9 text-fg-3">{note ? `✎ ${note.slice(0, 24)}` : '+ заметка к подходу'}</button>
                <span className="text-fg-3">1ПМ <span className="tnum text-fg-2">{fmtKg(e1)} кг</span>{bestPrev > 0 && e1 > bestPrev && type !== 'warmup' && <Badge tone="record">будет рекорд</Badge>}</span>
              </div>
              <Button variant="primary" size="action" onClick={() => void record()} className={flash ? 'animate-pop' : ''} disabled={reps < 1}>
                {flash ? 'Записано ✓' : 'Записать подход'}
              </Button>
            </div>
          )}
        </section>
      )}

      <ExercisePicker
        open={picker !== null}
        replacing={picker === 'replace' ? ex : null}
        onClose={() => setPicker(null)}
        onPick={(picked) => {
          void (async () => {
            if (picker === 'replace' && current) await setMeta(META.currentExercise, await replaceExercise(current.id, picked.id))
            else await setMeta(META.currentExercise, (await addExercise(session.id, picked.id)).id)
            setPicker(null)
          })()
        }}
      />

      <ExerciseMenu
        open={menu} onClose={() => setMenu(false)} se={current} isLast={exercises.at(-1)?.id === current?.id}
        onReplace={() => { setMenu(false); setPicker('replace') }}
        onQuit={() => { setMenu(false); setConfirmQuit(true) }}
      />

      <Sheet open={noteSheet} onClose={() => setNoteSheet(false)} title="Заметка к подходу">
        <NoteForm initial={note ?? ''} onSave={(t) => { setNote(t || null); setNoteSheet(false) }} />
      </Sheet>

      <SetEditor set={editSet} onClose={() => setEditSet(null)} />

      <Confirm open={confirmQuit} title="Бросить тренировку?" danger confirm="Бросить"
        text="Записанные подходы сохранятся в истории как прерванная тренировка. Пустая тренировка удалится."
        onClose={() => setConfirmQuit(false)} onConfirm={() => void abandonSession(session.id).then(() => navigate('/'))} />
    </div>
  )
}

function ExerciseMenu({ open, onClose, se, isLast, onReplace, onQuit }: {
  open: boolean; onClose: () => void; se: SessionExercise | null; isLast: boolean; onReplace: () => void; onQuit: () => void
}) {
  if (!se) return null
  const item = 'flex min-h-touch w-full items-center rounded-card px-3 text-left active:bg-raised'
  return (
    <Sheet open={open} onClose={onClose} title="Упражнение">
      <div className="space-y-1">
        <button className={item} onClick={onReplace}>Заменить на аналог</button>
        {(!isLast || se.supersetGroup) && (
          <button className={item} onClick={() => { void toggleSupersetWithNext(se.id); onClose() }}>
            {se.supersetGroup ? 'Разорвать суперсет' : 'Суперсет со следующим'}
          </button>
        )}
        <div className="flex min-h-touch items-center justify-between px-3">
          <span>Отдых</span>
          <div className="flex items-center gap-2">
            <button aria-label="Меньше отдыха" className="size-touch rounded-card bg-raised" onClick={() => void saveRest(se, -15)}>−</button>
            <output className="tnum w-12 text-center">{formatMmSs(se.restSec ?? 120)}</output>
            <button aria-label="Больше отдыха" className="size-touch rounded-card bg-raised" onClick={() => void saveRest(se, 15)}>+</button>
          </div>
        </div>
        <button className={`${item} text-danger`} onClick={() => { void removeExercise(se.id); onClose() }}>Убрать из тренировки</button>
        <button className={`${item} text-fg-3`} onClick={onQuit}>Бросить тренировку…</button>
      </div>
    </Sheet>
  )
}

async function saveRest(se: SessionExercise, delta: number) {
  const { save } = await import('../../lib/repo')
  await save('sessionExercises', { id: se.id, restSec: Math.min(600, Math.max(15, (se.restSec ?? 120) + delta)) })
}

function NoteForm({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <div className="space-y-3">
      <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.currentTarget.value)}
        placeholder="Например: колено чуть ныло, хват шире"
        className="w-full rounded-card border border-border bg-raised px-3 py-2 placeholder:text-fg-3" />
      <Button variant="primary" className="w-full" onClick={() => onSave(text.trim())}>Готово</Button>
    </div>
  )
}

/** Правка записанного подхода: вес, повторы, запас, тип, заметка или удаление. */
export function SetEditor({ set, onClose }: { set: SetRow | null; onClose: () => void }) {
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(0)
  const [rir, setRir] = useState<number>(2)
  const [type, setType] = useState<SetType>('work')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!set) return
    setWeight(set.weightKg); setReps(set.reps); setRir(set.rir ?? 2); setType(set.type); setNote(set.note ?? '')
  }, [set])
  if (!set) return null
  return (
    <Sheet open onClose={onClose} title={`Подход ${set.setIndex}`}>
      <div className="space-y-2">
        <Stepper label="Вес" value={weight} step={2.5} min={0} max={500} unit="кг" decimals={1} onChange={setWeight} />
        <Stepper label="Повторы" value={reps} step={1} min={1} max={100} onChange={setReps} />
        <ChipRow label="Запас" value={rir} onChange={setRir} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
        <ChipRow label="Тип" value={type} onChange={setType} options={SET_TYPES} />
        <Field label="Заметка" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="danger" onClick={() => { void deleteSet(set.id); onClose() }}>Удалить</Button>
          <Button variant="primary" onClick={() => { void updateSet(set.id, { weightKg: weight, reps, rir, type, note: note.trim() || null }); onClose() }}>Сохранить</Button>
        </div>
      </div>
    </Sheet>
  )
}
