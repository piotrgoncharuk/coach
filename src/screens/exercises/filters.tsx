import { EQUIPMENT_RU, MUSCLE_GROUP_RU, MUSCLE_GROUPS, type MuscleGroup } from '../../domain/types'

export const EQUIPMENT_OPTIONS = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'e-z curl bar', 'bands', 'other'] as const

export function FilterChips({
  groups, setGroups, equipment, setEquipment, strengthOnly, setStrengthOnly,
}: {
  groups: MuscleGroup[]; setGroups: (g: MuscleGroup[]) => void
  equipment: string[]; setEquipment: (e: string[]) => void
  strengthOnly: boolean; setStrengthOnly: (v: boolean) => void
}) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (active: boolean) =>
    `h-10 shrink-0 rounded-full px-3.5 text-sm ${active ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent' : 'bg-raised text-fg-2'}`

  return (
    <div className="space-y-2">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Группы мышц">
        {MUSCLE_GROUPS.map((g) => (
          <button key={g} aria-pressed={groups.includes(g)} className={chip(groups.includes(g))} onClick={() => setGroups(toggle(groups, g))}>
            {MUSCLE_GROUP_RU[g]}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Оборудование">
        <button aria-pressed={!strengthOnly} className={chip(!strengthOnly)} onClick={() => setStrengthOnly(!strengthOnly)}>
          + растяжка и кардио
        </button>
        {EQUIPMENT_OPTIONS.map((e) => (
          <button key={e} aria-pressed={equipment.includes(e)} className={chip(equipment.includes(e))} onClick={() => setEquipment(toggle(equipment, e))}>
            {EQUIPMENT_RU[e]}
          </button>
        ))}
      </div>
    </div>
  )
}
