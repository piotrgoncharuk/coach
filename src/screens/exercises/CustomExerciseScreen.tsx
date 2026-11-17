import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EQUIPMENT_RU, MUSCLE_RU, MUSCLES, type Equipment } from '../../domain/types'
import { saveCustomExercise, useExercise } from '../../lib/exercises'
import { Button, Card, Field } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'
import { EQUIPMENT_OPTIONS } from './filters'

export function CustomExerciseScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useExercise(id)
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<string[]>([])
  const [secondary, setSecondary] = useState<string[]>([])
  const [equipment, setEquipment] = useState<string>('machine')
  const [photo, setPhoto] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!existing) return
    setName(existing.nameRu)
    setPrimary(existing.primaryMuscles)
    setSecondary(existing.secondaryMuscles)
    setEquipment(existing.equipment ?? 'other')
    setNote(existing.instructionsRu[0] ?? '')
  }, [existing])

  const cycle = (m: string) => {
    if (primary.includes(m)) { setPrimary(primary.filter((x) => x !== m)); setSecondary([...secondary, m]) }
    else if (secondary.includes(m)) setSecondary(secondary.filter((x) => x !== m))
    else setPrimary([...primary, m])
  }

  async function submit() {
    setBusy(true)
    const ex = await saveCustomExercise({ id, nameRu: name, primaryMuscles: primary, secondaryMuscles: secondary, equipment, photo, note: note.trim() || undefined })
    setBusy(false)
    navigate(`/exercises/${ex.id}`, { replace: true })
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title={id ? 'Изменить упражнение' : 'Своё упражнение'} />
      <div className="px-safe space-y-3">
        <Card>
          <div className="space-y-3">
            <Field label="Название" placeholder="Например: Тяга в тренажёре «Hammer»" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <div>
              <span className="mb-1 block text-sm text-fg-2">Оборудование</span>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_OPTIONS.map((e) => (
                  <button key={e} aria-pressed={equipment === e} onClick={() => setEquipment(e)}
                    className={`h-10 rounded-full px-3.5 text-sm ${equipment === e ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>
                    {EQUIPMENT_RU[e as Equipment]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Мышцы</h2>
          <p className="mb-2 text-xs text-fg-3">Нажми один раз — основная, второй — вспомогательная, третий — убрать.</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map((m) => {
              const state = primary.includes(m) ? 'p' : secondary.includes(m) ? 's' : ''
              return (
                <button key={m} onClick={() => cycle(m)}
                  className={`h-10 rounded-full px-3.5 text-sm ${state === 'p' ? 'bg-accent font-semibold text-black' : state === 's' ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>
                  {MUSCLE_RU[m]}
                </button>
              )
            })}
          </div>
        </Card>
        <Card>
          <label className="block">
            <span className="mb-1 block text-sm text-fg-2">Фото (необязательно)</span>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.currentTarget.files?.[0] ?? null)} className="block w-full text-sm text-fg-2 file:mr-3 file:min-h-touch file:rounded-card file:border-0 file:bg-raised file:px-4 file:text-fg" />
            <span className="mt-1 block text-xs text-fg-3">Фото сжимается на телефоне и хранится только на нём, пока не подключено облачное хранилище.</span>
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-fg-2">Как выполнять</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} className="w-full rounded-card border border-border bg-raised px-3 py-2" />
          </label>
        </Card>
        <Button variant="primary" size="action" disabled={busy || !name.trim() || primary.length === 0} onClick={() => void submit()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </Button>
        {!name.trim() || primary.length === 0 ? <p className="text-center text-xs text-fg-3">Нужны название и хотя бы одна основная мышца</p> : null}
      </div>
    </div>
  )
}
