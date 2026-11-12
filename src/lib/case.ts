/** Postgres живёт в snake_case, приложение — в camelCase. Перевод в одном месте. */

export function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

type Dict = Record<string, unknown>

export function toSnake<T extends Dict>(obj: T): Dict {
  const out: Dict = {}
  for (const [k, v] of Object.entries(obj)) out[snakeKey(k)] = v
  return out
}

export function toCamel<T extends Dict>(obj: T): Dict {
  const out: Dict = {}
  for (const [k, v] of Object.entries(obj)) out[camelKey(k)] = v
  return out
}
