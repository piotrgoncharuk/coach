import { useState } from 'react'
import { embedUrl, parseYoutubeId, searchUrl, watchUrl } from '../../domain/youtube'
import { savePref } from '../../lib/exercises'
import { Button } from '../../ui/components'

/**
 * Видео техники. Ссылок не выдумываем: поиск на YouTube по названию и поле,
 * куда вставляется найденный ролик. Закреплённое видео играет прямо в карточке.
 */
export function VideoBlock({ exerciseId, nameRu, nameEn, url }: { exerciseId: string; nameRu: string; nameEn: string | null; url: string | null }) {
  const id = url ? parseYoutubeId(url) : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [play, setPlay] = useState(false)

  async function pin() {
    const parsed = parseYoutubeId(draft)
    if (!parsed) return setError('Это не похоже на ссылку YouTube. Скопируй адрес ролика целиком.')
    await savePref(exerciseId, { youtubeUrl: watchUrl(parsed) })
    setEditing(false)
    setDraft('')
    setError(null)
  }

  if (id && !editing) {
    return (
      <div className="space-y-2">
        <div className="relative aspect-video overflow-hidden rounded-card bg-black">
          {play ? (
            <iframe
              src={`${embedUrl(id)}&autoplay=1`}
              title={`Техника: ${nameRu}`}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button onClick={() => setPlay(true)} className="absolute inset-0 flex items-center justify-center" aria-label="Смотреть видео">
              <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
              <span className="relative flex size-16 items-center justify-center rounded-full bg-accent text-on-accent">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
              </span>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setEditing(true)}>Заменить видео</Button>
          <Button variant="ghost" className="flex-1" onClick={() => void savePref(exerciseId, { youtubeUrl: null })}>Открепить</Button>
        </div>
        <p className="text-xs text-fg-3">Без сети видео не играет — фото и подсказки остаются.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <a
        href={searchUrl(nameRu)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-touch items-center justify-center gap-2 rounded-card border border-border bg-raised px-4 text-base"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-danger" aria-hidden>
          <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1z" />
        </svg>
        Найти технику на YouTube
      </a>
      {nameEn && (
        <a href={searchUrl(nameEn, 'en')} target="_blank" rel="noreferrer" className="block text-center text-sm text-fg-3 underline-offset-2 hover:underline">
          искать по-английски
        </a>
      )}
      <div className="flex gap-2">
        <input
          inputMode="url"
          placeholder="Вставь ссылку на ролик"
          aria-label="Ссылка на видео YouTube"
          value={draft}
          onChange={(e) => { setDraft(e.currentTarget.value); setError(null) }}
          className="min-h-touch min-w-0 flex-1 rounded-card border border-border bg-raised px-3 placeholder:text-fg-3"
        />
        <Button variant="primary" disabled={!draft.trim()} onClick={() => void pin()}>Закрепить</Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {editing && <Button variant="ghost" className="w-full" onClick={() => setEditing(false)}>Отмена</Button>}
    </div>
  )
}
