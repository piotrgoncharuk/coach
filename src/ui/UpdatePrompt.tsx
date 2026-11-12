import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './components'

/**
 * Новая версия не подменяется молча: в зале посреди тренировки это худший момент
 * для перезагрузки. Показываем полоску и даём нажать «Обновить» самому.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-raised px-4 pt-3">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <p className="flex-1 text-sm">Есть новая версия приложения.</p>
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          Потом
        </Button>
        <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
          Обновить
        </Button>
      </div>
    </div>
  )
}
