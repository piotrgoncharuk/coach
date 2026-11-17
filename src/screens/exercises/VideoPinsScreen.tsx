import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/db'
import { alive } from '../../lib/workout'
import { Badge, EmptyState, SkeletonList } from '../../ui/components'
import { BackHeader } from '../../ui/BackHeader'
import { VideoBlock } from './VideoBlock'

/**
 * Отдельный шаг из задания: список упражнений моей программы, к которым ещё не
 * закреплено видео. Ссылки я не подбираю — только поиск и поле для вставки.
 */
export function VideoPinsScreen() {
  const navigate = useNavigate()
  const items = useLiveQuery(async () => {
    const program = alive(await db.programs.toArray()).find((p) => p.isActive)
    let ids: string[] = []
    if (program) {
      const days = alive(await db.programDays.where('programId').equals(program.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
      for (const d of days) {
        const pe = alive(await db.programExercises.where('programDayId').equals(d.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
        ids.push(...pe.map((p) => p.exerciseId))
      }
    }
    if (ids.length === 0) {
      const counts = new Map<string, number>()
      for (const s of alive(await db.sets.toArray())) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1)
      ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id)
    }
    ids = [...new Set(ids)]
    const ex = await db.exercises.bulkGet(ids)
    const prefs = alive(await db.userExercisePrefs.toArray())
    return ex.filter(Boolean).map((e) => ({ ex: e!, url: prefs.find((p) => p.exerciseId === e!.id)?.youtubeUrl ?? e!.youtubeUrl, fromProgram: !!program }))
  }, [])

  const missing = items?.filter((i) => !i.url) ?? []
  const pinned = items?.filter((i) => i.url) ?? []

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Видео для программы" />
      <div className="px-safe space-y-3">
        <h1 className="text-xl font-semibold">Видео для программы</h1>
        <p className="text-sm text-fg-2">
          Найди ролик с техникой, скопируй ссылку и вставь — дальше видео играет прямо в карточке упражнения.
          {pinned.length > 0 && ` Закреплено ${pinned.length} из ${items!.length}.`}
        </p>
        {!items ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title="Пока не из чего выбирать" text="Список появится, когда будет программа или первые тренировки." />
        ) : (
          <>
            {missing.map(({ ex }) => (
              <div key={ex.id} className="rounded-card border border-border bg-surface p-4">
                <button onClick={() => navigate(`/exercises/${ex.id}`)} className="mb-2 text-left font-semibold">{ex.nameRu}</button>
                <VideoBlock exerciseId={ex.id} nameRu={ex.nameRu} nameEn={ex.nameEn} url={null} />
              </div>
            ))}
            {pinned.length > 0 && (
              <ul className="divide-y divide-border rounded-card border border-border bg-surface">
                {pinned.map(({ ex }) => (
                  <li key={ex.id}>
                    <button onClick={() => navigate(`/exercises/${ex.id}`)} className="flex min-h-touch w-full items-center justify-between px-4 text-left">
                      <span>{ex.nameRu}</span>
                      <Badge tone="green">видео есть</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
