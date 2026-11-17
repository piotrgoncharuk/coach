/**
 * Программа как снимок: дни и упражнения с целями. Версии программы — это
 * снимки; откат создаёт новую версию из старого снимка, история не теряется.
 */
export interface PlanExercise {
  /** UUID упражнения или id базы (slug) — шаблоны пишутся через slug. */
  exercise: string
  sets: number
  repMin: number
  repMax: number
  rir: number
  restSec: number
  cautious?: boolean
  incrementKg?: number | null
  supersetGroup?: string | null
  notes?: string | null
}

export interface PlanDay {
  name: string
  focus?: string | null
  heavyLegs: boolean
  exercises: PlanExercise[]
}

export interface ProgramSnapshot {
  name: string
  notes?: string | null
  days: PlanDay[]
}

export type Limitation = 'back' | 'hamstring' | 'knees' | 'shoulders'

export const LIMITATION_RU: Record<Limitation, string> = {
  back: 'Спина, поясница',
  hamstring: 'Задняя поверхность бедра',
  knees: 'Колени',
  shoulders: 'Плечи',
}

const ex = (exercise: string, sets: number, repMin: number, repMax: number, rir: number, restSec: number, extra: Partial<PlanExercise> = {}): PlanExercise => ({
  exercise, sets, repMin, repMax, rir, restSec, ...extra,
})

/**
 * Стартовая программа: 3 дня на всё тело, сила и масса, ноги включены.
 *  • A — присед и жим, тяжёлые ноги;
 *  • B — румынская тяга и выпады, тяжёлые ноги, бережная работа на спину;
 *  • C — верх тела без тяжёлых ног: удобно ставить накануне футбола.
 *
 * Ограничения меняют программу:
 *  • спина — тяги только с опорой, гиперэкстензия и румынская тяга в осторожном
 *    режиме, корпус — антиротация (Паллоф) и «мёртвый жук»;
 *  • задняя поверхность бедра — сгибания ног и румынская тяга в осторожном
 *    режиме: шаг 2,5 кг, запас не меньше 2, без отказа;
 *  • колени — вместо приседа со штангой гоблет-присед, вместо выпадов жим ногами;
 *  • плечи — вместо брусьев жим гантелей, жим над головой в осторожном режиме.
 */
export function buildStarterProgram(limitations: Limitation[] = []): ProgramSnapshot {
  const has = (l: Limitation) => limitations.includes(l)
  const back = has('back')
  const hams = has('hamstring')
  const knees = has('knees')
  const shoulders = has('shoulders')

  const dayA: PlanDay = {
    name: 'День A',
    focus: 'Присед и жим',
    heavyLegs: true,
    exercises: [
      knees ? ex('Goblet_Squat', 3, 8, 12, 2, 150, { cautious: true }) : ex('Barbell_Squat', 3, 6, 8, 2, 180, { cautious: back }),
      ex('Barbell_Bench_Press_-_Medium_Grip', 3, 6, 10, 2, 150, { cautious: shoulders }),
      ex('One-Arm_Dumbbell_Row', 3, 8, 12, 2, 90),
      ex('Lying_Leg_Curls', 3, 10, 15, 2, 90, { cautious: hams }),
      ex('Side_Lateral_Raise', 3, 12, 20, 1, 60),
      ex('Dead_Bug', 3, 8, 12, 3, 60, { notes: 'повтор = обе стороны' }),
    ],
  }

  const dayB: PlanDay = {
    name: 'День B',
    focus: 'Тяга и выпады',
    heavyLegs: true,
    exercises: [
      ex('Romanian_Deadlift', 3, 8, 10, back || hams ? 3 : 2, 150, { cautious: back || hams, incrementKg: 2.5 }),
      ex('Incline_Dumbbell_Press', 3, 8, 12, 2, 120, { cautious: shoulders }),
      ex('Wide-Grip_Lat_Pulldown', 3, 8, 12, 2, 120),
      knees ? ex('Leg_Press', 3, 10, 15, 2, 120, { cautious: true }) : ex('Split_Squat_with_Dumbbells', 3, 8, 12, 2, 90, { notes: 'повторы на каждую ногу' }),
      ex('Face_Pull', 3, 12, 20, 2, 60),
      ex('Hyperextensions_Back_Extensions', 3, 10, 15, 3, 90, { cautious: back || hams }),
    ],
  }

  const dayC: PlanDay = {
    name: 'День C',
    focus: 'Верх тела, без тяжёлых ног',
    heavyLegs: false,
    exercises: [
      ex('Dumbbell_Shoulder_Press', 3, 8, 12, 2, 120, { cautious: shoulders }),
      ex('Pullups', 3, 6, 10, 2, 150, { notes: 'вес — дополнительный груз на поясе' }),
      shoulders ? ex('Dumbbell_Bench_Press', 3, 8, 12, 2, 120) : ex('Parallel_Bar_Dip', 3, 8, 12, 2, 120, { notes: 'вес — дополнительный груз' }),
      ex('Seated_Cable_Rows', 3, 10, 12, 2, 90),
      ex('Hammer_Curls', 3, 10, 15, 1, 60, { supersetGroup: 'C1' }),
      ex('Triceps_Pushdown_-_Rope_Attachment', 3, 10, 15, 1, 60, { supersetGroup: 'C1' }),
      ex('Pallof_Press', 3, 10, 12, 2, 60, { notes: 'повторы на каждую сторону' }),
    ],
  }

  return {
    name: 'Всё тело ×3',
    notes: limitations.length
      ? `Учтены ограничения: ${limitations.map((l) => LIMITATION_RU[l].toLowerCase()).join(', ')}.`
      : null,
    days: [dayA, dayB, dayC],
  }
}

// ─── сравнение версий ───────────────────────────────────────────────────────
export type DiffKind = 'added' | 'removed' | 'changed'

export interface DiffLine {
  kind: DiffKind
  day: string
  exercise: string | null
  before: string | null
  after: string | null
}

export function describeTargets(e: PlanExercise): string {
  const parts = [`${e.sets} × ${e.repMin}–${e.repMax}`, `запас ${e.rir}`, `отдых ${Math.round(e.restSec / 60 * 10) / 10} мин`.replace('.', ',')]
  if (e.cautious) parts.push('осторожно')
  if (e.supersetGroup) parts.push('суперсет')
  return parts.join(' · ')
}

/**
 * Разница «было/стало» по дням: добавленные, убранные и изменённые упражнения
 * и изменения самих дней. nameOf переводит id упражнения в название.
 */
export function diffSnapshots(before: ProgramSnapshot, after: ProgramSnapshot, nameOf: (id: string) => string): DiffLine[] {
  const out: DiffLine[] = []
  const n = Math.max(before.days.length, after.days.length)
  for (let i = 0; i < n; i++) {
    const a = before.days[i]
    const b = after.days[i]
    if (!a && b) {
      out.push({ kind: 'added', day: b.name, exercise: null, before: null, after: `${b.exercises.length} упражнений` })
      continue
    }
    if (a && !b) {
      out.push({ kind: 'removed', day: a.name, exercise: null, before: `${a.exercises.length} упражнений`, after: null })
      continue
    }
    if (!a || !b) continue
    if (a.name !== b.name) out.push({ kind: 'changed', day: b.name, exercise: null, before: `название «${a.name}»`, after: `название «${b.name}»` })
    if (a.heavyLegs !== b.heavyLegs) out.push({ kind: 'changed', day: b.name, exercise: null, before: a.heavyLegs ? 'тяжёлые ноги' : 'без тяжёлых ног', after: b.heavyLegs ? 'тяжёлые ноги' : 'без тяжёлых ног' })

    const bIds = new Set(b.exercises.map((e) => e.exercise))
    const aIds = new Set(a.exercises.map((e) => e.exercise))
    for (const e of a.exercises) if (!bIds.has(e.exercise)) out.push({ kind: 'removed', day: b.name, exercise: nameOf(e.exercise), before: describeTargets(e), after: null })
    for (const e of b.exercises) {
      if (!aIds.has(e.exercise)) {
        out.push({ kind: 'added', day: b.name, exercise: nameOf(e.exercise), before: null, after: describeTargets(e) })
        continue
      }
      const old = a.exercises.find((x) => x.exercise === e.exercise)!
      const was = describeTargets(old)
      const now = describeTargets(e)
      if (was !== now || (old.notes ?? '') !== (e.notes ?? '')) out.push({ kind: 'changed', day: b.name, exercise: nameOf(e.exercise), before: was, after: now })
    }
    const orderA = a.exercises.map((e) => e.exercise).filter((x) => bIds.has(x))
    const orderB = b.exercises.map((e) => e.exercise).filter((x) => aIds.has(x))
    if (orderA.join() !== orderB.join()) out.push({ kind: 'changed', day: b.name, exercise: null, before: 'прежний порядок', after: 'новый порядок упражнений' })
  }
  return out
}
