/** Мышца → группа. Копия src/domain/types.ts: тест сверяет, что они не разошлись. */
export const MUSCLE_GROUP: Record<string, string> = {
  chest: 'chest', lats: 'back', 'middle back': 'back', 'lower back': 'back', traps: 'back',
  shoulders: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms',
  quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', abductors: 'legs', adductors: 'legs',
  abdominals: 'core', neck: 'core',
}

export function epley(weightKg: number, reps: number, rir: number | null): number {
  if (weightKg <= 0 || reps <= 0) return 0
  const eff = reps + (rir ?? 0)
  return eff <= 1 ? Math.round(weightKg * 10) / 10 : Math.round(weightKg * (1 + eff / 30) * 10) / 10
}

export const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
