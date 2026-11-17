import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './icons'

/**
 * Нижняя шторка: открывается у большого пальца, закрывается тапом по фону,
 * свайпом не закрывается — чтобы случайно не потерять ввод в зале.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/60" aria-label="Закрыть" onClick={onClose} tabIndex={-1} />
      <div
        ref={ref}
        tabIndex={-1}
        className="pb-safe relative flex max-h-[88dvh] flex-col rounded-t-lg border-t border-border bg-surface shadow-[var(--shadow-sheet)] outline-none"
      >
        <div className="flex min-h-touch items-center justify-between px-4 pt-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть" className="-mr-2 flex size-touch items-center justify-center text-fg-2">
            <IconClose />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">{children}</div>
        {footer && <div className="border-t border-border px-4 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Подтверждение необратимого или заметного действия. */
export function Confirm({
  open, title, text, confirm, danger, onConfirm, onClose,
}: {
  open: boolean; title: string; text: string; confirm: string; danger?: boolean
  onConfirm: () => void; onClose: () => void
}) {
  if (!open) return null
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-sm text-fg-2">{text}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={onClose} className="min-h-touch rounded-card border border-border bg-raised">Отмена</button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`min-h-touch rounded-card font-semibold ${danger ? 'bg-danger text-white' : 'bg-accent text-black'}`}
        >
          {confirm}
        </button>
      </div>
    </Sheet>
  )
}
