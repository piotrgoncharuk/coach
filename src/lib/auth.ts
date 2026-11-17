import { db, META, setMeta, SYNC_TABLES } from './db'
import { LOCAL_USER_ID, newId } from './ids'
import { currentUserId, setCurrentUserId } from './repo'
import { getSupabase } from './supabase'
import type { Profile } from './models'

export interface AuthUser {
  id: string
  email: string | null
  /** true — вход не настроен или не выполнен, работаем на устройстве. */
  local: boolean
}

let current: AuthUser = { id: LOCAL_USER_ID, email: null, local: true }
const listeners = new Set<(u: AuthUser) => void>()

export function getUser(): AuthUser {
  return current
}

export function onAuthChange(fn: (u: AuthUser) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(user: AuthUser): void {
  current = user
  for (const fn of listeners) fn(user)
}

/** Запуск: поднимаем сохранённую сессию или остаёмся в локальном режиме. */
export async function initAuth(): Promise<AuthUser> {
  const supabase = await getSupabase()
  if (!supabase) {
    const id = await currentUserId()
    emit({ id, email: null, local: true })
    return current
  }

  const { data } = await supabase.auth.getSession()
  const sessionUser = data.session?.user
  if (sessionUser) {
    await adoptLocalData(sessionUser.id)
    await setCurrentUserId(sessionUser.id)
    await setMeta(META.email, sessionUser.email ?? null)
    emit({ id: sessionUser.id, email: sessionUser.email ?? null, local: false })
  } else {
    emit({ id: LOCAL_USER_ID, email: null, local: true })
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      const u = session?.user
      if (!u) {
        emit({ id: LOCAL_USER_ID, email: null, local: true })
        return
      }
      await adoptLocalData(u.id)
      await setCurrentUserId(u.id)
      await setMeta(META.email, u.email ?? null)
      emit({ id: u.id, email: u.email ?? null, local: false })
    })()
  })

  return current
}

/** Вход по ссылке из письма. Пароля нет вообще. */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await getSupabase()
  if (!supabase) return { error: 'Синхронизация не настроена: нет переменных окружения.' }
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  })
  return { error: error ? error.message : null }
}

/**
 * Выход. Локальные данные не стираем: это тот же телефон, и стирать записи
 * тренировок при выходе — худшее, что может сделать дневник.
 */
export async function signOut(): Promise<void> {
  const supabase = await getSupabase()
  if (supabase) await supabase.auth.signOut()
  emit({ id: LOCAL_USER_ID, email: null, local: true })
}

/**
 * Первый вход после работы в локальном режиме: переписываем владельца у всех
 * локальных строк и ставим их в очередь отправки, чтобы ничего не осталось
 * привязанным к несуществующему пользователю.
 */
export async function adoptLocalData(newUserId: string): Promise<number> {
  if (newUserId === LOCAL_USER_ID) return 0
  let moved = 0
  const ts = new Date().toISOString()

  for (const def of SYNC_TABLES) {
    if (def.ownerField !== 'userId') continue
    const table = db.table(def.local)
    const rows = (await table.where('userId').equals(LOCAL_USER_ID).toArray()) as {
      id: string
    }[]
    if (rows.length === 0) continue

    await db.transaction('rw', [table, db.outbox], async () => {
      for (const row of rows) {
        const next = { ...row, userId: newUserId, updatedAt: ts }
        await table.put(next)
        await db.outbox.add({
          table: def.local,
          rowId: row.id,
          payload: next as unknown as Record<string, unknown>,
          createdAt: ts,
          tries: 0,
        })
        moved++
      }
    })
  }

  // профиль хранится под идентификатором пользователя, поэтому переносим содержимое
  const localProfile = (await db.profiles.get(LOCAL_USER_ID)) as Profile | undefined
  if (localProfile) {
    const existing = await db.profiles.get(newUserId)
    if (!existing) {
      const next: Profile = { ...localProfile, id: newUserId, updatedAt: ts }
      await db.transaction('rw', [db.profiles, db.outbox], async () => {
        await db.profiles.put(next)
        await db.profiles.delete(LOCAL_USER_ID)
        await db.outbox.add({
          table: 'profiles',
          rowId: newUserId,
          payload: next as unknown as Record<string, unknown>,
          createdAt: ts,
          tries: 0,
        })
      })
      moved++
    }
  }

  return moved
}

/** Профиль создаётся сразу, чтобы приложением можно было пользоваться до входа. */
export async function ensureProfile(userId: string, displayName = ''): Promise<Profile> {
  const existing = (await db.profiles.get(userId)) as Profile | undefined
  if (existing) return existing
  const ts = new Date().toISOString()
  const profile: Profile = {
    id: userId,
    displayName,
    heightCm: null,
    birthDate: null,
    kcalTarget: 3000,
    proteinTarget: 190,
    weightGoalKg: null,
    weightRateKgWeek: null,
    theme: 'dark',
    restSecDefault: 120,
    limitations: [],
    onboardedAt: null,
    gymWeekdays: [],
    footballWeekdays: [],
    deloadStart: null,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.profiles.put(profile)
  await db.outbox.add({
    table: 'profiles',
    rowId: userId,
    payload: profile as unknown as Record<string, unknown>,
    createdAt: ts,
    tries: 0,
  })
  return profile
}

export { newId }
