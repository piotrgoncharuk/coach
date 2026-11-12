import { useEffect, useState } from 'react'
import { getSyncStatus, onSyncStatus, refreshPending, syncNow, type SyncStatus } from '../lib/sync'
import { IconCloud } from './icons'

const LABEL: Record<SyncStatus['state'], string> = {
  idle: 'Синхронизировано',
  syncing: 'Синхронизация…',
  offline: 'Нет сети',
  error: 'Не отправлено',
  'local-only': 'Только на устройстве',
}

const TONE: Record<SyncStatus['state'], string> = {
  idle: 'text-fg-3',
  syncing: 'text-fg-2',
  offline: 'text-warn',
  error: 'text-warn',
  'local-only': 'text-fg-3',
}

export function SyncBadge() {
  const [status, setStatus] = useState(getSyncStatus())

  useEffect(() => {
    void refreshPending()
    return onSyncStatus(setStatus)
  }, [])

  // в локальном режиме отправлять некуда, и счётчик очереди только пугает
  const pending = status.state !== 'local-only' && status.pending > 0 ? ` · ${status.pending}` : ''

  return (
    <button
      onClick={() => void syncNow()}
      className={`flex min-h-touch items-center gap-1.5 px-2 text-xs ${TONE[status.state]}`}
      title={status.error ?? LABEL[status.state]}
    >
      <IconCloud />
      <span>
        {LABEL[status.state]}
        {pending}
      </span>
    </button>
  )
}
