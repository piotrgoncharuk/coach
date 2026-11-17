import { db, META, REMOTE_BY_LOCAL, getMeta, setMeta, type TableName, type TableTypes } from './db'
import { LOCAL_USER_ID, newId } from './ids'
import type { Syncable } from './models'

let cachedUserId: string | null = null

/** Кто сейчас пишет данные. До входа — локальный идентификатор. */
export async function currentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId
  cachedUserId = await getMeta<string>(META.userId, LOCAL_USER_ID)
  return cachedUserId
}

export function currentUserIdSync(): string {
  return cachedUserId ?? LOCAL_USER_ID
}

export async function setCurrentUserId(id: string): Promise<void> {
  cachedUserId = id
  await setMeta(META.userId, id)
}

/** Время правки берём один раз на операцию, чтобы строка и очередь совпадали. */
function now(): string {
  return new Date().toISOString()
}

/**
 * Запись в локальную базу и в очередь отправки — одной транзакцией.
 * Либо правка видна в приложении и стоит в очереди, либо не произошло ничего:
 * состояния «записал, но отправить забыл» не существует.
 */
export async function save<K extends TableName>(
  table: K,
  row: Partial<TableTypes[K]> & { id?: string },
): Promise<TableTypes[K]> {
  const def = REMOTE_BY_LOCAL.get(table)
  if (!def) throw new Error(`Неизвестная таблица: ${table}`)

  const userId = await currentUserId()
  const id = row.id ?? newId()
  const ts = now()
  const target = db.table(table)

  return db.transaction('rw', [target, db.outbox], async () => {
    const existing = (await target.get(id)) as TableTypes[K] | undefined
    const owner =
      def.ownerField === 'id' ? { id } : { [def.ownerField]: userId }
    const next = {
      ...(existing ?? {}),
      ...owner,
      ...row,
      id,
      updatedAt: ts,
    } as TableTypes[K]

    await target.put(next)
    await enqueue(table, id, next as unknown as Record<string, unknown>, ts)
    return next
  })
}

/** Мягкое удаление. Строка остаётся и в базе, и в истории — помечается меткой. */
export async function softDelete(table: TableName, id: string): Promise<void> {
  await save(table, { id, deletedAt: now() })
}

/**
 * Очередь отправки без дублей: повторная правка той же строки заменяет
 * предыдущую запись в очереди, а не добавляет вторую. Иначе нажатие «+2,5 кг»
 * десять раз подряд создало бы десять отправок одного и того же подхода.
 */
async function enqueue(
  table: string,
  rowId: string,
  payload: Record<string, unknown>,
  ts: string,
): Promise<void> {
  const pending = await db.outbox.where('rowId').equals(rowId).first()
  if (pending?.seq !== undefined && pending.table === table) {
    await db.outbox.update(pending.seq, { payload, createdAt: ts, tries: 0, lastError: null })
    return
  }
  await db.outbox.add({ table, rowId, payload, createdAt: ts, tries: 0 })
}

/** Сколько правок ещё не на сервере. */
export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

/** Живые строки: мягко удалённые скрыты. */
export function alive<T extends Syncable>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt)
}

/**
 * Записать строку как есть, с её собственным временем правки, и поставить в
 * очередь. Нужно для восстановления из копии: обычный save() поставил бы
 * текущее время, и старая запись из копии перебила бы более новую на сервере.
 */
export async function putRaw(table: TableName, row: Syncable): Promise<void> {
  const target = db.table(table)
  await db.transaction('rw', [target, db.outbox], async () => {
    await target.put(row)
    await enqueue(table, row.id, row as unknown as Record<string, unknown>, row.updatedAt)
  })
}
