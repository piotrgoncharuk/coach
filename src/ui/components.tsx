import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { fmtKg } from '../domain/math'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-black font-semibold active:bg-accent-press',
  secondary: 'bg-raised text-fg border border-border active:bg-border',
  ghost: 'text-fg-2 active:bg-raised',
  danger: 'bg-danger/15 text-danger border border-danger/30 active:bg-danger/25',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Главное действие экрана: высота 64px, во всю ширину. */
  size?: 'md' | 'action'
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-card select-none transition-colors disabled:opacity-40'
  const dims = size === 'action' ? 'h-action w-full text-xl font-semibold' : 'min-h-touch px-4'
  return <button className={`${base} ${dims} ${BUTTON_STYLES[variant]} ${className}`} {...rest} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-border bg-surface p-4 ${className}`}>{children}</div>
  )
}

export function Screen({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pb-28">
      {title && (
        <header className="pt-safe px-safe sticky top-0 z-10 bg-bg/90 backdrop-blur">
          <div className="flex min-h-touch items-center justify-between py-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            {action}
          </div>
        </header>
      )}
      <div className="px-safe space-y-3 pt-1">{children}</div>
    </div>
  )
}

/**
 * Степпер для веса и повторов: крупная цифра, кнопки по 56px по краям.
 * Клавиатура не открывается, пока не нажмёшь на саму цифру.
 */
export function Stepper({
  value,
  step,
  min = 0,
  max = 9999,
  unit,
  label,
  onChange,
  decimals = 0,
}: {
  value: number
  step: number
  min?: number
  max?: number
  unit?: string
  label: string
  decimals?: number
  onChange: (next: number) => void
}) {
  const clampAndSet = (next: number) => {
    const rounded = Math.round(next * 100) / 100
    onChange(Math.min(max, Math.max(min, rounded)))
  }
  const text = decimals ? fmtKg(value) : String(value)

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs uppercase leading-tight tracking-wide text-fg-3">
        {label}
      </span>
      <button
        aria-label={`${label}: меньше на ${step}`}
        onClick={() => clampAndSet(value - step)}
        className="h-14 w-14 shrink-0 rounded-card border border-border bg-raised text-2xl text-fg-2 active:bg-border"
      >
        −
      </button>
      <div className="flex h-14 min-w-0 flex-1 items-baseline justify-center rounded-card bg-raised px-1">
        <output className="tnum text-4xl font-semibold leading-[3.5rem]">{text}</output>
        {unit && <span className="ml-1 text-sm text-fg-3">{unit}</span>}
      </div>
      <button
        aria-label={`${label}: больше на ${step}`}
        onClick={() => clampAndSet(value + step)}
        className="h-14 w-14 shrink-0 rounded-card border border-border bg-raised text-2xl text-fg-2 active:bg-border"
      >
        +
      </button>
    </div>
  )
}

export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-20 shrink-0 text-xs uppercase leading-tight tracking-wide text-fg-3">{label}</span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={`h-11 shrink-0 rounded-full px-3.5 text-base ${
              o.value === value
                ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent'
                : 'bg-raised text-fg-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-fg-2">{label}</span>
      <input
        className={`min-h-touch w-full rounded-card border border-border bg-raised px-3 text-fg placeholder:text-fg-3 ${className}`}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-fg-3">{hint}</span>}
    </label>
  )
}

export function EmptyState({
  icon = '·',
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
      <div className="text-3xl text-fg-3" aria-hidden>
        {icon}
      </div>
      <div className="text-lg font-semibold">{title}</div>
      {text && <p className="max-w-xs text-sm text-fg-2">{text}</p>}
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-raised ${className}`} aria-hidden />
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'yellow' | 'red' | 'accent' | 'record'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-raised text-fg-2',
    green: 'bg-success/15 text-success',
    yellow: 'bg-warn/15 text-warn',
    red: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-accent',
    record: 'bg-record/15 text-record',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
