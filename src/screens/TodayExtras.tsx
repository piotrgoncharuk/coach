import { ReadinessCard } from './progress/ReadinessCard'
import { ProteinCard } from './progress/ProteinCard'
import { CoachNoteCard } from './coach/CoachNoteCard'

/** Готовность, питание за день и последняя заметка тренера. */
export function TodayExtras() {
  return (
    <>
      <ReadinessCard compact />
      <ProteinCard />
      <CoachNoteCard />
    </>
  )
}
