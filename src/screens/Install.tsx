import { Button, Card, Screen } from '../ui/components'
import { IconShare } from '../ui/icons'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Экран установки на домашний экран. В Safari другого способа нет — только вручную. */
export function InstallScreen({ onDone }: { onDone: () => void }) {
  const installed = isStandalone()

  return (
    <Screen title="Как установить">
      {installed ? (
        <Card>
          <h2 className="font-semibold text-success">Приложение уже установлено</h2>
          <p className="mt-1 text-sm text-fg-2">
            Оно запущено с домашнего экрана: адресной строки нет, значит работает полный экран,
            офлайн-режим и сохранение данных без ограничения в семь дней.
          </p>
          <Button variant="primary" size="action" className="mt-4" onClick={onDone}>
            Понятно
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="font-semibold">Поставь иконку на домашний экран</h2>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">1</span>
                <span className="flex-1">
                  Нажми <IconShare className="inline align-text-bottom" width={18} height={18} /> «Поделиться» в нижней панели Safari
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">2</span>
                <span className="flex-1">Выбери «На экран „Домой“»</span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">3</span>
                <span className="flex-1">Открывай Coach с домашнего экрана, а не из браузера</span>
              </li>
            </ol>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold">Зачем это нужно</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-fg-2">
              <li>· Полный экран без адресной строки, и видно больше</li>
              <li>· Надёжнее офлайн: Safari не вычищает данные установленного приложения</li>
              <li>· Экран не гаснет во время тренировки</li>
              <li>· Появляется в переключателе приложений как обычная программа</li>
            </ul>
          </Card>

          <Button size="action" onClick={onDone}>
            Потом
          </Button>
        </>
      )}
    </Screen>
  )
}
