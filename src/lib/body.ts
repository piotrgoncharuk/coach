import { db } from './db'
import { save, softDelete } from './repo'
import { alive } from './workout'
import type { BodyMetric } from './models'
import type { GirthKey } from '../domain'

/** Одна строка замеров на день: повторный ввод обновляет её, а не плодит дубли. */
export async function saveBodyMetric(date: string, patch: Partial<Record<'weightKg' | GirthKey, number | null>> & { note?: string | null }): Promise<BodyMetric> {
  const existing = alive(await db.bodyMetrics.where('date').equals(date).toArray())[0]
  return save('bodyMetrics', {
    id: existing?.id, date,
    weightKg: existing?.weightKg ?? null, chestCm: existing?.chestCm ?? null, waistCm: existing?.waistCm ?? null,
    hipsCm: existing?.hipsCm ?? null, bicepsCm: existing?.bicepsCm ?? null, thighCm: existing?.thighCm ?? null,
    neckCm: existing?.neckCm ?? null, note: existing?.note ?? null, ...patch,
  })
}

export async function bodyMetrics(): Promise<BodyMetric[]> {
  return alive(await db.bodyMetrics.toArray()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function deleteBodyMetric(id: string) {
  await softDelete('bodyMetrics', id)
}
