/**
 * Экспорт и импорт. Экспорт — все таблицы в JSON (полная копия, из неё можно
 * восстановиться) и CSV для таблиц и Numbers. Импорт принимает либо полный
 * экспорт, либо простой формат прошлых тренировок.
 */
import type { SetType } from './types'

export const EXPORT_FORMAT = 'coach-export'
export const EXPORT_VERSION = 1

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

export function isExportEnvelope(x: unknown): x is ExportEnvelope {
  return !!x && typeof x === 'object' && (x as ExportEnvelope).format === EXPORT_FORMAT && typeof (x as ExportEnvelope).tables === 'object'
}

// ─── CSV ────────────────────────────────────────────────────────────────────
export interface CsvColumn<T> {
  label: string
  value: (row: T) => string | number | boolean | null | undefined
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV по RFC 4180 с BOM — Excel и Numbers откроют кириллицу без кракозябр. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

// ─── импорт прошлых тренировок ──────────────────────────────────────────────
export interface ImportSet {
  weightKg: number
  reps: number
  rir: number | null
  type: SetType
}

export interface ImportExercise {
  /** Название по-русски или по-английски, id базы или UUID. */
  ref: string
  sets: ImportSet[]
}

export interface ImportSession {
  date: string
  startedAt: string
  finishedAt: string
  note: string | null
  difficulty: number | null
  exercises: ImportExercise[]
}

export interface ImportResult {
  sessions: ImportSession[]
  errors: string[]
}

export const IMPORT_EXAMPLE = {
  sessions: [
    {
      date: '2026-10-01',
      durationMin: 60,
      note: 'пример',
      exercises: [
        { exercise: 'Приседания со штангой', sets: [{ weightKg: 80, reps: 8, rir: 2 }, { weightKg: 80, reps: 8 }] },
        { exercise: 'Barbell_Bench_Press_-_Medium_Grip', sets: [{ weightKg: 70, reps: 6, type: 'work' }] },
      ],
    },
  ],
}

const SET_TYPES: SetType[] = ['warmup', 'work', 'drop', 'failure']
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN)

/**
 * Разбор простого формата. Ошибки собираются все сразу и указывают место:
 * «тренировка 2, упражнение 1, подход 3: нет повторов».
 */
export function parsePastWorkouts(input: unknown): ImportResult {
  const errors: string[] = []
  const sessions: ImportSession[] = []
  const list = Array.isArray(input) ? input : (input as { sessions?: unknown })?.sessions
  if (!Array.isArray(list)) return { sessions, errors: ['Ожидается объект с полем «sessions» — массивом тренировок.'] }

  list.forEach((raw, si) => {
    const where = `тренировка ${si + 1}`
    const s = raw as Record<string, unknown>
    if (!isDate(s?.date)) return void errors.push(`${where}: дата в формате ГГГГ-ММ-ДД обязательна`)
    const date = s.date as string
    const startedAt = typeof s.startedAt === 'string' && !Number.isNaN(Date.parse(s.startedAt)) ? new Date(s.startedAt).toISOString() : `${date}T18:00:00.000Z`
    const duration = num(s.durationMin)
    const finishedAt = new Date(Date.parse(startedAt) + (Number.isFinite(duration) && duration > 0 ? duration : 60) * 60000).toISOString()
    const exercises: ImportExercise[] = []
    const exList = s.exercises
    if (!Array.isArray(exList) || exList.length === 0) return void errors.push(`${where}: нет упражнений`)

    exList.forEach((rawEx, ei) => {
      const e = rawEx as Record<string, unknown>
      const exWhere = `${where}, упражнение ${ei + 1}`
      const ref = typeof e?.exercise === 'string' ? e.exercise.trim() : typeof e?.name === 'string' ? e.name.trim() : ''
      if (!ref) return void errors.push(`${exWhere}: нет названия`)
      if (!Array.isArray(e.sets) || e.sets.length === 0) return void errors.push(`${exWhere}: нет подходов`)
      const sets: ImportSet[] = []
      ;(e.sets as unknown[]).forEach((rawSet, k) => {
        const st = rawSet as Record<string, unknown>
        const setWhere = `${exWhere}, подход ${k + 1}`
        const weightKg = num(st?.weightKg ?? st?.weight ?? 0)
        const reps = num(st?.reps)
        const rir = st?.rir === undefined || st?.rir === null ? null : num(st.rir)
        const type = (st?.type ?? 'work') as SetType
        if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) return void errors.push(`${setWhere}: вес должен быть числом от 0 до 1000`)
        if (!Number.isInteger(reps) || reps < 1 || reps > 500) return void errors.push(`${setWhere}: повторы — целое число от 1`)
        if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 4)) return void errors.push(`${setWhere}: запас повторов — от 0 до 4`)
        if (!SET_TYPES.includes(type)) return void errors.push(`${setWhere}: тип — warmup, work, drop или failure`)
        sets.push({ weightKg, reps, rir, type })
      })
      if (sets.length) exercises.push({ ref, sets })
    })

    const difficulty = num(s.difficulty)
    if (exercises.length) {
      sessions.push({
        date, startedAt, finishedAt,
        note: typeof s.note === 'string' ? s.note : null,
        difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 10 ? difficulty : null,
        exercises,
      })
    }
  })

  return { sessions, errors }
}
