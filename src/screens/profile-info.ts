import { isWakeLockSupported } from '../lib/wakelock'

export { isStandalone } from '../lib/platform'

export function isWakeLockSupportedLabel(): string {
  return isWakeLockSupported() ? 'поддерживается' : 'не поддерживается в этом браузере'
}
