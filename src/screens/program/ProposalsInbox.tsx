import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../lib/db'
import { acceptProposal, pendingProposals, previewProposal, rejectProposal } from '../../lib/coach'
import { Badge, Button, Card } from '../../ui/components'
import { DiffList } from './DiffList'

/**
 * Входящие правки от тренера. Программа меняется только по кнопке «Принять»,
 * и до этого видно построчно, что было и что станет.
 */
export function ProposalsInbox() {
  const views = useLiveQuery(async () => {
    await db.programExercises.count()
    return Promise.all((await pendingProposals()).map(previewProposal))
  }, [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!views?.length) return null
  return (
    <>
      {views.map(({ row, diff, errors }) => (
        <Card key={row.id} className="border-accent">
          <div className="flex items-center gap-2">
            <Badge tone="accent">{row.source === 'coach' ? 'правка тренера' : 'вставленная правка'}</Badge>
            <span className="text-xs text-fg-3">{new Date(row.createdAt).toLocaleDateString('ru-RU')}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold">{row.title}</h2>
          {row.rationale && <p className="mt-1 text-sm text-fg-2">{row.rationale}</p>}
          <div className="mt-3">
            {errors.length ? (
              <div className="rounded-card bg-danger/10 p-3 text-sm text-danger">
                <p className="font-semibold">Правку нельзя применить к текущей программе:</p>
                <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            ) : diff.length ? (
              <DiffList lines={diff} />
            ) : (
              <p className="text-sm text-fg-3">Правка ничего не меняет в программе.</p>
            )}
          </div>
          {error && busy === null && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button disabled={busy === row.id} onClick={() => void rejectProposal(row)}>Отклонить</Button>
            <Button variant="primary" disabled={!!errors.length || busy === row.id} onClick={() => {
              setBusy(row.id)
              setError(null)
              void acceptProposal(row).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(null))
            }}>Принять</Button>
          </div>
          <p className="mt-2 text-xs text-fg-3">Принятая правка станет новой версией программы — к прежней можно откатиться.</p>
        </Card>
      ))}
    </>
  )
}
