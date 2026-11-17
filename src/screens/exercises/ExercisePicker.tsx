import { useMemo, useState } from 'react'
import { findAlternatives } from '../../domain/alternatives'
import { filterExercises } from '../../domain/search'
import type { MuscleGroup } from '../../domain/types'
import { useExercises } from '../../lib/exercises'
import type { Exercise } from '../../lib/models'
import { SkeletonList } from '../../ui/components'
import { Sheet } from '../../ui/Sheet'
import { ExerciseRow } from './ExerciseRow'
import { FilterChips } from './filters'

/**
 * Выбор упражнения в шторке. В режиме замены сначала показывает аналоги:
 * те же мышцы, то же оборудование — выше.
 */
export function ExercisePicker({
  open, onClose, onPick, replacing, title,
}: {
  open: boolean
  onClose: () => void
  onPick: (ex: Exercise) => void
  replacing?: Exercise | null
  title?: string
}) {
  const all = useExercises()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<MuscleGroup[]>([])
  const [equipment, setEquipment] = useState<string[]>([])
  const [strengthOnly, setStrengthOnly] = useState(true)
  const [sameEquipment, setSameEquipment] = useState(false)

  const alternatives = useMemo(
    () => (all && replacing && !query ? findAlternatives(replacing, all, { sameEquipmentOnly: sameEquipment, limit: 20 }) : []),
    [all, replacing, query, sameEquipment],
  )
  const list = useMemo(
    () => (all ? filterExercises(all, { query, groups, equipment, strengthOnly }).slice(0, 60) : []),
    [all, query, groups, equipment, strengthOnly],
  )

  return (
    <Sheet open={open} onClose={onClose} title={title ?? (replacing ? 'Заменить на аналог' : 'Добавить упражнение')}>
      <div className="space-y-3">
        <input
          type="search"
          placeholder="Поиск"
          aria-label="Поиск упражнения"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className="min-h-touch w-full rounded-card border border-border bg-raised px-3 placeholder:text-fg-3"
        />
        {!all ? (
          <SkeletonList rows={4} />
        ) : replacing && !query ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-fg-3">Аналоги для «{replacing.nameRu}»</p>
              <button aria-pressed={sameEquipment} onClick={() => setSameEquipment((v) => !v)}
                className={`h-9 rounded-full px-3 text-xs ${sameEquipment ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`}>
                то же оборудование
              </button>
            </div>
            {alternatives.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-3">Аналогов не нашлось — найди упражнение поиском.</p>
            ) : (
              <ul className="divide-y divide-border">
                {alternatives.map((a) => (
                  <li key={a.exercise.id}><ExerciseRow ex={a.exercise} hint={a.reason} onClick={() => onPick(a.exercise)} /></li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <FilterChips groups={groups} setGroups={setGroups} equipment={equipment} setEquipment={setEquipment} strengthOnly={strengthOnly} setStrengthOnly={setStrengthOnly} />
            <ul className="divide-y divide-border">
              {list.map((ex) => <li key={ex.id}><ExerciseRow ex={ex} onClick={() => onPick(ex)} /></li>)}
            </ul>
            {list.length === 0 && <p className="py-6 text-center text-sm text-fg-3">Ничего не нашлось</p>}
          </>
        )}
      </div>
    </Sheet>
  )
}
