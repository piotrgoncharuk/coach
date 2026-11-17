import type { Exercise } from '../../lib/models'
import { ExerciseImage } from '../../ui/ExerciseImage'
import { exerciseSubtitle } from '../../lib/format'
import { Badge } from '../../ui/components'

export function ExerciseRow({ ex, onClick, right, hint }: { ex: Exercise; onClick: () => void; right?: React.ReactNode; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 py-2 text-left active:opacity-70">
      <ExerciseImage path={ex.imageStart} alt={ex.nameRu} className="size-14 shrink-0 rounded-card" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-base leading-snug">{ex.nameRu}</div>
        <div className="truncate text-sm text-fg-3">{hint ?? exerciseSubtitle(ex)}</div>
      </div>
      {ex.isCustom && <Badge tone="accent">своё</Badge>}
      {right}
    </button>
  )
}
