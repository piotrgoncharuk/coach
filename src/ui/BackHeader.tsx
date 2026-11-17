import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function BackHeader({ title, action }: { title: string; action?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="pt-safe px-safe sticky top-0 z-10 bg-bg/90 backdrop-blur">
      <div className="flex min-h-touch items-center gap-1 py-1">
        <button
          onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}
          aria-label="Назад"
          className="-ml-3 flex size-touch shrink-0 items-center justify-center text-accent"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 truncate text-sm text-fg-2">{title}</div>
        {action}
      </div>
    </header>
  )
}
