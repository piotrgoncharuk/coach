/** Любая синхронизируемая строка. Физического удаления нет — только метка deletedAt. */
export interface SyncRow {
  id: string
  updatedAt: string
  deletedAt?: string | null
}

export type Winner = 'local' | 'remote'

/**
 * Разрешение конфликта: last-write-wins по updatedAt.
 * При равных метках выигрывает сервер — так два устройства сходятся к одному значению.
 */
export function pickWinner<T extends SyncRow>(local: T | undefined, remote: T | undefined): Winner {
  if (!local) return 'remote'
  if (!remote) return 'local'
  return local.updatedAt > remote.updatedAt ? 'local' : 'remote'
}

export function resolve<T extends SyncRow>(local: T | undefined, remote: T | undefined): T {
  const winner = pickWinner(local, remote)
  const row = winner === 'local' ? local : remote
  return row as T
}

/** Слияние списков по id: для каждой строки побеждает более свежая версия. */
export function mergeById<T extends SyncRow>(locals: T[], remotes: T[]): T[] {
  const out = new Map<string, T>()
  for (const l of locals) out.set(l.id, l)
  for (const r of remotes) out.set(r.id, resolve(out.get(r.id), r))
  return [...out.values()]
}

export function isDeleted(row: SyncRow): boolean {
  return row.deletedAt != null
}
