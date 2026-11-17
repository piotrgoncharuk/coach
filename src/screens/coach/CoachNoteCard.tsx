import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/db'
import { coachNotes } from '../../lib/coach'
import { Card } from '../../ui/components'

/** Последняя заметка тренера на главном экране. */
export function CoachNoteCard() {
  const navigate = useNavigate()
  const note = useLiveQuery(async () => {
    await db.coachNotes.count()
    return (await coachNotes(1))[0] ?? null
  }, [])
  const pending = useLiveQuery(async () => (await db.proposals.toArray()).filter((p) => p.status === 'pending' && !p.deletedAt).length, [])

  return (
    <>
      {!!pending && (
        <button onClick={() => navigate('/program')} className="w-full rounded-card border border-accent bg-accent-soft p-3 text-left text-sm">
          <span className="font-semibold text-accent">Тренер предлагает правку программы ({pending}).</span> <span className="text-fg-2">Посмотреть, что изменится →</span>
        </button>
      )}
      <button onClick={() => navigate('/coach')} className="block w-full text-left" aria-label="Заметки тренера">
        <Card>
          <div className="text-xs uppercase tracking-wide text-fg-3">Тренер</div>
          {note ? (
            <>
              <p className="mt-1 line-clamp-4 text-sm">{note.text}</p>
              <p className="mt-1 text-xs text-fg-3">{new Date(note.createdAt).toLocaleDateString('ru-RU')}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-fg-3">Заметок пока нет. Подключи тренера или отправь ему сводку →</p>
          )}
        </Card>
      </button>
    </>
  )
}
