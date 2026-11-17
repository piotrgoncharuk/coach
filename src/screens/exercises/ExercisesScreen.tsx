import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { filterExercises } from '../../domain/search'
import type { MuscleGroup } from '../../domain/types'
import { useExercises } from '../../lib/exercises'
import { Button, EmptyState, Screen, SkeletonList } from '../../ui/components'
import { SyncBadge } from '../../ui/SyncBadge'
import { IconPlus } from '../../ui/icons'
import { ExerciseRow } from './ExerciseRow'
import { FilterChips } from './filters'
import { useExerciseLoad } from './useExerciseLoad'

const PAGE = 40

export function ExercisesScreen() {
  const navigate = useNavigate()
  const all = useExercises()
  const load = useExerciseLoad()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<MuscleGroup[]>([])
  const [equipment, setEquipment] = useState<string[]>([])
  const [strengthOnly, setStrengthOnly] = useState(true)
  const [limit, setLimit] = useState(PAGE)

  const list = useMemo(
    () => (all ? filterExercises(all, { query, groups, equipment, strengthOnly }) : []),
    [all, query, groups, equipment, strengthOnly],
  )

  return (
    <Screen
      title="Упражнения"
      action={
        <div className="flex items-center">
          <SyncBadge />
          <button aria-label="Своё упражнение" onClick={() => navigate('/exercises/new')} className="flex size-touch items-center justify-center text-accent">
            <IconPlus />
          </button>
        </div>
      }
    >
      <input
        type="search"
        inputMode="search"
        placeholder="Поиск: «жим», «squat», «бицепс»…"
        aria-label="Поиск упражнений"
        value={query}
        onChange={(e) => { setQuery(e.currentTarget.value); setLimit(PAGE) }}
        className="min-h-touch w-full rounded-card border border-border bg-raised px-3 text-fg placeholder:text-fg-3"
      />
      <FilterChips
        groups={groups} setGroups={(g) => { setGroups(g); setLimit(PAGE) }}
        equipment={equipment} setEquipment={(e) => { setEquipment(e); setLimit(PAGE) }}
        strengthOnly={strengthOnly} setStrengthOnly={setStrengthOnly}
      />

      {load.error && (
        <EmptyState
          title="Справочник не загрузился"
          text={`${load.error}. Нужна сеть один раз — дальше всё работает офлайн.`}
          action={<Button variant="primary" className="w-full" onClick={load.retry}>Повторить</Button>}
        />
      )}

      {!all || (all.length === 0 && load.loading) ? (
        <>
          <p className="text-sm text-fg-3" role="status">Загружаю справочник — это один раз…</p>
          <SkeletonList rows={6} />
        </>
      ) : list.length === 0 ? (
        <EmptyState
          title="Ничего не нашлось"
          text="Попробуй другое слово или сними фильтры. Нет нужного — добавь своё упражнение."
          action={<Button className="w-full" onClick={() => navigate('/exercises/new')}>Своё упражнение</Button>}
        />
      ) : (
        <>
          <p className="text-xs text-fg-3">{list.length} упр.</p>
          <ul className="divide-y divide-border">
            {list.slice(0, limit).map((ex) => (
              <li key={ex.id}>
                <ExerciseRow ex={ex} onClick={() => navigate(`/exercises/${ex.id}`)} />
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <Button className="w-full" onClick={() => setLimit((l) => l + PAGE * 2)}>
              Показать ещё ({list.length - limit})
            </Button>
          )}
        </>
      )}
    </Screen>
  )
}
