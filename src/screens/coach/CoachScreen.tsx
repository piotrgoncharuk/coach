import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../lib/db'
import { archiveNote, coachNotes, coachSummary, createManualProposal, createToken, mcpUrl, revokeToken } from '../../lib/coach'
import { getUser } from '../../lib/auth'
import { alive } from '../../lib/workout'
import { BackHeader } from '../../ui/BackHeader'
import { Badge, Button, Card, Field } from '../../ui/components'
import { useNavigate } from 'react-router-dom'

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CoachScreen() {
  const navigate = useNavigate()
  const notes = useLiveQuery(async () => {
    await db.coachNotes.count()
    return coachNotes(30)
  }, [])
  const tokens = useLiveQuery(async () => alive(await db.apiTokens.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [])
  const url = mcpUrl()
  const cloud = !getUser().local && !!url

  const [newToken, setNewToken] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [pasteResult, setPasteResult] = useState<{ ok: boolean; errors: string[] } | null>(null)

  async function makeSummary(days: 7 | 28) {
    const text = await coachSummary(days)
    setSummary(text)
    setCopied((await copy(text)) ? `Сводка за ${days} дней скопирована — вставь её в чат с тренером.` : null)
  }

  async function submitPaste() {
    const r = await createManualProposal(paste)
    setPasteResult({ ok: !!r.row && !r.errors.length, errors: r.errors })
    if (r.row) setPaste('')
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <BackHeader title="Тренер" />
      <div className="px-safe space-y-3">
        <h1 className="text-xl font-semibold">Тренер</h1>

        <Card>
          <h2 className="mb-2 font-semibold">Заметки тренера</h2>
          {!notes?.length ? (
            <p className="text-sm text-fg-3">Тренер пишет сюда наблюдения и договорённости — это его долговременная память.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-xs text-fg-3">
                    <span>{new Date(n.createdAt).toLocaleDateString('ru-RU')} · {n.author === 'coach' ? 'тренер' : 'я'}</span>
                    <button className="min-h-9 px-2" onClick={() => void archiveNote(n.id)}>в архив</button>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm">{n.text}</p>
                  {n.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{n.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Подключить Grok по MCP</h2>
          {!cloud ? (
            <p className="text-sm text-fg-2">
              Тренер читает данные с сервера, а синхронизация пока не включена — данные только на этом телефоне.
              Когда будет подключён Supabase и выполнен вход, здесь появятся адрес сервера и личный токен.
              А пока работает запасной путь ниже.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-fg-2">Тренер видит только твои данные и может лишь предлагать правки и писать заметки. Удалить или изменить записи он не может.</p>
              <div>
                <span className="text-fg-3">Адрес MCP-сервера</span>
                <div className="mt-1 flex gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-card bg-raised px-3 py-2 text-xs">{url}</code>
                  <Button onClick={() => void copy(url!).then((ok) => setCopied(ok ? 'Адрес скопирован' : null))}>Копировать</Button>
                </div>
              </div>
              {newToken ? (
                <div className="rounded-card border border-warn/40 bg-warn/10 p-3">
                  <p className="font-semibold">Токен показывается один раз</p>
                  <code className="mt-1 block break-all text-xs">{newToken}</code>
                  <Button className="mt-2 w-full" onClick={() => void copy(newToken).then((ok) => setCopied(ok ? 'Токен скопирован' : null))}>Скопировать токен</Button>
                  <p className="mt-2 text-xs text-fg-2">В настройках подключения Grok: тип — MCP, адрес — выше, заголовок <code>Authorization: Bearer</code> и этот токен.</p>
                  <Button variant="ghost" className="mt-1 w-full" onClick={() => setNewToken(null)}>Готово, скрыть</Button>
                </div>
              ) : (
                <Button variant="primary" className="w-full" onClick={() => void createToken('Grok').then(setNewToken)}>Создать токен для Grok</Button>
              )}
              {tokens && tokens.length > 0 && (
                <ul className="divide-y divide-border">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex min-h-touch items-center gap-2">
                      <span className="flex-1"><code className="text-xs">{t.prefix}…</code> <span className="text-fg-3">· {t.lastUsedAt ? `был ${new Date(t.lastUsedAt).toLocaleDateString('ru-RU')}` : 'не использовался'}</span></span>
                      {t.revokedAt ? <Badge>отозван</Badge> : <Button variant="danger" onClick={() => void revokeToken(t.id)}>Отозвать</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Без MCP: через буфер обмена</h2>
          <p className="mb-2 text-sm text-fg-2">Скопируй сводку, вставь в чат с тренером. В конце сводки есть формат ответа — правку можно вставить обратно сюда.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void makeSummary(7)}>Сводка за 7 дней</Button>
            <Button onClick={() => void makeSummary(28)}>Сводка за 28 дней</Button>
          </div>
          {copied && <p role="status" className="mt-2 text-sm text-success">{copied}</p>}
          {summary && (
            <details className="mt-2">
              <summary className="min-h-touch cursor-pointer text-sm text-fg-3">Показать текст (если копирование не сработало)</summary>
              <textarea readOnly value={summary} rows={10} className="w-full rounded-card border border-border bg-raised p-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            </details>
          )}

          <h3 className="mb-1 mt-4 font-semibold">Вставить правку от тренера</h3>
          <textarea rows={5} value={paste} onChange={(e) => { setPaste(e.currentTarget.value); setPasteResult(null) }} aria-label="Правка от тренера"
            placeholder='{"title": "…", "changes": [ … ]}' className="w-full rounded-card border border-border bg-raised px-3 py-2 font-mono text-sm placeholder:text-fg-3" />
          <Button className="mt-2 w-full" disabled={!paste.trim()} onClick={() => void submitPaste()}>Проверить и добавить во входящие</Button>
          {pasteResult && (
            <div role="status" className={`mt-2 rounded-card p-3 text-sm ${pasteResult.ok ? 'bg-success/10' : 'bg-danger/10 text-danger'}`}>
              {pasteResult.ok ? (
                <>Правка ждёт решения во вкладке «Программа». <button className="font-semibold text-accent" onClick={() => navigate('/program')}>Открыть →</button></>
              ) : (
                <ul className="list-disc pl-5">{pasteResult.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
            </div>
          )}
        </Card>

        <Field label="Моя заметка для тренера" placeholder="Например: на следующей неделе командировка" onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const v = e.currentTarget.value.trim()
          if (!v) return
          e.currentTarget.value = ''
          void import('../../lib/repo').then(({ save }) => save('coachNotes', { author: 'me', text: v, tags: [], createdAt: new Date().toISOString() }))
        }} hint="Enter — сохранить. Тренер увидит её в get_coach_notes и в сводке." />
      </div>
    </div>
  )
}
