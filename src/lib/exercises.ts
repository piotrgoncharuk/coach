import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { save, softDelete } from './repo'
import { newId } from './ids'
import type { Exercise, UserExercisePref } from './models'

export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(() => db.exercises.toArray(), [])
}

export function useExercise(id: string | undefined): Exercise | undefined | null {
  return useLiveQuery(async () => (id ? ((await db.exercises.get(id)) ?? null) : null), [id])
}

export async function getPref(exerciseId: string): Promise<UserExercisePref | undefined> {
  return (await db.userExercisePrefs.where('exerciseId').equals(exerciseId).toArray()).find((p) => !p.deletedAt)
}

export function usePref(exerciseId: string | undefined) {
  return useLiveQuery(async () => (exerciseId ? ((await getPref(exerciseId)) ?? null) : null), [exerciseId])
}

/** Мои настройки упражнения: заметка, видео, отдых. Одна строка на упражнение. */
export async function savePref(exerciseId: string, patch: Partial<Pick<UserExercisePref, 'note' | 'youtubeUrl' | 'restSec' | 'pinned'>>) {
  const cur = await getPref(exerciseId)
  await save('userExercisePrefs', {
    id: cur?.id, exerciseId, note: cur?.note ?? null, youtubeUrl: cur?.youtubeUrl ?? null,
    restSec: cur?.restSec ?? null, pinned: cur?.pinned ?? false, ...patch,
  })
}

/** Сжать фото до WebP 800px на устройстве — в базе не нужны мегабайты с камеры. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.8))
  if (blob) return blob
  return new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85))
}

export interface CustomExerciseInput {
  id?: string
  nameRu: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  photo?: File | null
  note?: string
}

export async function saveCustomExercise(input: CustomExerciseInput): Promise<Exercise> {
  let imageStart: string | undefined
  if (input.photo) {
    const id = newId()
    await db.media.put({ id, blob: await compressPhoto(input.photo), createdAt: new Date().toISOString() })
    imageStart = `local:${id}`
  }
  const ownerId = (await import('./repo')).currentUserIdSync()
  return save('exercises', {
    id: input.id, ownerId, slug: null, nameRu: input.nameRu.trim(), nameEn: null,
    primaryMuscles: input.primaryMuscles, secondaryMuscles: input.secondaryMuscles, equipment: input.equipment,
    level: null, force: null, mechanic: null, category: 'strength', instructionsRu: input.note ? [input.note] : [],
    instructionsEn: [], cuesRu: [], mistakesRu: [], ...(imageStart ? { imageStart } : {}),
    ...(input.id ? {} : { imageStart: imageStart ?? null, imageEnd: null, youtubeUrl: null }),
    defaultRestSec: 90, cautiousDefault: false, isCustom: true,
  })
}

export async function deleteCustomExercise(id: string) {
  await softDelete('exercises', id)
}
