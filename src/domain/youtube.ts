/**
 * Видео техники. Ссылки на ролики не выдумываются: по умолчанию — поиск на
 * YouTube по названию, а закреплённую ссылку вставляет пользователь.
 */
const ID = /^[A-Za-z0-9_-]{11}$/

export function parseYoutubeId(input: string): string | null {
  const text = input.trim()
  if (ID.test(text)) return text
  let url: URL
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/)
      if (m) id = m[2]
    }
  }
  return id && ID.test(id) ? id : null
}

/** Встроенный плеер без cookies и без рекомендаций чужих каналов в конце. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export function searchUrl(name: string, lang: 'ru' | 'en' = 'ru'): string {
  const q = lang === 'ru' ? `${name} техника выполнения` : `${name} exercise technique`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}
