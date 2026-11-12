/** uuid v4. В Safari с https и на localhost crypto.randomUUID есть; иначе — запасной путь. */
export function newId(): string {
  const c: Crypto = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Локальный идентификатор пользователя до входа — чтобы приложение работало сразу. */
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001'
