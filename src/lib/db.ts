import Dexie, { type EntityTable } from 'dexie'
import type {
  ApiToken, BodyMetric, CalendarEvent, CoachNote, Exercise, MetaRow, NutritionEntry,
  OutboxItem, PersonalRecord, Profile, Program, ProgramDay, ProgramExercise, Proposal,
  ReadinessCheckin, SavedMeal, SessionExercise, SetRow, UserExercisePref, WorkoutSession,
} from './models'

/**
 * Локальная база — источник правды. UI читает только отсюда, поэтому в зале
 * без сети всё работает одинаково. Сервер нужен лишь чтобы данные переехали
 * на другое устройство и не пропали вместе с телефоном.
 *
 * Порядок таблиц в SYNC_TABLES важен: по нему идёт отправка, и родительские
 * строки уезжают раньше дочерних, иначе сервер отвергнет их по внешнему ключу.
 */
export interface SyncTableDef {
  local: string
  remote: string
  /** Строка принадлежит пользователю через это поле. */
  ownerField: 'userId' | 'ownerId' | 'id'
  /** Таблица только читается (общий справочник). */
  readOnly?: boolean
}

export const SYNC_TABLES: SyncTableDef[] = [
  { local: 'profiles', remote: 'profiles', ownerField: 'id' },
  { local: 'exercises', remote: 'exercises', ownerField: 'ownerId' },
  { local: 'userExercisePrefs', remote: 'user_exercise_prefs', ownerField: 'userId' },
  { local: 'programs', remote: 'programs', ownerField: 'userId' },
  { local: 'programDays', remote: 'program_days', ownerField: 'userId' },
  { local: 'programExercises', remote: 'program_exercises', ownerField: 'userId' },
  { local: 'calendarEvents', remote: 'calendar_events', ownerField: 'userId' },
  { local: 'sessions', remote: 'sessions', ownerField: 'userId' },
  { local: 'sessionExercises', remote: 'session_exercises', ownerField: 'userId' },
  { local: 'sets', remote: 'sets', ownerField: 'userId' },
  { local: 'personalRecords', remote: 'personal_records', ownerField: 'userId' },
  { local: 'bodyMetrics', remote: 'body_metrics', ownerField: 'userId' },
  { local: 'savedMeals', remote: 'saved_meals', ownerField: 'userId' },
  { local: 'nutritionEntries', remote: 'nutrition_entries', ownerField: 'userId' },
  { local: 'readinessCheckins', remote: 'readiness_checkins', ownerField: 'userId' },
  { local: 'coachNotes', remote: 'coach_notes', ownerField: 'userId' },
  { local: 'proposals', remote: 'program_change_proposals', ownerField: 'userId' },
  { local: 'apiTokens', remote: 'api_tokens', ownerField: 'userId' },
]

export const REMOTE_BY_LOCAL = new Map(SYNC_TABLES.map((t) => [t.local, t]))

export class CoachDb extends Dexie {
  profiles!: EntityTable<Profile, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  userExercisePrefs!: EntityTable<UserExercisePref, 'id'>
  programs!: EntityTable<Program, 'id'>
  programDays!: EntityTable<ProgramDay, 'id'>
  programExercises!: EntityTable<ProgramExercise, 'id'>
  calendarEvents!: EntityTable<CalendarEvent, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  sessionExercises!: EntityTable<SessionExercise, 'id'>
  sets!: EntityTable<SetRow, 'id'>
  personalRecords!: EntityTable<PersonalRecord, 'id'>
  bodyMetrics!: EntityTable<BodyMetric, 'id'>
  savedMeals!: EntityTable<SavedMeal, 'id'>
  nutritionEntries!: EntityTable<NutritionEntry, 'id'>
  readinessCheckins!: EntityTable<ReadinessCheckin, 'id'>
  coachNotes!: EntityTable<CoachNote, 'id'>
  proposals!: EntityTable<Proposal, 'id'>
  apiTokens!: EntityTable<ApiToken, 'id'>
  outbox!: EntityTable<OutboxItem, 'seq'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'coach') {
    super(name)
    this.version(1).stores({
      profiles: 'id, updatedAt',
      exercises: 'id, slug, nameRu, equipment, ownerId, updatedAt, *primaryMuscles',
      userExercisePrefs: 'id, userId, exerciseId, updatedAt',
      programs: 'id, userId, isActive, updatedAt',
      programDays: 'id, userId, programId, orderIndex, updatedAt',
      programExercises: 'id, userId, programDayId, orderIndex, updatedAt',
      calendarEvents: 'id, userId, date, type, status, updatedAt',
      sessions: 'id, userId, date, status, updatedAt',
      sessionExercises: 'id, userId, sessionId, orderIndex, updatedAt',
      sets: 'id, userId, sessionExerciseId, exerciseId, performedAt, updatedAt, [exerciseId+performedAt]',
      personalRecords: 'id, userId, exerciseId, kind, updatedAt',
      bodyMetrics: 'id, userId, date, updatedAt',
      savedMeals: 'id, userId, name, useCount, updatedAt',
      nutritionEntries: 'id, userId, date, updatedAt',
      readinessCheckins: 'id, userId, date, updatedAt',
      coachNotes: 'id, userId, createdAt, updatedAt',
      proposals: 'id, userId, status, createdAt, updatedAt',
      apiTokens: 'id, userId, updatedAt',
      outbox: '++seq, table, rowId, createdAt',
      meta: 'key',
    })
  }
}

export const db = new CoachDb()

// ─── мета-значения ──────────────────────────────────────────────────────────
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export const META = {
  userId: 'auth:userId',
  email: 'auth:email',
  localOnly: 'auth:localOnly',
  cursor: (table: string) => `sync:cursor:${table}`,
  lastSyncAt: 'sync:lastSyncAt',
  activeSessionId: 'workout:activeSessionId',
  theme: 'ui:theme',
  installPromptSeen: 'ui:installPromptSeen',
} as const

/** Какой тип строки лежит в какой таблице — чтобы save() проверял поля. */
export interface TableTypes {
  profiles: Profile
  exercises: Exercise
  userExercisePrefs: UserExercisePref
  programs: Program
  programDays: ProgramDay
  programExercises: ProgramExercise
  calendarEvents: CalendarEvent
  sessions: WorkoutSession
  sessionExercises: SessionExercise
  sets: SetRow
  personalRecords: PersonalRecord
  bodyMetrics: BodyMetric
  savedMeals: SavedMeal
  nutritionEntries: NutritionEntry
  readinessCheckins: ReadinessCheckin
  coachNotes: CoachNote
  proposals: Proposal
  apiTokens: ApiToken
}

export type TableName = keyof TableTypes
