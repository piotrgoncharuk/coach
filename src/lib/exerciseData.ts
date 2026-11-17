import { db, getMeta, META, setMeta } from './db'
import type { Exercise } from './models'

type SeedRow = Omit<Exercise, 'updatedAt' | 'ownerId' | 'isCustom' | 'youtubeUrl' | 'deletedAt'>

let loading: Promise<number> | null = null

/** Адрес файла из public/ с учётом подкаталога /coach/. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

/** Картинка упражнения: общая — файл сборки, своя — blob из локальной базы. */
export function isLocalMedia(path: string | null): boolean {
  return !!path && path.startsWith('local:')
}

/**
 * Справочник грузится в локальную базу один раз и обновляется, только когда
 * поменялась версия файла. Свои упражнения и закреплённые видео не трогаются:
 * они живут в отдельных строках.
 */
export function ensureExercises(): Promise<number> {
  loading ??= (async () => {
    const res = await fetch(assetUrl('data/exercises.json'))
    if (!res.ok) throw new Error(`Справочник не загрузился: ${res.status}`)
    const data = (await res.json()) as { version: string; rows: SeedRow[] }
    const current = await getMeta<string | null>(META.exercisesVersion, null)
    if (current === data.version && (await db.exercises.count()) >= data.rows.length) return data.rows.length
    const ts = new Date(0).toISOString()
    const existing = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const rows: Exercise[] = data.rows.map((r) => ({
      ...r,
      ownerId: null,
      isCustom: false,
      // видео, закреплённое раньше, сохраняем
      youtubeUrl: existing.get(r.id)?.youtubeUrl ?? null,
      updatedAt: ts,
      deletedAt: null,
    }))
    for (let i = 0; i < rows.length; i += 200) await db.exercises.bulkPut(rows.slice(i, i + 200))
    await setMeta(META.exercisesVersion, data.version)
    return rows.length
  })().finally(() => {
    loading = null
  })
  return loading
}
