import type { DayType, EventStatus, SessionStatus, SetType } from '../domain/types'

/** Общие поля синхронизируемой строки. */
export interface Syncable {
  id: string
  /** Время правки на устройстве. По нему разрешается конфликт. */
  updatedAt: string
  /** Время прихода на сервер. По нему идёт вычитка. Локально только для курсора. */
  serverUpdatedAt?: string | null
  deletedAt?: string | null
}

export interface Owned extends Syncable {
  userId: string
}

export interface Profile extends Syncable {
  /** У профиля id совпадает с id пользователя. */
  displayName: string
  heightCm: number | null
  birthDate: string | null
  kcalTarget: number
  proteinTarget: number
  weightGoalKg: number | null
  weightRateKgWeek: number | null
  theme: 'dark' | 'light' | 'system'
  restSecDefault: number
  limitations: string[]
  onboardedAt: string | null
}

export interface Exercise extends Syncable {
  ownerId: string | null
  slug: string | null
  nameRu: string
  nameEn: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string | null
  level: string | null
  force: string | null
  mechanic: string | null
  category: string | null
  instructionsRu: string[]
  instructionsEn: string[]
  cuesRu: string[]
  mistakesRu: string[]
  imageStart: string | null
  imageEnd: string | null
  youtubeUrl: string | null
  defaultRestSec: number | null
  cautiousDefault: boolean
  isCustom: boolean
}

export interface UserExercisePref extends Owned {
  exerciseId: string
  note: string | null
  youtubeUrl: string | null
  restSec: number | null
  pinned: boolean
}

export interface Program extends Owned {
  name: string
  version: number
  parentId: string | null
  isActive: boolean
  notes: string | null
}

export interface ProgramDay extends Owned {
  programId: string
  orderIndex: number
  name: string
  focus: string | null
  heavyLegs: boolean
}

export interface ProgramExercise extends Owned {
  programDayId: string
  exerciseId: string
  orderIndex: number
  targetSets: number
  repMin: number
  repMax: number
  targetRir: number
  restSec: number
  incrementKg: number | null
  cautious: boolean
  supersetGroup: string | null
  notes: string | null
}

export interface CalendarEvent extends Owned {
  date: string
  type: DayType
  programDayId: string | null
  durationMin: number | null
  intensity: number | null
  status: EventStatus
  note: string | null
}

export interface WorkoutSession extends Owned {
  date: string
  startedAt: string
  finishedAt: string | null
  programDayId: string | null
  status: SessionStatus
  difficulty: number | null
  note: string | null
}

export interface SessionExercise extends Owned {
  sessionId: string
  exerciseId: string
  orderIndex: number
  substitutedFrom: string | null
  supersetGroup: string | null
  targetSets: number | null
  repMin: number | null
  repMax: number | null
  targetRir: number | null
  restSec: number | null
  note: string | null
}

export interface SetRow extends Owned {
  sessionExerciseId: string
  exerciseId: string
  setIndex: number
  weightKg: number
  reps: number
  rir: number | null
  type: SetType
  e1rm: number | null
  isPr: boolean
  performedAt: string
  note: string | null
}

export interface PersonalRecord extends Owned {
  exerciseId: string
  kind: 'weight' | 'reps' | 'e1rm'
  value: number
  weightKg: number | null
  reps: number | null
  setId: string | null
  achievedAt: string
}

export interface BodyMetric extends Owned {
  date: string
  weightKg: number | null
  chestCm: number | null
  waistCm: number | null
  hipsCm: number | null
  bicepsCm: number | null
  thighCm: number | null
  neckCm: number | null
  note: string | null
}

export interface SavedMeal extends Owned {
  name: string
  kcal: number
  proteinG: number
  useCount: number
}

export interface NutritionEntry extends Owned {
  date: string
  name: string
  kcal: number
  proteinG: number
  savedMealId: string | null
}

export interface ReadinessCheckin extends Owned {
  date: string
  sleepHours: number
  energy: number
  soreness: number
  stress: number
  score: number | null
  flag: 'green' | 'yellow' | 'red' | null
}

export interface CoachNote extends Owned {
  author: 'coach' | 'me'
  text: string
  tags: string[]
  createdAt: string
}

export interface Proposal extends Owned {
  source: 'coach' | 'manual'
  title: string
  rationale: string | null
  payload: unknown
  diff: unknown
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  resolvedAt: string | null
}

export interface ApiToken extends Owned {
  name: string
  tokenHash: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Элемент очереди отправки. Пока он здесь — правка ещё не на сервере. */
export interface OutboxItem {
  seq?: number
  table: string
  rowId: string
  payload: Record<string, unknown>
  createdAt: string
  tries: number
  lastError?: string | null
}

export interface MetaRow {
  key: string
  value: unknown
}
