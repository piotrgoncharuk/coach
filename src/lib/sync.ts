import { SYNC_TABLES, db, getMeta, setMeta, META } from './db'
import { toCamel, toSnake } from './case'
import { pickWinner } from '../domain/merge'
import type { Syncable } from './models'
import { getSupabase, isCloudConfigured } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE = 500
const EPOCH = '1970-01-01T00:00:00+00:00'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'local-only'

export interface SyncStatus {
  state: SyncState
  /** Сколько правок ещё не на сервере. */
  pending: number
  lastSyncAt: string | null
  error: string | null
}

/** Минимальный интерфейс клиента — чтобы движок можно было проверить тестами. */
export interface RemoteClient {
  upsert(remoteTable: string, rows: Record<string, unknown>[]): Promise<{ error: string | null }>
  fetchSince(
    remoteTable: string,
    cursor: string,
    limit: number,
  ): Promise<{ rows: Record<string, unknown>[]; error: string | null }>
}

export function supabaseRemote(client: SupabaseClient | null): RemoteClient | null {
  if (!client) return null
  return {
    async upsert(remoteTable, rows) {
      const { error } = await client.from(remoteTable).upsert(rows, { onConflict: 'id' })
      return { error: error ? error.message : null }
    },
    async fetchSince(remoteTable, cursor, limit) {
      const { data, error } = await client
        .from(remoteTable)
        .select('*')
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      return { rows: (data ?? []) as Record<string, unknown>[], error: error ? error.message : null }
    },
  }
}

// ─── наблюдаемое состояние ──────────────────────────────────────────────────
let status: SyncStatus = {
  state: isCloudConfigured ? 'idle' : 'local-only',
  pending: 0,
  lastSyncAt: null,
  error: null,
}
const listeners = new Set<(s: SyncStatus) => void>()

export function getSyncStatus(): SyncStatus {
  return status
}

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function patchStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  for (const fn of listeners) fn(status)
}

export async function refreshPending(): Promise<void> {
  patchStatus({ pending: await db.outbox.count() })
}

// ─── нормализация времени ───────────────────────────────────────────────────
/**
 * Postgres отдаёт «2026-11-12T10:00:00.123456+00:00», а устройство пишет
 * «2026-11-12T10:00:00.123Z». Сравнивать такие строки напрямую нельзя,
 * поэтому всё, что заканчивается на At, приводим к одному виду.
 */
export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('At') && typeof v === 'string') {
      const ms = Date.parse(v)
      out[k] = Number.isNaN(ms) ? v : new Date(ms).toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

/** Служебные поля сервера клиент не отправляет: их выставляет сам сервер. */
function stripServerFields(payload: Record<string, unknown>): Record<string, unknown> {
  const { serverUpdatedAt: _drop, ...rest } = payload
  return toSnake(rest)
}

// ─── отправка ───────────────────────────────────────────────────────────────
/**
 * Отправка очереди. Таблицы идут в порядке объявления, поэтому родительские
 * строки уезжают раньше дочерних. При ошибке таблица останавливается, а правки
 * остаются в очереди — следующая попытка начнёт с того же места.
 */
export async function push(remote: RemoteClient): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const def of SYNC_TABLES) {
    if (def.readOnly) continue
    const items = await db.outbox.where('table').equals(def.local).sortBy('seq')
    if (items.length === 0) continue

    // одна строка — одна отправка: берём последнюю версию
    const latest = new Map<string, { seqs: number[]; payload: Record<string, unknown> }>()
    for (const item of items) {
      const entry = latest.get(item.rowId) ?? { seqs: [], payload: item.payload }
      entry.payload = item.payload
      if (item.seq !== undefined) entry.seqs.push(item.seq)
      latest.set(item.rowId, entry)
    }

    const rows = [...latest.values()].map((e) => stripServerFields(e.payload))
    const { error } = await remote.upsert(def.remote, rows)

    if (error) {
      failed += rows.length
      const seqs = [...latest.values()].flatMap((e) => e.seqs)
      await db.transaction('rw', db.outbox, async () => {
        for (const seq of seqs) {
          const item = await db.outbox.get(seq)
          if (item) await db.outbox.update(seq, { tries: item.tries + 1, lastError: error })
        }
      })
      patchStatus({ state: 'error', error: error })
      continue
    }

    await db.outbox.bulkDelete([...latest.values()].flatMap((e) => e.seqs))
    sent += rows.length
  }

  return { sent, failed }
}

// ─── вычитка ────────────────────────────────────────────────────────────────
/**
 * Вычитка изменений. Курсор — server_updated_at последней полученной строки,
 * поэтому правка, сделанная офлайн вчера, не потеряется: на сервер она попадёт
 * сегодня и получит сегодняшнее время прихода.
 */
export async function pull(remote: RemoteClient): Promise<{ applied: number }> {
  let applied = 0

  for (const def of SYNC_TABLES) {
    let cursor = await getMeta<string>(META.cursor(def.local), EPOCH)

    for (;;) {
      const { rows, error } = await remote.fetchSince(def.remote, cursor, PAGE)
      if (error) {
        patchStatus({ state: 'error', error })
        break
      }
      if (rows.length === 0) break

      const target = db.table(def.local)
      await db.transaction('rw', target, async () => {
        for (const raw of rows) {
          const row = normalizeRow(toCamel(raw)) as unknown as Syncable
          const local = (await target.get(row.id)) as Syncable | undefined
          if (!local || pickWinner(local, row) === 'remote') {
            await target.put(row)
            applied++
          }
        }
      })

      const nextCursor = String(rows[rows.length - 1].server_updated_at ?? '')
      // защита от зацикливания, если сервер отдаёт то же самое время
      if (!nextCursor || nextCursor === cursor) break
      cursor = nextCursor
      await setMeta(META.cursor(def.local), cursor)
      if (rows.length < PAGE) break
    }
  }

  return { applied }
}

// ─── полный цикл ────────────────────────────────────────────────────────────
let running: Promise<SyncStatus> | null = null

/** Отправить своё, забрать чужое. Два одновременных вызова не мешают друг другу. */
export async function syncNow(remoteArg?: RemoteClient | null): Promise<SyncStatus> {
  const remote = remoteArg === undefined ? supabaseRemote(await getSupabase()) : remoteArg
  if (!remote) {
    patchStatus({ state: 'local-only', pending: await db.outbox.count() })
    return status
  }
  if (running) return running

  running = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      patchStatus({ state: 'offline', pending: await db.outbox.count() })
      return status
    }
    patchStatus({ state: 'syncing', error: null })
    try {
      await push(remote)
      await pull(remote)
      const pending = await db.outbox.count()
      const lastSyncAt = new Date().toISOString()
      await setMeta(META.lastSyncAt, lastSyncAt)
      patchStatus({
        state: pending > 0 ? 'error' : 'idle',
        pending,
        lastSyncAt,
        error: pending > 0 ? status.error : null,
      })
    } catch (e) {
      patchStatus({ state: 'error', error: e instanceof Error ? e.message : String(e), pending: await db.outbox.count() })
    }
    return status
  })()

  try {
    return await running
  } finally {
    running = null
  }
}

/**
 * Синхронизация запускается при старте, возврате приложения на экран,
 * появлении сети и после записи данных. Фоновой синхронизации в Safari на iOS
 * нет, поэтому других поводов не существует.
 */
export function startAutoSync(): () => void {
  if (!isCloudConfigured) return () => {}
  const trigger = () => void syncNow()

  const onVisible = () => {
    if (document.visibilityState === 'visible') trigger()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', trigger)
  window.addEventListener('focus', trigger)
  trigger()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', trigger)
    window.removeEventListener('focus', trigger)
  }
}
