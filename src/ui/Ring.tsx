/** Кольцо прогресса за день: цель — полный круг, перебор подсвечивается. */
export function Ring({ value, target, label, unit, size = 112 }: { value: number; target: number; label: string; unit: string; size?: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  const frac = target > 0 ? Math.min(1, value / target) : 0
  const over = target > 0 && value > target * 1.1
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${value} из ${target} ${unit}`}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--c-raised)" strokeWidth="10" />
        {frac > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={over ? 'var(--c-warn)' : 'var(--c-accent)'} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 50 50)" className="transition-[stroke-dasharray] duration-300" />}
        <text x="50" y="48" textAnchor="middle" className="fill-fg text-[20px] font-semibold tnum">{value}</text>
        <text x="50" y="64" textAnchor="middle" className="fill-fg-3 text-[10px]">из {target} {unit}</text>
      </svg>
      <figcaption className="mt-1 text-sm text-fg-2">{label}</figcaption>
    </figure>
  )
}

/** Шкала 1–5 крупными кнопками — чек-ин за 10 секунд. */
export function Scale({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-fg-2">{label}</span>
        <span className="text-xs text-fg-3">1 — {low}, 5 — {high}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            className={`tnum h-12 rounded-card text-lg ${value === n ? 'bg-accent font-semibold text-on-accent' : 'bg-raised text-fg-2'}`}>{n}</button>
        ))}
      </div>
    </div>
  )
}
