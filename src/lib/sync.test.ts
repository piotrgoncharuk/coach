import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, META, getMeta, setMeta } from './db'
import { save, softDelete, pendingCount } from './repo'
import { push, pull, normalizeRow, type RemoteClient } from './sync'
import { setCurrentUserId } from './repo'

const USER = '11111111-1111-1111-1111-111111111111'

/** Поддельный сервер: помнит, что ему отправили, и умеет отдавать строки. */
function stubRemote(opts: { failOn?: string; rows?: Record<string, Record<string, unknown>[]> } = {}) {
  const sent: { table: string; rows: Record<string, unknown>[] }[] = []
  const remote: RemoteClient = {
    async upsert(table, rows) {
      if (opts.failOn === table) return { error: 'сеть недоступна' }
      sent.push({ table, rows })
      return { error: null }
    },
    async fetchSince(table, cursor) {
      const all = opts.rows?.[table] ?? []
      const rows = all.filter((r) => String(r.server_updated_at) > cursor)
      return { rows, error: null }
    },
  }
  return { remote, sent }
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setCurrentUserId(USER)
})

describe('запись в локальную базу', () => {
  it('строка и очередь отправки появляются вместе', async () => {
    const row = await save('sessions', { date: '2026-11-12', status: 'active' })
    expect(await db.sessions.get(row.id)).toMatchObject({ date: '2026-11-12', userId: USER })
    expect(await pendingCount()).toBe(1)
  })

  it('повторная правка той же строки не плодит записи в очереди', async () => {
    const row = await save('sets', { weightKg: 80, reps: 5, exerciseId: 'e', sessionExerciseId: 's' })
    await save('sets', { id: row.id, weightKg: 82.5 })
    await save('sets', { id: row.id, weightKg: 85 })
    expect(await pendingCount()).toBe(1)
    const item = await db.outbox.toCollection().first()
    expect((item!.payload as { weightKg: number }).weightKg).toBe(85)
  })

  it('мягкое удаление — это правка, строка остаётся на месте', async () => {
    const row = await save('sets', { weightKg: 80, reps: 5 })
    await softDelete('sets', row.id)
    const stored = await db.sets.get(row.id)
    expect(stored).toBeDefined()
    expect(stored!.deletedAt).toBeTruthy()
  })

  it('время правки растёт при каждом изменении', async () => {
    const first = await save('sessions', { date: '2026-11-12' })
    await new Promise((r) => setTimeout(r, 2))
    const second = await save('sessions', { id: first.id, note: 'правка' })
    expect(second.updatedAt > first.updatedAt).toBe(true)
  })
})

describe('отправка очереди', () => {
  it('переводит поля в snake_case и не отправляет служебное время сервера', async () => {
    await save('sets', { weightKg: 80, reps: 5, sessionExerciseId: 'se', exerciseId: 'ex', serverUpdatedAt: '2026-01-01T00:00:00.000Z' })
    const { remote, sent } = stubRemote()
    await push(remote)
    expect(sent[0].table).toBe('sets')
    expect(sent[0].rows[0]).toHaveProperty('weight_kg', 80)
    expect(sent[0].rows[0]).toHaveProperty('session_exercise_id', 'se')
    expect(sent[0].rows[0]).not.toHaveProperty('server_updated_at')
    expect(await pendingCount()).toBe(0)
  })

  it('родительские строки уезжают раньше дочерних', async () => {
    const session = await save('sessions', { date: '2026-11-12' })
    const se = await save('sessionExercises', { sessionId: session.id, exerciseId: 'ex', orderIndex: 0 })
    await save('sets', { sessionExerciseId: se.id, exerciseId: 'ex', weightKg: 80, reps: 5 })
    const { remote, sent } = stubRemote()
    await push(remote)
    expect(sent.map((s) => s.table)).toEqual(['sessions', 'session_exercises', 'sets'])
  })

  it('при ошибке сети правки остаются в очереди — данные не теряются', async () => {
    await save('sessions', { date: '2026-11-12' })
    const { remote } = stubRemote({ failOn: 'sessions' })
    const res = await push(remote)
    expect(res.failed).toBe(1)
    expect(await pendingCount()).toBe(1)
    const item = await db.outbox.toCollection().first()
    expect(item!.tries).toBe(1)
    expect(item!.lastError).toBe('сеть недоступна')
  })

  it('после восстановления сети та же очередь уходит целиком', async () => {
    await save('sessions', { date: '2026-11-12' })
    await push(stubRemote({ failOn: 'sessions' }).remote)
    const { remote, sent } = stubRemote()
    await push(remote)
    expect(sent).toHaveLength(1)
    expect(await pendingCount()).toBe(0)
  })
})

describe('вычитка с сервера', () => {
  const remoteRow = (over: Record<string, unknown> = {}) => ({
    id: 'aaaa', user_id: USER, date: '2026-11-10', status: 'finished',
    updated_at: '2026-11-10T10:00:00.123456+00:00',
    server_updated_at: '2026-11-10T10:00:00.123456+00:00',
    deleted_at: null, ...over,
  })

  it('приводит время сервера к одному виду с устройством', () => {
    const r = normalizeRow({ updatedAt: '2026-11-10T10:00:00.123456+00:00' })
    expect(r.updatedAt).toBe('2026-11-10T10:00:00.123Z')
  })

  it('новая строка с сервера появляется локально', async () => {
    const { remote } = stubRemote({ rows: { sessions: [remoteRow()] } })
    await pull(remote)
    expect(await db.sessions.get('aaaa')).toMatchObject({ date: '2026-11-10', status: 'finished' })
  })

  it('более свежая местная правка не затирается сервером', async () => {
    await save('sessions', { id: 'aaaa', date: '2026-11-10', note: 'правка на телефоне' })
    const { remote } = stubRemote({ rows: { sessions: [remoteRow({ note: 'старое' })] } })
    await pull(remote)
    expect((await db.sessions.get('aaaa'))!.note).toBe('правка на телефоне')
  })

  it('более свежая серверная версия побеждает местную', async () => {
    await save('sessions', { id: 'aaaa', date: '2026-11-10', note: 'старое на телефоне' })
    const { remote } = stubRemote({
      rows: { sessions: [remoteRow({ note: 'свежее с сервера', updated_at: '2099-01-01T00:00:00+00:00' })] },
    })
    await pull(remote)
    expect((await db.sessions.get('aaaa'))!.note).toBe('свежее с сервера')
  })

  it('курсор двигается и второй раз то же самое не вычитывается', async () => {
    const { remote } = stubRemote({ rows: { sessions: [remoteRow()] } })
    const first = await pull(remote)
    expect(first.applied).toBe(1)
    expect(await getMeta(META.cursor('sessions'), '')).toBe('2026-11-10T10:00:00.123456+00:00')
    const second = await pull(remote)
    expect(second.applied).toBe(0)
  })

  it('не зацикливается, если сервер отдаёт то же время прихода', async () => {
    await setMeta(META.cursor('sessions'), '1970-01-01T00:00:00+00:00')
    const rows = [remoteRow({ id: 'x1' }), remoteRow({ id: 'x2' })]
    const remote: RemoteClient = {
      async upsert() { return { error: null } },
      async fetchSince() { return { rows, error: null } },
    }
    await pull(remote) // не должно зависнуть
    expect(await db.sessions.count()).toBe(2)
  })
})
