import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { diffSnapshots, humanDate, localDate, type DiffLine } from '../../domain'
import { db } from '../../lib/db'
import { listVersions, loadSnapshot, rollbackTo } from '../../lib/program'
import type { Program } from '../../lib/models'
import { BackHeader } from '../../ui/BackHeader'
import { Badge, Button, Card, EmptyState, SkeletonList } from '../../ui/components'
import { Confirm } from '../../ui/Sheet'
import { DiffList } from './DiffList'

export function VersionsScreen() {
  const navigate = useNavigate()
  const [target, setTarget] = useState<Program | null>(null)
  const data = useLiveQuery(async () => {
    const versions = await listVersions()
    const out: { v: Program; diff: DiffLine[] }[] = []
    const allEx = new Map((await db.exercises.toArray()).map((e) => [e.id, e.nameRu]))
    for (let i = 0; i < versions.length; i++) {
      const cur = await loadSnapshot(versions[i].id)
      const prev = versions[i + 1] ? await loadSnapshot(versions[i + 1].id) : null
      out.push({ v: versions[i], diff: cur && prev ? diffSnapshots(prev, cur, (id) => allEx.get(id) ?? id) : [] })
    }
    return out
  }, [])

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Версии программы" />
      <div className="px-safe space-y-3">
        <h1 className="text-xl font-semibold">Версии</h1>
        {!data ? <SkeletonList rows={3} /> : data.length === 0 ? <EmptyState title="Версий пока нет" /> : data.map(({ v, diff }, i) => (
          <Card key={v.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Версия {v.version} {v.isActive && <Badge tone="accent">текущая</Badge>}</div>
                <div className="text-sm text-fg-3">{v.name} · {humanDate(localDate(new Date(v.updatedAt)), false)}</div>
              </div>
              {!v.isActive && <Button onClick={() => setTarget(v)}>Откатиться</Button>}
            </div>
            {i < data.length - 1 && (diff.length ? <div className="mt-2"><DiffList lines={diff} /></div> : <p className="mt-2 text-sm text-fg-3">Без изменений в упражнениях.</p>)}
          </Card>
        ))}
      </div>
      <Confirm open={!!target} title={`Откатиться к версии ${target?.version}?`} confirm="Откатиться"
        text="Будет создана новая версия с содержимым выбранной. Текущая останется в истории."
        onClose={() => setTarget(null)} onConfirm={() => void rollbackTo(target!.id).then(() => navigate('/program'))} />
    </div>
  )
}
