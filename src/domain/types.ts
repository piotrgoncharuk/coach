/** Типы предметной области. Используются и в UI, и в синхронизации, и в MCP-ответах. */

export type SetType = 'warmup' | 'work' | 'drop' | 'failure'
export type DayType = 'gym' | 'football' | 'rest'
export type EventStatus = 'planned' | 'done' | 'skipped'
export type SessionStatus = 'active' | 'finished' | 'abandoned'

/** Мышцы в терминах free-exercise-db — чтобы импорт не требовал перекодировки. */
export const MUSCLES = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms',
  'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck',
  'quadriceps', 'shoulders', 'traps', 'triceps',
] as const
export type Muscle = (typeof MUSCLES)[number]

export const EQUIPMENT = [
  'barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'bands',
  'medicine ball', 'exercise ball', 'e-z curl bar', 'foam roll', 'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

/** Укрупнённые группы — для недельного объёма и правила «ноги и футбол». */
export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const MUSCLE_TO_GROUP: Record<Muscle, MuscleGroup> = {
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  abductors: 'legs',
  adductors: 'legs',
  abdominals: 'core',
  neck: 'core',
}

export const MUSCLE_RU: Record<Muscle, string> = {
  abdominals: 'живот',
  abductors: 'отводящие бедра',
  adductors: 'приводящие бедра',
  biceps: 'бицепс',
  calves: 'икры',
  chest: 'грудь',
  forearms: 'предплечья',
  glutes: 'ягодицы',
  hamstrings: 'задняя поверхность бедра',
  lats: 'широчайшие',
  'lower back': 'поясница',
  'middle back': 'середина спины',
  neck: 'шея',
  quadriceps: 'квадрицепс',
  shoulders: 'плечи',
  traps: 'трапеция',
  triceps: 'трицепс',
}

export const EQUIPMENT_RU: Record<Equipment, string> = {
  barbell: 'штанга',
  dumbbell: 'гантели',
  cable: 'блок',
  machine: 'тренажёр',
  'body only': 'свой вес',
  kettlebells: 'гири',
  bands: 'резина',
  'medicine ball': 'медбол',
  'exercise ball': 'фитбол',
  'e-z curl bar': 'EZ-гриф',
  'foam roll': 'ролик',
  other: 'другое',
}

export const MUSCLE_GROUP_RU: Record<MuscleGroup, string> = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  arms: 'Руки',
  legs: 'Ноги',
  core: 'Корпус',
}

/** Один записанный подход. */
export interface PerformedSet {
  id: string
  exerciseId: string
  setIndex: number
  weightKg: number
  reps: number
  /** Запас повторов 0–4. null — не указан. */
  rir: number | null
  type: SetType
  performedAt: string
  note?: string | null
}

/** Целевые параметры упражнения в программе. */
export interface ExerciseTarget {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  /** Целевой запас повторов на рабочих подходах. */
  rir: number
  restSec: number
  /** Шаг прибавки веса, кг. Задаётся на упражнение. */
  incrementKg?: number
  /**
   * Осторожный режим: шаг прибавки не больше 2,5 кг, RIR не опускается ниже 2,
   * вес не растёт после подхода, сделанного «в упор». Для реабилитации.
   */
  cautious?: boolean
}
