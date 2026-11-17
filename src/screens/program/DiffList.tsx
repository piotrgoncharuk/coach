import type { DiffLine } from '../../domain'

const MARK = { added: { sign: '+', cls: 'text-success' }, removed: { sign: '−', cls: 'text-danger' }, changed: { sign: '~', cls: 'text-warn' } }

/** «Было / стало» по строкам — для версий программы и правок тренера. */
export function DiffList({ lines }: { lines: DiffLine[] }) {
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={`w-4 shrink-0 font-semibold ${MARK[l.kind].cls}`} aria-label={{ added: 'добавлено', removed: 'убрано', changed: 'изменено' }[l.kind]}>{MARK[l.kind].sign}</span>
          <div className="min-w-0">
            <div><span className="text-fg-3">{l.day}{l.exercise ? ' · ' : ''}</span>{l.exercise}</div>
            {l.before && <div className="text-fg-3"><span className="mr-1">было:</span><span className={l.kind === 'removed' ? 'line-through' : ''}>{l.before}</span></div>}
            {l.after && <div className="text-fg"><span className="mr-1 text-fg-3">стало:</span>{l.after}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
