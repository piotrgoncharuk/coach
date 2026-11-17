import { db, SYNC_TABLES } from './db'
import { putRaw, save } from './repo'
import { alive } from './workout'
import { resolve } from '../domain/merge'
import { epley1RM, EXPORT_FORMAT, EXPORT_VERSION, isExportEnvelope, normalize, parsePastWorkouts, toCsv, type CsvColumn, type ExportEnvelope } from '../domain'
import type { Exercise, SetRow, Syncable } from './models'

/** Полная копия всех таблиц пользователя. Общий справочник не выгружается — он в сборке. */
export async function buildExport(): Promise<ExportEnvelope> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const def of SYNC_TABLES) {
    let rows = (await db.table(def.local).toArray()) as Record<string, unknown>[]
    if (def.local === 'exercises') rows = rows.filter((r) => r.isCustom)
    if (def.local === 'apiTokens') rows = rows.map(({ tokenHash: _h, ...r }) => r) // хэш токена наружу не нужен
    tables[def.local] = rows
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), tables }
}

export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type CsvKind = 'sets' | 'sessions' | 'body' | 'nutrition' | 'readiness'

export const CSV_LABEL: Record<CsvKind, string> = {
  sets: 'Подходы', sessions: 'Тренировки', body: 'Вес и замеры', nutrition: 'Питание', readiness: 'Готовность',
}

export async function buildCsv(kind: CsvKind): Promise<string> {
  if (kind === 'sets') {
    const sets = alive(await db.sets.toArray()).sort((a, b) => a.performedAt.localeCompare(b.performedAt))
    const ex = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const cols: CsvColumn<SetRow>[] = [
      { label: 'Дата', value: (s) => s.performedAt.slice(0, 10) },
      { label: 'Время', value: (s) => s.performedAt.slice(11, 16) },
      { label: 'Упражнение', value: (s) => ex.get(s.exerciseId)?.nameRu ?? s.exerciseId },
      { label: 'Exercise', value: (s) => ex.get(s.exerciseId)?.nameEn ?? '' },
      { label: 'Подход', value: (s) => s.setIndex },
      { label: 'Вес, кг', value: (s) => s.weightKg },
      { label: 'Повторы', value: (s) => s.reps },
      { label: 'Запас', value: (s) => s.rir },
      { label: 'Тип', value: (s) => s.type },
      { label: '1ПМ, кг', value: (s) => (s.type === 'warmup' ? '' : epley1RM(s.weightKg, s.reps, s.rir)) },
      { label: 'Рекорд', value: (s) => (s.isPr ? 'да' : '') },
      { label: 'Заметка', value: (s) => s.note },
    ]
    return toCsv(cols, sets)
  }
  if (kind === 'sessions') {
    const rows = alive(await db.sessions.toArray()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    return toCsv([
      { label: 'Дата', value: (s) => s.date },
      { label: 'Начало', value: (s) => s.startedAt },
      { label: 'Конец', value: (s) => s.finishedAt },
      { label: 'Статус', value: (s) => s.status },
      { label: 'Сложность', value: (s) => s.difficulty },
      { label: 'Заметка', value: (s) => s.note },
    ], rows)
  }
  if (kind === 'body') {
    const rows = alive(await db.bodyMetrics.toArray()).sort((a, b) => a.date.localeCompare(b.date))
    return toCsv([
      { label: 'Дата', value: (r) => r.date }, { label: 'Вес, кг', value: (r) => r.weightKg },
      { label: 'Грудь, см', value: (r) => r.chestCm }, { label: 'Талия, см', value: (r) => r.waistCm },
      { label: 'Бёдра, см', value: (r) => r.hipsCm }, { label: 'Бицепс, см', value: (r) => r.bicepsCm },
      { label: 'Бедро, см', value: (r) => r.thighCm }, { label: 'Шея, см', value: (r) => r.neckCm },
    ], rows)
  }
  if (kind === 'nutrition') {
    const rows = alive(await db.nutritionEntries.toArray()).sort((a, b) => a.date.localeCompare(b.date))
    return toCsv([
      { label: 'Дата', value: (r) => r.date }, { label: 'Блюдо', value: (r) => r.name },
      { label: 'Ккал', value: (r) => r.kcal }, { label: 'Белок, г', value: (r) => r.proteinG },
    ], rows)
  }
  const rows = alive(await db.readinessCheckins.toArray()).sort((a, b) => a.date.localeCompare(b.date))
  return toCsv([
    { label: 'Дата', value: (r) => r.date }, { label: 'Сон, ч', value: (r) => r.sleepHours },
    { label: 'Энергия', value: (r) => r.energy }, { label: 'Боль', value: (r) => r.soreness },
    { label: 'Стресс', value: (r) => r.stress }, { label: 'Готовность', value: (r) => r.score },
    { label: 'Цвет', value: (r) => r.flag },
  ], rows)
}

export interface ImportReport {
  kind: 'backup' | 'workouts'
  added: number
  updated: number
  skipped: number
  errors: string[]
  unknownExercises: string[]
}

/**
 * Импорт. Полная копия сливается по правилу last-write-wins: ничего не
 * удаляется, более свежие версии побеждают. Прошлые тренировки добавляются
 * новыми, упражнения ищутся по названию на обоих языках и по id базы.
 */
export async function importJson(text: string): Promise<ImportReport> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { kind: 'workouts', added: 0, updated: 0, skipped: 0, errors: ['Это не JSON: проверь, что файл скопирован целиком.'], unknownExercises: [] }
  }
  return isExportEnvelope(data) ? importBackup(data) : importWorkouts(data)
}

async function importBackup(env: ExportEnvelope): Promise<ImportReport> {
  const report: ImportReport = { kind: 'backup', added: 0, updated: 0, skipped: 0, errors: [], unknownExercises: [] }
  for (const def of SYNC_TABLES) {
    const rows = (env.tables[def.local] ?? []) as unknown as Syncable[]
    const table = db.table(def.local)
    for (const row of rows) {
      if (!row?.id || !row.updatedAt) { report.skipped++; continue }
      const local = (await table.get(row.id)) as Syncable | undefined
      if (!local) {
        await putRaw(def.local as never, row)
        report.added++
      } else if (resolve(local, row) === row && row.updatedAt !== local.updatedAt) {
        await putRaw(def.local as never, row)
        report.updated++
      } else report.skipped++
    }
  }
  return report
}

function matcher(all: Exercise[]) {
  const byKey = new Map<string, Exercise>()
  for (const e of all.filter((x) => !x.deletedAt)) {
    for (const k of [e.id, e.slug, e.nameRu, e.nameEn].filter(Boolean) as string[]) byKey.set(normalize(k), e)
  }
  return (ref: string) => byKey.get(normalize(ref))
}

async function importWorkouts(data: unknown): Promise<ImportReport> {
  const parsed = parsePastWorkouts(data)
  const report: ImportReport = { kind: 'workouts', added: 0, updated: 0, skipped: 0, errors: parsed.errors, unknownExercises: [] }
  const find = matcher(await db.exercises.toArray())
  const unknown = new Set<string>()
  for (const s of parsed.sessions) for (const e of s.exercises) if (!find(e.ref)) unknown.add(e.ref)
  report.unknownExercises = [...unknown]
  if (unknown.size) {
    report.errors.push(`Не нашёл упражнения: ${[...unknown].map((u) => `«${u}»`).join(', ')}. Поправь названия или добавь свои упражнения и повтори — ничего не импортировано.`)
    return report
  }
  if (parsed.errors.length) {
    report.errors.push('Ничего не импортировано: сначала исправь ошибки выше.')
    return report
  }
  for (const s of parsed.sessions) {
    const session = await save('sessions', { date: s.date, startedAt: s.startedAt, finishedAt: s.finishedAt, programDayId: null, status: 'finished', difficulty: s.difficulty, note: s.note })
    for (const [i, e] of s.exercises.entries()) {
      const ex = find(e.ref)!
      const se = await save('sessionExercises', { sessionId: session.id, exerciseId: ex.id, orderIndex: i, substitutedFrom: null, supersetGroup: null, targetSets: e.sets.length, repMin: null, repMax: null, targetRir: null, restSec: null, note: null })
      for (const [k, st] of e.sets.entries()) {
        await save('sets', {
          sessionExerciseId: se.id, exerciseId: ex.id, setIndex: k + 1, weightKg: st.weightKg, reps: st.reps, rir: st.rir, type: st.type,
          e1rm: st.type === 'warmup' ? null : epley1RM(st.weightKg, st.reps, st.rir), isPr: false,
          performedAt: new Date(Date.parse(s.startedAt) + (i * 10 + k * 3) * 60000).toISOString(), note: null,
        })
      }
    }
    report.added++
  }
  return report
}
