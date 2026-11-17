/**
 * Правка программы от тренера. Один формат для MCP-инструмента
 * propose_program_change и для поля «Вставить правку от тренера».
 *
 * Файл самодостаточный (без импортов): его используют и приложение,
 * и Edge Function на Deno.
 */

export interface SnapshotExercise {
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

export interface SnapshotDay {
  name: string
  focus?: string | null
  heavyLegs: boolean
  exercises: SnapshotExercise[]
}

export interface Snapshot {
  name: string
  notes?: string | null
  days: SnapshotDay[]
}

export type DayRef = number | string

export type Change =
  | { op: 'update_exercise'; day: DayRef; exercise: string; sets?: number; rep_min?: number; rep_max?: number; rir?: number; rest_sec?: number; cautious?: boolean; notes?: string | null }
  | { op: 'add_exercise'; day: DayRef; exercise: string; sets: number; rep_min: number; rep_max: number; rir: number; rest_sec?: number; cautious?: boolean; notes?: string | null; position?: number }
  | { op: 'remove_exercise'; day: DayRef; exercise: string }
  | { op: 'replace_exercise'; day: DayRef; exercise: string; with: string }
  | { op: 'move_exercise'; day: DayRef; exercise: string; position: number }
  | { op: 'update_day'; day: DayRef; name?: string; heavy_legs?: boolean }

export interface Proposal {
  title: string
  rationale: string | null
  changes: Change[]
}

export const OPS = ['update_exercise', 'add_exercise', 'remove_exercise', 'replace_exercise', 'move_exercise', 'update_day'] as const

/** JSON Schema для MCP-инструмента — та же структура, что проверяет validateStructure. */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  required: ['title', 'changes'],
  properties: {
    title: { type: 'string', description: 'Короткий заголовок правки по-русски' },
    rationale: { type: 'string', description: 'Почему: данные, на которые опирается правка' },
    changes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['op', 'day'],
        properties: {
          op: { type: 'string', enum: [...OPS] },
          day: { description: 'Номер дня программы с 1 или его название («День A»)', oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] },
          exercise: { type: 'string', description: 'exercise_id, slug из get_program или название' },
          with: { type: 'string', description: 'Для replace_exercise: на что заменить' },
          sets: { type: 'integer', minimum: 1, maximum: 10 },
          rep_min: { type: 'integer', minimum: 1, maximum: 50 },
          rep_max: { type: 'integer', minimum: 1, maximum: 50 },
          rir: { type: 'integer', minimum: 0, maximum: 4 },
          rest_sec: { type: 'integer', minimum: 15, maximum: 600 },
          cautious: { type: 'boolean' },
          notes: { type: 'string' },
          position: { type: 'integer', minimum: 1, description: 'Место в дне, с 1' },
          name: { type: 'string', description: 'Для update_day: новое название' },
          heavy_legs: { type: 'boolean', description: 'Для update_day: тяжёлые ноги' },
        },
      },
    },
  },
} as const

const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/**
 * Проверка структуры без знания программы. Все ошибки сразу, с указанием
 * места — модели проще исправиться за один заход.
 */
export function validateStructure(input: unknown): { proposal: Proposal | null; errors: string[] } {
  const errors: string[] = []
  const p = input as Record<string, unknown>
  if (!p || typeof p !== 'object') return { proposal: null, errors: ['Правка должна быть JSON-объектом с полями title и changes.'] }
  if (typeof p.title !== 'string' || !p.title.trim()) errors.push('title: нужен короткий заголовок.')
  if (!Array.isArray(p.changes) || p.changes.length === 0) errors.push('changes: нужен непустой массив изменений.')
  const changes = Array.isArray(p.changes) ? p.changes : []
  changes.forEach((raw, i) => {
    const c = raw as Record<string, unknown>
    const at = `changes[${i}]`
    if (!c || typeof c !== 'object') return void errors.push(`${at}: должен быть объектом.`)
    if (!OPS.includes(c.op as (typeof OPS)[number])) return void errors.push(`${at}.op: одно из ${OPS.join(', ')}.`)
    if (!(isInt(c.day, 1, 20) || (typeof c.day === 'string' && c.day.trim()))) errors.push(`${at}.day: номер дня с 1 или название.`)
    if (c.op !== 'update_day' && (typeof c.exercise !== 'string' || !c.exercise.trim())) errors.push(`${at}.exercise: какое упражнение.`)
    if (c.op === 'replace_exercise' && (typeof c.with !== 'string' || !c.with.trim())) errors.push(`${at}.with: на что заменить.`)
    if (c.op === 'move_exercise' && !isInt(c.position, 1, 50)) errors.push(`${at}.position: место с 1.`)
    if (c.op === 'add_exercise') {
      for (const k of ['sets', 'rep_min', 'rep_max', 'rir'] as const) if (c[k] === undefined) errors.push(`${at}.${k}: обязательно для add_exercise.`)
    }
    if (c.sets !== undefined && !isInt(c.sets, 1, 10)) errors.push(`${at}.sets: от 1 до 10.`)
    if (c.rep_min !== undefined && !isInt(c.rep_min, 1, 50)) errors.push(`${at}.rep_min: от 1 до 50.`)
    if (c.rep_max !== undefined && !isInt(c.rep_max, 1, 50)) errors.push(`${at}.rep_max: от 1 до 50.`)
    if (isInt(c.rep_min, 1, 50) && isInt(c.rep_max, 1, 50) && (c.rep_min as number) > (c.rep_max as number)) errors.push(`${at}: rep_min больше rep_max.`)
    if (c.rir !== undefined && !isInt(c.rir, 0, 4)) errors.push(`${at}.rir: от 0 до 4.`)
    if (c.rest_sec !== undefined && !isInt(c.rest_sec, 15, 600)) errors.push(`${at}.rest_sec: от 15 до 600 секунд.`)
    if (c.cautious !== undefined && typeof c.cautious !== 'boolean') errors.push(`${at}.cautious: true или false.`)
    if (c.op === 'update_day' && c.name === undefined && c.heavy_legs === undefined) errors.push(`${at}: для update_day нужно name или heavy_legs.`)
  })
  if (errors.length) return { proposal: null, errors }
  return {
    proposal: {
      title: (p.title as string).trim(),
      rationale: typeof p.rationale === 'string' && p.rationale.trim() ? p.rationale.trim() : null,
      changes: changes as Change[],
    },
    errors,
  }
}

/** День по номеру с 1 или по названию: «День A», «A», «день a». */
export function findDay(snapshot: Snapshot, ref: DayRef): number {
  if (typeof ref === 'number') return ref >= 1 && ref <= snapshot.days.length ? ref - 1 : -1
  const norm = (s: string) => s.toLowerCase().replace(/^день\s*/, '').trim()
  return snapshot.days.findIndex((d) => norm(d.name) === norm(ref))
}

/**
 * Применить правку к снимку программы. resolve переводит ссылку на
 * упражнение (UUID, slug, название) в UUID. Ошибки — по каждому изменению;
 * если хоть одна есть, программа не меняется вовсе.
 */
export function applyProposal(
  snapshot: Snapshot,
  proposal: Proposal,
  resolve: (ref: string) => string | null,
): { snapshot: Snapshot | null; errors: string[] } {
  const next: Snapshot = JSON.parse(JSON.stringify(snapshot))
  const errors: string[] = []

  proposal.changes.forEach((c, i) => {
    const at = `Изменение ${i + 1}`
    const di = findDay(next, c.day)
    if (di < 0) return void errors.push(`${at}: нет дня «${c.day}» в программе.`)
    const day = next.days[di]

    if (c.op === 'update_day') {
      if (c.name !== undefined) day.name = c.name
      if (c.heavy_legs !== undefined) day.heavyLegs = c.heavy_legs
      return
    }

    const id = resolve(c.exercise)
    const idx = id ? day.exercises.findIndex((e) => e.exercise === id) : -1

    if (c.op === 'add_exercise') {
      if (!id) return void errors.push(`${at}: упражнение «${c.exercise}» не найдено в справочнике.`)
      if (idx >= 0) return void errors.push(`${at}: «${c.exercise}» уже есть в ${day.name}.`)
      const ex: SnapshotExercise = {
        exercise: id, sets: c.sets, repMin: c.rep_min, repMax: c.rep_max, rir: c.rir, restSec: c.rest_sec ?? 120,
        cautious: c.cautious ?? false, notes: c.notes ?? null,
      }
      const pos = c.position ? Math.min(c.position - 1, day.exercises.length) : day.exercises.length
      day.exercises.splice(pos, 0, ex)
      return
    }

    if (idx < 0) return void errors.push(`${at}: в ${day.name} нет упражнения «${c.exercise}».`)
    const ex = day.exercises[idx]

    if (c.op === 'remove_exercise') {
      day.exercises.splice(idx, 1)
    } else if (c.op === 'replace_exercise') {
      const withId = resolve(c.with)
      if (!withId) return void errors.push(`${at}: упражнение «${c.with}» не найдено в справочнике.`)
      ex.exercise = withId
    } else if (c.op === 'move_exercise') {
      day.exercises.splice(idx, 1)
      day.exercises.splice(Math.min(c.position - 1, day.exercises.length), 0, ex)
    } else if (c.op === 'update_exercise') {
      if (c.sets !== undefined) ex.sets = c.sets
      if (c.rep_min !== undefined) ex.repMin = c.rep_min
      if (c.rep_max !== undefined) ex.repMax = c.rep_max
      if (c.rir !== undefined) ex.rir = c.rir
      if (c.rest_sec !== undefined) ex.restSec = c.rest_sec
      if (c.cautious !== undefined) ex.cautious = c.cautious
      if (c.notes !== undefined) ex.notes = c.notes
      if (ex.repMin > ex.repMax) errors.push(`${at}: после правки нижняя граница повторов выше верхней.`)
    }
  })

  return errors.length ? { snapshot: null, errors } : { snapshot: next, errors }
}
