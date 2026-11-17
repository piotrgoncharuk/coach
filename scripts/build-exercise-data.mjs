#!/usr/bin/env node
/**
 * Справочник упражнений: открытая база free-exercise-db (public domain)
 * + русские названия + подробная техника по-русски.
 *
 * Источник закреплён по коммиту, данные лежат в data/ — сборка не зависит от сети.
 * Результат: public/data/exercises.json (генерируется, в git не хранится).
 *
 * Идентификаторы детерминированные: UUID из id базы. Так подходы на телефоне,
 * на Mac и на сервере ссылаются на одни и те же упражнения.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const UPSTREAM_SHA = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'

/** UUID v5-подобный: стабильный для одного и того же id базы. */
export function exerciseUuid(slug) {
  const h = createHash('sha1').update(`coach:exercise:${slug}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** Отдых по умолчанию: тяжёлые базовые — дольше, изоляция — короче. */
function defaultRest(ex) {
  if (ex.category !== 'strength' && ex.category !== 'powerlifting') return 60
  if (ex.mechanic === 'compound' && (ex.equipment === 'barbell' || ex.equipment === 'machine')) return 150
  if (ex.mechanic === 'compound') return 120
  return 75
}

/** Движения, которые по умолчанию идут в осторожном режиме: нагрузка на поясницу и заднюю поверхность бедра. */
const CAUTIOUS = new Set([
  'Romanian_Deadlift', 'Barbell_Deadlift', 'Stiff-Legged_Barbell_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift',
  'Good_Morning', 'Lying_Leg_Curls', 'Seated_Leg_Curl', 'Glute_Ham_Raise', 'Natural_Glute_Ham_Raise',
  'Hyperextensions_Back_Extensions', 'Bent_Over_Barbell_Row', 'Sumo_Deadlift', 'Deficit_Deadlift',
])

export async function buildExerciseData() {
  const upstream = JSON.parse(await readFile(resolve(root, 'data/free-exercise-db.json'), 'utf8'))
  const names = new Map(
    (await readFile(resolve(root, 'data/exercise-names-ru.tsv'), 'utf8'))
      .split('\n').filter(Boolean).map((l) => l.split('\t')),
  )
  const details = JSON.parse(await readFile(resolve(root, 'data/exercise-details-ru.json'), 'utf8'))

  const missing = upstream.filter((e) => !names.has(e.id)).map((e) => e.id)
  if (missing.length) throw new Error(`Нет русского названия: ${missing.join(', ')}`)

  const rows = upstream.map((e) => {
    const d = details[e.id]
    return {
      id: exerciseUuid(e.id),
      slug: e.id,
      nameRu: names.get(e.id),
      nameEn: e.name,
      primaryMuscles: e.primaryMuscles,
      secondaryMuscles: e.secondaryMuscles,
      equipment: e.equipment ?? 'other',
      level: e.level,
      force: e.force,
      mechanic: e.mechanic,
      category: e.category,
      instructionsRu: d?.i ?? [],
      instructionsEn: e.instructions,
      cuesRu: d?.c ?? [],
      mistakesRu: d?.m ?? [],
      imageStart: e.images[0] ? `exercise-img/${e.id}/0.webp` : null,
      imageEnd: e.images[1] ? `exercise-img/${e.id}/1.webp` : null,
      defaultRestSec: defaultRest(e),
      cautiousDefault: CAUTIOUS.has(e.id),
    }
  })

  const payload = JSON.stringify({ source: `yuhonas/free-exercise-db@${UPSTREAM_SHA}`, rows })
  const version = createHash('sha1').update(payload).digest('hex').slice(0, 12)
  await mkdir(resolve(root, 'public/data'), { recursive: true })
  await writeFile(resolve(root, 'public/data/exercises.json'), JSON.stringify({ version, source: `yuhonas/free-exercise-db@${UPSTREAM_SHA}`, rows }))
  return { version, count: rows.length, detailed: Object.keys(details).length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await buildExerciseData()
  console.log(`справочник: ${r.count} упражнений, подробно по-русски — ${r.detailed}, версия ${r.version}`)
}
