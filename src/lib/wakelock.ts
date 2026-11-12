/**
 * Экран не должен гаснуть во время тренировки: телефон лежит на лавке,
 * а таймер и подсказка веса должны быть видны.
 *
 * Screen Wake Lock работает в Safari с iOS 16.4. Блокировка снимается, когда
 * страница уходит с экрана, поэтому её нужно брать заново при возвращении.
 */
let sentinel: WakeLockSentinel | null = null
let wanted = false

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

async function acquire(): Promise<void> {
  if (!supported() || !wanted || sentinel) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // Запрет пользователя, низкий заряд, фоновая страница — не повод ломать тренировку.
    sentinel = null
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void acquire()
}

export async function keepScreenAwake(): Promise<void> {
  wanted = true
  document.addEventListener('visibilitychange', onVisibility)
  await acquire()
}

export async function releaseScreen(): Promise<void> {
  wanted = false
  document.removeEventListener('visibilitychange', onVisibility)
  try {
    await sentinel?.release()
  } catch {
    // уже отпущена
  }
  sentinel = null
}

export function isWakeLockSupported(): boolean {
  return supported()
}
