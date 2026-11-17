/**
 * Просим браузер не вычищать локальную базу при нехватке места. Safari может
 * удалить данные сайта, если им долго не пользоваться; с домашнего экрана риск
 * почти нулевой, но просьба ничего не стоит. Ответ браузер даёт сам — без окна.
 */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageInfo(): Promise<{ persisted: boolean | null; usedMb: number | null }> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null
    return { persisted, usedMb: est?.usage != null ? Math.round((est.usage / 1024 / 1024) * 10) / 10 : null }
  } catch {
    return { persisted: null, usedMb: null }
  }
}
