import { isWakeLockSupported } from '../lib/wakelock'

export { isStandalone } from './Install'

export function isWakeLockSupportedLabel(): string {
  return isWakeLockSupported() ? 'поддерживается' : 'не поддерживается в этом браузере'
}
