import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { save, setCurrentUserId, pendingCount } from './repo'
import { adoptLocalData, ensureProfile } from './auth'
import { LOCAL_USER_ID } from './ids'

const REAL_USER = '99999999-9999-4999-8999-999999999999'

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(LOCAL_USER_ID)
})

describe('первый вход после работы без аккаунта', () => {
  it('переносит записи на настоящего пользователя и ставит их в очередь', async () => {
    const s = await save('sessions', { date: '2026-11-12' })
    await save('sets', { sessionExerciseId: 'se', exerciseId: 'ex', weightKg: 80, reps: 5 })
    await db.outbox.clear()

    const moved = await adoptLocalData(REAL_USER)

    expect(moved).toBe(2)
    expect((await db.sessions.get(s.id))!.userId).toBe(REAL_USER)
    expect(await pendingCount()).toBe(2)
    expect(await db.sessions.where('userId').equals(LOCAL_USER_ID).count()).toBe(0)
  })

  it('переносит профиль под новый идентификатор', async () => {
    await ensureProfile(LOCAL_USER_ID, 'Пётр')
    await db.outbox.clear()

    await adoptLocalData(REAL_USER)

    expect(await db.profiles.get(LOCAL_USER_ID)).toBeUndefined()
    expect((await db.profiles.get(REAL_USER))!.displayName).toBe('Пётр')
  })

  it('не трогает профиль, если у настоящего пользователя он уже есть', async () => {
    await ensureProfile(LOCAL_USER_ID, 'локальный')
    await ensureProfile(REAL_USER, 'настоящий')
    await adoptLocalData(REAL_USER)
    expect((await db.profiles.get(REAL_USER))!.displayName).toBe('настоящий')
  })

  it('повторный вызов ничего не дублирует', async () => {
    await save('sessions', { date: '2026-11-12' })
    await adoptLocalData(REAL_USER)
    await db.outbox.clear()
    expect(await adoptLocalData(REAL_USER)).toBe(0)
  })
})
