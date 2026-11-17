import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSyncStatus, onSyncStatus, refreshPending, syncNow, type SyncStatus } from '../lib/sync'
import { db } from '../lib/db'
import { isCloudConfigured } from '../lib/supabase'
import { IconCloud } from './icons'
import { Sheet } from './Sheet'
import { Button } from './components'

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

/** Значок синхронизации; касание — подробности: что не отправлено и почему. */
export function SyncBadge() {
  const [status, setStatus] = useState(getSyncStatus())
  const [open, setOpen] = useState(false)
  const failed = useLiveQuery(async () => (await db.outbox.toArray()).filter((o) => o.tries > 0), [open])

  useEffect(() => {
    void refreshPending()
    return onSyncStatus(setStatus)
  }, [])

  // в локальном режиме отправлять некуда, и счётчик очереди только пугает
  const pending = status.state !== 'local-only' && status.pending > 0 ? ` · ${status.pending}` : ''

  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex min-h-touch items-center gap-1.5 px-2 text-xs ${TONE[status.state]}`} aria-label={`${LABEL[status.state]}${pending}. Подробнее`}>
        <IconCloud />
        <span>{LABEL[status.state]}{pending}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Синхронизация">
        <div className="space-y-3 text-sm">
          {!isCloudConfigured ? (
            <p className="text-fg-2">Сервер не подключён: всё хранится на этом устройстве, ничего не теряется. Когда появятся ключи Supabase и вход, накопленные записи уедут на сервер сами.</p>
          ) : (
            <>
              <p>{LABEL[status.state]}. {status.pending ? `В очереди ${status.pending} правок — они сохранены на устройстве и уйдут при следующей синхронизации.` : 'Очередь пуста.'}</p>
              {status.lastSyncAt && <p className="text-fg-3">Последняя синхронизация: {new Date(status.lastSyncAt).toLocaleString('ru-RU')}</p>}
              {status.state === 'offline' && <p className="text-fg-2">Нет сети. Записывай дальше — синхронизация запустится сама, когда сеть появится.</p>}
              {status.error && <p className="rounded-card bg-warn/10 p-3 text-warn">Ошибка сервера: {status.error}</p>}
              {!!failed?.length && <p className="text-fg-3">Попыток с ошибкой: {failed.length}. Данные не потеряны — они ждут в очереди.</p>}
              <Button variant="primary" className="w-full" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>Синхронизировать сейчас</Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  )
}
